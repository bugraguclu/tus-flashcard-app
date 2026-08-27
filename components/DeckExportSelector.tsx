import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { BorderRadius, FontSize, Spacing, type ColorScheme, useThemeColors } from '../constants/theme';
import { useI18n } from '../hooks/useI18n';
import { buildDeckTree, type DeckTreeNode } from '../lib/deckManager';
import { getDeckDisplayName, type Deck } from '../lib/models';
import DisclosureChevron from './DisclosureChevron';

interface DeckExportSelectorProps {
    decks: Deck[];
    selectedIds: ReadonlySet<number>;
    onChange: (selected: Set<number>) => void;
    initiallyExpandedDeck?: string;
}

function subtreeIds(node: DeckTreeNode): number[] {
    return [node.deck.id, ...node.children.flatMap(subtreeIds)];
}

export default function DeckExportSelector({
    decks,
    selectedIds,
    onChange,
    initiallyExpandedDeck,
}: DeckExportSelectorProps) {
    const { l } = useI18n();
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const tree = useMemo(() => buildDeckTree(decks), [decks]);
    const [expanded, setExpanded] = useState<Set<string>>(() => {
        if (!initiallyExpandedDeck) return new Set();
        const parts = initiallyExpandedDeck.split('::');
        return new Set(parts.map((_, index) => parts.slice(0, index + 1).join('::')));
    });
    const allSelected = decks.length > 0 && decks.every((deck) => selectedIds.has(deck.id));

    const toggleAll = () => {
        onChange(allSelected ? new Set() : new Set(decks.map((deck) => deck.id)));
    };

    const toggleExpanded = (name: string) => {
        setExpanded((current) => {
            const next = new Set(current);
            if (next.has(name)) next.delete(name);
            else next.add(name);
            return next;
        });
    };

    const toggleBranch = (node: DeckTreeNode) => {
        const ids = subtreeIds(node);
        const branchSelected = ids.every((id) => selectedIds.has(id));
        const next = new Set(selectedIds);
        ids.forEach((id) => {
            if (branchSelected) next.delete(id);
            else next.add(id);
        });
        onChange(next);
    };

    const renderNode = (node: DeckTreeNode): React.ReactNode => {
        const ids = subtreeIds(node);
        const selectedCount = ids.filter((id) => selectedIds.has(id)).length;
        const checked = selectedCount === ids.length;
        const mixed = selectedCount > 0 && !checked;
        const hasChildren = node.children.length > 0;
        const isExpanded = expanded.has(node.deck.name);
        const accessibilityChecked: boolean | 'mixed' = mixed ? 'mixed' : checked;

        return (
            <React.Fragment key={node.deck.id}>
                <View style={[styles.row, { paddingLeft: Spacing.sm + Math.min(node.depth, 8) * 18 }]}>
                    {hasChildren ? (
                        <TouchableOpacity
                            style={styles.disclosureButton}
                            onPress={() => toggleExpanded(node.deck.name)}
                            accessibilityRole="button"
                            accessibilityState={{ expanded: isExpanded }}
                            accessibilityLabel={isExpanded
                                ? l('Alt desteleri gizle', 'Hide subdecks')
                                : l('Alt desteleri göster', 'Show subdecks')}
                        >
                            <DisclosureChevron expanded={isExpanded} color={colors.textSecondary} />
                        </TouchableOpacity>
                    ) : (
                        <View style={styles.disclosureSpacer} />
                    )}
                    <TouchableOpacity
                        style={styles.rowMain}
                        onPress={() => toggleBranch(node)}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: accessibilityChecked }}
                        accessibilityLabel={l(
                            `${getDeckDisplayName(node.deck.name)} destesini dışa aktar`,
                            `Export ${getDeckDisplayName(node.deck.name)} deck`,
                        )}
                    >
                        <View style={[styles.checkbox, (checked || mixed) && styles.checkboxActive]}>
                            <Text style={styles.checkboxMark}>{checked ? '✓' : mixed ? '—' : ''}</Text>
                        </View>
                        <View style={styles.rowCopy}>
                            <Text style={[styles.deckName, (checked || mixed) && styles.deckNameActive]} numberOfLines={1}>
                                {getDeckDisplayName(node.deck.name)}
                            </Text>
                            {hasChildren && (
                                <Text style={styles.subdeckCount}>
                                    {l(`${ids.length - 1} alt deste`, `${ids.length - 1} subdecks`)}
                                </Text>
                            )}
                        </View>
                    </TouchableOpacity>
                </View>
                {hasChildren && isExpanded ? node.children.map(renderNode) : null}
            </React.Fragment>
        );
    };

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <View style={styles.headerCopy}>
                    <Text style={styles.title}>{l('Dışa aktarılacak desteler', 'Decks to export')}</Text>
                    <Text style={styles.selectionCount}>
                        {l(`${selectedIds.size} / ${decks.length} deste seçili`, `${selectedIds.size} of ${decks.length} decks selected`)}
                    </Text>
                </View>
                <TouchableOpacity
                    style={styles.selectAllButton}
                    onPress={toggleAll}
                    accessibilityRole="button"
                    accessibilityLabel={allSelected ? l('Deste seçimini temizle', 'Clear deck selection') : l('Tüm desteleri seç', 'Select all decks')}
                >
                    <Text style={styles.selectAllText}>{allSelected ? l('Temizle', 'Clear') : l('Tümünü seç', 'Select all')}</Text>
                </TouchableOpacity>
            </View>
            <View style={styles.tree}>
                {tree.length > 0 ? tree.map(renderNode) : (
                    <Text style={styles.emptyText}>{l('Dışa aktarılabilecek deste yok.', 'There are no decks available to export.')}</Text>
                )}
            </View>
        </View>
    );
}

