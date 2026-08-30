import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Linking, Platform, StyleSheet, useWindowDimensions } from 'react-native';
import { WebView } from 'react-native-webview';
import type { NoteType, Note, AnkiCard, Deck } from '../lib/models';
import { renderCardHtml } from '../lib/templates';
import { reviewerSurfaceCss } from '../lib/cardAppearance';
import { getMediaBaseUrl, resolveWebMediaInHtml } from '../lib/mediaStore';
import { useIsDarkTheme, useThemeColors, type ColorScheme } from '../constants/theme';
import { CARD_CONTENT_CSP_META, safeExternalCardUrl } from '../lib/cardContentSecurity';
import { confirm } from '../lib/confirm';
import { useI18n } from '../hooks/useI18n';
import {
    MAX_TYPE_ANSWER_CHARS,
    parseTypeAnswerBridgeMessage,
    typeAnswerBridgeScript,
} from '../lib/typeAnswerBridge';
import {
    embeddedWebViewLayout,
    stableMeasuredHeight,
    type EmbeddedWebViewScrollMode,
} from '../lib/embeddedWebViewScroll';

/** Intrinsic frame height used until the document reports its real height. */
const DEFAULT_HEIGHT = 260;

/**
 * Anki's document classes. AnkiDroid ships `<html class="mobile android linux js">` and the
 * desktop client sets the equivalent for its platform, so shared decks routinely branch on
 * `.mobile`, `.android`, `.iphone` and `.ipad`. Note types that hide chrome on phones — the
 * AnKing template hides its author logo and tag bar behind `.mobile` — depend on this being set.
 */
function ankiPlatformClasses(): string {
    if (Platform.OS === 'ios') return `mobile ${Platform.isPad ? 'ipad' : 'iphone'} js`;
    if (Platform.OS === 'android') return 'mobile android js';
    return 'js';
}

/**
 * Anki's `{{hint:Field}}` ships an inline onclick that the sanitizer strips, so the reveal is
 * bound here instead. The markup itself stays Anki's, which is what the note type styles.
 */
const HINT_BINDER = `(function(){
    var links = document.querySelectorAll('a.hint[data-hint-target]');
    for (var index = 0; index < links.length; index++) {
        links[index].addEventListener('click', function(event){
            event.preventDefault();
            var target = document.getElementById(this.getAttribute('data-hint-target'));
            if (!target) return;
            target.style.display = 'block';
            this.style.display = 'none';
        });
    }
})();`;

/**
 * Measures the rendered card and reports its height back to React Native. Runs after load and
 * again whenever images finish or the layout changes, so cloze reveals and late-loading media
 * resize the frame instead of being clipped.
 */
const HEIGHT_REPORTER = `(function(){
    var lastHeight = 0;
    function report(){
        var body = document.body;
        if (!body) return;
        // The card element, not the document: documentElement.scrollHeight is never smaller than
        // the viewport, so measuring it would lock the frame at whatever height it already has.
        var card = document.querySelector('.card');
        var height = card ? Math.ceil(card.getBoundingClientRect().height) : body.scrollHeight;
        if (Math.abs(height - lastHeight) <= 1) return;
        lastHeight = height;
        if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(String(height));
    }
    report();
    window.addEventListener('load', report);
    // A revealed hint changes the card's height, so re-measure after the reveal runs.
    document.addEventListener('click', function(){ setTimeout(report, 0); });
    window.addEventListener('resize', report);
    if (window.ResizeObserver) new ResizeObserver(report).observe(document.body);
    var images = document.images;
    for (var index = 0; index < images.length; index++) {
        images[index].addEventListener('load', report);
        images[index].addEventListener('error', report);
    }
    setTimeout(report, 150);
    setTimeout(report, 600);
})();
${HINT_BINDER}
true;`;

