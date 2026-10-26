import React, { useEffect, useLayoutEffect, useRef } from 'react';
import { Platform, View, type CellRendererProps } from 'react-native';
import type { DeckListRowModel } from '../../lib/deckListRows';

/** Deck-list row geometry in list content space, keyed by deck id so a rename keeps its entry. */
export type DeckRowLayouts = Map<number, { y: number; h: number }>;

/**
 * The deck list's FlatList cell, which records each row's geometry for drag hit-testing.
 *
 * Hit-testing needs list *content* coordinates. A row's own onLayout reports against its immediate
 * parent — inside a FlatList that is the cell, so every row would claim y ≈ 0 and the pointer would
 * resolve against whichever row happened to be checked first. The cell is a direct child of the
 * content container, so measuring it gives the real content-space geometry, and on iPhone it
 * re-reports whenever a reorder or a hover-expand moves it.
 */
export function createDeckDragCell(layouts: DeckRowLayouts) {
    return function DeckDragCell({
        item,
        children,
        onLayout,
        cellKey: _cellKey,
        index: _index,
        ...cellProps
    }: CellRendererProps<DeckListRowModel>) {
        const deckId = item.node.deck.id;
        const cellRef = useRef<View>(null);

        // RN Web reports onLayout from a ResizeObserver, so a cell that only moves is never
        // re-reported there. Whatever moves a cell (a reorder, a branch opening above it) also
        // re-renders it, so read its offset in the content container after each render.
        useLayoutEffect(() => {
            if (Platform.OS !== 'web') return;
            const node = cellRef.current as unknown as HTMLElement | null;
            if (node) layouts.set(deckId, { y: node.offsetTop, h: node.offsetHeight });
        });
        useEffect(() => () => { layouts.delete(deckId); }, [deckId]);

        return (
            <View
                {...cellProps}
                ref={cellRef}
                onLayout={(event) => {
                    onLayout?.(event);
                    const { y, height } = event.nativeEvent.layout;
                    layouts.set(deckId, { y, h: height });
                }}
            >
                {children}
            </View>
        );
    };
}
