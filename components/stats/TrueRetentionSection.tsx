import React, { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '../AppText';
import { FontSize, Spacing, useThemeColors, type ColorScheme } from '../../constants/theme';
import type { RetentionCounts, TrueRetentionPeriod, TrueRetentionTable } from '../../lib/trueRetention';
import StatsCard from './StatsCard';
import StatsSegmented from './StatsSegmented';
import { useStatsFormat } from './useStatsFormat';

type Display = 'simple' | 'detailed';
type Column = 'young' | 'mature' | 'total';
const COLUMNS: readonly Column[] = ['young', 'mature', 'total'];

/**
 * Anki's True Retention table: how many answers passed (anything but Again) on cards that were
 * young (interval under 21 days) or mature when answered, for today, yesterday and longer windows.
 * Simple shows percentages; Detailed adds the passed and failed counts. Empty cells read "—".
 */
export default function TrueRetentionSection({ table }: { table: TrueRetentionTable | undefined }) {
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const f = useStatsFormat();
    const { l } = f;
    const [display, setDisplay] = useState<Display>('simple');

    const periodLabel: Record<TrueRetentionPeriod, string> = {
        today: l('Bugün', 'Today'),
        yesterday: l('Dün', 'Yesterday'),
        week: l('Geçen hafta', 'Last week'),
        month: l('Geçen ay', 'Last month'),
        year: l('Geçen yıl', 'Last year'),
        all: l('Tümü', 'All time'),
    };
    const columnLabel: Record<Column, string> = {
        young: l('Genç', 'Young'),
        mature: l('Olgun', 'Mature'),
        total: l('Toplam', 'Total'),
    };
    const detailed = display === 'detailed';

    return (
        <StatsCard
            title={l('Gerçek Hatırlama', 'True Retention')}
            controls={(
                <StatsSegmented
                    options={[
                        { value: 'simple' as const, label: l('Basit', 'Simple') },
                        { value: 'detailed' as const, label: l('Ayrıntılı', 'Detailed') },
                    ]}
                    value={display}
                    onChange={setDisplay}
                    accessibilityLabel={l('Gerçek Hatırlama görünümü', 'True Retention display')}
                />
            )}
        >
            <View style={styles.table}>
                <View style={styles.row} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                    <View style={styles.rowLabel} />
                    {COLUMNS.map((column) => (
                        <Text key={column} style={styles.headCell} numberOfLines={1} maxFontSizeMultiplier={1.3}>
                            {columnLabel[column]}
                        </Text>
                    ))}
                </View>
                {(table?.rows ?? []).map((row) => (
                    <View key={row.period} style={[styles.row, styles.bodyRow]}>
                        <Text
                            style={styles.rowLabel}
                            numberOfLines={2}
                            maxFontSizeMultiplier={1.3}
                            accessibilityElementsHidden
                            importantForAccessibility="no"
                        >
                            {periodLabel[row.period]}
                        </Text>
                        {COLUMNS.map((column) => {
                            const counts: RetentionCounts = column === 'total'
                                ? { passed: row.young.passed + row.mature.passed, failed: row.young.failed + row.mature.failed }
                                : row[column];
                            const answered = counts.passed + counts.failed;
                            const value = f.ratio(counts.passed, answered);
                            const spoken = answered === 0
                                ? l('veri yok', 'no data')
                                : l(
                                    `${value}, ${f.count(counts.passed)} geçti, ${f.count(counts.failed)} kaldı`,
                                    `${value}, ${f.count(counts.passed)} passed, ${f.count(counts.failed)} failed`,
                                );
                            return (
                                <View
                                    key={column}
                                    style={styles.cell}
                                    accessible
                                    accessibilityLabel={`${periodLabel[row.period]}, ${columnLabel[column]}: ${spoken}`}
                                >
                                    <Text style={styles.value} numberOfLines={1} adjustsFontSizeToFit maxFontSizeMultiplier={1.3}>
                                        {value}
                                    </Text>
                                    {detailed && answered > 0 ? (
                                        <Text style={styles.detail} numberOfLines={2} maxFontSizeMultiplier={1.2}>
                                            {l(
                                                `${f.count(counts.passed)} geçti\n${f.count(counts.failed)} kaldı`,
                                                `${f.count(counts.passed)} passed\n${f.count(counts.failed)} failed`,
                                            )}
                                        </Text>
                                    ) : null}
                                </View>
                            );
                        })}
                    </View>
                ))}
            </View>
        </StatsCard>
    );
}

function createStyles(colors: ColorScheme) {
    return StyleSheet.create({
        table: { gap: 2 },
        row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
        bodyRow: {
            minHeight: 40,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: colors.borderLight,
            paddingVertical: Spacing.xs,
        },
        rowLabel: { flex: 1.3, minWidth: 0, color: colors.textSecondary, fontSize: FontSize.sm, fontWeight: '600' },
        headCell: { flex: 1, minWidth: 0, textAlign: 'center', color: colors.textSecondary, fontSize: FontSize.xs, fontWeight: '700' },
        cell: { flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center', gap: 2 },
        value: { color: colors.textPrimary, fontSize: FontSize.md, fontWeight: '700' },
        detail: { color: colors.textSecondary, fontSize: FontSize.xs, textAlign: 'center' },
    });
}
