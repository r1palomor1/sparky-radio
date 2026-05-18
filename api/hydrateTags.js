import { getYoutubeClient } from './youtube.js';
import { shortenMetadata, absoluteToRelative } from './utils.js';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        const { id, ids } = req.query;
        if (!id && !ids) return res.status(400).json({ error: 'ID or IDs required' });

        const youtube = await getYoutubeClient();

        // Helper function to hydrate a single video
        async function fetchSingleInfo(videoId) {
            try {
                // PATH A: getInfo — most complete
                const info = await youtube.getInfo(videoId);
                const basic = info.basic_info;
                const views = basic?.view_count?.toString() || '';

                // Timeframe
                let published =
                    info.primary_info?.relative_date?.text ||
                    info.primary_info?.published?.text ||
                    '';

                // PATH B: microformat absolute date → relative conversion
                if (!published) {
                    const mf = info.microformat?.microformat_data_renderer ||
                               info.microformat?.playerMicroformatRenderer ||
                               info.microformat;
                    const rawDate = mf?.publish_date || mf?.publishDate || mf?.upload_date || mf?.uploadDate || '';
                    if (rawDate) {
                        published = absoluteToRelative(rawDate);
                    }
                }

                // PATH C: basic_info.published
                if (!published && basic?.published) {
                    published = basic.published;
                }

                return {
                    id: videoId,
                    views: shortenMetadata(views),
                    published: shortenMetadata(published)
                };
            } catch (err) {
                console.error(`[HYDRATE] Failed for ID ${videoId}:`, err.message);
                return {
                    id: videoId,
                    views: '',
                    published: ''
                };
            }
        }

        if (ids) {
            const idList = ids.split(',').map(s => s.trim()).filter(Boolean);
            if (idList.length === 0) return res.status(400).json({ error: 'Valid IDs required' });

            console.log(`[HYDRATE] Batch hydrating ${idList.length} video IDs`);
            // Run in parallel
            const results = await Promise.all(idList.map(fetchSingleInfo));
            return res.status(200).json({ results });
        } else {
            console.log(`[HYDRATE] Single hydration for ID: ${id}`);
            const result = await fetchSingleInfo(id);
            return res.status(200).json(result);
        }

    } catch (error) {
        console.error('[HYDRATE] Data Recovery Failed:', error.message);
        res.status(500).json({ error: 'Hydration failed' });
    }
}
