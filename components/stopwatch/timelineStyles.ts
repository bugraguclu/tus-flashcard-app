import { StyleSheet } from 'react-native';
import { FontSize, Spacing, type ColorScheme } from '../../constants/theme';
import { Shadow, Radius } from '../ui/tokens';

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
        // "Bugün" and "Dün" as plain text on the line; the page colour behind it cuts the line.
        dayChip: {
            minWidth: 68,
            alignItems: 'center',
            backgroundColor: colors.bgPrimary,
            paddingHorizontal: Spacing.sm,
            paddingVertical: 5,
        },
        dayChipText: { fontSize: FontSize.sm, fontWeight: '600', color: colors.textSecondary },
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
        // The line's marks are coloured glyphs with no disc: a tick for a session done (accent), a
        // clock for a plan (info), a minus for a day without study (danger). The page colour behind
        // the glyph cuts the line.
        node: {
            width: NODE_SIZE,
            height: NODE_SIZE,
            borderRadius: NODE_SIZE / 2,
            backgroundColor: colors.bgPrimary,
            alignItems: 'center',
            justifyContent: 'center',
        },
        sideButtonSlot: {
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: Spacing.md,
            justifyContent: 'center',
        },
        sideButton: {
            width: 26,
            height: 24,
            borderRadius: Radius.control,
            backgroundColor: colors.bgCard,
            alignItems: 'center',
            justifyContent: 'center',
            ...Shadow.card,
        },

        column: { flex: 1, paddingRight: Spacing.lg, paddingVertical: Spacing.sm },
        card: {
            flexDirection: 'row',
            gap: Spacing.md,
            backgroundColor: colors.bgCard,
            borderRadius: Radius.card,
            padding: Spacing.md,
            ...Shadow.card,
        },
        body: { flex: 1, gap: Spacing.xs },
        titleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
        subject: { flex: 1, fontSize: FontSize.md, fontWeight: '600', color: colors.accent },
        // The type ("1. Tekrar") as TUSBuddy outlines it.
        chip: {
            borderWidth: 1,
            borderColor: colors.info,
            borderRadius: Radius.control,
            paddingHorizontal: Spacing.s6,
            paddingVertical: 1,
        },
        chipText: { fontSize: FontSize.xs, fontWeight: '600', color: colors.info },
        metricsRow: { flexDirection: 'row' },
        metric: { flex: 1, gap: Spacing.xxs },
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
