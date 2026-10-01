import { describe, expect, it } from 'vitest';
import { resolveThemeColors } from '../constants/theme';
import { defaultCardTextCss, nightModeCardCss } from './cardPageDefaults';

/** WCAG relative luminance of a `#rrggbb` colour. */
function relativeLuminance(hex: string): number {
    const channels = [1, 3, 5].map((offset) => {
        const channel = parseInt(hex.slice(offset, offset + 2), 16) / 255;
        return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(first: string, second: string): number {
    const [lighter, darker] = [relativeLuminance(first), relativeLuminance(second)].sort((a, b) => b - a);
    return (lighter + 0.05) / (darker + 0.05);
}

describe('defaultCardTextCss', () => {
    it('hands the page the theme text colour at zero specificity', () => {
        // Card text inherits it from body, and any colour rule a note type writes — `.card`,
        // `body`, `.nightMode .card` — outranks a :where() rule, so only uncoloured text takes it.
        expect(defaultCardTextCss('#f1f6f3')).toBe(':where(body){color:#f1f6f3;}');
    });

    it.each(['light', 'dark'] as const)('keeps a note type without a colour legible on the %s card surface', (scheme) => {
        // The reviewer passes textPrimary; on the dark card surface the page used to keep the
        // browser's black.
        const { colors } = resolveThemeColors(scheme, scheme);
        expect(contrastRatio(colors.textPrimary, colors.bgCard)).toBeGreaterThanOrEqual(4.5);
    });
});

describe('nightModeCardCss', () => {
    it('is Anki’s body.nightMode rule at the weight it has there, with the canvas left to the reviewer', () => {
        // div.nightMode (0,1,1) outranks a stock `.card { color: black; background-color: white }`
        // (0,1,0) on the card element, which carries `nightMode` only at night, and yields to a
        // note type's own `.nightMode.card` (0,2,0).
        expect(nightModeCardCss('#f1f6f3')).toBe('div.nightMode{background-color:transparent;color:#f1f6f3;}');
    });
});
