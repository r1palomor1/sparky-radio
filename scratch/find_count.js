import fs from 'fs';

const rawData = JSON.parse(fs.readFileSync('scratch/debug_p1_raw.json', 'utf8'));

function findPlaylistWithVideoCount(obj) {
    if (!obj || typeof obj !== 'object') return null;
    
    if (obj.lockupViewModel?.contentType?.includes('PLAYLIST')) {
        // Deep search within this object for a string that looks like "X videos" or "X videoes"
        const str = JSON.stringify(obj);
        if (str.includes('video')) {
            return obj;
        }
    }

    if (Array.isArray(obj)) {
        for (const item of obj) {
            const found = findPlaylistWithVideoCount(item);
            if (found) return found;
        }
    } else {
        for (const key in obj) {
            const found = findPlaylistWithVideoCount(obj[key]);
            if (found) return found;
        }
    }
    return null;
}

const example = findPlaylistWithVideoCount(rawData);
if (example) {
    // Only print metadata and badges to keep it short
    const summary = {
        id: example.lockupViewModel.contentId,
        metadata: example.lockupViewModel.metadata,
        contentImage: example.lockupViewModel.contentImage?.collectionThumbnailViewModel?.primaryThumbnail?.thumbnailViewModel?.overlays
    };
    console.log(JSON.stringify(summary, null, 2));
} else {
    console.log("No playlist found with video count string.");
}