interface CardWebViewProps {
    noteType: NoteType;
    note: Note;
    card: AnkiCard;
    deck?: Deck | null;
    side: 'question' | 'answer';
    /** User's input for a {{type:Field}} prompt; diffed against the real field on the answer side. */
    typedAnswer?: string;
    /** Put the reviewer-owned input at the template's {{type:Field}} marker. */
    typeAnswerInCard?: boolean;
    /** Focus the in-card input after the question document loads. */
    autoFocusTypeAnswer?: boolean;
    onTypedAnswerChange?: (value: string) => void;
    onTypeAnswerSubmit?: (value: string) => void;
    /** Bump to (re)play the side's audio/video attachments in order (deck audio settings / R key). */
    playAudioSignal?: number;
    /** Bump to pause every audio/video attachment on this side. */
    pauseAudioSignal?: number;
    /** Reports whether this side still has sound playing — drives Anki's "wait for audio". */
    onAudioActiveChange?: (active: boolean) => void;
    /** Render the answer without {{FrontSide}} — for stacked layouts that keep the question
     *  visible in its own panel above. */
    omitFrontSide?: boolean;
    /** AnkiDroid accessibility/display preferences. */
    cardZoomPercent?: number;
    imageZoomPercent?: number;
    showAudioPlayButtons?: boolean;
    centerContent?: boolean;
    frameStyle?: 'card' | 'plain';
    /**
     * `intrinsic`: the parent owns vertical scrolling and this frame grows with its document.
     * `contained`: this fixed-height frame owns vertical scrolling from its first render.
     */
    scrollMode: EmbeddedWebViewScrollMode;
    /** Never render shorter than this, so a one-word answer still has a card-sized surface. */
    minHeight?: number;
    /** Fixed viewport height for `contained` mode. */
    maxHeight?: number;
    /** Reports a non-interactive tap as normalized x/y coordinates within the visible card. */
    onCardTap?: (xRatio: number, yRatio: number) => void;
}

