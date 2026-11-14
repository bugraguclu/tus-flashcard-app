/**
 * MathJax in cards, as Anki renders it (https://docs.ankiweb.net/math.html#mathjax): `\(…\)` is
 * inline math and `\[…\]` display math, typeset from TeX by MathJax 3 with the extensions Anki
 * ships, mhchem's `\ce{…}` among them. `[latex]`, `[$]` and `[$$]` are Anki's separate LaTeX image
 * feature and are left as they are.
 *
 * The renderer is the published MathJax 3.2.2 (Apache-2.0, assets/mathjax/LICENSE): the file
 * `es5/tex-svg-full.js` of the `mathjax` npm package, byte for byte, stored as
 * `assets/mathjax/tex-svg-full.js.txt` so Metro ships it as a file instead of bundling it as app
 * code. SVG output needs no font files and draws in `currentColor`, so a formula takes the card's
 * own text colour in either theme. Nothing is fetched: every TeX extension a card may `\require`
 * is already inside that file, and MathJax's loader is told to refuse anything else.
 *
 * The card boundary stays closed (lib/cardContentSecurity.ts). On iPhone the card document keeps
 * `script-src 'none'`, so nothing a card carries can run, and the app hands MathJax to the
 * WebView itself, the same way it hands over the card's height reporter
 * (`cardMathJaxScript`, lib/mathjaxRuntime.ts). On web the card frame keeps its script-free
 * sandbox and the app page typesets it from outside (lib/mathjaxRuntime.web.ts); the page's own
 * policy runs this one file by its hash (`MATHJAX_SCRIPT_HASH_SOURCE`).
 *
 * Only a side whose HTML holds a delimiter pair loads MathJax, which is Anki's rule too
 * (`_containsMathjax` in ts/reviewer/index.ts), so an ordinary card pays nothing.
 */

/** The vendored MathJax release. */
export const MATHJAX_VERSION = '3.2.2';
/** Length of `es5/tex-svg-full.js` in `mathjax@3.2.2` (ASCII, so characters equal bytes). */
export const MATHJAX_SOURCE_LENGTH = 2_275_113;
/** SHA-256 of that file, base64, as npm published it (integrity sha512-Bt+SSVU8eBG27zChVewO…). */
export const MATHJAX_SOURCE_SHA256 = 'pDVP+U/YaK6gzG6qp5pX/aBYhkb8Ru43AKNJ7goRy+Y=';
/** The web app policy's source for the one inline script it lets MathJax run as. */
export const MATHJAX_SCRIPT_HASH_SOURCE = `'sha256-${MATHJAX_SOURCE_SHA256}'`;

/** Id of the style that keeps a card out of sight until its formulas are typeset. */
export const MATHJAX_PENDING_STYLE_ID = 'tus-mathjax-pending';
/** Dispatched on the card document once typesetting has finished or given up. */
export const MATHJAX_TYPESET_EVENT = 'tus-mathjax-typeset';
/** Window property of the card document: a promise settled when typesetting is over. */
export const MATHJAX_TYPESET_PROMISE = '__tusMathJaxTypeset';

/** How long a card may wait for its formulas before it is shown as it is. */
const PENDING_REVEAL_MS = 1500;
/** How long the iPhone document waits before it stops waiting for MathJax altogether. */
const TYPESET_GIVE_UP_MS = 4000;

const STYLE_BLOCK = /<style\b[^>]*>[\s\S]*?<\/style\s*>/gi;
/** A complete `\(…\)` or `\[…\]` pair, the test Anki's reviewer loads MathJax by. */
const MATH_PAIR = /\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\]/;

/**
 * True when a side's HTML holds inline or display math, so its document needs MathJax. Stylesheets
 * are not searched: MathJax typesets the card's content only, never its CSS.
 */
export function containsMathDelimiters(html: string): boolean {
    if (!html || (!html.includes('\\(') && !html.includes('\\['))) return false;
    return MATH_PAIR.test(html.replace(STYLE_BLOCK, ''));
}

/** From an opening `\(` or `\[` to the nearest `\)` or `\]` after it, whichever kind it is. */
const MATH_SPAN = /(\\[([])([\s\S]*?)(\\[)\]])/g;
/** Comments, style and script blocks, then any other tag. */
const MARKUP = /<!--[\s\S]*?-->|<style\b[\s\S]*?<\/style\s*>|<script\b[\s\S]*?<\/script\s*>|<[^>]*>/gi;

/**
 * What Anki's cloze filter does after it has revealed the deletions: inside every MathJax
 * expression the HTML is removed and the entities are kept (`strip_html_inside_mathjax` in
 * rslib/src/cloze.rs, Anki 26.09.3). A deletion inside a formula therefore reaches MathJax as plain
 * TeX — `[...]` or `[hint]` on the question, its text on the answer — instead of as a `<span>`
 * that would split the formula into pieces MathJax cannot read.
 */
export function stripHtmlInsideMath(html: string): string {
    if (!html.includes('\\(') && !html.includes('\\[')) return html;
    return html.replace(MATH_SPAN, (_match, open: string, inner: string, close: string) => (
        `${open}${inner.replace(MARKUP, '')}${close}`
    ));
}

/**
 * TeX extensions inside tex-svg-full.js that a card may `\require`, all of them except those
 * MathJax itself refuses (base, all-packages, autoload, configmacros, tagformat, setoptions).
 * Any other name is refused while the formula is read, so `\require` never makes MathJax load a
 * file, and only that formula shows its source instead of being typeset.
 */
