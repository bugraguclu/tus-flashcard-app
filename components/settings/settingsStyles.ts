import { StyleSheet } from 'react-native';
import { FontSize, Shadows, Spacing, type ColorScheme } from '../../constants/theme';
import { Radius, Type } from '../ui/tokens';

/**
 * What the Settings screen draws itself: the content of its cards that is not a kit row (choices,
 * steppers, the tap grid, the sliders, the button preview), the help dialog's body and the picker
 * rows. Headers, cards, rows, buttons, notices and dialogs come from `components/ui`.
 */
export function createSettingsStyles(colors: ColorScheme, textScale = 1, width = 390) {
    // Give labels the full row before controls consume their width on a large-text phone.
    const stackControls = width < 480 && textScale > 1.05;
    return StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.bgPrimary },
        loading: { flex: 1 },
        // Save and Saved share one width, so the title does not move between them, and the button
        // stops growing with the text size before it would squeeze the title.
        headerSaveButton: { width: 104 * Math.min(textScale, 1.6), flexShrink: 0, paddingHorizontal: Spacing.sm },
        scrollContent: { width: '100%', maxWidth: 760, alignSelf: 'center', padding: Spacing.lg, paddingBottom: 100, gap: Spacing.md },

        // A card's content that is not a row of its own, padded like the kit's rows.
        block: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, gap: Spacing.sm },
        blockCopy: { gap: 2 },
        label: { ...Type.rowTitle, color: colors.textPrimary },
        summary: { ...Type.caption, color: colors.textMuted },
        // A gesture's action, under its direction.
        actionValue: { color: colors.accent, fontWeight: '700' },

        inlineStepperLayout: {
            flexDirection: stackControls ? 'column' : 'row',
            alignItems: stackControls ? 'stretch' : 'center',
            gap: stackControls ? Spacing.sm : Spacing.md,
        },
        inlineStepperCopy: stackControls ? { gap: 2 } : { flex: 1, minWidth: 0, gap: 2 },
        inlineStepper: { alignSelf: stackControls ? 'flex-end' : 'center', flexShrink: 0 },
        stackedStepperLayout: { gap: Spacing.sm },
        // Under its label, a stepper keeps its own width instead of stretching across the card.
        stackedStepper: { alignSelf: 'flex-start' },

        tapGrid: { flexDirection: 'row', flexWrap: 'wrap', overflow: 'hidden', borderWidth: 1, borderColor: colors.border, borderRadius: Radius.inset, backgroundColor: colors.bgSecondary },
        tapGridCell: { width: '33.3333%', minHeight: 78, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5, paddingVertical: Spacing.sm, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderLight },
        tapGridZone: { fontSize: 11, lineHeight: 15, fontWeight: '800', color: colors.textSecondary, textAlign: 'center' },
        tapGridAction: { marginTop: 4, fontSize: 11, lineHeight: 15, fontWeight: '700', color: colors.accent, textAlign: 'center' },

        // ↺: the kit's refresh arrow, turned the other way.
        mirrored: { transform: [{ scaleX: -1 }] },

        swipeSensitivityHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
        swipeSensitivityValue: { ...Type.bodyStrong, fontVariant: ['tabular-nums'], color: colors.accent },
        swipeSliderTouchTarget: { height: 46, justifyContent: 'center', paddingHorizontal: 10 },
        swipeSliderTrack: { height: 6, borderRadius: Radius.pill, backgroundColor: colors.border, overflow: 'visible' },
        swipeSliderFill: { height: 6, borderRadius: Radius.pill, backgroundColor: colors.accent },
        swipeSliderThumb: { position: 'absolute', top: -7, width: 20, height: 20, marginLeft: -10, borderRadius: 10, borderWidth: 2, borderColor: colors.bgCard, backgroundColor: colors.accent, ...Shadows.sm },

        notificationTimeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', flexShrink: 0, gap: Spacing.xs },
        notificationTimeInput: { minWidth: 56 },
        timeSeparator: { fontSize: FontSize.xxl, fontWeight: '800', color: colors.textPrimary },

        // A miniature reviewer that shows where the floating Tools button sits.
        overlayPreviewWrap: {
            alignItems: 'center',
            borderRadius: Radius.inset,
            backgroundColor: colors.bgSecondary,
            borderWidth: 1,
            borderColor: colors.borderLight,
            padding: Spacing.md,
        },
        overlayPreviewMock: {
            width: 170,
            height: 125,
            borderRadius: 14,
            borderWidth: 1.5,
            borderColor: colors.border,
            backgroundColor: colors.bgCard,
            overflow: 'hidden',
            position: 'relative',
            padding: 8,
            justifyContent: 'space-between',
            ...Shadows.sm,
        },
        overlayPreviewTopBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 2, opacity: 0.5 },
        overlayPreviewDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: colors.textMuted },
        overlayPreviewHeaderLine: { width: 44, height: 4, borderRadius: 2, backgroundColor: colors.textMuted },
        overlayPreviewCard: {
            backgroundColor: colors.bgSecondary,
            borderRadius: 8,
            padding: 8,
            gap: 5,
            marginVertical: 4,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: colors.borderLight,
        },
        overlayPreviewTextLine: { height: 4, borderRadius: 2, backgroundColor: colors.border },
        overlayPreviewBottomBar: { flexDirection: 'row', justifyContent: 'center', gap: 4, opacity: 0.45 },
        overlayPreviewMiniBtn: { width: 28, height: 8, borderRadius: 3, backgroundColor: colors.textMuted },
        overlayPreviewFloatingBtn: {
            position: 'absolute',
            bottom: 12,
            width: 26,
            height: 26,
            borderRadius: 13,
            backgroundColor: colors.accent,
            alignItems: 'center',
            justifyContent: 'center',
            ...Shadows.sm,
            borderWidth: 2,
            borderColor: colors.bgCard,
        },
        overlayPreviewFloatingBtnLeft: { left: 10 },
        overlayPreviewFloatingBtnRight: { right: 10 },
        overlayPreviewCaption: { ...Type.caption, marginTop: Spacing.sm, color: colors.textMuted, textAlign: 'center' },

        helpScroll: { flexShrink: 1 },
        helpContent: { gap: Spacing.md },
        helpIntro: { ...Type.body, lineHeight: 22, color: colors.textSecondary },
        helpStatus: { minHeight: 42, flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.md, borderRadius: Radius.inset, backgroundColor: colors.bgSecondary },
        helpStatusDot: { width: 10, height: 10, marginRight: Spacing.sm, borderRadius: 5, backgroundColor: colors.textMuted },
        helpStatusDotOn: { backgroundColor: colors.success },
        helpStatusText: { flex: 1, fontSize: FontSize.sm, lineHeight: 19, fontWeight: '700', color: colors.textPrimary },
        helpSectionTitle: { ...Type.bodyStrong, color: colors.textPrimary },
        helpBulletRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: Spacing.xs },
        helpBullet: { width: 18, fontSize: FontSize.md, lineHeight: 20, fontWeight: '900', color: colors.accent },
        helpBulletText: { ...Type.caption, flex: 1, lineHeight: 20, color: colors.textSecondary },
        helpStrong: { fontWeight: '800', color: colors.textPrimary },

        pickerList: { flexShrink: 1 },
        // A list row inside a dialog: the dialog's own padding is its inset.
        dialogRow: { paddingHorizontal: 0 },
    });
}
