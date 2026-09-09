/**
 * Markup-level lockdown applied to any document that renders paid catalog content.
 *
 * Both card surfaces are WebViews — the reviewer's `CardWebView` and the editor's read-only
 * `RichTextEditor` — so the rules that stop a learner lifting the text out of them live here
 * once instead of drifting apart in two files.
 *
 * These rules are a deterrent layer, not a boundary: anything rendered on a screen can be
 * retyped or photographed with a second device. The boundary is `lib/catalogProtection.ts`,
 * which stops the content leaving as a file.
 */

/** Blocks selection, callouts, drag-out and printing for every node in the document. */
export const PROTECTED_CONTENT_CSS = `
*, *::before, *::after {
    -webkit-user-select: none !important;
    user-select: none !important;
    -webkit-touch-callout: none !important;
    -webkit-user-drag: none !important;
}
/* An image is the whole answer on a lot of TUS cards. Taps still reach the reviewer because
   the card body handles them, but a long press can no longer offer "Save to Photos". */
img {
    pointer-events: none !important;
}
/* An attached keyboard can reach the print dialog, which renders to a shareable PDF. */
@media print {
    html, body { display: none !important; }
}
`.trim();

/**
 * Cancels the events that copy content out of the document.
 *
 * Capture-phase listeners run before anything a note template registered, and `selectstart`
 * is included because a hardware keyboard can start a selection that never raises a callout.
 */
export const PROTECTED_CONTENT_SCRIPT = `(function(){
    function prevent(event){ if (event) { event.preventDefault(); event.stopPropagation(); } }
    var blocked = ['copy', 'cut', 'beforecopy', 'beforecut', 'contextmenu', 'dragstart', 'selectstart'];
    for (var index = 0; index < blocked.length; index++) {
        document.addEventListener(blocked[index], prevent, true);
    }
    // Select-all from a hardware keyboard bypasses selectstart on WebKit.
    document.addEventListener('keydown', function(event){
        if (!(event.metaKey || event.ctrlKey)) return;
        var key = String(event.key || '').toLowerCase();
        if (key === 'a' || key === 'c' || key === 'x' || key === 'p' || key === 's') prevent(event);
    }, true);
})();`;