export const MATHJAX_REQUIRABLE_EXTENSIONS = [
    'action', 'ams', 'amscd', 'bbox', 'boldsymbol', 'braket', 'bussproofs', 'cancel', 'cases',
    'centernot', 'color', 'colortbl', 'colorv2', 'empheq', 'enclose', 'extpfeil', 'gensymb', 'html',
    'mathtools', 'mhchem', 'newcommand', 'noerrors', 'noundefined', 'physics', 'textcomp',
    'textmacros', 'unicode', 'upgreek', 'verb',
] as const;

/**
 * MathJax's options, set up as Anki 26.09.3 sets them (ts/mathjax/index.ts): `\[…\]` is the only
 * display delimiter (no `$$`), `\(…\)` the only inline one, nothing outside a delimiter pair is
 * read (escapes, environments, `\ref`), and the full TeX extension set is on except textmacros.
 * noerrors, part of that set, shows a formula that does not parse as its source. Anki writes HTML
 * with CommonHTML and its web fonts; SVG draws the same TeX glyphs without any font file. The
 * context menu stays off: it would offer settings that load more of MathJax.
 */
const MATHJAX_OPTIONS = {
    loader: { load: [] as string[] },
    tex: {
        inlineMath: [['\\(', '\\)']],
        displayMath: [['\\[', '\\]']],
        processEscapes: false,
        processEnvironments: false,
        processRefs: false,
        packages: { '[-]': ['textmacros'] },
        require: {
            allow: Object.fromEntries(MATHJAX_REQUIRABLE_EXTENSIONS.map((name) => [name, true])),
            defaultAllow: false,
        },
    },
    svg: { fontCache: 'local' },
    options: { enableMenu: false },
    startup: { typeset: false },
};

/** MathJax asks its loader for a file; this answers that none is available here. */
const REFUSE_LOAD_SOURCE = "function(path){throw new Error('MathJax loads nothing here: '+path);}";

/** The configuration object, for a page that sets `window.MathJax` from app code (web). */
export function mathJaxConfig(): Record<string, unknown> {
    const config = JSON.parse(JSON.stringify(MATHJAX_OPTIONS)) as typeof MATHJAX_OPTIONS & {
        loader: { load: string[]; require?: (path: string) => never };
    };
    config.loader.require = (path: string) => {
        throw new Error(`MathJax loads nothing here: ${path}`);
    };
    return config;
}

/** The same configuration as a JavaScript expression, for a script handed to a card document. */
export function mathJaxConfigSource(): string {
    return `(function(){var config=${JSON.stringify(MATHJAX_OPTIONS)};config.loader.require=${REFUSE_LOAD_SOURCE};return config;})()`;
}

/**
 * CSS for a card that has formulas. Wide display math scrolls sideways inside its own box instead
 * of running off a phone screen (MathJax 3 does not break lines). While MathJax works the page is
 * transparent, as Anki fades its card out until `typesetPromise` is done, so the learner never sees
 * the TeX source jump into a formula; the style is removed when typesetting ends, and a CSS
 * animation shows the card anyway after a moment, without any script, so a renderer that never
 * starts cannot hide a card. `state` only tells the documents apart: an iPhone document written
 * before MathJax was read differs from the one written after, so the WebView loads the new one.
 */
export function mathJaxCardCss(state: string): string {
    const safeState = state.replace(/[^a-z-]/gi, '');
    return '<style>:where(mjx-container[display="true"]){max-width:100%;overflow-x:auto;overflow-y:hidden;}</style>'
        + `<style id="${MATHJAX_PENDING_STYLE_ID}" data-state="${safeState}">`
        + `html body{opacity:0;animation:tus-mathjax-reveal 0s linear ${PENDING_REVEAL_MS}ms forwards;}`
        + '@keyframes tus-mathjax-reveal{to{opacity:1;}}</style>';
}

/**
 * The script an iPhone card document is handed before its content loads (react-native-webview's
 * `injectedJavaScriptBeforeContentLoaded`). Scripts the app injects this way run beside the page,
 * not as part of it, so the document's `script-src 'none'` stays in force for everything the card
 * itself carries while MathJax runs.
 *
 * It sets up `window.__tusMathJaxTypeset` straight away, so the answer-anchor and height reporters
 * can wait for it, then starts MathJax once the document is parsed and typesets `#qa`, as Anki's
 * reviewer does. Whatever happens — MathJax throws, never starts, or a formula fails — the promise
 * settles, the pending style goes and the source text stays readable.
 */
export function cardMathJaxScript(source: string): string {
    return `(function(){
if (window.${MATHJAX_TYPESET_PROMISE}) return;
var settle, settled = false;
window.${MATHJAX_TYPESET_PROMISE} = new Promise(function(resolve){ settle = resolve; });
function finish(ok){
    if (settled) return;
    settled = true;
    var pending = document.getElementById('${MATHJAX_PENDING_STYLE_ID}');
    if (pending && pending.parentNode) pending.parentNode.removeChild(pending);
    settle(ok);
    try { document.dispatchEvent(new Event('${MATHJAX_TYPESET_EVENT}')); } catch (error) {}
}
setTimeout(function(){ finish(false); }, ${TYPESET_GIVE_UP_MS});
function start(){
    window.MathJax = ${mathJaxConfigSource()};
    try {
${source}
    } catch (error) {
        finish(false);
        return;
    }
    var api = window.MathJax;
    if (!api || !api.startup || !api.startup.promise) { finish(false); return; }
    api.startup.promise.then(function(){
        var root = document.getElementById('qa') || document.body;
        return api.typesetPromise(root ? [root] : undefined);
    }).then(function(){ finish(true); }, function(){ finish(false); });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
else start();
})();
true;`;
}
