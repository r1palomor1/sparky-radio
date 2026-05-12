import { Innertube } from 'youtubei.js';

async function test() {
    const youtube = await Innertube.create();
    const query = "bad bunny";
    
    function findToken(obj) {
        if (!obj || typeof obj !== 'object') return null;
        if (obj.continuationCommand?.payload?.token) {
            const token = obj.continuationCommand.payload.token;
            if (typeof token === 'string' && token.length > 20) return token;
        }
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
            if (renderer) results.push({ id: renderer.playlistId || renderer.id, title: renderer.title?.text || renderer.title?.toString() });
            else if (luv) results.push({ id: luv.contentId, title: luv.metadata?.lockupMetadataViewModel?.title?.content });
            return results;
        }
        if (Array.isArray(obj)) for (const item of obj) findPlaylists(item, results);
        else for (const key in obj) {
            if (Object.prototype.hasOwnProperty.call(obj, key)) findPlaylists(obj[key], results);
        }
        return results;
    }

    console.log(`[TEST] Fetching Page 1...`);
    const p1 = await youtube.actions.execute('/search', { query, params: 'EgIQAw%3D%3D', parse: false });
    const playlistsP1 = findPlaylists(p1.data || p1);
    const token = findToken(p1.data || p1);
    console.log(`[TEST] Page 1: Found ${playlistsP1.length} playlists.`);
    
    if (token) {
        console.log(`[TEST] Page 1 Token found: ${token.substring(0, 30)}...`);
        console.log(`[TEST] Fetching Page 2...`);
        const p2 = await youtube.actions.execute('/search', { continuation: token, parse: false });
        const playlistsP2 = findPlaylists(p2.data || p2);
        console.log(`[TEST] Page 2: Found ${playlistsP2.length} playlists.`);
        if (playlistsP2.length > 0) {
            console.log(`[TEST] SUCCESS: Page 2 is working! First result: ${playlistsP2[0].title}`);
            const token2 = findToken(p2.data || p2);
            if (token2) console.log(`[TEST] Page 2 Token found (for Page 3): ${token2.substring(0, 30)}...`);
        } else {
            console.log(`[TEST] FAILURE: Page 2 returned 0 items.`);
        }
    } else {
        console.log(`[TEST] FAILURE: No continuation token found on Page 1.`);
    }
}

test();
