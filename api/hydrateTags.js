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

    // Handle raw numbers (Views)
    const num = parseFloat(clean.replace(/,/g, ''));
    if (!isNaN(num) && /^\d+(\.\d+)?$/.test(clean.replace(/,/g, ''))) {
        if (num >= 1000000000) return (num / 1000000000).toFixed(1).replace(/\.0$/, '') + 'B';
        if (num >= 1000000) return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
        if (num >= 1000) return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
        return num.toString();
    }
    // Return the shortened timeframe (e.g. "2 mo", "4 w")
    return clean;
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        const { id } = req.query;
        if (!id) return res.status(400).json({ error: 'ID required' });

        const youtube = await Innertube.create();
        
        // Use getBasicInfo first (Fast and contains views)
        const basic = await youtube.getBasicInfo(id);
        let views = basic.basic_info?.view_count?.toString() || '';
        let published = '';

        // If basic info is missing the date, use a targeted primary info fetch
        const info = await youtube.getInfo(id);
        published = info.primary_info?.relative_date?.text || 
                    info.primary_info?.published?.text || 
                    info.basic_info?.published || 
                    '';

        console.log(`[HYDRATE-TRACE] ID: ${id}`);
        console.log(`  - Views: ${views ? views : 'FAIL'}`);
        console.log(`  - Date: ${published || 'MISSING'}`);
        console.log(`  - Source: ${info.primary_info?.relative_date?.text ? 'relative_date' : (info.primary_info?.published?.text ? 'primary_published' : (info.basic_info?.published ? 'basic_published' : 'NONE'))}`);

        return res.status(200).json({
            id: id,
            views: shortenMetadata(views),
            published: shortenMetadata(published)
        });

    } catch (error) {
        console.error('[HYDRATE] Data Recovery Failed:', error.message);
        res.status(500).json({ error: 'Hydration failed' });
    }
}
