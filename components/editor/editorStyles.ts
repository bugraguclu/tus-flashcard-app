import { Platform, StyleSheet } from 'react-native';
import { FontSize, Spacing, type ColorScheme } from '../../constants/theme';
import { Radius } from '../ui/tokens';

/** The widest the note's fields grow; a wider window centres them. */
export const EDITOR_WIDTH = 720;

/**
 * Styles for the note editor screen and the content of the dialogs it opens. `inset` lines the
 * formatting toolbar's field tabs up with the centred fields in a wide window (0 on a phone).
 */
export function createEditorStyles(colors: ColorScheme, inset = 0) {
    return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bgCard },
    keyboardArea: { flex: 1 },
    editorScroll: { flex: 1, backgroundColor: colors.bgCard },
    content: {
        width: '100%',
        maxWidth: EDITOR_WIDTH,
        alignSelf: 'center',
        paddingHorizontal: Spacing.s6,
        paddingTop: 5,
        paddingBottom: Spacing.xxl,
    },
    formatToolbar: {
        backgroundColor: colors.bgCard,
        borderTopWidth: 1,
        borderTopColor: colors.border,
        minHeight: 44,
    },
    blockStyleButtonText: { fontSize: FontSize.md, fontWeight: '600', color: colors.textPrimary },
    blockStyleButtonTextActive: { color: colors.accent },
    toolbarTabsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        // The buttons below centre themselves; the field tabs line up with the fields.
        paddingHorizontal: Spacing.sm + inset,
        paddingTop: 4,
    },
    keyboardDismissButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        // A plain text button over the keyboard, no tinted pill.
        paddingHorizontal: Spacing.s6,
        paddingVertical: 5,
    },
    keyboardDismissText: {
        fontSize: FontSize.sm,
        fontWeight: '600',
        color: colors.accent,
    },
    standaloneKeyboardDismissBar: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        alignItems: 'center',
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.xs,
        backgroundColor: colors.bgCard,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: colors.border,
    },
    scrollBottomDismissArea: {
        height: 100,
        width: '100%',
    },
    formatToolbarScroll: { width: '100%' },
    formatToolbarContent: {
        flexGrow: 1,
        minHeight: 44,
        alignItems: 'center',
        paddingHorizontal: 0,
    },
    formatToolbarContentCentered: { justifyContent: 'center' },
    formatToolbarWrapped: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 0,
    },
    blockStyleButtonTextDisabled: { color: colors.textMuted },
    customFormatButtonText: {
        maxWidth: 38,
        fontSize: 24,
        lineHeight: 28,
        color: colors.textPrimary,
        textAlign: 'center',
    },
    customToolbarPresetScroll: {
        flexDirection: 'row',
        gap: Spacing.xs,
        paddingVertical: Spacing.xxs,
    },
    customToolbarPreviewCard: {
        marginTop: Spacing.sm,
        padding: Spacing.sm,
        borderRadius: Radius.inset,
        backgroundColor: colors.bgSecondary,
        borderWidth: 1,
        borderColor: colors.borderLight,
        gap: Spacing.s6,
    },
    customToolbarPreviewLabel: {
        fontSize: FontSize.xs,
        fontWeight: '600',
        color: colors.textSecondary,
    },
    customToolbarPreviewRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
    },
    customToolbarButtonPreview: {
        width: 36,
        height: 36,
        borderRadius: Radius.control,
        backgroundColor: colors.bgCard,
        borderWidth: 1,
        borderColor: colors.border,
        alignItems: 'center',
        justifyContent: 'center',
    },
    customToolbarButtonPreviewText: {
        fontSize: FontSize.sm,
        fontWeight: '600',
        color: colors.textPrimary,
    },
    customToolbarInput: { marginTop: Spacing.sm, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
    customToolbarHtmlPreview: {
        flex: 1,
        backgroundColor: colors.bgCard,
        paddingHorizontal: Spacing.xs,
        paddingVertical: 4,
        borderRadius: Radius.control,
        borderWidth: 1,
        borderColor: colors.borderLight,
    },
    customToolbarHtmlPreviewCode: {
        fontSize: FontSize.xs,
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
        color: colors.accent,
    },
    customToolbarSecurityNote: {
        fontSize: FontSize.xs,
        color: colors.textMuted,
        lineHeight: 15,
    },
    customToolbarHelpScroll: {
        maxHeight: 340,
    },
    customToolbarTemplateHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: Spacing.xxs,
    },
    customToolbarPresetDesc: {
        fontSize: FontSize.xs,
        color: colors.textSecondary,
        marginBottom: 4,
    },
    customToolbarTemplate: {
        marginTop: Spacing.sm,
        padding: Spacing.md,
        borderRadius: Radius.inset,
        backgroundColor: colors.bgSecondary,
        borderWidth: 1,
        borderColor: colors.border,
        gap: Spacing.xs,
    },
    customToolbarTemplateTitle: { fontSize: FontSize.sm, fontWeight: '600', color: colors.textPrimary },
    customToolbarCode: {
        fontSize: FontSize.sm,
        lineHeight: 20,
        color: colors.textSecondary,
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    },
    previewMeta: { fontSize: FontSize.xs, color: colors.textMuted },
    previewBody: {
        backgroundColor: colors.bgSecondary,
        borderRadius: Radius.inset,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: colors.border,
    },
    fieldLabelRow: { minHeight: 40, marginTop: 4, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    fieldName: { flex: 1, fontSize: FontSize.sm, fontWeight: '500', color: colors.textPrimary },
    fieldActions: { flexDirection: 'row', alignItems: 'center' },
    duplicateWarning: { marginTop: Spacing.xs },
    });
}

export type EditorStyles = ReturnType<typeof createEditorStyles>;
