import { useMemo, type ReactElement, type ReactNode } from 'react';
import { StyleSheet, TouchableOpacity, View, type StyleProp, type ViewStyle } from 'react-native';
import { Text } from '../AppText';
import { FontSize, Spacing, useThemeColors, type ColorScheme } from '../../constants/theme';
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
import { MoreIcon } from '../ui/icons';
import { DISABLED_OPACITY, Radius } from '../ui/tokens';
import { ROW_LABEL_FIT } from '../photo-editor/editorModel';
import { DRAWING_TOOL_GLYPHS, drawingInkName, drawingToolLabel } from './drawingTools';

type Glyph = (props: { color: string; size?: number }) => ReactElement;

/**
 * The grey track the editors' icon tabs and actions sit on: the drawing tools here, and the photo
 * editor's adjust tabs and crop actions. The segments carry glyphs, which `SegmentedControl` does
 * not draw, so they share this one look instead.
 */
export function ToolTrack({ children, accessibilityRole, style }: {
    children: ReactNode;
    accessibilityRole?: 'tablist';
    style?: StyleProp<ViewStyle>;
}) {
    const colors = useThemeColors();
    return (
        <View style={[segmentStyles.track, { backgroundColor: colors.bgInput }, style]} accessibilityRole={accessibilityRole}>
            {children}
        </View>
    );
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

/** One icon-and-label segment of a `ToolTrack`; the chosen one is raised and edged in the accent. */
export function ToolSegment({ label, glyph: SegmentGlyph, onPress, role, selected, disabled = false, accessibilityLabel, badge }: ToolSegmentProps) {
    const colors = useThemeColors();
    const tint = selected ? colors.accent : colors.textSecondary;
    return (
        <TouchableOpacity
            style={[
                segmentStyles.segment,
                selected
                    ? { backgroundColor: colors.segmentSelected, borderColor: colors.accent }
                    : { borderColor: colors.transparent },
                disabled && segmentStyles.disabled,
            ]}
            onPress={onPress}
            disabled={disabled}
            accessibilityRole={role}
            accessibilityLabel={accessibilityLabel ?? label}
            accessibilityState={selected === undefined ? { disabled } : { selected, disabled }}
        >
            <SegmentGlyph color={tint} size={20} />
            <Text style={[segmentStyles.label, { color: tint }]} {...ROW_LABEL_FIT}>{label}</Text>
            {badge}
        </TouchableOpacity>
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
/**
 * The 36-point swatches and size buttons reach the 44-point height through their slop, and spread
 * sideways into the gaps between them without reaching a neighbour.
 */
const SWATCH_SLOP = { top: 4, bottom: 4, left: 2, right: 2 };
const SIZE_SLOP = { top: 4, bottom: 4, left: 1, right: 1 };

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
        // A dot as wide as the stroke, kept inside the 36-point button.
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
                            <TouchableOpacity
                                key={ink}
                                style={[styles.swatchRing, { borderColor: selected ? colors.accent : colors.transparent }]}
                                onPress={() => onColorChange(ink)}
                                hitSlop={SWATCH_SLOP}
                                accessibilityRole="button"
                                accessibilityLabel={drawingInkName(ink, l)}
                                accessibilityState={{ selected }}
                            >
                                <View style={[styles.swatch, { backgroundColor: ink }]} />
                            </TouchableOpacity>
                        );
                    })}
                </View>
                {drawingToolHasSizes(tool) && (
                    <ToolTrack style={styles.sizes}>
                        {DRAWING_SIZES.map((option) => {
                            const selected = option === size;
                            return (
                                <TouchableOpacity
                                    key={option}
                                    style={[
                                        styles.sizeButton,
                                        selected
                                            ? { backgroundColor: colors.segmentSelected, borderColor: colors.accent }
                                            : { borderColor: colors.transparent },
                                    ]}
                                    onPress={() => onSizeChange(option)}
                                    hitSlop={SIZE_SLOP}
                                    accessibilityRole="button"
                                    accessibilityLabel={sizeLabels[option]}
                                    accessibilityState={{ selected }}
                                >
                                    {sizePreview(option)}
                                </TouchableOpacity>
                            );
                        })}
                    </ToolTrack>
                )}
            </View>
        </View>
    );
}

const segmentStyles = StyleSheet.create({
    track: { flexDirection: 'row', borderRadius: Radius.inset, padding: 3, gap: 2 },
    segment: {
        flex: 1,
        minHeight: 46,
        paddingHorizontal: 2,
        borderRadius: Radius.inset - 2,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
    },
    label: { fontSize: FontSize.xs, fontWeight: '600' },
    disabled: { opacity: DISABLED_OPACITY },
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
        swatches: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 },
        swatchRing: {
            width: 36,
            height: 36,
            borderRadius: Radius.pill,
            borderWidth: 2,
            alignItems: 'center',
            justifyContent: 'center',
        },
        swatch: {
            width: 26,
            height: 26,
            borderRadius: Radius.pill,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: colors.border,
        },
        sizes: { alignItems: 'center', marginLeft: 'auto' },
        sizeButton: {
            width: 36,
            height: 36,
            borderRadius: Radius.inset - 2,
            borderWidth: 1,
            alignItems: 'center',
            justifyContent: 'center',
        },
        sizeLetter: { fontWeight: '700' },
        sizeBox: { borderWidth: 1.6, borderRadius: 2 },
    });
}
