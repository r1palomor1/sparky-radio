import { Innertube } from 'youtubei.js';

// TARGETED TOKEN HUNTER (Based on User Research Guide)
function findTargetedToken(obj) {
    if (!obj || typeof obj !== 'object') return null;
    
    // Path: continuationCommand.payload.token
    if (obj.continuationCommand?.payload?.token) {
        const token = obj.continuationCommand.payload.token;
        if (typeof token === 'string' && token.length > 20) {
            console.log(`[YT-TOKEN-FOUND] Targeted hunter found token: ${token.substring(0, 20)}...`);
            return token;
        }
    }
    
    // Recursive search if not found at the current level
    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            const token = findTargetedToken(obj[key]);
            if (token) return token;
        }
    }
    return null;
}

// PORTED FROM r1-launch-pad (Exact property mapping)
function formatPlaylistResults(data) {
    const results = data.results?.map(item => {
        // PARITY: Check for both possible library tags
        if (item.content_type !== 'PLAYLIST' && item.type !== 'Playlist') return null;

        try {
            const playlist_id = item.content_id || item.id;
            const title = item.metadata?.title?.text || item.title?.text || item.title?.toString();
            const thumbnail = item.content_image?.primary_thumbnail?.image?.[0]?.url || item.thumbnails?.[0]?.url || item.thumbnail?.[0]?.url;
            const video_count = item.content_image?.overlays?.[0]?.badges?.[0]?.text || item.video_count?.text || item.video_count?.toString() || 'N/A';

            if (playlist_id && title && thumbnail) {
                return { playlist_id, title, thumbnail, video_count };
            }
        } catch (e) { return null; }
        return null;
    }).filter(Boolean);

    // HUNT FOR TOKEN (Line 19 Logic)
    const token = findTargetedToken(data);

    return {
        playlist_results: results || [],
        continuation: token
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

        if (id) {
            const playlist = await youtube.getPlaylist(id);
            if (!playlist.videos) return res.status(404).json({ error: 'Empty' });
            const videos = playlist.videos.map(v => ({
                id: v.id,
                title: v.title?.text || v.title?.toString(),
                thumb: v.thumbnails?.[v.thumbnails.length - 1]?.url || v.thumbnail?.[0]?.url,
            }));
            return res.status(200).json({ title: playlist.info?.title || 'Playlist', video_results: videos });

        } else if (query) {
            console.log(`[YT API] Playlist search: ${query}`);
            const searchResults = await youtube.search(query, { type: 'playlist' });
            return res.status(200).json(formatPlaylistResults(searchResults));

        } else if (continuation) {
            console.log(`[YT API] Continuation: ${continuation.substring(0, 20)}...`);
            // Proven /search action engine
            const nextPage = await youtube.actions.execute('/search', { continuation: continuation, parse: true });
            return res.status(200).json(formatPlaylistResults(nextPage));
        }
        return res.status(400).json({ error: 'Missing params' });
    } catch (error) {
        console.error('[YT API] Error:', error.message);
        res.status(500).json({ error: 'Failed', details: error.message });
    }
}
