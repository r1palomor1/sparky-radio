const ids = [
  '4X4uckVyk9o',
  'KU5V5WZVcVE',
  'dsLjyLn859g',
  '-tiH5wOAa9I',
  '-NW55ocDPqg'
];

async function parseVideo(videoId) {
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    if (!res.ok) return { error: `HTTP ${res.status}` };
    const html = await res.text();

    // Parse Keywords
    const metaRegex = /<meta name="keywords" content="([^"]+)"/i;
    const metaMatch = html.match(metaRegex);
    const keywords = metaMatch ? metaMatch[1].split(',').map(s => s.trim()).filter(Boolean) : [];

    // Parse Views
    const viewsRegex = /"viewCount":"(\d+)"/i;
    const viewsMatch = html.match(viewsRegex);
    const views = viewsMatch ? viewsMatch[1] : '';

    // Parse Relative Date
    const relDateRegex = /"relativeDateText"\s*:\s*\{\s*"simpleText"\s*:\s*"([^"]+)"/i;
    const relDateMatch = html.match(relDateRegex);
    const published = relDateMatch ? relDateMatch[1] : '';

    // Parse Title
    const titleRegex = /<meta name="title" content="([^"]+)"/i;
    const titleMatch = html.match(titleRegex);
    const title = titleMatch ? titleMatch[1] : '';

    return { id: videoId, title, keywords, views, published };
  } catch (err) {
    return { error: err.message };
  }
}

async function test() {
  console.log('Testing HTML Regex Parser on 5 failed Vercel IDs...');
  for (const id of ids) {
    const data = await parseVideo(id);
    console.log(`\nID: ${id}`);
    if (data.error) {
      console.log('  Error:', data.error);
    } else {
      console.log('  Title:', data.title);
      console.log('  Keywords:', data.keywords);
      console.log('  Views:', data.views);
      console.log('  Published:', data.published);
    }
  }
}

test();
