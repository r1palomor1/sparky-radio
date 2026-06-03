import { getYoutubeClient } from './youtube.js';
import { shortenMetadata, absoluteToRelative } from './utils.js';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        const { id, ids, payload, title: queryTitle } = req.query;
        if (!id && !ids && !payload) return res.status(400).json({ error: 'ID, IDs or payload required' });

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

                // GENERIC BOT-GATE FINGERPRINT: YouTube serves a consent/bot-detection page to
                // datacenter IPs (like Vercel) whose meta keywords are always these exact 6 tokens.
                // Detect this and fall through to the ytInitialData JSON path instead.
                const BOT_GATE_KEYWORDS = new Set(['video', 'sharing', 'camera phone', 'video phone', 'free', 'upload']);
                const metaRegex = /<meta name="keywords" content="([^"]+)"/i;
                const metaMatch = html.match(metaRegex);
                let metaKeywords = [];
                if (metaMatch) {
                    metaKeywords = metaMatch[1].split(',').map(s => s.trim()).filter(Boolean);
                }

                // Check if this is the generic bot-gate page (all keywords are in the fingerprint set)
                const isGenericPage = metaKeywords.length > 0 &&
                    metaKeywords.every(k => BOT_GATE_KEYWORDS.has(k.toLowerCase()));

                // PATH A: Use meta keywords only if they are real/specific (not the bot-gate set)
                let keywords = isGenericPage ? [] : metaKeywords;

                // PATH B: Extract from ytInitialData JSON blob — richer, survives bot-gating
                // YouTube embeds a "keywords":[...] array in the page's inline JSON even on gated pages
                if (keywords.length === 0) {
                    const ytDataMatch = html.match(/"keywords"\s*:\s*\[([^\]]+)\]/);
                    if (ytDataMatch) {
                        try {
                            const rawArr = JSON.parse(`[${ytDataMatch[1]}]`);
                            keywords = rawArr.filter(k => typeof k === 'string' && k.trim().length > 0);
                            if (keywords.length > 0) {
                                console.log(`[SCRAPER] ytInitialData keyword extraction succeeded for ID: ${videoId} (${keywords.length} keywords)`);
                            }
                        } catch (parseErr) {
                            // JSON parse failed — try regex extraction of quoted strings
                            const pieces = ytDataMatch[1].match(/"([^"]+)"/g) || [];
                            keywords = pieces.map(p => p.replace(/^"|"$/g, '').trim()).filter(Boolean);
                        }
                    }
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
                    console.log(`[SCRAPER] Resolved metadata for ID: ${videoId} | keywords: ${keywords.length} | bot-gated: ${isGenericPage}`);
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

        // Clean title search terms for iTunes and MusicBrainz
        function cleanSearchQuery(title) {
            if (!title) return '';
            let query = title;
            // Replace dash or pipe with space to separate artist and track clearly
            query = query.replace(/[\-\|]/g, ' ');
            // Remove brackets/parentheses and everything inside them
            query = query.replace(/\([^)]*\)/g, '');
            // Remove brackets
            query = query.replace(/\[[^\]]*\]/g, '');
            // Remove common YouTube fluff
            query = query.replace(/\b(feat|ft|official|video|audio|lyrics|hd|4k|music video|lyric video|mixed|mix)\b.*/gi, '');
            // Replace non-alphanumeric with spaces, collapse spaces
            query = query.replace(/[^a-zA-Z0-9\s']/g, ' ');
            query = query.replace(/\s+/g, ' ').trim();
            return query;
        }

        // Fetch genres from iTunes (primary) or MusicBrainz (fallback)
        async function fetchGenreFromApis(title) {
            if (!title) return [];
            
            // Path A: iTunes Search API (100% free, fast, datacenter-friendly)
            try {
                const cleaned = cleanSearchQuery(title);
                if (cleaned) {
                    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(cleaned)}&entity=song&limit=1`;
                    const itunesRes = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
                    if (itunesRes.ok) {
                        const data = await itunesRes.json();
                        if (data.results && data.results.length > 0) {
                            const genre = data.results[0].primaryGenreName;
                            if (genre) {
                                console.log(`[HYDRATE-GENRE] iTunes hit for "${title}": ${genre}`);
                                return [genre];
                            }
                        }
                    }
                }
            } catch (err) {
                console.error('[HYDRATE-GENRE] iTunes API error:', err.message);
            }

            // Path B: MusicBrainz fallback (extremely reliable database open by design)
            try {
                const cleaned = cleanSearchQuery(title);
                if (cleaned) {
                    const url = `https://musicbrainz.org/ws/2/recording/?query=${encodeURIComponent(cleaned)}&fmt=json`;
                    const mbRes = await fetch(url, { 
                        headers: { 'User-Agent': 'SparkyRadio/2.3 ( palomor1@gmail.com )' }
                    });
                    if (mbRes.ok) {
                        const data = await mbRes.json();
                        if (data.recordings && data.recordings.length > 0) {
                            const rec = data.recordings[0];
                            const tags = (rec.tags || []).map(t => t.name).filter(Boolean);
                            if (tags.length > 0) {
                                console.log(`[HYDRATE-GENRE] MusicBrainz hit for "${title}": ${tags.join(', ')}`);
                                return tags;
                            }
                        }
                    }
                }
            } catch (err) {
                console.error('[HYDRATE-GENRE] MusicBrainz API error:', err.message);
            }
            
            return [];
        }

        // Helper function to hydrate a single video
        async function fetchSingleInfo(videoId, videoTitle) {
            // First Path: Ultra-fast HTML GET parser (No files written, 200ms, never blocks on Vercel)
            let scraped = await scrapeWatchPage(videoId);
            if (!scraped) {
                scraped = {
                    id: videoId,
                    title: videoTitle || '',
                    views: '',
                    published: '',
                    keywords: [],
                    related_videos: []
                };
            }

            // Always look up iTunes/MusicBrainz genre using title
            const finalTitle = videoTitle || scraped.title;
            if (finalTitle) {
                const apiGenres = await fetchGenreFromApis(finalTitle);
                if (apiGenres.length > 0) {
                    // Merge YouTube scraped keywords and iTunes/MusicBrainz API genres
                    scraped.keywords = [...new Set([...(scraped.keywords || []), ...apiGenres])];
                }
            }

            // If it is single view (not batch) and related videos are needed, fetch them via simple fallback search
            if (!ids && !payload) {
                // Use frontend-provided title first (most reliable — not affected by bot-gating),
                // then fall back to scraped title. NEVER use a generic fallback like 'related'.
                const searchTitle = (queryTitle && queryTitle.trim().length >= 3 ? queryTitle.trim() : null)
                    || (scraped.title && scraped.title.trim().length >= 3 ? scraped.title.trim() : null);

                if (!searchTitle) {
                    console.warn(`[HYDRATE] No valid title available for related search on ID: ${videoId}. Skipping to avoid junk results.`);
                    // Return empty related_videos — better than poisoning the panel
                } else {
                    try {
                        const youtube = await getYoutubeClient();
                        console.log(`[HYDRATE] Fetching related videos for single view using fallback search: "${searchTitle}"`);
                        const searchResult = await youtube.search(searchTitle, { limit: 12 });
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
            }
            
            return scraped;
        }

        // Process request variables: support payload array (V-E4) or traditional ids/id GET fields
        let itemsToProcess = [];
        if (payload) {
            try {
                itemsToProcess = JSON.parse(payload);
            } catch (e) {
                console.error('[HYDRATE] Failed to parse payload JSON:', e.message);
            }
        }
        
        if (itemsToProcess.length === 0) {
            if (id) {
                itemsToProcess.push({ id });
            } else if (ids) {
                const idList = ids.split(',').map(s => s.trim()).filter(Boolean);
                idList.forEach(idVal => {
                    itemsToProcess.push({ id: idVal });
                });
            }
        }

        if (itemsToProcess.length === 0) {
            return res.status(400).json({ error: 'Valid ID, IDs, or payload required' });
        }

        if (itemsToProcess.length > 1) {
            console.log(`[HYDRATE] Batch hydrating ${itemsToProcess.length} videos (sequential with timeout guards)`);
            const results = [];
            for (const item of itemsToProcess) {
                const result = await fetchSingleInfo(item.id, item.title);
                results.push(result);
            }
            return res.status(200).json({ results });
        } else {
            const singleItem = itemsToProcess[0];
            // Prefer the payload's embedded title, then fall back to the ?title= query param
            const resolvedTitle = singleItem.title || queryTitle || null;
            console.log(`[HYDRATE] Single hydration for ID: ${singleItem.id} | Title: ${resolvedTitle || 'none'}`);
            const result = await fetchSingleInfo(singleItem.id, resolvedTitle);
            return res.status(200).json(result);
        }

    } catch (error) {
        console.error('[HYDRATE] Data Recovery Failed:', error.message);
        res.status(500).json({ error: 'Hydration failed' });
    }
}
