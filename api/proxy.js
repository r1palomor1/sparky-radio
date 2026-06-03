/**
 * SPARKY RADIO · CORS STREAM PROXY
 * Vercel Serverless Function — /api/proxy?url=<encoded-url>
 *
 * Relays audio streams and HLS playlists server-side, injecting
 * permissive CORS headers so the browser can play streams that
 * would otherwise be blocked by missing Access-Control-Allow-Origin.
 *
 * Supports:
 *  - GET  /api/proxy?url=<encoded>        (stream or playlist relay)
 *  - OPTIONS /api/proxy                   (preflight)
 *
 * Safety guards:
 *  - Rejects private/loopback IPs to prevent SSRF
 *  - 30-second fetch timeout
 *  - 25 MB body cap (prevents runaway memory on large VOD files)
 *  - Passes through Range headers for seekable streams
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Range',
  'Access-Control-Expose-Headers': 'Content-Type, Content-Length, Content-Range, Accept-Ranges',
};

const MAX_BODY_BYTES = 25 * 1024 * 1024; // 25 MB
const FETCH_TIMEOUT_MS = 30_000;

/**
 * Rejects private/loopback addresses to prevent SSRF attacks.
 * @param {string} host
 * @returns {boolean}
 */
function isPrivateOrLoopback(host) {
  const h = host.toLowerCase();
  if (h === 'localhost' || h.endsWith('.localhost')) return true;
  if (h === '0.0.0.0' || h === '::1') return true;
  if (h.startsWith('fe80:') || h.startsWith('fc') || h.startsWith('fd')) return true;

  const ipv4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [a, b] = [parseInt(ipv4[1], 10), parseInt(ipv4[2], 10)];
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 0) return true;
  }

  return false;
}

/**
 * Validates and parses the target URL. Returns null if invalid/blocked.
 * @param {string} input
 * @returns {URL|null}
 */
function safeParseUrl(input) {
  try {
    const u = new URL(input);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    if (isPrivateOrLoopback(u.hostname)) return null;
    return u;
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
    return res.status(204).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));

  const rawTarget = req.query.url || '';
  const parsed = safeParseUrl(rawTarget);

  if (!parsed) {
    return res.status(400).json({ error: 'Invalid or blocked URL' });
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);

  try {
    const upstreamHeaders = {
      'User-Agent': 'Mozilla/5.0 (compatible; SparkyRadio/2.0; +https://sparky-radio.vercel.app)',
      'Accept': '*/*',
    };

    // Pass through Range header for byte-range requests (seekable streams)
    if (req.headers['range']) {
      upstreamHeaders['Range'] = req.headers['range'];
    }

    const upstream = await fetch(parsed.toString(), {
      headers: upstreamHeaders,
      signal: ctrl.signal,
    });

    clearTimeout(timer);

    // Enforce body size cap
    const contentLength = parseInt(upstream.headers.get('content-length') || '0', 10);
    if (contentLength && contentLength > MAX_BODY_BYTES) {
      return res.status(413).json({ error: 'Response too large to proxy' });
    }

    // Forward relevant headers
    const ct = upstream.headers.get('content-type');
    if (ct) res.setHeader('Content-Type', ct);

    const cl = upstream.headers.get('content-length');
    if (cl) res.setHeader('Content-Length', cl);

    const cr = upstream.headers.get('content-range');
    if (cr) res.setHeader('Content-Range', cr);

    const ar = upstream.headers.get('accept-ranges');
    if (ar) res.setHeader('Accept-Ranges', ar);

    res.status(upstream.status);

    // Stream the body back to the client
    const reader = upstream.body?.getReader();
    if (!reader) return res.end();

    let bytesRead = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytesRead += value?.byteLength ?? 0;
      if (bytesRead > MAX_BODY_BYTES) {
        console.warn('[PROXY] Body size cap exceeded mid-stream, closing.');
        reader.cancel();
        break;
      }
      res.write(value);
    }
    res.end();

  } catch (err) {
    clearTimeout(timer);
    const isTimeout = err?.name === 'AbortError';
    console.error('[PROXY ERROR]', isTimeout ? 'Timeout' : err?.message);
    if (!res.headersSent) {
      res.status(isTimeout ? 504 : 502).json({
        error: isTimeout ? 'Upstream timeout' : `Fetch failed: ${err?.message}`,
      });
    } else {
      res.end();
    }
  }
}
