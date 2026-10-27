import { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { BorderRadius, FontSize, Spacing, useThemeColors, type ColorScheme } from '../../constants/theme';
import { useI18n } from '../../hooks/useI18n';
import {
    DRAWING_SIZES,
    HIGHLIGHTER_OPACITY,
    drawingToolWidth,
    type DrawingSize,
    type DrawingTool,
} from '../../lib/drawingPad';
import { blankCanvasLuminance } from '../../lib/blankCanvas';
import { ClearGlyph, EraserGlyph, HighlighterGlyph, PenGlyph, RedoGlyph, UndoGlyph } from './drawingGlyphs';

interface DrawingToolbarProps {
    tool: DrawingTool;
    onToolChange: (tool: DrawingTool) => void;
    inks: readonly string[];
    color: string;
    onColorChange: (color: string) => void;
    size: DrawingSize;
    onSizeChange: (size: DrawingSize) => void;
    canUndo: boolean;
    canRedo: boolean;
    canClear: boolean;
    onUndo: () => void;
    onRedo: () => void;
    onClear: () => void;
    /** Extra space under the bar for the home indicator. */
    bottomInset: number;
}

/** The pad's two rows: what to draw with, then its colour and size. */
export function DrawingToolbar({
    tool,
    onToolChange,
    inks,
    color,
    onColorChange,
    size,
    onSizeChange,
    canUndo,
    canRedo,
    canClear,
    onUndo,
    onRedo,
    onClear,
    bottomInset,
}: DrawingToolbarProps) {
    const { l } = useI18n();
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);

    const tools: { id: DrawingTool; label: string; Glyph: typeof PenGlyph }[] = [
        { id: 'pen', label: l('Kalem', 'Pen'), Glyph: PenGlyph },
        { id: 'highlighter', label: l('Fosforlu', 'Highlighter'), Glyph: HighlighterGlyph },
        { id: 'eraser', label: l('Silgi', 'Eraser'), Glyph: EraserGlyph },
    ];
    const sizeLabels = [l('İnce', 'Thin'), l('Orta', 'Medium'), l('Kalın', 'Thick')];
    // Both palettes run in the same order, so a colour is named by its place in the row.
    const inkNames = tool === 'highlighter'
        ? [l('Sarı', 'Yellow'), l('Yeşil', 'Green'), l('Pembe', 'Pink'), l('Mavi', 'Blue'), l('Turuncu', 'Orange')]
        : [inks[0] === '#ffffff' ? l('Beyaz', 'White') : l('Siyah', 'Black'), l('Mavi', 'Blue'), l('Kırmızı', 'Red'), l('Yeşil', 'Green'), l('Turuncu', 'Orange')];
    // The size dots preview the stroke itself: its colour, and a thickness that grows with it.
    // White ink would vanish on the light button, so a very light ink is previewed in grey.
    const previewColor = tool === 'eraser' || blankCanvasLuminance(color) > 0.85 ? colors.textMuted : color;
    const previewOpacity = tool === 'highlighter' ? Math.max(0.55, HIGHLIGHTER_OPACITY) : 1;

    const iconButton = (
        label: string,
        enabled: boolean,
        onPress: () => void,
        Glyph: typeof UndoGlyph,
    ) => (
        <TouchableOpacity
            style={[styles.iconButton, !enabled && styles.disabled]}
            onPress={onPress}
            disabled={!enabled}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{ disabled: !enabled }}
        >
            <Glyph color={colors.textPrimary} />
        </TouchableOpacity>
    );

    return (
        <View style={[styles.bar, { paddingBottom: Spacing.sm + bottomInset }]}>
            <View style={styles.row}>
                <View style={styles.segment} accessibilityRole="tablist">
                    {tools.map(({ id, label, Glyph }) => {
                        const selected = tool === id;
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
                </View>
                <View style={styles.history}>
                    {iconButton(l('Geri al', 'Undo'), canUndo, onUndo, UndoGlyph)}
                    {iconButton(l('Yinele', 'Redo'), canRedo, onRedo, RedoGlyph)}
                    {iconButton(l('Sayfayı temizle', 'Clear page'), canClear, onClear, ClearGlyph)}
                </View>
            </View>

            <View style={styles.row}>
                {inks.length > 0 ? (
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
                ) : (
                    <Text style={styles.hint} numberOfLines={2}>
                        {l('Silmek istediğiniz yerin üzerinden geçin', 'Rub over what you want to erase')}
                    </Text>
                )}
                <View style={styles.sizes}>
                    {DRAWING_SIZES.map((option) => {
                        const selected = option === size;
                        // The dot is the stroke's width, kept inside the 32-point button.
                        const width = drawingToolWidth(tool, option);
                        const dot = tool === 'pen'
                            ? 5 + width * 1.6
                            : Math.min(22, 6 + option * 7);
                        return (
                            <TouchableOpacity
                                key={option}
                                style={[styles.sizeButton, selected && styles.sizeButtonActive]}
                                onPress={() => onSizeChange(option)}
                                accessibilityRole="button"
                                accessibilityLabel={sizeLabels[option]}
                                accessibilityState={{ selected }}
                            >
                                <View
                                    style={{
                                        width: dot,
                                        height: dot,
                                        borderRadius: dot / 2,
                                        backgroundColor: previewColor,
                                        opacity: previewOpacity,
                                    }}
                                />
                            </TouchableOpacity>
                        );
                    })}
                </View>
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
            minWidth: 62,
            minHeight: 44,
            paddingHorizontal: 6,
            borderRadius: BorderRadius.sm,
            alignItems: 'center',
            justifyContent: 'center',
            gap: 2,
        },
        toolButtonActive: {
            backgroundColor: colors.bgCard,
            borderWidth: 1,
            borderColor: colors.accent,
        },
        toolLabel: { fontSize: FontSize.xs, fontWeight: '600', color: colors.textSecondary },
        toolLabelActive: { color: colors.accent },
        history: { flexDirection: 'row', alignItems: 'center' },
        iconButton: {
            width: 40,
            height: 44,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: BorderRadius.sm,
        },
        disabled: { opacity: 0.3 },
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
        hint: { flex: 1, fontSize: FontSize.sm, color: colors.textMuted },
        sizes: {
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: colors.bgInput,
            borderRadius: BorderRadius.md,
            padding: 3,
            gap: 2,
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
    });
}
