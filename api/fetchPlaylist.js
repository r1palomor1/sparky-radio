import { getYoutubeClient } from './youtube.js';
import { findToken, extractString, extractThumbnail, shortenMetadata } from './utils.js';

// Forensic Playlist Hunter
function findPlaylists(obj, results = []) {
    if (!obj || typeof obj !== 'object') return results;

    const isPlaylist = (obj.type === 'Playlist') ||
        (obj.playlistRenderer) ||
        (obj.lockupViewModel?.contentType === 'LOCKUP_CONTENT_TYPE_PLAYLIST') ||
        (typeof obj.playlistId === 'string' && (obj.title || obj.titleText));

    if (isPlaylist) {
        const renderer = obj.playlistRenderer || (obj.type === 'Playlist' ? obj : null);
        const luv = obj.lockupViewModel;

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
        return results;
    }

    if (Array.isArray(obj)) {
        for (const item of obj) findPlaylists(item, results);
    } else {
        for (const key in obj) {
            if (Object.prototype.hasOwnProperty.call(obj, key)) findPlaylists(obj[key], results);
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
                    // getBasicInfo is faster but getInfo is more complete
                    const info = await youtube.getBasicInfo(v.id);
                    const basic = info.basic_info;

                    // Fallbacks for different Innertube versions
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
