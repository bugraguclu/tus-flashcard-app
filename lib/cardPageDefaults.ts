import { encodeLocalMediaUrls } from './templateSecurity';

/**
 * The card page's default text colour: the active theme's foreground, which a note type that
 * declares no colour of its own inherits. It is the counterpart of the `body { color: var(--fg) }`
 * Anki loads under every card, and the reason a deck written without a colour stays legible in
 * night mode. `:where()` gives the rule zero specificity, so any colour the note type sets — on
 * `.card`, on `body` or behind `.nightMode` — still wins, wherever this rule sits in the document.
 * https://github.com/ankitects/anki/blob/main/qt/aqt/data/web/css/webview.scss
 */
export function defaultCardTextCss(textColor: string): string {
    return `:where(body){color:${textColor};}`;
}

/**
 * Anki's night-mode rule for the card page. Anki's reviewer stylesheet carries
 * `body.nightMode { background-color: var(--canvas); color: var(--fg); }`, and there the body is
 * the card, so at night the rule outranks a stock `.card { color: black; background-color: white; }`
 * (specificity 0,1,1 against 0,1,0) while a night rule of the note type's own, such as
 * `.nightMode.card` (0,2,0), still wins. Here the card is a `div` inside the page, so the same
 * specificity is `div.nightMode`. The rule belongs before the note type's CSS, where Anki loads it,
 * so a note type's rule of equal weight wins too. The reviewer paints the canvas itself, so the card
 * is made transparent rather than given a canvas colour.
 * https://github.com/ankitects/anki/blob/main/ts/reviewer/reviewer.scss
 */
export function nightModeCardCss(textColor: string): string {
    return `div.nightMode{background-color:transparent;color:${textColor};}`;
}

/**
 * The card page's opening body tag. Anki's reviewer page is
 * `<body class="card card1 nightMode night_mode">`, and note types written for it key their night
 * rules off the body as well as the card (`body.nightMode .box`, `.night_mode img`). The body gets
 * the two night-mode classes here; `card` and `cardN` stay on the card element (lib/templates.ts),
 * because on the body as well a `.card .card` or `.card > div` rule would reach the card itself.
 * https://docs.ankiweb.net/templates/styling.html#night-mode
 */
export function cardPageBodyTag(nightMode: boolean): string {
    return nightMode ? '<body class="nightMode night_mode">' : '<body>';
}

export interface CardDocumentParts {
    /** What belongs in the head: the content security policy, the viewport, the theme's defaults. */
    head: string;
    /** The rendered side and the reviewer's stylesheets. */
    content: string;
    nightMode: boolean;
}

/**
 * The iPhone card document: the head tags, then the body. The WebView loads it as a file in the
 * media folder (lib/localMediaDocument.ts), where the parser supplies `<html>` and `<head>`; the
 * content security policy only counts inside the head, so it stays in front of the body tag. Media
 * names are written as URLs (`encodeLocalMediaUrls`), so a file called "Şekil #3.png" loads.
 */
export function nativeCardDocument({ head, content, nightMode }: CardDocumentParts): string {
    return `${head}${cardPageBodyTag(nightMode)}${encodeLocalMediaUrls(content)}`;
}

/** The web frame's card document, a whole page with the same body as on iPhone. */
export function webCardDocument({ head, content, nightMode }: CardDocumentParts): string {
    return `<!DOCTYPE html><html><head><meta charset="utf-8">${head}</head>`
        + `${cardPageBodyTag(nightMode)}${encodeLocalMediaUrls(content)}</body></html>`;
}
