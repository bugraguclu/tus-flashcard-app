// ============================================================
// TUS Flashcard - Card Info Screen (Modal)
// Shows card details: scheduling info + complete review history
// ============================================================

import React, { useState, useEffect, useMemo } from 'react';
import {
    View, Text, ScrollView, StyleSheet, SafeAreaView, TouchableOpacity,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Colors, Spacing, BorderRadius, FontSize, Shadows } from '../constants/theme';
import { FLAG_COLORS } from '../lib/models';
import type { CardFlag } from '../lib/models';
import type { ReviewLog } from '../lib/models';

export default function CardInfoScreen() {
    const router = useRouter();
    const params = useLocalSearchParams();
    const cardId = Number(params.cardId || 0);

    // Mock data for now — will integrate with noteManager
    const cardInfo = useMemo(() => ({
        id: cardId,
        noteId: cardId,
        deckName: 'TUS::Anatomi',
        noteTypeName: 'TUS Tıp Kartı',
        templateName: 'Soru → Cevap',
        created: '2024-01-15',
        modified: '2024-03-08',
        // Scheduling
        type: 'review' as const,
        queue: 'review' as const,
        due: '2024-03-10',
        interval: 14,
        easeFactor: 2.5,
        reviews: 12,
        lapses: 1,
        flags: 0 as CardFlag,
        // FSRS
        stability: 21.5,
        difficulty: 4.2,
        retrievability: 0.92,
        // Tags
        tags: ['anatomi', 'üst-ekstremite', 'yüksek-verim'],
    }), [cardId]);

    // Mock review history
    const reviewHistory: ReviewLog[] = useMemo(() => [
        { id: 1710000000000, cardId, usn: -1, ease: 3, ivl: 1, lastIvl: 0, factor: 2500, time: 8200, type: 0 },
        { id: 1710100000000, cardId, usn: -1, ease: 3, ivl: 3, lastIvl: 1, factor: 2500, time: 5100, type: 1 },
        { id: 1710400000000, cardId, usn: -1, ease: 4, ivl: 8, lastIvl: 3, factor: 2650, time: 4300, type: 1 },
        { id: 1711100000000, cardId, usn: -1, ease: 1, ivl: -600, lastIvl: 8, factor: 2450, time: 15200, type: 1 },
        { id: 1711110000000, cardId, usn: -1, ease: 3, ivl: 1, lastIvl: -600, factor: 2450, time: 6700, type: 2 },
        { id: 1711200000000, cardId, usn: -1, ease: 3, ivl: 4, lastIvl: 1, factor: 2450, time: 4100, type: 1 },
        { id: 1711600000000, cardId, usn: -1, ease: 3, ivl: 10, lastIvl: 4, factor: 2450, time: 3900, type: 1 },
        { id: 1712500000000, cardId, usn: -1, ease: 4, ivl: 14, lastIvl: 10, factor: 2600, time: 2800, type: 1 },
    ], [cardId]);

    const easeLabel = (ease: number) => {
        switch (ease) {
            case 1: return { text: 'Tekrar', color: Colors.btnAgain };
            case 2: return { text: 'Zor', color: Colors.btnHard };
            case 3: return { text: 'İyi', color: Colors.btnGood };
            case 4: return { text: 'Kolay', color: Colors.btnEasy };
            default: return { text: '?', color: Colors.textMuted };
        }
    };

    const typeLabel = (type: number) => {
        switch (type) {
            case 0: return 'Öğrenme';
            case 1: return 'Tekrar';
            case 2: return 'Yeniden Öğr.';
            case 3: return 'Filtre';
            case 4: return 'Manuel';
            default: return '?';
        }
    };

    const formatIvl = (ivl: number) => {
        if (ivl < 0) return `${Math.abs(ivl)}sn`;
        if (ivl === 0) return '0';
        if (ivl === 1) return '1 gün';
        if (ivl < 30) return `${ivl} gün`;
        if (ivl < 365) return `${(ivl / 30).toFixed(1)} ay`;
        return `${(ivl / 365).toFixed(1)} yıl`;
    };

    const formatTime = (ms: number) => {
        const sec = Math.round(ms / 1000);
        if (sec < 60) return `${sec}sn`;
        return `${Math.floor(sec / 60)}dk ${sec % 60}sn`;
    };

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()}>
                    <Text style={styles.backBtn}>← Geri</Text>
                </TouchableOpacity>
                <Text style={styles.title}>Kart Bilgisi</Text>
                <View style={{ width: 60 }} />
            </View>

            <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
                {/* Card Overview */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Genel Bilgi</Text>
                    <InfoRow label="Kart ID" value={`#${cardInfo.id}`} />
                    <InfoRow label="Not Tipi" value={cardInfo.noteTypeName} />
                    <InfoRow label="Şablon" value={cardInfo.templateName} />
                    <InfoRow label="Deste" value={cardInfo.deckName} />
                    <InfoRow label="Oluşturulma" value={cardInfo.created} />
                    <InfoRow label="Değiştirilme" value={cardInfo.modified} />
                </View>

                {/* Tags */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Etiketler</Text>
                    <View style={styles.tagsRow}>
                        {cardInfo.tags.map(tag => (
                            <View key={tag} style={styles.tag}>
                                <Text style={styles.tagText}>{tag}</Text>
                            </View>
                        ))}
                    </View>
                </View>

                {/* Flags */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Bayrak</Text>
                    <View style={styles.flagsRow}>
                        {([0, 1, 2, 3, 4, 5, 6, 7] as CardFlag[]).map(flag => (
                            <TouchableOpacity
                                key={flag}
                                style={[
                                    styles.flagBtn,
                                    cardInfo.flags === flag && styles.flagBtnActive,
                                    { borderColor: flag === 0 ? Colors.border : FLAG_COLORS[flag].color },
                                ]}
                            >
                                <View style={[
                                    styles.flagDot,
                                    { backgroundColor: flag === 0 ? 'transparent' : FLAG_COLORS[flag].color },
                                ]} />
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>

                {/* Scheduling Info */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Zamanlama</Text>
                    <InfoRow label="Durum" value={cardInfo.type === 'review' ? 'Tekrar' : cardInfo.type === 'learning' ? 'Öğreniyor' : 'Yeni'} />
                    <InfoRow label="Son Tekrar Tarihi" value={cardInfo.due} />
                    <InfoRow label="Aralık" value={formatIvl(cardInfo.interval)} />
                    <InfoRow label="Ease Factor" value={`${(cardInfo.easeFactor * 100).toFixed(0)}%`} />
                    <InfoRow label="Toplam Tekrar" value={`${cardInfo.reviews}`} />
                    <InfoRow label="Lapse Sayısı" value={`${cardInfo.lapses}`} highlight={cardInfo.lapses > 0} />
                </View>

                {/* FSRS Info */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>FSRS Bilgisi</Text>
                    <InfoRow label="Stability (S)" value={`${cardInfo.stability.toFixed(1)} gün`} />
                    <InfoRow label="Difficulty (D)" value={`${cardInfo.difficulty.toFixed(1)} / 10`} />
                    <InfoRow label="Retrievability (R)" value={`${(cardInfo.retrievability * 100).toFixed(0)}%`} />
                </View>

                {/* Review History */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Tekrar Geçmişi ({reviewHistory.length})</Text>

                    {/* Table Header */}
                    <View style={styles.tableHeader}>
                        <Text style={[styles.th, { flex: 2 }]}>Tarih</Text>
                        <Text style={[styles.th, { flex: 1 }]}>Cevap</Text>
                        <Text style={[styles.th, { flex: 1 }]}>Aralık</Text>
                        <Text style={[styles.th, { flex: 1 }]}>Ease</Text>
                        <Text style={[styles.th, { flex: 1 }]}>Süre</Text>
                        <Text style={[styles.th, { flex: 1 }]}>Tip</Text>
                    </View>

                    {/* Table Rows */}
                    {reviewHistory.map((rev, i) => {
                        const el = easeLabel(rev.ease);
                        const date = new Date(rev.id);
                        const dateStr = `${date.getDate()}/${date.getMonth() + 1}`;
                        return (
                            <View key={rev.id} style={[styles.tableRow, i % 2 === 0 && styles.tableRowEven]}>
                                <Text style={[styles.td, { flex: 2 }]}>{dateStr}</Text>
                                <Text style={[styles.td, { flex: 1, color: el.color, fontWeight: '700' }]}>{el.text}</Text>
                                <Text style={[styles.td, { flex: 1 }]}>{formatIvl(rev.ivl)}</Text>
                                <Text style={[styles.td, { flex: 1 }]}>{(rev.factor / 10).toFixed(0)}%</Text>
                                <Text style={[styles.td, { flex: 1 }]}>{formatTime(rev.time)}</Text>
                                <Text style={[styles.td, { flex: 1 }]}>{typeLabel(rev.type)}</Text>
                            </View>
                        );
                    })}
                </View>

                <View style={{ height: 40 }} />
            </ScrollView>
        </SafeAreaView>
    );
}

function InfoRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
    return (
        <View style={infoStyles.row}>
            <Text style={infoStyles.label}>{label}</Text>
            <Text style={[infoStyles.value, highlight && infoStyles.valueHighlight]}>{value}</Text>
        </View>
    );
}

const infoStyles = StyleSheet.create({
    row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
    label: { fontSize: FontSize.sm, color: Colors.textMuted },
    value: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.textPrimary },
    valueHighlight: { color: Colors.btnAgain },
});

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.bgPrimary },
    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
        borderBottomWidth: 1, borderBottomColor: Colors.borderLight,
    },
    backBtn: { fontSize: FontSize.md, color: Colors.accent, fontWeight: '600' },
    title: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.textPrimary },
    content: { flex: 1, padding: Spacing.lg },

    section: {
        backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border,
        borderRadius: BorderRadius.md, padding: Spacing.lg, marginBottom: Spacing.md,
        ...Shadows.sm,
    },
    sectionTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.sm },

    tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    tag: {
        paddingHorizontal: 10, paddingVertical: 4, backgroundColor: Colors.accentLight,
        borderRadius: BorderRadius.full, borderWidth: 1, borderColor: Colors.accent,
    },
    tagText: { fontSize: FontSize.xs, fontWeight: '600', color: Colors.accent },

    flagsRow: { flexDirection: 'row', gap: 8 },
    flagBtn: {
        width: 32, height: 32, borderRadius: 16, borderWidth: 2,
        alignItems: 'center', justifyContent: 'center',
    },
    flagBtnActive: { backgroundColor: Colors.accentLight },
    flagDot: { width: 16, height: 16, borderRadius: 8 },

    tableHeader: {
        flexDirection: 'row', paddingVertical: 6,
        borderBottomWidth: 1, borderBottomColor: Colors.border,
    },
    th: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.textMuted, letterSpacing: 0.3, textTransform: 'uppercase' },
    tableRow: { flexDirection: 'row', paddingVertical: 6 },
    tableRowEven: { backgroundColor: Colors.bgSecondary },
    td: { fontSize: FontSize.xs, color: Colors.textSecondary },
});
