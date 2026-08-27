import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { InteractionManager, Platform, StyleSheet, TextInput, View } from 'react-native';
import { WebView } from 'react-native-webview';
import type { WebViewMessageEvent } from 'react-native-webview';
import type { ColorScheme } from '../constants/theme';
import { base64ToBytes } from '../lib/files';
import { saveMediaBytes } from '../lib/mediaStore';
import { editorContentSecurityPolicy } from '../lib/cardContentSecurity';
import { sanitizeUntrustedHtml } from '../lib/templates';

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
    | 'cloze';

export interface RichTextEditorHandle {
    focus: () => void;
    runCommand: (command: RichTextCommand, value?: string) => void;
    insertHtml: (html: string) => void;
    wrapSelection: (prefix: string, suffix: string) => void;
}

interface RichTextEditorProps {
    value: string;
    onChange: (html: string) => void;
    onFocus?: () => void;
    onFormatStateChange?: (formats: string[]) => void;
    placeholder: string;
    colors: ColorScheme;
    minHeight?: number;
    fontSize?: number;
    capitalizeSentences?: boolean;
    pasteClipboardImagesAsPng?: boolean;
    /** Stagger native WebView startup when a screen contains multiple editor fields. */
    mountDelayMs?: number;
}

function safeJsValue(value: string): string {
    return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
}

const MAX_EDITOR_HTML_CHARS = 2 * 1024 * 1024;
const MAX_EDITOR_MESSAGE_CHARS = 36 * 1024 * 1024;
const KNOWN_FORMATS = new Set<RichTextCommand>([
    'bold', 'italic', 'underline', 'strikeThrough', 'insertUnorderedList',
    'insertOrderedList', 'superscript', 'subscript', 'insertHorizontalRule',
    'removeFormat', 'undo', 'redo', 'foreColor', 'hiliteColor', 'cloze',
]);

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
  html, body { margin: 0; padding: 0; background: ${colors.bgCard}; color: ${colors.textPrimary}; }
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
  #editor hr { border: 0; border-top: 1px solid ${colors.border}; margin: 10px 0; }
  #editor ul, #editor ol { padding-left: 24px; }
