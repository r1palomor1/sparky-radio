import { Innertube } from 'youtubei.js';

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

    return {
        video_results: results || [],
        continuation: data.continuation || null
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
        console.log('[YT API] Initializing Innertube...');
        const youtube = await Innertube.create();
        console.log('[YT API] Innertube initialized.');

        if (query) {
            console.log(`[YT API] Searching for: ${query}`);
            const searchResults = await youtube.search(query, { type: 'video' });
            console.log('[YT API] Search successful.');
            return res.status(200).json(formatVideoResults(searchResults));

        } else if (continuation) {
            console.log(`[YT API] Fetching continuation: ${continuation}`);
            // In v17, try using getContinuation directly if it exists, otherwise actions.execute
            let nextPage;
            if (typeof youtube.getContinuation === 'function') {
                nextPage = await youtube.getContinuation(continuation);
            } else {
                // Fallback for different v17 subversions
                nextPage = await youtube.actions.execute('/search', { continuation: continuation, parse: true });
            }
            console.log('[YT API] Continuation fetch successful.');
            return res.status(200).json(formatVideoResults(nextPage));

        } else {
            return res.status(400).json({ error: 'A query or continuation token is required.' });
        }

    } catch (error) {
        console.error('[YT API] CRITICAL ERROR:', error);
        res.status(500).json({ 
            error: 'Failed to search YouTube', 
            message: error.message,
            stack: error.stack 
        });
    }
}
