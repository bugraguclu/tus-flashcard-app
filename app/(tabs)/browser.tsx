import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    TextInput,
    StyleSheet,
    SafeAreaView,
    FlatList,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useThemeColors, type ColorScheme, Spacing, BorderRadius, FontSize, Shadows } from '../../constants/theme';
import { getAllSubjects } from '../../lib/subjects';
import { dbSearchCards } from '../../lib/db';
import { localDayNumber, ymdToLocalDayNumber } from '../../lib/ankiState';
import { useApp } from './_layout';
import type { CardState, StudyCard } from '../../lib/types';
import { FLAG_COLORS, type CardFlag } from '../../lib/models';
import { getBrowserCards, setCardSuspended } from '../../lib/studyRepository';
import { humanizeCardText } from '../../lib/displayText';
import { useI18n } from '../../hooks/useI18n';
import type { SupportedLocale } from '../../lib/i18n';
import { cardFlagName } from '../../lib/i18n';

/** Compact "how long ago" label for the card list (Turkish). */
function formatLastReview(lastReviewedAtMs: number, locale: SupportedLocale): string {
    if (!lastReviewedAtMs) return locale === 'tr' ? 'Hiç çalışılmadı' : 'Never studied';

    const elapsedMs = Date.now() - lastReviewedAtMs;
    if (elapsedMs < 60_000) return locale === 'tr' ? 'Az önce' : 'Just now';
    if (elapsedMs < 3_600_000) return locale === 'tr' ? `${Math.floor(elapsedMs / 60_000)} dk. önce` : `${Math.floor(elapsedMs / 60_000)}m ago`;
    if (elapsedMs < 86_400_000) return locale === 'tr' ? `${Math.floor(elapsedMs / 3_600_000)} sa. önce` : `${Math.floor(elapsedMs / 3_600_000)}h ago`;

    const days = Math.floor(elapsedMs / 86_400_000);
    if (days < 30) return locale === 'tr' ? `${days} gün önce` : `${days}d ago`;

    const date = new Date(lastReviewedAtMs);
    return `${date.getDate()}.${date.getMonth() + 1}.${date.getFullYear()}`;
}

/** Compact "when is it due" label from the scheduling state (Turkish). */
function formatNextDue(state: CardState, rolloverHour: number, locale: SupportedLocale): string {
    if (state.suspended) return locale === 'tr' ? 'Askıda' : 'Suspended';
    if (state.buried) return locale === 'tr' ? 'Gömülü (yarına kadar)' : 'Buried (until tomorrow)';
    if (state.status === 'new') return locale === 'tr' ? 'Sırada (yeni)' : 'Queued (new)';

    if (state.status === 'learning' && state.dueTime > 0) {
        const remainingMs = state.dueTime - Date.now();
        if (remainingMs <= 0) return locale === 'tr' ? 'Şimdi' : 'Now';
        if (remainingMs < 3_600_000) return locale === 'tr' ? `${Math.max(1, Math.ceil(remainingMs / 60_000))} dk. sonra` : `in ${Math.max(1, Math.ceil(remainingMs / 60_000))}m`;
        return locale === 'tr' ? `${Math.ceil(remainingMs / 3_600_000)} sa. sonra` : `in ${Math.ceil(remainingMs / 3_600_000)}h`;
    }

    const today = localDayNumber(Date.now(), rolloverHour);
    const dueDay = ymdToLocalDayNumber(state.dueDate, today, rolloverHour);
    const diff = dueDay - today;
    if (diff <= 0) return locale === 'tr' ? 'Bugün' : 'Today';
    if (diff === 1) return locale === 'tr' ? 'Yarın' : 'Tomorrow';
    if (diff < 30) return locale === 'tr' ? `${diff} gün sonra` : `in ${diff} days`;
    if (diff < 365) return locale === 'tr' ? `${Math.round(diff / 30)} ay sonra` : `in ${Math.round(diff / 30)} months`;
    return locale === 'tr' ? `${(diff / 365).toFixed(1)} yıl sonra` : `in ${(diff / 365).toFixed(1)} years`;
}