function createStyles(colors: ColorScheme) {
    return StyleSheet.create({
        container: {
            overflow: 'hidden',
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: BorderRadius.md,
            backgroundColor: colors.bgSecondary,
        },
        header: {
            minHeight: 62,
            flexDirection: 'row',
            alignItems: 'center',
            gap: Spacing.sm,
            paddingLeft: Spacing.md,
            paddingRight: Spacing.xs,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: colors.border,
            backgroundColor: colors.bgCard,
        },
        headerCopy: { flex: 1, minWidth: 0 },
        title: { color: colors.textPrimary, fontSize: FontSize.md, fontWeight: '700' },
        selectionCount: { marginTop: 2, color: colors.textMuted, fontSize: FontSize.xs },
        selectAllButton: {
            minHeight: 44,
            justifyContent: 'center',
            paddingHorizontal: Spacing.sm,
            borderRadius: BorderRadius.sm,
        },
        selectAllText: { color: colors.accent, fontSize: FontSize.sm, fontWeight: '700' },
        tree: { backgroundColor: colors.bgCard },
        row: {
            minHeight: 54,
            flexDirection: 'row',
            alignItems: 'center',
            paddingRight: Spacing.sm,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: colors.borderLight,
        },
        disclosureButton: { width: 34, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
        disclosureSpacer: { width: 34 },
        rowMain: { flex: 1, minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
        checkbox: {
            width: 22,
            height: 22,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 2,
            borderColor: colors.textMuted,
            borderRadius: 4,
            backgroundColor: colors.bgCard,
        },
        checkboxActive: { borderColor: colors.accent, backgroundColor: colors.accent },
        checkboxMark: { color: colors.white, fontSize: 15, lineHeight: 17, fontWeight: '900' },
        rowCopy: { flex: 1, minWidth: 0, paddingVertical: 7 },
        deckName: { color: colors.textPrimary, fontSize: FontSize.sm, fontWeight: '600' },
        deckNameActive: { color: colors.accent },
        subdeckCount: { marginTop: 2, color: colors.textMuted, fontSize: FontSize.xs },
        emptyText: { padding: Spacing.lg, color: colors.textMuted, fontSize: FontSize.sm, textAlign: 'center' },
    });
}
