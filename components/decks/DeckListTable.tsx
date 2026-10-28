import { useMemo } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { Text, useLayoutTextScale } from '../AppText';
import { FontSize, Spacing, useThemeColors, type ColorScheme } from '../../constants/theme';
import { useI18n } from '../../hooks/useI18n';

/** Counts and their headings stop growing here, so the columns can be sized to hold them. */
const COUNT_TEXT_CAP = 1.3;

// Header and row values share their column widths on web and iPhone. The widths follow the
// text size up to the cap the counts are drawn at; "Öğrenme" needs 47 pt of the 52 at 10 pt.
function useTableStyles() {
    const { width } = useWindowDimensions();
    const colors = useThemeColors();
    const baseWidth = width < 360 ? 40 : width < 600 ? 48 : 54;
    const textScale = Math.max(1, Math.min(useLayoutTextScale(), COUNT_TEXT_CAP));
    const columnWidth = Math.round(baseWidth * textScale);
    const learningWidth = Math.max(columnWidth, Math.round(52 * textScale));
    return useMemo(() => createStyles(colors, columnWidth, learningWidth), [colors, columnWidth, learningWidth]);
}

export function DeckListColumnHeaders() {
    const styles = useTableStyles();
    const { t } = useI18n();
    return (
        <View style={styles.header}>
            <Text style={styles.deckLabel}>{t('common.deck')}</Text>
            <View style={styles.counts}>
                <Text style={[styles.column, styles.label, styles.new]} numberOfLines={1} maxFontSizeMultiplier={COUNT_TEXT_CAP}>{t('anki.new')}</Text>
                <Text style={[styles.column, styles.label, styles.learn]} numberOfLines={1} maxFontSizeMultiplier={COUNT_TEXT_CAP}>{t('anki.learn')}</Text>
                <Text style={[styles.column, styles.label, styles.review]} numberOfLines={1} maxFontSizeMultiplier={COUNT_TEXT_CAP}>{t('anki.review')}</Text>
            </View>
            <View style={styles.actionsSpacer} />
        </View>
    );
}

export function DeckListCounts({ newCount, learnCount, reviewCount }: {
    newCount: number;
    learnCount: number;
    reviewCount: number;
}) {
    const styles = useTableStyles();
    const { t } = useI18n();
    return (
        <View style={[styles.counts, styles.rowCounts]}>
            <Text style={[styles.column, styles.value, styles.new]} numberOfLines={1} maxFontSizeMultiplier={COUNT_TEXT_CAP} accessibilityLabel={`${t('anki.new')}: ${newCount}`}>{newCount}</Text>
            <Text style={[styles.column, styles.value, styles.learn]} numberOfLines={1} maxFontSizeMultiplier={COUNT_TEXT_CAP} accessibilityLabel={`${t('anki.learn')}: ${learnCount}`}>{learnCount}</Text>
            <Text style={[styles.column, styles.value, styles.review]} numberOfLines={1} maxFontSizeMultiplier={COUNT_TEXT_CAP} accessibilityLabel={`${t('anki.review')}: ${reviewCount}`}>{reviewCount}</Text>
        </View>
    );
}

function createStyles(colors: ColorScheme, columnWidth: number, learningWidth: number) {
    return StyleSheet.create({
        header: {
            flexDirection: 'row',
            alignItems: 'center',
            paddingLeft: Spacing.lg,
            paddingRight: Spacing.sm,
            paddingVertical: 6,
            backgroundColor: colors.bgSecondary,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
        },
        deckLabel: {
            flex: 1,
            minWidth: 0,
            fontSize: FontSize.xs,
            fontWeight: '600',
            color: colors.textMuted,
            letterSpacing: 0.5,
            textTransform: 'uppercase',
        },
        counts: { flexDirection: 'row', flexShrink: 0 },
        // In a deck row the counts sit at the right of a wrapping line: beside a name that fits,
        // under one that does not, in the same columns either way.
        rowCounts: { marginLeft: 'auto' },
        column: { width: columnWidth, textAlign: 'center', fontWeight: '700' },
        label: { fontSize: FontSize.xs },
        value: { fontSize: FontSize.md, fontVariant: ['tabular-nums'] },
        new: { color: colors.badgeNew },
        learn: { color: colors.badgeLearn, width: learningWidth },
        review: { color: colors.badgeReview },
        actionsSpacer: { width: 88 },
    });
}
