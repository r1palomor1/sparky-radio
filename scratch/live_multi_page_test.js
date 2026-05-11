import { Innertube } from 'youtubei.js';

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

function extractIds(results) {
    return results.map(item => item.content_id || item.id).filter(Boolean);
}

async function testMultiPage() {
    console.log("--- STARTING LIVE MULTI-PAGE FETCH TEST ---");
    try {
        const youtube = await Innertube.create();

        // 1. FETCH PAGE 1
        console.log("FETCHING PAGE 1 (Query: 'bad bunny')...");
        const page1 = await youtube.search("bad bunny", { type: 'playlist' });
        const token1 = findTargetedToken(page1);
        const ids1 = extractIds(page1.results || []);
        
        console.log(`Page 1: Found ${ids1.length} playlists.`);
        console.log(`Page 1 Token found: ${!!token1}`);

        if (!token1) {
            console.log("FAILURE: No token found on Page 1. Cannot paginate.");
            return;
        }

        // 2. FETCH PAGE 2
        console.log("-----------------------------------------");
        console.log("FETCHING PAGE 2 (Using Token)...");
        // Using the same /search action engine we used in the staging file
        const page2 = await youtube.actions.execute('/search', { continuation: token1, parse: true });
        const token2 = findTargetedToken(page2);
        const ids2 = extractIds(page2.results || []);

        console.log(`Page 2: Found ${ids2.length} playlists.`);
        console.log(`Page 2 Token found: ${!!token2}`);

        // 3. FINAL PROOF
        console.log("-----------------------------------------");
        if (ids1[0] !== ids2[0]) {
            console.log("SUCCESS: Page 1 and Page 2 are DIFFERENT.");
            console.log(`First ID Page 1: ${ids1[0]}`);
            console.log(`First ID Page 2: ${ids2[0]}`);
            console.log("PAGINATION IS FULLY FUNCTIONAL.");
        } else {
            console.log("FAILURE: Page 2 returned the same results as Page 1.");
        }

    } catch (e) {
        console.error("CRITICAL TEST FAILURE:", e.message);
    }
}

testMultiPage();