export default function BrowserScreen() {
    const { t, l, locale } = useI18n();
    const { settings, bumpDataVersion, dataVersion } = useApp();
    const router = useRouter();
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const subjects = useMemo(() => getAllSubjects(), [dataVersion]);

    const [allCards, setAllCards] = useState<StudyCard[]>([]);
    const [rawQuery, setRawQuery] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
    const [markedOnly, setMarkedOnly] = useState(false);
    const [expandedCard, setExpandedCard] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const reload = useCallback(() => {
        const cards = getBrowserCards(settings);
        setAllCards(cards);
        setLoading(false);
    }, [settings]);

    useEffect(() => {
        reload();
    }, [reload, dataVersion]);

    useEffect(() => () => {
        if (debounceRef.current) {
            clearTimeout(debounceRef.current);
            debounceRef.current = null;
        }
    }, []);

    const handleSearch = useCallback((text: string) => {
        setRawQuery(text);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => setSearchQuery(text), 200);
    }, []);

    const filteredCards = useMemo(() => {
        const query = searchQuery.trim();
        let cards = allCards;

        if (selectedSubject) {
            cards = cards.filter((card) => card.subject === selectedSubject);
        }

        if (markedOnly) {
            cards = cards.filter((card) => card.noteMarked);
        }

        if (!query) {
            return cards;
        }

        const ids = dbSearchCards(query);
        if (ids.length > 0) {
            const idSet = new Set(ids);
            return cards.filter((card) => idSet.has(card.cardId));
        }

        const lower = query.toLowerCase();
        return cards.filter((card) => (
            card.question.toLowerCase().includes(lower)
            || card.answer.toLowerCase().includes(lower)
            || card.topic.toLowerCase().includes(lower)
        ));
    }, [allCards, selectedSubject, markedOnly, searchQuery]);

    const toggleSuspend = useCallback((cardId: number, isSuspended: boolean) => {
        setCardSuspended(cardId, !isSuspended, settings.dayRolloverHour);
        bumpDataVersion();
        reload();
    }, [reload, bumpDataVersion, settings.dayRolloverHour]);

    const subject = (id: string) => subjects.find((s) => s.id === id);

    const renderCard = ({ item }: { item: StudyCard }) => {
        const isExpanded = expandedCard === item.cardId;
        const sub = subject(item.subject);
        const flag = (item.rawCard?.flags ?? 0) as CardFlag;

        const statusColor = item.state.status === 'new'
            ? colors.badgeNew
            : item.state.status === 'learning'
                ? colors.badgeLearn
                : colors.badgeReview;

        const statusBg = item.state.status === 'new'
            ? colors.badgeNewBg
            : item.state.status === 'learning'
                ? colors.badgeLearnBg
                : colors.badgeReviewBg;

        return (
            <TouchableOpacity
                style={styles.cardItem}
                onPress={() => setExpandedCard(isExpanded ? null : item.cardId)}
                activeOpacity={0.7}
            >
                <View style={[styles.cardItemHeader, item.state.suspended && styles.cardSuspended]}>
                    <Text style={styles.cardIcon}>{sub?.icon || '📝'}</Text>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.cardQuestion} numberOfLines={isExpanded ? undefined : 2}>
                            {humanizeCardText(item.question) || l('🃏 (boş)', '🃏 (empty)')}
                        </Text>
                        <View style={styles.cardMeta}>
                            <Text style={styles.cardTopic}>{sub?.name || item.subject} · {item.topic}</Text>
                            <View style={[styles.statusDot, { backgroundColor: statusBg }]}>
                                <Text style={[styles.statusDotText, { color: statusColor }]}>
                                    {item.state.status === 'new' ? t('anki.new') : item.state.status === 'learning' ? t('anki.learn') : t('anki.review')}
                                </Text>
                            </View>
                        </View>
                        <Text style={styles.scheduleMeta}>
                            ⏱ {l('Son:', 'Last:')} {formatLastReview(item.state.lastReviewedAtMs, locale)} · {l('Sonraki:', 'Next:')} {formatNextDue(item.state, settings.dayRolloverHour, locale)}
                        </Text>
                    </View>
                    {item.noteMarked && (
                        <Text style={styles.flagIcon} accessibilityLabel={l('Not işaretli', 'Note is marked')}>⭐</Text>
                    )}
                    {flag > 0 && (
                        <Text
                            style={[styles.flagIcon, { color: FLAG_COLORS[flag].color }]}
                            accessibilityLabel={l(`Bayrak: ${cardFlagName(locale, flag)}`, `Flag: ${cardFlagName(locale, flag)}`)}
                        >
                            ⚑
                        </Text>
                    )}
                    <TouchableOpacity
                        style={styles.editBtn}
                        onPress={() => router.push(`/editor?cardId=${item.cardId}`)}
                        accessibilityRole="button"
                        accessibilityLabel={l('Kartı düzenle', 'Edit card')}
                    >
                        <Text style={styles.editBtnText}>✏️</Text>
                    </TouchableOpacity>
                    {item.state.suspended && <Text style={styles.suspendedIcon}>⏸️</Text>}
                </View>

                {isExpanded && (
                    <View style={styles.expandedContent}>
                        <View style={[styles.answerBox, item.state.suspended && styles.cardSuspended]}>
                            <Text style={styles.answerLabel}>{l('CEVAP', 'ANSWER')}</Text>
                            <Text style={styles.answerContent}>{humanizeCardText(item.answer) || '—'}</Text>
                        </View>

                        <View style={[styles.cardDetails, item.state.suspended && styles.cardSuspended]}>
                            <View style={styles.detailRow}>
                                <Text style={styles.detailLabel}>{l('Aralık', 'Interval')}</Text>
                                <Text style={styles.detailValue}>{item.state.interval} {l('gün', 'days')}</Text>
                            </View>
                            <View style={styles.detailRow}>
                                <Text style={styles.detailLabel}>{l('Kolaylık', 'Ease')}</Text>
                                <Text style={styles.detailValue}>{item.state.easeFactor.toFixed(2)}</Text>
                            </View>
                            <View style={styles.detailRow}>
                                <Text style={styles.detailLabel}>{l('Sonraki gösterim', 'Due')}</Text>
                                <Text style={styles.detailValue}>{item.state.status === 'learning' ? l('Öğrenme sırasında', 'In learning') : item.state.dueDate}</Text>
                            </View>
                        </View>

                        <TouchableOpacity
                            style={[styles.suspendBtn, item.state.suspended && styles.suspendBtnActive]}
                            onPress={() => toggleSuspend(item.cardId, item.state.suspended)}
                        >
                            <Text style={styles.suspendBtnText}>
                                {item.state.suspended ? l('▶️ Askıdan Çıkar', '▶️ Unsuspend') : `⏸️ ${t('anki.suspend')}`}
                            </Text>
                        </TouchableOpacity>
                    </View>
                )}
            </TouchableOpacity>
        );
    };

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.title}>🗂️ {t('sidebar.myCards')}</Text>
                <Text style={styles.subtitle}>{filteredCards.length} {l('kart', 'cards')}</Text>
                <View style={{ flex: 1 }} />
                <TouchableOpacity
                    style={styles.addCardBtn}
                    onPress={() => router.push(selectedSubject ? `/editor?subject=${selectedSubject}` : '/editor')}
                    accessibilityRole="button"
                    accessibilityLabel={l('Yeni kart ekle', 'Add new card')}
                >
                    <Text style={styles.addCardBtnText}>＋ {l('Yeni Kart', 'New Card')}</Text>
                </TouchableOpacity>
            </View>

            <View style={styles.searchContainer}>
                <TextInput
                    style={styles.searchInput}
                    placeholder={l('🔍 Kart ara…', '🔍 Search cards…')}
                    placeholderTextColor={colors.textMuted}
                    value={rawQuery}
                    onChangeText={handleSearch}
                />
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={styles.filterContent}>
                <TouchableOpacity
                    style={[styles.filterChip, !selectedSubject && styles.filterChipActive]}
                    onPress={() => setSelectedSubject(null)}
                >
                    <Text style={[styles.filterChipText, !selectedSubject && styles.filterChipTextActive]}>{t('common.all')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.filterChip, markedOnly && styles.filterChipActive]}
                    onPress={() => setMarkedOnly((prev) => !prev)}
                    accessibilityRole="button"
                    accessibilityLabel={l('Yalnızca işaretli notları göster', 'Show marked notes only')}
                >
                    <Text style={[styles.filterChipText, markedOnly && styles.filterChipTextActive]}>⭐ {l('İşaretli', 'Marked')}</Text>
                </TouchableOpacity>
                {subjects.map((item) => (
                    <TouchableOpacity
                        key={item.id}
                        style={[styles.filterChip, selectedSubject === item.id && styles.filterChipActive]}
                        onPress={() => setSelectedSubject(selectedSubject === item.id ? null : item.id)}
                    >
                        <Text style={[styles.filterChipText, selectedSubject === item.id && styles.filterChipTextActive]}>
                            {item.icon} {item.name}
                        </Text>
                    </TouchableOpacity>
                ))}
            </ScrollView>

            <FlatList
                data={filteredCards}
                renderItem={renderCard}
                keyExtractor={(item) => String(item.cardId)}
                style={styles.list}
                contentContainerStyle={styles.listContent}
                showsVerticalScrollIndicator={false}
                refreshing={loading}
                onRefresh={reload}
            />
        </SafeAreaView>
    );
}

