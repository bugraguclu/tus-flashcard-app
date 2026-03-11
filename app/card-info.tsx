import React, { useMemo } from 'react';
import {
    View,
    Text,
    ScrollView,
    StyleSheet,
    SafeAreaView,
    TouchableOpacity,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Colors, Spacing, BorderRadius, FontSize, Shadows } from '../constants/theme';
import { FLAG_COLORS } from '../lib/models';
import type { CardFlag } from '../lib/models';
import { getAnkiCard, getNote, getNoteType } from '../lib/noteManager';
import { getDeck } from '../lib/deckManager';
import { getReviewsForCard } from '../lib/reviewLogger';

function parseCardId(raw: string | string[] | undefined): number {
    const value = Array.isArray(raw) ? raw[0] : raw;
    const parsed = Number(value || 0);
    return Number.isFinite(parsed) ? parsed : 0;
}

export default function CardInfoScreen() {
    const router = useRouter();
    const params = useLocalSearchParams();
    const cardId = parseCardId(params.cardId);

    const payload = useMemo(() => {
        const card = getAnkiCard(cardId);
        if (!card) return null;

        const note = getNote(card.noteId);
        const noteType = note ? getNoteType(note.noteTypeId) : null;
        const deck = getDeck(card.deckId);
        const reviews = getReviewsForCard(card.id);

        const createdAt = note?.id ? new Date(note.id).toISOString().slice(0, 10) : '-';
        const modifiedAt = card.mod ? new Date(card.mod * 1000).toISOString().slice(0, 10) : '-';

        return {
            card,
            note,
            noteType,
            deck,
            reviews,
            createdAt,
            modifiedAt,
        };
    }, [cardId]);

    if (!payload) {
        return (
            <SafeAreaView style={styles.container}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => router.back()}>
                        <Text style={styles.backBtn}>← Geri</Text>
                    </TouchableOpacity>
                    <Text style={styles.title}>Kart Bilgisi</Text>
                    <View style={{ width: 60 }} />
                </View>
                <View style={styles.emptyState}>
                    <Text style={styles.emptyTitle}>Kart bulunamadı.</Text>
                </View>
            </SafeAreaView>
        );
    }

    const { card, note, noteType, deck, reviews, createdAt, modifiedAt } = payload;

    const typeLabel = card.type === 0 ? 'New' : card.type === 1 ? 'Learning' : card.type === 2 ? 'Review' : 'Relearning';
    const queueLabel = card.queue === -1
        ? 'Suspended'
        : card.queue === -2
            ? 'Buried (User)'
            : card.queue === -3
                ? 'Buried (Scheduler)'
                : card.queue === 0
                    ? 'New'
                    : card.queue === 1 || card.queue === 3
                        ? 'Learning'
                        : 'Review';

    const formatIvl = (ivl: number) => {
        if (ivl < 0) return `${Math.abs(ivl)}sn`;
        if (ivl <= 1) return `${ivl} gün`;
        if (ivl < 30) return `${ivl} gün`;
        if (ivl < 365) return `${(ivl / 30).toFixed(1)} ay`;
        return `${(ivl / 365).toFixed(1)} yıl`;
    };

    const formatTime = (ms: number) => {
        const sec = Math.round(ms / 1000);
        if (sec < 60) return `${sec}sn`;
        return `${Math.floor(sec / 60)}dk ${sec % 60}sn`;
    };

    const easeLabel = (ease: number) => {
        switch (ease) {
            case 1: return { text: 'Tekrar', color: Colors.btnAgain };
            case 2: return { text: 'Zor', color: Colors.btnHard };
            case 3: return { text: 'İyi', color: Colors.btnGood };
            case 4: return { text: 'Kolay', color: Colors.btnEasy };
            default: return { text: String(ease), color: Colors.textMuted };
        }
    };

    const reviewTypeLabel = (type: number) => {
        if (type === 0) return 'Learning';
        if (type === 1) return 'Review';
        if (type === 2) return 'Relearn';
        if (type === 3) return 'Filtered';
        return 'Manual';
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
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Genel Bilgi</Text>
                    <InfoRow label="Card ID" value={`#${card.id}`} />
                    <InfoRow label="Note ID" value={`#${card.noteId}`} />
                    <InfoRow label="Deck" value={deck?.name || '-'} />
                    <InfoRow label="Note Type" value={noteType?.name || '-'} />
                    <InfoRow label="Oluşturulma" value={createdAt} />
                    <InfoRow label="Değiştirilme" value={modifiedAt} />
                </View>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Etiketler</Text>
                    <View style={styles.tagsRow}>
                        {(note?.tags || []).map((tag) => (
                            <View key={tag} style={styles.tag}>
                                <Text style={styles.tagText}>{tag}</Text>
                            </View>
                        ))}
                    </View>
                </View>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Bayrak</Text>
                    <View style={styles.flagsRow}>
                        {([0, 1, 2, 3, 4, 5, 6, 7] as CardFlag[]).map((flag) => (
                            <View
                                key={flag}
                                style={[
                                    styles.flagBtn,
                                    card.flags === flag && styles.flagBtnActive,
                                    { borderColor: flag === 0 ? Colors.border : FLAG_COLORS[flag].color },
                                ]}
                            >
                                <View
                                    style={[
                                        styles.flagDot,
                                        { backgroundColor: flag === 0 ? 'transparent' : FLAG_COLORS[flag].color },
                                    ]}
                                />
                            </View>
                        ))}
                    </View>
                </View>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Scheduling</Text>
                    <InfoRow label="Type" value={typeLabel} />
                    <InfoRow label="Queue" value={queueLabel} />
                    <InfoRow label="Due" value={String(card.due)} />
                    <InfoRow label="Interval" value={formatIvl(card.ivl)} />
                    <InfoRow label="Ease" value={`${(card.factor / 10).toFixed(0)}%`} />
                    <InfoRow label="Reps" value={String(card.reps)} />
                    <InfoRow label="Lapses" value={String(card.lapses)} highlight={card.lapses > 0} />
                </View>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Model Fields</Text>
                    <InfoRow label="Stability" value={card.stability.toFixed(2)} />
                    <InfoRow label="Difficulty" value={card.difficulty.toFixed(2)} />
                    <InfoRow label="Last Review" value={card.lastReview ? new Date(card.lastReview).toISOString() : '-'} />
                </View>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Review Log ({reviews.length})</Text>

                    <View style={styles.tableHeader}>
                        <Text style={[styles.th, { flex: 2 }]}>Tarih</Text>
                        <Text style={[styles.th, { flex: 1 }]}>Cevap</Text>
                        <Text style={[styles.th, { flex: 1 }]}>Aralık</Text>
                        <Text style={[styles.th, { flex: 1 }]}>Ease</Text>
                        <Text style={[styles.th, { flex: 1 }]}>Süre</Text>
                        <Text style={[styles.th, { flex: 1 }]}>Tip</Text>
                    </View>

                    {reviews.map((rev, index) => {
                        const ease = easeLabel(rev.ease);
                        const date = new Date(rev.id);
                        const dateStr = `${date.getDate()}/${date.getMonth() + 1}`;
                        return (
                            <View key={rev.id} style={[styles.tableRow, index % 2 === 0 && styles.tableRowEven]}>
                                <Text style={[styles.td, { flex: 2 }]}>{dateStr}</Text>
                                <Text style={[styles.td, { flex: 1, color: ease.color, fontWeight: '700' }]}>{ease.text}</Text>
                                <Text style={[styles.td, { flex: 1 }]}>{formatIvl(rev.ivl)}</Text>
                                <Text style={[styles.td, { flex: 1 }]}>{(rev.factor / 10).toFixed(0)}%</Text>
                                <Text style={[styles.td, { flex: 1 }]}>{formatTime(rev.time)}</Text>
                                <Text style={[styles.td, { flex: 1 }]}>{reviewTypeLabel(rev.type)}</Text>
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
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: Spacing.lg,
        paddingVertical: Spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: Colors.borderLight,
    },
    backBtn: { fontSize: FontSize.md, color: Colors.accent, fontWeight: '600' },
    title: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.textPrimary },
    content: { flex: 1, padding: Spacing.lg },

    section: {
        backgroundColor: Colors.bgCard,
        borderWidth: 1,
        borderColor: Colors.border,
        borderRadius: BorderRadius.md,
        padding: Spacing.lg,
        marginBottom: Spacing.md,
        ...Shadows.sm,
    },
    sectionTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.sm },

    tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    tag: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        backgroundColor: Colors.accentLight,
        borderRadius: BorderRadius.full,
        borderWidth: 1,
        borderColor: Colors.accent,
    },
    tagText: { fontSize: FontSize.xs, fontWeight: '600', color: Colors.accent },

    flagsRow: { flexDirection: 'row', gap: 8 },
    flagBtn: {
        width: 32,
        height: 32,
        borderRadius: 16,
        borderWidth: 2,
        alignItems: 'center',
        justifyContent: 'center',
    },
    flagBtnActive: { backgroundColor: Colors.accentLight },
    flagDot: { width: 16, height: 16, borderRadius: 8 },

    tableHeader: {
        flexDirection: 'row',
        paddingVertical: 6,
        borderBottomWidth: 1,
        borderBottomColor: Colors.border,
    },
    th: {
        fontSize: FontSize.xs,
        fontWeight: '700',
        color: Colors.textMuted,
        letterSpacing: 0.3,
        textTransform: 'uppercase',
    },
    tableRow: { flexDirection: 'row', paddingVertical: 6 },
    tableRowEven: { backgroundColor: Colors.bgSecondary },
    td: { fontSize: FontSize.xs, color: Colors.textSecondary },

    emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    emptyTitle: { fontSize: FontSize.lg, color: Colors.textSecondary },
});
