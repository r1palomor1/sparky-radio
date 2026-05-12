import fs from 'fs';

const rawData = JSON.parse(fs.readFileSync('scratch/debug_p1_raw.json', 'utf8'));

function findStructure(obj) {
    if (!obj || typeof obj !== 'object') return null;
    
    // Look for a playlist renderer or lockup
    if (obj.playlistRenderer || (obj.lockupViewModel?.contentType?.includes('PLAYLIST'))) {
        return obj;
    }

    if (Array.isArray(obj)) {
        for (const item of obj) {
            const found = findStructure(item);
            if (found) return found;
        }
    } else {
        for (const key in obj) {
            const found = findStructure(obj[key]);
            if (found) return found;
        }
    }
    return null;
}

const example = findStructure(rawData);
console.log("Found example playlist structure:");
console.log(JSON.stringify(example, null, 2));
