async function run() {
  const videoId = 'kdeXZK5jrqw';
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    const html = await res.text();

    console.log('interactionCount matches:');
    const matches1 = html.match(/itemprop="interactionCount"[^>]+/gi) || [];
    matches1.forEach(m => console.log('  ', m));

    console.log('viewCount matches:');
    const matches2 = html.match(/"viewCount":"(\d+)"/i);
    console.log('  ', matches2 ? matches2[0] : 'NONE');

    console.log('shortViewCount matches:');
    const matches3 = html.match(/"shortViewCount"[^}]+/gi) || [];
    matches3.slice(0, 3).forEach(m => console.log('  ', m));

  } catch (err) {
    console.error(err);
  }
}
run();
