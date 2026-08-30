import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    Keyboard,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    View,
} from 'react-native';
import { Text, TextInput } from './Typography';
import { TouchableOpacity } from './Touchable';
import { BorderRadius, FontSize, Shadows, Spacing, type ColorScheme } from '../constants/theme';
import { buildDeckTree, type DeckTreeNode } from '../lib/deckManager';
import { getDeckDisplayName, type Deck } from '../lib/models';
import { matchesSearch } from '../lib/searchText';
import DisclosureChevron from './DisclosureChevron';

type Props = {
    visible: boolean;
    colors: ColorScheme;
    decks: Deck[];
    selectedDeckName: string | null;
    title: string;
    allDecksLabel: string | null;
    searchPlaceholder: string;
    emptySearchLabel: string;
    cancelLabel: string;
    closeAccessibilityLabel: string;
    searchAccessibilityLabel: string;
    createAccessibilityLabel: string;
    onClose: () => void;
    onSelect: (name: string | null) => void;
    onCreateDeck: () => void;
};

type VisibleDeck = { node: DeckTreeNode; depth: number };

function filterTree(nodes: DeckTreeNode[], query: string): DeckTreeNode[] {
    if (!query) return nodes;
    const filtered: DeckTreeNode[] = [];
    for (const node of nodes) {
        const children = filterTree(node.children, query);
        if (matchesSearch(node.deck.name.replaceAll('::', ' '), query) || children.length > 0) {
            filtered.push({ ...node, children });
        }
    }
    return filtered;
}

function flattenVisible(nodes: DeckTreeNode[], expanded: Set<string>, searching: boolean): VisibleDeck[] {
    const rows: VisibleDeck[] = [];
    const walk = (items: DeckTreeNode[], depth: number) => {
        for (const node of items) {
            rows.push({ node, depth });
            if (searching || expanded.has(node.deck.name)) walk(node.children, depth + 1);
        }
    };
    walk(nodes, 0);
    return rows;
}

function expandableDeckNames(nodes: DeckTreeNode[]): Set<string> {
    const names = new Set<string>();
    const walk = (items: DeckTreeNode[]) => {
        for (const node of items) {
            if (node.children.length > 0) names.add(node.deck.name);
            walk(node.children);
        }
    };
    walk(nodes);
    return names;
}

