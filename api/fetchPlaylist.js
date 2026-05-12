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
    if (obj.content) return obj.content;
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

// Utility to shorten views and published text
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
        const youtube = await Innertube.create();

        if (id) {
            const playlist = await youtube.getPlaylist(id);
            const videos = playlist.videos.map(v => ({
                id: v.id,
                title: extractString(v.title),
                thumbnail: extractThumbnail(v.thumbnails || v.thumbnail),
                channel: extractString(v.author) || playlist.info?.title || 'Unknown',
                duration: extractString(v.duration) || '',
                views: shortenMetadata(extractString(v.view_count)),
                published: shortenMetadata(extractString(v.published)),
                type: 'video'
            }));
            return res.status(200).json({ title: extractString(playlist.info?.title) || 'Playlist', videos: videos });

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
