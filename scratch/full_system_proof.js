import { Innertube } from 'youtubei.js';

// Simulation of shortenMetadata (Logic from api/hydrateTags.js)
function shortenMetadata(text) {
    if (!text) return '';
    let clean = text.toString()
        .replace(/\s*views?\s*/gi, '')
        .replace(/\s*ago\s*/gi, '')
        .replace(/years?/gi, 'y')
        .replace(/months?/gi, 'mo')
        .replace(/weeks?/gi, 'w')
        .replace(/days?/gi, 'd')
        .replace(/hours?/gi, 'h')
        .replace(/minutes?/gi, 'm')
        .replace(/seconds?/gi, 's')
        .trim();

    const num = parseFloat(clean.replace(/,/g, ''));
    if (!isNaN(num) && /^\d+(\.\d+)?$/.test(clean.replace(/,/g, ''))) {
        if (num >= 1000000) return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
        if (num >= 1000) return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
        return num.toString();
    }
    return clean;
}

async function runFullQueueLogic() {
    console.log('--- FULL QUEUE LOGIC SIMULATION ---');
    const youtube = await Innertube.create();
    
    // 1. BACKEND: Fetch Playlist
    console.log('1. [BACKEND] Fetching Playlist Videos...');
    const playlist = await youtube.getPlaylist('PLiC_Y8lV9W6T_vA6H_L6_Q_Q_Q_Q_Q_Q'); // Mock or real ID search
    // Since we need a real ID, we search first
    const search = await youtube.actions.execute('/search', { query: 'Jelly Roll', params: 'EgIQAw%3D%3D', parse: false });
    const playlistId = JSON.stringify(search).match(/\"playlistId\":\"([^\"]+)\"/)[1];
    
    const playlistData = await youtube.getPlaylist(playlistId);
    const videos = playlistData.videos.slice(0, 3).map(v => ({
        id: v.id,
        title: v.title?.toString(),
        views: '', // Empty initially
        published: '' // Empty initially
    }));

    console.log('2. [FRONTEND] Initial Queue State (Before Hydration):');
    console.table(videos);

    // 2. FRONTEND: Hydration Loop (Logic from main.js)
    console.log('3. [FRONTEND] Starting Asynchronous Hydration...');
    const hydratedQueue = await Promise.all(videos.map(async (item) => {
        try {
            const info = await youtube.getBasicInfo(item.id);
            
            // Logic from api/hydrateTags.js
            const freshViews = info.basic_info?.view_count?.toString() || '';
            const freshDate = info.primary_info?.relative_date?.text || info.primary_info?.published?.text || '';

            return {
                ...item,
                views: shortenMetadata(freshViews),
                published: shortenMetadata(freshDate)
            };
        } catch (e) {
            return item;
        }
    }));

    console.log('\n4. [FINAL PROOF] Fully Hydrated Queue State:');
    console.table(hydratedQueue);
    console.log('--- SIMULATION COMPLETE ---');
}

runFullQueueLogic();