export default function CardWebView({
    noteType,
    note,
    card,
    deck,
    side,
    typedAnswer,
    typeAnswerInCard = false,
    autoFocusTypeAnswer = false,
    onTypedAnswerChange,
    onTypeAnswerSubmit,
    playAudioSignal,
    pauseAudioSignal,
    onAudioActiveChange,
    omitFrontSide,
    cardZoomPercent = 100,
    imageZoomPercent = 100,
    showAudioPlayButtons = true,
    centerContent = false,
    frameStyle = 'card',
    scrollMode,
    minHeight = 140,
    maxHeight,
    onCardTap,
}: CardWebViewProps) {
    const colors = useThemeColors();
    const { l } = useI18n();
    const isDark = useIsDarkTheme();
    const { height: windowHeight } = useWindowDimensions();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const plainFrame = frameStyle === 'plain';
    // Scroll ownership is a usage-context decision, never a consequence of an asynchronous
    // height report. Reviewer cards grow intrinsically inside the outer ScrollView; a bounded
    // preview gives the WebView a fixed viewport and enables its scrolling on the first frame.
    const [contentHeight, setContentHeight] = useState<number | null>(null);
    const layout = embeddedWebViewLayout({
        scrollMode,
        minHeight,
        measuredHeight: contentHeight,
        initialHeight: DEFAULT_HEIGHT,
        containedHeight: maxHeight,
    });
    const { frameHeight, scrollEnabled: scrollsInside } = layout;
    const surfaceColor = plainFrame ? 'transparent' : colors.bgCard;
    const iframeRef = useRef<HTMLIFrameElement | null>(null);
    const webViewRef = useRef<WebView | null>(null);
    // Imported markup may contain its own #typeans. A per-instance token ensures only the input
    // inserted by this reviewer can use the native message bridge.
    const typeAnswerTokenRef = useRef(
        `type-answer-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
    );
    const typeAnswerToken = typeAnswerTokenRef.current;
    const typedAnswerChangeRef = useRef(onTypedAnswerChange);
    const typeAnswerSubmitRef = useRef(onTypeAnswerSubmit);
    typedAnswerChangeRef.current = onTypedAnswerChange;
    typeAnswerSubmitRef.current = onTypeAnswerSubmit;
    // Held in a ref so the playback effects never have to list the callback as a dependency —
    // a new function identity from the parent must not re-trigger playback.
    const audioActiveRef = useRef(onAudioActiveChange);
    audioActiveRef.current = onAudioActiveChange;
    const mediaBaseUrl = getMediaBaseUrl();
    const renderedHtml = renderCardHtml(noteType, note, card.ord, side, {
        deckName: deck?.name,
        clozeOrd: card.ord + 1,
        typedAnswer,
        typeAnswerInput: side === 'question' && typeAnswerInCard
            ? { token: typeAnswerToken, placeholder: l('Yanıtınızı yazın…', 'Type your answer…') }
            : undefined,
        omitFrontSide,
        cardFlag: card.flags & 0b111,
        nightMode: isDark,
        platformClasses: ankiPlatformClasses(),
    });
    // The base template caps media at 60vh. Inside a self-sizing frame that unit would feed back
    // into measurement, so media is capped against the stable screen/contained-frame budget.
    const mediaCap = Math.round((scrollMode === 'contained' ? frameHeight : windowHeight) * 0.7);
    const preferenceCss = `<style>
        /* Imported note types are written for Anki's full-screen reviewer: the AnKing templates
           stretch html/body/.card to the viewport height. In a frame that sizes itself to the
           card that would pin every card to the tallest possible box, so the stretch is undone
           and the card is allowed to be exactly as tall as its content. */
        html,body{height:auto!important;min-height:0!important;display:block!important;}
        .card{height:auto!important;flex-grow:0!important;}
        /* A template countdown is driven by script the reviewer never runs, so it renders as an
           empty box — and the AnKing stylesheet gives that box a 12em top margin to park it at
           the bottom of Anki's full-screen reviewer. Inside a frame that measures its content
           that is a screenful of blank space on every card. The deck's own "show answer timer"
           setting provides the same information natively. Other template widgets are left alone:
           a template's <style> block now survives, so it hides its own inert chrome as it does
           in Anki. */
        .timer{display:none!important;}
        .card{zoom:${Math.max(50, Math.min(200, cardZoomPercent)) / 100};}
        .card img{zoom:${Math.max(50, Math.min(200, imageZoomPercent)) / 100};}
        .card img,.card video{max-height:${mediaCap}px;}
        ${showAudioPlayButtons ? '' : '.card audio{display:none!important;}'}
        ${centerContent ? 'body{display:flex!important;align-items:center;justify-content:center;}' : ''}
        /* Catalog cards use the app's reviewer surface. The repeated .card selector is
           intentional: it also wins over Anki templates such as .nightMode.card. */
        ${reviewerSurfaceCss({ catalogPack: noteType.catalogPack, surfaceColor, plainFrame })}
    </style>`;
    // Without a viewport tag WKWebView assumes a 980 px desktop page and scales the result down,
    // which renders every card at roughly 40% of its intended size on an iPhone.
    const viewportMeta = '<meta name="viewport" content="width=device-width, initial-scale=1">';
    // Keep preference CSS last so user-selected accessibility/display settings override
    // imported note-type CSS without mutating the note template itself.
    const html = `${viewportMeta}${renderedHtml}${preferenceCss}`;
    const nativeHtml = `${CARD_CONTENT_CSP_META}${html}`;
    const nativeSource = useMemo(
        () => ({ html: nativeHtml, baseUrl: mediaBaseUrl }),
        [mediaBaseUrl, nativeHtml],
    );
    const tapReporter = onCardTap ? `(function(){
        document.addEventListener('click', function(event){
            var target = event.target && event.target.closest ? event.target : null;
            if (!target) return;
            if (target.closest('a,button,input,textarea,select,label,audio,video,[contenteditable="true"],[role="button"],.tappable,[onclick]')) return;
            var selection = window.getSelection ? window.getSelection() : null;
            if (selection && !selection.isCollapsed) return;
            var width = Math.max(1, document.documentElement.clientWidth || window.innerWidth || 1);
            var height = Math.max(1, document.documentElement.clientHeight || window.innerHeight || 1);
            if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage('TAP:' + (event.clientX / width) + ':' + (event.clientY / height));
        }, true);
    })();` : '';
    const typedAnswerBinder = typeAnswerInCard && side === 'question'
        ? typeAnswerBridgeScript(typeAnswerToken, autoFocusTypeAnswer)
        : '';
    const sizingScript = scrollMode === 'intrinsic' ? HEIGHT_REPORTER : `${HINT_BINDER}true;`;

    const openExternalLink = useCallback((rawUrl: string) => {
        const url = safeExternalCardUrl(rawUrl);
        if (!url) return;
        const host = new URL(url).hostname;
        confirm(
            l('Dış bağlantı açılsın mı?', 'Open external link?'),
            l(
                `Bu kart ${host} sitesini tarayıcıda açmak istiyor. Devam edilsin mi?`,
                `This card wants to open ${host} in your browser. Continue?`,
            ),
            () => { void Linking.openURL(url).catch(() => undefined); },
        );
    }, [l]);

    // A new card starts unmeasured so the previous card's height is never reused.
    useLayoutEffect(() => { setContentHeight(null); }, [html]);

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
                if (index >= media.length) {
                    audioActiveRef.current?.(false);
                    return;
                }
                const element = media[index];
                element.currentTime = 0;
                element.onended = () => playAt(index + 1);
                element.play().catch(() => { /* blocked by autoplay policy */ });
            };
            audioActiveRef.current?.(media.length > 0);
            playAt(0);
            return;
        }

        // Native: the injected chain posts AUDIO:1 / AUDIO:0 so the reviewer knows when the
        // side has fallen silent, which is what "wait for audio" waits on.
        audioActiveRef.current?.(true);

        webViewRef.current?.injectJavaScript(
            '(function(){var l=document.querySelectorAll("audio,video");var a=[];' +
            'for(var i=0;i<l.length;i++){a.push(l[i]);l[i].pause();l[i].onended=null;}' +
            'function s(v){if(window.ReactNativeWebView)window.ReactNativeWebView.postMessage("AUDIO:"+v);}' +
            'function p(i){if(i>=a.length){s(0);return;}var m=a[i];m.currentTime=0;' +
            'm.onended=function(){p(i+1);};m.onerror=function(){p(i+1);};' +
            'var pr=m.play();if(pr&&pr.catch)pr.catch(function(){p(i+1);});}' +
            's(a.length>0?1:0);p(0);})();true;',
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
            audioActiveRef.current?.(false);
            return;
        }

        audioActiveRef.current?.(false);

        webViewRef.current?.injectJavaScript(
            '(function(){var l=document.querySelectorAll("audio,video");' +
            'for(var i=0;i<l.length;i++){l[i].onended=null;l[i].pause();}})();true;',
        );
    }, [pauseAudioSignal]);

    if (Platform.OS === 'web') {
        const fullHtml = `<!DOCTYPE html><html><head><meta charset="utf-8">${CARD_CONTENT_CSP_META}${viewportMeta}<style>html,body{margin:0;padding:${plainFrame ? 0 : 12}px;background:${surfaceColor};color:${colors.textPrimary};font-size:16px;line-height:24px;font-family:system-ui,-apple-system,sans-serif;overflow:${scrollsInside ? 'auto' : 'hidden'};}</style></head><body>${webHtml}</body></html>`;
        return (
            <iframe
                ref={iframeRef}
                srcDoc={fullHtml}
                sandbox="allow-same-origin"
                onLoad={() => {
                    const doc = iframeRef.current?.contentDocument;
                    if (!doc?.body) return;
                    // The iframe is sandboxed without allow-scripts, so the hint reveal is bound
                    // from here — the document is same-origin, which is all the binding needs.
                    doc.querySelectorAll('a.hint[data-hint-target]').forEach((link) => {
                        link.addEventListener('click', (event) => {
                            event.preventDefault();
                            const anchor = link as HTMLElement;
                            const target = doc.getElementById(anchor.dataset.hintTarget ?? '');
                            if (!target) return;
                            target.style.display = 'block';
                            anchor.style.display = 'none';
                            if (scrollMode === 'intrinsic') {
                                setContentHeight((current) => stableMeasuredHeight(current, doc.body.scrollHeight, minHeight));
                            }
                        });
                    });
                    doc.querySelectorAll('a[href]:not(.hint)').forEach((link) => {
                        link.addEventListener('click', (event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            openExternalLink(link.getAttribute('href') ?? '');
                        });
                    });
                    if (typeAnswerInCard && side === 'question') {
                        const input = Array.from(doc.querySelectorAll<HTMLInputElement>('input[data-tus-type-answer-token]'))
                            .find((candidate) => candidate.getAttribute('data-tus-type-answer-token') === typeAnswerToken);
                        if (input) {
                            const boundedValue = () => {
                                const value = input.value.slice(0, MAX_TYPE_ANSWER_CHARS);
                                if (input.value !== value) input.value = value;
                                return value;
                            };
                            input.addEventListener('input', () => typedAnswerChangeRef.current?.(boundedValue()));
                            input.addEventListener('keydown', (event) => {
                                if (event.key !== 'Enter') return;
                                event.preventDefault();
                                typeAnswerSubmitRef.current?.(boundedValue());
                            });
                            if (autoFocusTypeAnswer) requestAnimationFrame(() => input.focus());
                        }
                    }
                    if (onCardTap) {
                        doc.addEventListener('click', (event) => {
                            const target = event.target as Element | null;
                            if (!target || typeof target.closest !== 'function' || target.closest('a,button,input,textarea,select,label,audio,video,[contenteditable="true"],[role="button"],.tappable,[onclick]')) return;
                            const selection = iframeRef.current?.contentWindow?.getSelection();
                            if (selection && !selection.isCollapsed) return;
                            const width = Math.max(1, doc.documentElement.clientWidth);
                            const height = Math.max(1, doc.documentElement.clientHeight);
                            const pointer = event as MouseEvent;
                            onCardTap(pointer.clientX / width, pointer.clientY / height);
                        }, true);
                    }
                    if (scrollMode === 'intrinsic') {
                        setContentHeight((current) => stableMeasuredHeight(current, doc.body.scrollHeight, minHeight));
                    }
                }}
                style={{
                    border: 'none',
                    width: '100%',
                    height: frameHeight,
                    backgroundColor: surfaceColor,
                    borderRadius: plainFrame ? 0 : 8,
                }}
            />
        );
    }

    // JavaScript runs only for the height reporter and the built-in <audio>/<video> controls.
    // Card content cannot contribute any: lib/templates.ts strips scripts, inline event handlers
    // and javascript: URLs from both note fields and the imported note-type templates, and
    // onShouldStartLoadWithRequest below refuses every navigation the card tries to start.
    const shouldStartNavigation = useCallback((request: { url: string; isTopFrame?: boolean }) => {
        const url = request.url;
        const initialMediaUrl = mediaBaseUrl.replace(/\/+$/, '');
        if (url === 'about:blank' || url.replace(/\/+$/, '') === initialMediaUrl) return true;

        // Card links never replace the review WebView. HTTPS requires explicit confirmation;
        // HTTP, file, data, custom schemes and local media navigation remain blocked.
        if (request.isTopFrame !== false) openExternalLink(url);
        return false;
    }, [mediaBaseUrl, openExternalLink]);

    return (
        <WebView
            ref={webViewRef}
            originWhitelist={['about:blank', 'file://*']}
            source={nativeSource}
            style={[styles.webView, { height: frameHeight }, plainFrame && styles.webViewPlain]}
            injectedJavaScript={`${sizingScript}${tapReporter}${typedAnswerBinder}true;`}
            onMessage={(event) => {
                const data = String(event.nativeEvent.data);
                if (data.startsWith('AUDIO:')) {
                    audioActiveRef.current?.(data.slice(6) === '1');
                    return;
                }
                if (data.startsWith('TAP:')) {
                    const [, rawX, rawY] = data.split(':');
                    const xRatio = Number(rawX);
                    const yRatio = Number(rawY);
                    if (onCardTap && Number.isFinite(xRatio) && Number.isFinite(yRatio)) {
                        onCardTap(xRatio, yRatio);
                    }
                    return;
                }
                const typeAnswerMessage = parseTypeAnswerBridgeMessage(data, typeAnswerToken);
                if (typeAnswerMessage) {
                    if (typeAnswerMessage.type === 'change') {
                        typedAnswerChangeRef.current?.(typeAnswerMessage.value);
                    } else {
                        typeAnswerSubmitRef.current?.(typeAnswerMessage.value);
                    }
                    return;
                }
                if (scrollMode !== 'intrinsic') return;
                const reported = Number(data);
                setContentHeight((current) => stableMeasuredHeight(current, reported, minHeight));
            }}
            scrollEnabled={scrollsInside}
            nestedScrollEnabled={scrollsInside}
            javaScriptEnabled
            keyboardDisplayRequiresUserAction={!(typeAnswerInCard && autoFocusTypeAnswer)}
            domStorageEnabled={false}
            cacheEnabled={false}
            incognito
            mixedContentMode="never"
            setSupportMultipleWindows={false}
            allowsLinkPreview={false}
            javaScriptCanOpenWindowsAutomatically={false}
            sharedCookiesEnabled={false}
            thirdPartyCookiesEnabled={false}
            saveFormDataDisabled
            webviewDebuggingEnabled={__DEV__}
            allowUniversalAccessFromFileURLs={false}
            allowFileAccessFromFileURLs={false}
            onShouldStartLoadWithRequest={shouldStartNavigation}
            automaticallyAdjustContentInsets={false}
            contentInsetAdjustmentBehavior="never"
            allowsPictureInPictureMediaPlayback={false}
            allowsAirPlayForMediaPlayback={false}
            useSharedProcessPool={false}
            // Audio attached to a card should play inline, not hijack iOS fullscreen.
            allowsInlineMediaPlayback
            // Android blocks file:// reads by default; media lives in the app's own
            // documentDirectory (getMediaBaseUrl), so images need this to render.
            // CSP limits file access to passive local card media. The imported card itself
            // cannot execute script, navigate to local files, or make network requests.
            allowFileAccess={Platform.OS === 'android'}
        />
    );
}

function createStyles(colors: ColorScheme) {
    return StyleSheet.create({
        webView: {
            backgroundColor: colors.bgCard,
        },
        webViewPlain: {
            backgroundColor: 'transparent',
        },
    });
}
