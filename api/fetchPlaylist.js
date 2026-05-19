import { getYoutubeClient } from './youtube.js';
import { findToken, extractString, extractThumbnail, shortenMetadata } from './utils.js';

// Structured, flat playlist search parser (V-D2)
function findPlaylists(data) {
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

        const isPlaylist = (item.type === 'Playlist') ||
            (item.playlistRenderer) ||
            (item.lockupViewModel?.contentType === 'LOCKUP_CONTENT_TYPE_PLAYLIST') ||
            (typeof item.playlistId === 'string' && (item.title || item.titleText));

        if (isPlaylist) {
            const renderer = item.playlistRenderer || (item.type === 'Playlist' ? item : null);
            const luv = item.lockupViewModel;

            if (renderer) {
                results.push({
                    playlist_id: renderer.playlistId || renderer.id,
                    title: extractString(renderer.title) || 'Unknown Playlist',
                    thumbnail: extractThumbnail(renderer.thumbnail || renderer.thumbnails),
                    video_count: extractString(renderer.video_count || renderer.videoCountText) || 'N/A',
                    type: 'playlist'
                });
            } else if (luv) {
                let vCount = 'N/A';
                const overlays = luv.contentImage?.collectionThumbnailViewModel?.primaryThumbnail?.thumbnailViewModel?.overlays ||
                    luv.contentImage?.thumbnailViewModel?.overlays;

                if (Array.isArray(overlays)) {
                    for (const o of overlays) {
                        const badge = o.thumbnailOverlayBadgeViewModel?.thumbnailBadges?.[0]?.thumbnailBadgeViewModel ||
                            o.thumbnailBadgeViewModel;
                        if (badge?.text && (badge.text.toLowerCase().includes('video') || /\d+/.test(badge.text))) {
                            vCount = badge.text;
                            break;
                        }
                    }
                }

                if (vCount === 'N/A') {
                    const lines = luv.metadata?.lockupMetadataViewModel?.metadataLines;
                    if (lines) {
                        for (const line of lines) {
                            const content = line.contentMetadataViewModel?.metadata?.[0]?.content;
                            if (content && (content.toLowerCase().includes('video') || /\d+/.test(content))) {
                                vCount = content;
                                break;
                            }
                        }
                    }
                }

                results.push({
                    playlist_id: luv.contentId,
                    title: extractString(luv.metadata?.lockupMetadataViewModel?.title) || 'Unknown Playlist',
                    thumbnail: extractThumbnail(luv.contentImage?.collectionThumbnailViewModel?.primaryThumbnail?.thumbnailViewModel || luv.contentImage?.thumbnailViewModel),
                    video_count: vCount,
                    type: 'playlist'
                });
            }
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
        const { id, query, continuation } = req.query;
        const youtube = await getYoutubeClient();

        if (id) {
            const playlist = await youtube.getPlaylist(id);
            const rawVideos = playlist.videos.map(v => {
                const author = v.author?.name || v.author || '';
                return {
                    id: v.id,
                    title: extractString(v.title),
                    thumbnail: extractThumbnail(v.thumbnails || v.thumbnail),
                    channel: extractString(author) || playlist.info?.title || 'Unknown',
                    duration: extractString(v.duration?.text || v.duration) || '',
                    views: '', // Initially empty, will be hydrated
                    published: '',
                    type: 'video'
                };
            });

            console.log(`[YT] Hydrating metadata for playlist: ${id} (${rawVideos.length} videos)`);

            // HYDRATION ENGINE: High-speed parallel fetch for the first 20 items
            const hydrationPool = rawVideos.slice(0, 20);
            const hydratedVideos = await Promise.all(hydrationPool.map(async (v) => {
                try {
                    const info = await youtube.getBasicInfo(v.id);
                    const basic = info.basic_info;

                    const viewsStr = basic.view_count?.toString() || '';
                    const dateStr = info.primary_info?.relative_date?.text || 
                                     info.primary_info?.published?.text || 
                                     info.basic_info?.published || 
                                     '';

                    return {
                        ...v,
                        views: shortenMetadata(viewsStr),
                        published: shortenMetadata(dateStr)
                    };
                } catch (e) {
                    return v;
                }
            }));

            const finalVideos = [...hydratedVideos, ...rawVideos.slice(20)];
            console.log(`[YT] Hydration complete for ${hydratedVideos.length} videos.`);

            return res.status(200).json({
                title: extractString(playlist.info?.title) || 'Playlist',
                videos: finalVideos
            });

        } else if (query) {
            const response = await youtube.actions.execute('/search', { query, params: 'EgIQAw%3D%3D', parse: false });
            const playlists = findPlaylists(response.data || response);
            const token = findToken(response.data || response);
            return res.status(200).json({ playlist_results: playlists, continuation: token });

        } else if (continuation) {
            const response = await youtube.actions.execute('/search', {
                continuation: continuation,
                client: youtube.session.context.client.clientName,
                parse: false
            });
            const playlists = findPlaylists(response.data || response);
            const token = findToken(response.data || response);
            return res.status(200).json({ playlist_results: playlists, continuation: token });
        }

        return res.status(400).json({ error: 'Query, ID or continuation required' });

    } catch (error) {
        console.error('[YT API] ERROR:', error);
        res.status(500).json({ error: 'Failed to process YouTube request', message: error.message });
    }
}
