import { StyleSheet } from 'react-native';
import { FontSize, Spacing, type ColorScheme } from '../../constants/theme';
import { Type } from '../ui/tokens';

/**
 * Layout of the import workflow screen. Its cards, rows, buttons and choice lists are the shared
 * parts in `components/ui`; what is left here is the page, the hints set inside a card and the
 * preview table.
 */
export function createImportStyles(colors: ColorScheme) {
    return StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.bgPrimary },
        content: {
            width: '100%',
            maxWidth: 760,
            alignSelf: 'center',
            padding: Spacing.lg,
            paddingBottom: 100,
            gap: Spacing.lg,
        },

        /** A group label over something that is not a card of rows, e.g. a notice. */
        labelled: { gap: Spacing.xs + 2 },

        /** A sentence set inside a card between its rows. */
        hint: { ...Type.caption, color: colors.textMuted, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md },

        /** A tag field's row: its label over the field. */
        fieldRow: { gap: 6, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm + 2 },
        fieldLabel: { ...Type.body, color: colors.textPrimary },

        previewHeaderRow: { flexDirection: 'row' },
        previewRow: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderLight },
        previewCell: { width: 150, paddingVertical: 8, paddingRight: Spacing.md },
        previewHeaderText: { fontSize: FontSize.xs, fontWeight: '600', color: colors.textMuted },
        previewCellText: { fontSize: FontSize.sm, lineHeight: 18, color: colors.textPrimary },
    });
}

export type ImportStyles = ReturnType<typeof createImportStyles>;
