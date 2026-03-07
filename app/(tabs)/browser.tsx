// ============================================================
// TUS Flashcard - Kart Tarayıcı Ekranı
// ============================================================

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
    View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, SafeAreaView, FlatList,
} from 'react-native';
import { Colors, Spacing, BorderRadius, FontSize, Shadows } from '../../constants/theme';
import { TUS_SUBJECTS, TUS_CARDS } from '../../lib/data';
import { loadAllCardStates, saveCardState, loadCustomCards, loadSettings, DEFAULT_SETTINGS } from '../../lib/storage';
import { getToday } from '../../lib/scheduler';
import type { Card, CardState, AppSettings } from '../../lib/types';

export default function BrowserScreen() {
    const [cardStates, setCardStates] = useState<Record<string, CardState>>({});
    const [customCards, setCustomCards] = useState<Card[]>([]);
    const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
    const [rawQuery, setRawQuery] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
    const [expandedCard, setExpandedCard] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // QW3: Debounce search input (200ms)
    const handleSearch = useCallback((text: string) => {
        setRawQuery(text);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => setSearchQuery(text), 200);
    }, []);

    useEffect(() => {
        async function load() {
            const [cs, cc, s] = await Promise.all([
                loadAllCardStates(), loadCustomCards(), loadSettings(),
            ]);
            setCardStates(cs); setCustomCards(cc); setSettings(s);
            setLoading(false);
        }
        load();
    }, []);

    // QW3: useMemo for allCards and filteredCards
    const allCards = useMemo(() => [...TUS_CARDS, ...customCards], [customCards]);

    const filteredCards = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        return allCards.filter(card => {
            if (selectedSubject && card.subject !== selectedSubject) return false;
            if (!q) return true;
            return (
                card.question.toLowerCase().includes(q) ||
                card.answer.toLowerCase().includes(q) ||
                card.topic.toLowerCase().includes(q)
            );
        });
    }, [allCards, selectedSubject, searchQuery]);

    const getCardState = (cardId: number): CardState | null => cardStates[cardId] || null;

    const toggleSuspend = async (cardId: number) => {
        const cs = cardStates[cardId] || {
            interval: 0, repetition: 0, dueDate: '', dueTime: 0,
            status: 'new' as const, suspended: false, buried: false,
            easeFactor: settings.startingEase, learningStep: 0,
            relearningStep: -1, lastReviewedAtMs: 0,
            stability: 0, difficulty: 0, elapsedDays: 0, lapses: 0,
        };
        const updated = { ...cs, suspended: !cs.suspended };
        const newStates = { ...cardStates, [cardId]: updated };
        setCardStates(newStates);
        await saveCardState(cardId, updated);
    };

    const subject = (id: string) => TUS_SUBJECTS.find(s => s.id === id);

    const renderCard = ({ item: card }: { item: Card }) => {
        const cs = getCardState(card.id);
        const isExpanded = expandedCard === card.id;
        const sub = subject(card.subject);
        const statusColor = !cs || cs.status === 'new' ? Colors.badgeNew
            : cs.status === 'learning' ? Colors.badgeLearn
                : Colors.badgeReview;
        const statusBg = !cs || cs.status === 'new' ? Colors.badgeNewBg
            : cs.status === 'learning' ? Colors.badgeLearnBg
                : Colors.badgeReviewBg;

        return (
            <TouchableOpacity
                style={[styles.cardItem, cs?.suspended && styles.cardSuspended]}
                onPress={() => setExpandedCard(isExpanded ? null : card.id)}
                activeOpacity={0.7}
            >
                <View style={styles.cardItemHeader}>
                    <Text style={styles.cardIcon}>{sub?.icon || '📝'}</Text>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.cardQuestion} numberOfLines={isExpanded ? undefined : 2}>
                            {card.question}
                        </Text>
                        <View style={styles.cardMeta}>
                            <Text style={styles.cardTopic}>{sub?.name} · {card.topic}</Text>
                            <View style={[styles.statusDot, { backgroundColor: statusBg }]}>
                                <Text style={[styles.statusDotText, { color: statusColor }]}>
                                    {!cs || cs.status === 'new' ? 'Yeni' : cs.status === 'learning' ? 'Öğren' : 'Tekrar'}
                                </Text>
                            </View>
                        </View>
                    </View>
                    {cs?.suspended && <Text style={styles.suspendedIcon}>⏸️</Text>}
                </View>

                {isExpanded && (
                    <View style={styles.expandedContent}>
                        <View style={styles.answerBox}>
                            <Text style={styles.answerLabel}>CEVAP</Text>
                            <Text style={styles.answerContent}>{card.answer}</Text>
                        </View>

                        {cs && (
                            <View style={styles.cardDetails}>
                                <View style={styles.detailRow}>
                                    <Text style={styles.detailLabel}>Aralık</Text>
                                    <Text style={styles.detailValue}>{cs.interval} gün</Text>
                                </View>
                                <View style={styles.detailRow}>
                                    <Text style={styles.detailLabel}>Ease</Text>
                                    <Text style={styles.detailValue}>{cs.easeFactor.toFixed(2)}</Text>
                                </View>
                                <View style={styles.detailRow}>
                                    <Text style={styles.detailLabel}>Tekrar Tarihi</Text>
                                    <Text style={styles.detailValue}>{cs.dueDate}</Text>
                                </View>
                                {cs.stability > 0 && (
                                    <View style={styles.detailRow}>
                                        <Text style={styles.detailLabel}>FSRS Stability</Text>
                                        <Text style={styles.detailValue}>{cs.stability.toFixed(1)}</Text>
                                    </View>
                                )}
                            </View>
                        )}

                        <TouchableOpacity
                            style={[styles.suspendBtn, cs?.suspended ? styles.suspendBtnActive : null]}
                            onPress={() => toggleSuspend(card.id)}
                        >
                            <Text style={styles.suspendBtnText}>
                                {cs?.suspended ? '▶️ Sürdür' : '⏸️ Askıya Al'}
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

            {/* Arama */}
            <View style={styles.searchContainer}>
                <TextInput
                    style={styles.searchInput}
                    placeholder="🔍 Kart ara..."
                    placeholderTextColor={Colors.textMuted}
                    value={rawQuery}
                    onChangeText={handleSearch}
                />
            </View>

            {/* Ders filtresi */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={styles.filterContent}>
                <TouchableOpacity
                    style={[styles.filterChip, !selectedSubject && styles.filterChipActive]}
                    onPress={() => setSelectedSubject(null)}
                >
                    <Text style={[styles.filterChipText, !selectedSubject && styles.filterChipTextActive]}>Tümü</Text>
                </TouchableOpacity>
                {TUS_SUBJECTS.map(s => (
                    <TouchableOpacity
                        key={s.id}
                        style={[styles.filterChip, selectedSubject === s.id && styles.filterChipActive]}
                        onPress={() => setSelectedSubject(selectedSubject === s.id ? null : s.id)}
                    >
                        <Text style={[styles.filterChipText, selectedSubject === s.id && styles.filterChipTextActive]}>
                            {s.icon} {s.name}
                        </Text>
                    </TouchableOpacity>
                ))}
            </ScrollView>

            {/* Kart Listesi */}
            <FlatList
                data={filteredCards}
                renderItem={renderCard}
                keyExtractor={item => String(item.id)}
                contentContainerStyle={styles.listContent}
                showsVerticalScrollIndicator={false}
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
        fontSize: 9, fontWeight: '700', letterSpacing: 1, color: Colors.accent, marginBottom: 4,
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
