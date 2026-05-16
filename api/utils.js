/**
 * Shared utilities for YouTube API handlers
 */

// MULTI-STAGE TOKEN HUNTER (Broad + Targeted)
export function findToken(obj) {
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
export function extractString(obj) {
    if (!obj) return '';
    if (typeof obj === 'string') return obj;
    if (obj.simpleText) return obj.simpleText;
    if (Array.isArray(obj.runs)) return obj.runs.map(r => r.text).join('');
    if (obj.text) return obj.text;
    if (obj.content) return obj.content;
    return obj.toString().includes('object Object') ? '' : obj.toString();
}

// Robust thumbnail extractor for raw/parsed YouTube data
export function extractThumbnail(obj) {
    if (!obj) return '';
    if (typeof obj === 'string') return obj;
    const thumbs = obj.thumbnails || obj.image?.sources || obj.image?.thumbnails || (Array.isArray(obj) ? obj : []);
    if (Array.isArray(thumbs) && thumbs.length > 0) {
        return thumbs[thumbs.length - 1].url || thumbs[0].url || '';
    }
    return obj.url || '';
}

// Utility to shorten views and published text to minimize UI footprint
export function shortenMetadata(text) {
    if (!text) return '';
    let clean = text.toString()
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

    // Handle raw numbers (Views)
    const rawNum = clean.replace(/,/g, '');
    if (/^[\d.]+$/.test(rawNum)) {
        const num = parseFloat(rawNum);
        if (!isNaN(num)) {
            if (num >= 1000000000) return (num / 1000000000).toFixed(1).replace(/\.0$/, '') + 'B';
            if (num >= 1000000) return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
            if (num >= 1000) return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
            return num.toString();
        }
    }
    return clean;
}

/**
 * Converts an absolute ISO date string (e.g. "2023-05-14") to a
 * relative timeframe string (e.g. "2 y", "3 mo", "5 d").
 */
export function absoluteToRelative(isoDateStr) {
    if (!isoDateStr) return '';
    try {
        const then = new Date(isoDateStr);
        const now = new Date();
        const diffMs = now - then;
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        if (diffDays < 1)   return 'today';
        if (diffDays < 7)   return `${diffDays} d`;
        if (diffDays < 30)  return `${Math.floor(diffDays / 7)} w`;
        if (diffDays < 365) return `${Math.floor(diffDays / 30)} mo`;
        return `${Math.floor(diffDays / 365)} y`;
    } catch (e) {
        return '';
    }
}
