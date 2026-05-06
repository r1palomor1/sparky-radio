import { Innertube } from 'youtubei.js';

// Helper: map Innertube video search results to clean Sparky YT format
function formatVideoResults(data) {
    const results = data.results?.map(item => {
        // Only process actual video items (not ads, playlists, etc.)
        if (item.type !== 'Video') return null;
        try {
            const id = item.id;
            const title = item.title?.text;
            const thumbnail = item.thumbnails?.[item.thumbnails.length - 1]?.url;
            const channel = item.author?.name || 'Unknown';
            const duration = item.duration?.text || '';
            if (id && title && thumbnail) {
                return { id, title, thumbnail, channel, duration };
            }
        } catch (e) {
            console.error('Failed to parse video item:', e.message);
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

    try {
        const { query, continuation } = req.query;
        const youtube = await Innertube.create();

        // LOGIC 1: Search videos by query (replaces PluginMessageHandler from r1-launch-pad)
        if (query) {
            const searchResults = await youtube.search(query, { type: 'video' });
            return res.status(200).json(formatVideoResults(searchResults));

        // LOGIC 2: Paginate results via continuation token
        } else if (continuation) {
            const nextPage = await youtube.getContinuation(continuation);
            return res.status(200).json(formatVideoResults(nextPage));

        } else {
            return res.status(400).json({ error: 'A query or continuation token is required.' });
        }

    } catch (error) {
        console.error('Sparky YT API Error (searchVideos):', error.message);
        res.status(500).json({ error: 'Failed to search YouTube', details: error.message });
    }
}
