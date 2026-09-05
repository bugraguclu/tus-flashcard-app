import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { InteractionManager, Platform, StyleSheet, TextInput, View } from 'react-native';
import { WebView } from 'react-native-webview';
import type { WebViewMessageEvent } from 'react-native-webview';
import type { ColorScheme } from '../constants/theme';
import { base64ToBytes } from '../lib/files';
import { getMediaBaseUrl, saveMediaBytes } from '../lib/mediaStore';
import { editorContentSecurityPolicy } from '../lib/cardContentSecurity';
import { isLocalMediaDocumentUrl, localMediaWebViewSource } from '../lib/localMediaDocument';
import { sanitizeToolbarSnippet } from '../lib/customToolbar';
import { richTextBridgeScript, stripPendingStyleMarkers } from '../lib/richTextCommands';
import { readEditorFormatState, type EditorFormatState } from '../lib/editorFormatState';
import { sanitizeUntrustedHtml } from '../lib/templates';
import {
    embeddedWebViewLayout,
    stableMeasuredHeight,
    type EmbeddedWebViewScrollMode,
} from '../lib/embeddedWebViewScroll';

export type RichTextCommand =
    | 'bold'
    | 'italic'
    | 'underline'
    | 'strikeThrough'
    | 'insertUnorderedList'
    | 'insertOrderedList'
    | 'superscript'
    | 'subscript'
    | 'insertHorizontalRule'
    | 'removeFormat'
    | 'undo'
    | 'redo'
    | 'foreColor'
    | 'hiliteColor'
    | 'justifyLeft'
    | 'justifyCenter'
    | 'justifyRight'
    | 'justifyFull'
    | 'indent'
    | 'outdent'
    | 'formatBlock'
    | 'cloze';

export interface RichTextEditorHandle {
    focus: () => void;
    blur: () => void;
    runCommand: (command: RichTextCommand, value?: string) => void;
    insertHtml: (html: string) => void;
    wrapSelection: (prefix: string, suffix: string) => void;
    /** Ask the document to resend its caret state, e.g. after the toolbar changes fields. */
    requestFormatState: () => void;
}

interface RichTextEditorProps {
    value: string;
    onChange: (html: string) => void;
    onFocus?: () => void;
    onFormatStateChange?: (state: EditorFormatState) => void;
    placeholder: string;
    colors: ColorScheme;
    minHeight?: number;
    fontSize?: number;
    capitalizeSentences?: boolean;
    pasteClipboardImagesAsPng?: boolean;
    /** Keep the same vertical scroll owner across native fallback and WebView rendering. */
    scrollMode: EmbeddedWebViewScrollMode;
    /** Maximum growing viewport height when `scrollMode` is `contained`. */
    maxHeight?: number;
    /** Stagger native WebView startup when a screen contains multiple editor fields. */
    mountDelayMs?: number;
}

function safeJsValue(value: string): string {
    return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
}

const MAX_EDITOR_HTML_CHARS = 2 * 1024 * 1024;
const MAX_EDITOR_MESSAGE_CHARS = 36 * 1024 * 1024;

function createEditorNonce(): string {
    const bytes = new Uint8Array(16);
    globalThis.crypto?.getRandomValues?.(bytes);
    if (bytes.some(Boolean)) return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
}