</style>
</head>
<body>
  <div id="editor" contenteditable="true" autocapitalize="${capitalizeSentences ? 'sentences' : 'none'}" spellcheck="true" data-placeholder=${safeJsValue(placeholder)}></div>
  <script nonce="${nonce}">
    (function () {
      const editor = document.getElementById('editor');
      const trackedCommands = ['bold', 'italic', 'underline', 'strikeThrough', 'insertUnorderedList', 'insertOrderedList', 'superscript', 'subscript'];
      let savedRange = null;
      let lastHeight = 0;
      let lastFormats = '';
      editor.innerHTML = ${safeJsValue(safeValue)};

      function post(payload) {
        window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify(payload));
      }

      function saveSelection() {
        const selection = window.getSelection();
        if (!selection || !selection.rangeCount) return;
        const range = selection.getRangeAt(0);
        if (editor.contains(range.commonAncestorContainer)) savedRange = range.cloneRange();
      }

      function restoreSelection() {
        editor.focus();
        const selection = window.getSelection();
        if (!savedRange) {
          savedRange = document.createRange();
          savedRange.selectNodeContents(editor);
          savedRange.collapse(false);
        }
        selection.removeAllRanges();
        selection.addRange(savedRange);
      }

      function reportFormats() {
        const active = trackedCommands.filter((command) => {
          try { return document.queryCommandState(command); } catch (_) { return false; }
        });
        const serialized = active.join('|');
        if (serialized !== lastFormats) {
          lastFormats = serialized;
          post({ type: 'formats', formats: active });
        }
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
        post({ type: 'change', html: editor.innerHTML });
        reportFormats();
        reportHeight();
      }

      function insertCloze() {
        restoreSelection();
        const selection = window.getSelection();
        const selectedText = selection && selection.rangeCount ? selection.toString() : '';
        const used = Array.from(editor.innerHTML.matchAll(/\\{\\{c(\\d+)::/gi)).map(function (match) { return Number(match[1]) || 0; });
        const next = used.length ? Math.max.apply(null, used) + 1 : 1;
        document.execCommand('insertText', false, '{{c' + next + '::' + selectedText + '}}');
      }

      window.__tusEditorCommand = function (payload) {
        restoreSelection();
        if (payload.command === 'cloze') {
          insertCloze();
        } else {
          const applied = document.execCommand(payload.command, false, payload.value || null);
          if (payload.command === 'hiliteColor' && !applied) {
            document.execCommand('backColor', false, payload.value || null);
          }
        }
        emitChange();
      };

      window.__tusEditorInsertHtml = function (html) {
        restoreSelection();
        document.execCommand('insertHTML', false, html);
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
          document.execCommand(
            'insertHTML',
            false,
            prefix + '<span id="' + cursorMarkerId + '">&#8203;</span>' + suffix,
          );
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
          document.execCommand(
            'insertHTML',
            false,
            '<span id="' + startMarkerId + '"></span>' + prefix + selectedHtml + suffix + '<span id="' + endMarkerId + '"></span>',
          );
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
        if (editor.innerHTML === html) return;
        editor.innerHTML = html;
        savedRange = null;
        reportHeight();
      };

      window.__tusEditorFocus = function () { editor.focus(); };
      editor.addEventListener('input', emitChange);
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
      editor.addEventListener('focus', function () { post({ type: 'focus' }); reportFormats(); });
      editor.addEventListener('blur', saveSelection);
      window.addEventListener('pagehide', saveSelection);
      editor.addEventListener('keyup', function () { saveSelection(); reportFormats(); });
      editor.addEventListener('mouseup', function () { saveSelection(); reportFormats(); });
      editor.addEventListener('touchend', function () { saveSelection(); reportFormats(); });
      document.addEventListener('selectionchange', function () {
        const selection = window.getSelection();
        if (selection && selection.rangeCount && editor.contains(selection.anchorNode)) {
          saveSelection();
          reportFormats();
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
    mountDelayMs = 0,
}, ref) {
    const webViewRef = useRef<WebView>(null);
    const lastEditorValueRef = useRef(value);
    const latestValueRef = useRef(value);
    const editorReadyRef = useRef(false);
    const pendingScriptsRef = useRef<string[]>([]);
    const pastedImageSequenceRef = useRef(0);
    const editorNonceRef = useRef(createEditorNonce());
    latestValueRef.current = value;
    const [contentHeight, setContentHeight] = useState(minHeight);
    const [webViewMounted, setWebViewMounted] = useState(Platform.OS === 'web');
    const fallbackFocusedRef = useRef(false);
    const mountPendingRef = useRef(false);

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
    const source = useMemo(
        () => ({ html: editorDocument(value, placeholder, colors, fontSize, capitalizeSentences, minHeight, pasteClipboardImagesAsPng, editorNonceRef.current) }),
        // Recreate only when visual language/theme changes. Controlled value changes are injected
        // below so typing never reloads the WebView or loses its selection.
        [colors, placeholder, fontSize, capitalizeSentences, minHeight, pasteClipboardImagesAsPng],
    );

    useEffect(() => {
        editorReadyRef.current = false;
    }, [source]);

    const inject = (script: string) => webViewRef.current?.injectJavaScript(`${script}; true;`);
    const runWhenReady = (script: string) => {
        if (!editorReadyRef.current) {
            pendingScriptsRef.current.push(script);
            return;
        }
        inject(script);
    };

    useImperativeHandle(ref, () => ({
        focus: () => runWhenReady('window.__tusEditorFocus && window.__tusEditorFocus()'),
        runCommand: (command, commandValue) => {
            const payload = safeJsValue(JSON.stringify({ command, value: commandValue }));
            runWhenReady(`window.__tusEditorCommand && window.__tusEditorCommand(JSON.parse(${payload}))`);
        },
        insertHtml: (html) => runWhenReady(`window.__tusEditorInsertHtml && window.__tusEditorInsertHtml(${safeJsValue(sanitizeUntrustedHtml(html))})`),
        wrapSelection: (prefix, suffix) => runWhenReady(
            `window.__tusEditorWrapSelection && window.__tusEditorWrapSelection(${safeJsValue(prefix)}, ${safeJsValue(suffix)})`,
        ),
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
                formats?: string[];
                dataUrl?: string;
            };
            if (message.type === 'change' && typeof message.html === 'string') {
                if (message.html.length > MAX_EDITOR_HTML_CHARS) return;
                const safeHtml = sanitizeUntrustedHtml(message.html);
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
            } else if (message.type === 'focus') {
                onFocus?.();
            } else if (message.type === 'height' && typeof message.height === 'number') {
                setContentHeight(Math.min(320, Math.max(minHeight, message.height)));
            } else if (message.type === 'formats' && Array.isArray(message.formats)) {
                onFormatStateChange?.(message.formats.filter((format): format is RichTextCommand => KNOWN_FORMATS.has(format as RichTextCommand)));
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

    if (!webViewMounted) {
        return (
            <View style={[styles.frame, { minHeight, borderColor: colors.border, backgroundColor: colors.bgCard }]}>
                <TextInput
                    value={value}
                    onChangeText={onChange}
                    onFocus={() => {
                        fallbackFocusedRef.current = true;
                        onFocus?.();
                    }}
                    onBlur={() => {
                        fallbackFocusedRef.current = false;
                        if (mountPendingRef.current) {
                            mountPendingRef.current = false;
                            setWebViewMounted(true);
                        }
                    }}
                    placeholder={placeholder}
                    placeholderTextColor={colors.textMuted}
                    multiline
                    autoCapitalize={capitalizeSentences ? 'sentences' : 'none'}
                    autoCorrect
                    style={[
                        styles.fallbackInput,
                        { minHeight, color: colors.textPrimary, fontSize, backgroundColor: colors.bgCard },
                    ]}
                />
            </View>
        );
    }

    return (
        <View style={[styles.frame, { minHeight, height: contentHeight, borderColor: colors.border, backgroundColor: colors.bgCard }]}>
            <WebView
                ref={webViewRef}
                source={source}
                originWhitelist={['about:blank']}
                onMessage={handleMessage}
                onShouldStartLoadWithRequest={(request) => request.url === 'about:blank'}
                style={{ backgroundColor: colors.bgCard }}
                containerStyle={{ backgroundColor: colors.bgCard }}
                scrollEnabled={contentHeight >= 320}
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
                allowFileAccessFromFileURLs={false}
                allowFileAccess={false}
                allowsPictureInPictureMediaPlayback={false}
                allowsAirPlayForMediaPlayback={false}
                useSharedProcessPool={false}
                webviewDebuggingEnabled={__DEV__}
                bounces={false}
            />
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
        lineHeight: 24,
        textAlignVertical: 'top',
    },
});

export default RichTextEditor;
