import { Innertube } from 'youtubei.js';

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

async function quickProof() {
    console.log('--- QUICK SYSTEM PROOF ---');
    const youtube = await Innertube.create();
    
    // Simulate Video IDs from a playlist
    const mockQueue = [
        { id: 'X7Hwiw8yLko', title: 'Jelly Roll - Thorns', views: '', published: '' },
        { id: 'HcNILY4gtNI', title: 'Jelly Roll - Liar', views: '', published: '' }
    ];

    console.log('1. [SIMULATION] Queue before Hydration:');
    console.table(mockQueue);

    console.log('2. [SIMULATION] Hydrating via Backend Logic...');
    const results = await Promise.all(mockQueue.map(async (v) => {
        const info = await youtube.getBasicInfo(v.id);
        const basic = info.basic_info;
        const primary = info.primary_info;

        return {
            ...v,
            views: shortenMetadata(basic.view_count?.toString() || ''),
            published: shortenMetadata(primary?.relative_date?.text || '')
        };
    }));

    console.log('\n3. [SIMULATION] Queue AFTER Hydration:');
    console.table(results);
    console.log('--- PROOF COMPLETE ---');
}

quickProof();
