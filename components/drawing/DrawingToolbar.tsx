import { useMemo, type ReactElement, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Text } from '../AppText';
import { Spacing, useThemeColors, type ColorScheme } from '../../constants/theme';
import { useI18n } from '../../hooks/useI18n';
import {
    DRAWING_MORE_TOOLS,
    DRAWING_SIZES,
    HIGHLIGHTER_OPACITY,
    drawingToolHasSizes,
    drawingToolWidth,
    type DrawingBarTool,
    type DrawingSize,
    type DrawingTool,
} from '../../lib/drawingPad';
import { blankCanvasLuminance } from '../../lib/blankCanvas';
import { ToolButton } from '../ui/Bars';
import { MoreIcon } from '../ui/icons';
import { Radius } from '../ui/tokens';
import { DRAWING_TOOL_GLYPHS, drawingInkName, drawingToolLabel } from './drawingTools';

type Glyph = (props: { color: string; size?: number }) => ReactElement;

/**
 * The row the editors' icon tabs and actions sit in: the drawing tools here, and the photo
 * editor's adjust tabs and crop actions. Its tools are the kit's `ToolButton`s.
 */
export function ToolTrack({ children, accessibilityRole, style }: {
    children: ReactNode;
    accessibilityRole?: 'tablist';
    style?: StyleProp<ViewStyle>;
}) {
    return <View style={[segmentStyles.track, style]} accessibilityRole={accessibilityRole}>{children}</View>;
}

interface ToolSegmentProps {
    label: string;
    glyph: Glyph;
    onPress: () => void;
    /** `tab` for a tool or a panel to switch to, `button` for an action. */
    role: 'tab' | 'button';
    /** Left out for an action, which has no chosen state. */
    selected?: boolean;
    disabled?: boolean;
    accessibilityLabel?: string;
    /** Something in the top corner, e.g. the dot on an adjustment that has been moved. */
    badge?: ReactNode;
}

/** One icon-and-label tool of a `ToolTrack`: a labelled `ToolButton` that takes an equal share of the row. */
export function ToolSegment({ label, glyph: SegmentGlyph, onPress, role, selected, disabled = false, accessibilityLabel, badge }: ToolSegmentProps) {
    const colors = useThemeColors();
    return (
        <ToolButton
            style={segmentStyles.segment}
            label={label}
            onPress={onPress}
            selected={selected}
            disabled={disabled}
            accessibilityRole={role}
            accessibilityLabel={accessibilityLabel ?? label}
        >
            <SegmentGlyph color={selected ? colors.accent : colors.textSecondary} size={22} />
            {badge}
        </ToolButton>
    );
}

interface DrawingToolbarProps {
    tool: DrawingTool;
    onToolChange: (tool: DrawingBarTool) => void;
    /** Opens the sheet with the arrow, boxes, cover-up and picture. */
    onMorePress: () => void;
    inks: readonly string[];
    color: string;
    onColorChange: (color: string) => void;
    size: DrawingSize;
    onSizeChange: (size: DrawingSize) => void;
    /** Extra space under the bar for the home indicator. */
    bottomInset: number;
}

const BAR_TOOLS: DrawingBarTool[] = ['pen', 'highlighter', 'eraser', 'text'];

