import { richTextBridgeScript } from './richTextCommands';
import { cspHashSource } from './sha256';

/**
 * The script every rich text field document runs — the native WebView and the web iframe alike.
 *
 * It is a constant on purpose. The per-field values (the field HTML, the minimum height, whether
 * the field is editable, whether pasted pictures become PNGs, and on web the host page's origin)
 * travel in a JSON element the document carries, so the script text never changes and its hash
 * can be named in the web app's Content-Security-Policy. A srcdoc iframe inherits its parent
 * page's policy, and the production policy allows no inline script it cannot name by hash.
 */

/** The id of the `<script type="application/json">` element holding the field's config. */
export const RICH_TEXT_EDITOR_CONFIG_ID = 'tus-editor-config';

export interface RichTextEditorDocumentConfig {
    html: string;
    minHeight: number;
    editable: boolean;
    pasteImagesAsPng: boolean;
    /** Web only: the app page's origin, the one target the iframe may post to. */
    hostOrigin?: string;
}

/**
 * Serialize the config for a `<script type="application/json">` element. Escaping `<` and `>`
 * keeps field HTML from closing the element early; the JSON itself is unchanged by it.
 */
export function richTextEditorConfigJson(config: RichTextEditorDocumentConfig): string {
    return JSON.stringify(config)
        .replace(/</g, '\\u003c')
        .replace(/>/g, '\\u003e')
        .replace(/\u2028/g, '\\u2028')
        .replace(/\u2029/g, '\\u2029');
}

