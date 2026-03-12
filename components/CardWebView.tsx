import React from 'react';
import { Platform, Text, View, StyleSheet } from 'react-native';
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

function stripHtml(html: string): string {
    return html.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
}

export default function CardWebView({ noteType, note, card, deck, side }: CardWebViewProps) {
    const html = renderCardHtml(noteType, note, card.ord, side, {
        deckName: deck?.name,
        clozeOrd: card.ord + 1,
    });

    if (Platform.OS === 'web') {
        return (
            <View style={styles.webFallback}>
                <Text style={styles.webText}>{stripHtml(html)}</Text>
            </View>
        );
    }

    return (
        <WebView
            originWhitelist={['*']}
            source={{ html, baseUrl: getMediaBaseUrl() }}
            style={styles.webView}
            javaScriptEnabled
            domStorageEnabled
            automaticallyAdjustContentInsets
        />
    );
}

const styles = StyleSheet.create({
    webView: {
        backgroundColor: Colors.bgCard,
        height: 220,
    },
    webFallback: {
        backgroundColor: Colors.bgCard,
        padding: 12,
        borderRadius: 8,
    },
    webText: {
        color: Colors.textPrimary,
        fontSize: 16,
        lineHeight: 24,
    },
});
