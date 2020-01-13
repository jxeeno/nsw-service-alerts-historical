const github = require('@actions/github');
const axios = require('axios');

const toBase64 = (str) => {
    return Buffer.from(str || '').toString('base64');
}

const branch = 'data';

const COMMON_CREATE_OR_UPDATE_FILE = {
    owner: 'jxeeno',
    repo: 'nsw-service-alerts-historical',
    author: {
        name: 'jxeeno',
        email: 'ken+github@anytrip.com.au'
    }
}

async function run() {
    const repoToken = process.env.GITHUB_TOKEN;
    const tfnswApiKey = process.env.TFNSW_API_KEY;
    const octokit = new github.GitHub(repoToken);

    const updateFile = async (path, input) => {
        let sha;
        let existingInput;
        try{
            const contents = await octokit.repos.getContents({
                ...COMMON_CREATE_OR_UPDATE_FILE,
                author: undefined,
                path,
                ref: branch
            });

            if(contents && contents.data && contents.data.sha){
                sha = contents.data.sha;
                existingInput = Buffer.from(contents.data.content, "base64").toString();
            }
        }catch(e){
            console.warn('error thrown when fetching contents of '+path);
        }
        const content = toBase64(input);

        if(input === existingInput){
            console.warn('no change found for '+path)
            return
        }

        await octokit.repos.createOrUpdateFile({
            ...COMMON_CREATE_OR_UPDATE_FILE,
            path,
            message: `auto(): update ${path}`,
            content,
            sha,
            branch
        });

        console.log(`Saved ${path}`);
    }

    const {data} = await axios.get('https://api.transport.nsw.gov.au/v1/tp/add_info', {
        headers: {
            Authorization: `apikey ${tfnswApiKey}`
        },
        params: {
            AIXMLReduction: 'removeSourceSystem',
            TfNSWAI: 'true',
            outputFormat: 'rapidJSON',
            version: '10.2.2.48'
        }
    });

    const icsAlerts = data.infos.current
                        .sort((a, b) => parseInt(a.id) - parseInt(b.id));

    const liftsEscalators = icsAlerts.filter(a => a.properties.announcementType === 'liftsEscalators');
    const trackwork = icsAlerts.filter(a => a.properties.announcementType === 'trackwork');
    const serviceChange = icsAlerts.filter(a => a.properties.announcementType === 'serviceChange');
    const veryLowPriority = icsAlerts.filter(a => a.priority === 'veryLow');
    const lowPriority = icsAlerts.filter(a => a.priority === 'low');
    const normalPriority = icsAlerts.filter(a => a.priority === 'normal');

    await updateFile(
        `data/raw-ics/all.json`,
        JSON.stringify(icsAlerts, null, 2)
    );

    await updateFile(
        `data/raw-ics/liftsEscalators.json`,
        JSON.stringify(liftsEscalators, null, 2)
    );

    await updateFile(
        `data/raw-ics/trackwork.json`,
        JSON.stringify(trackwork, null, 2)
    );

    await updateFile(
        `data/raw-ics/serviceChange.json`,
        JSON.stringify(serviceChange, null, 2)
    );

    await updateFile(
        `data/raw-ics/veryLowPriority.json`,
        JSON.stringify(veryLowPriority, null, 2)
    );

    await updateFile(
        `data/raw-ics/lowPriority.json`,
        JSON.stringify(lowPriority, null, 2)
    );

    await updateFile(
        `data/raw-ics/normalPriority.json`,
        JSON.stringify(normalPriority, null, 2)
    );

    // .filter(a => a.properties.priority != 'veryLow')
    // .filter(a => a.properties.announcementType != 'liftsEscalators')
}
 
run();