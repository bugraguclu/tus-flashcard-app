import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import type { WebViewMessageEvent } from 'react-native-webview';
import type { ColorScheme } from '../constants/theme';

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
}

function safeJsValue(value: string): string {
    return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
}

function editorDocument(
    value: string,
    placeholder: string,
    colors: ColorScheme,
    fontSize: number,
    capitalizeSentences: boolean,
    minHeight: number,
): string {
    return `<!doctype html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no" />
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
  <script>
    (function () {
      const editor = document.getElementById('editor');
      const trackedCommands = ['bold', 'italic', 'underline', 'strikeThrough', 'insertUnorderedList', 'insertOrderedList', 'superscript', 'subscript'];
      let savedRange = null;
      let lastHeight = 0;
      let lastFormats = '';
      editor.innerHTML = ${safeJsValue(value)};

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
}, ref) {
    const webViewRef = useRef<WebView>(null);
    const lastEditorValueRef = useRef(value);
    const latestValueRef = useRef(value);
    const editorReadyRef = useRef(false);
    const pendingScriptsRef = useRef<string[]>([]);
    latestValueRef.current = value;
    const [contentHeight, setContentHeight] = useState(minHeight);
    const source = useMemo(
        () => ({ html: editorDocument(value, placeholder, colors, fontSize, capitalizeSentences, minHeight) }),
        // Recreate only when visual language/theme changes. Controlled value changes are injected
        // below so typing never reloads the WebView or loses its selection.
        [colors, placeholder, fontSize, capitalizeSentences, minHeight],
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
        insertHtml: (html) => runWhenReady(`window.__tusEditorInsertHtml && window.__tusEditorInsertHtml(${safeJsValue(html)})`),
        wrapSelection: (prefix, suffix) => runWhenReady(
            `window.__tusEditorWrapSelection && window.__tusEditorWrapSelection(${safeJsValue(prefix)}, ${safeJsValue(suffix)})`,
        ),
    }));

    useEffect(() => {
        if (value === lastEditorValueRef.current) return;
        lastEditorValueRef.current = value;
        if (!editorReadyRef.current) return;
        inject(`window.__tusEditorSetHtml && window.__tusEditorSetHtml(${safeJsValue(value)})`);
    }, [value]);

    const handleMessage = (event: WebViewMessageEvent) => {
        try {
            const message = JSON.parse(event.nativeEvent.data) as {
                type?: string;
                html?: string;
                height?: number;
                formats?: string[];
            };
            if (message.type === 'change' && typeof message.html === 'string') {
                lastEditorValueRef.current = message.html;
                onChange(message.html);
            } else if (message.type === 'ready') {
                editorReadyRef.current = true;
                const latestValue = latestValueRef.current;
                lastEditorValueRef.current = latestValue;
                inject(`window.__tusEditorSetHtml && window.__tusEditorSetHtml(${safeJsValue(latestValue)})`);
                const pending = pendingScriptsRef.current;
                pendingScriptsRef.current = [];
                pending.forEach(inject);
            } else if (message.type === 'focus') {
                onFocus?.();
            } else if (message.type === 'height' && typeof message.height === 'number') {
                setContentHeight(Math.min(320, Math.max(minHeight, message.height)));
            } else if (message.type === 'formats' && Array.isArray(message.formats)) {
                onFormatStateChange?.(message.formats);
            }
        } catch {
            // Ignore non-editor WebView messages.
        }
    };

    return (
        <View style={[styles.frame, { minHeight, height: contentHeight, borderColor: colors.border, backgroundColor: colors.bgCard }]}>
            <WebView
                ref={webViewRef}
                source={source}
                originWhitelist={['*']}
                onMessage={handleMessage}
                style={{ backgroundColor: colors.bgCard }}
                containerStyle={{ backgroundColor: colors.bgCard }}
                scrollEnabled={contentHeight >= 320}
                keyboardDisplayRequiresUserAction={false}
                hideKeyboardAccessoryView
                setSupportMultipleWindows={false}
                allowsLinkPreview={false}
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
});

export default RichTextEditor;
