import React, { useMemo } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { FontSize, Spacing, useThemeColors, type ColorScheme } from '../../constants/theme';
import { useI18n } from '../../hooks/useI18n';

// Header and row values share their column widths on web and iPhone.
function useTableStyles() {
    const { width, fontScale } = useWindowDimensions();
    const colors = useThemeColors();
    const baseWidth = width < 360 ? 40 : width < 600 ? 48 : 54;
    const textScale = Math.max(1, Math.min(fontScale, 1.3));
    const columnWidth = Math.round(baseWidth * textScale);
    const learningWidth = Math.max(columnWidth, Math.round(48 * textScale));
    return useMemo(() => createStyles(colors, columnWidth, learningWidth), [colors, columnWidth, learningWidth]);
}

export function DeckListColumnHeaders() {
    const styles = useTableStyles();
    const { t } = useI18n();
    return (
        <View style={styles.header}>
            <Text style={styles.deckLabel}>{t('common.deck')}</Text>
            <View style={styles.counts}>
                <Text style={[styles.column, styles.label, styles.new]}>{t('anki.new')}</Text>
                <Text style={[styles.column, styles.label, styles.learn]}>{t('anki.learn')}</Text>
                <Text style={[styles.column, styles.label, styles.review]}>{t('anki.review')}</Text>
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
        <View style={styles.counts}>
            <Text style={[styles.column, styles.value, styles.new]} accessibilityLabel={`${t('anki.new')}: ${newCount}`}>{newCount}</Text>
            <Text style={[styles.column, styles.value, styles.learn]} accessibilityLabel={`${t('anki.learn')}: ${learnCount}`}>{learnCount}</Text>
            <Text style={[styles.column, styles.value, styles.review]} accessibilityLabel={`${t('anki.review')}: ${reviewCount}`}>{reviewCount}</Text>
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
        column: { width: columnWidth, textAlign: 'center', fontWeight: '700' },
        label: { fontSize: FontSize.xs },
        value: { fontSize: FontSize.md, fontVariant: ['tabular-nums'] },
        new: { color: colors.badgeNew },
        learn: { color: colors.badgeLearn, width: learningWidth },
        review: { color: colors.badgeReview },
        actionsSpacer: { width: 88 },
    });
}
