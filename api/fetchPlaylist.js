import { Innertube } from 'youtubei.js';

function findTargetedToken(obj) {
    if (!obj || typeof obj !== 'object') return null;
    if (obj.name === 'continuationCommand' && obj.payload?.token) return obj.payload.token;
    if (obj.continuationCommand && obj.continuationCommand.token) return obj.continuationCommand.token;
    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            const token = findTargetedToken(obj[key]);
            if (token) return token;
        }
    }
    return null;
}

function deepFindPlaylists(obj, results = []) {
    if (!obj || typeof obj !== 'object') return results;
    
    // Prevent infinite loops on cyclic structures just in case
    if (obj.__visited) return results;
    Object.defineProperty(obj, '__visited', { value: true, enumerable: false });

    // Check if current object represents a playlist
    const isPlaylist = obj.type === 'Playlist' || obj.playlistRenderer || (typeof obj.playlistId === 'string' && obj.title);
    if (isPlaylist) {
        results.push(obj);
    } else {
        // Traverse down
        for (const key in obj) {
            if (Object.prototype.hasOwnProperty.call(obj, key) && typeof obj[key] === 'object') {
                deepFindPlaylists(obj[key], results);
            }
        }
    }
    return results;
}

function parsePlaylistRenderer(item) {
    // Some items might be wrapped in playlistRenderer
    const renderer = item.playlistRenderer || (item.type === 'Playlist' ? item : null);
    if (!renderer) return null;
    
    try {
        return {
            playlist_id: renderer.playlistId || renderer.id,
            title: renderer.title?.simpleText || renderer.title?.runs?.[0]?.text || renderer.title?.text || renderer.title?.toString(),
            thumbnail: renderer.thumbnails?.[0]?.thumbnails?.[0]?.url || renderer.thumbnails?.[0]?.url || renderer.thumbnail?.[0]?.url,
            video_count: renderer.videoCount || renderer.videoCountText?.runs?.[0]?.text || renderer.video_count?.text || 'N/A'
        };
    } catch (e) { return null; }
}

function formatPlaylistResults(data) {
    // 1. Try standard results (Page 1)
    let results = data.results?.map(item => {
        if (item.content_type !== 'PLAYLIST' && item.type !== 'Playlist') return null;
        try {
            return {
                playlist_id: item.content_id || item.id,
                title: item.metadata?.title?.text || item.title?.text || item.title?.toString(),
                thumbnail: item.content_image?.primary_thumbnail?.image?.[0]?.url || item.thumbnails?.[0]?.url || item.thumbnail?.[0]?.url,
                video_count: item.content_image?.overlays?.[0]?.badges?.[0]?.text || item.video_count?.text || 'N/A'
            };
        } catch (e) { return null; }
    }).filter(Boolean) || [];

    // 2. Try continuation commands (Page 2+)
    if (results.length === 0 && data.on_response_received_commands) {
        const cmd = data.on_response_received_commands.find(c => c.appendContinuationItemsAction);
        const items = cmd?.appendContinuationItemsAction?.continuationItems;
        if (items) {
            results = items.map(parsePlaylistRenderer).filter(Boolean);
        }
    }

    return {
        playlist_results: results,
        continuation: findTargetedToken(data)
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
            const videos = playlist.videos.map(v => ({
                id: v.id,
                title: v.title?.text || v.title?.toString(),
                thumb: v.thumbnails?.[v.thumbnails.length - 1]?.url || v.thumbnail?.[0]?.url,
            }));
            return res.status(200).json({ title: playlist.info?.title || 'Playlist', video_results: videos });

        } else if (query) {
            const searchResults = await youtube.search(query, { type: 'playlist' });
            
            // Extract the infinite-scroll token
            let nextPageToken = null;
            const contItems = searchResults.memo.get("ContinuationItem");

            if (contItems && contItems.length > 0) {
                // The first ContinuationItem in the memo is typically the bottom-of-page scroll trigger
                nextPageToken = contItems[0].endpoint?.payload?.token;
            }

            const formatted = formatPlaylistResults(searchResults);
            if (nextPageToken) {
                formatted.continuation = nextPageToken;
            }

            return res.status(200).json(formatted);

        } else if (continuation) {
            // Fetch next page via raw execute
            const response = await youtube.actions.execute('/search', {
                continuation: continuation,
                client: youtube.session.context.client.clientName
            });

            // Find all playlists no matter how deeply nested they are
            const rawPlaylists = deepFindPlaylists(response.data);
            
            // Map standard entries to our format
            let results = rawPlaylists.map(parsePlaylistRenderer).filter(Boolean);

            // Extract the next token from anywhere in the response
            let pageToken = findTargetedToken(response.data);

            return res.status(200).json({
                playlist_results: results,
                continuation: pageToken
            });
        }
        return res.status(400).json({ error: 'Missing params' });
    } catch (error) {
        console.error('[YT API] Error:', error.message);
        res.status(500).json({ error: 'Failed', details: error.message });
    }
}
