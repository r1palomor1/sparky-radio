import { Innertube } from 'youtubei.js';

function extractIds(results) {
    return results.map(item => item.content_id || item.id).filter(Boolean);
}

async function testRepoLogic() {
    console.log("--- STARTING PURE REPO LOGIC TEST (v16.0.1) ---");
    try {
        const youtube = await Innertube.create();

        // 1. REPO INITIAL SEARCH
        console.log("Search: 'bad bunny'...");
        const searchResults = await youtube.search("bad bunny", { type: 'playlist' });
        const ids1 = extractIds(searchResults.results || []);
        const token = searchResults.continuation;
        
        console.log(`Page 1: Found ${ids1.length} playlists.`);
        console.log(`Repo Root Token: ${token ? 'FOUND' : 'NOT FOUND'}`);

        if (!token) return console.log("No token.");

        // 2. REPO CONTINUATION METHOD
        console.log("-----------------------------------------");
        console.log("Calling youtube.getContinuation(token)...");
        const nextPage = await youtube.getContinuation(token);
        const ids2 = extractIds(nextPage.results || []);

        console.log(`Page 2: Found ${ids2.length} playlists.`);

        if (ids2.length > 0) {
            console.log("SUCCESS: The Repo Logic is working perfectly on Page 2.");
        } else {
            console.log("FAILURE: Page 2 is still empty.");
        }

    } catch (e) {
        console.error("REPO LOGIC ERROR:", e.message);
    }
}

testRepoLogic();
