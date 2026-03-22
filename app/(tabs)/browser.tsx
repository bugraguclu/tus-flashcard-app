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
import { Colors, Spacing, BorderRadius, FontSize, Shadows } from '../../constants/theme';
import { TUS_SUBJECTS } from '../../lib/data';
import { dbSearchCards } from '../../lib/db';
import { useApp } from './_layout';
import { getBrowserCards, setCardSuspended, type StudyCard } from '../../lib/studyRepository';

export default function BrowserScreen() {
    const { settings, bumpDataVersion, dataVersion } = useApp();

    const [allCards, setAllCards] = useState<StudyCard[]>([]);
    const [rawQuery, setRawQuery] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
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
    }, [allCards, selectedSubject, searchQuery]);

    const toggleSuspend = useCallback((cardId: number, isSuspended: boolean) => {
        setCardSuspended(cardId, !isSuspended, settings.dayRolloverHour);
        bumpDataVersion();
        reload();
    }, [reload, bumpDataVersion, settings.dayRolloverHour]);

    const subject = (id: string) => TUS_SUBJECTS.find((s) => s.id === id);

    const renderCard = ({ item }: { item: StudyCard }) => {
        const isExpanded = expandedCard === item.cardId;
        const sub = subject(item.subject);

        const statusColor = item.state.status === 'new'
            ? Colors.badgeNew
            : item.state.status === 'learning'
                ? Colors.badgeLearn
                : Colors.badgeReview;

        const statusBg = item.state.status === 'new'
            ? Colors.badgeNewBg
            : item.state.status === 'learning'
                ? Colors.badgeLearnBg
                : Colors.badgeReviewBg;

        return (
            <TouchableOpacity
                style={[styles.cardItem, item.state.suspended && styles.cardSuspended]}
                onPress={() => setExpandedCard(isExpanded ? null : item.cardId)}
                activeOpacity={0.7}
            >
                <View style={styles.cardItemHeader}>
                    <Text style={styles.cardIcon}>{sub?.icon || '📝'}</Text>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.cardQuestion} numberOfLines={isExpanded ? undefined : 2}>
                            {item.question}
                        </Text>
                        <View style={styles.cardMeta}>
                            <Text style={styles.cardTopic}>{sub?.name || item.subject} · {item.topic}</Text>
                            <View style={[styles.statusDot, { backgroundColor: statusBg }]}>
                                <Text style={[styles.statusDotText, { color: statusColor }]}>
                                    {item.state.status === 'new' ? 'Yeni' : item.state.status === 'learning' ? 'Öğren' : 'Tekrar'}
                                </Text>
                            </View>
                        </View>
                    </View>
                    {item.state.suspended && <Text style={styles.suspendedIcon}>⏸️</Text>}
                </View>

                {isExpanded && (
                    <View style={styles.expandedContent}>
                        <View style={styles.answerBox}>
                            <Text style={styles.answerLabel}>CEVAP</Text>
                            <Text style={styles.answerContent}>{item.answer}</Text>
                        </View>

                        <View style={styles.cardDetails}>
                            <View style={styles.detailRow}>
                                <Text style={styles.detailLabel}>Interval</Text>
                                <Text style={styles.detailValue}>{item.state.interval} gün</Text>
                            </View>
                            <View style={styles.detailRow}>
                                <Text style={styles.detailLabel}>Ease</Text>
                                <Text style={styles.detailValue}>{item.state.easeFactor.toFixed(2)}</Text>
                            </View>
                            <View style={styles.detailRow}>
                                <Text style={styles.detailLabel}>Due</Text>
                                <Text style={styles.detailValue}>{item.state.status === 'learning' ? 'Learning queue' : item.state.dueDate}</Text>
                            </View>
                        </View>

                        <TouchableOpacity
                            style={[styles.suspendBtn, item.state.suspended && styles.suspendBtnActive]}
                            onPress={() => toggleSuspend(item.cardId, item.state.suspended)}
                        >
                            <Text style={styles.suspendBtnText}>
                                {item.state.suspended ? '▶️ Sürdür' : '⏸️ Askıya Al'}
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
                <Text style={styles.title}>🗂️ Kart Tarayıcı</Text>
                <Text style={styles.subtitle}>{filteredCards.length} kart</Text>
            </View>

            <View style={styles.searchContainer}>
                <TextInput
                    style={styles.searchInput}
                    placeholder="🔍 Kart ara..."
                    placeholderTextColor={Colors.textMuted}
                    value={rawQuery}
                    onChangeText={handleSearch}
                />
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={styles.filterContent}>
                <TouchableOpacity
                    style={[styles.filterChip, !selectedSubject && styles.filterChipActive]}
                    onPress={() => setSelectedSubject(null)}
                >
                    <Text style={[styles.filterChipText, !selectedSubject && styles.filterChipTextActive]}>Tümü</Text>
                </TouchableOpacity>
                {TUS_SUBJECTS.map((item) => (
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
                contentContainerStyle={styles.listContent}
                showsVerticalScrollIndicator={false}
                refreshing={loading}
                onRefresh={reload}
            />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.bgPrimary },
    header: {
        paddingHorizontal: Spacing.lg,
        paddingTop: Spacing.lg,
        paddingBottom: Spacing.sm,
        flexDirection: 'row',
        alignItems: 'baseline',
        gap: 8,
    },
    title: { fontSize: FontSize.xxl, fontWeight: '700', color: Colors.textPrimary },
    subtitle: { fontSize: FontSize.md, color: Colors.textMuted },

    searchContainer: { paddingHorizontal: Spacing.lg, marginBottom: Spacing.sm },
    searchInput: {
        backgroundColor: Colors.bgCard,
        borderWidth: 1,
        borderColor: Colors.border,
        borderRadius: BorderRadius.sm,
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.sm,
        fontSize: FontSize.md,
        color: Colors.textPrimary,
    },

    filterScroll: { maxHeight: 42 },
    filterContent: { paddingHorizontal: Spacing.lg, gap: 6 },
    filterChip: {
        paddingHorizontal: Spacing.md,
        paddingVertical: 5,
        backgroundColor: Colors.bgCard,
        borderRadius: BorderRadius.full,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    filterChipActive: { backgroundColor: Colors.accentLight, borderColor: Colors.accent },
    filterChipText: { fontSize: FontSize.sm, color: Colors.textSecondary },
    filterChipTextActive: { color: Colors.accent, fontWeight: '600' },

    listContent: { padding: Spacing.lg, gap: 8 },

    cardItem: {
        backgroundColor: Colors.bgCard,
        borderWidth: 1,
        borderColor: Colors.border,
        borderRadius: BorderRadius.md,
        padding: Spacing.md,
        ...Shadows.sm,
    },
    cardSuspended: { opacity: 0.5 },
    cardItemHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    cardIcon: { fontSize: 22, marginTop: 2 },
    cardQuestion: { fontSize: FontSize.md, fontWeight: '500', color: Colors.textPrimary, lineHeight: 22 },
    cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
    cardTopic: { fontSize: FontSize.xs, color: Colors.textMuted },
    statusDot: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 3 },
    statusDotText: { fontSize: 9, fontWeight: '600' },
    suspendedIcon: { fontSize: 18 },

    expandedContent: { marginTop: Spacing.md, paddingTop: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.borderLight },
    answerBox: {
        backgroundColor: Colors.bgInput,
        borderRadius: BorderRadius.sm,
        padding: Spacing.md,
        marginBottom: Spacing.md,
    },
    answerLabel: {
        fontSize: 9,
        fontWeight: '700',
        letterSpacing: 1,
        color: Colors.accent,
        marginBottom: 4,
        textTransform: 'uppercase',
    },
    answerContent: { fontSize: FontSize.md, color: Colors.textSecondary, lineHeight: 22 },
    cardDetails: { gap: 4, marginBottom: Spacing.sm },
    detailRow: { flexDirection: 'row', justifyContent: 'space-between' },
    detailLabel: { fontSize: FontSize.sm, color: Colors.textMuted },
    detailValue: { fontSize: FontSize.sm, color: Colors.textPrimary, fontWeight: '500' },

    suspendBtn: {
        paddingVertical: Spacing.sm,
        backgroundColor: Colors.bgInput,
        borderRadius: BorderRadius.sm,
        alignItems: 'center',
    },
    suspendBtnActive: { backgroundColor: Colors.accentLight },
    suspendBtnText: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.textSecondary },
});
