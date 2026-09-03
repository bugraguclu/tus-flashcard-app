/**
 * Formatting decisions for the note editor's contenteditable document.
 *
 * `richTextBridgeScript()` is source text rather than an imported function because it has to run
 * inside the WebView. Keeping it here instead of inline in `components/RichTextEditor.tsx` lets
 * `richTextCommands.test.ts` evaluate it against a fake DOM, so the selection and pending-format
 * decisions are unit-tested even though the WebKit behaviour they compensate for can only be
 * confirmed on a device.
 */

/** Zero-width space that anchors a pending typing style. Stripped before the field is stored. */
export const PENDING_STYLE_MARKER = String.fromCharCode(0x200b);

/** Toolbar toggles whose effect at a collapsed caret is a pending typing style, not a DOM edit. */
export const TYPING_STYLE_COMMANDS = [
    'bold', 'italic', 'underline', 'strikeThrough', 'superscript', 'subscript',
] as const;

/**
 * Inline elements that exist only to carry formatting. One left empty by marker removal carried
 * nothing else, so dropping it restores exactly the HTML the field had before the marker.
 */
const INLINE_FORMAT_TAGS = ['b', 'strong', 'i', 'em', 'u', 's', 'strike', 'sub', 'sup', 'span', 'font'];
const EMPTY_INLINE_WRAPPER = new RegExp(`<(${INLINE_FORMAT_TAGS.join('|')})(?:\\s[^>]*)?><\\/\\1\\s*>`, 'gi');

/**
 * Remove the zero-width spaces that armed a pending format, plus any wrapper they left empty.
 *
 * The markers stay in the live DOM — they are what keeps the caret inside `<b>` while the user
 * has typed nothing yet — so the field is cleaned on its way out of the WebView instead. HTML
 * that never carried a marker is returned untouched, so an intentionally empty `<b></b>` in an
 * imported note is only ever removed from a field this editor actually armed.
 */
export function stripPendingStyleMarkers(html: string): string {
    if (!html.includes(PENDING_STYLE_MARKER)) return html;
    let result = html.split(PENDING_STYLE_MARKER).join('');
    // Nested wrappers empty out from the inside, so repeat until the markup stops shrinking.
    for (let pass = 0; pass < 8; pass += 1) {
        const before = result;
        result = result.replace(EMPTY_INLINE_WRAPPER, '');
        if (result === before) break;
    }
    return result;
}

/**
 * The editor document's selection and command bridge.
 *
 * Two behaviours are worth stating up front, because both are invisible in the source:
 *
 * 1. WebKit discards the pending typing style whenever the selection is reassigned.
 *    `defaultSetSelectionOptions()` always carries `SetSelectionOption::ClearTypingStyle`, and
 *    `DOMSelection::removeAllRanges()` routes through `FrameSelection::clear()`, so a
 *    `removeAllRanges()` / `addRange()` pair on an otherwise unchanged caret throws away the bold
 *    a previous toolbar press armed. That is why `restoreSelection()` restores only when the
 *    selection was genuinely lost.
 *    https://github.com/WebKit/WebKit/blob/main/Source/WebCore/editing/FrameSelection.h
 *    https://github.com/WebKit/WebKit/blob/main/Source/WebCore/editing/FrameSelection.cpp
 * 2. `execCommand` at a collapsed caret is not guaranteed to arm anything. `runCommand()`
 *    therefore reads `queryCommandState` before and after, and when a toggle that should have
 *    turned a format on changed nothing, it parks the caret inside an empty inline wrapper. The
 *    toolbar then reports the state the document actually holds.
 *    https://developer.mozilla.org/en-US/docs/Web/API/Document/execCommand
 */