export const RICH_TEXT_EDITOR_SCRIPT = `${richTextBridgeScript()}
(function () {
  const configElement = document.getElementById('${RICH_TEXT_EDITOR_CONFIG_ID}');
  const config = JSON.parse((configElement && configElement.textContent) || '{}');
  const editable = config.editable !== false;
  const minHeight = Number(config.minHeight) || 0;
  const editor = document.getElementById('editor');
  // Selection and pending-format handling lives in lib/richTextCommands.ts so it can be
  // unit-tested against a fake DOM; see the WebKit notes there for why it is not inline.
  const bridge = createTusFormattingBridge(editor, document);
  let lastHeight = 0;
  let lastState = '';
  // Numbers each reported edit, so the host can tell a late message from a newer reading.
  let changeSeq = 0;
  editor.innerHTML = typeof config.html === 'string' ? config.html : '';

  function cleanForExport(html) {
    if (!html) return '';
    const temp = document.createElement('div');
    temp.innerHTML = html;
    const wraps = temp.querySelectorAll('.tus-audio-wrap');
    for (let i = 0; i < wraps.length; i++) {
      const wrap = wraps[i];
      const aud = wrap.querySelector('audio');
      if (aud && wrap.parentNode) {
        delete aud.dataset.tusSpeedInit;
        wrap.parentNode.insertBefore(aud, wrap);
        wrap.remove();
      }
    }
    const btns = temp.querySelectorAll('.tus-audio-speed-btn');
    for (let j = 0; j < btns.length; j++) {
      btns[j].remove();
    }
    // The web host shows stored media through object URLs and keeps the filename the field really
    // refers to in data-tus-src, so the saved field names the file again, never the URL.
    const resolved = temp.querySelectorAll('[data-tus-src]');
    for (let k = 0; k < resolved.length; k++) {
      resolved[k].setAttribute('src', resolved[k].getAttribute('data-tus-src') || '');
      resolved[k].removeAttribute('data-tus-src');
    }
    return temp.innerHTML;
  }

  function initAudioControls() {
    const speeds = [0.75, 1.0, 1.25, 1.5, 2.0];
    const audios = editor.querySelectorAll('audio');
    for (let i = 0; i < audios.length; i++) {
      (function (audio) {
        if (audio.dataset.tusSpeedInit) return;
        audio.dataset.tusSpeedInit = 'true';
        let curRate = 1.0;
        audio.playbackRate = curRate;
        audio.defaultPlaybackRate = curRate;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'tus-audio-speed-btn';
        btn.setAttribute('contenteditable', 'false');
        btn.textContent = curRate + 'x';
        btn.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          let idx = speeds.indexOf(audio.playbackRate || 1.0);
          if (idx === -1) idx = 1;
          const next = speeds[(idx + 1) % speeds.length];
          audio.playbackRate = next;
          audio.defaultPlaybackRate = next;
          btn.textContent = next + 'x';
        });
        if (audio.parentNode && !audio.parentNode.classList.contains('tus-audio-wrap')) {
          const wrap = document.createElement('span');
          wrap.className = 'tus-audio-wrap';
          wrap.setAttribute('contenteditable', 'false');
          audio.parentNode.insertBefore(wrap, audio);
          wrap.appendChild(audio);
          wrap.appendChild(btn);
        }
      })(audios[i]);
    }
  }

  initAudioControls();

  function isChangeCaseShortcut(event) {
    if (event.metaKey || event.ctrlKey || event.altKey) return false;
    return !!event.shiftKey && String(event.key || '').toLowerCase() === 'f3';
  }

  // The native WebView injects ReactNativeWebView. The web build runs this document in an iframe
  // of the app page instead and answers through postMessage, addressed to that page's origin only.
  function post(payload) {
    const message = JSON.stringify(payload);
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(message);
    } else if (config.hostOrigin && window.parent && window.parent !== window) {
      window.parent.postMessage({ tusEditor: message }, config.hostOrigin);
    }
  }

  function saveSelection() { bridge.saveSelection(); }

  function restoreSelection() { bridge.restoreSelection(); }

  // Toolbar state follows the caret, not just the last command. A press on a native toolbar
  // button takes first-responder status away from the WebView, so a reading taken while the
  // caret is not in the document would blank every lit button between two presses — the last
  // reading from inside the editor is kept instead, exactly as a ribbon stays lit.
  function reportState(force) {
    const signals = bridge.readSignals();
    if (!signals.inEditor && !force) return;
    const serialized = JSON.stringify(signals);
    if (!force && serialized === lastState) return;
    lastState = serialized;
    post({ type: 'state', state: signals });
  }

  function reportHeight() {
    requestAnimationFrame(function () {
      const height = Math.max(minHeight, Math.ceil(editor.scrollHeight));
      if (height !== lastHeight) {
        lastHeight = height;
        post({ type: 'height', height: height });
      }
    });
  }

  function emitChange() {
    saveSelection();
    changeSeq += 1;
    post({ type: 'change', html: cleanForExport(editor.innerHTML), seq: changeSeq });
    reportState(true);
    reportHeight();
  }

  function insertCloze() {
    restoreSelection();
    const selection = window.getSelection();
    const selectedText = selection && selection.rangeCount ? selection.toString() : '';
    const used = Array.from(editor.innerHTML.matchAll(/\\{\\{c(\\d+)::/gi)).map(function (match) { return Number(match[1]) || 0; });
    const next = used.length ? Math.max.apply(null, used) + 1 : 1;
    bridge.editDocument(function () {
      return document.execCommand('insertText', false, '{{c' + next + '::' + selectedText + '}}');
    });
  }

  window.__tusEditorCommand = function (payload) {
    if (payload.command === 'cloze') {
      insertCloze();
    } else {
      const result = bridge.runCommand(payload.command, payload.value || null);
      if (payload.command === 'hiliteColor' && !result.applied) {
        bridge.runCommand('backColor', payload.value || null);
      }
    }
    emitChange();
  };

  window.__tusEditorRequestState = function () { reportState(true); };

  // The web host reads the field straight from this document before it saves: the message for
  // the last keystroke can still be queued behind the click that saves.
  window.__tusEditorReadHtml = function () {
    return { html: cleanForExport(editor.innerHTML), seq: changeSeq };
  };

  window.__tusEditorReplaceSelectionText = function (text) {
    bridge.replaceSelectionText(text);
    emitChange();
  };

  // Paragraph-level formatting (line spacing). Kept apart from __tusEditorCommand because it
  // is not an execCommand verb and must not go through the pending-typing-style repair path.
  window.__tusEditorBlockStyle = function (property, value) {
    bridge.applyBlockStyle(property, value);
    emitChange();
  };

  window.__tusEditorInsertHtml = function (html) {
    restoreSelection();
    let processedHtml = html;
    if (typeof html === 'string') {
      processedHtml = html.replace(/\\[sound:([^\\]]+)\\]/gi, function (_, fn) {
        return '<audio controls src="' + fn + '" disableRemotePlayback controlsList="nodownload"></audio>';
      });
    }
    bridge.editDocument(function () { return document.execCommand('insertHTML', false, processedHtml); });
    initAudioControls();
    emitChange();
  };

  window.__tusEditorWrapSelection = function (prefix, suffix) {
    restoreSelection();
    const selection = window.getSelection();
    if (!selection || !selection.rangeCount) return;

    const range = selection.getRangeAt(0);
    const selectedContainer = document.createElement('div');
    selectedContainer.appendChild(range.cloneContents());
    const selectedHtml = selectedContainer.innerHTML;
    const markerBase = '__tus_editor_' + Date.now() + '_' + Math.random().toString(36).slice(2);
    const startMarkerId = markerBase + '_start';
    const endMarkerId = markerBase + '_end';

    if (range.collapsed) {
      const cursorMarkerId = markerBase + '_cursor';
      bridge.editDocument(function () {
        return document.execCommand(
          'insertHTML',
          false,
          prefix + '<span id="' + cursorMarkerId + '">&#8203;</span>' + suffix,
        );
      });
      const cursorMarker = document.getElementById(cursorMarkerId);
      if (cursorMarker) {
        const caret = document.createRange();
        caret.setStartBefore(cursorMarker);
        caret.collapse(true);
        cursorMarker.remove();
        selection.removeAllRanges();
        selection.addRange(caret);
      }
    } else {
      bridge.editDocument(function () {
        return document.execCommand(
          'insertHTML',
          false,
          '<span id="' + startMarkerId + '"></span>' + prefix + selectedHtml + suffix + '<span id="' + endMarkerId + '"></span>',
        );
      });
      const startMarker = document.getElementById(startMarkerId);
      const endMarker = document.getElementById(endMarkerId);
      if (startMarker && endMarker) {
        const formattedSelection = document.createRange();
        formattedSelection.setStartAfter(startMarker);
        formattedSelection.setEndBefore(endMarker);
        startMarker.remove();
        endMarker.remove();
        selection.removeAllRanges();
        selection.addRange(formattedSelection);
      }
    }
    saveSelection();
    emitChange();
  };

  window.__tusEditorSetHtml = function (html) {
    if (cleanForExport(editor.innerHTML) === html) return;
    editor.innerHTML = html;
    initAudioControls();
    bridge.clearSavedRange();
    reportHeight();
  };

  window.__tusEditorFocus = function () { editor.focus(); };
  window.__tusEditorBlur = function () {
    if (document.activeElement && typeof document.activeElement.blur === 'function') {
      document.activeElement.blur();
    }
    editor.blur();
  };
  editor.addEventListener('input', function () { bridge.noteEdit('typing'); emitChange(); });
  // A hardware keyboard is the second way this editor is driven, so the shortcut table is the
  // same one the toolbar buttons use and every press lands on the same command path — the
  // toolbar therefore lights up for Cmd+B exactly as it does for a tap.
  editor.addEventListener('keydown', function (event) {
    if (!editable) {
      if ((event.metaKey || event.ctrlKey) && (event.key === 'c' || event.key === 'a')) return;
      event.preventDefault();
      return;
    }
    // Change Case is Shift+F3 in Word, the one binding with no Cmd or Ctrl, so it is matched
    // before the modifier-gated table rather than inside it.
    if (isChangeCaseShortcut(event)) {
      event.preventDefault();
      post({ type: 'shortcut', shortcut: 'changeCase' });
      return;
    }
    const shortcut = bridge.resolveShortcut(event);
    if (shortcut) {
      event.preventDefault();
      // Grow and shrink are not execCommand verbs: the size ladder lives in the toolbar, which
      // is the only side that knows which step comes next. They go back to React as-is.
      if (shortcut.command === 'growFont' || shortcut.command === 'shrinkFont') {
        post({ type: 'shortcut', shortcut: shortcut.command });
        return;
      }
      window.__tusEditorCommand({ command: shortcut.command, value: shortcut.value || null });
      return;
    }
    if (event.key === 'Enter' && !event.shiftKey && !event.metaKey && !event.ctrlKey) {
      // Word starts a normal paragraph after a heading and leaves a quote once the line is
      // empty. The default insertion runs first, so a failed normalization still leaves the
      // user with the new line they asked for.
      setTimeout(function () {
        if (bridge.normalizeBlockAfterEnter()) emitChange();
        else reportState(false);
      }, 0);
    }
  });
  editor.addEventListener('paste', function (event) {
    if (!editable) {
      event.preventDefault();
      return;
    }
    if (!config.pasteImagesAsPng) return;
    const items = Array.from((event.clipboardData && event.clipboardData.items) || [])
      .filter(function (item) { return item.kind === 'file' && /^image\\//i.test(item.type || ''); });
    if (!items.length) return;
    event.preventDefault();
    saveSelection();
    items.forEach(function (item) {
      const file = item.getAsFile();
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function () {
        const image = new Image();
        image.onload = function () {
          const canvas = document.createElement('canvas');
          const sourceWidth = image.naturalWidth || image.width;
          const sourceHeight = image.naturalHeight || image.height;
          const maxDimension = 4096;
          const scale = Math.min(1, maxDimension / Math.max(sourceWidth, sourceHeight));
          canvas.width = Math.max(1, Math.round(sourceWidth * scale));
          canvas.height = Math.max(1, Math.round(sourceHeight * scale));
          const context = canvas.getContext('2d');
          if (!context || !canvas.width || !canvas.height) return;
          context.drawImage(image, 0, 0, canvas.width, canvas.height);
          post({ type: 'pasteImage', dataUrl: canvas.toDataURL('image/png') });
        };
        image.src = String(reader.result || '');
      };
      reader.readAsDataURL(file);
    });
  });
  // The focused field owns the toolbar, so its state is always resent: the previous field's
  // reading is still what the toolbar shows, and a deduplicated report would leave it there.
  editor.addEventListener('focus', function () { post({ type: 'focus' }); reportState(true); });
  editor.addEventListener('blur', saveSelection);
  window.addEventListener('pagehide', saveSelection);
  editor.addEventListener('keyup', function () { saveSelection(); reportState(false); });
  editor.addEventListener('mouseup', function () { saveSelection(); reportState(false); });
  editor.addEventListener('touchend', function () { saveSelection(); reportState(false); });
  document.addEventListener('selectionchange', function () {
    const selection = window.getSelection();
    if (selection && selection.rangeCount && editor.contains(selection.anchorNode)) {
      saveSelection();
      reportState(false);
    }
  });
  if (window.ResizeObserver) new ResizeObserver(reportHeight).observe(editor);
  reportHeight();
  post({ type: 'ready' });
})();`;

/** CSP source that allows exactly {@link RICH_TEXT_EDITOR_SCRIPT} to run. */
export const RICH_TEXT_EDITOR_SCRIPT_HASH = cspHashSource(RICH_TEXT_EDITOR_SCRIPT);
