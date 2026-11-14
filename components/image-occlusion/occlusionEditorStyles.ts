import { StyleSheet } from 'react-native';
import { FontSize, Shadows, Spacing, type ColorScheme } from '../../constants/theme';
import { Radius, Type } from '../ui/tokens';

/**
 * The Image Occlusion editor: a full-screen work surface like the photo editor, in the app's
 * light or dark theme. The picture sits on the page colour; the bars around it are the card's.
 */
export function createOcclusionEditorStyles(colors: ColorScheme) {
    return StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.bgCard },
        optionsRow: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: Spacing.sm,
            paddingHorizontal: Spacing.md,
            paddingVertical: Spacing.sm,
        },
        // Two long choices that wrap onto a second line, which `SegmentedControl` does not do.
        modeSwitch: { flex: 1, flexDirection: 'row', borderRadius: Radius.inset, backgroundColor: colors.bgInput, padding: 3 },
        modeOption: {
            flex: 1,
            minHeight: 36,
            borderRadius: Radius.inset - 2,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 4,
        },
        modeOptionActive: { backgroundColor: colors.segmentSelected, ...Shadows.sm },
        modeText: { color: colors.textSecondary, fontSize: FontSize.sm, fontWeight: '600', textAlign: 'center' },
        modeTextActive: { color: colors.textPrimary },
        bar: {
            flexDirection: 'row',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: Spacing.sm,
            paddingHorizontal: Spacing.md,
            paddingVertical: Spacing.sm,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: colors.border,
            backgroundColor: colors.bgSecondary,
        },
        barLabel: { ...Type.bodyStrong, color: colors.textPrimary, marginRight: 'auto' },
        swatches: {
            flexDirection: 'row',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: Spacing.sm,
            paddingHorizontal: Spacing.md,
            paddingBottom: Spacing.sm,
            backgroundColor: colors.bgSecondary,
        },
        swatch: {
            width: 36,
            height: 36,
            borderRadius: Radius.pill,
            borderWidth: 2,
            borderColor: colors.transparent,
            alignItems: 'center',
            justifyContent: 'center',
        },
        swatchFill: { width: 26, height: 26, borderRadius: Radius.pill, borderWidth: 1, borderColor: colors.border },
        swatchNote: { color: colors.textMuted, fontSize: FontSize.xs, flexBasis: '100%' },
        tools: {
            flexDirection: 'row',
            justifyContent: 'space-around',
            paddingHorizontal: Spacing.sm,
            paddingTop: Spacing.sm,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: colors.border,
        },
        tool: { flex: 1, minHeight: 52, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.inset, gap: 2 },
        toolActive: { backgroundColor: colors.bgInput },
        toolText: { color: colors.textMuted, fontSize: FontSize.xs, fontWeight: '600' },
        toolTextActive: { color: colors.textPrimary },
        hint: { ...Type.caption, color: colors.textMuted, textAlign: 'center', paddingHorizontal: Spacing.md, paddingBottom: Spacing.xs },
        promptInput: { minHeight: 80 },
    });
}
