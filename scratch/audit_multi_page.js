import { Innertube } from 'youtubei.js';
import fs from 'fs';

async function test() {
    const youtube = await Innertube.create();
    const query = "bad bunny";
    
    function findToken(obj) {
        if (!obj || typeof obj !== 'object') return null;
        if (obj.continuationCommand?.payload?.token) return obj.continuationCommand.payload.token;
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

    function findPlaylists(obj, results = []) {
        if (!obj || typeof obj !== 'object') return results;
        const isPlaylist = (obj.type === 'Playlist') || (obj.playlistRenderer) || (obj.lockupViewModel?.contentType === 'LOCKUP_CONTENT_TYPE_PLAYLIST');
        if (isPlaylist) {
            const renderer = obj.playlistRenderer || (obj.type === 'Playlist' ? obj : null);
            const luv = obj.lockupViewModel;
            if (renderer) {
                results.push({
                    playlist_id: renderer.playlistId || renderer.id,
                    title: renderer.title?.toString() || renderer.title?.text || 'Unknown Playlist',
                    video_count: renderer.video_count?.text || renderer.videoCountText?.text || 'N/A'
                });
            } else if (luv) {
                let vCount = 'N/A';
                const overlays = luv.contentImage?.collectionThumbnailViewModel?.primaryThumbnail?.thumbnailViewModel?.overlays || 
                                luv.contentImage?.thumbnailViewModel?.overlays;
                
                if (Array.isArray(overlays)) {
                    for (const o of overlays) {
                        const badge = o.thumbnailOverlayBadgeViewModel?.thumbnailBadges?.[0]?.thumbnailBadgeViewModel || 
                                     o.thumbnailBadgeViewModel;
                        if (badge?.text && (badge.text.toLowerCase().includes('video') || /\d+/.test(badge.text))) {
                            vCount = badge.text;
                            break;
                        }
                    }
                }
                
                if (vCount === 'N/A') {
                    const lines = luv.metadata?.lockupMetadataViewModel?.metadataLines;
                    if (lines) {
                        for (const line of lines) {
                            const content = line.contentMetadataViewModel?.metadata?.[0]?.content;
                            if (content && (content.toLowerCase().includes('video') || /\d+/.test(content))) {
                                vCount = content;
                                break;
                            }
                        }
                    }
                }

                results.push({
                    playlist_id: luv.contentId,
                    title: luv.metadata?.lockupMetadataViewModel?.title?.content || 'Unknown Playlist',
                    video_count: vCount
                });
            }
            return results;
        }
        if (Array.isArray(obj)) for (const item of obj) findPlaylists(item, results);
        else for (const key in obj) {
            if (Object.prototype.hasOwnProperty.call(obj, key)) findPlaylists(obj[key], results);
        }
        return results;
    }

    console.log(`[AUDIT] Fetching Page 1...`);
    const p1 = await youtube.actions.execute('/search', { query, params: 'EgIQAw%3D%3D', parse: false });
    const playlistsP1 = findPlaylists(p1.data || p1);
    const token = findToken(p1.data || p1);
    fs.writeFileSync('scratch/playlist_page1_results.json', JSON.stringify(playlistsP1, null, 2));
    console.log(`[AUDIT] Saved 19 items to scratch/playlist_page1_results.json`);
    
    if (token) {
        console.log(`[AUDIT] Fetching Page 2...`);
        const p2 = await youtube.actions.execute('/search', { continuation: token, parse: false });
        fs.writeFileSync('scratch/audit_p2_raw.json', JSON.stringify(p2.data || p2, null, 2));
        const playlistsP2 = findPlaylists(p2.data || p2);
        fs.writeFileSync('scratch/playlist_page2_results.json', JSON.stringify(playlistsP2, null, 2));
        console.log(`[AUDIT] Saved 20 items to scratch/playlist_page2_results.json`);
    }
}

test();
