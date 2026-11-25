import { contrastRatio, ensureContrast, hexToOklch, normalizeHex, oklchToHex } from './colorMath';

/**
 * The accent colour a learner picks in Settings › General. It recolours what the app's own teal
 * colours (buttons, the chosen tab, switches, links, selection) and nothing that carries meaning:
 * grades, card states, charts and warnings keep their colours in every theme.
 *
 * Stored as one string: a preset's id, or `#rrggbb` for a colour of the learner's own.
 */
export const DEFAULT_ACCENT = 'teal';

export interface AccentPreset {
    id: string;
    tr: string;
    en: string;
    /** The colour the accent is built from; null for the app's own teal, which is used as drawn. */
    seed: string | null;
}

export const ACCENT_PRESETS: readonly AccentPreset[] = [
    { id: 'teal', tr: 'Turkuaz', en: 'Teal', seed: null },
    { id: 'blue', tr: 'Mavi', en: 'Blue', seed: '#2f6fdb' },
    { id: 'indigo', tr: 'İndigo', en: 'Indigo', seed: '#5758d6' },
    { id: 'purple', tr: 'Mor', en: 'Purple', seed: '#8a4fd0' },
    { id: 'pink', tr: 'Pembe', en: 'Pink', seed: '#cf4489' },
    { id: 'red', tr: 'Kırmızı', en: 'Red', seed: '#d0473f' },
    { id: 'orange', tr: 'Turuncu', en: 'Orange', seed: '#d2691e' },
    { id: 'green', tr: 'Yeşil', en: 'Green', seed: '#2f9150' },
    { id: 'graphite', tr: 'Grafit', en: 'Graphite', seed: '#5d6871' },
];

/** A stored accent as a preset id or a lower-case `#rrggbb`; anything else is the default. */
export function normalizeAccentColor(value: unknown): string {
    if (typeof value !== 'string') return DEFAULT_ACCENT;
    if (ACCENT_PRESETS.some((preset) => preset.id === value)) return value;
    return (value.trim().startsWith('#') ? normalizeHex(value) : null) ?? DEFAULT_ACCENT;
}

/** Whether a stored accent is a colour of the learner's own rather than a preset. */
export const isCustomAccent = (value: string | undefined): boolean => normalizeAccentColor(value).startsWith('#');

function seedOf(value: string | undefined): string | null {
    const accent = normalizeAccentColor(value);
    if (accent.startsWith('#')) return accent;
    return ACCENT_PRESETS.find((preset) => preset.id === accent)?.seed ?? null;
}

/** The tokens an accent replaces outright. */
interface AccentTokens {
    accent: string;
    accentHover: string;
    accentLight: string;
}

/** Greys that take a trace of the accent's hue, so a warm accent does not sit on a cold page. */
const NEUTRAL_TOKENS = [
    'bgPrimary', 'bgSecondary', 'bgCard', 'bgSidebar', 'bgInput', 'border', 'borderLight',
    'rowPressed', 'segmentSelected', 'reviewerCard', 'reviewerCardBorder',
] as const;

const WHITE = '#ffffff';
/**
 * The least contrast white text keeps on a light-theme accent: what the app's own teal has, so a
 * picked colour is as legible on a button as the default.
 */
const MIN_ON_ACCENT_CONTRAST = 3.4;
/** The lightness band an accent sits in on dark surfaces: bright enough to read, never glaring. */
const DARK_ACCENT_L = { min: 0.68, max: 0.74 };
/** Chroma the neutrals take from the accent. Below a just-noticeable step next to plain grey. */
const NEUTRAL_TINT = { light: 0.006, dark: 0.009 };

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function accentTokens(seed: string, isDark: boolean): AccentTokens {
    const { l, c, h } = hexToOklch(seed);
    if (isDark) {
        const accentL = clamp(l + 0.1, DARK_ACCENT_L.min, DARK_ACCENT_L.max);
        const chroma = Math.min(c, 0.17);
        return {
            accent: oklchToHex({ l: accentL, c: chroma, h }),
            accentHover: oklchToHex({ l: accentL + 0.06, c: chroma, h }),
            accentLight: oklchToHex({ l: 0.28, c: Math.min(c, 0.045), h }),
        };
    }
    // A colour too light for white text is darkened along its own hue; too dark a one (navy,
    // near-black) is left alone, since it already reads.
    const accent = ensureContrast(oklchToHex({ l: Math.min(l, 0.64), c, h }), WHITE, MIN_ON_ACCENT_CONTRAST);
    const accentL = hexToOklch(accent).l;
    return {
        accent,
        accentHover: oklchToHex({ l: Math.max(0, accentL - 0.06), c, h }),
        accentLight: oklchToHex({ l: 0.955, c: Math.min(c, 0.028), h }),
    };
}

/**
 * The palette with the chosen accent applied. The default accent returns `base` itself, so the
 * app's own look is exactly what `constants/theme.ts` draws.
 */
export function applyAccent<T extends Record<string, string>>(base: T, accentValue: string | undefined, isDark: boolean): T {
    const seed = seedOf(accentValue);
    if (!seed) return base;
    const { c, h } = hexToOklch(seed);
    const result: Record<string, string> = { ...base, ...accentTokens(seed, isDark) };
    // A grey accent has no hue to lend.
    if (c >= 0.03) {
        const tint = isDark ? NEUTRAL_TINT.dark : NEUTRAL_TINT.light;
        for (const token of NEUTRAL_TOKENS) {
            const value = base[token];
            if (value) result[token] = oklchToHex({ l: hexToOklch(value).l, c: tint, h });
        }
    }
    return result as T;
}

/** White text's contrast on a light-theme accent; the tests hold every preset to the floor. */
export const onAccentContrast = (accent: string): number => contrastRatio(WHITE, accent);
export { MIN_ON_ACCENT_CONTRAST };
