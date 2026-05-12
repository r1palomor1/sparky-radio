import { Innertube } from 'youtubei.js';

// MULTI-STAGE TOKEN HUNTER (Recursive)
function findToken(obj) {
    if (!obj || typeof obj !== 'object') return null;
    
    // PRIORITY 1: Targeted research path
    if (obj.continuationCommand?.payload?.token) {
        const token = obj.continuationCommand.payload.token;
        if (typeof token === 'string' && token.length > 20) return token;
    }

    // PRIORITY 2: Standard properties
    if (obj.continuation) return obj.continuation;
    if (obj.token && typeof obj.token === 'string' && obj.token.length > 20) return obj.token;
    
    // PRIORITY 3: Deep exhaustive crawl
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

// Recursive helper to find ALL playlist objects
function findPlaylists(obj, results = []) {
    if (!obj || typeof obj !== 'object') return results;

    // Check for various playlist renderer types
    const isPlaylist = (obj.type === 'Playlist') || 
                      (obj.playlistRenderer) || 
                      (obj.lockupViewModel?.contentType === 'LOCKUP_CONTENT_TYPE_PLAYLIST') ||
                      (typeof obj.playlistId === 'string' && (obj.title || obj.titleText));

    if (isPlaylist) {
        const renderer = obj.playlistRenderer || (obj.type === 'Playlist' ? obj : null);
        const luv = obj.lockupViewModel;

        if (renderer) {
            results.push({
                playlist_id: renderer.playlistId || renderer.id,
                title: renderer.title?.toString() || renderer.title?.text || renderer.title?.simpleText || 'Unknown Playlist',
                thumbnail: renderer.thumbnails?.[0]?.url || renderer.thumbnails?.[0]?.thumbnails?.[0]?.url || renderer.thumbnail?.[0]?.url,
                video_count: renderer.video_count?.text || renderer.videoCountText?.text || renderer.videoCount || 'N/A',
                type: 'playlist'
            });
        } else if (luv) {
            results.push({
                playlist_id: luv.contentId,
                title: luv.metadata?.lockupMetadataViewModel?.title?.content || 'Unknown Playlist',
                thumbnail: luv.contentImage?.collectionThumbnailViewModel?.primaryThumbnail?.thumbnailViewModel?.image?.sources?.[0]?.url || 'N/A',
                video_count: 'N/A',
                type: 'playlist'
            });
        }
        return results;
    }

    if (Array.isArray(obj)) {
        for (const item of obj) findPlaylists(item, results);
    } else {
        for (const key in obj) {
            if (Object.prototype.hasOwnProperty.call(obj, key)) findPlaylists(obj[key], results);
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
        const { id, query, continuation } = req.query;
        const youtube = await Innertube.create();

        if (id) {
            const playlist = await youtube.getPlaylist(id);
            const videos = playlist.videos.map(v => ({
                id: v.id,
                title: v.title?.text || v.title?.toString(),
                thumb: v.thumbnails?.[v.thumbnails.length - 1]?.url || v.thumbnail?.[0]?.url,
                channel: v.author?.name || v.author?.text || playlist.info?.title || 'Unknown',
                duration: v.duration?.text || '',
                views: v.view_count?.text || '',
                published: v.published?.text || '',
                type: 'video'
            }));
            return res.status(200).json({ title: playlist.info?.title || 'Playlist', video_results: videos });

        } else if (query) {
            const searchResults = await youtube.search(query, { type: 'playlist' });
            const playlists = findPlaylists(searchResults);
            const token = findToken(searchResults);
            return res.status(200).json({ playlist_results: playlists, continuation: token });

        } else if (continuation) {
            // Fetch next page via RAW execute (bypass brittle parser)
            const response = await youtube.actions.execute('/search', {
                continuation: continuation,
                client: youtube.session.context.client.clientName,
                parse: false
            });
            
            const rawData = response.data || response;
            const playlists = findPlaylists(rawData);
            const token = findToken(rawData);
            
            return res.status(200).json({ playlist_results: playlists, continuation: token });
        }

        return res.status(400).json({ error: 'Query, ID or continuation required' });

    } catch (error) {
        console.error('[YT API] ERROR:', error);
        res.status(500).json({ error: 'Failed to process YouTube request', message: error.message });
    }
}
