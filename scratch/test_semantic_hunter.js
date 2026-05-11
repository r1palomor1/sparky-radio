import fs from 'fs';

function findTargetedToken(obj) {
    if (!obj || typeof obj !== 'object') return null;
    
    // SEMANTIC MATCH: "name": "continuationCommand"
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

async function runTest() {
    console.log("--- STARTING INTERNAL SEMANTIC TEST ---");
    try {
        const rawData = JSON.parse(fs.readFileSync('scratch/raw_playlist_response.json', 'utf8'));
        console.log("File loaded successfully.");

        const token = findTargetedToken(rawData);
        
        if (token) {
            console.log("SUCCESS: Semantic Hunter found the token!");
            console.log(`Token sample: ${token.substring(0, 30)}...`);
        } else {
            console.log("FAILURE: Semantic Hunter could not find the token in the JSON.");
        }
    } catch (e) {
        console.error("Test error:", e.message);
    }
}

runTest();
