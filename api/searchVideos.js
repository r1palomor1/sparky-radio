import { Innertube } from 'youtubei.js';

// Recursive helper to find continuation token in nested Innertube response
function findToken(obj) {
    if (!obj || typeof obj !== 'object') return null;
    if (obj.continuation) return obj.continuation;
    if (obj.token && typeof obj.token === 'string' && obj.token.length > 20) return obj.token;
    
    // Check specific arrays where tokens are known to hide in v17
    if (Array.isArray(obj.on_response_received_commands)) {
        for (const cmd of obj.on_response_received_commands) {
            const token = findToken(cmd);
            if (token) return token;
        }
    }
    
    // Recursive search for everything else
    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            const token = findToken(obj[key]);
            if (token) return token;
        }
    }
    return null;
}

// Helper: map Innertube video search results to clean Sparky YT format
function formatVideoResults(data) {
    const results = data.results?.map(item => {
        if (item.type === 'Video') {
            return {
                id: item.id,
                title: item.title?.toString() || item.title?.text || 'Unknown Title',
                thumbnail: item.thumbnails?.[0]?.url || item.thumbnail?.[0]?.url,
                channel: item.author?.name || item.author?.text || 'Unknown Channel',
                duration: item.duration?.text || item.duration?.label || '',
                type: 'video'
            };
        }
        return null;
    }).filter(Boolean);

    const token = findToken(data);
    if (token) console.log(`[YT-BACKEND] Found continuation token: ${token.substring(0, 15)}...`);

    return {
        video_results: results || [],
        continuation: token || null
    };
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    console.log(`[YT API] Request: ${JSON.stringify(req.query)}`);

    try {
        const { query, continuation } = req.query;
        const youtube = await Innertube.create();

        if (query) {
            console.log(`[YT API] Searching for: ${query}`);
            const searchResults = await youtube.search(query, { type: 'video' });
            return res.status(200).json(formatVideoResults(searchResults));

        } else if (continuation) {
            console.log(`[YT API] Fetching continuation: ${continuation}`);
            // In v17, try using getContinuation directly if it exists, otherwise actions.execute
            let nextPage;
            if (typeof youtube.getContinuation === 'function') {
                nextPage = await youtube.getContinuation({ token: continuation });
            } else {
                nextPage = await youtube.actions.execute('/search', { continuation: continuation, parse: true });
            }
            return res.status(200).json(formatVideoResults(nextPage));

        } else {
            return res.status(400).json({ error: 'A query or continuation token is required.' });
        }

    } catch (error) {
        console.error('[YT API] CRITICAL ERROR:', error);
        res.status(500).json({ 
            error: 'Failed to search YouTube', 
            message: error.message
        });
    }
}
