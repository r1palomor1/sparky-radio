import { Innertube } from 'youtubei.js';
import fs from 'fs';

async function test() {
    const youtube = await Innertube.create();
    const query = "bad bunny";
    console.log(`Searching playlists for: ${query}`);
    
    const response = await youtube.actions.execute('/search', {
        query: query,
        params: 'EgIQAw%3D%3D', // Playlist filter
        parse: false
    });
    
    fs.writeFileSync('scratch/playlist_p1_raw.json', JSON.stringify(response.data || response, null, 2));
    console.log("Saved to scratch/playlist_p1_raw.json");
}

test();