function createStyles(colors: ColorScheme) {
    return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bgPrimary },
    header: {
        paddingHorizontal: Spacing.lg,
        paddingTop: Spacing.lg,
        paddingBottom: Spacing.sm,
        flexDirection: 'row',
        alignItems: 'baseline',
        gap: 8,
    },
    title: { fontSize: FontSize.xxl, fontWeight: '700', color: colors.textPrimary },
    subtitle: { fontSize: FontSize.md, color: colors.textMuted },
    addCardBtn: {
        backgroundColor: colors.accent,
        paddingHorizontal: Spacing.lg,
        paddingVertical: 8,
        borderRadius: BorderRadius.sm,
    },
    addCardBtnText: { fontSize: FontSize.md, fontWeight: '700', color: colors.white },

    searchContainer: { paddingHorizontal: Spacing.lg, marginBottom: Spacing.sm },
    searchInput: {
        backgroundColor: colors.bgCard,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: BorderRadius.sm,
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.sm,
        fontSize: FontSize.md,
        color: colors.textPrimary,
    },

    // flexGrow: 0 + centered content pin the chips to their natural size; otherwise the
    // row stretches into leftover space when the list below is short, inflating the chips.
    filterScroll: { minHeight: 42, maxHeight: 42, flexGrow: 0 },
    filterContent: { paddingHorizontal: Spacing.lg, gap: 6, alignItems: 'center' },
    filterChip: {
        paddingHorizontal: Spacing.md,
        paddingVertical: 5,
        backgroundColor: colors.bgCard,
        borderRadius: BorderRadius.full,
        borderWidth: 1,
        borderColor: colors.border,
    },
    filterChipActive: { backgroundColor: colors.accentLight, borderColor: colors.accent },
    filterChipText: { fontSize: FontSize.sm, color: colors.textSecondary },
    filterChipTextActive: { color: colors.accent, fontWeight: '600' },

    list: { flex: 1 },
    listContent: { padding: Spacing.lg, gap: 8 },

    cardItem: {
        backgroundColor: colors.bgCard,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: BorderRadius.md,
        padding: Spacing.md,
        ...Shadows.sm,
    },
    cardSuspended: { opacity: 0.5 },
    cardItemHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    cardIcon: { fontSize: 22, marginTop: 2 },
    cardQuestion: { fontSize: FontSize.md, fontWeight: '500', color: colors.textPrimary, lineHeight: 22 },
    cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
    cardTopic: { fontSize: FontSize.xs, color: colors.textMuted },
    statusDot: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 3 },
    statusDotText: { fontSize: 9, fontWeight: '600' },
    scheduleMeta: { fontSize: FontSize.xs, color: colors.textMuted, marginTop: 3 },
    editBtn: {
        width: 32,
        height: 32,
        borderRadius: 6,
        backgroundColor: colors.bgInput,
        alignItems: 'center',
        justifyContent: 'center',
    },
    editBtnText: { fontSize: 14 },
    suspendedIcon: { fontSize: 18 },
    flagIcon: { fontSize: 18, marginTop: 6 },

    expandedContent: { marginTop: Spacing.md, paddingTop: Spacing.md, borderTopWidth: 1, borderTopColor: colors.borderLight },
    answerBox: {
        backgroundColor: colors.bgInput,
        borderRadius: BorderRadius.sm,
        padding: Spacing.md,
        marginBottom: Spacing.md,
    },
    answerLabel: {
        fontSize: 9,
        fontWeight: '700',
        letterSpacing: 1,
        color: colors.accent,
        marginBottom: 4,
        textTransform: 'uppercase',
    },
    answerContent: { fontSize: FontSize.md, color: colors.textSecondary, lineHeight: 22 },
    cardDetails: { gap: 4, marginBottom: Spacing.sm },
    detailRow: { flexDirection: 'row', justifyContent: 'space-between' },
    detailLabel: { fontSize: FontSize.sm, color: colors.textMuted },
    detailValue: { fontSize: FontSize.sm, color: colors.textPrimary, fontWeight: '500' },

    suspendBtn: {
        paddingVertical: Spacing.sm,
        backgroundColor: colors.bgInput,
        borderRadius: BorderRadius.sm,
        alignItems: 'center',
    },
    suspendBtnActive: { backgroundColor: colors.accentLight },
    suspendBtnText: { fontSize: FontSize.sm, fontWeight: '600', color: colors.textSecondary },
    });
}
