import React, { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from './AppText';
import { Spacing, type ColorScheme, useThemeColors } from '../constants/theme';
import { useI18n } from '../hooks/useI18n';
import { buildDeckTree, type DeckTreeNode } from '../lib/deckManager';
import { getDeckDisplayName, type Deck } from '../lib/models';
import { initialExpandedDeckNames, prioritizeDeckTree } from '../lib/deckPickerExpansion';
import DisclosureChevron from './DisclosureChevron';
import { Button, IconButton } from './ui/Button';
import { Card } from './ui/Card';
import { CheckRow } from './ui/Choice';
import { HIT_TARGET, Type } from './ui/tokens';

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

        return (
            <React.Fragment key={node.deck.id}>
                <View style={[styles.row, { paddingLeft: Math.min(node.depth, 8) * 18 }]}>
                    {hasChildren ? (
                        <IconButton
                            onPress={() => toggleExpanded(node.deck.name)}
                            expanded={isExpanded}
                            accessibilityLabel={isExpanded
                                ? l('Alt desteleri gizle', 'Hide subdecks')
                                : l('Alt desteleri göster', 'Show subdecks')}
                        >
                            <DisclosureChevron expanded={isExpanded} color={colors.textSecondary} />
                        </IconButton>
                    ) : (
                        <View style={styles.disclosureSpacer} />
                    )}
                    <CheckRow
                        style={styles.rowMain}
                        label={getDeckDisplayName(node.deck.name)}
                        summary={hasChildren ? l(`${ids.length - 1} alt deste`, `${ids.length - 1} subdecks`) : undefined}
                        checked={checked}
                        mixed={mixed}
                        onChange={() => toggleBranch(node)}
                        accessibilityLabel={l(
                            `${getDeckDisplayName(node.deck.name)} destesini dışa aktar`,
                            `Export ${getDeckDisplayName(node.deck.name)} deck`,
                        )}
                    />
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
        // A deck of the tree: its disclosure button (or its place), then the kit's checkbox row.
        row: {
            flexDirection: 'row',
            alignItems: 'center',
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: colors.borderLight,
        },
        disclosureSpacer: { width: HIT_TARGET },
        // The disclosure column is the row's leading inset.
        rowMain: { flex: 1, paddingLeft: 0 },
        emptyText: { ...Type.caption, padding: Spacing.lg, color: colors.textMuted, textAlign: 'center' },
    });
}
