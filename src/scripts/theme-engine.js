/**
 * SPARKY RADIO · THEME ENGINE v2.8
 * Dynamic Palette Generation with "Chassis Flood" Logic
 */

const rabbitTheme = {
    name: 'Rabbit',
    dark: {
        '--bg': '#0a0c12',
        '--bg-gradient': 'radial-gradient(circle at top center, #0f172a 0%, #0a0c12 100%)',
        '--panel': '#061021',
        '--panel2': '#1e2633',
        '--border': 'rgba(255, 255, 255, 0.05)',
        '--accent': '#ff7043',
        '--accent2': '#f85149',
        '--green': '#ff7043',
        '--fav': '#e3b341',
        '--text': '#f0f6fc',
        '--dim': '#8b949e',
        '--subdim': '#161c26',
        '--viz-bg': '#05070a',
        '--np-bg': '#161c26',
        '--ctrl-bg': '#05070a',
        '--pl-bg': '#0a0c12',
        '--pl-hover': '#1b232e',
        '--pl-active': 'rgba(255, 112, 67, 0.25)',
        '--pl-footer': '#05070a',
        '--seek-bg': '#2d333b',
        '--tab-bg': '#05070a',
        '--tab-active': '#161c26',
        '--grid-line': '#1e2633',
        '--btn-text': '#FFFFFF'
    },
    light: {
        '--bg': '#fdfbf7',
        '--bg-gradient': 'radial-gradient(circle at top center, #ffffff 0%, #fdfbf7 100%)',
        '--panel': '#f5f0e8',
        '--panel2': '#ece5d8',
        '--border': '#dcd4c6',
        '--accent': '#1a5c4d',
        '--accent2': '#c0392b',
        '--green': '#1a5c4d',
        '--fav': '#d4843a',
        '--text': '#1a1d23',
        '--dim': '#4a4f5a',
        '--subdim': '#e2d9c8',
        '--viz-bg': '#ece5d8',
        '--np-bg': '#f0eae0',
        '--ctrl-bg': '#f5f0e8',
        '--pl-bg': '#fdfbf7',
        '--pl-hover': '#f0eae0',
        '--pl-active': 'rgba(26, 92, 77, 0.25)',
        '--pl-footer': '#f5f0e8',
        '--seek-bg': '#dcd4c6',
        '--tab-bg': '#ece5d8',
        '--tab-active': '#fdfbf7',
        '--grid-line': '#dcd4c6',
        '--btn-text': '#FFFFFF'
    }
};

const sparkyTheme = {
    name: 'Sparky',
    dark: {
        '--bg': '#0a0c12',
        '--bg-gradient': 'radial-gradient(circle at top center, #0f172a 0%, #0a0c12 100%)',
        '--panel': '#061021',
        '--panel2': '#1e2633',
        '--border': 'rgba(255, 255, 255, 0.05)',
        '--accent': '#00f2ff',
        '--accent2': '#f85149',
        '--green': '#4fd1c5',
        '--fav': '#e3b341',
        '--text': '#f0f6fc',
        '--dim': '#8b949e',
        '--subdim': '#161c26',
        '--viz-bg': '#05070a',
        '--np-bg': '#161c26',
        '--ctrl-bg': '#05070a',
        '--pl-bg': '#0a0c12',
        '--pl-hover': '#1b232e',
        '--pl-active': 'rgba(0, 242, 255, 0.25)',
        '--pl-footer': '#05070a',
        '--seek-bg': '#2d333b',
        '--tab-bg': '#05070a',
        '--tab-active': '#161c26',
        '--grid-line': '#1e2633',
        '--btn-text': '#000000'
    },
    light: {
        '--bg': '#f0faff',
        '--bg-gradient': 'radial-gradient(circle at top center, #ffffff 0%, #f0faff 100%)',
        '--panel': '#e6f3ff',
        '--panel2': '#d9edff',
        '--border': '#b8d9f5',
        '--accent': '#00707a',
        '--accent2': '#c0392b',
        '--green': '#00707a',
        '--fav': '#d4843a',
        '--text': '#1a1d23',
        '--dim': '#4a4f5a',
        '--subdim': '#d9edff',
        '--viz-bg': '#d9edff',
        '--np-bg': '#e6f3ff',
        '--ctrl-bg': '#e6f3ff',
        '--pl-bg': '#f0faff',
        '--pl-hover': '#d9edff',
        '--pl-active': 'rgba(0, 112, 122, 0.25)',
        '--pl-footer': '#e6f3ff',
        '--seek-bg': '#b8d9f5',
        '--tab-bg': '#d9edff',
        '--tab-active': '#f0faff',
        '--grid-line': '#b8d9f5',
        '--btn-text': '#FFFFFF'
    }
};

