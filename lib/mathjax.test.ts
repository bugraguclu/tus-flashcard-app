import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { CARD_CONTENT_SECURITY_POLICY } from './cardContentSecurity';
import {
    MATHJAX_PENDING_STYLE_ID,
    MATHJAX_REQUIRABLE_EXTENSIONS,
    MATHJAX_SCRIPT_HASH_SOURCE,
    MATHJAX_SOURCE_LENGTH,
    MATHJAX_SOURCE_SHA256,
    MATHJAX_TYPESET_EVENT,
    cardMathJaxScript,
    containsMathDelimiters,
    mathJaxCardCss,
    mathJaxConfig,
    mathJaxConfigSource,
    stripHtmlInsideMath,
} from './mathjax';
import { BUILTIN_NOTE_TYPES, type Note } from './models';
import { renderCardHtml, renderTemplate } from './templates';
import { WEB_APP_DEVELOPMENT_CSP, WEB_APP_PRODUCTION_CSP } from './webAppContentSecurityPolicy';

// Behaviour references (Anki 26.09.3, studied, not copied):
// https://docs.ankiweb.net/math.html#mathjax
// https://github.com/ankitects/anki/blob/26.09.3/ts/mathjax/index.ts (options)
// https://github.com/ankitects/anki/blob/26.09.3/ts/reviewer/index.ts (lazy load, typeset #qa)
// https://github.com/ankitects/anki/blob/26.09.3/rslib/src/cloze.rs (strip_html_inside_mathjax)

const VENDORED = new URL('../assets/mathjax/tex-svg-full.js.txt', import.meta.url);

