async function run() {
  const videoId = 'kdeXZK5jrqw';
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  console.log('Fetching watch page HTML for:', url);
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });
    if (!res.ok) {
      console.error('HTTP Error:', res.status);
      return;
    }
    const html = await res.text();
    
    // 1. Views
    const viewsRegex = /<meta itemprop="interactionCount" content="(\d+)"/i;
    const viewsMatch = html.match(viewsRegex);
    console.log('Views Match:', viewsMatch ? viewsMatch[1] : 'NOT FOUND');

    // 2. Date Published
    const dateRegex = /<meta itemprop="datePublished" content="([^"]+)"/i;
    const dateMatch = html.match(dateRegex);
    console.log('Date Match:', dateMatch ? dateMatch[1] : 'NOT FOUND');

    // 3. Keywords
    const metaRegex = /<meta name="keywords" content="([^"]+)"/i;
    const metaMatch = html.match(metaRegex);
    console.log('Keywords:', metaMatch ? metaMatch[1] : 'NOT FOUND');

    // 4. Video Title
    const titleRegex = /<meta name="title" content="([^"]+)"/i;
    const titleMatch = html.match(titleRegex);
    console.log('Title:', titleMatch ? titleMatch[1] : 'NOT FOUND');

  } catch (err) {
    console.error('Fetch failed:', err.message);
  }
}

run();
