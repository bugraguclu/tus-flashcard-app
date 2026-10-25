import { StyleSheet } from 'react-native';
import { BorderRadius, FontSize, Shadows, Spacing, type ColorScheme } from '../../constants/theme';

/** The page around the statistics cards: header, scope controls and loading states. */
export function createStatsScreenStyles(colors: ColorScheme, isCompact: boolean) {
    return StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.bgPrimary },
        screenHeader: {
            minHeight: 52,
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: Spacing.sm,
        },
        screenTitle: { flex: 1, fontSize: FontSize.xxl, fontWeight: '700', color: colors.textPrimary },
        headerButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
        infoGlyph: {
            width: 22,
            height: 22,
            borderRadius: 11,
            borderWidth: 1.5,
            borderColor: colors.accent,
            alignItems: 'center',
            justifyContent: 'center',
        },
        infoGlyphText: { color: colors.accent, fontSize: 13, lineHeight: 15, fontWeight: '800', fontStyle: 'italic' },
        scrollContent: {
            width: '100%',
            maxWidth: 720,
            alignSelf: 'center',
            paddingHorizontal: isCompact ? Spacing.lg : Spacing.xl,
            paddingTop: Spacing.xs,
            paddingBottom: Spacing.xxxl,
            gap: Spacing.md,
        },
        filters: { gap: Spacing.sm },
        deckSelector: {
            minHeight: 44,
            flexDirection: 'row',
            alignItems: 'center',
            gap: Spacing.sm,
            paddingHorizontal: Spacing.md,
            borderRadius: BorderRadius.md,
            backgroundColor: colors.bgCard,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: colors.borderLight,
            ...Shadows.sm,
        },
        deckSelectorLabel: { color: colors.textSecondary, fontSize: FontSize.sm },
        deckSelectorText: { flex: 1, minWidth: 0, fontSize: FontSize.md, fontWeight: '600', color: colors.textPrimary },
        deckSelectorCaret: { color: colors.textSecondary, fontSize: FontSize.lg, lineHeight: FontSize.lg + 2 },
        body: { gap: Spacing.md },
        loadState: { minHeight: 240, alignItems: 'center', justifyContent: 'center', gap: Spacing.sm },
        loadText: { color: colors.textSecondary, fontSize: FontSize.sm },
    });
}
