/**
 * The default 'Rabbit' theme definition for light and dark modes.
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
        '--pl-active': '#132d30',
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
        '--pl-active': '#e8f4f0',
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
        '--pl-active': '#132d30',
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
        '--pl-active': '#e8f4f0',
        '--pl-footer': '#e6f3ff',
        '--seek-bg': '#b8d9f5',
        '--tab-bg': '#d9edff',
        '--tab-active': '#f0faff',
        '--grid-line': '#b8d9f5',
        '--btn-text': '#FFFFFF'
    }
};

window.rabbitTheme = rabbitTheme;
window.sparkyTheme = sparkyTheme;
window.defaultTheme = rabbitTheme; // Legacy compatibility

function colorNameToRgb(name) {
    const s = name.trim();
    const hexMatch = s.match(/^#?([a-f\d]{6}|[a-f\d]{3})$/i);
    if (hexMatch) {
        let hex = hexMatch[1];
        if (hex.length === 3) {
            hex = hex.split('').map(char => char + char).join('');
        }
        const bigint = parseInt(hex, 16);
        return [(bigint >> 16) & 255, (bigint >> 8) & 255, bigint & 255];
    }
    const el = document.createElement('div');
    const magicColor = 'rgb(1, 2, 3)';
    el.style.color = magicColor;
    try {
        document.body.appendChild(el);
        el.style.color = s;
        const computedColor = window.getComputedStyle(el).color;
        if (computedColor === magicColor || computedColor === 'rgba(0, 0, 0, 0)' || computedColor === 'transparent') return null;
        return computedColor.match(/\d+/g).map(Number);
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
    let r, g, b;
    if (s === 0) { r = g = b = l; } else {
        const hue2rgb = (p, q, t) => {
            if (t < 0) t += 1; if (t > 1) t -= 1;
            if (t < 1 / 6) return p + (q - p) * 6 * t;
            if (t < 1 / 2) return q;
            if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
            return p;
        };
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r = hue2rgb(p, q, h + 1 / 3); g = hue2rgb(p, q, h); b = hue2rgb(p, q, h - 1 / 3);
    }
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
    const mod = modifiers[modifier];
    if (!mod) return [h, s, l];
    let [hDelta, sMult, lMult] = mod;
    let newH = (h * 360 + hDelta) / 360;
    newH = (newH % 1 + 1) % 1;
    let newS = Math.max(0, Math.min(1, s * sMult));
    let newL = Math.max(0.05, Math.min(0.95, l * lMult));

    // Special override for bold to ensure it's always high-contrast
    if (modifier === 'bold') {
        newL = Math.max(0.45, Math.min(0.6, newL));
    }
    return [newH, newS, newL];
}

function generatePaletteFromRgb(rgb, mode = 'dark', modifier = null) {
    const [r, g, b] = rgb;
    let [h, s, l] = rgbToHsl(r, g, b);

    if (modifier) {
        [h, s, l] = applyModifierToHsl([h, s, l], modifier);
    }

    const MIN_CONTRAST_RATIO = 4.5;
    const primaryColor = hslToRgb(h, s, l);
    const primaryRgb = colorNameToRgb(primaryColor);

    if (mode === 'light') {
        let fontHsl = [h, s * 0.8, 0.1]; // Dark, saturated font
        let bgHsl = [h, s * 0.1, 0.98];   // Very light, desaturated background

        // Special overrides for certain modifiers to create a more cohesive feel
        if (modifier === 'glow' || modifier === 'neon') {
            bgHsl = [h, 0, 1]; // Pure white background for max pop
            fontHsl = [h, 1, 0.05];
        } else if (modifier === 'pastel') {
            bgHsl = [h, 0.2, 0.97];
        } else if (modifier === 'metallic') {
            bgHsl = [h, 0.05, 0.95];
            fontHsl = [h, 0.1, 0.2];
        }

        let bgRgb = colorNameToRgb(hslToRgb(...bgHsl));
        let fontRgb = colorNameToRgb(hslToRgb(...fontHsl));
        
        while (getContrast(fontRgb, bgRgb) < MIN_CONTRAST_RATIO && bgHsl[2] > 0.8) {
            bgHsl[2] -= 0.02; // Make background slightly darker if contrast fails
            bgRgb = colorNameToRgb(hslToRgb(...bgHsl));
        }

        const buttonTextColor = getContrast(primaryRgb, [255, 255, 255]) > getContrast(primaryRgb, [0, 0, 0]) ? '#FFFFFF' : '#000000';
        // Generate a distinct but harmonious favorite color (gold/yellow hue)
        const favHue = 50 / 360; // A nice gold hue
        const favSat = Math.min(1, s + 0.3);
        const favLight = Math.max(0, l - 0.05);
        const favoriteColor = hslToRgb(favHue, favSat, favLight);
        const bgStr = hslToRgb(...bgHsl);
        const [bgR, bgG, bgB] = bgRgb;
        const gradientTop = `rgb(${Math.min(255, bgR + 10)}, ${Math.min(255, bgG + 12)}, ${Math.min(255, bgB + 15)})`;
        
        return {
            '--bg': bgStr,
            '--bg-gradient': `radial-gradient(circle at top center, ${gradientTop} 0%, ${bgStr} 100%)`,
            '--panel': '#ffffff',
            '--panel2': hslToRgb(h, s * 0.1, 0.92),
            '--border': hslToRgb(h, s * 0.1, 0.88),
            '--accent': primaryColor,
            '--accent2': '#c0392b',
            '--green': primaryColor,
            '--fav': favoriteColor,
            '--text': hslToRgb(...fontHsl),
            '--dim': hslToRgb(h, s * 0.3, 0.45),
            '--subdim': hslToRgb(h, s * 0.1, 0.85),
            '--viz-bg': hslToRgb(h, s * 0.1, 0.92),
            '--np-bg': hslToRgb(h, s * 0.05, 0.94),
            '--ctrl-bg': hslToRgb(h, s * 0.05, 0.95),
            '--pl-bg': bgStr,
            '--pl-hover': hslToRgb(h, s * 0.1, 0.95),
            '--pl-active': `rgba(${primaryRgb.join(',')}, 0.1)`,
            '--pl-footer': bgStr,
            '--seek-bg': hslToRgb(h, s * 0.1, 0.85),
            '--tab-bg': hslToRgb(h, s * 0.1, 0.92),
            '--tab-active': bgStr,
            '--grid-line': hslToRgb(h, s * 0.1, 0.88),
            '--btn-text': buttonTextColor,
        };
    }

    // Dark Mode
    let fontHsl = [h, s * 0.15, 0.9]; // Light, slightly colored font
    let bgHsl = [h, s * 0.5, 0.05];   // Very dark, saturated background

    // Special overrides for certain modifiers
    if (modifier === 'glow' || modifier === 'neon') {
        bgHsl = [h, s, 0.02]; // Almost pure black for max pop
        fontHsl = [h, 0.1, 0.95];
    } else if (modifier === 'pastel') {
        bgHsl = [h, 0.2, 0.1];
    } else if (modifier === 'metallic') {
        bgHsl = [h, 0.1, 0.08];
        fontHsl = [h, 0.05, 0.8];
    }

    let bgRgb = colorNameToRgb(hslToRgb(...bgHsl));
    let fontRgb = colorNameToRgb(hslToRgb(...fontHsl));

    while (getContrast(fontRgb, bgRgb) < MIN_CONTRAST_RATIO && bgHsl[2] < 0.25) {
        bgHsl[2] += 0.01; // Make background slightly lighter if contrast fails
        bgRgb = colorNameToRgb(hslToRgb(...bgHsl));
    }

    const buttonTextColor = getContrast(primaryRgb, [255, 255, 255]) > getContrast(primaryRgb, [0, 0, 0]) ? '#FFFFFF' : '#000000';
    // Generate a distinct but harmonious favorite color (gold/yellow hue)
    const favHue = 50 / 360; // A nice gold hue
    const favSat = Math.min(1, s + 0.2);
    const favLight = Math.min(1, l + 0.15);
    const favoriteColor = hslToRgb(favHue, favSat, favLight);
    const bgStr = hslToRgb(...bgHsl);
    const [bgR, bgG, bgB] = bgRgb;
    const gradientTop = `rgb(${Math.min(255, bgR + 15)}, ${Math.min(255, bgG + 20)}, ${Math.min(255, bgB + 30)})`;

    return {
        '--bg': bgStr,
        '--bg-gradient': `radial-gradient(circle at top center, ${gradientTop} 0%, ${bgStr} 100%)`,
        '--panel': hslToRgb(h, s * 0.6, 0.12),
        '--panel2': hslToRgb(h, s * 0.6, 0.14),
        '--border': hslToRgb(h, s * 0.6, 0.18),
        '--accent': primaryColor,
        '--accent2': '#f85149',
        '--green': primaryColor,
        '--fav': favoriteColor,
        '--text': hslToRgb(...fontHsl),
        '--dim': hslToRgb(h, s * 0.3, 0.5),
        '--subdim': hslToRgb(h, s * 0.6, 0.04),
        '--viz-bg': hslToRgb(h, s * 0.6, 0.03),
        '--np-bg': hslToRgb(h, s * 0.6, 0.1),
        '--ctrl-bg': hslToRgb(h, s * 0.6, 0.03),
        '--pl-bg': bgStr,
        '--pl-hover': hslToRgb(h, s * 0.6, 0.16),
        '--pl-active': `rgba(${primaryRgb.join(',')}, 0.15)`,
        '--pl-footer': hslToRgb(h, s * 0.6, 0.03),
        '--seek-bg': hslToRgb(h, s * 0.6, 0.15),
        '--tab-bg': hslToRgb(h, s * 0.6, 0.03),
        '--tab-active': hslToRgb(h, s * 0.6, 0.1),
        '--grid-line': hslToRgb(h, s * 0.6, 0.14),
        '--btn-text': buttonTextColor,
    };
}

function getLuminance(rgb) {
    const a = rgb.map(v => {
        v /= 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
}

function getContrast(rgb1, rgb2) {
    if (!rgb1 || !rgb2) return 1; // Failsafe
    const lum1 = getLuminance(rgb1);
    const lum2 = getLuminance(rgb2);
    const brightest = Math.max(lum1, lum2);
    const darkest = Math.min(lum1, lum2);
    return (brightest + 0.05) / (darkest + 0.05);
}

window.colorNameToRgb = colorNameToRgb;
window.rgbToHsl = rgbToHsl;
window.hslToRgb = hslToRgb;
window.applyModifierToHsl = applyModifierToHsl;
window.generatePaletteFromRgb = generatePaletteFromRgb;
window.getLuminance = getLuminance;
window.getContrast = getContrast;
window.defaultTheme = defaultTheme;
