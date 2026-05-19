import { getYoutubeClient } from './youtube.js';
import { findToken, extractString, extractThumbnail, shortenMetadata } from './utils.js';

// Structured, flat search video parser (V-D2)
function findVideos(data) {
    const results = [];
    if (!data) return results;

    let items = [];

    // Path A: Standard search results structure
    const sectionListContents = data.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents;
    if (Array.isArray(sectionListContents)) {
        for (const section of sectionListContents) {
            if (section.itemSectionRenderer?.contents) {
                items.push(...section.itemSectionRenderer.contents);
            }
        }
    }

    // Path B: Continuation search results structure
    const continuationItems = data.onResponseReceivedCommands?.[0]?.appendContinuationItemsAction?.continuationItems;
    if (Array.isArray(continuationItems)) {
        items.push(...continuationItems);
    }

    // Path C: Alternative Continuation structure
    const sectionListContinuation = data.continuationContents?.sectionListContinuation?.contents;
    if (Array.isArray(sectionListContinuation)) {
        for (const section of sectionListContinuation) {
            if (section.itemSectionRenderer?.contents) {
                items.push(...section.itemSectionRenderer.contents);
            }
        }
    }

    // Path D: Direct array fallback
    if (items.length === 0 && Array.isArray(data)) {
        items = data;
    }

    // Process top-level items flatly to ignore shelf items and ads
    for (const item of items) {
        if (!item || typeof item !== 'object') continue;

        if (item.videoRenderer) {
            const renderer = item.videoRenderer;
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
        } else if (item.type === 'Video') {
            results.push({
                id: item.id || item.videoId,
                title: extractString(item.title) || 'Unknown Title',
                thumbnail: extractThumbnail(item.thumbnail || item.thumbnails),
                channel: extractString(item.author || item.longBylineText || item.shortBylineText) || 'Unknown Channel',
                duration: extractString(item.duration || item.lengthText) || '',
                views: shortenMetadata(extractString(item.view_count || item.short_view_count || item.viewCountText)),
                published: shortenMetadata(item.published || extractString(item.publishedTimeText)),
                type: 'video'
            });
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
