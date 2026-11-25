import { describe, expect, it } from 'vitest';
import { resolveThemeColors } from '../constants/theme';
import { ACCENT_PRESETS, DEFAULT_ACCENT, MIN_ON_ACCENT_CONTRAST, normalizeAccentColor, onAccentContrast } from './accentTheme';
import { contrastRatio, hexToOklch } from './colorMath';

const light = (accent?: string) => resolveThemeColors('light', 'light', accent).colors;
const dark = (accent?: string) => resolveThemeColors('dark', 'dark', accent).colors;

describe('accent colour', () => {
    it('leaves the app’s own palette untouched for the default accent', () => {
        expect(light(DEFAULT_ACCENT)).toBe(light());
        expect(dark(DEFAULT_ACCENT)).toBe(dark());
        expect(light('nonsense')).toBe(light());
    });

    it('stores a preset id or a hex colour and nothing else', () => {
        expect(normalizeAccentColor('blue')).toBe('blue');
        expect(normalizeAccentColor('#ABC')).toBe('#aabbcc');
        expect(normalizeAccentColor('abc')).toBe(DEFAULT_ACCENT);
        expect(normalizeAccentColor({ kind: 'gradient' })).toBe(DEFAULT_ACCENT);
    });

    it('gives every preset a distinct accent that white text reads on, in both themes', () => {
        const seen = new Set<string>();
        for (const preset of ACCENT_PRESETS) {
            const day = light(preset.id); const night = dark(preset.id);
            expect(onAccentContrast(day.accent), preset.id).toBeGreaterThanOrEqual(MIN_ON_ACCENT_CONTRAST - 0.05);
            // On the dark page the accent is also text: links and the chosen tab.
            expect(contrastRatio(night.accent, night.bgCard), preset.id).toBeGreaterThanOrEqual(4.5);
            expect(contrastRatio(day.accent, day.accentLight), preset.id).toBeGreaterThanOrEqual(3);
            seen.add(day.accent);
        }
        expect(seen.size).toBe(ACCENT_PRESETS.length);
    });

    it('recolours only the accent and the greys, never a colour that carries meaning', () => {
        const base = light(); const pink = light('pink');
        const changed = Object.keys(base).filter((key) => base[key as keyof typeof base] !== pink[key as keyof typeof base]);
        expect(changed.filter((key) => /^(btn|badge|chart|danger|warning|success|info|text|cloze|streak|stateLabel)/.test(key))).toEqual([]);
        expect(changed).toContain('accent');
        // The greys keep their lightness and take only a trace of the hue.
        expect(hexToOklch(pink.bgPrimary).l).toBeCloseTo(hexToOklch(base.bgPrimary).l, 2);
        expect(hexToOklch(pink.bgPrimary).c).toBeLessThan(0.012);
        expect(dark('pink').bgPrimary).toBe('#000000');
        expect(pink.bgCard).toBe('#ffffff');
    });

    it('darkens a colour too light for white text, and leaves a grey accent’s page grey', () => {
        const yellow = light('#ffe45c');
        expect(onAccentContrast(yellow.accent)).toBeGreaterThanOrEqual(MIN_ON_ACCENT_CONTRAST - 0.05);
        expect(light('graphite').bgPrimary).toBe(light().bgPrimary);
    });
});
