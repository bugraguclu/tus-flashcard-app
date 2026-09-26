import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BorderRadius, FontSize, Spacing, useThemeColors, type ColorScheme } from '../../constants/theme';

export interface StatTile {
    key: string;
    label: string;
    value: string;
    /** A short qualifier under the value, e.g. "43 / 46". */
    detail?: string;
    /** Spoken in place of the visible text when the figures need words around them. */
    accessibilityLabel?: string;
}

interface StatsTilesProps {
    tiles: readonly StatTile[];
    /** Tiles per row; rows are filled evenly so no tile is left stretched across a row alone. */
    columns?: 2 | 3;
}

/** A row of headline figures under a chart. */
export default function StatsTiles({ tiles, columns = 3 }: StatsTilesProps) {
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    // Four tiles in rows of three would strand the fourth; two rows of two read as one block.
    const perRow = tiles.length === 4 ? 2 : columns;
    const rows: StatTile[][] = [];
    for (let index = 0; index < tiles.length; index += perRow) rows.push(tiles.slice(index, index + perRow));
    return (
        <View style={styles.grid}>
            {rows.map((row, rowIndex) => (
                <View key={rowIndex} style={styles.row}>
                    {row.map((tile) => (
                        <View
                            key={tile.key}
                            style={styles.tile}
                            accessible
                            accessibilityLabel={tile.accessibilityLabel
                                ?? `${tile.label}: ${tile.value}${tile.detail ? `, ${tile.detail}` : ''}`}
                        >
                            <Text style={styles.value} numberOfLines={1} adjustsFontSizeToFit maxFontSizeMultiplier={1.4}>
                                {tile.value}
                            </Text>
                            <Text style={styles.label} numberOfLines={2} maxFontSizeMultiplier={1.3}>{tile.label}</Text>
                            {tile.detail ? (
                                <Text style={styles.detail} numberOfLines={1} maxFontSizeMultiplier={1.3}>{tile.detail}</Text>
                            ) : null}
                        </View>
                    ))}
                </View>
            ))}
        </View>
    );
}

function createStyles(colors: ColorScheme) {
    return StyleSheet.create({
        grid: { gap: Spacing.sm },
        row: { flexDirection: 'row', gap: Spacing.sm },
        tile: {
            flex: 1,
            minWidth: 0,
            minHeight: 64,
            justifyContent: 'flex-start',
            paddingVertical: Spacing.sm,
            paddingHorizontal: Spacing.md,
            borderRadius: BorderRadius.md,
            backgroundColor: colors.bgSecondary,
        },
        value: { color: colors.textPrimary, fontSize: FontSize.lg, fontWeight: '800' },
        label: { color: colors.textMuted, fontSize: FontSize.xs, lineHeight: 14, marginTop: 2 },
        detail: { color: colors.textSecondary, fontSize: FontSize.xs, fontWeight: '600', marginTop: 3 },
    });
}
