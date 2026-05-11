import { Innertube } from 'youtubei.js';

// TARGETED TOKEN HUNTER (Based on raw_search_results research)
function findTargetedToken(obj) {
    if (!obj || typeof obj !== 'object') return null;
    
    // Exact match based on the research: continuationCommand.payload.token
    if (obj.continuationCommand?.payload?.token) {
        const token = obj.continuationCommand.payload.token;
        if (typeof token === 'string' && token.length > 20) {
            console.log(`[YT-TOKEN-FOUND] Targeted hunter found token: ${token.substring(0, 20)}...`);
            return token;
        }
    }
    
    // Fallback: search deeper if nested
    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            const result = findTargetedToken(obj[key]);
            if (result) return result;
        }
    }
    return null;
}

// Deep crawler for videos
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
            console.log(`[YT API] Video search: ${query}`);
            const searchResults = await youtube.search(query, { type: 'video' });
            const videos = findVideos(searchResults);
            const token = findTargetedToken(searchResults);
            return res.status(200).json({ video_results: videos, continuation: token });

        } else if (continuation) {
            console.log(`[YT API] Video continuation: ${continuation.substring(0, 20)}...`);
            const nextPage = await youtube.actions.execute('/search', { continuation: continuation, parse: true });
            const videos = findVideos(nextPage);
            const token = findTargetedToken(nextPage);
            return res.status(200).json({ video_results: videos, continuation: token });
        }

        return res.status(400).json({ error: 'Query or continuation required' });

    } catch (error) {
        console.error('[YT API] Error:', error);
        res.status(500).json({ error: 'Failed to search YouTube', message: error.message });
    }
}
