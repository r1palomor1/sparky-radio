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

                // Parse first 3 keywords/tags
                const keywords = Array.isArray(basic?.keywords) ? basic.keywords.slice(0, 3) : [];

                // Fetch related videos (first choice: watch_next_feed, fallback: youtube.search)
                const related_videos = [];
                try {
                    if (info.watch_next_feed && info.watch_next_feed.length > 0) {
                        console.log(`[HYDRATE] Extracting related videos from watch_next_feed for ${videoId}`);
                        for (const item of info.watch_next_feed) {
                            if (item.type !== 'LockupView') continue;
                            
                            const id = item.content_id || item.renderer_context?.command_context?.on_tap?.payload?.videoId;
                            if (!id || id === videoId) continue;
                            
                            // Skip playlist items
                            const viewsText = item.metadata?.metadata?.metadata_rows?.[1]?.metadata_parts?.[0]?.text?.text || '';
                            if (viewsText.toLowerCase().includes('playlist')) continue;
 
                            // Skip Mixes and Playlist items
                            const title = item.metadata?.title?.text || '';
                            if (title.toLowerCase().startsWith('mix - ')) continue;
 
                            const thumb = item.content_image?.image?.[0]?.url || 
                                          item.content_image?.image?.[1]?.url || 
                                          item.content_image?.image?.sources?.[0]?.url ||
                                          item.content_image?.image?.sources?.[1]?.url ||
                                          item.thumbnail?.[0]?.url ||
                                          item.thumbnails?.[0]?.url ||
                                          '';
                            const channel = item.metadata?.metadata?.metadata_rows?.[0]?.metadata_parts?.[0]?.text?.text || '';
                            const duration = item.content_image?.overlays?.[0]?.badges?.[0]?.text || '';
                            
                            related_videos.push({
                                id,
                                title,
                                thumb,
                                channel,
                                views: shortenMetadata(viewsText),
                                duration: shortenMetadata(duration)
                            });
                        }
                    }
                } catch (feedErr) {
                    console.error('[HYDRATE] Watch next feed extraction failed, falling back:', feedErr.message);
                }

                // Fallback to youtube.search if watch next feed returned too few videos
                if (related_videos.length < 3) {
                    try {
                        const videoTitle = basic?.title || 'related';
                        console.log(`[HYDRATE] Fallback: Searching for related videos using: "${videoTitle}"`);
                        const searchResult = await youtube.search(videoTitle, { limit: 15 });
                        const videos = searchResult?.videos || searchResult?.results || [];
                        
                        if (videos.length > 0) {
                            for (const result of videos) {
                                try {
                                    const id = result.id || result.video_id;
                                    if (!id || id === videoId) continue;

                                    const title = result.title?.text || result.title || '';
                                    if (title.toLowerCase().startsWith('mix - ')) continue;
                                    if (title.toLowerCase().includes('playlist')) continue;
                                    
                                    related_videos.push({
                                        id,
                                        title: title || 'Unknown Title',
                                        thumb: result.thumbnails?.[0]?.url || result.thumbnail?.[0]?.url || '',
                                        channel: result.author?.name || result.channel?.name || result.author || '',
                                        views: shortenMetadata(result.short_view_count?.text || result.views || ''),
                                        duration: shortenMetadata(result.length_text?.text || result.duration || '')
                                    });
                                    
                                    if (related_videos.length >= 12) break;
                                } catch (e) {
                                    // Skip malformed result
                                }
                            }
                        }
                    } catch (searchErr) {
                        console.error('[HYDRATE] Fallback search for related videos failed:', searchErr.message);
                    }
                }
                
                console.log(`[HYDRATE] Found ${related_videos.length} related videos`);

                return {
                    id: videoId,
                    views: shortenMetadata(views),
                    published: shortenMetadata(published),
                    related_videos: related_videos,
                    keywords: keywords
                };
            } catch (err) {
                console.error(`[HYDRATE] Failed for ID ${videoId}:`, err.message);
                return {
                    id: videoId,
                    views: '',
                    published: '',
                    related_videos: [],
                    keywords: []
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