export function richTextBridgeScript(): string {
    return `
function createTusFormattingBridge(editor, doc) {
  var TYPING_STYLE_TAGS = {
    bold: 'b',
    italic: 'i',
    underline: 'u',
    strikeThrough: 's',
    superscript: 'sup',
    subscript: 'sub'
  };
  var PENDING_STYLE_MARKER = String.fromCharCode(0x200b);
  var savedRange = null;
  var anchorSequence = 0;

  function activeSelection() {
    return typeof doc.getSelection === 'function' ? doc.getSelection() : null;
  }

  function insideEditor(node) {
    return !!node && (node === editor || editor.contains(node));
  }

  function editorRange() {
    var selection = activeSelection();
    if (!selection || !selection.rangeCount) return null;
    var range = selection.getRangeAt(0);
    return insideEditor(range.commonAncestorContainer) ? range : null;
  }

  // A live caret only counts while the editor is the focused element of a focused document.
  // activeElement keeps pointing at the editor after the WebView stops being first responder,
  // so document.hasFocus() is what separates "the caret is still where the user left it" from
  // "the caret has to be put back".
  function liveCaretRange() {
    if (doc.activeElement !== editor) return null;
    if (typeof doc.hasFocus === 'function' && !doc.hasFocus()) return null;
    return editorRange();
  }

  function isSameRange(first, second) {
    if (!first || !second) return false;
    return first.startContainer === second.startContainer
      && first.startOffset === second.startOffset
      && first.endContainer === second.endContainer
      && first.endOffset === second.endOffset;
  }

  function saveSelection() {
    var range = editorRange();
    if (!range) return false;
    savedRange = range.cloneRange();
    return true;
  }

  function clearSavedRange() {
    savedRange = null;
  }

  function contentEndRange() {
    var range = doc.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    return range;
  }

  // Reassigning the selection clears WebKit's pending typing style, so the caret is only ever
  // put back when it was genuinely lost. An equal saved range is not a reason to touch it.
  function restoreSelection() {
    var live = liveCaretRange();
    if (live) {
      if (!isSameRange(savedRange, live)) savedRange = live.cloneRange();
      return 'keep-live';
    }
    var reusable = !!savedRange && insideEditor(savedRange.commonAncestorContainer);
    savedRange = reusable ? savedRange : contentEndRange();
    editor.focus();
    var selection = activeSelection();
    if (selection) {
      selection.removeAllRanges();
      selection.addRange(savedRange);
    }
    return reusable ? 'restore-saved' : 'collapse-to-end';
  }

  function commandState(command) {
    try {
      return !!doc.queryCommandState(command);
    } catch (error) {
      return false;
    }
  }

  function execute(command, value) {
    try {
      return !!doc.execCommand(command, false, value === undefined ? null : value);
    } catch (error) {
      return false;
    }
  }

  // Repair path for a collapsed caret: park it inside an empty inline wrapper so the next
  // characters inherit the format even when execCommand armed nothing. The zero-width space is
  // what lets the caret live inside the wrapper; it is stripped again before the field is stored.
  function anchorPendingStyle(command) {
    var tag = TYPING_STYLE_TAGS[command];
    if (!tag) return false;
    anchorSequence += 1;
    var anchorId = '__tus_pending_style_' + anchorSequence;
    execute('insertHTML', '<' + tag + ' id="' + anchorId + '">' + PENDING_STYLE_MARKER + '<\\/' + tag + '>');
    var anchor = doc.getElementById(anchorId);
    if (!anchor) return false;
    anchor.removeAttribute('id');
    var marker = anchor.firstChild;
    if (!marker) return false;
    var caret = doc.createRange();
    caret.setStart(marker, typeof marker.length === 'number' ? marker.length : 0);
    caret.collapse(true);
    var selection = activeSelection();
    if (!selection) return false;
    selection.removeAllRanges();
    selection.addRange(caret);
    savedRange = caret.cloneRange();
    return true;
  }

  function runCommand(command, value) {
    var restored = restoreSelection();
    var range = editorRange();
    var pendingStyle = !!range && !!range.collapsed && !!TYPING_STYLE_TAGS[command];
    var before = pendingStyle ? commandState(command) : false;
    var applied = execute(command, value);
    if (!pendingStyle) {
      return { restored: restored, applied: applied, repair: 'none', state: commandState(command) };
    }
    var after = commandState(command);
    // Turning a format on is repairable: the caret can be parked inside a wrapper. Turning one
    // off is not, because there is no wrapper to step out of, so the document's real state is
    // reported instead of pretending the press took effect.
    var repairable = !before && after === before;
    var repair = repairable ? (anchorPendingStyle(command) ? 'anchor' : 'failed') : 'none';
    return { restored: restored, applied: applied, repair: repair, state: commandState(command) };
  }

  return {
    saveSelection: saveSelection,
    clearSavedRange: clearSavedRange,
    restoreSelection: restoreSelection,
    runCommand: runCommand,
    isSameRange: isSameRange
  };
}
`;
}
