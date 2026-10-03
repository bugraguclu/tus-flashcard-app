import { StyleSheet } from 'react-native';
import { BorderRadius, FontSize, Shadows, Spacing, type ColorScheme } from '../../constants/theme';

/** Width of the column left of the cards, which holds the timeline line, its nodes and buttons. */
const TIMELINE_GUTTER = 84;
/** Horizontal position of the timeline line inside the gutter. */
export const TIMELINE_LINE_X = 60;
const NODE_SIZE = 28;

function createTimelineStyles(colors: ColorScheme) {
    return StyleSheet.create({
        dayHeader: {
            flexDirection: 'row',
            alignItems: 'center',
            paddingRight: Spacing.lg,
            paddingTop: Spacing.lg,
            paddingBottom: Spacing.xs,
        },
        dayChipSlot: { width: TIMELINE_LINE_X * 2, alignItems: 'center' },
        dayChip: {
            minWidth: 76,
            alignItems: 'center',
            backgroundColor: colors.bgCard,
            borderRadius: BorderRadius.md,
            paddingHorizontal: Spacing.md,
            paddingVertical: 7,
            ...Shadows.sm,
        },
        dayChipText: { fontSize: FontSize.lg, fontWeight: '700', color: colors.textPrimary },
        dayHeaderAccessory: { marginLeft: 'auto' },

        row: { flexDirection: 'row', alignItems: 'stretch' },
        gutter: { width: TIMELINE_GUTTER },
        line: {
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: TIMELINE_LINE_X,
            width: 1,
            backgroundColor: colors.border,
        },
        nodeSlot: {
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: TIMELINE_LINE_X - NODE_SIZE / 2,
            width: NODE_SIZE,
            alignItems: 'center',
            justifyContent: 'center',
        },
        node: {
            width: NODE_SIZE,
            height: NODE_SIZE,
            borderRadius: NODE_SIZE / 2,
            alignItems: 'center',
            justifyContent: 'center',
        },
        nodeDone: { backgroundColor: colors.btnGood },
        nodeTimer: { backgroundColor: colors.accent },
        nodePlanned: { backgroundColor: colors.badgeNew },
        nodeMissed: { backgroundColor: colors.btnAgain },
        nodeText: { color: colors.white, fontSize: FontSize.sm, fontWeight: '800' },
        sideButtonSlot: {
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: Spacing.sm,
            justifyContent: 'center',
        },
        sideButton: {
            width: 30,
            height: 28,
            borderRadius: BorderRadius.sm,
            backgroundColor: colors.bgCard,
            alignItems: 'center',
            justifyContent: 'center',
            ...Shadows.sm,
        },
        sideButtonText: { fontSize: FontSize.sm, lineHeight: 14, color: colors.textSecondary },

        column: { flex: 1, paddingRight: Spacing.lg, paddingVertical: Spacing.sm },
        card: {
            flexDirection: 'row',
            gap: Spacing.md,
            backgroundColor: colors.bgCard,
            borderRadius: BorderRadius.lg,
            padding: Spacing.md,
            ...Shadows.sm,
        },
        tile: {
            width: 52,
            height: 52,
            borderRadius: BorderRadius.md,
            backgroundColor: colors.accentLight,
            alignItems: 'center',
            justifyContent: 'center',
        },
        tileText: { fontSize: FontSize.xxl, fontWeight: '800', color: colors.accent },
        body: { flex: 1, gap: Spacing.sm },
        titleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
        subject: { flex: 1, fontSize: FontSize.lg, fontWeight: '800', color: colors.accent },
        chip: {
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: BorderRadius.full,
            paddingHorizontal: Spacing.sm,
            paddingVertical: 3,
        },
        chipText: { fontSize: FontSize.xs, fontWeight: '600', color: colors.textSecondary },
        metricsRow: { flexDirection: 'row' },
        metric: { flex: 1, gap: 2 },
        metricLabel: { fontSize: FontSize.md, fontWeight: '500', color: colors.textSecondary },
        metricLabelBreak: { fontSize: FontSize.md, fontWeight: '500', color: colors.streak },
        metricValue: { fontSize: FontSize.lg, fontWeight: '600', color: colors.textPrimary },
        timeRange: {
            marginTop: Spacing.xs,
            textAlign: 'right',
            fontSize: FontSize.sm,
            color: colors.textMuted,
        },
    });
}

type TimelineStyles = ReturnType<typeof createTimelineStyles>;

const cache = new WeakMap<ColorScheme, TimelineStyles>();

/** Timeline styles shared by the Kronometre and the study calendar, built once per palette. */
export function timelineStyles(colors: ColorScheme): TimelineStyles {
    let styles = cache.get(colors);
    if (!styles) {
        styles = createTimelineStyles(colors);
        cache.set(colors, styles);
    }
    return styles;
}
