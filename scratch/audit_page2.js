import { Innertube } from 'youtubei.js';
import fs from 'fs';

// THE REAL SEMANTIC HUNTER
function findTargetedToken(obj) {
    if (!obj || typeof obj !== 'object') return null;
    if (obj.name === 'continuationCommand' && obj.payload?.token) {
        return obj.payload.token;
    }
    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            const token = findTargetedToken(obj[key]);
            if (token) return token;
        }
    }
    return null;
}

async function auditPage2() {
    console.log("--- AUDITING PAGE 2 RAW STRUCTURE ---");
    try {
        const youtube = await Innertube.create();
        const page1 = await youtube.search("bad bunny", { type: 'playlist' });
        const token1 = findTargetedToken(page1);

        if (!token1) return console.log("No token 1");

        console.log("Fetching Page 2...");
        const page2 = await youtube.actions.execute('/search', { continuation: token1, parse: true });
        
        fs.writeFileSync('scratch/raw_page2_response.json', JSON.stringify(page2, null, 2));
        console.log("Raw Page 2 saved to scratch/raw_page2_response.json");

        // CHECK WHERE RESULTS ARE
        console.log("Root keys of Page 2:", Object.keys(page2));
        if (page2.results) console.log(`Page 2 .results length: ${page2.results.length}`);
        
        // Deep scan for ANY playlist in page 2
        const findPlaylists = (obj, list = []) => {
            if (!obj || typeof obj !== 'object') return list;
            if (obj.type === 'Playlist' || obj.content_type === 'PLAYLIST') list.push(obj);
            for (const k in obj) findPlaylists(obj[k], list);
            return list;
        };
        const allPlaylists = findPlaylists(page2);
        console.log(`Deep scan found ${allPlaylists.length} playlists on Page 2.`);

    } catch (e) { console.error(e.message); }
}

auditPage2();
