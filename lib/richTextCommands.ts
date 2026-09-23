/**
 * Formatting decisions for the note editor's contenteditable document.
 *
 * `richTextBridgeScript()` is source text rather than an imported function because it has to run
 * inside the WebView. Keeping it here instead of inline in `components/RichTextEditor.tsx` lets
 * `richTextCommands.test.ts` evaluate it against a fake DOM, so the selection, pending-format,
 * history and state-reporting decisions are unit-tested even though the WebKit behaviour they
 * compensate for can only be confirmed on a device.
 *
 * Everything the bridge does not need a live DOM for — the keyboard shortcut table, the marker
 * cleanup — is an ordinary export above, and the bridge script is generated from those exports so
 * there is one definition of each rather than a copy inside the script string.
 */

/** Zero-width space that anchors a pending typing style. Stripped before the field is stored. */
export const PENDING_STYLE_MARKER = String.fromCharCode(0x200b);

/** Toolbar toggles whose effect at a collapsed caret is a pending typing style, not a DOM edit. */
export const TYPING_STYLE_COMMANDS = [
    'bold', 'italic', 'underline', 'strikeThrough', 'superscript', 'subscript',
] as const;

/** Inline toggles the toolbar reports state for. */
export const INLINE_STATE_COMMANDS = [
    'bold', 'italic', 'underline', 'strikeThrough', 'superscript', 'subscript',
] as const;

/** List and alignment commands the toolbar reports state for. */
export const BLOCK_STATE_COMMANDS = [
    'insertUnorderedList', 'insertOrderedList',
    'justifyLeft', 'justifyCenter', 'justifyRight', 'justifyFull',
] as const;

/**
 * A run of typing shorter than this is one undo step, the way a word processor coalesces typing.
 * Every toolbar command is its own step regardless.
 */
export const TYPING_RUN_COALESCE_MS = 900;

/**
 * Cap on the selected text posted with each caret reading.
 *
 * Only Change Case reads it, and no realistic run of prose a user means to recase is longer than
 * this. The cap is what keeps a select-all on a large field from shipping the whole document
 * across the bridge on every caret move.
 */
export const MAX_SELECTION_TEXT = 20000;

