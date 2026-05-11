const fs = require('fs');
const { Innertube } = require('youtubei.js');

function findTargetedToken(obj) {
    if (!obj || typeof obj !== 'object') return null;
    if (obj.name === 'continuationCommand' && obj.payload && obj.payload.token) return obj.payload.token;
    if (obj.continuationCommand && obj.continuationCommand.token) return obj.continuationCommand.token;
    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            const token = findTargetedToken(obj[key]);
            if (token) return token;
        }
    }
    return null;
}

function formatPlaylistResults(data) {
    let results = [];

    if (data.results) {
        results = data.results.map(item => {
            if (item.content_type !== 'PLAYLIST' && item.type !== 'Playlist') return null;
            try {
                return { playlist_id: item.content_id || item.id, title: item.title?.text || item.title?.toString() };
            } catch (e) { return null; }
        }).filter(Boolean);
    }

    if (results.length === 0 && data.on_response_received_commands) {
        for (const cmd of data.on_response_received_commands) {
            const items = cmd.appendContinuationItemsAction?.continuationItems;
            if (items) {
                const parsed = items.map(item => {
                    if (item.playlistRenderer) {
                        return {
                            playlist_id: item.playlistRenderer.playlistId,
                            title: item.playlistRenderer.title?.simpleText
                        };
                    }
                    if (item.lockupViewModel && item.lockupViewModel.contentType === 'LOCKUP_CONTENT_TYPE_PLAYLIST') {
                        const luv = item.lockupViewModel;
                        return { playlist_id: luv.contentId, title: luv.metadata?.lockupMetadataViewModel?.title?.content || 'N/A' };
                    }
                    return null;
                }).filter(Boolean);
                if (parsed.length > 0) {
                    results = parsed;
                    break;
                }
            }
        }
    }

    return { playlist_results: results, continuation: findTargetedToken(data) };
}

(async () => {
    let output = "";
    try {
        const yt = await Innertube.create();
        output += "Page 1...\n";
        const search1 = await yt.search("bad bunny", { type: 'playlist' });
        let token = search1.memo.get("ContinuationItem")?.[0]?.endpoint?.payload?.token;
        let formatted = formatPlaylistResults(search1);
        output += `Extracted: ${formatted.playlist_results.length} playlists. Token: ${token ? 'YES' : 'NO'}\n`;
        
        let currentPage = 2;
        while (token && currentPage <= 4) {
            output += `Page ${currentPage}...\n`;
            const searchNext = await yt.actions.execute('/search', { continuation: token, client: yt.session.context.client.clientName });
            formatted = formatPlaylistResults(searchNext.data);
            output += `Extracted: ${formatted.playlist_results.length} playlists. Token: ${formatted.continuation ? 'YES' : 'NO'}\n`;
            token = formatted.continuation;
            currentPage++;
        }
    } catch (e) {
        output += "Error: " + e.message;
    }
    fs.writeFileSync('scratch/final_test_output.txt', output);
})();
