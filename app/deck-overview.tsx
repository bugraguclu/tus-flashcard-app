// Anki-style deck overview: shown when a deck is tapped on the deck list. Today's
// counts, the deck description, buried-card count with a manual Unbury, and the
// Study Now button that actually enters the queue.

import React, { useMemo, useState } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    ScrollView,
    StyleSheet,
    SafeAreaView,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Spacing, BorderRadius, FontSize, Shadows, useThemeColors, type ColorScheme } from '../constants/theme';
import { useApp } from './(tabs)/app-context';
import { getDeckByName, getBuriedCountForDeck, unburyDeck } from '../lib/deckManager';
import { getDeckDisplayName, FILTERED_ORDERS } from '../lib/models';
import { getStudyQueue } from '../lib/studyRepository';
import { alert } from '../lib/confirm';

export default function DeckOverviewScreen() {
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const router = useRouter();
    const params = useLocalSearchParams();
    const { settings, dataVersion, bumpDataVersion } = useApp();
    const [refreshToken, setRefreshToken] = useState(0);

    const deckName = typeof params.deck === 'string' ? params.deck : '';
    const deck = useMemo(() => (deckName ? getDeckByName(deckName) : null), [deckName, dataVersion, refreshToken]);

    const queue = useMemo(() => {
        if (!deck) return null;
        try {
            return getStudyQueue({ settings, selectedDeckName: deck.name });
        } catch (e) {
            console.warn('[DeckOverview] queue peek failed:', e);
            return null;
        }
    }, [deck, settings, dataVersion, refreshToken]);

    const buriedCount = useMemo(
        () => (deck ? getBuriedCountForDeck(deck.id) : 0),
        [deck, dataVersion, refreshToken],
    );

    if (!deck) {
        return (
            <SafeAreaView style={styles.container}>
                <Text style={styles.missing}>Deste bulunamadı.</Text>
            </SafeAreaView>
        );
    }

    const totalReady = queue ? queue.cards.length : 0;

    const handleUnbury = () => {
        const count = unburyDeck(deck.id, settings.dayRolloverHour);
        bumpDataVersion();
        setRefreshToken((value) => value + 1);
        alert('Gömülüler açıldı', `${count} kart tekrar çalışılabilir.`);
    };

    return (
        <SafeAreaView style={styles.container}>
            <ScrollView contentContainerStyle={styles.content}>
                <Text style={styles.deckTitle}>
                    {deck.isFiltered ? '⧉ ' : '🗃️ '}{getDeckDisplayName(deck.name)}
                </Text>
                {deck.name.includes('::') && (
                    <Text style={styles.deckPath}>{deck.name}</Text>
                )}

                {deck.description ? (
                    <Text style={styles.description}>📝 {deck.description}</Text>
                ) : null}

                <View style={styles.countsCard}>
                    <View style={styles.countBox}>
                        <Text style={[styles.countValue, { color: colors.badgeNew }]}>{queue?.stats.newCount ?? 0}</Text>
                        <Text style={styles.countLabel}>Yeni</Text>
                    </View>
                    <View style={styles.countBox}>
                        <Text style={[styles.countValue, { color: colors.badgeLearn }]}>{queue?.stats.learningCount ?? 0}</Text>
                        <Text style={styles.countLabel}>Öğrenilen</Text>
                    </View>
                    <View style={styles.countBox}>
                        <Text style={[styles.countValue, { color: colors.badgeReview }]}>{queue?.stats.reviewCount ?? 0}</Text>
                        <Text style={styles.countLabel}>Tekrar</Text>
                    </View>
                </View>

                {deck.isFiltered && (
                    <Text style={styles.filterInfo}>
                        🔍 {deck.searchQuery || '(boş arama)'} · {FILTERED_ORDERS[deck.searchOrder ?? 0]}
                        {deck.reschedule === false ? ' · Önizleme modu' : ''}
                    </Text>
                )}

                {buriedCount > 0 && (
                    <TouchableOpacity style={styles.unburyBtn} onPress={handleUnbury}>
                        <Text style={styles.unburyText}>💤 Gömülü {buriedCount} kartı şimdi aç</Text>
                    </TouchableOpacity>
                )}

                <TouchableOpacity
                    style={[styles.studyBtn, totalReady === 0 && styles.studyBtnIdle]}
                    onPress={() => router.push({ pathname: '/', params: { deck: deck.name } } as any)}
                >
                    <Text style={styles.studyBtnText}>
                        {totalReady > 0 ? `▶️ Şimdi Çalış (${totalReady} kart)` : '▶️ Çalışma Ekranını Aç'}
                    </Text>
                </TouchableOpacity>

                {totalReady === 0 && (
                    <Text style={styles.doneNote}>🎉 Bugün için hazır kart yok. Sayaç ve limit detayları çalışma ekranında.</Text>
                )}

                {!deck.isFiltered && (
                    <TouchableOpacity
                        style={styles.secondaryBtn}
                        onPress={() => router.push(`/deck-options?deckId=${deck.id}` as any)}
                    >
                        <Text style={styles.secondaryText}>⚙️ Deste Seçenekleri</Text>
                    </TouchableOpacity>
                )}

                <TouchableOpacity
                    style={styles.secondaryBtn}
                    onPress={() => router.push(`/stats?deck=${encodeURIComponent(deck.name)}` as any)}
                >
                    <Text style={styles.secondaryText}>📊 Deste İstatistikleri</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.cancelBtn} onPress={() => router.back()}>
                    <Text style={styles.cancelText}>‹ Destelere Dön</Text>
                </TouchableOpacity>
            </ScrollView>
        </SafeAreaView>
    );
}

