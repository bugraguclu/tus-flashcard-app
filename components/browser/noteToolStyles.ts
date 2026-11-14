import { StyleSheet } from 'react-native';
import { BorderRadius, FontSize, Spacing, type ColorScheme } from '../../constants/theme';

/**
 * Styles the browser's note tools add inside the kit's dialog (components/ui/Dialog.tsx): the
 * field selector, notices, progress and the duplicate groups.
 */
export function createNoteToolStyles(colors: ColorScheme) {
    return StyleSheet.create({
        body: { flexGrow: 0, flexShrink: 1 },
        selectButton: {
            minHeight: 48,
            flexDirection: 'row',
            alignItems: 'center',
            gap: Spacing.sm,
            paddingHorizontal: Spacing.md,
            backgroundColor: colors.bgSecondary,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: BorderRadius.sm,
        },
        selectButtonText: { flex: 1, color: colors.textPrimary, fontSize: FontSize.md },
        selectList: {
            maxHeight: 220,
            marginTop: Spacing.xs,
            backgroundColor: colors.bgSecondary,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: BorderRadius.sm,
        },
        selectRow: {
            minHeight: 44,
            flexDirection: 'row',
            alignItems: 'center',
            gap: Spacing.sm,
            paddingHorizontal: Spacing.md,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: colors.borderLight,
        },
        selectRowActive: { backgroundColor: colors.accentLight },
        selectRowText: { flex: 1, color: colors.textPrimary, fontSize: FontSize.md },
        selectRowTextActive: { color: colors.accent, fontWeight: '600' },
        disabled: { opacity: 0.45 },
        notice: { marginTop: Spacing.sm, color: colors.textSecondary, fontSize: FontSize.sm, lineHeight: 19 },
        noticeError: { color: colors.btnAgain },
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
            borderRadius: BorderRadius.full,
            fontSize: FontSize.xs,
            fontWeight: '600',
        },
        groupValue: { flex: 1, color: colors.textPrimary, fontSize: FontSize.sm, lineHeight: 19 },
    });
}

export type NoteToolStyles = ReturnType<typeof createNoteToolStyles>;
