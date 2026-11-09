import { StyleSheet } from 'react-native';
import { BorderRadius, FontSize, Spacing, type ColorScheme } from '../../constants/theme';

/**
 * Styles the browser's note tools add to the shared dialog styles in browserStyles.ts: the
 * field selector, notices and progress.
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
        selectCaret: { color: colors.textMuted, fontSize: FontSize.sm, fontWeight: '800' },
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
        selectRowTextActive: { color: colors.accent, fontWeight: '800' },
        disabled: { opacity: 0.45 },
        notice: { marginTop: Spacing.sm, color: colors.textSecondary, fontSize: FontSize.sm, lineHeight: 19 },
        noticeError: { color: colors.btnAgain },
        hint: { marginTop: Spacing.xs, color: colors.textMuted, fontSize: FontSize.xs, lineHeight: 17 },
        busyRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.md },
        busyText: { flex: 1, color: colors.textSecondary, fontSize: FontSize.sm },
    });
}

export type NoteToolStyles = ReturnType<typeof createNoteToolStyles>;
