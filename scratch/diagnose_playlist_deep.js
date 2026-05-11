import { Innertube } from 'youtubei.js';

function deepFind(obj, typeName, results = []) {
    if (!obj || typeof obj !== 'object') return results;
    if (obj.type === typeName || obj.playlistRenderer || obj.playlistId) {
        results.push(obj);
    }
    for (const key in obj) {
        if (typeof obj[key] === 'object') {
            deepFind(obj[key], typeName, results);
        }
    }
    return results;
}

function findToken(obj) {
    if (!obj || typeof obj !== 'object') return null;
    if (obj.continuationCommand && obj.continuationCommand.token) return obj.continuationCommand.token;
    if (obj.name === 'continuationCommand' && obj.payload?.token) return obj.payload.token;
    for (const key in obj) {
        const token = findToken(obj[key]);
        if (token) return token;
    }
    return null;
}

async function test() {
    const youtube = await Innertube.create();
    const token = 'EoAIEgliYWQgYnVubnka8gdFZ0lRQTBnb2dnRWlVRXhTVnpkcFJVUkVPVkpFVkc1eVJsTjZabVJmVjNGTmJYUmFTekF3T1Uxd1U0SUJJbEJNTWxkTmEyMTZjazVPUjBaa0xYWTVRV3RhVGtOeE5tMTBOWGR3YlVONmNsT0NBU0pRVEVSVlJXcHZRbFpOWW1oZll6QlZXa1JCZFdWaFdXaHBiM0JWY1hJMGJWVmtnZ0VpVUV4SFJVUllZa05ETjBFMGFYcHhRelJyVkhSV01XaGZUR1ZMWldwS2RsOXNiNElCSWxCTWNHdGhhbFp3TWxsUVprZFFUWGx2TVROa1UwWnZSRFoxTW1kQkxXRkdVMG1DQVNKUVRGQnVTVUpEWXpONE5tdE5iRFJXYlV3NWJrWmtNa0pCZVdSUlJqbEVWMEZJZ2dFaVVFeHBXa3hZYjA0MlV6VXRlblZ5UWpaMVlrSnplVmxuWlRseFQwMWtSVk5MY1lJQklsQk1VbFphTTI1RFFVTnlkSFpVWW1OUk5rbENkVkIxYkhGdFEwUjRjbUUxTmtLQ0FTSlFURTVQTWpabVEydHdSamM0WVZWNVEyRlBlblZmWVUxYVUxaDVjM2hZWWw5a2dnRWlVRXhDT1dKaFluZHFOa05uV1dOelFYUjJXR3hyVEhGQlZVUk5Na1JQVTNWNlI0SUJJbEJNWm1kck5uRnVUa3RIUlhsM1IwZFpRWHBHWlRnMFMyeHlPRWRXTVZJMmJYU0NBU0pRVEZJM05EUkZUekZ2VjFwVWExWTRSVzlyY1RaR2R6UTBPRGhSTFY5a2RuZDFnZ0VpVUV4VFFsZDJXVzA0ZERaMVdsOUhTa2RCYUhGa2VUUkxRbWxRU2xOSU9YQk9aSUlCSWxCTVpXd3pXR3h1UjFvdGJXSlNkMUZDTUVKbVpqQkxXRkJYZERadU0xOUlNV3lDQVNKUVRIcGpPVGg2UlZoMFZHMDFSRGhyUVZGSFVYSXpkRzlyZW1ZMVZVNUdjbEJKZ2dFaVVFeDJlalZmYUZGM1JqZENVRnBSUjNKWlZIVnVSa2hRZW1JeVRrMUZUbWhaUVlJQklsQk1Xa2t3VlUxMmIydG9ZMXBSY1hGTWFUQkplRjgxVTJKUWRGUjBWbEZUUzB1Q0FTSlFURGQwUWxCWlVYcERhbVZLVEdKM1ozRTRORXB3V2xsT1RHOU5aemx3V0VSTmdnRWlVRXd4Y25weGMyWktjMFJRWDFKTGVVVnlVME16WTFablVsZzNVbVpNT0hndGJJSUJJbEJNTlY5U1FsZ3dWamQxYUd0WWEzUlBiVEZ2TTI5T2JqZG9PWGhmZWxoNlpVbXlBUVlLQkFnb0VBTSUzRBiB4OgYIgtzZWFyY2gtZmVlZA%253D%253D';
    console.log("Executing page 2...");
    const response = await youtube.actions.execute('/search', { continuation: token, client: youtube.session.context.client.clientName });
    
    // Deep find playlists!
    const playlists = deepFind(response.data, 'Playlist');
    console.log("Found playlists:", playlists.length);
    if(playlists.length > 0) {
        console.log("Sample Playlist:", playlists[0].title, playlists[0].id || playlists[0].playlistId);
    }
    
    const nextToken = findToken(response.data);
    console.log("Next token found:", nextToken);
}
test();