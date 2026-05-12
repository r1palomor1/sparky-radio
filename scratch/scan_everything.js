import fs from 'fs';

const rawData = JSON.parse(fs.readFileSync('scratch/raw_page2_response.json', 'utf8'));

function scanEverything(obj, path = '') {
    if (!obj || typeof obj !== 'object') return;
    
    if (typeof obj === 'string') {
        const lower = obj.toLowerCase();
        if ((lower.includes('video') || lower.includes('playlist')) && /\d+/.test(obj)) {
            console.log(`Found candidate at: ${path} -> "${obj}"`);
        }
    }

    if (Array.isArray(obj)) {
        obj.forEach((item, i) => scanEverything(item, `${path}[${i}]`));
    } else {
        for (const key in obj) {
            scanEverything(obj[key], `${path}.${key}`);
        }
    }
}

scanEverything(rawData, 'root');