function editorDocument(
    value: string,
    placeholder: string,
    colors: ColorScheme,
    fontSize: number,
    capitalizeSentences: boolean,
    minHeight: number,
    pasteClipboardImagesAsPng: boolean,
    nonce: string,
    scrollMode: EmbeddedWebViewScrollMode,
): string {
    const policy = editorContentSecurityPolicy(nonce);
    const safeValue = sanitizeUntrustedHtml(value).slice(0, MAX_EDITOR_HTML_CHARS);
    return `<!doctype html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no" />
<meta http-equiv="Content-Security-Policy" content="${policy}" />
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: ${colors.bgCard}; color: ${colors.textPrimary}; overflow: ${scrollMode === 'contained' ? 'auto' : 'hidden'}; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
  #editor {
    min-height: ${Math.max(48, minHeight - 2)}px;
    padding: 8px 2px;
    outline: none;
    font-size: ${fontSize}px;
    line-height: 1.45;
    overflow-wrap: anywhere;
    -webkit-user-select: text;
  }
  #editor:empty::before { content: attr(data-placeholder); color: ${colors.textMuted}; pointer-events: none; }
  #editor img, #editor video { max-width: 100%; height: auto; }
  #editor audio { max-width: 100%; vertical-align: middle; }
  .tus-audio-wrap { display: inline-flex; align-items: center; gap: 8px; max-width: 100%; margin: 4px 0; vertical-align: middle; }
  .tus-audio-wrap audio { max-width: calc(100% - 68px); }
  .tus-audio-speed-btn { display: inline-flex; align-items: center; justify-content: center; padding: 3px 8px; font-size: 12px; font-weight: 600; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: ${colors.accent}; background: rgba(0, 0, 0, 0.06); border: 1px solid ${colors.border}; border-radius: 12px; cursor: pointer; user-select: none; -webkit-user-select: none; white-space: nowrap; line-height: 1.3; }
  .tus-audio-speed-btn:active { opacity: 0.7; }
  #editor hr { border: 0; border-top: 1px solid ${colors.border}; margin: 10px 0; }
  #editor ul, #editor ol { padding-left: 24px; }
</style>
</head>
<body>
  <div id="editor" contenteditable="true" autocapitalize="${capitalizeSentences ? 'sentences' : 'none'}" spellcheck="true" data-placeholder=${safeJsValue(placeholder)}></div>
  <script nonce="${nonce}">
    ${richTextBridgeScript()}
    (function () {
      const editor = document.getElementById('editor');
      // Selection and pending-format handling lives in lib/richTextCommands.ts so it can be
      // unit-tested against a fake DOM; see the WebKit notes there for why it is not inline.
      const bridge = createTusFormattingBridge(editor, document);
      let lastHeight = 0;
      let lastState = '';
      editor.innerHTML = ${safeJsValue(safeValue)};

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

      function post(payload) {
        window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify(payload));
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
          const height = Math.max(${minHeight}, Math.ceil(editor.scrollHeight));
          if (height !== lastHeight) {
            lastHeight = height;
            post({ type: 'height', height: height });
          }
        });
      }

      function emitChange() {
        saveSelection();
        post({ type: 'change', html: cleanForExport(editor.innerHTML) });
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

      window.__tusEditorInsertHtml = function (html) {
        restoreSelection();
        let processedHtml = html;
        if (typeof html === 'string') {
          processedHtml = html.replace(/\[sound:([^\]]+)\]/gi, function (_, fn) {
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
        const shortcut = bridge.resolveShortcut(event);
        if (shortcut) {
          event.preventDefault();
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
        if (!${pasteClipboardImagesAsPng ? 'true' : 'false'}) return;
        const items = Array.from((event.clipboardData && event.clipboardData.items) || [])
          .filter(function (item) { return item.kind === 'file' && /^image\//i.test(item.type || ''); });
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
    })();
  </script>
</body>
</html>`;
}

