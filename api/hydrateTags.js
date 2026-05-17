import { getYoutubeClient } from './youtube.js';
import { shortenMetadata, absoluteToRelative } from './utils.js';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        const { id } = req.query;
        if (!id) return res.status(400).json({ error: 'ID required' });

        const youtube = await getYoutubeClient();

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
