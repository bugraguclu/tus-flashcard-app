/**
 * Colour arithmetic for the theme engine: sRGB hex in and out, OKLCH in between (a perceptual
 * space, so a lightness or hue step looks the same size whatever the colour), WCAG contrast, and
 * HSV for the colour picker. Import-free, so settings validation and tests can use it.
 */

export interface Rgb { r: number; g: number; b: number }
export interface Oklch { l: number; c: number; h: number }
export interface Hsv { h: number; s: number; v: number }

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** `#abc`, `abc`, `#aabbcc` → `#aabbcc` (lower case), or null when it is not a colour. */
export function normalizeHex(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const match = HEX.exec(value.trim());
    if (!match) return null;
    const digits = match[1].length === 3 ? match[1].split('').map((d) => d + d).join('') : match[1];
    return `#${digits.toLowerCase()}`;
}

export function hexToRgb(hex: string): Rgb {
    const normal = normalizeHex(hex) ?? '#000000';
    return {
        r: parseInt(normal.slice(1, 3), 16) / 255,
        g: parseInt(normal.slice(3, 5), 16) / 255,
        b: parseInt(normal.slice(5, 7), 16) / 255,
    };
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

export function rgbToHex({ r, g, b }: Rgb): string {
    const part = (value: number) => Math.round(clamp01(value) * 255).toString(16).padStart(2, '0');
    return `#${part(r)}${part(g)}${part(b)}`;
}

const toLinear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const fromLinear = (v: number) => (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055);

/** sRGB → OKLCH (Björn Ottosson's OKLab, in polar form). Hue in degrees. */
export function rgbToOklch({ r, g, b }: Rgb): Oklch {
    const lr = toLinear(r); const lg = toLinear(g); const lb = toLinear(b);
    const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
    const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
    const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
    const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
    const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
    const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
    const c = Math.sqrt(A * A + B * B);
    const h = ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360;
    return { l: L, c, h };
}

function oklchToLinear({ l: L, c, h }: Oklch): [number, number, number] {
    const rad = (h * Math.PI) / 180;
    const A = c * Math.cos(rad); const B = c * Math.sin(rad);
    const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
    const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
    const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
    return [
        4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
        -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
        -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
    ];
}

const inGamut = (channels: [number, number, number]) => channels.every((v) => v >= -0.0005 && v <= 1.0005);

/** OKLCH → sRGB hex, lowering chroma (keeping lightness and hue) until the colour fits sRGB. */
export function oklchToHex(color: Oklch): string {
    const l = Math.min(1, Math.max(0, color.l));
    let c = Math.max(0, color.c);
    if (!inGamut(oklchToLinear({ l, c, h: color.h }))) {
        let low = 0; let high = c;
        for (let step = 0; step < 18; step += 1) {
            const mid = (low + high) / 2;
            if (inGamut(oklchToLinear({ l, c: mid, h: color.h }))) low = mid; else high = mid;
        }
        c = low;
    }
    const [r, g, b] = oklchToLinear({ l, c, h: color.h });
    return rgbToHex({ r: fromLinear(clamp01(r)), g: fromLinear(clamp01(g)), b: fromLinear(clamp01(b)) });
}

export const hexToOklch = (hex: string): Oklch => rgbToOklch(hexToRgb(hex));

/** WCAG 2 relative luminance. */
export function luminance(hex: string): number {
    const { r, g, b } = hexToRgb(hex);
    return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/** WCAG 2 contrast ratio, 1–21. */
export function contrastRatio(a: string, b: string): number {
    const la = luminance(a); const lb = luminance(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * Moves `hex` in OKLCH lightness — darker when `against` is light, lighter when it is dark —
 * until it reaches `ratio` against `against`, keeping its hue and as much chroma as fits.
 */
export function ensureContrast(hex: string, against: string, ratio: number): string {
    if (contrastRatio(hex, against) >= ratio) return normalizeHex(hex) ?? hex;
    const start = hexToOklch(hex);
    const darker = luminance(against) > 0.18;
    let low = darker ? 0 : start.l; let high = darker ? start.l : 1;
    let best = darker ? oklchToHex({ ...start, l: 0 }) : oklchToHex({ ...start, l: 1 });
    for (let step = 0; step < 22; step += 1) {
        const mid = (low + high) / 2;
        const candidate = oklchToHex({ ...start, l: mid });
        const ok = contrastRatio(candidate, against) >= ratio;
        if (ok) best = candidate;
        // Darkening: an ok candidate lets us try lighter (closer to the original).
        if (darker) { if (ok) low = mid; else high = mid; } else if (ok) high = mid; else low = mid;
    }
    return best;
}

/** Mixes two colours in OKLab, `amount` of the way from `a` to `b`. */
export function mixOklab(a: string, b: string, amount: number): string {
    const x = hexToOklch(a); const y = hexToOklch(b);
    const toLab = (p: Oklch) => [p.l, p.c * Math.cos((p.h * Math.PI) / 180), p.c * Math.sin((p.h * Math.PI) / 180)];
    const [l1, a1, b1] = toLab(x); const [l2, a2, b2] = toLab(y);
    const t = clamp01(amount);
    const L = l1 + (l2 - l1) * t; const A = a1 + (a2 - a1) * t; const B = b1 + (b2 - b1) * t;
    return oklchToHex({ l: L, c: Math.sqrt(A * A + B * B), h: ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360 });
}

/** `#rrggbb` + alpha → `rgba(...)`. */
export function withAlpha(hex: string, alpha: number): string {
    const { r, g, b } = hexToRgb(hex);
    return `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${Math.round(clamp01(alpha) * 1000) / 1000})`;
}

export function hexToHsv(hex: string): Hsv {
    const { r, g, b } = hexToRgb(hex);
    const max = Math.max(r, g, b); const min = Math.min(r, g, b); const d = max - min;
    let h = 0;
    if (d > 0) {
        if (max === r) h = ((g - b) / d) % 6;
        else if (max === g) h = (b - r) / d + 2;
        else h = (r - g) / d + 4;
        h = (h * 60 + 360) % 360;
    }
    return { h, s: max === 0 ? 0 : d / max, v: max };
}

export function hsvToHex({ h, s, v }: Hsv): string {
    const c = v * s; const hp = (((h % 360) + 360) % 360) / 60; const x = c * (1 - Math.abs((hp % 2) - 1));
    const [r1, g1, b1] = hp < 1 ? [c, x, 0] : hp < 2 ? [x, c, 0] : hp < 3 ? [0, c, x] : hp < 4 ? [0, x, c] : hp < 5 ? [x, 0, c] : [c, 0, x];
    const m = v - c;
    return rgbToHex({ r: r1 + m, g: g1 + m, b: b1 + m });
}