const RichTextEditor = forwardRef<RichTextEditorHandle, RichTextEditorProps>(function RichTextEditor({
    value,
    onChange,
    onFocus,
    onFormatStateChange,
    placeholder,
    colors,
    minHeight = 58,
    fontSize = 16,
    capitalizeSentences = true,
    pasteClipboardImagesAsPng = false,
    scrollMode,
    maxHeight,
    mountDelayMs = 0,
}, ref) {
    const webViewRef = useRef<WebView>(null);
    const fallbackInputRef = useRef<TextInput>(null);
    const lastEditorValueRef = useRef(value);
    const latestValueRef = useRef(value);
    const editorReadyRef = useRef(false);
    const pendingScriptsRef = useRef<string[]>([]);
    const pastedImageSequenceRef = useRef(0);
    const editorNonceRef = useRef(createEditorNonce());
    latestValueRef.current = value;
    const [contentHeight, setContentHeight] = useState(minHeight);
    const containedLimit = Math.max(minHeight, maxHeight ?? 320);
    const layout = embeddedWebViewLayout({
        scrollMode,
        minHeight,
        measuredHeight: contentHeight,
        initialHeight: minHeight,
        containedHeight: scrollMode === 'contained' ? contentHeight : containedLimit,
    });
    const { frameHeight, scrollEnabled: scrollsInside } = layout;
    const updateContentHeight = (reportedHeight: number) => {
        const boundedHeight = scrollMode === 'contained'
            ? Math.min(containedLimit, reportedHeight)
            : reportedHeight;
        setContentHeight((current) => stableMeasuredHeight(current, boundedHeight, minHeight) ?? minHeight);
    };
    const [webViewMounted, setWebViewMounted] = useState(Platform.OS === 'web');
    const [isReady, setIsReady] = useState(false);
    const fallbackFocusedRef = useRef(false);
    const mountPendingRef = useRef(false);
    // The native input covers the first WebView hand-off only. Later document reloads (font size,
    // capitalization, theme) rebuild `source` while a usable editor is already on screen, and
    // bringing the fallback back would flash the field's raw HTML markup over it.
    const handedOffRef = useRef(false);
    const completeHandoff = () => {
        handedOffRef.current = true;
        setIsReady(true);
    };

    // WKWebView startup is expensive. The add screen contains two (sometimes three) editors;
    // creating all WebContent processes during the navigation animation can stall iOS even
    // though no collection cards are being loaded. Wait for the transition, then let each field
    // opt into a small stagger. The native TextInput keeps the screen immediately interactive.
    useEffect(() => {
        if (webViewMounted || Platform.OS === 'web') return;
        let delayTimer: ReturnType<typeof setTimeout> | null = null;
        const mount = () => {
            if (fallbackFocusedRef.current) {
                mountPendingRef.current = true;
                return;
            }
            setWebViewMounted(true);
        };
        const interaction = InteractionManager.runAfterInteractions(() => {
            delayTimer = setTimeout(mount, Math.max(0, mountDelayMs));
        });
        // A continuously animated parent must not leave the rich editor in fallback mode forever.
        const deadlineTimer = setTimeout(mount, 1_200 + Math.max(0, mountDelayMs));
        return () => {
            interaction.cancel();
            if (delayTimer) clearTimeout(delayTimer);
            clearTimeout(deadlineTimer);
        };
    }, [mountDelayMs, webViewMounted]);
    // Fields store media the way Anki does — a bare filename — so the document is loaded from the
    // media directory and the WebView resolves those names itself. The field HTML is never
    // rewritten, which is what keeps an absolute path out of the saved note.
    const mediaBaseUrl = getMediaBaseUrl();
    const source = useMemo(
        () => localMediaWebViewSource(
            editorDocument(value, placeholder, colors, fontSize, capitalizeSentences, minHeight, pasteClipboardImagesAsPng, editorNonceRef.current, scrollMode),
            mediaBaseUrl,
        ),
        // Recreate only when visual language/theme changes. Controlled value changes are injected
        // below so typing never reloads the WebView or loses its selection.
        [colors, placeholder, fontSize, capitalizeSentences, minHeight, pasteClipboardImagesAsPng, scrollMode, mediaBaseUrl],
    );

    useEffect(() => {
        editorReadyRef.current = false;
        if (!handedOffRef.current) setIsReady(false);
    }, [source]);

    const inject = (script: string) => webViewRef.current?.injectJavaScript(`${script}; true;`);
    const runWhenReady = (script: string) => {
        if (!webViewMounted) {
            setWebViewMounted(true);
        }
        if (!editorReadyRef.current) {
            pendingScriptsRef.current.push(script);
            return;
        }
        inject(script);
    };

    useImperativeHandle(ref, () => ({
        focus: () => {
            if (!editorReadyRef.current) {
                fallbackInputRef.current?.focus();
                return;
            }
            runWhenReady('window.__tusEditorFocus && window.__tusEditorFocus()');
        },
        blur: () => {
            fallbackInputRef.current?.blur();
            if (editorReadyRef.current) {
                inject('window.__tusEditorBlur && window.__tusEditorBlur()');
            }
        },
        runCommand: (command, commandValue) => {
            const payload = safeJsValue(JSON.stringify({ command, value: commandValue }));
            runWhenReady(`window.__tusEditorCommand && window.__tusEditorCommand(JSON.parse(${payload}))`);
        },
        insertHtml: (html) => runWhenReady(`window.__tusEditorInsertHtml && window.__tusEditorInsertHtml(${safeJsValue(sanitizeUntrustedHtml(html))})`),
        wrapSelection: (prefix, suffix) => {
            const safePrefix = sanitizeToolbarSnippet(prefix);
            const safeSuffix = sanitizeToolbarSnippet(suffix);
            runWhenReady(
                `window.__tusEditorWrapSelection && window.__tusEditorWrapSelection(${safeJsValue(safePrefix)}, ${safeJsValue(safeSuffix)})`,
            );
        },
        requestFormatState: () => runWhenReady('window.__tusEditorRequestState && window.__tusEditorRequestState()'),
    }));

    useEffect(() => {
        if (value === lastEditorValueRef.current) return;
        lastEditorValueRef.current = value;
        if (!editorReadyRef.current) return;
        inject(`window.__tusEditorSetHtml && window.__tusEditorSetHtml(${safeJsValue(sanitizeUntrustedHtml(value).slice(0, MAX_EDITOR_HTML_CHARS))})`);
    }, [value]);

    const handleMessage = async (event: WebViewMessageEvent) => {
        try {
            if (event.nativeEvent.data.length > MAX_EDITOR_MESSAGE_CHARS) return;
            const message = JSON.parse(event.nativeEvent.data) as {
                type?: string;
                html?: string;
                height?: number;
                state?: unknown;
                dataUrl?: string;
            };
            if (message.type === 'change' && typeof message.html === 'string') {
                if (message.html.length > MAX_EDITOR_HTML_CHARS) return;
                const safeHtml = sanitizeUntrustedHtml(stripPendingStyleMarkers(message.html));
                lastEditorValueRef.current = safeHtml;
                onChange(safeHtml);
            } else if (message.type === 'ready') {
                editorReadyRef.current = true;
                const latestValue = latestValueRef.current;
                lastEditorValueRef.current = latestValue;
                inject(`window.__tusEditorSetHtml && window.__tusEditorSetHtml(${safeJsValue(sanitizeUntrustedHtml(latestValue).slice(0, MAX_EDITOR_HTML_CHARS))})`);
                const pending = pendingScriptsRef.current;
                pendingScriptsRef.current = [];
                pending.forEach(inject);
                if (!fallbackFocusedRef.current) {
                    completeHandoff();
                }
            } else if (message.type === 'focus') {
                onFocus?.();
            } else if (message.type === 'height' && typeof message.height === 'number') {
                updateContentHeight(message.height);
            } else if (message.type === 'state') {
                onFormatStateChange?.(readEditorFormatState(message.state));
            } else if (message.type === 'pasteImage' && pasteClipboardImagesAsPng && typeof message.dataUrl === 'string') {
                const match = message.dataUrl.match(/^data:image\/png;base64,([A-Za-z0-9+/=\s]+)$/);
                if (!match) return;
                const bytes = base64ToBytes(match[1]);
                if (bytes.length === 0 || bytes.length > 25 * 1024 * 1024) return;
                const sequence = pastedImageSequenceRef.current++;
                const filename = `pasted_${Date.now()}_${sequence}.png`;
                await saveMediaBytes(filename, bytes, 'image/png');
                runWhenReady(`window.__tusEditorInsertHtml && window.__tusEditorInsertHtml(${safeJsValue(`<img src="${filename}">`)})`);
            }
        } catch {
            // Ignore non-editor WebView messages.
        }
    };

    return (
        <View style={[styles.frame, { minHeight, height: frameHeight, borderColor: colors.border, backgroundColor: colors.bgCard }]}>
            {webViewMounted && (
                <WebView
                    ref={webViewRef}
                    source={source}
                    originWhitelist={['about:blank', 'file://*']}
                    onMessage={handleMessage}
                    onShouldStartLoadWithRequest={(request) => isLocalMediaDocumentUrl(request.url, mediaBaseUrl)}
                    style={{ backgroundColor: colors.bgCard }}
                    containerStyle={{ backgroundColor: colors.bgCard }}
                    scrollEnabled={scrollsInside}
                    nestedScrollEnabled={scrollsInside}
                    automaticallyAdjustContentInsets={false}
                    contentInsetAdjustmentBehavior="never"
                    keyboardDisplayRequiresUserAction={false}
                    hideKeyboardAccessoryView
                    setSupportMultipleWindows={false}
                    allowsLinkPreview={false}
                    javaScriptCanOpenWindowsAutomatically={false}
                    domStorageEnabled={false}
                    cacheEnabled={false}
                    incognito
                    sharedCookiesEnabled={false}
                    thirdPartyCookiesEnabled={false}
                    mixedContentMode="never"
                    allowUniversalAccessFromFileURLs={false}
                    allowFileAccessFromFileURLs={Platform.OS === 'ios' || Platform.OS === 'android'}
                    allowingReadAccessToURL={mediaBaseUrl || undefined}
                    allowsInlineMediaPlayback={true}
                    mediaPlaybackRequiresUserAction={false}
                    // Android blocks file:// reads by default; field media lives in the app's own
                    // documentDirectory (getMediaBaseUrl), so images need this to render. The CSP
                    // keeps that access passive: field HTML gets no script nonce, no network, and
                    // onShouldStartLoadWithRequest refuses every document but this one.
                    allowFileAccess={Platform.OS === 'android'}
                    allowsPictureInPictureMediaPlayback={false}
                    allowsAirPlayForMediaPlayback={false}
                    useSharedProcessPool={false}
                    webviewDebuggingEnabled={__DEV__}
                    bounces={false}
                />
            )}
            {(!webViewMounted || !isReady) && (
                <View
                    style={webViewMounted ? [StyleSheet.absoluteFill, { backgroundColor: colors.bgCard }] : undefined}
                    pointerEvents="auto"
                >
                    <TextInput
                        ref={fallbackInputRef}
                        value={value}
                        onChangeText={onChange}
                        onFocus={() => {
                            fallbackFocusedRef.current = true;
                            onFocus?.();
                        }}
                        onBlur={() => {
                            fallbackFocusedRef.current = false;
                            if (editorReadyRef.current) {
                                inject(`window.__tusEditorSetHtml && window.__tusEditorSetHtml(${safeJsValue(sanitizeUntrustedHtml(latestValueRef.current).slice(0, MAX_EDITOR_HTML_CHARS))})`);
                                completeHandoff();
                            }
                            if (mountPendingRef.current) {
                                mountPendingRef.current = false;
                                setWebViewMounted(true);
                            }
                        }}
                        placeholder={placeholder}
                        placeholderTextColor={colors.textMuted}
                        multiline
                        scrollEnabled={scrollsInside}
                        onContentSizeChange={(event) => {
                            updateContentHeight(event.nativeEvent.contentSize.height);
                        }}
                        autoCapitalize={capitalizeSentences ? 'sentences' : 'none'}
                        autoCorrect
                        style={[
                            styles.fallbackInput,
                            {
                                minHeight,
                                height: frameHeight,
                                color: colors.textPrimary,
                                fontSize,
                                lineHeight: Math.round(fontSize * 1.45),
                                backgroundColor: colors.bgCard,
                            },
                        ]}
                    />
                </View>
            )}
        </View>
    );
});

const styles = StyleSheet.create({
    frame: {
        width: '100%',
        overflow: 'hidden',
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    fallbackInput: {
        width: '100%',
        paddingHorizontal: 2,
        paddingVertical: 8,
        textAlignVertical: 'top',
    },
});

export default RichTextEditor;
