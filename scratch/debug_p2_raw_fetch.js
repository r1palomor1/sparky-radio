import fs from 'fs';
import { Innertube } from 'youtubei.js';

async function test() {
    const youtube = await Innertube.create();
    const query = "bad bunny";
    const p1 = await youtube.actions.execute('/search', { query, params: 'EgIQAw%3D%3D', parse: false });
    
    function findToken(obj) {
        if (!obj || typeof obj !== 'object') return null;
        if (obj.continuationCommand?.payload?.token) return obj.continuationCommand.payload.token;
        if (obj.continuation) return obj.continuation;
        for (const key in obj) {
            const token = findToken(obj[key]);
            if (token) return token;
        }
        return null;
    }
    
    const token = findToken(p1.data || p1);
    if (token) {
        const p2 = await youtube.actions.execute('/search', { continuation: token, parse: false });
        fs.writeFileSync('scratch/debug_p2_raw.json', JSON.stringify(p2.data || p2, null, 2));
        console.log("Saved raw Page 2 to scratch/debug_p2_raw.json");
    }
}

test();
