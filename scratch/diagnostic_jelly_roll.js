import { Innertube } from 'youtubei.js';

async function testHydration() {
    console.log('--- STARTING DIAGNOSTIC SEARCH: JELLY ROLL ---');
    const youtube = await Innertube.create();
    
    // 1. Search for Playlists
    console.log('1. Searching for Playlists...');
    const search = await youtube.actions.execute('/search', { 
        query: 'Jelly Roll', 
        params: 'EgIQAw%3D%3D', // Playlist filter
        parse: false 
    });
    
    // Extract first playlist ID (simple manual hunt for brevity)
    const json = JSON.stringify(search.data || search);
    const match = json.match(/\"playlistId\":\"([^\"]+)\"/);
    if (!match) {
        console.error('Failed to find a playlist ID.');
        return;
    }
    const playlistId = match[1];
    console.log(`   Found Playlist ID: ${playlistId}`);

    // 2. Fetch Playlist Videos
    console.log('2. Fetching Videos from Playlist...');
    const playlist = await youtube.getPlaylist(playlistId);
    const videos = playlist.videos.slice(0, 5);
    console.log(`   Found ${videos.length} videos. Extracting IDs...`);

    // 3. Hydrate Metadata (Simulating api/hydrateTags.js logic)
    console.log('3. Running Hydration for Video IDs...');
    const results = await Promise.all(videos.map(async (v) => {
        try {
            const info = await youtube.getBasicInfo(v.id);
            const basic = info.basic_info;
            const primary = info.primary_info;

            return {
                id: v.id,
                title: v.title?.toString() || 'Unknown',
                views: basic.view_count?.toString() || 'N/A',
                published: primary?.relative_date?.text || 'N/A'
            };
        } catch (e) {
            return { id: v.id, error: e.message };
        }
    }));

    console.log('\n--- DIAGNOSTIC RESULTS ---');
    console.table(results);
    console.log('--- DIAGNOSTIC COMPLETE ---');
}

testHydration();
