import { describe, expect, it } from 'vitest';
import {
    authoredCanvas,
    catalogCardCss,
    documentCss,
    legacyTusCardCss,
    parseCssColor,
    relativeLuminance,
    reviewerCanvasCss,
} from './cardAppearance';

const STOCK_CSS = '.card { font-family: arial; font-size: 20px; text-align: center; color: black; background-color: white; }';
const ANKING_CSS = `/* BACKGROUND COLOR */ .card { background-color: #D1CFCE; }
.nightMode.card, .night_mode .card { background-color: #272828!important; }`;
const LEGACY_TUS_CSS = '.card { font-family: -apple-system, sans-serif; color: #2c3e36; background-color: #f4faf7; padding: 20px; }';

describe('parseCssColor', () => {
    it('reads hex, functional and named colours', () => {
        expect(parseCssColor('#fff')).toEqual({ r: 255, g: 255, b: 255, a: 1 });
        expect(parseCssColor('#D1CFCE')).toEqual({ r: 209, g: 207, b: 206, a: 1 });
        expect(parseCssColor('rgba(0, 0, 0, 0.5)')).toEqual({ r: 0, g: 0, b: 0, a: 0.5 });
        expect(parseCssColor('rgb(100% 100% 100%)')).toEqual({ r: 255, g: 255, b: 255, a: 1 });
        expect(parseCssColor('White')).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    });

    it('converts hsl to its rgb channels', () => {
        const color = parseCssColor('hsl(0, 0%, 100%)');
        expect(color && Math.round(color.r)).toBe(255);
        expect(color && Math.round(color.b)).toBe(255);
    });

    it('refuses what it cannot judge', () => {
        expect(parseCssColor('var(--bg)')).toBeNull();
        expect(parseCssColor('rebeccapurple')).toBeNull();
        expect(parseCssColor('#12')).toBeNull();
    });
});

describe('relativeLuminance', () => {
    it('spans white to black', () => {
        expect(relativeLuminance({ r: 255, g: 255, b: 255, a: 1 })).toBeCloseTo(1);
        expect(relativeLuminance({ r: 0, g: 0, b: 0, a: 1 })).toBeCloseTo(0);
    });

    it('composites a translucent paint over a white page', () => {
        expect(relativeLuminance({ r: 0, g: 0, b: 0, a: 0 })).toBeCloseTo(1);
        expect(relativeLuminance({ r: 0, g: 0, b: 0, a: 0.05 })).toBeGreaterThan(0.8);
    });
});

describe('authoredCanvas', () => {
    it('reads the stock white page and the legacy near-white page as light', () => {
        expect(authoredCanvas(STOCK_CSS)).toBe('light');
        expect(authoredCanvas(LEGACY_TUS_CSS)).toBe('light');
        expect(authoredCanvas('body { background: #fdf6e3 no-repeat; }')).toBe('light');
        expect(authoredCanvas(':root { background-color: ivory }')).toBe('light');
    });

    it('keeps a darker or patterned page as the author wrote it', () => {
        expect(authoredCanvas(ANKING_CSS)).toBe('custom');
        expect(authoredCanvas('.card { background: #1e1e1e; color: #eee; }')).toBe('custom');
        expect(authoredCanvas('.card { background: white url("paper.png"); }')).toBe('custom');
        expect(authoredCanvas('.card { background-color: white; background-image: url(paper.png); }')).toBe('custom');
        expect(authoredCanvas('.mobile .card { background-color: var(--page); }')).toBe('custom');
    });

    it('ignores night-mode rules, element styling and comments', () => {
        expect(authoredCanvas('.nightMode.card { background: #000; } .card { background: white; }')).toBe('light');
        expect(authoredCanvas('.cloze { background: #000; } .card img { background: black; }')).toBe('none');
        expect(authoredCanvas('/* .card { background: black; } */ .card { color: black; }')).toBe('none');
        expect(authoredCanvas('.card:hover { background: black; }')).toBe('none');
    });

    it('treats transparent and keyword-only shorthands as painting nothing', () => {
        expect(authoredCanvas('.card { background: transparent; }')).toBe('none');
        expect(authoredCanvas('body { background: none; } .card { background: no-repeat; }')).toBe('none');
    });

    it('reads rules nested in @media blocks with their own selector', () => {
        expect(authoredCanvas('@media (max-width: 600px) { .card { background: black; } }')).toBe('custom');
    });
});

