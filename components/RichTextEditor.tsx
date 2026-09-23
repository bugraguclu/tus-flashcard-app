import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { InteractionManager, Platform, StyleSheet, TextInput, View } from 'react-native';
import { WebView } from 'react-native-webview';
import type { ColorScheme } from '../constants/theme';
import { base64ToBytes } from '../lib/files';
import { getMediaBaseUrl, getWebMediaUrl, isBareMediaReference, saveMediaBytes } from '../lib/mediaStore';
import { mediaReferenceSnippet } from '../lib/mediaAttachment';
import { editorContentSecurityPolicy } from '../lib/cardContentSecurity';
import { isLocalMediaDocumentUrl, localMediaWebViewSource } from '../lib/localMediaDocument';
import { sanitizeToolbarSnippet } from '../lib/customToolbar';
import { stripPendingStyleMarkers } from '../lib/richTextCommands';
import { PROTECTED_CONTENT_CSS } from '../lib/protectedContentCss';
import {
    RICH_TEXT_EDITOR_CONFIG_ID,
    RICH_TEXT_EDITOR_SCRIPT,
    richTextEditorConfigJson,
} from '../lib/richTextEditorScript';
import { readEditorFormatState, type EditorFormatState } from '../lib/editorFormatState';
import { editorFieldFontFamily } from '../lib/editorFieldStyle';
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
    /** Set a CSS property on every block the selection touches; an empty value removes it. */
    applyBlockStyle: (property: 'lineHeight', value: string) => void;
    /** Replace the selected text with `text` and leave the replacement selected. */
    replaceSelectionText: (text: string) => void;
    /** Ask the document to resend its caret state, e.g. after the toolbar changes fields. */
    requestFormatState: () => void;
}

