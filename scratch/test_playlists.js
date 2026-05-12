import { Innertube } from 'youtubei.js';

async function test() {
    const youtube = await Innertube.create();
    const query = "bad bunny";
    console.log(`Searching playlists for: ${query}`);
    
    const searchResults = await youtube.search(query, { type: 'playlist' });
    console.log("Raw search results type:", typeof searchResults);
    
    // Manually run findPlaylists logic
    function findPlaylists(obj, results = []) {
        if (!obj || typeof obj !== 'object') return results;
        const isPlaylist = (obj.type === 'Playlist') || 
                          (obj.playlistRenderer) || 
                          (obj.lockupViewModel?.contentType === 'LOCKUP_CONTENT_TYPE_PLAYLIST') ||
                          (typeof obj.playlistId === 'string' && (obj.title || obj.titleText));
        if (isPlaylist) {
            const renderer = obj.playlistRenderer || (obj.type === 'Playlist' ? obj : null);
            const luv = obj.lockupViewModel;
            if (renderer) {
                results.push({ id: renderer.playlistId || renderer.id, title: renderer.title?.text || renderer.title?.toString() });
            } else if (luv) {
                results.push({ id: luv.contentId, title: luv.metadata?.lockupMetadataViewModel?.title?.content });
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

    const playlists = findPlaylists(searchResults);
    console.log(`Found ${playlists.length} playlists.`);
    if (playlists.length > 0) {
        console.log("First playlist:", playlists[0]);
    }
}

test();
