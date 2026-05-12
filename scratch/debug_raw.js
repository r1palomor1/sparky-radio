import { Innertube } from 'youtubei.js';
import fs from 'fs';

async function test() {
    const youtube = await Innertube.create();
    const query = "bad bunny";
    const response = await youtube.actions.execute('/search', { query, params: 'EgIQAw%3D%3D', parse: false });
    fs.writeFileSync('scratch/debug_p1_raw.json', JSON.stringify(response.data || response, null, 2));
    console.log("Saved to scratch/debug_p1_raw.json");
}

test();
