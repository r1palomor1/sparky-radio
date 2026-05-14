import { Innertube } from 'youtubei.js';
import fs from 'fs';

async function inspectInfo() {
    const youtube = await Innertube.create();
    const info = await youtube.getInfo('X7Hwiw8yLko');
    fs.writeFileSync('scratch/info_dump.json', JSON.stringify(info, null, 2));
    console.log('Dumped info to scratch/info_dump.json');
}

inspectInfo();
