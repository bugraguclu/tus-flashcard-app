import { StyleSheet } from 'react-native';
import { Spacing, type ColorScheme } from '../../constants/theme';
import { Type } from '../ui/tokens';

export type FilteredDeckOptionsStyles = ReturnType<typeof createFilteredDeckOptionsStyles>;

/**
 * Styles of the filtered deck form (components/FilteredDeckOptionsModal.tsx). Its header, cards,
 * rows, switches, buttons and sheets come from the design system; what is left here lays out the
 * fields that have no row of their own.
 */
export function createFilteredDeckOptionsStyles(colors: ColorScheme) {
    return StyleSheet.create({
        // The safe area above the header takes the header's colour, and the strip under the footer
        // the footer's; the form scrolls on the page colour between them.
        screen: { flex: 1, backgroundColor: colors.bgCard },
        scroll: { flex: 1, backgroundColor: colors.bgPrimary },
        content: {
            width: '100%',
            maxWidth: 640,
            alignSelf: 'center',
            padding: Spacing.lg,
            paddingBottom: Spacing.xxl,
            gap: Spacing.lg,
        },
        // A field inside a card that takes the row's full width: its label above, the field below.
        fieldRow: {
            paddingHorizontal: Spacing.lg,
            paddingVertical: Spacing.sm + 2,
            gap: Spacing.xs,
        },
        fieldLabel: { ...Type.caption, fontWeight: '500', color: colors.textSecondary },
        fieldDescription: { ...Type.caption, color: colors.textMuted },
        searchRow: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: Spacing.xs,
        },
        searchInput: { flex: 1 },
        numberInput: { width: 84 },
        excludedButton: { alignSelf: 'center' },
        footer: {
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: colors.borderLight,
            backgroundColor: colors.bgCard,
            paddingHorizontal: Spacing.md,
            paddingTop: Spacing.md,
        },
        sheetList: { flexGrow: 0 },
    });
}
