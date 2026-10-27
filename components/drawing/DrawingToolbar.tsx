import { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { BorderRadius, FontSize, Spacing, useThemeColors, type ColorScheme } from '../../constants/theme';
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
import { MoreGlyph } from './drawingGlyphs';
import { DRAWING_TOOL_GLYPHS, drawingToolLabel } from './drawingTools';

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
    // Both palettes run in the same order, so a colour is named by its place in the row.
    const inkNames = tool === 'highlighter'
        ? [l('Sarı', 'Yellow'), l('Yeşil', 'Green'), l('Pembe', 'Pink'), l('Mavi', 'Blue'), l('Turuncu', 'Orange')]
        : [inks[0] === '#ffffff' ? l('Beyaz', 'White') : l('Siyah', 'Black'), l('Mavi', 'Blue'), l('Kırmızı', 'Red'), l('Yeşil', 'Green'), l('Turuncu', 'Orange')];
    // The size buttons preview the result in the ink in hand. White ink would vanish on the light
    // button, so a very light ink is previewed in grey.
    const previewColor = tool === 'eraser' || tool === 'image' || blankCanvasLuminance(color) > 0.85
        ? colors.textMuted
        : color;
    const previewOpacity = tool === 'highlighter' ? Math.max(0.55, HIGHLIGHTER_OPACITY) : 1;

    // The last slot is "More" until one of its tools is in hand; then it shows that tool, so the
    // bar always says what a touch on the page will do.
    const moreTool = (DRAWING_MORE_TOOLS as DrawingTool[]).includes(tool) ? tool : null;
    const MoreSlotGlyph = moreTool ? DRAWING_TOOL_GLYPHS[moreTool] : MoreGlyph;
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
            <View style={styles.segment} accessibilityRole="tablist">
                {BAR_TOOLS.map((id) => {
                    const selected = tool === id;
                    const Glyph = DRAWING_TOOL_GLYPHS[id];
                    const label = drawingToolLabel(id, l);
                    return (
                        <TouchableOpacity
                            key={id}
                            style={[styles.toolButton, selected && styles.toolButtonActive]}
                            onPress={() => onToolChange(id)}
                            accessibilityRole="tab"
                            accessibilityLabel={label}
                            accessibilityState={{ selected }}
                        >
                            <Glyph color={selected ? colors.accent : colors.textSecondary} size={20} />
                            <Text style={[styles.toolLabel, selected && styles.toolLabelActive]} numberOfLines={1}>
                                {label}
                            </Text>
                        </TouchableOpacity>
                    );
                })}
                <TouchableOpacity
                    style={[styles.toolButton, moreTool && styles.toolButtonActive]}
                    onPress={onMorePress}
                    accessibilityRole="button"
                    accessibilityLabel={moreTool
                        ? l(`Diğer araçlar, seçili: ${moreLabel}`, `More tools, selected: ${moreLabel}`)
                        : l('Diğer araçlar', 'More tools')}
                    accessibilityState={{ selected: moreTool !== null }}
                >
                    <MoreSlotGlyph color={moreTool ? colors.accent : colors.textSecondary} size={20} />
                    <Text style={[styles.toolLabel, moreTool && styles.toolLabelActive]} numberOfLines={1}>
                        {moreLabel}
                    </Text>
                </TouchableOpacity>
            </View>

            <View style={styles.row}>
                <View style={styles.swatches}>
                    {inks.map((ink, index) => {
                        const selected = ink === color;
                        return (
                            <TouchableOpacity
                                key={ink}
                                style={[styles.swatchRing, selected && { borderColor: colors.accent }]}
                                onPress={() => onColorChange(ink)}
                                accessibilityRole="button"
                                accessibilityLabel={inkNames[index] ?? ink}
                                accessibilityState={{ selected }}
                            >
                                <View style={[styles.swatch, { backgroundColor: ink }]} />
                            </TouchableOpacity>
                        );
                    })}
                </View>
                {drawingToolHasSizes(tool) && (
                    <View style={styles.sizes}>
                        {DRAWING_SIZES.map((option) => {
                            const selected = option === size;
                            return (
                                <TouchableOpacity
                                    key={option}
                                    style={[styles.sizeButton, selected && styles.sizeButtonActive]}
                                    onPress={() => onSizeChange(option)}
                                    accessibilityRole="button"
                                    accessibilityLabel={sizeLabels[option]}
                                    accessibilityState={{ selected }}
                                >
                                    {sizePreview(option)}
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                )}
            </View>
        </View>
    );
}

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
        segment: {
            flexDirection: 'row',
            backgroundColor: colors.bgInput,
            borderRadius: BorderRadius.md,
            padding: 3,
            gap: 2,
        },
        toolButton: {
            flex: 1,
            minHeight: 46,
            paddingHorizontal: 2,
            borderRadius: BorderRadius.sm,
            alignItems: 'center',
            justifyContent: 'center',
            gap: 2,
            borderWidth: 1,
            borderColor: 'transparent',
        },
        toolButtonActive: {
            backgroundColor: colors.bgCard,
            borderColor: colors.accent,
        },
        toolLabel: { fontSize: FontSize.xs, fontWeight: '600', color: colors.textSecondary },
        toolLabelActive: { color: colors.accent },
        swatches: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 },
        swatchRing: {
            width: 36,
            height: 36,
            borderRadius: 18,
            borderWidth: 2,
            borderColor: 'transparent',
            alignItems: 'center',
            justifyContent: 'center',
        },
        swatch: {
            width: 26,
            height: 26,
            borderRadius: 13,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: colors.border,
        },
        sizes: {
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: colors.bgInput,
            borderRadius: BorderRadius.md,
            padding: 3,
            gap: 2,
            marginLeft: 'auto',
        },
        sizeButton: {
            width: 36,
            height: 36,
            borderRadius: BorderRadius.sm,
            alignItems: 'center',
            justifyContent: 'center',
        },
        sizeButtonActive: {
            backgroundColor: colors.bgCard,
            borderWidth: 1,
            borderColor: colors.accent,
        },
        sizeLetter: { fontWeight: '700' },
        sizeBox: { borderWidth: 1.6, borderRadius: 2 },
    });
}
