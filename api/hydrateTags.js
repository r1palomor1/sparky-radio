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

/**
 * Converts an absolute ISO date string (e.g. "2023-05-14") to a
 * relative timeframe string (e.g. "2 y", "3 mo", "5 d").
 */
function absoluteToRelative(isoDateStr) {
    if (!isoDateStr) return '';
    try {
        const then = new Date(isoDateStr);
        const now = new Date();
        const diffMs = now - then;
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        if (diffDays < 1)   return 'today';
        if (diffDays < 7)   return `${diffDays} d`;
        if (diffDays < 30)  return `${Math.floor(diffDays / 7)} w`;
        if (diffDays < 365) return `${Math.floor(diffDays / 30)} mo`;
        return `${Math.floor(diffDays / 365)} y`;
    } catch {
        return '';
    }
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

        // PATH A: getInfo — most complete, includes primary_info (relative date) + microformat
        const info = await youtube.getInfo(id);
        const basic = info.basic_info;

        const views = basic?.view_count?.toString() || '';

        // Timeframe — hunt across all known paths, ordered by reliability
        let published =
            info.primary_info?.relative_date?.text ||         // "2 years ago"
            info.primary_info?.published?.text ||              // "Published: May 14 2023"
            '';

        // PATH B: microformat absolute date → relative conversion (most reliable fallback)
        if (!published) {
            const mf = info.microformat?.microformat_data_renderer ||
                       info.microformat?.playerMicroformatRenderer ||
                       info.microformat;
            const rawDate = mf?.publish_date || mf?.publishDate || mf?.upload_date || mf?.uploadDate || '';
            if (rawDate) {
                published = absoluteToRelative(rawDate);
            }
        }

        // PATH C: basic_info.published as last resort
        if (!published && basic?.published) {
            published = basic.published;
        }

        console.log(`[HYDRATE-TRACE] ID: ${id}`);
        console.log(`  - Views: ${views ? views : 'FAIL'}`);
        console.log(`  - Date (raw): ${published || 'MISSING'}`);
        const source = info.primary_info?.relative_date?.text ? 'relative_date'
            : info.primary_info?.published?.text ? 'primary_published'
            : (info.microformat?.microformat_data_renderer?.publish_date || info.microformat?.playerMicroformatRenderer?.publishDate) ? 'microformat'
            : basic?.published ? 'basic_published'
            : 'NONE';
        console.log(`  - Source: ${source}`);

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
