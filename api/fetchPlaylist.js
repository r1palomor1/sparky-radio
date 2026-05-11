import { Innertube } from 'youtubei.js';

// MULTI-STAGE TOKEN HUNTER (Broad + Targeted)
function findToken(obj) {
    if (!obj || typeof obj !== 'object') return null;
    
    if (obj.continuationCommand?.payload?.token) {
        const token = obj.continuationCommand.payload.token;
        if (typeof token === 'string' && token.length > 20) return token;
    }

    if (obj.continuation) return obj.continuation;
    if (obj.token && typeof obj.token === 'string' && obj.token.length > 20) return obj.token;
    
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

// PORTED FROM r1-launch-pad (Exact property mapping)
function formatPlaylistResults(data) {
    const results = data.results?.map(item => {
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

    const token = findToken(data);

    return {
        playlist_results: results || [],
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

        if (id) {
            console.log(`[YT API] Playlist ID: ${id}`);
            const playlist = await youtube.getPlaylist(id);
            if (!playlist.videos) return res.status(404).json({ error: 'Empty playlist' });
            
            const videos = playlist.videos.map(v => ({
                id: v.id,
                title: v.title?.text || v.title?.toString(),
                thumb: v.thumbnails?.[v.thumbnails.length - 1]?.url || v.thumbnail?.[0]?.url,
            }));

            return res.status(200).json({
                title: playlist.info?.title || 'Playlist',
                video_results: videos
            });

        } else if (query) {
            console.log(`[YT API] Playlist search: ${query}`);
            const searchResults = await youtube.search(query, { type: 'playlist' });
            return res.status(200).json(formatPlaylistResults(searchResults));

        } else if (continuation) {
            console.log(`[YT API] Playlist continuation: ${continuation.substring(0, 20)}...`);
            
            // FIX: Switching to actions.execute('/browse') which is proven stable for continuation
            const nextPage = await youtube.actions.execute('/browse', { continuation: continuation, parse: true });
            
            return res.status(200).json(formatPlaylistResults(nextPage));
        }

        return res.status(400).json({ error: 'Query or continuation required' });

    } catch (error) {
        console.error('[YT API] Playlist Error:', error.message);
        res.status(500).json({ error: 'Failed', details: error.message });
    }
}
