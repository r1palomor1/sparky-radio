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

// Helper: map Innertube playlist results to clean Sparky YT format
function formatPlaylistResults(data) {
    const results = data.videos?.map(v => ({
        id: v.id,
        title: v.title?.toString() || v.title?.text || 'Unknown Title',
        thumbnail: v.thumbnails?.[0]?.url || v.thumbnail?.[0]?.url,
        channel: v.author?.name || v.author?.text || 'Unknown Channel',
        duration: v.duration?.text || v.duration?.label || '',
        type: 'video'
    })) || [];

    const token = findToken(data);
    if (token) console.log(`[YT-BACKEND] Found playlist continuation token: ${token.substring(0, 15)}...`);

    return {
        video_results: results,
        continuation: token || null
    };
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        const { id, query, continuation } = req.query;
        const youtube = await Innertube.create();

        if (continuation) {
            console.log(`[YT API] Fetching playlist continuation: ${continuation}`);
            const nextPage = await youtube.actions.execute('/browse', { continuation: continuation, parse: true });
            return res.status(200).json(formatPlaylistResults(nextPage));
        }

        let playlist;
        if (id) {
            console.log(`[YT API] Fetching playlist by ID: ${id}`);
            playlist = await youtube.getPlaylist(id);
        } else if (query) {
            console.log(`[YT API] Searching for playlist: ${query}`);
            const search = await youtube.search(query, { type: 'playlist' });
            const firstPlaylist = search.playlists?.[0];
            if (!firstPlaylist) return res.status(404).json({ error: 'No playlist found' });
            playlist = await youtube.getPlaylist(firstPlaylist.id);
        } else {
            return res.status(400).json({ error: 'Playlist ID or query required' });
        }

        return res.status(200).json(formatPlaylistResults(playlist));

    } catch (error) {
        console.error('[YT API] Playlist Error:', error);
        res.status(500).json({ error: 'Failed to fetch playlist', message: error.message });
    }
}
