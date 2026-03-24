import React from 'react';
import { Platform, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import type { NoteType, Note, AnkiCard, Deck } from '../lib/models';
import { renderCardHtml } from '../lib/templates';
import { getMediaBaseUrl } from '../lib/mediaStore';
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

    if (Platform.OS === 'web') {
        const fullHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{margin:0;padding:12px;background:${Colors.bgCard};color:${Colors.textPrimary};font-size:16px;line-height:24px;font-family:system-ui,-apple-system,sans-serif;}</style></head><body>${html}</body></html>`;
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
        />
    );
}

const styles = StyleSheet.create({
    webView: {
        backgroundColor: Colors.bgCard,
        height: 220,
    },
});
