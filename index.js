const github = require('@actions/github');
const axios = require('axios');
const fs = require('fs');
const {join} = require('path');
const protobuf = require('protobufjs');

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

let protoRoot;
const getRoot = async () => {
    if(protoRoot){return protoRoot;}
    protoRoot = await new protobuf.Root().load("gtfs-realtime.proto", { keepCase: true })
    return protoRoot;
}

const decodeGtfsProtobuf = async (payload) => {
    const root = await getRoot();
    const FeedMessage = root.lookupType("transit_realtime.FeedMessage");
    const message = FeedMessage.decode(payload);
    return FeedMessage.toObject(message);
}

async function run() {
    const repoToken = process.env.GITHUB_TOKEN;
    const tfnswApiKey = process.env.TFNSW_API_KEY;
    const octokit = new github.GitHub(repoToken);

    const updateFile = async (path, input) => {
        const localFilePath = join('../data', path);
        if(fs.existsSync(localFilePath)){
            const existingInput = fs.readFileSync(localFilePath, 'utf8');

            if(input === existingInput){
                console.warn('no change found for '+path)
                return
            }
        }else{
            console.log(`Does not exist yet ${path}`);
        }
        
        fs.writeFileSync(join('../data', path), input);
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


    const filterAndStoreIcs = async (fn, className) => {
        try{
            const filtered = icsAlerts.filter(fn);
            await updateFile(
                `data/raw-ics/${className}.json`,
                JSON.stringify(filtered, null, 2)
            );
        }catch(e){
            console.error('Failed to process '+className)
        }
    }

    await Promise.all([
        filterAndStoreIcs(_ => true, 'all'),
        filterAndStoreIcs(a => a.properties.announcementType === 'liftsEscalators', 'liftsEscalators'),
        filterAndStoreIcs(a => a.properties.announcementType === 'trackwork', 'trackwork'),
        filterAndStoreIcs(a => a.properties.announcementType === 'serviceChange', 'serviceChange'),
        filterAndStoreIcs(a => a.priority === 'veryLow', 'veryLowPriority'),
        filterAndStoreIcs(a => a.priority === 'low', 'lowPriority'),
        filterAndStoreIcs(a => a.priority === 'normal', 'normalPriority'),
    ]);


    const {data: buf} = await axios.get('https://api.transport.nsw.gov.au/v1/gtfs/alerts/sydneytrains', {
        headers: {
            Authorization: `apikey ${tfnswApiKey}`
        },
        responseType: 'arraybuffer'
    });

    const alertFeed = await decodeGtfsProtobuf(buf);
    delete alertFeed.header.timestamp;
    await updateFile(
        `data/sydtrains/alerts.json`,
        JSON.stringify(alertFeed, null, 2)
    );
    
    const {data: allBuf} = await axios.get('https://api.transport.nsw.gov.au/v1/gtfs/alerts/all', {
        headers: {
            Authorization: `apikey ${tfnswApiKey}`
        },
        responseType: 'arraybuffer'
    });

    const allAlertFeed = await decodeGtfsProtobuf(allBuf);
    delete allAlertFeed.header.timestamp;
    await updateFile(
        `data/all/alerts.json`,
        JSON.stringify(allAlertFeed, null, 2)
    );

    // .filter(a => a.properties.priority != 'veryLow')
    // .filter(a => a.properties.announcementType != 'liftsEscalators')
}
 
run();