/** Block containers the caret can sit in that the Styles tab knows how to name. */
export const BLOCK_CONTAINER_TAGS = ['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'li'] as const;

export interface EditorShortcut {
    /** `KeyboardEvent.key`, compared case-insensitively. */
    key: string;
    shift?: boolean;
    alt?: boolean;
    command: string;
    value?: string;
}

/**
 * Hardware-keyboard shortcuts, matched with Cmd (iPad/iPhone keyboards) or Ctrl.
 *
 * The inline toggles, the alignments, undo/redo and the heading levels follow Microsoft Word.
 * Where Word's binding cannot be observed in a WebView — Ctrl+Spacebar for clear formatting, and
 * Word's list shortcuts, which collide with WebKit's own — the widely used editor equivalent is
 * bound instead, and both Word's Ctrl+M/Ctrl+Shift+M and the bracket keys move the indent.
 */
export const EDITOR_SHORTCUTS: EditorShortcut[] = [
    { key: 'b', command: 'bold' },
    { key: 'i', command: 'italic' },
    { key: 'u', command: 'underline' },
    { key: 'x', shift: true, command: 'strikeThrough' },
    { key: '=', command: 'subscript' },
    { key: '=', shift: true, command: 'superscript' },
    { key: '+', shift: true, command: 'superscript' },
    { key: 'z', command: 'undo' },
    { key: 'z', shift: true, command: 'redo' },
    { key: 'y', command: 'redo' },
    { key: '7', shift: true, command: 'insertOrderedList' },
    { key: '8', shift: true, command: 'insertUnorderedList' },
    { key: 'l', command: 'justifyLeft' },
    { key: 'e', command: 'justifyCenter' },
    { key: 'r', command: 'justifyRight' },
    { key: 'j', command: 'justifyFull' },
    { key: 'm', command: 'indent' },
    { key: ']', command: 'indent' },
    { key: 'm', shift: true, command: 'outdent' },
    { key: '[', command: 'outdent' },
    { key: '\\', command: 'removeFormat' },
    { key: '0', alt: true, command: 'formatBlock', value: '<p>' },
    { key: '1', alt: true, command: 'formatBlock', value: '<h1>' },
    { key: '2', alt: true, command: 'formatBlock', value: '<h2>' },
    { key: '3', alt: true, command: 'formatBlock', value: '<h3>' },
    // Word's grow/shrink pair. WebKit reports the key of Ctrl+Shift+. as '>' on some layouts and
    // '.' on others, so both spellings are bound rather than losing the shortcut on one keyboard.
    { key: '>', shift: true, command: 'growFont' },
    { key: '.', shift: true, command: 'growFont' },
    { key: '<', shift: true, command: 'shrinkFont' },
    { key: ',', shift: true, command: 'shrinkFont' },
];

/**
 * Word's Change Case cycle is Shift+F3 with no Ctrl or Cmd, the one binding that does not fit
 * `EDITOR_SHORTCUTS`' modifier contract, so it is matched separately.
 */
export function isChangeCaseShortcut(event: ShortcutKeyEvent): boolean {
    if (event.metaKey || event.ctrlKey || event.altKey) return false;
    return !!event.shiftKey && String(event.key ?? '').toLowerCase() === 'f3';
}

export interface ShortcutKeyEvent {
    key: string;
    metaKey?: boolean;
    ctrlKey?: boolean;
    shiftKey?: boolean;
    altKey?: boolean;
}

/**
 * The command a key press asks for, or null when the editor should let the key through.
 *
 * Only a Cmd/Ctrl press is considered, so ordinary typing — including an Alt-composed character
 * on a hardware keyboard — never loses a keystroke to the toolbar.
 */
export function resolveEditorShortcut(event: ShortcutKeyEvent): { command: string; value?: string } | null {
    if (!event.metaKey && !event.ctrlKey) return null;
    const key = String(event.key ?? '').toLowerCase();
    if (!key) return null;
    const match = EDITOR_SHORTCUTS.find((shortcut) => shortcut.key.toLowerCase() === key
        && Boolean(shortcut.shift) === Boolean(event.shiftKey)
        && Boolean(shortcut.alt) === Boolean(event.altKey));
    if (!match) return null;
    return match.value === undefined ? { command: match.command } : { command: match.command, value: match.value };
}

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
 * The editor document's selection, command, history and state bridge.
 *
 * Four behaviours are worth stating up front, because all four are invisible in the source:
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
 * 3. `queryCommandState` answers for the start of the selection, so a selection that is half bold
 *    reports bold and the toolbar lights up. Word leaves the button unlit for a mixed selection
 *    and the next press applies the format to all of it, so `readSignals()` walks the selected
 *    text nodes and reports a partly covered format as inactive.
 * 4. `queryCommandEnabled('undo')` cannot be trusted inside a WebView, so the bridge counts its
 *    own edits. Toolbar commands are one step each and a typing run inside
 *    `TYPING_RUN_COALESCE_MS` is one step, which is what decides whether Undo is offered as
 *    enabled — WebKit still owns the actual undo stack.
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
  var COVERAGE_SELECTORS = {
    bold: 'b,strong',
    italic: 'i,em',
    underline: 'u,ins',
    strikeThrough: 's,strike,del',
    superscript: 'sup',
    subscript: 'sub'
  };
  var INLINE_STATE_COMMANDS = ${JSON.stringify(INLINE_STATE_COMMANDS)};
  var BLOCK_STATE_COMMANDS = ${JSON.stringify(BLOCK_STATE_COMMANDS)};
  var BLOCK_CONTAINER_TAGS = ${JSON.stringify(BLOCK_CONTAINER_TAGS)};
  var SHORTCUTS = ${JSON.stringify(EDITOR_SHORTCUTS)};
  var TYPING_RUN_COALESCE_MS = ${TYPING_RUN_COALESCE_MS};
  var PENDING_STYLE_MARKER = String.fromCharCode(0x200b);
  var MAX_SELECTION_TEXT = ${MAX_SELECTION_TEXT};
  var savedRange = null;
  var anchorSequence = 0;
  var historyDepth = 0;
  var redoDepth = 0;
  var lastEditKind = '';
  var lastEditStamp = 0;
  // execCommand fires an 'input' event synchronously, so the document's own edit listener would count a
  // toolbar press or an undo a second time. It is muted while the bridge drives the document.
  var suppressAutoEdits = false;

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

  function commandValue(command) {
    try {
      if (typeof doc.queryCommandValue !== 'function') return '';
      return String(doc.queryCommandValue(command) || '');
    } catch (error) {
      return '';
    }
  }

  function execute(command, value) {
    try {
      return !!doc.execCommand(command, false, value === undefined ? null : value);
    } catch (error) {
      return false;
    }
  }

  // ---- history -------------------------------------------------------------------------------
  // WebKit owns the undo stack; these counters only decide whether Undo and Redo are offered as
  // enabled, and they coalesce a typing run into one step the way a word processor does.
  function noteEdit(kind) {
    if (kind === 'typing' && suppressAutoEdits) return;
    var stamp = Date.now();
    var coalesced = kind === 'typing' && lastEditKind === 'typing'
      && (stamp - lastEditStamp) < TYPING_RUN_COALESCE_MS;
    if (!coalesced) historyDepth += 1;
    lastEditKind = kind;
    lastEditStamp = stamp;
    redoDepth = 0;
  }

  function runHistory(command) {
    var wantsUndo = command === 'undo';
    if (wantsUndo ? historyDepth <= 0 : redoDepth <= 0) return false;
    restoreSelection();
    suppressAutoEdits = true;
    var applied = execute(command);
    suppressAutoEdits = false;
    if (!applied) return false;
    if (wantsUndo) { historyDepth -= 1; redoDepth += 1; } else { redoDepth -= 1; historyDepth += 1; }
    // A history step ends the typing run, so the next keystroke starts a new undo step.
    lastEditKind = 'history';
    lastEditStamp = Date.now();
    return true;
  }

  // Wrapper for the document edits that do not go through runCommand — inserted HTML, a wrapped
  // selection, a cloze. They are one undo step each, and the 'input' they raise must not be
  // counted a second time as typing.
  function editDocument(action) {
    suppressAutoEdits = true;
    var result;
    try {
      result = action();
    } finally {
      suppressAutoEdits = false;
    }
    noteEdit('command');
    return result;
  }

  function historyState() {
    return { canUndo: historyDepth > 0, canRedo: redoDepth > 0, depth: historyDepth };
  }

  // ---- state reporting -----------------------------------------------------------------------
  function elementFor(node) {
    if (!node) return null;
    return node.nodeType === 1 ? node : (node.parentElement || node.parentNode || null);
  }

  function ancestorTags(node) {
    var tags = [];
    var walk = elementFor(node);
    var guard = 0;
    while (walk && walk !== editor && walk.nodeType === 1 && guard < 64) {
      tags.push(String(walk.tagName || '').toLowerCase());
      walk = walk.parentElement || walk.parentNode;
      guard += 1;
    }
    return tags;
  }

  function countTags(tags, wanted) {
    var total = 0;
    for (var index = 0; index < tags.length; index += 1) {
      if (wanted.indexOf(tags[index]) !== -1) total += 1;
    }
    return total;
  }

  // Word reports the font of the caret, not of the field, so the ribbon shows what the next
  // character will look like. Inline style is read rather than getComputedStyle on purpose: only a
  // declaration this editor wrote counts as "the user chose this", and an inherited value from
  // the deck's own stylesheet must leave the control showing its default.
  function inlineStyleAt(node, property) {
    var walk = elementFor(node);
    var guard = 0;
    while (walk && walk !== editor && walk.nodeType === 1 && guard < 64) {
      var declared = walk.style ? String(walk.style[property] || '') : '';
      if (declared) return declared;
      walk = walk.parentElement || walk.parentNode;
      guard += 1;
    }
    return '';
  }

  // The blocks a selection touches, for the paragraph-level controls. A collapsed caret yields
  // the one block it sits in; a selection spanning three paragraphs yields all three, which is
  // what makes line spacing behave the way Word's paragraph menu does rather than only changing
  // the paragraph the selection happens to start in.
  function blockElementsInRange(range) {
    var blocks = [];
    if (!range) return blocks;

    function blockFor(node) {
      var walk = elementFor(node);
      var guard = 0;
      while (walk && walk !== editor && walk.nodeType === 1 && guard < 64) {
        if (BLOCK_CONTAINER_TAGS.indexOf(String(walk.tagName || '').toLowerCase()) !== -1) return walk;
        walk = walk.parentElement || walk.parentNode;
        guard += 1;
      }
      return null;
    }

    function push(element) {
      if (element && blocks.indexOf(element) === -1) blocks.push(element);
    }

    push(blockFor(range.startContainer));
    if (range.collapsed) return blocks;
    push(blockFor(range.endContainer));

    var container = elementFor(range.commonAncestorContainer);
    if (!container || typeof doc.createTreeWalker !== 'function') return blocks;
    var walker;
    try {
      walker = doc.createTreeWalker(container, 4 /* NodeFilter.SHOW_TEXT */, null);
    } catch (error) {
      return blocks;
    }
    var node = walker.nextNode ? walker.nextNode() : null;
    var guard = 0;
    while (node && guard < 4096) {
      if (String(node.nodeValue || '').trim() && rangeHoldsNode(range, node)) push(blockFor(node));
      node = walker.nextNode ? walker.nextNode() : null;
      guard += 1;
    }
    return blocks;
  }

  // Paragraph-level formatting execCommand has no verb for. An empty value removes the
  // declaration instead of writing an empty one, so "reset to default" leaves clean HTML.
  //
  // Known limitation: WebKit's undo stack only records its own editing commands, and there is no
  // command for this one. Undo therefore steps over a spacing change to the edit before it. The
  // alternative — rebuilding each block through insertHTML so WebKit records it — would throw
  // away the caret and every inline style in the block, which is a worse trade than an undo that
  // skips one step.
  function applyBlockStyle(property, value) {
    var restored = restoreSelection();
    var blocks = blockElementsInRange(editorRange());
    if (!blocks.length) return { restored: restored, applied: false };
    editDocument(function () {
      for (var index = 0; index < blocks.length; index += 1) {
        var style = blocks[index].style;
        if (!style) continue;
        if (value) style[property] = value;
        else if (typeof style.removeProperty === 'function') style.removeProperty(hyphenate(property));
        else style[property] = '';
      }
      return true;
    });
    return { restored: restored, applied: true };
  }

  // Change Case replaces a run of text and leaves it selected, the way Word does, so the next
  // Shift+F3 keeps rotating the same run instead of finding a collapsed caret and doing nothing.
  //
  // insertText is used rather than writing a text node directly because WebKit only records its
  // own editing commands on the undo stack: a hand-built node would leave Change Case invisible
  // to Undo. insertText collapses the caret to the end of what it wrote, so the selection is
  // extended back over it afterwards to restore Word's behaviour.
  function replaceSelectionText(text) {
    var restored = restoreSelection();
    var range = editorRange();
    if (!range || range.collapsed) return { restored: restored, applied: false };
    var value = String(text);
    var applied = editDocument(function () { return execute('insertText', value); });
    if (!applied) return { restored: restored, applied: false };
    reselectPrecedingText(value.length);
    return { restored: restored, applied: true };
  }

  // Walk back the given number of characters from the caret and select what was just written.
  // The walk is per text node: insertText may split the run across the document's existing nodes.
  function reselectPrecedingText(length) {
    var selection = activeSelection();
    if (!selection || !selection.rangeCount || length <= 0) return false;
    var end = selection.getRangeAt(0);
    var node = end.endContainer;
    var offset = end.endOffset;
    var remaining = length;
    var guard = 0;
    while (remaining > 0 && node && guard < 256) {
      if (node.nodeType === 3) {
        if (offset >= remaining) { offset -= remaining; remaining = 0; break; }
        remaining -= offset;
        offset = 0;
      }
      if (remaining <= 0) break;
      var previous = previousTextNode(node);
      if (!previous) return false;
      node = previous;
      offset = typeof node.length === 'number' ? node.length : 0;
      guard += 1;
    }
    if (remaining > 0) return false;
    try {
      var selected = doc.createRange();
      selected.setStart(node, offset);
      selected.setEnd(end.endContainer, end.endOffset);
      selection.removeAllRanges();
      selection.addRange(selected);
      savedRange = selected.cloneRange();
      return true;
    } catch (error) {
      return false;
    }
  }

  function previousTextNode(from) {
    var node = from;
    var guard = 0;
    while (node && node !== editor && guard < 512) {
      if (node.previousSibling) {
        node = node.previousSibling;
        while (node.lastChild) node = node.lastChild;
        if (node.nodeType === 3) return node;
      } else {
        node = node.parentNode;
      }
      guard += 1;
    }
    return null;
  }

  function hyphenate(property) {
    return String(property).replace(/[A-Z]/g, function (letter) { return '-' + letter.toLowerCase(); });
  }

  function blockTagFor(range) {
    var tags = ancestorTags(range ? range.startContainer : null);
    for (var index = 0; index < tags.length; index += 1) {
      if (BLOCK_CONTAINER_TAGS.indexOf(tags[index]) !== -1) return tags[index];
    }
    return commandValue('formatBlock').toLowerCase();
  }

  // Word leaves an inline button unlit when the selection is only partly formatted, and the next
  // press then applies the format to all of it. queryCommandState answers for the selection start
  // only, so the selected text nodes are walked to tell "all of it" from "some of it".
  function partialInlineCommands(range) {
    if (!range || range.collapsed) return [];
    if (typeof doc.createTreeWalker !== 'function' || typeof doc.createRange !== 'function') return [];
    var container = elementFor(range.commonAncestorContainer);
    if (!container || typeof container.querySelector !== 'function') return [];
    var walker;
    try {
      walker = doc.createTreeWalker(container, 4 /* NodeFilter.SHOW_TEXT */, null);
    } catch (error) {
      return [];
    }
    var covered = {};
    var seen = 0;
    for (var command in COVERAGE_SELECTORS) { covered[command] = 0; }
    var node = walker.nextNode ? walker.nextNode() : null;
    var guard = 0;
    while (node && guard < 4096) {
      guard += 1;
      var text = String(node.nodeValue || '').split(PENDING_STYLE_MARKER).join('');
      if (text.trim() && rangeHoldsNode(range, node)) {
        seen += 1;
        var parent = elementFor(node);
        for (var key in COVERAGE_SELECTORS) {
          if (parent && typeof parent.closest === 'function' && parent.closest(COVERAGE_SELECTORS[key])) {
            covered[key] += 1;
          }
        }
      }
      node = walker.nextNode ? walker.nextNode() : null;
    }
    if (seen < 2) return [];
    var partial = [];
    for (var name in covered) {
      if (covered[name] > 0 && covered[name] < seen) partial.push(name);
    }
    return partial;
  }

  function rangeHoldsNode(range, node) {
    try {
      var probe = doc.createRange();
      probe.selectNodeContents(node);
      // Strict on both sides: a node that merely touches the selection boundary is outside it,
      // and counting it would report a uniformly formatted selection as partly formatted.
      return range.compareBoundaryPoints(3 /* END_TO_START */, probe) < 0
        && range.compareBoundaryPoints(1 /* START_TO_END */, probe) > 0;
    } catch (error) {
      return true;
    }
  }

  function readSignals() {
    var range = editorRange();
    if (!range) {
      var idle = historyState();
      return {
        inEditor: false, collapsed: true, active: [], partial: [], block: null,
        listDepth: 0, quoteDepth: 0, canUndo: idle.canUndo, canRedo: idle.canRedo,
        fontSize: '', fontFamily: '', lineHeight: '', selectionText: '', selectionLength: 0
      };
    }
    var partial = partialInlineCommands(range);
    var active = [];
    var index;
    for (index = 0; index < INLINE_STATE_COMMANDS.length; index += 1) {
      var inline = INLINE_STATE_COMMANDS[index];
      if (commandState(inline) && partial.indexOf(inline) === -1) active.push(inline);
    }
    for (index = 0; index < BLOCK_STATE_COMMANDS.length; index += 1) {
      if (commandState(BLOCK_STATE_COMMANDS[index])) active.push(BLOCK_STATE_COMMANDS[index]);
    }
    var tags = ancestorTags(range.startContainer);
    var history = historyState();
    var selectionText = range.collapsed
      ? ''
      : String(range.toString() || '').split(PENDING_STYLE_MARKER).join('');
    return {
      inEditor: true,
      collapsed: !!range.collapsed,
      active: active,
      partial: partial,
      block: blockTagFor(range) || null,
      listDepth: countTags(tags, ['ul', 'ol']),
      quoteDepth: countTags(tags, ['blockquote']),
      fontSize: inlineStyleAt(range.startContainer, 'fontSize'),
      fontFamily: inlineStyleAt(range.startContainer, 'fontFamily'),
      lineHeight: inlineStyleAt(range.startContainer, 'lineHeight'),
      // Change Case needs the text itself, and it is the only control that does. The cap keeps a
      // select-all on a long field from posting the whole document on every caret move. The full
      // length travels with it: a truncated reading must grey the button out rather than let it
      // write the shortened text back over the whole selection.
      selectionText: selectionText.slice(0, MAX_SELECTION_TEXT),
      selectionLength: selectionText.length,
      canUndo: history.canUndo,
      canRedo: history.canRedo
    };
  }

  // ---- commands ------------------------------------------------------------------------------
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
    if (command === 'undo' || command === 'redo') {
      var moved = runHistory(command);
      return { restored: 'keep-live', applied: moved, repair: 'none', state: false, history: true };
    }
    var restored = restoreSelection();
    var range = editorRange();
    var pendingStyle = !!range && !!range.collapsed && !!TYPING_STYLE_TAGS[command];
    var before = pendingStyle ? commandState(command) : false;
    suppressAutoEdits = true;
    var applied = execute(command, value);
    if (!pendingStyle) {
      suppressAutoEdits = false;
      // Every toolbar press that changed the document is its own undo step, exactly as a word
      // processor treats a ribbon click; a press that changed nothing must not shadow the last one.
      if (applied) noteEdit('command');
      return { restored: restored, applied: applied, repair: 'none', state: commandState(command) };
    }
    var after = commandState(command);
    // Turning a format on is repairable: the caret can be parked inside a wrapper. Turning one
    // off is not, because there is no wrapper to step out of, so the document's real state is
    // reported instead of pretending the press took effect.
    var repairable = !before && after === before;
    var repair = repairable ? (anchorPendingStyle(command) ? 'anchor' : 'failed') : 'none';
    suppressAutoEdits = false;
    if (applied || repair === 'anchor') noteEdit('command');
    return { restored: restored, applied: applied, repair: repair, state: commandState(command) };
  }

  function resolveShortcut(event) {
    if (!event || (!event.metaKey && !event.ctrlKey)) return null;
    var key = String(event.key || '').toLowerCase();
    if (!key) return null;
    for (var index = 0; index < SHORTCUTS.length; index += 1) {
      var shortcut = SHORTCUTS[index];
      if (shortcut.key.toLowerCase() !== key) continue;
      if (!!shortcut.shift !== !!event.shiftKey) continue;
      if (!!shortcut.alt !== !!event.altKey) continue;
      return { command: shortcut.command, value: shortcut.value };
    }
    return null;
  }

  // Word starts a normal paragraph after a heading and leaves a quote or a code block once the
  // line is empty. WebKit keeps the caret in the same block instead. The default insertion is
  // allowed to happen first, so a failure here still leaves the user with their new line.
  function normalizeBlockAfterEnter() {
    var range = editorRange();
    if (!range || !range.collapsed) return false;
    var element = elementFor(range.startContainer);
    var guard = 0;
    while (element && element !== editor && element.nodeType === 1 && guard < 32) {
      var tag = String(element.tagName || '').toLowerCase();
      if (tag === 'li') return false;
      if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre'].indexOf(tag) !== -1) {
        var text = String(element.textContent || '').split(PENDING_STYLE_MARKER).join('');
        if (text.trim()) return false;
        execute('formatBlock', '<p>');
        if (tag === 'blockquote') execute('outdent');
        return true;
      }
      element = element.parentElement || element.parentNode;
      guard += 1;
    }
    return false;
  }

  return {
    saveSelection: saveSelection,
    clearSavedRange: clearSavedRange,
    restoreSelection: restoreSelection,
    runCommand: runCommand,
    isSameRange: isSameRange,
    noteEdit: noteEdit,
    editDocument: editDocument,
    historyState: historyState,
    readSignals: readSignals,
    applyBlockStyle: applyBlockStyle,
    replaceSelectionText: replaceSelectionText,
    resolveShortcut: resolveShortcut,
    normalizeBlockAfterEnter: normalizeBlockAfterEnter
  };
}
`;
}
