import React, { useMemo } from 'react';
import {
    View,
    Text,
    ScrollView,
    StyleSheet,
    TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Spacing, BorderRadius, FontSize, Shadows, useThemeColors, type ColorScheme } from '../constants/theme';
import { FLAG_COLORS } from '../lib/models';
import type { CardFlag } from '../lib/models';
import { getAnkiCard, getNote, getNoteType } from '../lib/noteManager';
import { getDeck } from '../lib/deckManager';
import { getReviewsForCard } from '../lib/reviewLogger';
import { useI18n } from '../hooks/useI18n';
import { FSRS6_DEFAULT_DECAY, fsrsRetrievability } from '../lib/fsrs';
import { memoryStateFromCardData, parseAnkiCardData } from '../lib/fsrsCardData';
import { localizeNoteTypeName } from '../lib/i18n';
import LeechExplainer from '../components/LeechExplainer';

function parseCardId(raw: string | string[] | undefined): number {
    const value = Array.isArray(raw) ? raw[0] : raw;
    const parsed = Number(value || 0);
    return Number.isFinite(parsed) ? parsed : 0;
}

export default function CardInfoScreen() {
    const { t, l, locale, localeTag } = useI18n();
    const router = useRouter();
    const params = useLocalSearchParams();
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
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
                        <Text style={styles.backBtn}>← {l('Geri', 'Back')}</Text>
                    </TouchableOpacity>
                    <Text style={styles.title}>{t('root.cardInfo')}</Text>
                    <View style={{ width: 60 }} />
                </View>
                <View style={styles.emptyState}>
                    <Text style={styles.emptyTitle}>{l('Kart bulunamadı.', 'Card not found.')}</Text>
                </View>
            </SafeAreaView>
        );
    }

    const { card, note, noteType, deck, reviews, createdAt, modifiedAt } = payload;

    // FSRS state, when the card has been scheduled by it. Retrievability is "how likely you are to
    // remember this right now", derived from the stability and the days since the last review.
    const cardData = parseAnkiCardData(card.ankiData);
    const memory = memoryStateFromCardData(cardData);
    const retrievability = memory && card.lastReview > 0
        ? fsrsRetrievability(
            memory.stability,
            Math.max(0, (Date.now() - card.lastReview) / 86_400_000),
            cardData.decay ?? FSRS6_DEFAULT_DECAY,
        )
        : null;

    const typeLabel = card.type === 0 ? t('anki.new') : card.type === 1 ? t('anki.learn') : card.type === 2 ? t('anki.review') : t('anki.relearn');
    const queueLabel = card.queue === -1
        ? l('Askıda', 'Suspended')
        : card.queue === -2
            ? l('Kullanıcı tarafından gömüldü', 'Buried manually')
            : card.queue === -3
                ? l('Zamanlayıcı tarafından gömüldü', 'Buried by scheduler')
                : card.queue === 0
                    ? t('anki.new')
                    : card.queue === 1 || card.queue === 3
                        ? t('anki.learn')
                        : t('anki.review');

    const formatIvl = (ivl: number) => {
        // Negative intervals are (re)learning steps stored in seconds.
        if (ivl < 0) {
            const sec = Math.abs(ivl);
            return sec < 60 ? l(`${sec} sn.`, `${sec}s`) : l(`${Math.round(sec / 60)} dk.`, `${Math.round(sec / 60)}m`);
        }
        if (ivl < 30) return l(`${ivl} gün`, `${ivl} days`);
        if (ivl < 365) return l(`${(ivl / 30).toFixed(1)} ay`, `${(ivl / 30).toFixed(1)} months`);
        return l(`${(ivl / 365).toFixed(1)} yıl`, `${(ivl / 365).toFixed(1)} years`);
    };

    const formatTime = (ms: number) => {
        const sec = Math.round(ms / 1000);
        if (sec < 60) return l(`${sec} sn.`, `${sec}s`);
        return l(`${Math.floor(sec / 60)} dk. ${sec % 60} sn.`, `${Math.floor(sec / 60)}m ${sec % 60}s`);
    };

    const easeLabel = (ease: number) => {
        switch (ease) {
            case 1: return { text: t('anki.again'), color: colors.btnAgain };
            case 2: return { text: t('anki.hard'), color: colors.btnHard };
            case 3: return { text: t('anki.good'), color: colors.btnGood };
            case 4: return { text: t('anki.easy'), color: colors.btnEasy };
            default: return { text: String(ease), color: colors.textMuted };
        }
    };

    const reviewTypeLabel = (type: number) => {
        if (type === 0) return t('anki.learn');
        if (type === 1) return t('anki.review');
        if (type === 2) return t('anki.relearn');
        if (type === 3) return l('Filtrelenmiş', 'Filtered');
        return l('El ile', 'Manual');
    };

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()}>
                    <Text style={styles.backBtn}>← {l('Geri', 'Back')}</Text>
                </TouchableOpacity>
                <Text style={styles.title}>{t('root.cardInfo')}</Text>
                <View style={{ width: 60 }} />
            </View>

            <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
                {note?.tags.includes('leech') ? <LeechExplainer context="card" /> : null}

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>{l('Genel bilgi', 'General Information')}</Text>
                    <InfoRow label="Kart ID" value={`#${card.id}`} />
                    <InfoRow label="Not ID" value={`#${card.noteId}`} />
                    <InfoRow label={t('common.deck')} value={deck?.name || '-'} />
                    <InfoRow label={l('Not türü', 'Note type')} value={noteType ? localizeNoteTypeName(locale, noteType.name) : '-'} />
                    <InfoRow label={l('Oluşturulma', 'Created')} value={createdAt} />
                    <InfoRow label={l('Değiştirilme', 'Modified')} value={modifiedAt} />
                </View>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>{l('Etiketler', 'Tags')}</Text>
                    <View style={styles.tagsRow}>
                        {(note?.tags || []).map((tag) => (
                            <View key={tag} style={styles.tag}>
                                <Text style={styles.tagText}>{tag === 'leech' ? l('Sürekli Unutulan Kart', 'Leech') : tag}</Text>
                            </View>
                        ))}
                    </View>
                </View>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>{l('Bayrak', 'Flag')}</Text>
                    <View style={styles.flagsRow}>
                        {([0, 1, 2, 3, 4, 5, 6, 7] as CardFlag[]).map((flag) => (
                            <View
                                key={flag}
                                style={[
                                    styles.flagBtn,
                                    card.flags === flag && styles.flagBtnActive,
                                    { borderColor: flag === 0 ? colors.border : FLAG_COLORS[flag].color },
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
                    <Text style={styles.sectionTitle}>{l('Zamanlama', 'Scheduling')}</Text>
                    <InfoRow label={l('Kart durumu', 'Card state')} value={typeLabel} />
                    <InfoRow label={l('Sıra', 'Queue')} value={queueLabel} />
                    <InfoRow label={l('Vade', 'Due')} value={String(card.due)} />
                    <InfoRow label={l('Aralık', 'Interval')} value={formatIvl(card.ivl)} />
                    <InfoRow label={l('Kolaylık', 'Ease')} value={`${(card.factor / 10).toFixed(0)}%`} />
                    <InfoRow label={l('Tekrar sayısı', 'Reviews')} value={String(card.reps)} />
                    <InfoRow label={l('Unutma sayısı', 'Lapses')} value={String(card.lapses)} highlight={card.lapses > 0} />
                </View>

                {memory ? (
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>{l('FSRS hafıza durumu', 'FSRS Memory State')}</Text>
                        <InfoRow
                            label={l('Hafıza gücü (stability)', 'Stability')}
                            value={l(`${memory.stability.toFixed(2)} gün`, `${memory.stability.toFixed(2)} days`)}
                        />
                        <InfoRow
                            label={l('Zorluk', 'Difficulty')}
                            value={`${(((memory.difficulty - 1) / 9) * 100).toFixed(0)}%`}
                        />
                        {retrievability !== null && (
                            <InfoRow
                                label={l('Hatırlanabilirlik', 'Retrievability')}
                                value={`${(retrievability * 100).toFixed(1)}%`}
                            />
                        )}
                        {cardData.desiredRetention !== undefined && (
                            <InfoRow
                                label={l('Hedeflenen hatırlama', 'Desired retention')}
                                value={cardData.desiredRetention.toFixed(2)}
                            />
                        )}
                    </View>
                ) : null}

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>{l('Teknik bilgi', 'Technical Information')}</Text>
                    <InfoRow label={l('Son çalışma', 'Last review')} value={card.lastReview ? new Date(card.lastReview).toISOString() : '-'} />
                </View>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>{l('Çalışma geçmişi', 'Review History')} ({reviews.length})</Text>

                    <View style={styles.tableHeader}>
                        <Text style={[styles.th, { flex: 2 }]}>{l('Tarih', 'Date')}</Text>
                        <Text style={[styles.th, { flex: 1 }]}>{l('Yanıt', 'Answer')}</Text>
                        <Text style={[styles.th, { flex: 1 }]}>{l('Aralık', 'Interval')}</Text>
                        <Text style={[styles.th, { flex: 1 }]}>{l('Kolaylık', 'Ease')}</Text>
                        <Text style={[styles.th, { flex: 1 }]}>{l('Süre', 'Time')}</Text>
                        <Text style={[styles.th, { flex: 1 }]}>{l('Tür', 'Type')}</Text>
                    </View>

                    {reviews.map((rev, index) => {
                        const ease = easeLabel(rev.ease);
                        const date = new Date(rev.id);
                        const dateStr = date.toLocaleDateString(localeTag);
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
    const colors = useThemeColors();
    const infoStyles = useMemo(() => createInfoStyles(colors), [colors]);
    return (
        <View style={infoStyles.row}>
            <Text style={infoStyles.label}>{label}</Text>
            <Text style={[infoStyles.value, highlight && infoStyles.valueHighlight]}>{value}</Text>
        </View>
    );
}

function createInfoStyles(colors: ColorScheme) {
    return StyleSheet.create({
    row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
    label: { fontSize: FontSize.sm, color: colors.textMuted },
    value: { fontSize: FontSize.sm, fontWeight: '600', color: colors.textPrimary },
    valueHighlight: { color: colors.btnAgain },
    });
}

function createStyles(colors: ColorScheme) {
    return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bgPrimary },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: Spacing.lg,
        paddingVertical: Spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: colors.borderLight,
    },
    backBtn: { fontSize: FontSize.md, color: colors.accent, fontWeight: '600' },
    title: { fontSize: FontSize.lg, fontWeight: '700', color: colors.textPrimary },
    content: { flex: 1, padding: Spacing.lg },

    section: {
        backgroundColor: colors.bgCard,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: BorderRadius.md,
        padding: Spacing.lg,
        marginBottom: Spacing.md,
        ...Shadows.sm,
    },
    sectionTitle: { fontSize: FontSize.lg, fontWeight: '700', color: colors.textPrimary, marginBottom: Spacing.sm },

    tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    tag: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        backgroundColor: colors.accentLight,
        borderRadius: BorderRadius.full,
        borderWidth: 1,
        borderColor: colors.accent,
    },
    tagText: { fontSize: FontSize.xs, fontWeight: '600', color: colors.accent },

    flagsRow: { flexDirection: 'row', gap: 8 },
    flagBtn: {
        width: 32,
        height: 32,
        borderRadius: 16,
        borderWidth: 2,
        alignItems: 'center',
        justifyContent: 'center',
    },
    flagBtnActive: { backgroundColor: colors.accentLight },
    flagDot: { width: 16, height: 16, borderRadius: 8 },

    tableHeader: {
        flexDirection: 'row',
        paddingVertical: 6,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    th: {
        fontSize: FontSize.xs,
        fontWeight: '700',
        color: colors.textMuted,
        letterSpacing: 0.3,
        textTransform: 'uppercase',
    },
    tableRow: { flexDirection: 'row', paddingVertical: 6 },
    tableRowEven: { backgroundColor: colors.bgSecondary },
    td: { fontSize: FontSize.xs, color: colors.textSecondary },

    emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    emptyTitle: { fontSize: FontSize.lg, color: colors.textSecondary },
    });
}