export default function DeckPickerModal({
    visible,
    colors,
    decks,
    selectedDeckName,
    title,
    allDecksLabel,
    searchPlaceholder,
    emptySearchLabel,
    cancelLabel,
    closeAccessibilityLabel,
    searchAccessibilityLabel,
    createAccessibilityLabel,
    onClose,
    onSelect,
    onCreateDeck,
}: Props) {
    const styles = useMemo(() => createStyles(colors), [colors]);
    const [searching, setSearching] = useState(false);
    const [query, setQuery] = useState('');
    const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
    const createAfterDismissRef = useRef(false);
    const tree = useMemo(() => buildDeckTree(decks), [decks]);

    useEffect(() => {
        if (!visible) return;
        // A deck picker can be launched while an editor/search field still owns the keyboard.
        // Start the picker from the full window, then let its own search field opt back in.
        Keyboard.dismiss();
        setSearching(false);
        setQuery('');
        setExpanded(expandableDeckNames(tree));
    }, [visible, tree]);

    const filteredTree = useMemo(() => filterTree(tree, query.trim()), [tree, query]);
    const rows = useMemo(
        () => flattenVisible(filteredTree, expanded, searching && query.trim().length > 0),
        [filteredTree, expanded, searching, query],
    );

    const toggleExpanded = (name: string) => {
        setExpanded((current) => {
            const next = new Set(current);
            if (next.has(name)) next.delete(name);
            else next.add(name);
            return next;
        });
    };

    const handleBack = () => {
        if (searching) {
            Keyboard.dismiss();
            setSearching(false);
            setQuery('');
            return;
        }
        onClose();
    };

    const handleCreate = () => {
        createAfterDismissRef.current = true;
        onClose();
    };

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            presentationStyle="overFullScreen"
            onRequestClose={handleBack}
            onDismiss={() => {
                if (!createAfterDismissRef.current) return;
                createAfterDismissRef.current = false;
                onCreateDeck();
            }}
        >
            <KeyboardAvoidingView
                style={styles.keyboardLayer}
                behavior={Platform.OS === 'ios' && searching ? 'padding' : undefined}
            >
                <Pressable style={styles.overlay} onPress={onClose}>
                    <Pressable style={styles.card} onPress={() => {}} accessibilityViewIsModal>
                    <View style={styles.toolbar}>
                        <TouchableOpacity
                            style={styles.toolbarButton}
                            onPress={handleBack}
                            accessibilityRole="button"
                            accessibilityLabel={closeAccessibilityLabel}
                        >
                            <Text style={styles.backIcon}>←</Text>
                        </TouchableOpacity>

                        {searching ? (
                            <TextInput
                                style={styles.searchInput}
                                value={query}
                                onChangeText={setQuery}
                                placeholder={searchPlaceholder}
                                placeholderTextColor="rgba(255,255,255,0.72)"
                                autoFocus
                                autoCorrect={false}
                                returnKeyType="search"
                                accessibilityLabel={searchPlaceholder}
                            />
                        ) : (
                            <Text style={styles.title} numberOfLines={1}>{title}</Text>
                        )}

                        {!searching && (
                            <TouchableOpacity
                                style={styles.toolbarButton}
                                onPress={() => setSearching(true)}
                                accessibilityRole="button"
                                accessibilityLabel={searchAccessibilityLabel}
                            >
                                <View style={styles.searchGlyph}>
                                    <View style={styles.searchGlyphCircle} />
                                    <View style={styles.searchGlyphHandle} />
                                </View>
                            </TouchableOpacity>
                        )}
                        <TouchableOpacity
                            style={styles.toolbarButton}
                            onPress={handleCreate}
                            accessibilityRole="button"
                            accessibilityLabel={createAccessibilityLabel}
                        >
                            <Text style={styles.plusIcon}>＋</Text>
                        </TouchableOpacity>
                    </View>

                    <ScrollView style={styles.scroll} showsVerticalScrollIndicator keyboardShouldPersistTaps="handled">
                        {!query.trim() && allDecksLabel !== null && (
                            <TouchableOpacity
                                style={[styles.row, selectedDeckName === null && styles.rowActive]}
                                onPress={() => onSelect(null)}
                                accessibilityRole="button"
                                accessibilityState={{ selected: selectedDeckName === null }}
                            >
                                <Text style={styles.allIcon}>▦</Text>
                                <Text style={[styles.rowText, selectedDeckName === null && styles.rowTextActive]}>{allDecksLabel}</Text>
                                {selectedDeckName === null && <Text style={styles.check}>✓</Text>}
                            </TouchableOpacity>
                        )}

                        {rows.map(({ node, depth }) => {
                            const hasChildren = node.children.length > 0;
                            const isExpanded = searching || expanded.has(node.deck.name);
                            const active = selectedDeckName === node.deck.name;
                            return (
                                <View key={node.deck.id} style={[styles.row, active && styles.rowActive, { paddingLeft: Spacing.md + Math.min(depth, 8) * 20 }]}>
                                    {hasChildren ? (
                                        <TouchableOpacity
                                            style={styles.disclosureButton}
                                            onPress={() => toggleExpanded(node.deck.name)}
                                            accessibilityRole="button"
                                            accessibilityState={{ expanded: isExpanded }}
                                        >
                                            <DisclosureChevron expanded={isExpanded} color={colors.textPrimary} />
                                        </TouchableOpacity>
                                    ) : (
                                        <View style={styles.disclosureSpacer} />
                                    )}
                                    <TouchableOpacity
                                        style={styles.rowMain}
                                        onPress={() => onSelect(node.deck.name)}
                                        accessibilityRole="button"
                                        accessibilityState={{ selected: active }}
                                        accessibilityLabel={node.deck.name.replaceAll('::', ' › ')}
                                    >
                                        <Text style={[styles.rowText, active && styles.rowTextActive]} numberOfLines={1}>
                                            {getDeckDisplayName(node.deck.name)}
                                        </Text>
                                        {active && <Text style={styles.check}>✓</Text>}
                                    </TouchableOpacity>
                                </View>
                            );
                        })}

                        {query.trim() && rows.length === 0 && (
                            <View style={styles.emptyWrap}>
                                <Text style={styles.emptyText}>{emptySearchLabel}</Text>
                            </View>
                        )}
                    </ScrollView>

                    <TouchableOpacity style={styles.cancelButton} onPress={onClose} accessibilityRole="button">
                        <Text style={styles.cancelText}>{cancelLabel}</Text>
                    </TouchableOpacity>
                    </Pressable>
                </Pressable>
            </KeyboardAvoidingView>
        </Modal>
    );
}

