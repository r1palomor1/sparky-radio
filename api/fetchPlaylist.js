import { Innertube } from 'youtubei.js';

// Helper: format playlist search results from Innertube response
function formatPlaylistResults(data) {
    const results = data.results?.map(item => {
        if (item.content_type !== 'PLAYLIST') return null;
        try {
            const playlist_id = item.content_id;
            const title = item.metadata?.title?.text;
            const thumbnail = item.content_image?.primary_thumbnail?.image?.[0]?.url;
            const video_count = item.content_image?.overlays?.[0]?.badges?.[0]?.text || 'N/A';
            if (playlist_id && title && thumbnail) {
                return { playlist_id, title, thumbnail, video_count };
            }
        } catch (e) {
            console.error('Failed to parse playlist item:', e.message);
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

    try {
        const { id, query, continuation } = req.query;
        const youtube = await Innertube.create();

        // LOGIC 1: Fetch a specific playlist by ID
        if (id) {
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
            return res.status(200).json({ title: playlistTitle, videos });

        // LOGIC 2: Search for playlists by query
        } else if (query) {
            const searchResults = await youtube.search(query, { type: 'playlist' });
            return res.status(200).json(formatPlaylistResults(searchResults));

        // LOGIC 3: Paginate search results via continuation token
        } else if (continuation) {
            const nextPage = await youtube.getContinuation(continuation);
            return res.status(200).json(formatPlaylistResults(nextPage));

        } else {
            return res.status(400).json({ error: 'A query, id, or continuation token is required.' });
        }

    } catch (error) {
        console.error('Sparky YT API Error (fetchPlaylist):', error.message);
        res.status(500).json({ error: 'Failed to fetch data from YouTube', details: error.message });
    }
}
