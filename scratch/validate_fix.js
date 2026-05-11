import { Innertube } from 'youtubei.js';

function formatPlaylistResults(data) {
    // 1. Version-Aware Item Filtering
    const results = data.results?.map(item => {
        // PARITY FIX: v17 uses .type while older versions used .content_type
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

    // 2. Multi-Stage Token Extraction
    let token = data.continuation || null;
    if (!token && data.results) {
        // Deep scan for the token identified in the diagnostic
        const findDeepToken = (obj) => {
            if (!obj || typeof obj !== 'object') return null;
            if (obj.token && typeof obj.token === 'string' && obj.token.length > 20) return obj.token;
            for (const k in obj) {
                const res = findDeepToken(obj[k]);
                if (res) return res;
            }
            return null;
        };
        token = findDeepToken(data);
    }

    return {
        playlist_results: results || [],
        continuation: token
    };
}

async function validate() {
    console.log("--- FINAL LOCAL VALIDATION ---");
    const youtube = await Innertube.create();
    const searchResults = await youtube.search("bad bunny", { type: 'playlist' });
    const formatted = formatPlaylistResults(searchResults);
    
    console.log(`Formatted results count: ${formatted.playlist_results.length}`);
    console.log(`Continuation token found: ${!!formatted.continuation}`);
    
    if (formatted.playlist_results.length > 0 && formatted.continuation) {
        console.log("SUCCESS: Local validation passed.");
    } else {
        console.log("FAILURE: Data still missing in formatting.");
    }
}

validate();
