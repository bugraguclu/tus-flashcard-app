import { useMemo } from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { BorderRadius, FontSize, Shadows, Spacing, useThemeColors, type ColorScheme } from '../../constants/theme';
import { useI18n } from '../../hooks/useI18n';
import { DRAWING_MORE_TOOLS, type DrawingShapeTool, type DrawingTool } from '../../lib/drawingPad';
import SwipeDismissSheet from '../SwipeDismissSheet';
import { DRAWING_TOOL_GLYPHS, drawingToolLabel } from './drawingTools';

interface MoreToolsSheetProps {
    visible: boolean;
    /** The tool in hand, marked in the list. */
    tool: DrawingTool;
    onPick: (tool: DrawingShapeTool | 'image') => void;
    onClose: () => void;
}

/** The tools that do not fit on the bar: arrow, boxes, cover-up and a picture from the library. */
export function MoreToolsSheet({ visible, tool, onPick, onClose }: MoreToolsSheetProps) {
    const { t, l } = useI18n();
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);

    const captions: Partial<Record<DrawingTool, string>> = {
        cover: l('Bir yeri dolu bir kutuyla kapatır', 'Hides an area under a solid box'),
        image: l('Galeriden bir görsel ekler', 'Adds a picture from the library'),
    };

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <View style={styles.overlay}>
                <Pressable
                    style={StyleSheet.absoluteFill}
                    onPress={onClose}
                    accessibilityLabel={l('Diğer araçları kapat', 'Close more tools')}
                />
                <SwipeDismissSheet active={visible} style={styles.sheet} onDismiss={onClose}>
                    <Text style={styles.title}>{l('Diğer araçlar', 'More Tools')}</Text>
                    {DRAWING_MORE_TOOLS.map((id) => {
                        const Glyph = DRAWING_TOOL_GLYPHS[id];
                        const label = id === 'image' ? l('Görsel ekle', 'Add Picture') : drawingToolLabel(id, l);
                        const selected = tool === id;
                        const caption = captions[id];
                        return (
                            <TouchableOpacity
                                key={id}
                                style={styles.row}
                                onPress={() => onPick(id)}
                                accessibilityRole="button"
                                accessibilityLabel={label}
                                accessibilityState={{ selected }}
                            >
                                <View style={[styles.iconWrap, selected && styles.iconWrapActive]}>
                                    <Glyph color={selected ? colors.accent : colors.textPrimary} size={22} />
                                </View>
                                <View style={styles.copy}>
                                    <Text style={[styles.label, selected && styles.labelActive]}>{label}</Text>
                                    {caption ? <Text style={styles.caption}>{caption}</Text> : null}
                                </View>
                            </TouchableOpacity>
                        );
                    })}
                    <TouchableOpacity style={styles.cancelRow} onPress={onClose} accessibilityRole="button">
                        <Text style={styles.cancelText}>{t('common.cancel')}</Text>
                    </TouchableOpacity>
                </SwipeDismissSheet>
            </View>
        </Modal>
    );
}

function createStyles(colors: ColorScheme) {
    return StyleSheet.create({
        overlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.35)', justifyContent: 'flex-end' },
        sheet: {
            backgroundColor: colors.bgCard,
            borderTopLeftRadius: BorderRadius.lg,
            borderTopRightRadius: BorderRadius.lg,
            paddingHorizontal: Spacing.lg,
            paddingTop: 44,
            paddingBottom: 32,
            ...Shadows.lg,
        },
        title: { fontSize: FontSize.lg, fontWeight: '700', color: colors.textPrimary, marginBottom: Spacing.sm },
        row: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: Spacing.md,
            minHeight: 56,
            paddingVertical: Spacing.sm,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: colors.borderLight,
        },
        iconWrap: {
            width: 40,
            height: 40,
            borderRadius: BorderRadius.md,
            backgroundColor: colors.bgInput,
            alignItems: 'center',
            justifyContent: 'center',
        },
        iconWrapActive: { backgroundColor: colors.accentLight },
        copy: { flex: 1, gap: 2 },
        label: { fontSize: FontSize.md, color: colors.textPrimary, fontWeight: '600' },
        labelActive: { color: colors.accent },
        caption: { fontSize: FontSize.sm, color: colors.textMuted },
        cancelRow: { minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: Spacing.xs },
        cancelText: { color: colors.textMuted, fontWeight: '600' },
    });
}
