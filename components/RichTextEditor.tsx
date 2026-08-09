import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import type { WebViewMessageEvent } from 'react-native-webview';
import { BorderRadius, type ColorScheme } from '../constants/theme';

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
}

interface RichTextEditorProps {
    value: string;
    onChange: (html: string) => void;
    onFocus?: () => void;
    onFormatStateChange?: (formats: string[]) => void;
    placeholder: string;
    colors: ColorScheme;
    minHeight?: number;
}

function safeJsValue(value: string): string {
    return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
}

function editorDocument(value: string, placeholder: string, colors: ColorScheme): string {
    return `<!doctype html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no" />
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: ${colors.bgCard}; color: ${colors.textPrimary}; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
  #editor {
    min-height: 96px;
    padding: 12px;
    outline: none;
    font-size: 16px;
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
  <div id="editor" contenteditable="true" autocapitalize="sentences" spellcheck="true" data-placeholder=${safeJsValue(placeholder)}></div>
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
        if (!savedRange) return;
        const selection = window.getSelection();
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
          const height = Math.max(104, Math.ceil(editor.scrollHeight));
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

      window.__tusEditorSetHtml = function (html) {
        if (editor.innerHTML === html) return;
        editor.innerHTML = html;
        savedRange = null;
        reportHeight();
      };

      window.__tusEditorFocus = function () { editor.focus(); };
      editor.addEventListener('input', emitChange);
      editor.addEventListener('focus', function () { post({ type: 'focus' }); reportFormats(); });
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
    minHeight = 112,
}, ref) {
    const webViewRef = useRef<WebView>(null);
    const lastEditorValueRef = useRef(value);
    const latestValueRef = useRef(value);
    const editorReadyRef = useRef(false);
    latestValueRef.current = value;
    const [contentHeight, setContentHeight] = useState(minHeight);
    const source = useMemo(
        () => ({ html: editorDocument(value, placeholder, colors) }),
        // Recreate only when visual language/theme changes. Controlled value changes are injected
        // below so typing never reloads the WebView or loses its selection.
        [colors, placeholder],
    );

    useEffect(() => {
        editorReadyRef.current = false;
    }, [source]);

    const inject = (script: string) => webViewRef.current?.injectJavaScript(`${script}; true;`);

    useImperativeHandle(ref, () => ({
        focus: () => inject('window.__tusEditorFocus && window.__tusEditorFocus()'),
        runCommand: (command, commandValue) => {
            const payload = safeJsValue(JSON.stringify({ command, value: commandValue }));
            inject(`window.__tusEditorCommand && window.__tusEditorCommand(JSON.parse(${payload}))`);
        },
        insertHtml: (html) => inject(`window.__tusEditorInsertHtml && window.__tusEditorInsertHtml(${safeJsValue(html)})`),
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
        borderWidth: 1,
        borderRadius: BorderRadius.sm,
    },
});

export default RichTextEditor;
