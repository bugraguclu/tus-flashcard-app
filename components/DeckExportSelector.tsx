import React, { useMemo, useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from './AppText';
import { FontSize, Spacing, type ColorScheme, useThemeColors } from '../constants/theme';
import { useI18n } from '../hooks/useI18n';
import { buildDeckTree, type DeckTreeNode } from '../lib/deckManager';
import { getDeckDisplayName, type Deck } from '../lib/models';
import { initialExpandedDeckNames, prioritizeDeckTree } from '../lib/deckPickerExpansion';
import DisclosureChevron from './DisclosureChevron';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { Checkbox } from './ui/Choice';
import { MinusIcon } from './ui/icons';
import { Type } from './ui/tokens';

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
    const rawTree = useMemo(() => buildDeckTree(decks), [decks]);
    const tree = useMemo(
        () => prioritizeDeckTree(rawTree, initiallyExpandedDeck),
        [rawTree, initiallyExpandedDeck],
    );
    const [expanded, setExpanded] = useState<Set<string>>(() =>
        initialExpandedDeckNames(tree, initiallyExpandedDeck),
    );
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
                            // Drawn 34 points wide beside the checkbox; the slop on its free side
                            // makes a full target.
                            hitSlop={{ left: 10 }}
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
                        aria-checked={accessibilityChecked}
                        accessibilityLabel={l(
                            `${getDeckDisplayName(node.deck.name)} destesini dışa aktar`,
                            `Export ${getDeckDisplayName(node.deck.name)} deck`,
                        )}
                    >
                        {mixed ? (
                            // The kit's checkbox has no mixed state: a branch partly chosen shows a dash.
                            <View style={styles.mixedBox}>
                                <MinusIcon color={colors.onAccent} size={16} />
                            </View>
                        ) : <Checkbox checked={checked} />}
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
        <Card
            divided
            title={l('Dışa aktarılacak desteler', 'Decks to export')}
            description={l(`${selectedIds.size} / ${decks.length} deste seçili`, `${selectedIds.size} of ${decks.length} decks selected`)}
            accessory={(
                <Button
                    variant="plain"
                    size="compact"
                    label={allSelected ? l('Temizle', 'Clear') : l('Tümünü seç', 'Select all')}
                    onPress={toggleAll}
                    accessibilityLabel={allSelected ? l('Deste seçimini temizle', 'Clear deck selection') : l('Tüm desteleri seç', 'Select all decks')}
                    style={styles.selectAll}
                />
            )}
        >
            <View>
                {tree.length > 0 ? tree.map(renderNode) : (
                    <Text style={styles.emptyText}>{l('Dışa aktarılabilecek deste yok.', 'There are no decks available to export.')}</Text>
                )}
            </View>
        </Card>
    );
}

function createStyles(colors: ColorScheme) {
    return StyleSheet.create({
        selectAll: { marginVertical: -Spacing.sm, marginRight: -Spacing.sm },
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
        // Drawn as the kit's checked box (22 points, 2-point edge), with a dash for a partial branch.
        mixedBox: {
            width: 22,
            height: 22,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 2,
            borderRadius: 4,
            borderColor: colors.accent,
            backgroundColor: colors.accent,
        },
        rowCopy: { flex: 1, minWidth: 0, paddingVertical: 7 },
        deckName: { color: colors.textPrimary, fontSize: FontSize.sm, fontWeight: '500' },
        deckNameActive: { color: colors.accent },
        subdeckCount: { marginTop: 2, color: colors.textMuted, fontSize: FontSize.xs },
        emptyText: { ...Type.caption, padding: Spacing.lg, color: colors.textMuted, textAlign: 'center' },
    });
}
