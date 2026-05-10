import { Innertube } from 'youtubei.js';

// Helper: format playlist search results from Innertube response
function formatPlaylistResults(data) {
    const results = data.results?.map(item => {
        if (item.type === 'Playlist') {
            return {
                playlist_id: item.id,
                title: item.title?.toString() || item.title?.text || 'Unknown Playlist',
                thumbnail: item.thumbnails?.[0]?.url || item.thumbnail?.[0]?.url,
                channel: item.author?.name || item.author?.text || 'Playlist',
                type: 'playlist'
            };
        }
        return null;
    }).filter(Boolean);

    return {
        playlist_results: results || [],
        continuation: data.continuation || null
    };
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    console.log(`[YT API PL] Request: ${JSON.stringify(req.query)}`);

    try {
        const { id, query, continuation } = req.query;
        console.log('[YT API PL] Initializing Innertube...');
        const youtube = await Innertube.create();
        console.log('[YT API PL] Innertube initialized.');

        if (id) {
            console.log(`[YT API PL] Fetching playlist ID: ${id}`);
            const playlist = await youtube.getPlaylist(id);
            if (!playlist.videos) {
                return res.status(404).json({ error: 'Playlist not found or is empty' });
            }
            const videos = playlist.videos.map(video => ({
                id: video.id,
                title: video.title?.text || 'Unknown',
                thumb: video.thumbnails?.[video.thumbnails.length - 1]?.url || '',
            }));
            const playlistTitle = playlist.info?.title || playlist.title?.text || 'YouTube Playlist';
            console.log('[YT API PL] Playlist fetch successful.');
            return res.status(200).json({ title: playlistTitle, videos });

        } else if (query) {
            console.log(`[YT API PL] Searching for playlists: ${query}`);
            const searchResults = await youtube.search(query, { type: 'playlist' });
            console.log('[YT API PL] Search successful.');
            return res.status(200).json(formatPlaylistResults(searchResults));

        } else if (continuation) {
            console.log(`[YT API PL] Fetching continuation: ${continuation}`);
            let nextPage;
            if (typeof youtube.getContinuation === 'function') {
                nextPage = await youtube.getContinuation(continuation);
            } else {
                nextPage = await youtube.actions.execute('/search', { continuation: continuation, parse: true });
            }
            console.log('[YT API PL] Continuation fetch successful.');
            return res.status(200).json(formatPlaylistResults(nextPage));

        } else {
            return res.status(400).json({ error: 'A query, id, or continuation token is required.' });
        }

    } catch (error) {
        console.error('[YT API PL] CRITICAL ERROR:', error);
        res.status(500).json({ 
            error: 'Failed to fetch data from YouTube', 
            message: error.message,
            stack: error.stack 
        });
    }
}
