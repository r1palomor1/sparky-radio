import { Innertube } from 'youtubei.js';

// Helper function to format playlist search results for the frontend
function formatPlaylistResults(data) {
    // 1. Get the array of results from the correct property
    const results = data.results?.map(item => {
        
        // 2. We only care about items that are Playlists
        if (item.content_type !== 'PLAYLIST') return null;

        // 3. Extract the data using the exact paths, but with MAXIMUM safety
        try {
            const playlist_id = item.content_id;
            const title = item.metadata?.title?.text;

            // --- THIS IS THE FIX ---
            // We add more '?' to safely handle empty or null arrays
            const thumbnail = item.content_image?.primary_thumbnail?.image?.[0]?.url;
            const video_count = item.content_image?.overlays?.[0]?.badges?.[0]?.text || 'N/A';
            // --- END OF FIX ---

            // 4. If we have the essentials, return the object
            if (playlist_id && title && thumbnail) {
                return {
                    playlist_id: playlist_id,
                    title: title,
                    thumbnail: thumbnail,
                    video_count: video_count
                };
            }
        } catch (e) {
            // Log any other weird errors but don't crash
            console.error("Failed to parse an item:", e.message);
            return null;
        }
        
        return null;
    }).filter(Boolean); // 5. Filter out all the nulls (videos, bad items)

    return {
        playlist_results: results || [],
        // 6. The continuation token is at the root of the data object
        continuation: data.continuation || null
    };
}

export default async function handler(req, res) {
  // Set CORS headers for all responses
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight OPTIONS requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const { id, query, continuation } = req.query;
    const youtube = await Innertube.create();

    // === LOGIC 1: Fetch a specific playlist (Existing "is.gd" & Overlay Logic) ===
    if (id) {
        const playlist = await youtube.getPlaylist(id);

        if (!playlist.videos) {
            return res.status(404).json({ error: 'Playlist not found or is empty' });
        }

        const baseVideos = playlist.videos.map(video => ({
            id: video.id,
            title: video.title.text,
            thumb: video.thumbnails[video.thumbnails.length - 1].url,
        }));

        const playlistTitle = playlist.info?.title || playlist.title?.text || 'YouTube Playlist';

        return res.status(200).json({
            title: playlistTitle,
            videos: baseVideos
        });
    
    // === LOGIC 2: Search for playlists (New "Playlists" Mode Logic) ===
    } else if (query) {
        const searchResults = await youtube.search(query, {
            type: 'playlist' // This is the key change
        });
        
        // This function will now correctly parse the 'searchResults' object
        const formattedData = formatPlaylistResults(searchResults);
        return res.status(200).json(formattedData);

    // === LOGIC 3: Get next page of search results (New Pagination Logic) ===
    } else if (continuation) {
        // This logic was already correct
        const nextPage = await youtube.getContinuation(continuation);
        
        const formattedData = formatPlaylistResults(nextPage);
        return res.status(200).json(formattedData);
    
    // === LOGIC 4: No valid parameter provided ===
    } else {
      return res.status(400).json({ error: 'A query, id, or continuation token is required' });
    }

  } catch (error) {
    console.error('Vercel API Error:', error.message);
    res.status(500).json({ error: 'Failed to fetch data from YouTube', details: error.message });
  }
}