import { StyleSheet } from 'react-native';
import { FontSize, Shadows, Spacing, type ColorScheme } from '../../constants/theme';
import { Radius } from '../ui/tokens';

/**
 * The timeline both the Kronometre and the study calendar draw: the line, its day labels, nodes and
 * side buttons. The entries on it are `Card`s; their type is a `Badge`.
 */

/** Width of the column left of the cards, which holds the timeline line, its nodes and buttons. */
const TIMELINE_GUTTER = 80;
/** Horizontal position of the timeline line inside the gutter. */
export const TIMELINE_LINE_X = 58;
const NODE_SIZE = 22;

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
            minWidth: 68,
            alignItems: 'center',
            backgroundColor: colors.bgCard,
            borderRadius: Radius.inset,
            paddingHorizontal: Spacing.md,
            paddingVertical: 5,
            ...Shadows.sm,
        },
        dayChipText: { fontSize: FontSize.md, fontWeight: '600', color: colors.textPrimary },
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
        // A filled circle in a white ring, as TUSBuddy marks the line: a tick for a session done, a
        // clock for a plan, a minus for a day without study.
        node: {
            width: NODE_SIZE,
            height: NODE_SIZE,
            borderRadius: NODE_SIZE / 2,
            borderWidth: 1.5,
            borderColor: colors.bgCard,
            alignItems: 'center',
            justifyContent: 'center',
            ...Shadows.sm,
        },
        nodeDone: { backgroundColor: colors.accent },
        nodePlanned: { backgroundColor: colors.info },
        nodeMissed: { backgroundColor: colors.danger },
        sideButtonSlot: {
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: Spacing.md,
            justifyContent: 'center',
        },
        // Drawn 26 × 24 beside the line; `SIDE_BUTTON_SLOP` makes it a full 44-point target.
        sideButton: {
            width: 26,
            height: 24,
            borderRadius: Radius.control,
            backgroundColor: colors.bgCard,
            ...Shadows.sm,
        },

        column: { flex: 1, paddingRight: Spacing.lg, paddingVertical: Spacing.sm },
        /** The content of an entry's `Card`: the subject's tile beside its details. */
        cardRow: { flexDirection: 'row', gap: Spacing.md },
        tile: {
            width: 46,
            height: 46,
            borderRadius: Radius.inset,
            backgroundColor: colors.bgInput,
            alignItems: 'center',
            justifyContent: 'center',
        },
        tileText: { fontSize: FontSize.xl, fontWeight: '800', color: colors.accent },
        body: { flex: 1, gap: Spacing.xs },
        titleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
        subject: { flex: 1, fontSize: FontSize.md, fontWeight: '700', color: colors.accent },
        /** The type ("1. Tekrar") beside the subject. */
        typeBadge: { alignSelf: 'center' },
        metricsRow: { flexDirection: 'row' },
        metric: { flex: 1, gap: 2 },
        metricLabel: { fontSize: FontSize.sm, fontWeight: '600', color: colors.success },
        metricLabelBreak: { fontSize: FontSize.sm, fontWeight: '600', color: colors.streak },
        metricValue: { fontSize: FontSize.md, fontWeight: '600', color: colors.textPrimary },
        metricAside: { fontSize: FontSize.sm, fontWeight: '500', color: colors.textMuted },
        note: {
            paddingTop: Spacing.sm,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: colors.borderLight,
            fontSize: FontSize.sm,
            color: colors.textPrimary,
        },
        timeRange: {
            marginTop: Spacing.xs,
            textAlign: 'right',
            fontSize: FontSize.sm,
            color: colors.textMuted,
        },
    });
}

/** Makes the 26 × 24 side button a 44-point target. */
export const SIDE_BUTTON_SLOP = { top: 10, right: 9, bottom: 10, left: 9 };

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
