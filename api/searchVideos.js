import { getYoutubeClient } from './youtube.js';
import { findToken, extractString, extractThumbnail, shortenMetadata } from './utils.js';

// Recursive helper to find ALL video objects
function findVideos(obj, results = []) {
    if (!obj || typeof obj !== 'object') return results;
    if (obj.type === 'Video' || obj.videoRenderer) {
        const renderer = obj.videoRenderer || (obj.type === 'Video' ? obj : null);
        if (renderer) {
            results.push({
                id: renderer.id || renderer.videoId,
                title: extractString(renderer.title) || 'Unknown Title',
                thumbnail: extractThumbnail(renderer.thumbnail || renderer.thumbnails),
                channel: extractString(renderer.author || renderer.longBylineText || renderer.shortBylineText) || 'Unknown Channel',
                duration: extractString(renderer.duration || renderer.lengthText) || '',
                views: shortenMetadata(extractString(renderer.view_count || renderer.short_view_count || renderer.viewCountText)),
                published: shortenMetadata(extractString(renderer.published || renderer.publishedTimeText)),
                type: 'video'
            });
            return results;
        }
    }
    if (Array.isArray(obj)) {
        for (const item of obj) findVideos(item, results);
    } else {
        for (const key in obj) {
            if (Object.prototype.hasOwnProperty.call(obj, key)) findVideos(obj[key], results);
        }
    }
    return results;
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        const { query, continuation } = req.query;
        const youtube = await getYoutubeClient();

        if (query) {
            const response = await youtube.actions.execute('/search', {
                query: query,
                params: 'EgIQAQ%3D%3D', // Video filter
                parse: false
            });
            const videos = findVideos(response.data || response);
            const token = findToken(response.data || response);
            return res.status(200).json({ video_results: videos, continuation: token });

        } else if (continuation) {
            const response = await youtube.actions.execute('/search', {
                continuation: continuation,
                client: youtube.session.context.client.clientName,
                parse: false
            });
            const videos = findVideos(response.data || response);
            const token = findToken(response.data || response);
            return res.status(200).json({ video_results: videos, continuation: token });
        }

        return res.status(400).json({ error: 'Query or continuation required' });

    } catch (error) {
        console.error('[YT API] ERROR:', error);
        res.status(500).json({ error: 'Failed to search YouTube', message: error.message });
    }
}