describe('documentCss', () => {
    it('collects every style block in order', () => {
        expect(documentCss('<style>a{}</style><div>x</div><style media="all">b{}</style>')).toBe('a{}\nb{}');
    });
});

describe('reviewerCanvasCss', () => {
    const base = { nightTextColor: '#f1f6f3' };

    it('hands a stock white page to the reviewer in light mode', () => {
        const css = reviewerCanvasCss({ ...base, authoredCss: STOCK_CSS, nightMode: false });
        expect(css).toContain('color-scheme:light');
        expect(css).toContain('html,body{background-color:transparent!important;}');
        expect(css).toContain('.card.card,#qa{background-color:transparent!important;}');
        expect(css).not.toContain('div.nightMode');
    });

    it('keeps a custom page in light mode', () => {
        expect(reviewerCanvasCss({ ...base, authoredCss: ANKING_CSS, nightMode: false }))
            .toBe(':root{color-scheme:light;}');
    });

    it('applies the night-mode rule at Anki’s specificity so note-type night rules still win', () => {
        const css = reviewerCanvasCss({ ...base, authoredCss: STOCK_CSS, nightMode: true });
        expect(css).toContain('color-scheme:dark');
        expect(css).toContain('div.nightMode{background-color:transparent;color:#f1f6f3;}');
        // Not `.card.card`: a note type's `.nightMode.card` (0,2,0) must be able to repaint the page.
        expect(css).not.toContain('.card.card');
    });

    it('always gives a catalog page to the reviewer', () => {
        const light = reviewerCanvasCss({ ...base, authoredCss: ANKING_CSS, catalogPack: 'bka-tus', nightMode: false });
        expect(light).toContain('html,body{background:transparent!important;}');
        expect(light).toContain('.card.card,#qa{background:transparent!important;}');

        const night = reviewerCanvasCss({ ...base, authoredCss: STOCK_CSS, catalogPack: 'bka-tus', nightMode: true });
        expect(night).toContain('div.nightMode{background-color:transparent;color:#f1f6f3;}');
    });
});

describe('catalogCardCss', () => {
    const palette = { textColor: '#2c3e36', clozeColor: '#1d5fa6', clozeTint: 'rgba(29, 95, 166, 0.12)' };

    it('gives catalog cards the app colours in light mode', () => {
        const css = catalogCardCss({ ...palette, nightMode: false });
        expect(css).toContain('.card.card{color:#2c3e36;}');
        expect(css).toContain('.card.card .cloze,.card.card a[href="#"]{color:#1d5fa6;}');
    });

    it('leaves the template’s own night colours alone', () => {
        const css = catalogCardCss({ ...palette, nightMode: true });
        expect(css).not.toContain('.card.card{color:');
        expect(css).not.toContain('.card.card .cloze');
    });

    it('tints only the deletion still hidden on the question side', () => {
        const css = catalogCardCss({ ...palette, nightMode: false });
        expect(css).toContain('.side-question .cloze[data-cloze]{');
        expect(css).toContain('background-color:rgba(29, 95, 166, 0.12);');
    });

    it('drops AnKing’s trailing breaks and a rule with nothing under it', () => {
        const css = catalogCardCss({ ...palette, nightMode: true });
        expect(css).toContain('.clozefield~br{display:none;}');
        expect(css).toContain('.clozefield~hr:not(:has(~#extra,~.hints)){display:none;}');
    });
});

describe('legacyTusCardCss', () => {
    const palette = { secondaryText: '#bac7c0', mutedText: '#87948e' };

    it('leaves the light palette the note type was written in alone', () => {
        expect(legacyTusCardCss({ ...palette, nightMode: false })).toBe('');
    });

    it('moves the answer and source lines to the dark palette at night', () => {
        expect(legacyTusCardCss({ ...palette, nightMode: true }))
            .toBe('.nightMode .answer{color:#bac7c0;}.nightMode .source{color:#87948e;}');
    });
});