function createStyles(colors: ColorScheme) {
    return StyleSheet.create({
        keyboardLayer: { flex: 1 },
        overlay: {
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            padding: Spacing.xl,
            backgroundColor: 'rgba(0,0,0,0.42)',
        },
        card: {
            width: '100%',
            maxWidth: 420,
            height: '78%',
            maxHeight: 680,
            overflow: 'hidden',
            backgroundColor: colors.bgCard,
            borderRadius: BorderRadius.lg,
            ...Shadows.lg,
        },
        toolbar: {
            minHeight: 58,
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: Spacing.xs,
            backgroundColor: colors.accent,
        },
        toolbarButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
        backIcon: { color: colors.white, fontSize: 27, lineHeight: 29, fontWeight: '400' },
        searchGlyph: { width: 24, height: 24, position: 'relative' },
        searchGlyphCircle: { position: 'absolute', left: 2, top: 2, width: 15, height: 15, borderWidth: 2.2, borderColor: colors.white, borderRadius: 9 },
        searchGlyphHandle: { position: 'absolute', left: 16, top: 16, width: 9, height: 2.2, borderRadius: 2, backgroundColor: colors.white, transform: [{ rotate: '45deg' }] },
        plusIcon: { color: colors.white, fontSize: 28, lineHeight: 30, fontWeight: '300' },
        title: { flex: 1, color: colors.white, fontSize: FontSize.xl, fontWeight: '800' },
        searchInput: {
            flex: 1,
            minWidth: 0,
            height: 44,
            paddingHorizontal: Spacing.sm,
            color: colors.white,
            fontSize: FontSize.lg,
        },
        scroll: { flex: 1, backgroundColor: colors.bgCard },
        row: {
            minHeight: 54,
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: Spacing.md,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: colors.borderLight,
        },
        rowActive: { backgroundColor: colors.accentLight },
        allIcon: { width: 38, color: colors.textMuted, fontSize: 19, textAlign: 'center' },
        disclosureButton: { width: 38, height: 54, flexShrink: 0, alignItems: 'center', justifyContent: 'center' },
        disclosureSpacer: { width: 38 },
        rowMain: { flex: 1, minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
        rowText: { flex: 1, color: colors.textPrimary, fontSize: FontSize.lg, fontWeight: '600' },
        rowTextActive: { color: colors.accent, fontWeight: '800' },
        check: { color: colors.accent, fontSize: 20, fontWeight: '900' },
        emptyWrap: { minHeight: 180, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
        emptyText: { color: colors.textMuted, fontSize: FontSize.md, fontWeight: '600', textAlign: 'center' },
        cancelButton: {
            minHeight: 54,
            alignItems: 'flex-end',
            justifyContent: 'center',
            paddingHorizontal: Spacing.xl,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: colors.border,
            backgroundColor: colors.bgCard,
        },
        cancelText: { color: colors.accent, fontSize: FontSize.md, fontWeight: '800' },
    });
}
