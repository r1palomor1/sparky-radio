import { Innertube } from 'youtubei.js';

// PORTED EXACTLY FROM r1-launch-pad
function formatPlaylistResults(data) {
    // 1. Get the array of results from the correct property
    const results = data.results?.map(item => {
        
        // 2. We only care about items that are Playlists
        // In some versions of the library, it might be item.type === 'Playlist'
        // But we follow the r1-launch-pad check:
        if (item.content_type !== 'PLAYLIST' && item.type !== 'Playlist') return null;

        // 3. Extract the data using the exact paths from the repo
        try {
            const playlist_id = item.content_id || item.id;
            const title = item.metadata?.title?.text || item.title?.text || item.title?.toString();

            const thumbnail = item.content_image?.primary_thumbnail?.image?.[0]?.url || item.thumbnails?.[0]?.url || item.thumbnail?.[0]?.url;
            const video_count = item.content_image?.overlays?.[0]?.badges?.[0]?.text || item.video_count?.text || item.video_count?.toString() || 'N/A';

            if (playlist_id && title && thumbnail) {
                return {
                    playlist_id: playlist_id,
                    title: title,
                    thumbnail: thumbnail,
                    video_count: video_count
                };
            }
        } catch (e) {
            console.error("[YT-BACKEND] Failed to parse item:", e.message);
            return null;
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

        // LOGIC 1: Fetch a specific playlist (Videos inside)
        if (id) {
            console.log(`[YT API] Fetching playlist ID: ${id}`);
            const playlist = await youtube.getPlaylist(id);

            if (!playlist.videos) {
                return res.status(404).json({ error: 'Playlist not found or is empty' });
            }

            const baseVideos = playlist.videos.map(video => ({
                id: video.id,
                title: video.title?.text || video.title?.toString(),
                thumb: video.thumbnails?.[video.thumbnails.length - 1]?.url || video.thumbnail?.[0]?.url,
            }));

            const playlistTitle = playlist.info?.title || playlist.title?.text || 'YouTube Playlist';

            return res.status(200).json({
                title: playlistTitle,
                video_results: baseVideos // Adapting key to Sparky frontend 'video_results'
            });
        
        // LOGIC 2: Search for playlists
        } else if (query) {
            console.log(`[YT API] Searching for playlists: ${query}`);
            const searchResults = await youtube.search(query, {
                type: 'playlist'
            });
            
            return res.status(200).json(formatPlaylistResults(searchResults));

        // LOGIC 3: Paginate search results via continuation token
        } else if (continuation) {
            console.log(`[YT API] Fetching continuation: ${continuation.substring(0, 20)}...`);
            const nextPage = await youtube.getContinuation(continuation);
            
            return res.status(200).json(formatPlaylistResults(nextPage));
        
        } else {
          return res.status(400).json({ error: 'A query, id, or continuation token is required' });
        }

    } catch (error) {
        console.error('Sparky YT API Error (fetchPlaylist):', error.message);
        res.status(500).json({ error: 'Failed to fetch data from YouTube', details: error.message });
    }
}
