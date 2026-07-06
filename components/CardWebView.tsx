import React, { useEffect, useState } from 'react';
import { Platform, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import type { NoteType, Note, AnkiCard, Deck } from '../lib/models';
import { renderCardHtml } from '../lib/templates';
import { getMediaBaseUrl, resolveWebMediaInHtml } from '../lib/mediaStore';
import { Colors } from '../constants/theme';

interface CardWebViewProps {
    noteType: NoteType;
    note: Note;
    card: AnkiCard;
    deck?: Deck | null;
    side: 'question' | 'answer';
}

export default function CardWebView({ noteType, note, card, deck, side }: CardWebViewProps) {
    const html = renderCardHtml(noteType, note, card.ord, side, {
        deckName: deck?.name,
        clozeOrd: card.ord + 1,
    });

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

    if (Platform.OS === 'web') {
        const fullHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{margin:0;padding:12px;background:${Colors.bgCard};color:${Colors.textPrimary};font-size:16px;line-height:24px;font-family:system-ui,-apple-system,sans-serif;}</style></head><body>${webHtml}</body></html>`;
        return (
            <iframe
                srcDoc={fullHtml}
                sandbox="allow-same-origin"
                style={{
                    border: 'none',
                    width: '100%',
                    minHeight: 120,
                    backgroundColor: Colors.bgCard,
                    borderRadius: 8,
                }}
            />
        );
    }

    return (
        <WebView
            originWhitelist={['*']}
            source={{ html, baseUrl: getMediaBaseUrl() }}
            style={styles.webView}
            javaScriptEnabled={false}
            domStorageEnabled={false}
            automaticallyAdjustContentInsets
            // Android blocks file:// reads by default; media lives in the app's own
            // documentDirectory (getMediaBaseUrl), so images need this to render.
            // JS stays disabled, so no file->JS escalation is possible.
            allowFileAccess
        />
    );
}

const styles = StyleSheet.create({
    webView: {
        backgroundColor: Colors.bgCard,
        height: 220,
    },
});
