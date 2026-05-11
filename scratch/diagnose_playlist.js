import { Innertube } from 'youtubei.js';
import fs from 'fs';

async function diagnose() {
    console.log("--- STARTING LOCAL PLAYLIST DIAGNOSIS ---");
    try {
        const youtube = await Innertube.create();
        const query = "bad bunny";
        
        console.log(`Searching for playlists: ${query}`);
        const searchResults = await youtube.search(query, { type: 'playlist' });
        
        // SAVE RAW RESPONSE FOR AUDIT
        fs.writeFileSync('scratch/raw_playlist_response.json', JSON.stringify(searchResults, null, 2));
        console.log("Raw response saved to scratch/raw_playlist_response.json");

        // CHECK THE RESULTS ARRAY
        console.log("Results property keys:", Object.keys(searchResults));
        if (searchResults.results) {
            console.log(`Found ${searchResults.results.length} items in .results`);
            console.log("First item sample:", JSON.stringify(searchResults.results[0], null, 2));
        } else {
            console.log("CRITICAL: .results is UNDEFINED at the root!");
            // Search for where the data actually is
            if (searchResults.playlists) {
                console.log(`Data found in .playlists instead! Length: ${searchResults.playlists.length}`);
            }
        }

        // CHECK FOR CONTINUATION
        console.log("Continuation property:", searchResults.continuation);

    } catch (error) {
        console.error("Diagnosis failed:", error);
    }
}

diagnose();
