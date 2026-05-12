import fs from 'fs';

const rawData = JSON.parse(fs.readFileSync('scratch/playlist_p1_raw.json', 'utf8'));

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

const playlists = findPlaylists(rawData);
console.log(`Found ${playlists.length} playlists.`);
if (playlists.length > 0) {
    console.log("First playlist:", playlists[0]);
}