function colorNameToRgb(name) {
    if (!name) return [0, 242, 255];
    const s = name.trim();
    const hexMatch = s.match(/^#?([a-f\d]{6}|[a-f\d]{3})$/i);
    if (hexMatch) {
        let hex = hexMatch[1];
        if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
        const bigint = parseInt(hex, 16);
        return [(bigint >> 16) & 255, (bigint >> 8) & 255, bigint & 255];
    }
    const el = document.createElement('div');
    el.style.color = 'rgb(1, 2, 3)';
    try {
        document.body.appendChild(el);
        el.style.color = s;
        const comp = window.getComputedStyle(el).color;
        if (comp === 'rgb(1, 2, 3)' || comp === 'transparent' || !comp) return [0, 242, 255];
        const parts = comp.match(/\d+/g);
        return parts ? parts.slice(0, 3).map(Number) : [0, 242, 255];
    } finally {
        if (el.parentNode) el.parentNode.removeChild(el);
    }
}

function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;
    if (max === min) { h = s = 0; } else {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }
    return [h, s, l];
}

function hslToRgb(h, s, l) {
    const hue2rgb = (p, q, t) => {
        if (t < 0) t += 1; if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
    };
    if (s === 0) {
        const v = Math.round(l * 255);
        return `rgb(${v}, ${v}, ${v})`;
    }
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const r = hue2rgb(p, q, h + 1 / 3);
    const g = hue2rgb(p, q, h);
    const b = hue2rgb(p, q, h - 1 / 3);
    return `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
}

function applyModifierToHsl([h, s, l], modifier) {
    const modifiers = {
        vibrant:    [0,    1.8,  1.0],
        bold:       [0,    2.0,  1.15],
        pastel:     [0,    0.5,  1.35],
        muted:      [0,    0.2,  0.8],
        neon:       [0,    2.5,  1.2],
        glow:       [0,    2.0,  1.3],
        metallic:   [-5,   0.15, 0.7],
        vintage:    [35,   0.4,  1.2],
        invert:     [180,  1.0,  1.0],
        darker:     [0,    1.0,  0.4],
        lighter:    [0,    1.0,  1.6],
        warm:       [30,   1.2,  1.0],
        cool:       [-30,  1.2,  1.0],
        monochrome: [0,    0,    1.0],
    };
    const mod = modifiers[modifier ? modifier.toLowerCase() : 'none'];
    if (!mod) return [h, s, l];
    let [hDelta, sMult, lMult] = mod;
    let newH = (h * 360 + hDelta) / 360;
    newH = (newH % 1 + 1) % 1;
    let newS = Math.max(0, Math.min(1, s * sMult));
    let newL = Math.max(0.05, Math.min(0.95, l * lMult));

    if (modifier && modifier.toLowerCase() === 'bold') {
        newL = Math.max(0.45, Math.min(0.6, newL));
    }
    return [newH, newS, newL];
}

function generatePaletteFromRgb(rgb, mode = 'dark', modifier = null, manualHsl = null, isSignatureMode = false) {
    const [r, g, b] = rgb || [0, 242, 255];
    let [h, s, l] = rgbToHsl(r, g, b);

    if (modifier) {
        [h, s, l] = applyModifierToHsl([h, s, l], modifier);
    }

    let tunedH = h, tunedS = s, tunedL = l;
    if (manualHsl) {
        if (manualHsl.h !== undefined) tunedH = manualHsl.h / 360;
        if (manualHsl.s !== undefined) tunedS = manualHsl.s / 100;
        if (manualHsl.l !== undefined) tunedL = manualHsl.l / 100;
    }

    // --- CHASSIS FLOOD LOGIC ---
    const chassisSat = Math.min(0.5, tunedS * 0.6); 
    const chassisLight = mode === 'dark' 
        ? Math.max(0.02, tunedL * 0.15) 
        : Math.min(0.98, 0.8 + (tunedL * 0.18)); 

    let bgHsl = [tunedH, chassisSat, chassisLight];
    let bgRgb = colorNameToRgb(hslToRgb(...bgHsl));

    // Ensure Background is actually Dark or Light enough for text
    if (mode === 'dark') {
        while (getContrast([255, 255, 255], bgRgb) < 7 && bgHsl[2] > 0.02) {
            bgHsl[2] -= 0.01;
            bgRgb = colorNameToRgb(hslToRgb(...bgHsl));
        }
    } else {
        while (getContrast([0, 0, 0], bgRgb) < 7 && bgHsl[2] < 0.98) {
            bgHsl[2] += 0.01;
            bgRgb = colorNameToRgb(hslToRgb(...bgHsl));
        }
    }

    // --- ACCENT ECOSYSTEM ---
    let primaryHsl = [tunedH, Math.max(tunedS, 0.7), tunedL];
    let primaryRgb = colorNameToRgb(hslToRgb(...primaryHsl));
    
    const ACCENT_CONTRAST_RATIO = 2.0;
    while (getContrast(primaryRgb, bgRgb) < ACCENT_CONTRAST_RATIO && primaryHsl[2] < 0.9 && primaryHsl[2] > 0.1) {
        primaryHsl[2] += (mode === 'dark' ? 0.05 : -0.05);
        primaryRgb = colorNameToRgb(hslToRgb(...primaryHsl));
    }
    const primaryColor = hslToRgb(...primaryHsl);
    const primaryRgbStr = primaryRgb.join(',');

    const fontHsl = [tunedH, chassisSat * 0.2, mode === 'light' ? 0.05 : 0.95];
    const buttonTextColor = getContrast(primaryRgb, [255, 255, 255]) > getContrast(primaryRgb, [0, 0, 0]) ? '#FFFFFF' : '#000000';
    
    const favHue = 50 / 360; 
    const favoriteColor = hslToRgb(favHue, 0.8, 0.6);
    const favoriteRgb = colorNameToRgb(favoriteColor);
    
    const bgStr = hslToRgb(...bgHsl);
    const [bgR, bgG, bgB] = bgRgb;
    const gradientTop = `rgb(${Math.min(255, bgR + 10)}, ${Math.min(255, bgG + 10)}, ${Math.min(255, bgB + 15)})`;

    let palette = {
        '--bg': bgStr,
        '--bg-gradient': `radial-gradient(circle at top center, ${gradientTop} 0%, ${bgStr} 100%)`,
        '--panel': hslToRgb(tunedH, chassisSat * 1.2, bgHsl[2] + (mode === 'dark' ? 0.05 : -0.05)),
        '--panel2': hslToRgb(tunedH, chassisSat * 1.4, bgHsl[2] + (mode === 'dark' ? 0.08 : -0.08)),
        '--border': hslToRgb(tunedH, chassisSat * 1.6, bgHsl[2] + (mode === 'dark' ? 0.12 : -0.12)),
        '--accent': primaryColor,
        '--accent2': '#f85149',
        '--green': primaryColor,
        '--fav': favoriteColor,
        '--text': hslToRgb(...fontHsl),
        '--dim': hslToRgb(tunedH, chassisSat, 0.5),
        '--subdim': hslToRgb(tunedH, chassisSat * 1.2, Math.max(0.01, bgHsl[2] - 0.02)),
        '--viz-bg': hslToRgb(tunedH, chassisSat * 1.2, Math.max(0.01, bgHsl[2] - 0.03)),
        '--np-bg': hslToRgb(tunedH, chassisSat * 1.2, bgHsl[2] + (mode === 'dark' ? 0.04 : -0.04)),
        '--ctrl-bg': hslToRgb(tunedH, chassisSat * 1.2, Math.max(0.01, bgHsl[2] - 0.02)),
        '--pl-bg': bgStr,
        '--pl-hover': hslToRgb(tunedH, chassisSat * 1.4, bgHsl[2] + (mode === 'dark' ? 0.09 : -0.09)),
        '--pl-active': `rgba(${primaryRgbStr}, 0.25)`,
        '--pl-footer': hslToRgb(tunedH, chassisSat * 1.2, Math.max(0.01, bgHsl[2] - 0.02)),
        '--seek-bg': hslToRgb(tunedH, chassisSat * 1.4, bgHsl[2] + (mode === 'dark' ? 0.08 : -0.08)),
        '--tab-bg': hslToRgb(tunedH, chassisSat * 1.2, Math.max(0.01, bgHsl[2] - 0.02)),
        '--tab-active': hslToRgb(tunedH, chassisSat * 1.2, bgHsl[2] + (mode === 'dark' ? 0.04 : -0.04)),
        '--grid-line': hslToRgb(tunedH, chassisSat * 1.4, bgHsl[2] + (mode === 'dark' ? 0.07 : -0.07)),
        '--btn-text': buttonTextColor,
        '--glow': `0 0 15px rgba(${primaryRgbStr}, 0.15)`,
        '--glow2': `0 0 10px rgba(${primaryRgbStr}, 0.4)`,
        '--glowfav': `0 0 10px rgba(${favoriteRgb.join(',')}, 0.4)`,
        '_hsl': { h: Math.round(primaryHsl[0] * 360), s: Math.round(primaryHsl[1] * 100), l: Math.round(primaryHsl[2] * 100) }
    };

    if (isSignatureMode) {
        const sig = (mode === 'light' ? rabbitTheme.light : rabbitTheme.dark);
        const exclusions = ['--accent', '--green', '--pl-active', '--btn-text', '--glow', '--glow2', '_hsl'];
        Object.keys(sig).forEach(key => {
            if (!exclusions.includes(key)) {
                palette[key] = sig[key];
            }
        });
        // Force neutral text in signature mode for readability
        palette['--text'] = sig['--text'];
    }

    return palette;
}

function getLuminance(rgb) {
    if (!rgb || rgb.length < 3) return 0;
    const a = rgb.map(v => {
        v /= 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
}

function getContrast(rgb1, rgb2) {
    if (!rgb1 || !rgb2) return 1;
    const lum1 = getLuminance(rgb1), lum2 = getLuminance(rgb2);
    return (Math.max(lum1, lum2) + 0.05) / (Math.min(lum1, lum2) + 0.05);
}

// ══ GLOBAL EXPORTS ═════════════════════════
window.rabbitTheme = rabbitTheme;
window.sparkyTheme = sparkyTheme;
window.defaultTheme = rabbitTheme;
window.colorNameToRgb = colorNameToRgb;
window.rgbToHsl = rgbToHsl;
window.hslToRgb = hslToRgb;
window.applyModifierToHsl = applyModifierToHsl;
window.generatePaletteFromRgb = generatePaletteFromRgb;
window.getLuminance = getLuminance;
window.getContrast = getContrast;

// ══ BOOT BRIDGE ════════════════════════════
window.initThemeEngine = function() {
    console.log('--- THEME ENGINE BOOTING ---');
    if (window.initThemeUI) window.initThemeUI();
};
