import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Platform, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import type { NoteType, Note, AnkiCard, Deck } from '../lib/models';
import { renderCardHtml } from '../lib/templates';
import { getMediaBaseUrl, resolveWebMediaInHtml } from '../lib/mediaStore';
import { useThemeColors, type ColorScheme } from '../constants/theme';

interface CardWebViewProps {
    noteType: NoteType;
    note: Note;
    card: AnkiCard;
    deck?: Deck | null;
    side: 'question' | 'answer';
    /** User's input for a {{type:Field}} prompt; diffed against the real field on the answer side. */
    typedAnswer?: string;
    /** Bump to (re)play the side's audio/video attachments in order (deck audio settings / R key). */
    playAudioSignal?: number;
    /** Bump to pause every audio/video attachment on this side. */
    pauseAudioSignal?: number;
    /** Render the answer without {{FrontSide}} — for stacked layouts that keep the question
     *  visible in its own panel above. */
    omitFrontSide?: boolean;
    /** AnkiDroid accessibility/display preferences. */
    cardZoomPercent?: number;
    imageZoomPercent?: number;
    showAudioPlayButtons?: boolean;
    centerContent?: boolean;
    frameStyle?: 'card' | 'plain';
}

export default function CardWebView({
    noteType,
    note,
    card,
    deck,
    side,
    typedAnswer,
    playAudioSignal,
    pauseAudioSignal,
    omitFrontSide,
    cardZoomPercent = 100,
    imageZoomPercent = 100,
    showAudioPlayButtons = true,
    centerContent = false,
    frameStyle = 'card',
}: CardWebViewProps) {
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const plainFrame = frameStyle === 'plain';
    const surfaceColor = plainFrame ? 'transparent' : colors.bgCard;
    const iframeRef = useRef<HTMLIFrameElement | null>(null);
    const webViewRef = useRef<WebView | null>(null);
    const mediaBaseUrl = getMediaBaseUrl();
    const renderedHtml = renderCardHtml(noteType, note, card.ord, side, {
        deckName: deck?.name,
        clozeOrd: card.ord + 1,
        typedAnswer,
        omitFrontSide,
    });
    const preferenceCss = `<style>
        .card{zoom:${Math.max(50, Math.min(200, cardZoomPercent)) / 100};}
        .card img{zoom:${Math.max(50, Math.min(200, imageZoomPercent)) / 100};}
        ${showAudioPlayButtons ? '' : '.card audio{display:none!important;}'}
        ${centerContent ? 'html,body{min-height:100%;}body{display:flex;align-items:center;justify-content:center;}' : ''}
        ${plainFrame ? 'html,body{background:transparent!important;}.card.side-question,.card.side-answer{background:transparent!important;border-radius:0!important;padding:0!important;}' : ''}
    </style>`;
    // Keep preference CSS last so user-selected accessibility/display settings override
    // imported note-type CSS without mutating the note template itself.
    const html = `${renderedHtml}${preferenceCss}`;

    // Web media lives in IndexedDB, so bare filename refs must be swapped for object
    // URLs asynchronously; until that resolves the raw html renders (text is intact,
    // any media appears one tick later). Native resolves via the WebView baseUrl.
    const [webHtml, setWebHtml] = useState(html);
    useEffect(() => {
        if (Platform.OS !== 'web') return;

        let cancelled = false;
        setWebHtml(html);
        resolveWebMediaInHtml(html).then((resolved) => {
            if (!cancelled && resolved !== html) setWebHtml(resolved);
        }).catch((e) => console.warn('[CardWebView] media resolve failed:', e));

        return () => {
            cancelled = true;
        };
    }, [html]);

    // Play this side's audio/video attachments in document order, each starting when the
    // previous ends (Anki plays a side's sounds sequentially). Autoplay policies can still
    // veto a play() without recent user interaction — best effort, never an error.
    useEffect(() => {
        if (!playAudioSignal) return;

        if (Platform.OS === 'web') {
            const doc = iframeRef.current?.contentDocument;
            if (!doc) return;
            const media = Array.from(doc.querySelectorAll('audio, video')) as HTMLMediaElement[];
            media.forEach((element) => {
                element.pause();
                element.onended = null;
            });
            const playAt = (index: number) => {
                if (index >= media.length) return;
                const element = media[index];
                element.currentTime = 0;
                element.onended = () => playAt(index + 1);
                element.play().catch(() => { /* blocked by autoplay policy */ });
            };
            playAt(0);
            return;
        }

        webViewRef.current?.injectJavaScript(
            '(function(){var l=document.querySelectorAll("audio,video");var a=[];' +
            'for(var i=0;i<l.length;i++){a.push(l[i]);l[i].pause();l[i].onended=null;}' +
            'function p(i){if(i>=a.length)return;var m=a[i];m.currentTime=0;' +
            'm.onended=function(){p(i+1);};var pr=m.play();if(pr&&pr.catch)pr.catch(function(){});}' +
            'p(0);})();true;',
        );
    }, [playAudioSignal]);

    useEffect(() => {
        if (!pauseAudioSignal) return;

        if (Platform.OS === 'web') {
            const doc = iframeRef.current?.contentDocument;
            if (!doc) return;
            for (const element of Array.from(doc.querySelectorAll('audio, video')) as HTMLMediaElement[]) {
                element.onended = null;
                element.pause();
            }
            return;
        }

        webViewRef.current?.injectJavaScript(
            '(function(){var l=document.querySelectorAll("audio,video");' +
            'for(var i=0;i<l.length;i++){l[i].onended=null;l[i].pause();}})();true;',
        );
    }, [pauseAudioSignal]);

    if (Platform.OS === 'web') {
        const fullHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:${plainFrame ? 0 : 12}px;background:${surfaceColor};color:${colors.textPrimary};font-size:16px;line-height:24px;font-family:system-ui,-apple-system,sans-serif;}</style></head><body>${webHtml}</body></html>`;
        return (
            <iframe
                ref={iframeRef}
                srcDoc={fullHtml}
                sandbox="allow-same-origin"
                style={{
                    border: 'none',
                    width: '100%',
                    minHeight: 120,
                    backgroundColor: surfaceColor,
                    borderRadius: plainFrame ? 0 : 8,
                }}
            />
        );
    }

    // Android's WebView needs JavaScript for the built-in <audio>/<video> controls to
    // respond. Enable it only for cards that actually embed playable media — the card
    // sanitizer has already stripped scripts and inline event handlers from note HTML.
    const hasPlayableMedia = /<(?:audio|video)\b/i.test(html);
    const shouldStartNavigation = useCallback((request: { url: string; isTopFrame?: boolean }) => {
        const url = request.url;
        if (url === 'about:blank' || url.startsWith(mediaBaseUrl)) return true;

        // Card links are never allowed to replace the review WebView. A deliberate tap on
        // an http(s) link opens the system browser; every other scheme stays blocked.
        if (/^https?:\/\//i.test(url)) {
            Linking.openURL(url).catch(() => undefined);
        }
        return false;
    }, [mediaBaseUrl]);

    return (
        <WebView
            ref={webViewRef}
            originWhitelist={['*']}
            source={{ html, baseUrl: mediaBaseUrl }}
            style={[styles.webView, plainFrame && styles.webViewPlain]}
            javaScriptEnabled={hasPlayableMedia}
            domStorageEnabled={false}
            mixedContentMode="never"
            setSupportMultipleWindows={false}
            javaScriptCanOpenWindowsAutomatically={false}
            allowUniversalAccessFromFileURLs={false}
            onShouldStartLoadWithRequest={shouldStartNavigation}
            automaticallyAdjustContentInsets
            // Audio attached to a card should play inline, not hijack iOS fullscreen.
            allowsInlineMediaPlayback
            // Android blocks file:// reads by default; media lives in the app's own
            // documentDirectory (getMediaBaseUrl), so images need this to render.
            // For non-media cards JS stays disabled, so no file->JS escalation is possible.
            allowFileAccess
        />
    );
}

function createStyles(colors: ColorScheme) {
    return StyleSheet.create({
        webView: {
            backgroundColor: colors.bgCard,
            height: 220,
        },
        webViewPlain: {
            backgroundColor: 'transparent',
        },
    });
}
