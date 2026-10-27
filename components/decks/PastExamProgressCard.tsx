import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BorderRadius, FontSize, Spacing, useThemeColors, type ColorScheme } from '../../constants/theme';
import { useI18n } from '../../hooks/useI18n';
import { getAllDecks } from '../../lib/deckManager';
import { formatCount } from '../../lib/i18n';
import { getPastExamProgress } from '../../lib/pastExams';

interface PastExamProgressCardProps {
    deckName: string;
    /** Changes whenever answers or cards change, so the counts are read again. */
    version: string;
}

/** TUS scoring: four wrong answers cancel one right answer. */
function examNet(correct: number, wrong: number): number {
    return Math.round((correct - wrong / 4) * 100) / 100;
}

/**
 * Doğru / Yanlış / Boş for the question cards in a deck and its subdecks, the way TUSBuddy
 * reports an exam, with the net score TUS counts. Decks without question cards show nothing.
 */
export default function PastExamProgressCard({ deckName, version }: PastExamProgressCardProps) {
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const { l, locale } = useI18n();
    const progress = useMemo(() => {
        try {
            const deckIds = getAllDecks()
                .filter((deck) => deck.name === deckName || deck.name.startsWith(`${deckName}::`))
                .map((deck) => deck.id);
            return getPastExamProgress(deckIds);
        } catch (error) {
            console.warn('[PastExams] progress failed:', error);
            return null;
        }
        // version is the invalidation signal for this read.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [deckName, version]);

    if (!progress || progress.total === 0) return null;
    const { correct, wrong, blank, total } = progress;
    const share = (value: number) => `${(value / total) * 100}%` as const;
    const net = examNet(correct, wrong).toLocaleString(locale === 'tr' ? 'tr-TR' : 'en-US');
    const stat = (label: string, value: number, color: string) => (
        <View style={styles.stat}>
            <View style={[styles.dot, { backgroundColor: color }]} />
            <Text style={styles.statText}>
                {label}: <Text style={[styles.statValue, { color }]}>{formatCount(value, locale)}</Text>
            </Text>
        </View>
    );

    return (
        <View
            style={styles.card}
            accessible
            accessibilityLabel={l(
                `Soru çözümü: ${correct} doğru, ${wrong} yanlış, ${blank} boş, ${total} sorudan. Net ${net}.`,
                `Questions: ${correct} right, ${wrong} wrong, ${blank} blank of ${total}. Net ${net}.`,
            )}
        >
            <View style={styles.headingRow}>
                <Text style={styles.heading}>{l('SORU ÇÖZÜMÜ', 'QUESTIONS')}</Text>
                <Text style={styles.net}>{l(`Net ${net}`, `Net ${net}`)}</Text>
            </View>
            <View style={styles.stats}>
                {stat(l('Doğru', 'Right'), correct, colors.btnGood)}
                {stat(l('Yanlış', 'Wrong'), wrong, colors.btnAgain)}
                {stat(l('Boş', 'Blank'), blank, colors.textMuted)}
            </View>
            <View style={styles.track}>
                <View style={[styles.segment, { width: share(correct), backgroundColor: colors.btnGood }]} />
                <View style={[styles.segment, { width: share(wrong), backgroundColor: colors.btnAgain }]} />
            </View>
            <Text style={styles.caption}>
                {l(
                    `${formatCount(total, 'tr')} sorunun son cevabınıza göre durumu. “Tekrar” yanlış, diğer notlar doğru sayılır.`,
                    `Each of the ${formatCount(total, 'en')} questions by your latest answer. “Again” counts as wrong, other grades as right.`,
                )}
            </Text>
        </View>
    );
}

function createStyles(colors: ColorScheme) {
    return StyleSheet.create({
        card: {
            padding: Spacing.md,
            borderRadius: BorderRadius.md,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.bgCard,
            gap: Spacing.sm,
        },
        headingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
        heading: { fontSize: 10, fontWeight: '800', letterSpacing: 1, color: colors.textMuted },
        net: { fontSize: FontSize.sm, fontWeight: '800', color: colors.accent },
        stats: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.sm },
        stat: { flexDirection: 'row', alignItems: 'center', gap: 5 },
        dot: { width: 7, height: 7, borderRadius: 4 },
        statText: { fontSize: FontSize.sm, color: colors.textSecondary },
        statValue: { fontWeight: '800', fontVariant: ['tabular-nums'] },
        track: {
            flexDirection: 'row',
            height: 6,
            borderRadius: 3,
            overflow: 'hidden',
            backgroundColor: colors.borderLight,
        },
        segment: { height: '100%' },
        caption: { fontSize: FontSize.xs, lineHeight: 16, color: colors.textMuted },
    });
}
