import { Innertube } from 'youtubei.js';

// MULTI-STAGE TOKEN HUNTER (Broad + Targeted)
function findToken(obj) {
    if (!obj || typeof obj !== 'object') return null;
    
    // PRIORITY 1: Targeted research path (continuationCommand.payload.token)
    if (obj.continuationCommand?.payload?.token) {
        const token = obj.continuationCommand.payload.token;
        if (typeof token === 'string' && token.length > 20) return token;
    }

    // PRIORITY 2: Standard v17 properties
    if (obj.continuation) return obj.continuation;
    if (obj.token && typeof obj.token === 'string' && obj.token.length > 20) return obj.token;
    
    // PRIORITY 3: Deep exhaustive crawl (The "Video Side" Fix)
    if (Array.isArray(obj.on_response_received_commands)) {
        for (const cmd of obj.on_response_received_commands) {
            const token = findToken(cmd);
            if (token) return token;
        }
    }
    
    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            const token = findToken(obj[key]);
            if (token) return token;
        }
    }
    return null;
}

// Recursive helper to find ALL video objects
function findVideos(obj, results = []) {
    if (!obj || typeof obj !== 'object') return results;
    if (obj.type === 'Video') {
        results.push({
            id: obj.id,
            title: obj.title?.toString() || obj.title?.text || 'Unknown Title',
            thumbnail: obj.thumbnails?.[0]?.url || obj.thumbnail?.[0]?.url,
            channel: obj.author?.name || obj.author?.text || 'Unknown Channel',
            duration: obj.duration?.text || obj.duration?.label || '',
            type: 'video'
        });
        return results;
    }
    if (Array.isArray(obj)) {
        for (const item of obj) findVideos(item, results);
    } else {
        for (const key in obj) {
            if (Object.prototype.hasOwnProperty.call(obj, key)) findVideos(obj[key], results);
        }
    }
    return results;
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        const { query, continuation } = req.query;
        const youtube = await Innertube.create();

        if (query) {
            console.log(`[YT API] Initial search: ${query}`);
            const searchResults = await youtube.search(query, { type: 'video' });
            const videos = findVideos(searchResults);
            const token = findToken(searchResults);
            return res.status(200).json({ video_results: videos, continuation: token });

        } else if (continuation) {
            console.log(`[YT API] Continuation: ${continuation.substring(0, 20)}...`);
            const nextPage = await youtube.actions.execute('/search', { continuation: continuation, parse: true });
            const videos = findVideos(nextPage);
            const token = findToken(nextPage);
            return res.status(200).json({ video_results: videos, continuation: token });
        }

        return res.status(400).json({ error: 'Query or continuation required' });

    } catch (error) {
        console.error('[YT API] CRITICAL ERROR:', error);
        res.status(500).json({ error: 'Failed to search YouTube', message: error.message });
    }
}
