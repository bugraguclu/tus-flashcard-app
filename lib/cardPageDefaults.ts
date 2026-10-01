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
