import { StyleSheet } from 'react-native';
import { FontSize, Spacing, type ColorScheme } from '../../constants/theme';
import { Radius } from '../ui/tokens';

/**
 * Styles the browser's note tools add inside the kit's dialog (components/ui/Dialog.tsx): the
 * field selector, notices, progress and the duplicate groups.
 */
export function createNoteToolStyles(colors: ColorScheme) {
    return StyleSheet.create({
        body: { flexGrow: 0, flexShrink: 1 },
        // The select row sits in the dialog's own padding, not a card's inset.
        selectRow: { paddingHorizontal: 0 },
        selectList: {
            maxHeight: 220,
            backgroundColor: colors.bgSecondary,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: Radius.inset,
        },
        notice: { marginTop: Spacing.sm, color: colors.textSecondary, fontSize: FontSize.sm, lineHeight: 19 },
        noticeError: { color: colors.danger },
        hint: { marginTop: Spacing.xs, color: colors.textMuted, fontSize: FontSize.xs, lineHeight: 17 },
        busyRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.md },
        busyText: { flex: 1, color: colors.textSecondary, fontSize: FontSize.sm },
        searchRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
        searchInput: { flex: 1 },
        resultSummary: { marginTop: Spacing.md, color: colors.textPrimary, fontSize: FontSize.sm, fontWeight: '600' },
        groupList: { flexGrow: 0, flexShrink: 1, marginTop: Spacing.xs },
        groupRow: {
            minHeight: 50,
            flexDirection: 'row',
            alignItems: 'center',
            gap: Spacing.sm,
            paddingVertical: Spacing.sm,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: colors.borderLight,
        },
        groupCount: {
            minWidth: 58,
            paddingHorizontal: Spacing.sm,
            paddingVertical: 3,
            overflow: 'hidden',
            textAlign: 'center',
            color: colors.accent,
            backgroundColor: colors.accentLight,
            borderRadius: Radius.pill,
            fontSize: FontSize.xs,
            fontWeight: '600',
        },
        groupValue: { flex: 1, color: colors.textPrimary, fontSize: FontSize.sm, lineHeight: 19 },
    });
}

export type NoteToolStyles = ReturnType<typeof createNoteToolStyles>;
