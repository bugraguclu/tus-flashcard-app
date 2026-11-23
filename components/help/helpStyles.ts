import { Platform, StyleSheet } from 'react-native';
import { BorderRadius, FontSize, Shadows, Spacing, type ColorScheme } from '../../constants/theme';

const MONO_FONT = Platform.OS === 'ios' ? 'Menlo' : Platform.OS === 'web' ? 'ui-monospace, SFMono-Regular, Menlo, monospace' : 'monospace';

export function createHelpStyles(colors: ColorScheme) {
    return StyleSheet.create({
        container: {
            flex: 1,
            backgroundColor: colors.bgPrimary,
        },
        inner: {
            flex: 1,
            width: '100%',
            maxWidth: 760,
            alignSelf: 'center',
        },
        searchWrap: {
            paddingHorizontal: Spacing.lg,
            paddingTop: Spacing.md,
            paddingBottom: Spacing.sm,
        },
        searchBar: {
            flexDirection: 'row',
            alignItems: 'center',
            minHeight: 46,
            paddingHorizontal: Spacing.md,
            borderRadius: BorderRadius.lg,
            backgroundColor: colors.bgCard,
            borderWidth: 1,
            borderColor: colors.border,
            gap: Spacing.sm,
        },
        searchInput: {
            flex: 1,
            fontSize: FontSize.md,
            color: colors.textPrimary,
            paddingVertical: Platform.OS === 'web' ? 10 : 8,
        },
        searchClear: {
            width: 30,
            height: 30,
            borderRadius: BorderRadius.full,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.bgSecondary,
        },
        scroll: {
            flex: 1,
        },
        listContent: {
            paddingHorizontal: Spacing.lg,
            paddingTop: Spacing.sm,
            paddingBottom: Spacing.xxl * 1.5,
            gap: Spacing.lg,
        },
        noticeCard: {
            marginHorizontal: Spacing.lg,
            marginTop: Spacing.sm,
            padding: Spacing.md,
            borderRadius: BorderRadius.md,
            backgroundColor: colors.accentLight,
            borderLeftWidth: 3,
            borderLeftColor: colors.accent,
        },
        noticeText: {
            fontSize: FontSize.sm,
            lineHeight: 20,
            color: colors.textPrimary,
        },
        groupBlock: {
            gap: Spacing.xs,
        },
        groupTitle: {
            fontSize: FontSize.xs,
            fontWeight: '700',
            textTransform: 'uppercase',
            letterSpacing: 0.7,
            color: colors.textMuted,
            paddingHorizontal: Spacing.xs,
            marginBottom: 2,
        },
        cardList: {
            backgroundColor: colors.bgCard,
            borderRadius: BorderRadius.lg,
            borderWidth: 1,
            borderColor: colors.borderLight,
            overflow: 'hidden',
            ...Shadows.sm,
        },
        topicRow: {
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: Spacing.lg,
            paddingVertical: Spacing.md,
            gap: Spacing.md,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: colors.borderLight,
        },
        topicRowLast: {
            borderBottomWidth: 0,
        },
        topicRowActive: {
            backgroundColor: colors.accentLight,
        },
        topicCopy: {
            flex: 1,
            gap: 3,
        },
        topicTitle: {
            fontSize: FontSize.md,
            fontWeight: '600',
            color: colors.textPrimary,
        },
        topicSummary: {
            fontSize: FontSize.sm,
            lineHeight: 19,
            color: colors.textSecondary,
        },
        hitMeta: {
            fontSize: FontSize.xs,
            fontWeight: '600',
            color: colors.accent,
        },
        hitSnippet: {
            fontSize: FontSize.sm,
            lineHeight: 18,
            color: colors.textMuted,
            marginTop: 2,
        },
        emptyBox: {
            alignItems: 'center',
            paddingVertical: Spacing.xxl,
            paddingHorizontal: Spacing.xl,
            backgroundColor: colors.bgCard,
            borderRadius: BorderRadius.lg,
            borderWidth: 1,
            borderColor: colors.borderLight,
            gap: Spacing.sm,
        },
        emptyText: {
            fontSize: FontSize.md,
            lineHeight: 22,
            color: colors.textSecondary,
            textAlign: 'center',
        },
        footer: {
            paddingTop: Spacing.sm,
            paddingHorizontal: Spacing.xs,
            gap: Spacing.sm,
            alignItems: 'center',
        },
        offlineNote: {
            fontSize: FontSize.xs,
            lineHeight: 18,
            color: colors.textMuted,
            textAlign: 'center',
        },
        supportBtn: {
            paddingVertical: Spacing.xs,
            paddingHorizontal: Spacing.md,
            borderRadius: BorderRadius.full,
        },
        supportLink: {
            fontSize: FontSize.sm,
            fontWeight: '600',
            color: colors.accent,
        },

        // Article reader styles
        articleContent: {
            paddingHorizontal: Spacing.lg,
            paddingTop: Spacing.lg,
            paddingBottom: Spacing.xxl * 2,
            gap: Spacing.md,
        },
        articleSummary: {
            fontSize: FontSize.md,
            lineHeight: 23,
            color: colors.textSecondary,
            paddingBottom: Spacing.xs,
        },
        tocCard: {
            padding: Spacing.md,
            borderRadius: BorderRadius.lg,
            backgroundColor: colors.bgCard,
            borderWidth: 1,
            borderColor: colors.borderLight,
            gap: Spacing.xs,
        },
        tocLabel: {
            fontSize: FontSize.xs,
            fontWeight: '700',
            textTransform: 'uppercase',
            letterSpacing: 0.6,
            color: colors.textMuted,
            marginBottom: 2,
        },
        tocChipWrap: {
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: Spacing.xs,
        },
        tocChip: {
            paddingVertical: 6,
            paddingHorizontal: 10,
            borderRadius: BorderRadius.full,
            backgroundColor: colors.bgSecondary,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: colors.border,
        },
        tocChipText: {
            fontSize: FontSize.xs,
            fontWeight: '500',
            color: colors.textPrimary,
        },
        sectionBlock: {
            paddingTop: Spacing.md,
            gap: Spacing.sm,
        },
        sectionHighlight: {
            backgroundColor: colors.accentLight,
            borderRadius: BorderRadius.md,
            paddingHorizontal: Spacing.md,
            paddingVertical: Spacing.sm,
            marginHorizontal: -Spacing.md,
        },
        h2: {
            fontSize: FontSize.lg + 1,
            lineHeight: 26,
            fontWeight: '700',
            color: colors.textPrimary,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: colors.borderLight,
            paddingBottom: 6,
        },
        h3: {
            fontSize: FontSize.md + 1,
            lineHeight: 23,
            fontWeight: '600',
            color: colors.textPrimary,
            marginTop: Spacing.xs,
        },
        paragraph: {
            fontSize: FontSize.md,
            lineHeight: 23,
            color: colors.textPrimary,
        },
        inlineBold: {
            fontWeight: '600',
            color: colors.textPrimary,
        },
        inlineItalic: {
            fontStyle: 'italic',
        },
        inlineCode: {
            fontFamily: MONO_FONT,
            fontSize: FontSize.sm,
            color: colors.accent,
            backgroundColor: colors.bgSecondary,
        },
        inlineLink: {
            color: colors.accent,
            fontWeight: '500',
            textDecorationLine: 'underline',
        },
        listBlock: {
            gap: Spacing.xs + 2,
            paddingLeft: Spacing.xs,
        },
        listRow: {
            flexDirection: 'row',
            alignItems: 'flex-start',
            gap: Spacing.sm,
        },
        listBullet: {
            minWidth: 18,
            fontSize: FontSize.md,
            lineHeight: 23,
            fontWeight: '600',
            color: colors.accent,
        },
        listItemText: {
            flex: 1,
            fontSize: FontSize.md,
            lineHeight: 23,
            color: colors.textPrimary,
        },
        callout: {
            padding: Spacing.md,
            borderRadius: BorderRadius.md,
            borderLeftWidth: 3,
            gap: Spacing.xs,
        },
        calloutAnki: {
            backgroundColor: colors.accentLight,
            borderLeftColor: colors.accent,
        },
        calloutWeb: {
            backgroundColor: colors.badgeNewBg,
            borderLeftColor: colors.badgeNew,
        },
        calloutWarning: {
            backgroundColor: colors.bgSecondary,
            borderLeftColor: colors.btnHard,
        },
        calloutNote: {
            backgroundColor: colors.bgSecondary,
            borderLeftColor: colors.border,
        },
        codeBlock: {
            padding: Spacing.md,
            borderRadius: BorderRadius.md,
            backgroundColor: colors.bgSecondary,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: colors.border,
        },
        codeBlockText: {
            fontFamily: MONO_FONT,
            fontSize: FontSize.sm,
            lineHeight: 20,
            color: colors.textPrimary,
        },
        codeCopyHint: {
            marginTop: Spacing.xs,
            fontSize: FontSize.xs,
            fontWeight: '600',
            color: colors.accent,
        },
        tableCards: {
            gap: Spacing.sm,
        },
        tableCard: {
            padding: Spacing.md,
            borderRadius: BorderRadius.md,
            backgroundColor: colors.bgCard,
            borderWidth: 1,
            borderColor: colors.borderLight,
            gap: Spacing.xs,
        },
        tableCardField: {
            gap: 2,
        },
        tableCardLabel: {
            fontSize: FontSize.xs,
            fontWeight: '700',
            color: colors.textMuted,
            textTransform: 'uppercase',
            letterSpacing: 0.4,
        },
        tableCardValue: {
            fontSize: FontSize.sm,
            lineHeight: 20,
            color: colors.textPrimary,
        },
        tableWide: {
            borderRadius: BorderRadius.md,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.bgCard,
            overflow: 'hidden',
        },
        tableWideHeader: {
            flexDirection: 'row',
            backgroundColor: colors.bgSecondary,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
        },
        tableWideRow: {
            flexDirection: 'row',
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: colors.borderLight,
        },
        tableWideRowLast: {
            borderBottomWidth: 0,
        },
        tableWideCell: {
            flex: 1,
            paddingHorizontal: Spacing.sm,
            paddingVertical: Spacing.sm,
        },
        tableWideHeaderText: {
            fontSize: FontSize.xs,
            fontWeight: '700',
            color: colors.textSecondary,
        },
        tableWideCellText: {
            fontSize: FontSize.sm,
            lineHeight: 20,
            color: colors.textPrimary,
        },
        copiedToast: {
            position: 'absolute',
            bottom: Spacing.lg,
            alignSelf: 'center',
            paddingHorizontal: Spacing.lg,
            paddingVertical: Spacing.sm,
            borderRadius: BorderRadius.full,
            backgroundColor: colors.textPrimary,
            ...Shadows.md,
        },
        copiedToastText: {
            fontSize: FontSize.sm,
            fontWeight: '600',
            color: colors.bgCard,
        },
    });
}

export type HelpStyles = ReturnType<typeof createHelpStyles>;
