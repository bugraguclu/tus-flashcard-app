import { describe, expect, it } from 'vitest';
import { resolveThemeColors } from '../constants/theme';
import {
    cardPageBodyTag,
    defaultCardTextCss,
    nativeCardDocument,
    nightModeCardCss,
    webCardDocument,
} from './cardPageDefaults';
import { BUILTIN_NOTE_TYPES, type NoteType } from './models';
import { renderCardHtml } from './templates';

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

// Anki's reviewer page: `<body class="card card1 nightMode night_mode">`, so a note type may key
// its night rules off the body (`body.nightMode .box`, `body.night_mode img`).
// https://docs.ankiweb.net/templates/styling.html#night-mode
describe('the card page body', () => {
    const basic = BUILTIN_NOTE_TYPES.find((n) => n.id === 1)! as NoteType;
    const side = (nightMode: boolean) => renderCardHtml(basic, {
        id: 1, guid: 'g', noteTypeId: basic.id, mod: 0, usn: -1, tags: [],
        fields: ['soru', 'cevap'], sfld: 'soru', csum: 0, flags: 0,
    }, 0, 'question', { nightMode, platformClasses: 'mobile iphone js' });
    const head = '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'"><meta name="viewport" content="width=device-width">';
    const bodyTags = (page: string) => page.match(/<body\b[^>]*>/g);

    it('carries Anki’s two night-mode classes at night and none by day', () => {
        expect(cardPageBodyTag(true)).toBe('<body class="nightMode night_mode">');
        expect(cardPageBodyTag(false)).toBe('<body>');
    });

    it('never carries `card`: a `.card .card` rule would then reach the card element', () => {
        expect(cardPageBodyTag(true)).not.toMatch(/\bcard/);
    });

    it('opens the iPhone document’s body after its head tags and before the card', () => {
        const page = nativeCardDocument({ head, content: side(true), nightMode: true });
        expect(bodyTags(page)).toEqual(['<body class="nightMode night_mode">']);
        // The content security policy only counts inside the head, so it stays in front.
        expect(page.startsWith(`${head}<body class="nightMode night_mode">`)).toBe(true);
        expect(page.indexOf('<body')).toBeLessThan(page.indexOf('<div class="mobile iphone js">'));
        // The card element keeps its own classes: `.card.nightMode` and `.nightMode .cloze` still match.
        expect(page).toContain('<div class="card card1 side-question nightMode night_mode">');
        expect(page).not.toMatch(/<\/body>|<html|<head/);
    });

    it('leaves the night classes off the iPhone document by day', () => {
        const page = nativeCardDocument({ head, content: side(false), nightMode: false });
        expect(bodyTags(page)).toEqual(['<body>']);
        expect(page).not.toMatch(/nightMode|night_mode/);
        expect(page).toContain('<div class="card card1 side-question">');
    });

    it('builds the web frame’s document with the same body', () => {
        const night = webCardDocument({ head, content: side(true), nightMode: true });
        expect(night.startsWith(`<!DOCTYPE html><html><head><meta charset="utf-8">${head}</head><body class="nightMode night_mode">`)).toBe(true);
        expect(night.endsWith('</body></html>')).toBe(true);
        expect(bodyTags(night)).toEqual(['<body class="nightMode night_mode">']);
        expect(night).toContain('<div class="card card1 side-question nightMode night_mode">');

        const day = webCardDocument({ head, content: side(false), nightMode: false });
        expect(bodyTags(day)).toEqual(['<body>']);
        expect(day).not.toMatch(/nightMode|night_mode/);
    });

    it('lets a note type’s body.nightMode and body.night_mode selectors reach the page', () => {
        const page = nativeCardDocument({ head, content: side(true), nightMode: true });
        const bodyClasses = page.match(/<body class="([^"]*)">/)![1].split(' ');
        // What `body.nightMode .x` and `body.night_mode .x` need of the body element.
        expect(bodyClasses).toContain('nightMode');
        expect(bodyClasses).toContain('night_mode');
        // The card is still a descendant of that body, so the descendant half matches too.
        expect(page.indexOf('<body')).toBeLessThan(page.indexOf('class="card card1'));
    });

    it('names media files with # or ? as URLs in both documents, and only in the card', () => {
        const content = '<img src="Şekil #3.png"><audio controls src="Kalp sesi #2.mp3?"></audio><a href="notlar.pdf">n</a>';
        for (const build of [nativeCardDocument, webCardDocument]) {
            const page = build({ head, content, nightMode: false });
            expect(page).toContain('<img src="Şekil %233.png">');
            expect(page).toContain('src="Kalp sesi %232.mp3%3F"');
            expect(page).toContain('<a href="notlar.pdf">');
            expect(page).toContain(head);
        }
    });
});