function createStyles(colors: ColorScheme) {
    return StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.bgPrimary },
        content: { padding: Spacing.xl, gap: Spacing.md, alignItems: 'stretch' },
        missing: { margin: Spacing.xl, color: colors.textMuted, fontSize: FontSize.md },
        deckTitle: { fontSize: FontSize.xxl, fontWeight: '700', color: colors.textPrimary, textAlign: 'center' },
        deckPath: { fontSize: FontSize.sm, color: colors.textMuted, textAlign: 'center', marginTop: -6 },
        description: {
            fontSize: FontSize.md,
            color: colors.textSecondary,
            textAlign: 'center',
            backgroundColor: colors.bgSecondary,
            borderRadius: BorderRadius.sm,
            padding: Spacing.md,
        },
        countsCard: {
            flexDirection: 'row',
            justifyContent: 'space-around',
            backgroundColor: colors.bgCard,
            borderRadius: BorderRadius.lg,
            borderWidth: 1,
            borderColor: colors.border,
            paddingVertical: Spacing.lg,
            ...Shadows.sm,
        },
        countBox: { alignItems: 'center', gap: 2 },
        countValue: { fontSize: 30, fontWeight: '700' },
        countLabel: { fontSize: FontSize.sm, color: colors.textMuted },
        filterInfo: { fontSize: FontSize.sm, color: colors.textMuted, textAlign: 'center' },
        unburyBtn: {
            alignItems: 'center',
            paddingVertical: Spacing.md,
            borderRadius: BorderRadius.sm,
            borderWidth: 1,
            borderColor: colors.btnHard,
            backgroundColor: colors.btnHardBg,
        },
        unburyText: { color: colors.btnHard, fontWeight: '700' },
        studyBtn: {
            alignItems: 'center',
            paddingVertical: Spacing.lg,
            borderRadius: BorderRadius.md,
            backgroundColor: colors.accent,
            ...Shadows.md,
        },
        studyBtnIdle: { opacity: 0.85 },
        studyBtnText: { color: colors.white, fontWeight: '700', fontSize: FontSize.lg },
        doneNote: { fontSize: FontSize.sm, color: colors.textMuted, textAlign: 'center' },
        secondaryBtn: {
            alignItems: 'center',
            paddingVertical: Spacing.md,
            borderRadius: BorderRadius.sm,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.bgCard,
        },
        secondaryText: { color: colors.textSecondary, fontWeight: '600' },
        cancelBtn: { alignItems: 'center', paddingVertical: Spacing.md },
        cancelText: { color: colors.textMuted, fontWeight: '600' },
    });
}
