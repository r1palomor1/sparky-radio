import handler from '../api/fetchPlaylist.js';

async function runLiveTest() {
    console.log("--- STARTING LIVE API HANDLER TEST ---");

    // 1. Mock Page 1 Request
    let page1Results = null;
    const req1 = { method: 'GET', query: { query: 'bad bunny' } };
    const res1 = {
        setHeader: () => {},
        status: (code) => ({
            json: (data) => { page1Results = data; },
            end: () => {}
        })
    };

    console.log("[TEST] Executing Live Handler for Page 1...");
    await handler(req1, res1);

    if (!page1Results || !page1Results.playlist_results) {
        console.error("[FAIL] Page 1 returned no results or failed.");
        process.exit(1);
    }
    console.log(`[PASS] Page 1 returned ${page1Results.playlist_results.length} playlists.`);
    const token = page1Results.continuation;
    
    if (!token) {
        console.error("[FAIL] No continuation token found in Page 1 response.");
        process.exit(1);
    }
    console.log("[PASS] Found continuation token.");

    // 2. Mock Page 2 Request (Continuation)
    let page2Results = null;
    const req2 = { method: 'GET', query: { continuation: token } };
    const res2 = {
        setHeader: () => {},
        status: (code) => ({
            json: (data) => { page2Results = data; },
            end: () => {}
        })
    };

    console.log("[TEST] Executing Live Handler for Page 2 (Continuation)...");
    await handler(req2, res2);

    if (!page2Results || !page2Results.playlist_results || page2Results.playlist_results.length === 0) {
        console.error("[FAIL] Page 2 returned no results.");
        process.exit(1);
    }

    console.log(`[PASS] Page 2 returned ${page2Results.playlist_results.length} playlists.`);
    
    // Check for N/A in Page 2
    const naItems = page2Results.playlist_results.filter(p => p.video_count === 'N/A');
    if (naItems.length > 0) {
        console.warn(`[WARN] Found ${naItems.length} items with 'N/A' video count on Page 2.`);
        console.log("First few results:", JSON.stringify(page2Results.playlist_results.slice(0, 3), null, 2));
    } else {
        console.log("[SUCCESS] All Page 2 items have valid video counts.");
        console.log("Sample Result:", JSON.stringify(page2Results.playlist_results[0], null, 2));
    }

    console.log("--- LIVE API HANDLER TEST COMPLETE ---");
}

runLiveTest().catch(console.error);
