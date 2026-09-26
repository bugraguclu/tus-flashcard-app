import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BorderRadius, FontSize, Shadows, Spacing, useThemeColors, type ColorScheme } from '../../constants/theme';
import type { StatsDeckProgress } from '../../lib/screenSnapshots';
import { useStatsFormat } from './useStatsFormat';

interface DeckProgressSectionProps {
    title: string;
    decks: readonly StatsDeckProgress[];
    onSelectDeck: (name: string) => void;
}

/**
 * How far each deck one level down has come: a bar split into the same card states as Card
 * Counts, so a deck that is mostly mature looks it. Tapping a deck scopes the whole screen to it.
 */
export default function DeckProgressSection({ title, decks, onSelectDeck }: DeckProgressSectionProps) {
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const f = useStatsFormat();
    const { l } = f;
    if (decks.length === 0) return null;

    return (
        <View style={styles.section}>
            <Text style={styles.heading} accessibilityRole="header">{title}</Text>
            {decks.map((deck) => {
                const parts = [
                    { key: 'mature', count: deck.matureCount, color: colors.chartMature },
                    { key: 'young', count: deck.youngCount, color: colors.chartYoung },
                    { key: 'learn', count: deck.learningCount, color: colors.chartLearn },
                    { key: 'new', count: deck.newCount, color: colors.chartNew },
                ].filter((part) => part.count > 0);
                return (
                    <Pressable
                        key={deck.name}
                        style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                        onPress={() => onSelectDeck(deck.name)}
                        accessibilityRole="button"
                        accessibilityLabel={l(
                            `${deck.displayName}: ${f.count(deck.total)} kart, ${f.percent(deck.pct)} çalışıldı. İstatistiklerini göster`,
                            `${deck.displayName}: ${f.count(deck.total)} cards, ${f.percent(deck.pct)} studied. Show its statistics`,
                        )}
                    >
                        <View style={styles.rowHeader}>
                            <Text style={styles.name} numberOfLines={1}>{deck.displayName}</Text>
                            <Text style={styles.pct} maxFontSizeMultiplier={1.3}>{f.percent(deck.pct)}</Text>
                            <Text style={styles.chevron}>›</Text>
                        </View>
                        <View style={styles.bar}>
                            {parts.length > 0 ? parts.map((part) => (
                                <View key={part.key} style={[styles.segment, { flexGrow: part.count, backgroundColor: part.color }]} />
                            )) : <View style={[styles.segment, { flexGrow: 1, backgroundColor: colors.borderLight }]} />}
                        </View>
                        <Text style={styles.detail} numberOfLines={1}>
                            {deck.total === 0
                                ? l('Boş deste', 'Empty deck')
                                : l(
                                    `${f.count(deck.total)} kart · Olgun ${f.count(deck.matureCount)} · Genç ${f.count(deck.youngCount)} · Yeni ${f.count(deck.newCount)}`,
                                    `${f.count(deck.total)} cards · Mature ${f.count(deck.matureCount)} · Young ${f.count(deck.youngCount)} · New ${f.count(deck.newCount)}`,
                                )}
                        </Text>
                    </Pressable>
                );
            })}
        </View>
    );
}

function createStyles(colors: ColorScheme) {
    return StyleSheet.create({
        section: { gap: Spacing.sm },
        heading: { color: colors.textPrimary, fontSize: FontSize.lg, fontWeight: '800', marginTop: Spacing.sm },
        row: {
            gap: 7,
            padding: Spacing.md,
            borderRadius: BorderRadius.md,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: colors.border,
            backgroundColor: colors.bgCard,
            ...Shadows.sm,
        },
        pressed: { opacity: 0.7 },
        rowHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
        name: { flex: 1, color: colors.textPrimary, fontSize: FontSize.md, fontWeight: '700' },
        pct: { color: colors.textPrimary, fontSize: FontSize.md, fontWeight: '800' },
        chevron: { color: colors.textMuted, fontSize: 22, lineHeight: 22 },
        bar: { flexDirection: 'row', height: 8, gap: 2, borderRadius: BorderRadius.full, overflow: 'hidden' },
        segment: { flexBasis: 0, minWidth: 2, height: '100%' },
        detail: { color: colors.textMuted, fontSize: FontSize.xs },
    });
}
