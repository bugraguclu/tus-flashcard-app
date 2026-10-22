import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BorderRadius, FontSize, Spacing, useThemeColors, type ColorScheme } from '../../constants/theme';
import type { CardCountStats } from '../../lib/ankiStats';
import StatsCard from './StatsCard';
import StatsTiles from './StatsTiles';
import { useStatsFormat } from './useStatsFormat';

/** Anki's Card Counts: every card in the scope by its current state, as one split bar. */
export default function CardCountsSection({ counts }: { counts: CardCountStats }) {
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const f = useStatsFormat();
    const { l } = f;

    const parts = [
        { key: 'mature', label: l('Olgun', 'Mature'), count: counts.mature, color: colors.chartMature },
        { key: 'youngLearn', label: l('Genç + öğrenme', 'Young + learning'), count: counts.youngLearn, color: colors.chartYoung },
        { key: 'unseen', label: l('Yeni', 'New'), count: counts.unseen, color: colors.chartNew },
        { key: 'suspendedBuried', label: l('Askıda + gömülü', 'Suspended + buried'), count: counts.suspendedBuried, color: colors.textMuted },
    ];

    return (
        <StatsCard title={l('Kart durumu', 'Card Counts')}>
            <View
                style={styles.bar}
                accessible
                accessibilityLabel={parts.map((part) => `${part.label}: ${f.count(part.count)}`).join(', ')}
            >
                {counts.totalCards > 0
                    ? parts.map((part) => part.count > 0 && (
                        <View key={part.key} style={[styles.segment, { flexGrow: part.count, backgroundColor: part.color }]} />
                    ))
                    : <View style={[styles.segment, { flexGrow: 1, backgroundColor: colors.bgInput }]} />}
            </View>
            <View style={styles.legend}>
                {parts.map((part) => (
                    <View key={part.key} style={styles.legendRow} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
                        <View style={[styles.swatch, { backgroundColor: part.color }]} />
                        <Text style={styles.legendLabel} numberOfLines={1}>{part.label}</Text>
                        <Text style={styles.legendValue}>{f.count(part.count)}</Text>
                        <Text style={styles.legendShare}>{f.share(part.count, counts.totalCards)}</Text>
                    </View>
                ))}
            </View>
            <StatsTiles
                tiles={[
                    { key: 'cards', label: l('Toplam kart', 'Total cards'), value: f.count(counts.totalCards) },
                    { key: 'notes', label: l('Toplam not', 'Total notes'), value: f.count(counts.totalNotes) },
                    {
                        key: 'perNote',
                        label: l('Not başına kart', 'Cards per note'),
                        value: counts.totalNotes > 0 ? f.decimal(counts.totalCards / counts.totalNotes, 1) : '—',
                    },
                ]}
            />
        </StatsCard>
    );
}

function createStyles(colors: ColorScheme) {
    return StyleSheet.create({
        bar: { flexDirection: 'row', height: 12, gap: 2, borderRadius: BorderRadius.full, overflow: 'hidden' },
        segment: { flexBasis: 0, minWidth: 3, height: '100%' },
        legend: { gap: 6 },
        legendRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
        swatch: { width: 10, height: 10, borderRadius: 3 },
        legendLabel: { flex: 1, color: colors.textPrimary, fontSize: FontSize.sm },
        legendValue: { color: colors.textPrimary, fontSize: FontSize.sm, fontWeight: '700' },
        legendShare: { width: 48, textAlign: 'right', color: colors.textSecondary, fontSize: FontSize.sm },
    });
}