/** The pad's two rows: what to draw with, then its colour and size. */
export function DrawingToolbar({
    tool,
    onToolChange,
    onMorePress,
    inks,
    color,
    onColorChange,
    size,
    onSizeChange,
    bottomInset,
}: DrawingToolbarProps) {
    const { l } = useI18n();
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);

    const sizeLabels = tool === 'text' || tool === 'image'
        ? [l('Küçük', 'Small'), l('Orta', 'Medium'), l('Büyük', 'Large')]
        : [l('İnce', 'Thin'), l('Orta', 'Medium'), l('Kalın', 'Thick')];
    // The size buttons preview the result in the ink in hand. White ink would vanish on the light
    // button, so a very light ink is previewed in grey.
    const previewColor = tool === 'eraser' || tool === 'image' || blankCanvasLuminance(color) > 0.85
        ? colors.textMuted
        : color;
    const previewOpacity = tool === 'highlighter' ? Math.max(0.55, HIGHLIGHTER_OPACITY) : 1;

    // The last slot is "More" until one of its tools is in hand; then it shows that tool, so the
    // bar always says what a touch on the page will do.
    const moreTool = (DRAWING_MORE_TOOLS as DrawingTool[]).includes(tool) ? tool : null;
    const moreLabel = moreTool ? drawingToolLabel(moreTool, l) : l('Diğer', 'More');

    const sizePreview = (option: DrawingSize) => {
        if (tool === 'text') {
            return <Text style={[styles.sizeLetter, { color: previewColor, fontSize: 12 + option * 5 }]}>A</Text>;
        }
        if (tool === 'image') {
            const edge = 10 + option * 6;
            return <View style={[styles.sizeBox, { width: edge, height: edge * 0.75, borderColor: previewColor }]} />;
        }
        // A dot as wide as the stroke, kept inside the button.
        const width = drawingToolWidth(tool, option);
        const dot = tool === 'pen' || tool === 'arrow' || tool === 'rect' || tool === 'ellipse'
            ? 5 + width * 1.6
            : Math.min(22, 6 + option * 7);
        return (
            <View style={{ width: dot, height: dot, borderRadius: dot / 2, backgroundColor: previewColor, opacity: previewOpacity }} />
        );
    };

    return (
        <View style={[styles.bar, { paddingBottom: Spacing.sm + bottomInset }]}>
            <ToolTrack accessibilityRole="tablist">
                {BAR_TOOLS.map((id) => (
                    <ToolSegment
                        key={id}
                        role="tab"
                        label={drawingToolLabel(id, l)}
                        glyph={DRAWING_TOOL_GLYPHS[id]}
                        selected={tool === id}
                        onPress={() => onToolChange(id)}
                    />
                ))}
                <ToolSegment
                    role="button"
                    label={moreLabel}
                    glyph={moreTool ? DRAWING_TOOL_GLYPHS[moreTool] : MoreIcon}
                    selected={moreTool !== null}
                    onPress={onMorePress}
                    accessibilityLabel={moreTool
                        ? l(`Diğer araçlar, seçili: ${moreLabel}`, `More tools, selected: ${moreLabel}`)
                        : l('Diğer araçlar', 'More tools')}
                />
            </ToolTrack>

            <View style={styles.row}>
                <View style={styles.swatches}>
                    {inks.map((ink) => {
                        const selected = ink === color;
                        return (
                            <ToolButton
                                key={ink}
                                style={styles.compactTool}
                                selected={selected}
                                onPress={() => onColorChange(ink)}
                                accessibilityLabel={drawingInkName(ink, l)}
                            >
                                <View style={[styles.swatch, { backgroundColor: ink }]} />
                            </ToolButton>
                        );
                    })}
                </View>
                {drawingToolHasSizes(tool) && (
                    <ToolTrack style={styles.sizes}>
                        {DRAWING_SIZES.map((option) => {
                            const selected = option === size;
                            return (
                                <ToolButton
                                    key={option}
                                    selected={selected}
                                    onPress={() => onSizeChange(option)}
                                    accessibilityLabel={sizeLabels[option]}
                                >
                                    {sizePreview(option)}
                                </ToolButton>
                            );
                        })}
                    </ToolTrack>
                )}
            </View>
        </View>
    );
}

const segmentStyles = StyleSheet.create({
    track: { flexDirection: 'row', gap: Spacing.xxs },
    segment: { flex: 1 },
});

function createStyles(colors: ColorScheme) {
    return StyleSheet.create({
        bar: {
            backgroundColor: colors.bgCard,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: colors.border,
            paddingHorizontal: Spacing.md,
            paddingTop: Spacing.sm,
            gap: Spacing.sm,
        },
        row: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: Spacing.sm,
            minHeight: 44,
        },
        swatches: { flexDirection: 'row', alignItems: 'center', flexShrink: 1 },
        // Five inks beside three sizes: on a narrow phone the swatches give way evenly.
        compactTool: { flexShrink: 1 },
        swatch: {
            width: 26,
            height: 26,
            borderRadius: Radius.pill,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: colors.border,
        },
        sizes: { alignItems: 'center', marginLeft: 'auto' },
        sizeLetter: { fontWeight: '600' },
        sizeBox: { borderWidth: 1.6, borderRadius: 2 },
    });
}