interface RichTextEditorProps {
    value: string;
    onChange: (html: string) => void;
    onFocus?: () => void;
    onFormatStateChange?: (state: EditorFormatState) => void;
    /** A hardware-keyboard shortcut the toolbar owns rather than the document: grow/shrink/case. */
    onShortcut?: (shortcut: string) => void;
    placeholder: string;
    colors: ColorScheme;
    minHeight?: number;
    fontSize?: number;
    /** The note type's own font for this field; the system face is used when it is unset. */
    fontFamily?: string;
    /** The note type's right-to-left flag for this field (Anki's per-field `rtl`). */
    rtl?: boolean;
    capitalizeSentences?: boolean;
    pasteClipboardImagesAsPng?: boolean;
    /** Keep the same vertical scroll owner across native fallback and WebView rendering. */
    scrollMode: EmbeddedWebViewScrollMode;
    /** Maximum growing viewport height when `scrollMode` is `contained`. */
    maxHeight?: number;
    /** Stagger native WebView startup when a screen contains multiple editor fields. */
    mountDelayMs?: number;
    /** When false, field content is strictly read-only. */
    editable?: boolean;
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
    editable: boolean = true,
    fontFamily?: string,
    rtl: boolean = false,
    /** Web only: the app page's origin, which the document's script answers to. */
    hostOrigin?: string,
): string {
    const policy = editorContentSecurityPolicy(nonce);
    const safeValue = sanitizeUntrustedHtml(value).slice(0, MAX_EDITOR_HTML_CHARS);
    const fieldFontFamily = editorFieldFontFamily(fontFamily);
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
    ${fieldFontFamily ? `font-family: ${fieldFontFamily};` : ''}
    ${rtl ? 'text-align: right;' : ''}
    line-height: 1.45;
    overflow-wrap: anywhere;
    -webkit-user-select: ${editable ? 'text' : 'none'};
    user-select: ${editable ? 'text' : 'none'};
    -webkit-touch-callout: ${editable ? 'default' : 'none'};
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
  ${editable ? '' : PROTECTED_CONTENT_CSS}
</style>
</head>
<body>
  <div id="editor" dir="${rtl ? 'rtl' : 'auto'}" contenteditable="${editable ? 'true' : 'false'}" autocapitalize="${capitalizeSentences ? 'sentences' : 'none'}" spellcheck="true" data-placeholder=${safeJsValue(placeholder)}></div>
  <script type="application/json" id="${RICH_TEXT_EDITOR_CONFIG_ID}">${richTextEditorConfigJson({
    html: safeValue,
    minHeight,
    editable,
    pasteImagesAsPng: pasteClipboardImagesAsPng,
    hostOrigin,
  })}</script>
  <script nonce="${nonce}">${RICH_TEXT_EDITOR_SCRIPT}</script>
</body>
</html>`;
}

/** The functions the field document installs on its window for the host to call. */
type EditorFunction =
    | '__tusEditorFocus'
    | '__tusEditorBlur'
    | '__tusEditorCommand'
    | '__tusEditorInsertHtml'
    | '__tusEditorWrapSelection'
    | '__tusEditorBlockStyle'
    | '__tusEditorReplaceSelectionText'
    | '__tusEditorRequestState'
    | '__tusEditorSetHtml';

interface EditorCall {
    fn: EditorFunction;
    args: unknown[];
}

/** A call written out for WebView injection, each argument embedded as a JSON literal. */
function injectableEditorCall({ fn, args }: EditorCall): string {
    const literals = args.map((arg) => (JSON.stringify(arg) ?? 'undefined')
        .replace(/</g, '\\u003c')
        .replace(/>/g, '\\u003e'));
    return `window.${fn} && window.${fn}(${literals.join(', ')}); true;`;
}

/**
 * Web fields keep Anki's bare media filenames, which the field iframe cannot load: the files live
 * in IndexedDB. Each such reference is pointed at the file's object URL for display, and the real
 * filename is kept in data-tus-src, which the document script restores before a field is saved.
 */
async function resolveWebFieldMedia(doc: Document): Promise<void> {
    const elements = Array.from(doc.querySelectorAll('img[src], audio[src], video[src], source[src]'));
    for (const element of elements) {
        if (element.hasAttribute('data-tus-src')) continue;
        const src = element.getAttribute('src') ?? '';
        if (!isBareMediaReference(src)) continue;
        const url = await getWebMediaUrl(src);
        if (!url || element.getAttribute('src') !== src) continue;
        element.setAttribute('data-tus-src', src);
        element.setAttribute('src', url);
        // A <source> is only read when its media element loads, so the element has to reload.
        if (element.tagName.toLowerCase() === 'source') {
            (element.parentElement as HTMLMediaElement | null)?.load?.();
        }
    }
}

/** How long the web field may take to start before the plain-text fallback is offered. */
const WEB_EDITOR_START_TIMEOUT_MS = 3_000;

const RichTextEditor = forwardRef<RichTextEditorHandle, RichTextEditorProps>(function RichTextEditor({
    value,
    onChange,
    onFocus,
    onFormatStateChange,
    onShortcut,
    placeholder,
    colors,
    minHeight = 58,
    fontSize = 16,
    fontFamily,
    rtl = false,
    capitalizeSentences = true,
    pasteClipboardImagesAsPng = false,
    scrollMode,
    maxHeight,
    mountDelayMs = 0,
    editable = true,
}, ref) {
    const webViewRef = useRef<WebView>(null);
    // Web renders the same field document in a same-origin iframe instead of a WebView.
    const iframeRef = useRef<HTMLIFrameElement | null>(null);
    const mediaObserverRef = useRef<MutationObserver | null>(null);
    const fallbackInputRef = useRef<TextInput>(null);
    const lastEditorValueRef = useRef(value);
    const latestValueRef = useRef(value);
    const editorReadyRef = useRef(false);
    const pendingCallsRef = useRef<EditorCall[]>([]);
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
    const hostOrigin = Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.origin : undefined;
    const documentHtml = useMemo(
        () => editorDocument(value, placeholder, colors, fontSize, capitalizeSentences, minHeight, pasteClipboardImagesAsPng, editorNonceRef.current, scrollMode, editable, fontFamily, rtl, hostOrigin),
        // Recreate only when visual language/theme changes. Controlled value changes are injected
        // below so typing never reloads the WebView or loses its selection.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [colors, placeholder, fontSize, capitalizeSentences, minHeight, pasteClipboardImagesAsPng, scrollMode, editable, fontFamily, rtl, hostOrigin],
    );
    const source = useMemo(
        () => localMediaWebViewSource(documentHtml, mediaBaseUrl),
        [documentHtml, mediaBaseUrl],
    );
    const [webFallbackDue, setWebFallbackDue] = useState(false);

    useEffect(() => {
        editorReadyRef.current = false;
        if (!handedOffRef.current) setIsReady(false);
        if (Platform.OS !== 'web') return undefined;
        // The iframe normally reports ready within a frame or two. Should it never start, the
        // plain-text field below still lets the learner edit rather than leaving a dead box.
        setWebFallbackDue(false);
        const timer = setTimeout(() => {
            if (!editorReadyRef.current) setWebFallbackDue(true);
        }, WEB_EDITOR_START_TIMEOUT_MS);
        return () => clearTimeout(timer);
    }, [source]);

    const callEditor = (call: EditorCall) => {
        if (Platform.OS === 'web') {
            // Same-origin frame: its window functions are called directly, no script is evaluated.
            const target = iframeRef.current?.contentWindow as unknown as Record<string, unknown> | null | undefined;
            const fn = target?.[call.fn];
            if (typeof fn === 'function') fn(...call.args);
            return;
        }
        webViewRef.current?.injectJavaScript(injectableEditorCall(call));
    };
    const runWhenReady = (call: EditorCall) => {
        if (!webViewMounted) {
            setWebViewMounted(true);
        }
        if (!editorReadyRef.current) {
            pendingCallsRef.current.push(call);
            return;
        }
        callEditor(call);
    };
    const watchWebFieldMedia = () => {
        mediaObserverRef.current?.disconnect();
        const doc = iframeRef.current?.contentDocument;
        if (!doc?.body) return;
        const resolve = () => {
            void resolveWebFieldMedia(doc).catch((error) => console.warn('[RichTextEditor] media resolve failed:', error));
        };
        const observer = new MutationObserver(resolve);
        observer.observe(doc.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['src'] });
        mediaObserverRef.current = observer;
        resolve();
    };
    useEffect(() => () => mediaObserverRef.current?.disconnect(), []);

    useImperativeHandle(ref, () => ({
        focus: () => {
            if (!editable) return;
            if (!editorReadyRef.current) {
                fallbackInputRef.current?.focus();
                return;
            }
            runWhenReady({ fn: '__tusEditorFocus', args: [] });
        },
        blur: () => {
            fallbackInputRef.current?.blur();
            if (editorReadyRef.current) {
                callEditor({ fn: '__tusEditorBlur', args: [] });
            }
        },
        runCommand: (command, commandValue) => {
            if (!editable) return;
            runWhenReady({ fn: '__tusEditorCommand', args: [{ command, value: commandValue }] });
        },
        insertHtml: (html) => {
            if (!editable) return;
            runWhenReady({ fn: '__tusEditorInsertHtml', args: [sanitizeUntrustedHtml(html)] });
        },
        wrapSelection: (prefix, suffix) => {
            if (!editable) return;
            const safePrefix = sanitizeToolbarSnippet(prefix);
            const safeSuffix = sanitizeToolbarSnippet(suffix);
            runWhenReady({ fn: '__tusEditorWrapSelection', args: [safePrefix, safeSuffix] });
        },
        applyBlockStyle: (property, blockValue) => {
            if (!editable) return;
            runWhenReady({ fn: '__tusEditorBlockStyle', args: [property, blockValue] });
        },
        replaceSelectionText: (text) => {
            if (!editable) return;
            runWhenReady({ fn: '__tusEditorReplaceSelectionText', args: [text] });
        },
        requestFormatState: () => runWhenReady({ fn: '__tusEditorRequestState', args: [] }),
    }));

    useEffect(() => {
        if (value === lastEditorValueRef.current) return;
        lastEditorValueRef.current = value;
        if (!editorReadyRef.current) return;
        callEditor({ fn: '__tusEditorSetHtml', args: [sanitizeUntrustedHtml(value).slice(0, MAX_EDITOR_HTML_CHARS)] });
    }, [value]);

    const handleMessage = async (data: string) => {
        try {
            if (data.length > MAX_EDITOR_MESSAGE_CHARS) return;
            const message = JSON.parse(data) as {
                type?: string;
                html?: string;
                height?: number;
                state?: unknown;
                dataUrl?: string;
                shortcut?: string;
            };
            if (message.type === 'change' && typeof message.html === 'string') {
                if (!editable) return;
                if (message.html.length > MAX_EDITOR_HTML_CHARS) return;
                const safeHtml = sanitizeUntrustedHtml(stripPendingStyleMarkers(message.html));
                lastEditorValueRef.current = safeHtml;
                onChange(safeHtml);
            } else if (message.type === 'ready') {
                editorReadyRef.current = true;
                const latestValue = latestValueRef.current;
                lastEditorValueRef.current = latestValue;
                callEditor({ fn: '__tusEditorSetHtml', args: [sanitizeUntrustedHtml(latestValue).slice(0, MAX_EDITOR_HTML_CHARS)] });
                const pending = pendingCallsRef.current;
                pendingCallsRef.current = [];
                pending.forEach(callEditor);
                if (Platform.OS === 'web') {
                    setWebFallbackDue(false);
                    watchWebFieldMedia();
                }
                if (!fallbackFocusedRef.current) {
                    completeHandoff();
                }
            } else if (message.type === 'focus') {
                onFocus?.();
            } else if (message.type === 'height' && typeof message.height === 'number') {
                updateContentHeight(message.height);
            } else if (message.type === 'shortcut' && editable && typeof message.shortcut === 'string') {
                onShortcut?.(message.shortcut);
            } else if (message.type === 'state') {
                onFormatStateChange?.(readEditorFormatState(message.state));
            } else if (message.type === 'pasteImage' && editable && pasteClipboardImagesAsPng && typeof message.dataUrl === 'string') {
                const match = message.dataUrl.match(/^data:image\/png;base64,([A-Za-z0-9+/=\s]+)$/);
                if (!match) return;
                const bytes = base64ToBytes(match[1]);
                if (bytes.length === 0 || bytes.length > 25 * 1024 * 1024) return;
                const sequence = pastedImageSequenceRef.current++;
                const filename = `pasted_${Date.now()}_${sequence}.png`;
                await saveMediaBytes(filename, bytes, 'image/png');
                const snippet = mediaReferenceSnippet('image', filename);
                runWhenReady({ fn: '__tusEditorInsertHtml', args: [snippet] });
            }
        } catch {
            // Ignore non-editor WebView messages.
        }
    };
    const handleMessageRef = useRef(handleMessage);
    handleMessageRef.current = handleMessage;

    useEffect(() => {
        if (Platform.OS !== 'web' || typeof window === 'undefined') return undefined;
        const onMessage = (event: MessageEvent) => {
            if (event.source !== iframeRef.current?.contentWindow || event.origin !== window.location.origin) return;
            const data = event.data as { tusEditor?: unknown } | null;
            if (data && typeof data.tusEditor === 'string') void handleMessageRef.current(data.tusEditor);
        };
        window.addEventListener('message', onMessage);
        return () => window.removeEventListener('message', onMessage);
    }, []);

    return (
        <View style={[styles.frame, { minHeight, height: frameHeight, borderColor: colors.border, backgroundColor: colors.bgCard }]}>
            {Platform.OS === 'web' ? (
                <iframe
                    ref={iframeRef}
                    title={placeholder}
                    srcDoc={documentHtml}
                    // Scripts for the field document's own editor script (CSP allows only it), and
                    // same-origin so the host can call into it and resolve media from IndexedDB.
                    sandbox="allow-scripts allow-same-origin"
                    style={{ display: 'block', border: 'none', width: '100%', height: frameHeight, backgroundColor: colors.bgCard }}
                />
            ) : webViewMounted && (
                <WebView
                    ref={webViewRef}
                    source={source}
                    originWhitelist={['about:blank', 'file://*']}
                    onMessage={(event) => { void handleMessage(event.nativeEvent.data); }}
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
                    // The app owns the status bar; see the same prop in CardWebView.
                    autoManageStatusBarEnabled={false}
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
            {(!webViewMounted || !isReady) && (Platform.OS !== 'web' || webFallbackDue) && (
                <View
                    style={webViewMounted ? [StyleSheet.absoluteFill, { backgroundColor: colors.bgCard }] : undefined}
                    pointerEvents="auto"
                >
                    <TextInput
                        ref={fallbackInputRef}
                        value={value}
                        editable={editable}
                        contextMenuHidden={!editable}
                        selectTextOnFocus={editable}
                        onChangeText={onChange}
                        onFocus={() => {
                            fallbackFocusedRef.current = true;
                            onFocus?.();
                        }}
                        onBlur={() => {
                            fallbackFocusedRef.current = false;
                            if (editorReadyRef.current) {
                                callEditor({ fn: '__tusEditorSetHtml', args: [sanitizeUntrustedHtml(latestValueRef.current).slice(0, MAX_EDITOR_HTML_CHARS)] });
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
                            rtl && styles.fallbackInputRtl,
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
    fallbackInputRtl: { writingDirection: 'rtl', textAlign: 'right' },
});

export default RichTextEditor;
