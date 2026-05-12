import fs from 'fs';

// Try multiple possible file names
const possibleFiles = ['scratch/debug_p2_raw.json', 'scratch/raw_page2_response.json'];
let rawData = null;

for (const file of possibleFiles) {
    if (fs.existsSync(file)) {
        rawData = JSON.parse(fs.readFileSync(file, 'utf8'));
        console.log(`Using file: ${file}`);
        break;
    }
}

if (!rawData) {
    console.log("No raw data file found.");
    process.exit(1);
}

function scanForVideoCounts(obj, path = '') {
    if (!obj || typeof obj !== 'object') return;
    
    if (typeof obj === 'string' && (obj.toLowerCase().includes('video') || obj.toLowerCase().includes('playlist')) && /\d+/.test(obj)) {
        console.log(`Found candidate string at path: ${path} -> "${obj}"`);
    }

    if (Array.isArray(obj)) {
        obj.forEach((item, i) => scanForVideoCounts(item, `${path}[${i}]`));
    } else {
        for (const key in obj) {
            scanForVideoCounts(obj[key], `${path}.${key}`);
        }
    }
}

function findAndScanLockups(obj) {
    if (!obj || typeof obj !== 'object') return;
    if (obj.lockupViewModel?.contentType?.includes('PLAYLIST')) {
        console.log("--- SCANNING LOCKUP ---");
        console.log("ID:", obj.lockupViewModel.contentId);
        scanForVideoCounts(obj, 'root');
        return;
    }
    if (Array.isArray(obj)) obj.forEach(findAndScanLockups);
    else for (const key in obj) findAndScanLockups(obj[key]);
}

findAndScanLockups(rawData);
