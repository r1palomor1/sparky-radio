import { Innertube } from 'youtubei.js';

// MULTI-STAGE TOKEN HUNTER (Broad + Targeted)
function findToken(obj) {
    if (!obj || typeof obj !== 'object') return null;
    if (obj.continuationCommand?.payload?.token) return obj.continuationCommand.payload.token;
    if (obj.continuation) return obj.continuation;
    if (obj.token && typeof obj.token === 'string' && obj.token.length > 20) return obj.token;
    
    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            const token = findToken(obj[key]);
            if (token) return token;
        }
    }
    return null;
}

// Robust string extractor for raw/parsed YouTube data
function extractString(obj) {
    if (!obj) return '';
    if (typeof obj === 'string') return obj;
    if (obj.simpleText) return obj.simpleText;
    if (Array.isArray(obj.runs)) return obj.runs.map(r => r.text).join('');
    if (obj.text) return obj.text;
    return obj.toString().includes('object Object') ? '' : obj.toString();
}

// Robust thumbnail extractor for raw/parsed YouTube data
function extractThumbnail(obj) {
    if (!obj) return '';
    if (typeof obj === 'string') return obj;
    const thumbs = obj.thumbnails || obj.image?.sources || obj.image?.thumbnails || (Array.isArray(obj) ? obj : []);
    if (Array.isArray(thumbs) && thumbs.length > 0) {
        return thumbs[thumbs.length - 1].url || thumbs[0].url || '';
    }
    return obj.url || '';
}

// Utility to shorten views and published text to minimize UI footprint
function shortenMetadata(text) {
    if (!text) return '';
    let clean = text
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

    if (/^[\d,.]+$/.test(clean)) {
        const num = parseFloat(clean.replace(/,/g, ''));
        if (!isNaN(num)) {
            if (num >= 1000000000) return (num / 1000000000).toFixed(1).replace(/\.0$/, '') + 'B';
            if (num >= 1000000) return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
            if (num >= 1000) return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
            return num.toString();
        }
    }
    return clean;
}

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
        const youtube = await Innertube.create();

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
