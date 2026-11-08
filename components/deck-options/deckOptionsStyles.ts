import { StyleSheet } from 'react-native';
import { FontSize, Spacing, type ColorScheme } from '../../constants/theme';
import { Radius, Type } from '../ui/tokens';

/**
 * What the deck options screen draws itself: its deck and preset selectors, the content of its
 * cards that is not a kit row, and the help sheet's list. Cards, rows, fields, buttons, dialogs
 * and the ••• menu come from `components/ui`.
 */
export function createDeckOptionsStyles(colors: ColorScheme) {
    return StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.bgPrimary },
        content: {
            width: '100%',
            maxWidth: 1180,
            alignSelf: 'center',
            padding: Spacing.lg,
            gap: Spacing.sm,
            paddingBottom: 72,
            flexDirection: 'row',
            flexWrap: 'wrap',
            alignItems: 'flex-start',
        },

        presetToolbar: {
            width: '100%',
            flexDirection: 'row',
            alignItems: 'stretch',
            gap: Spacing.sm,
            marginBottom: Spacing.sm,
        },
        presetSelector: {
            flex: 1,
            minHeight: 48,
            flexDirection: 'row',
            alignItems: 'center',
            gap: Spacing.sm,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: Radius.control,
            backgroundColor: colors.bgCard,
            paddingHorizontal: Spacing.md,
        },
        presetRow: {
            width: '100%',
            minHeight: 48,
            flexDirection: 'row',
            alignItems: 'center',
            gap: Spacing.sm,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: Radius.control,
            backgroundColor: colors.bgCard,
            paddingHorizontal: Spacing.md,
            marginBottom: Spacing.sm,
        },
        presetSelectorTextWrap: { flex: 1, minWidth: 0 },
        presetSelectorLabel: { ...Type.label, color: colors.textMuted },
        presetSelectorName: { ...Type.rowTitle, color: colors.textPrimary },
        presetSelectorMeta: { ...Type.caption, color: colors.textMuted },
        saveButton: { minWidth: 76 },
        presetMenuSlot: { justifyContent: 'center' },
        // Holds its place while empty, so the cards below do not jump when a message appears.
        saveStatus: { width: '100%', marginBottom: Spacing.sm },
        saveStatusHidden: { opacity: 0, pointerEvents: 'none' },

        optionCard: { width: '100%' },
        optionCardWide: { width: '49.25%' },
        // A card's content that is not a kit row: hints, scope tabs, a button and its note.
        block: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, gap: Spacing.sm },
        blockLabel: { ...Type.body, color: colors.textPrimary },
        blockHint: { ...Type.caption, color: colors.textMuted },
        limitTabs: { alignSelf: 'flex-end' },
        numberControl: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, flexShrink: 0 },
        numberField: { width: 112 },
        wideField: { width: 168 },
        inputSuffix: { ...Type.caption, color: colors.textMuted },
        fieldError: { ...Type.caption, fontWeight: '600', color: colors.danger, paddingHorizontal: Spacing.lg, paddingBottom: Spacing.sm },
        fieldErrorInline: { ...Type.caption, fontWeight: '600', color: colors.danger },
        adviceList: { gap: Spacing.sm, paddingHorizontal: Spacing.lg, paddingBottom: Spacing.md },
        parameterField: { minHeight: 96 },

        easyDaysRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
        easyDay: {
            minWidth: 64,
            alignItems: 'center',
            paddingVertical: 8,
            borderRadius: Radius.control,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.bgCard,
            gap: 2,
        },
        easyDayReduced: { backgroundColor: colors.warningBg, borderColor: colors.warning },
        easyDayOff: { backgroundColor: colors.dangerBg, borderColor: colors.danger },
        easyDayLabel: { fontSize: FontSize.sm, fontWeight: '700', color: colors.textPrimary },
        easyDayFactor: { fontSize: FontSize.xs, color: colors.textMuted },

        helpScroll: { flexShrink: 1 },
        helpContent: { gap: Spacing.lg, paddingBottom: Spacing.md },
        helpSummary: { ...Type.rowTitle, lineHeight: 23, color: colors.textPrimary },
        helpPoints: { gap: Spacing.md },
        helpPointRow: { flexDirection: 'row', alignItems: 'flex-start' },
        helpPointDot: {
            width: 7,
            height: 7,
            marginTop: 7,
            marginRight: Spacing.sm,
            borderRadius: 4,
            backgroundColor: colors.accent,
        },
        helpPointText: { flex: 1, color: colors.textSecondary, fontSize: FontSize.sm, lineHeight: 21 },
        helpDismiss: { marginTop: Spacing.sm },

        optionList: { maxHeight: 380 },
        presetList: { maxHeight: 320 },
        pickerOption: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.sm },
        pickerOptionCopy: { flex: 1, minWidth: 0, gap: 2 },
        pickerOptionText: { ...Type.body, color: colors.textPrimary },
        pickerOptionTextSelected: { color: colors.accent, fontWeight: '700' },
        pickerOptionMeta: { ...Type.caption, color: colors.textMuted },
    });
}

export type DeckOptionsStyles = ReturnType<typeof createDeckOptionsStyles>;
