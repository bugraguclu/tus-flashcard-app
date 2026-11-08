import { StyleSheet } from 'react-native';
import { FontSize, Shadows, Spacing, type ColorScheme } from '../../constants/theme';
import { Radius } from '../ui/tokens';

/** The page around the statistics cards: the scope controls above them and the loading state. */
export function createStatsScreenStyles(colors: ColorScheme, isCompact: boolean) {
    return StyleSheet.create({
        // The header's white runs up under the status bar; the cards sit on the page colour.
        container: { flex: 1, backgroundColor: colors.bgCard },
        scroll: { flex: 1, backgroundColor: colors.bgPrimary },
        scrollContent: {
            width: '100%',
            maxWidth: 720,
            alignSelf: 'center',
            paddingHorizontal: isCompact ? Spacing.lg : Spacing.xl,
            paddingTop: Spacing.lg,
            gap: Spacing.md,
        },
        filters: { gap: Spacing.sm },
        deckSelector: {
            minHeight: 44,
            flexDirection: 'row',
            alignItems: 'center',
            gap: Spacing.sm,
            paddingHorizontal: Spacing.md,
            borderRadius: Radius.inset,
            backgroundColor: colors.bgCard,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: colors.borderLight,
            ...Shadows.sm,
        },
        deckSelectorLabel: { color: colors.textSecondary, fontSize: FontSize.sm },
        deckSelectorText: { flex: 1, minWidth: 0, fontSize: FontSize.md, fontWeight: '600', color: colors.textPrimary },
        body: { gap: Spacing.md },
        loadState: { minHeight: 240 },
    });
}
