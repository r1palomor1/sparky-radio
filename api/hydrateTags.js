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

        // 1. Blazing fast, Vercel-friendly public watch page HTML scraper
        async function scrapeWatchPage(videoId) {
            try {
                const url = `https://www.youtube.com/watch?v=${videoId}`;
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 6000);
                let res;
                try {
                    res = await fetch(url, {
                        signal: controller.signal,
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                            'Accept-Language': 'en-US,en;q=0.9'
                        }
                    });
                } finally {
                    clearTimeout(timeoutId);
                }
                if (!res || !res.ok) return null;
                const html = await res.text();

                // Extract Keywords
                const metaRegex = /<meta name="keywords" content="([^"]+)"/i;
                const metaMatch = html.match(metaRegex);
                let keywords = [];
                if (metaMatch) {
                    keywords = metaMatch[1].split(',').map(s => s.trim()).filter(Boolean);
                }

                // Extract Views
                const viewsRegex = /"viewCount":"(\d+)"/i;
                const viewsMatch = html.match(viewsRegex);
                let views = viewsMatch ? viewsMatch[1] : '';

                // Extract Published Date
                const relDateRegex = /"relativeDateText"\s*:\s*\{\s*"simpleText"\s*:\s*"([^"]+)"/i;
                const relDateMatch = html.match(relDateRegex);
                let published = relDateMatch ? relDateMatch[1] : '';

                if (!published) {
                    const dateRegex = /<meta itemprop="datePublished" content="([^"]+)"/i;
                    const dateMatch = html.match(dateRegex);
                    if (dateMatch) published = dateMatch[1];
                }

                const titleRegex = /<meta name="title" content="([^"]+)"/i;
                const titleMatch = html.match(titleRegex);
                const title = titleMatch ? titleMatch[1] : '';

                if (keywords.length > 0 || views) {
                    console.log(`[SCRAPER] Successfully resolved metadata for ID: ${videoId} using ultra-fast HTML parser`);
                    return {
                        id: videoId,
                        title: title,
                        views: shortenMetadata(views),
                        published: shortenMetadata(published),
                        keywords: keywords,
                        related_videos: []
                    };
                }
                return null;
            } catch (err) {
                console.error(`[SCRAPER] HTML parser error for ID ${videoId}:`, err.message);
                return null;
            }
        }

        // Helper function to hydrate a single video
        async function fetchSingleInfo(videoId) {
            // First Path: Ultra-fast HTML GET parser (No files written, 200ms, never blocks on Vercel)
            const scraped = await scrapeWatchPage(videoId);
            if (scraped) {
                // If it is single view (not batch) and related videos are needed, fetch them via simple fallback search
                if (!ids) {
                    try {
                        const youtube = await getYoutubeClient();
                        const videoTitle = scraped.title || 'related';
                        console.log(`[HYDRATE] Fetching related videos for single view using fallback search`);
                        const searchResult = await youtube.search(videoTitle, { limit: 12 });
                        const videos = searchResult?.videos || searchResult?.results || [];
                        videos.forEach(result => {
                            const rId = result.id || result.video_id;
                            if (rId && rId !== videoId) {
                                scraped.related_videos.push({
                                    id: rId,
                                    title: result.title?.text || result.title || 'Unknown Title',
                                    thumb: result.thumbnails?.[0]?.url || '',
                                    channel: result.author?.name || '',
                                    views: shortenMetadata(result.short_view_count?.text || ''),
                                    duration: shortenMetadata(result.length_text?.text || '')
                                });
                            }
                        });
                    } catch (e) {
                        // Keep empty related videos on fallback failure
                    }
                }
                return scraped;
            }

            // Second Path: Heavy youtubei.js engine (Fallback for local dev or detailed info)
            try {
                const youtube = await getYoutubeClient();
                const info = await youtube.getInfo(videoId);
                const basic = info.basic_info;
                const views = basic?.view_count?.toString() || '';

                let published =
                    info.primary_info?.relative_date?.text ||
                    info.primary_info?.published?.text ||
                    '';

                if (!published) {
                    const mf = info.microformat?.microformat_data_renderer ||
                               info.microformat?.playerMicroformatRenderer ||
                               info.microformat;
                    const rawDate = mf?.publish_date || mf?.publishDate || mf?.upload_date || mf?.uploadDate || '';
                    if (rawDate) {
                        published = absoluteToRelative(rawDate);
                    }
                }

                if (!published && basic?.published) {
                    published = basic.published;
                }

                const keywords = Array.isArray(basic?.keywords) ? basic.keywords : [];
                const related_videos = [];
                
                try {
                    if (info.watch_next_feed && info.watch_next_feed.length > 0) {
                        for (const item of info.watch_next_feed) {
                            if (item.type !== 'LockupView') continue;
                            
                            const id = item.content_id || item.renderer_context?.command_context?.on_tap?.payload?.videoId;
                            if (!id || id === videoId) continue;
                            
                            const viewsText = item.metadata?.metadata?.metadata_rows?.[1]?.metadata_parts?.[0]?.text?.text || '';
                            if (viewsText.toLowerCase().includes('playlist')) continue;
         
                            const title = item.metadata?.title?.text || '';
                            if (title.toLowerCase().startsWith('mix - ')) continue;
         
                            const thumb = item.content_image?.image?.[0]?.url || 
                                          item.content_image?.image?.[1]?.url || 
                                          item.content_image?.image?.sources?.[0]?.url ||
                                          item.thumbnail?.[0]?.url ||
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
                    console.error('[HYDRATE] Watch next feed extraction failed:', feedErr.message);
                }

                if (related_videos.length < 3) {
                    try {
                        const videoTitle = basic?.title || 'related';
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
                                        thumb: result.thumbnails?.[0]?.url || '',
                                        channel: result.author?.name || '',
                                        views: shortenMetadata(result.short_view_count?.text || ''),
                                        duration: shortenMetadata(result.length_text?.text || '')
                                    });
                                    
                                    if (related_videos.length >= 12) break;
                                } catch (e) {
                                    // Ignore malformed search item
                                }
                            }
                        }
                    } catch (searchErr) {
                        console.error('[HYDRATE] Fallback search failed:', searchErr.message);
                    }
                }
                
                return {
                    id: videoId,
                    views: shortenMetadata(views),
                    published: shortenMetadata(published),
                    related_videos: related_videos,
                    keywords: keywords
                };
            } catch (err) {
                console.error(`[HYDRATE] Heavy fallback failed for ID ${videoId}:`, err.message);
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

            console.log(`[HYDRATE] Batch hydrating ${idList.length} video IDs (sequential with timeout guards)`);
            // Process sequentially instead of parallel to avoid hammering YouTube's rate limiter
            // on Vercel serverless where all requests originate from similar IPs
            const results = [];
            for (const videoId of idList) {
                const result = await fetchSingleInfo(videoId);
                results.push(result);
            }
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