function directive(policy: string, name: string): string {
    return policy.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name} `)) ?? '';
}

describe('vendored MathJax', () => {
    const bytes = readFileSync(VENDORED);

    it('is es5/tex-svg-full.js of the published mathjax@3.2.2, byte for byte', () => {
        expect(bytes.length).toBe(MATHJAX_SOURCE_LENGTH);
        expect(createHash('sha256').update(bytes).digest('base64')).toBe(MATHJAX_SOURCE_SHA256);
        // ASCII without carriage returns: characters equal bytes, and git's eol handling cannot touch it.
        expect(bytes.every((byte) => byte < 0x80 && byte !== 0x0d)).toBe(true);
    });

    it('keeps its Apache-2.0 licence next to it', () => {
        const licence = readFileSync(new URL('../assets/mathjax/LICENSE', import.meta.url), 'utf8');
        expect(licence).toContain('Apache License');
        expect(licence).toContain('Version 2.0, January 2004');
    });

    it('already holds every extension a card may \\require, so nothing is ever loaded', () => {
        const source = bytes.toString('latin1');
        const preloaded = new Set([...source.matchAll(/"\[tex\]\/([a-z0-9]+)"/gi)].map((match) => match[1]));
        for (const name of MATHJAX_REQUIRABLE_EXTENSIONS) expect(preloaded.has(name), name).toBe(true);
        expect(preloaded.has('mhchem')).toBe(true);
    });
});

describe('MathJax and the content boundary', () => {
    it('lets the web page run exactly the vendored file, and nothing like it in development', () => {
        expect(MATHJAX_SCRIPT_HASH_SOURCE).toBe(`'sha256-${MATHJAX_SOURCE_SHA256}'`);
        expect(directive(WEB_APP_PRODUCTION_CSP, 'script-src')).toContain(MATHJAX_SCRIPT_HASH_SOURCE);
        expect(directive(WEB_APP_PRODUCTION_CSP, 'script-src')).not.toContain("'unsafe-inline'");
        expect(directive(WEB_APP_DEVELOPMENT_CSP, 'script-src')).not.toContain("'sha256-");
    });

    it('leaves the card document refusing every script of its own', () => {
        expect(CARD_CONTENT_SECURITY_POLICY).toContain("script-src 'none'");
        expect(CARD_CONTENT_SECURITY_POLICY).toContain("connect-src 'none'");
        // The card document gets CSS only; MathJax reaches it as the app's injected script.
        const css = mathJaxCardCss('ready');
        expect(css).not.toMatch(/<script|javascript:|url\(/i);
    });

    it('refuses to load any file at runtime, from a CDN or anywhere else', () => {
        const fromApp = mathJaxConfig() as { loader: { load: string[]; require: (path: string) => unknown } };
        // eslint-disable-next-line no-new-func
        const fromScript = new Function(`return ${mathJaxConfigSource()};`)() as typeof fromApp;
        for (const config of [fromApp, fromScript]) {
            expect(config.loader.load).toEqual([]);
            expect(() => config.loader.require('[tex]/physics')).toThrow(/loads nothing/);
        }
        const { loader: _appLoader, ...appOptions } = fromApp as Record<string, unknown>;
        const { loader: _scriptLoader, ...scriptOptions } = fromScript as Record<string, unknown>;
        expect(scriptOptions).toEqual(appOptions);
    });

    it('is set up as Anki sets up MathJax', () => {
        const config = mathJaxConfig() as {
            tex: Record<string, unknown> & { require: { allow: Record<string, boolean>; defaultAllow: boolean } };
            svg: Record<string, unknown>;
            options: Record<string, unknown>;
            startup: Record<string, unknown>;
        };
        expect(config.tex.inlineMath).toEqual([['\\(', '\\)']]);
        expect(config.tex.displayMath).toEqual([['\\[', '\\]']]);
        expect(config.tex.processEscapes).toBe(false);
        expect(config.tex.processEnvironments).toBe(false);
        expect(config.tex.processRefs).toBe(false);
        expect(config.tex.packages).toEqual({ '[-]': ['textmacros'] });
        // A name outside the bundle is refused while the formula is read, never fetched.
        expect(config.tex.require.defaultAllow).toBe(false);
        expect(config.tex.require.allow.mhchem).toBe(true);
        expect(config.svg.fontCache).toBe('local');
        expect(config.options.enableMenu).toBe(false);
        expect(config.startup.typeset).toBe(false);
    });
});

describe('containsMathDelimiters', () => {
    it('finds inline and display math, as Anki decides whether to load MathJax', () => {
        expect(containsMathDelimiters(String.raw`<div>\(\sqrt{x}\)</div>`)).toBe(true);
        expect(containsMathDelimiters(String.raw`\[\ce{H2O}\]`)).toBe(true);
        expect(containsMathDelimiters('\\(a\nb\\)')).toBe(true);
    });

    it('leaves ordinary cards alone', () => {
        for (const html of [
            '',
            '<b>Kalp</b> dört odacıklıdır',
            '$$x^2$$ and $y$',
            '[$]x^2[/$] [latex]x[/latex]',
            String.raw`only an opening \( here`,
            String.raw`\( and \] do not pair`,
            '<span data-cloze="&#x5C;&#x28;x&#x5C;&#x29;">[...]</span>',
            String.raw`<style>.x::after{content:"\(\)"}</style><p>text</p>`,
        ]) {
            expect(containsMathDelimiters(html), html).toBe(false);
        }
    });
});

describe('stripHtmlInsideMath', () => {
    it('removes markup inside a formula and keeps its entities', () => {
        expect(stripHtmlInsideMath(String.raw`\(<foo>&lt;&gt;</foo>\)`)).toBe(String.raw`\(&lt;&gt;\)`);
        expect(stripHtmlInsideMath(String.raw`\[a<br>b<!-- c -->\]`)).toBe(String.raw`\[ab\]`);
    });

    it('stops at the first closing delimiter of either kind, as Anki does', () => {
        expect(stripHtmlInsideMath(String.raw`\( <i>a</i> \] <b>b</b> \)`)).toBe(String.raw`\( a \] <b>b</b> \)`);
        expect(stripHtmlInsideMath(String.raw`<b>x</b> \(<i>1</i>\) <b>y</b> \(<i>2</i>\)`))
            .toBe(String.raw`<b>x</b> \(1\) <b>y</b> \(2\)`);
    });

    it('leaves text without a formula untouched', () => {
        const html = '<span class="cloze">[...]</span> \\( unterminated <b>bold</b>';
        expect(stripHtmlInsideMath(html)).toBe(html);
    });
});

describe('clozes inside MathJax', () => {
    const cloze = (text: string, ord: number, side: 'question' | 'answer') => renderTemplate('{{cloze:Text}}', {
        fields: { Text: text }, clozeOrd: ord, side,
    });

    it('asks the deletion as [...] or its hint inside the formula, with no span to split it', () => {
        expect(cloze(String.raw`\(x = {{c1::a}} + 1\)`, 1, 'question')).toBe(String.raw`\(x = [...] + 1\)`);
        expect(cloze(String.raw`\(x = {{c1::a::hint}}\)`, 1, 'question')).toBe(String.raw`\(x = [hint]\)`);
        expect(cloze(String.raw`\[\ce{2H2 + {{c1::O2}} -> 2H2O}\]`, 1, 'question'))
            .toBe(String.raw`\[\ce{2H2 + [...] -> 2H2O}\]`);
    });

    it('shows the answer and the other deletions as plain TeX', () => {
        expect(cloze(String.raw`\(x = {{c1::a}} + {{c2::b}}\)`, 1, 'answer')).toBe(String.raw`\(x = a + b\)`);
        expect(cloze(String.raw`\(x = {{c1::a}} + {{c2::b}}\)`, 2, 'question')).toBe(String.raw`\(x = a + [...]\)`);
    });

    it('keeps the cloze styling of a deletion around a whole formula', () => {
        expect(cloze(String.raw`{{c1::\(x^2\)}} kare`, 1, 'answer'))
            .toBe(String.raw`<span class="cloze" data-ordinal="1">\(x^2\)</span> kare`);
        const question = cloze(String.raw`{{c1::\(x^2\)}} kare`, 1, 'question');
        expect(question).toMatch(/^<span class="cloze" data-cloze="[^"]+" data-ordinal="1">\[\.\.\.\]<\/span> kare$/);
        expect(containsMathDelimiters(question)).toBe(false);
    });

    it('renders a cloze without math exactly as before', () => {
        expect(cloze('{{c1::Kalp}} {{c2::akciğer}}', 1, 'question')).toBe(
            '<span class="cloze" data-cloze="Kalp" data-ordinal="1">[...]</span> '
            + '<span class="cloze-inactive" data-ordinal="2">akciğer</span>',
        );
    });

    it('leaves cloze-only output alone, as Anki only strips in the cloze filter', () => {
        expect(renderTemplate('{{cloze-only:Text}}', {
            fields: { Text: String.raw`\(x = {{c1::<b>a</b>}}\)` }, clozeOrd: 1, side: 'answer',
        })).toBe('<b>a</b>');
    });

    it('reaches the rendered card on both sides', () => {
        const noteType = BUILTIN_NOTE_TYPES.find((type) => type.id === 3)!;
        const note: Note = {
            id: 1, guid: 'g', noteTypeId: 3, mod: 0, usn: -1, tags: [], sfld: '', csum: 0, flags: 0,
            fields: [String.raw`Euler: \(e^{i\pi} + {{c1::1}} = 0\)`, ''],
        };
        const question = renderCardHtml(noteType, note, 0, 'question');
        const answer = renderCardHtml(noteType, note, 0, 'answer');
        expect(question).toContain(String.raw`\(e^{i\pi} + [...] = 0\)`);
        expect(answer).toContain(String.raw`\(e^{i\pi} + 1 = 0\)`);
        expect(containsMathDelimiters(question) && containsMathDelimiters(answer)).toBe(true);
    });
});

describe('mathJaxCardCss', () => {
    it('hides the card until MathJax is done, with a script-free way back', () => {
        const css = mathJaxCardCss('ready');
        expect(css).toContain(`<style id="${MATHJAX_PENDING_STYLE_ID}"`);
        expect(css).toMatch(/opacity:0;animation:tus-mathjax-reveal 0s linear \d+ms forwards/);
        expect(css).toContain('@keyframes tus-mathjax-reveal{to{opacity:1;}}');
        // !important would outrank the animation, and the card would stay hidden without a script.
        expect(css).not.toContain('!important');
    });

    it('lets wide display math scroll inside its own box', () => {
        expect(mathJaxCardCss('ready')).toContain(':where(mjx-container[display="true"]){max-width:100%;overflow-x:auto;');
    });

    it('differs before and after MathJax is read, so the WebView loads the new document', () => {
        expect(mathJaxCardCss('loading')).not.toBe(mathJaxCardCss('ready'));
        expect(mathJaxCardCss('"><script>')).toContain('data-state="script"');
    });
});

/** A card document small enough to run the injected script against. */
function fakeCardDocument(readyState: 'loading' | 'interactive') {
    const pending = { parentNode: null as unknown as { removeChild: (node: unknown) => void } };
    const removed: unknown[] = [];
    pending.parentNode = { removeChild: (node) => removed.push(node) };
    const qa = { id: 'qa' };
    const listeners = new Map<string, Array<() => void>>();
    const dispatched: string[] = [];
    const document = {
        readyState,
        body: { id: 'body' },
        getElementById: (id: string) => (id === MATHJAX_PENDING_STYLE_ID && removed.length === 0 ? pending : id === 'qa' ? qa : null),
        addEventListener: (type: string, listener: () => void) => {
            listeners.set(type, [...(listeners.get(type) ?? []), listener]);
        },
        dispatchEvent: (event: { type: string }) => { dispatched.push(event.type); return true; },
    };
    const window: Record<string, unknown> = {};
    return {
        window, document, qa, removed, dispatched,
        fire: (type: string) => { for (const listener of listeners.get(type) ?? []) listener(); },
    };
}

function runCardScript(source: string, readyState: 'loading' | 'interactive' = 'interactive') {
    const card = fakeCardDocument(readyState);
    class FakeEvent { constructor(public type: string) {} }
    // eslint-disable-next-line no-new-func
    new Function('window', 'document', 'Event', 'setTimeout', cardMathJaxScript(source))(
        card.window, card.document, FakeEvent, setTimeout,
    );
    return card;
}

/** Stands in for MathJax: it reads the configuration it was given and typesets on request. */
const FAKE_MATHJAX = `
    var config = window.MathJax;
    window.__seenConfig = config;
    window.__typeset = [];
    window.MathJax = {
        startup: { promise: Promise.resolve() },
        typesetPromise: function (elements) { window.__typeset.push(elements); return Promise.resolve(); },
    };`;

describe('cardMathJaxScript', () => {
    it('typesets #qa once the document is parsed, then shows the card and tells the reporters', async () => {
        const card = runCardScript(FAKE_MATHJAX, 'loading');
        const typeset = card.window.__tusMathJaxTypeset as Promise<boolean>;
        expect(typeset).toBeInstanceOf(Promise);
        expect(card.window.__typeset).toBeUndefined();
        card.fire('DOMContentLoaded');
        await expect(typeset).resolves.toBe(true);
        expect(card.window.__typeset).toEqual([[card.qa]]);
        expect(card.removed).toHaveLength(1);
        expect(card.dispatched).toEqual([MATHJAX_TYPESET_EVENT]);
        const config = card.window.__seenConfig as { startup: { typeset: boolean }; loader: { require: unknown } };
        expect(config.startup.typeset).toBe(false);
        expect(typeof config.loader.require).toBe('function');
    });

    it('keeps the TeX source readable when MathJax throws, fails or never starts', async () => {
        for (const source of [
            'throw new Error("broken");',
            'window.MathJax = {};',
            'window.MathJax = { startup: { promise: Promise.reject(new Error("no")) }, typesetPromise: function () {} };',
            'window.MathJax = { startup: { promise: Promise.resolve() }, typesetPromise: function () { return Promise.reject(new Error("bad")); } };',
        ]) {
            const card = runCardScript(source);
            await expect(card.window.__tusMathJaxTypeset as Promise<boolean>, source).resolves.toBe(false);
            expect(card.removed, source).toHaveLength(1);
            expect(card.dispatched, source).toEqual([MATHJAX_TYPESET_EVENT]);
        }
    });

    it('stops waiting for a renderer that never finishes', async () => {
        vi.useFakeTimers();
        try {
            const card = runCardScript('window.MathJax = { startup: { promise: new Promise(function () {}) } };');
            let settled: boolean | undefined;
            void (card.window.__tusMathJaxTypeset as Promise<boolean>).then((value) => { settled = value; });
            await vi.advanceTimersByTimeAsync(3999);
            expect(settled).toBeUndefined();
            await vi.advanceTimersByTimeAsync(1);
            expect(settled).toBe(false);
            expect(card.removed).toHaveLength(1);
        } finally {
            vi.useRealTimers();
        }
    });

    it('runs the vendored file inside the script, after the configuration, exactly once', () => {
        const source = readFileSync(VENDORED, 'utf8');
        const script = cardMathJaxScript(source);
        const configAt = script.indexOf('window.MathJax = (function(){var config=');
        const sourceAt = script.indexOf(source);
        expect(configAt).toBeGreaterThan(-1);
        expect(sourceAt).toBeGreaterThan(configAt);
        expect(script.indexOf(source, sourceAt + 1)).toBe(-1);
        expect(script.slice(sourceAt + source.length)).toContain("api.typesetPromise(root ? [root] : undefined)");
    });
});
