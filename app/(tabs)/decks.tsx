// ============================================================
// TUS Flashcard - Deck List Screen (Anki-style)
// Ana sayfa: Tüm desteleri hiyerarşik listele
// Her destede New (mavi), Learning (turuncu), Review (yeşil) sayaçları
// ============================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    View, Text, ScrollView, TouchableOpacity, StyleSheet, SafeAreaView,
    TextInput, Alert, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Colors, Spacing, BorderRadius, FontSize, Shadows } from '../../constants/theme';
import type { Deck, DeckConfig, DeckTreeNode } from '../../lib/models';
import { DEFAULT_DECKS, DEFAULT_DECK_CONFIG, getDeckDisplayName } from '../../lib/models';
import { useApp } from './_layout';

export default function DecksScreen() {
    const router = useRouter();
    const { settings, refreshData } = useApp();
    const [expandedDecks, setExpandedDecks] = useState<Set<string>>(new Set(['TUS']));
    const [showAddDeck, setShowAddDeck] = useState(false);
    const [newDeckName, setNewDeckName] = useState('');

    // Mock deck data (will be replaced with real DB data after full integration)
    const decks = useMemo(() => DEFAULT_DECKS, []);

    // Build tree manually from flat deck list
    const deckTree = useMemo(() => {
        const sorted = [...decks].sort((a, b) => a.name.localeCompare(b.name));
        const nodes: DeckTreeNode[] = sorted.map(d => ({
            deck: d,
            children: [],
            depth: d.name.split('::').length - 1,
            newCount: Math.floor(Math.random() * 10), // placeholder
            learnCount: Math.floor(Math.random() * 5),
            reviewCount: Math.floor(Math.random() * 15),
            totalCards: 10,
        }));

        // Link children
        const nodeMap = new Map<string, DeckTreeNode>();
        nodes.forEach(n => nodeMap.set(n.deck.name, n));

        const roots: DeckTreeNode[] = [];
        for (const node of nodes) {
            const parts = node.deck.name.split('::');
            if (parts.length <= 1) {
                roots.push(node);
            } else {
                const parentName = parts.slice(0, -1).join('::');
                const parent = nodeMap.get(parentName);
                if (parent) {
                    parent.children.push(node);
                } else {
                    roots.push(node);
                }
            }
        }

        // Aggregate counts
        function aggregate(n: DeckTreeNode): void {
            for (const child of n.children) {
                aggregate(child);
                n.newCount += child.newCount;
                n.learnCount += child.learnCount;
                n.reviewCount += child.reviewCount;
                n.totalCards += child.totalCards;
            }
        }
        roots.forEach(aggregate);

        return roots;
    }, [decks]);

    const toggleExpand = (deckName: string) => {
        setExpandedDecks(prev => {
            const next = new Set(prev);
            if (next.has(deckName)) next.delete(deckName);
            else next.add(deckName);
            return next;
        });
    };

    const handleStudy = (deckName: string) => {
        // Navigate to study with selected deck
        router.push({ pathname: '/', params: { deck: deckName } } as any);
    };

    const handleAddDeck = () => {
        if (!newDeckName.trim()) return;
        Alert.alert('✅', `Deste "${newDeckName}" oluşturuldu.`);
        setNewDeckName('');
        setShowAddDeck(false);
    };

    const renderDeckNode = (node: DeckTreeNode): React.ReactNode => {
        const isExpanded = expandedDecks.has(node.deck.name);
        const hasChildren = node.children.length > 0;
        const displayName = getDeckDisplayName(node.deck.name);
        const totalDue = node.newCount + node.learnCount + node.reviewCount;

        return (
            <View key={node.deck.id}>
                <TouchableOpacity
                    style={[styles.deckRow, { paddingLeft: 16 + node.depth * 24 }]}
                    onPress={() => hasChildren ? toggleExpand(node.deck.name) : handleStudy(node.deck.name)}
                    onLongPress={() => handleStudy(node.deck.name)}
                >
                    {/* Expand/collapse arrow */}
                    {hasChildren ? (
                        <TouchableOpacity
                            style={styles.expandBtn}
                            onPress={() => toggleExpand(node.deck.name)}
                        >
                            <Text style={styles.expandArrow}>{isExpanded ? '▾' : '▸'}</Text>
                        </TouchableOpacity>
                    ) : (
                        <View style={styles.expandBtn}>
                            <Text style={styles.expandDot}>•</Text>
                        </View>
                    )}

                    {/* Deck name */}
                    <Text style={styles.deckName} numberOfLines={1}>{displayName}</Text>

                    {/* Card counts */}
                    <View style={styles.countsRow}>
                        <Text style={[styles.countBadge, styles.countNew]}>{node.newCount}</Text>
                        <Text style={[styles.countBadge, styles.countLearn]}>{node.learnCount}</Text>
                        <Text style={[styles.countBadge, styles.countReview]}>{node.reviewCount}</Text>
                    </View>

                    {/* Gear icon */}
                    <TouchableOpacity style={styles.gearBtn}>
                        <Text style={styles.gearText}>⚙️</Text>
                    </TouchableOpacity>
                </TouchableOpacity>

                {/* Children */}
                {isExpanded && node.children.map(child => renderDeckNode(child))}
            </View>
        );
    };

    return (
        <SafeAreaView style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <Text style={styles.title}>Desteler</Text>
                <View style={styles.headerActions}>
                    <TouchableOpacity style={styles.headerBtn} onPress={() => setShowAddDeck(!showAddDeck)}>
                        <Text style={styles.headerBtnText}>+ Deste</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.headerBtn} onPress={() => router.push('/browser' as any)}>
                        <Text style={styles.headerBtnText}>🗂️</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.headerBtn} onPress={() => router.push('/stats' as any)}>
                        <Text style={styles.headerBtnText}>📊</Text>
                    </TouchableOpacity>
                </View>
            </View>

            {/* Add Deck Input */}
            {showAddDeck && (
                <View style={styles.addDeckRow}>
                    <TextInput
                        style={styles.addDeckInput}
                        placeholder="Deste adı (ör: TUS::Anatomi::Nöroanatomi)"
                        placeholderTextColor={Colors.textMuted}
                        value={newDeckName}
                        onChangeText={setNewDeckName}
                        onSubmitEditing={handleAddDeck}
                        autoFocus
                    />
                    <TouchableOpacity style={styles.addDeckBtn} onPress={handleAddDeck}>
                        <Text style={styles.addDeckBtnText}>Ekle</Text>
                    </TouchableOpacity>
                </View>
            )}

            {/* Column Headers */}
            <View style={styles.columnHeaders}>
                <Text style={styles.columnLabel}>Deste</Text>
                <View style={styles.countsRow}>
                    <Text style={[styles.columnCount, { color: Colors.badgeNew }]}>Yeni</Text>
                    <Text style={[styles.columnCount, { color: Colors.badgeLearn }]}>Öğren</Text>
                    <Text style={[styles.columnCount, { color: Colors.badgeReview }]}>Tekrar</Text>
                </View>
                <View style={{ width: 36 }} />
            </View>

            {/* Deck List */}
            <ScrollView style={styles.deckList} showsVerticalScrollIndicator={false}>
                {deckTree.map(node => renderDeckNode(node))}

                {/* Bottom spacing */}
                <View style={{ height: 80 }} />
            </ScrollView>

            {/* Bottom Bar */}
            <View style={styles.bottomBar}>
                <TouchableOpacity style={styles.bottomBtn} onPress={() => router.push('/editor' as any)}>
                    <Text style={styles.bottomBtnIcon}>+</Text>
                    <Text style={styles.bottomBtnText}>Ekle</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.bottomBtn} onPress={() => router.push('/browser' as any)}>
                    <Text style={styles.bottomBtnIcon}>🗂️</Text>
                    <Text style={styles.bottomBtnText}>Tarayıcı</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.bottomBtn} onPress={() => router.push('/stats' as any)}>
                    <Text style={styles.bottomBtnIcon}>📊</Text>
                    <Text style={styles.bottomBtnText}>İstatistik</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.bottomBtn}>
                    <Text style={styles.bottomBtnIcon}>🔄</Text>
                    <Text style={styles.bottomBtnText}>Sync</Text>
                </TouchableOpacity>
            </View>
        </SafeAreaView>
    );
}

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
    title: { fontSize: FontSize.xxl, fontWeight: '700', color: Colors.textPrimary },
    headerActions: { flexDirection: 'row', gap: 8 },
    headerBtn: {
        paddingHorizontal: Spacing.md,
        paddingVertical: 6,
        backgroundColor: Colors.bgCard,
        borderRadius: BorderRadius.sm,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    headerBtnText: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.accent },

    addDeckRow: {
        flexDirection: 'row',
        paddingHorizontal: Spacing.lg,
        paddingVertical: Spacing.sm,
        gap: 8,
        backgroundColor: Colors.bgSecondary,
        borderBottomWidth: 1,
        borderBottomColor: Colors.borderLight,
    },
    addDeckInput: {
        flex: 1,
        backgroundColor: Colors.bgCard,
        borderWidth: 1,
        borderColor: Colors.border,
        borderRadius: BorderRadius.sm,
        paddingHorizontal: Spacing.md,
        paddingVertical: 6,
        fontSize: FontSize.md,
        color: Colors.textPrimary,
    },
    addDeckBtn: {
        paddingHorizontal: Spacing.lg,
        paddingVertical: 6,
        backgroundColor: Colors.accent,
        borderRadius: BorderRadius.sm,
        justifyContent: 'center',
    },
    addDeckBtnText: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.white },

    columnHeaders: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: Spacing.lg,
        paddingVertical: 6,
        backgroundColor: Colors.bgSecondary,
        borderBottomWidth: 1,
        borderBottomColor: Colors.border,
    },
    columnLabel: { flex: 1, fontSize: FontSize.xs, fontWeight: '600', color: Colors.textMuted, letterSpacing: 0.5, textTransform: 'uppercase' },
    columnCount: { fontSize: FontSize.xs, fontWeight: '700', width: 48, textAlign: 'center' },

    deckList: { flex: 1 },

    deckRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingRight: Spacing.sm,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: Colors.borderLight,
    },
    expandBtn: { width: 24, alignItems: 'center', justifyContent: 'center' },
    expandArrow: { fontSize: 14, color: Colors.textMuted },
    expandDot: { fontSize: 10, color: Colors.border },
    deckName: { flex: 1, fontSize: FontSize.md, fontWeight: '500', color: Colors.textPrimary, marginLeft: 4 },

    countsRow: { flexDirection: 'row', gap: 0 },
    countBadge: { fontSize: FontSize.md, fontWeight: '700', width: 48, textAlign: 'center' },
    countNew: { color: Colors.badgeNew },
    countLearn: { color: Colors.badgeLearn },
    countReview: { color: Colors.badgeReview },

    gearBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    gearText: { fontSize: 16 },

    bottomBar: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        paddingVertical: 8,
        backgroundColor: Colors.bgCard,
        borderTopWidth: 1,
        borderTopColor: Colors.border,
        ...Shadows.md,
    },
    bottomBtn: { alignItems: 'center', paddingHorizontal: 12, paddingVertical: 4 },
    bottomBtnIcon: { fontSize: 20 },
    bottomBtnText: { fontSize: 10, fontWeight: '600', color: Colors.textSecondary, marginTop: 2 },
});
