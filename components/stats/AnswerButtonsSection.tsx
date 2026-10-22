import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BorderRadius, FontSize, Spacing, useThemeColors, type ColorScheme } from '../../constants/theme';
import type { AnswerButtonPoint } from '../../lib/ankiStats';
import StatsCard from './StatsCard';
import StatsTiles from './StatsTiles';
import { useStatsFormat } from './useStatsFormat';

/**
 * Anki's Answer Buttons graph as four plain bars, one per button, and Anki's "correct" figure — the
 * share of answers that were not Again — for learning, young and mature cards.
 */
export default function AnswerButtonsSection({ buttons }: { buttons: readonly AnswerButtonPoint[] }) {
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const f = useStatsFormat();
    const { l } = f;

    const rows = useMemo(() => {
        const meta = {
            1: { label: l('Tekrar', 'Again'), color: colors.btnAgain },
            2: { label: l('Zor', 'Hard'), color: colors.btnHard },
            3: { label: l('İyi', 'Good'), color: colors.btnGood },
            4: { label: l('Kolay', 'Easy'), color: colors.btnEasy },
        } as const;
        return buttons.map((point) => ({
            ease: point.ease,
            ...meta[point.ease],
            count: point.learning + point.young + point.mature,
        }));
    }, [buttons, colors, l]);
    const total = rows.reduce((sum, row) => sum + row.count, 0);
    const largest = Math.max(1, ...rows.map((row) => row.count));

    const correct = (key: 'learning' | 'young' | 'mature') => {
        const answered = buttons.reduce((sum, point) => sum + point[key], 0);
        const again = buttons.find((point) => point.ease === 1)?.[key] ?? 0;
        return { value: f.ratio(answered - again, answered), detail: answered > 0 ? l(`${f.count(answered)} cevap`, `${f.count(answered)} answers`) : undefined };
    };

    return (
        <StatsCard title={l('Cevap düğmeleri', 'Answer Buttons')}>
            {total === 0 ? (
                <Text style={styles.empty}>{l('Bu dönemde cevap yok.', 'No answers in this period.')}</Text>
            ) : (
                <View style={styles.rows}>
                    {rows.map((row) => (
                        <View
                            key={row.ease}
                            style={styles.row}
                            accessible
                            accessibilityLabel={`${row.label}: ${f.count(row.count)}, ${f.share(row.count, total)}`}
                        >
                            <Text style={styles.label} numberOfLines={1}>{row.label}</Text>
                            <View style={styles.track}>
                                <View style={[styles.fill, { width: `${(row.count / largest) * 100}%`, backgroundColor: row.color }]} />
                            </View>
                            <Text style={styles.count} numberOfLines={1}>{f.count(row.count)}</Text>
                            <Text style={styles.share} numberOfLines={1}>{f.share(row.count, total)}</Text>
                        </View>
                    ))}
                </View>
            )}
            <StatsTiles
                title={l('Doğru cevap oranı', 'Answered correctly')}
                tiles={[
                    { key: 'learning', label: l('Öğrenme', 'Learning'), ...correct('learning') },
                    { key: 'young', label: l('Genç', 'Young'), ...correct('young') },
                    { key: 'mature', label: l('Olgun', 'Mature'), ...correct('mature') },
                ]}
            />
        </StatsCard>
    );
}

function createStyles(colors: ColorScheme) {
    return StyleSheet.create({
        empty: { color: colors.textSecondary, fontSize: FontSize.sm, textAlign: 'center', paddingVertical: Spacing.lg },
        rows: { gap: Spacing.sm },
        row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, minHeight: 24 },
        label: { width: 52, color: colors.textPrimary, fontSize: FontSize.sm, fontWeight: '600' },
        track: { flex: 1, height: 10, borderRadius: BorderRadius.full, backgroundColor: colors.bgInput, overflow: 'hidden' },
        fill: { height: '100%', minWidth: 3, borderRadius: BorderRadius.full },
        count: { width: 56, textAlign: 'right', color: colors.textPrimary, fontSize: FontSize.sm, fontWeight: '700' },
        share: { width: 44, textAlign: 'right', color: colors.textSecondary, fontSize: FontSize.sm },
    });
}
