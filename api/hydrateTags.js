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
        if (num >= 1000000000) return (num / 1000000000).toFixed(1).replace(/\.0$/, '') + 'B';
        if (num >= 1000000) return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
        if (num >= 1000) return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
        return num.toString();
    }
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
        // Use getInfo for deep metadata (including relative_date)
        const info = await youtube.getInfo(id);
        
        const views = info.basic_info?.view_count?.toString() || 
                      info.primary_info?.view_count?.text || 
                      '';
                      
        // Path identified in forensic dump line 1884
        const published = info.primary_info?.relative_date?.text || 
                          info.primary_info?.published?.text || 
                          '';

        return res.status(200).json({
            id: id,
            views: shortenMetadata(views),
            published: shortenMetadata(published)
        });

    } catch (error) {
        console.error('[HYDRATE] Deep Fetch Failed:', error.message);
        res.status(500).json({ error: 'Hydration failed' });
    }
}
