import type { Dispatch, SetStateAction } from 'react';
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import type { ColorScheme } from '../../constants/theme';
import type { PhotoAnnotation, PhotoCropRect, PhotoEraserMode } from '../../lib/photoEditor';
import {
    DRAW_COLORS,
    ERASER_MODES,
    ERASER_RADII,
    FONT_SIZES,
    WIDTHS,
    type EditorHistoryState,
    type EditorPage,
    type EditorTool,
    type PhotoEditorI18n,
} from './editorModel';
import type { PhotoEditorStyles } from './photoEditorStyles';

interface EditorControlsProps {
    visibleToolItems: { id: EditorTool; icon: string; label: string }[];
    tool: EditorTool;
    chooseTool: (tool: EditorTool) => void;
    rotate: () => void;
    rotating: boolean;
    cropping: boolean;
    imageReady: boolean;
    page: EditorPage | null;
    setPageSheet: Dispatch<SetStateAction<boolean>>;
    aspectOptions: { id: string; label: string; value: number }[];
    cropAspect: string;
    selectCropAspect: (id: string, value: number) => void;
    setTool: Dispatch<SetStateAction<EditorTool>>;
    setCropBox: Dispatch<SetStateAction<PhotoCropRect>>;
    setCropAspect: Dispatch<SetStateAction<string>>;
    applyCrop: () => void;
    eraserMode: PhotoEraserMode;
    setEraserMode: Dispatch<SetStateAction<PhotoEraserMode>>;
    eraserRadius: number;
    setEraserRadius: Dispatch<SetStateAction<number>>;
    undo: () => void;
    redo: () => void;
    undoStack: EditorHistoryState[];
    redoStack: EditorHistoryState[];
    annotations: PhotoAnnotation[];
    commitAnnotations: (next: PhotoAnnotation[]) => void;
    color: string;
    updateColor: (color: string) => void;
    fontSize: number;
    strokeWidth: number;
    updateSize: (size: number) => void;
    colors: ColorScheme;
    styles: PhotoEditorStyles;
    l: PhotoEditorI18n['l'];
    t: PhotoEditorI18n['t'];
}

/** The panel under the canvas: the tools, then the options for the tool in hand. */
export function EditorControls({
    visibleToolItems,
    tool,
    chooseTool,
    rotate,
    rotating,
    cropping,
    imageReady,
    page,
    setPageSheet,
    aspectOptions,
    cropAspect,
    selectCropAspect,
    setTool,
    setCropBox,
    setCropAspect,
    applyCrop,
    eraserMode,
    setEraserMode,
    eraserRadius,
    setEraserRadius,
    undo,
    redo,
    undoStack,
    redoStack,
    annotations,
    commitAnnotations,
    color,
    updateColor,
    fontSize,
    strokeWidth,
    updateSize,
    colors,
    styles,
    l,
    t,
}: EditorControlsProps) {
    return (
        <View style={styles.controls}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.toolList}>
                {visibleToolItems.map((item) => (
                    <TouchableOpacity
                        key={item.id}
                        style={[styles.toolButton, tool === item.id && styles.toolButtonActive]}
                        onPress={() => chooseTool(item.id)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: tool === item.id }}
                        accessibilityLabel={item.label}
                    >
                        <Text style={[styles.toolIcon, item.id === 'text' && styles.textToolIcon]}>{item.icon}</Text>
                        <Text style={[styles.toolLabel, tool === item.id && styles.toolLabelActive]}>{item.label}</Text>
                    </TouchableOpacity>
                ))}
                <TouchableOpacity
                    style={styles.toolButton}
                    onPress={rotate}
                    disabled={rotating || cropping || !imageReady}
                    accessibilityRole="button"
                    accessibilityLabel={l('Saat yönünde döndür', 'Rotate clockwise')}
                >
                    {rotating ? <ActivityIndicator size="small" color={colors.accent} /> : <Text style={styles.toolIcon}>↻</Text>}
                    <Text style={styles.toolLabel}>{l('Döndür', 'Rotate')}</Text>
                </TouchableOpacity>
                {page && (
                    <TouchableOpacity
                        style={styles.toolButton}
                        onPress={() => setPageSheet(true)}
                        accessibilityRole="button"
                        accessibilityLabel={l('Kağıt ve zemin rengini değiştir', 'Change paper and page colour')}
                    >
                        <Text style={styles.toolIcon}>▤</Text>
                        <Text style={styles.toolLabel}>{l('Kağıt', 'Paper')}</Text>
                    </TouchableOpacity>
                )}
            </ScrollView>

            {tool === 'crop' ? (
                <View style={styles.cropControlsContainer}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cropAspectList}>
                        {aspectOptions.map((opt) => (
                            <TouchableOpacity
                                key={opt.id}
                                style={[styles.cropAspectBtn, cropAspect === opt.id && styles.cropAspectBtnActive]}
                                onPress={() => selectCropAspect(opt.id, opt.value)}
                                accessibilityRole="button"
                                accessibilityLabel={opt.label}
                            >
                                <Text style={[styles.cropAspectLabel, cropAspect === opt.id && styles.cropAspectLabelActive]}>
                                    {opt.label}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                    <View style={styles.cropActionRow}>
                        <TouchableOpacity
                            style={styles.cropCancelBtn}
                            onPress={() => {
                                setTool('pen');
                                setCropBox({ x: 0, y: 0, width: 1, height: 1 });
                                setCropAspect('free');
                            }}
                            accessibilityRole="button"
                            accessibilityLabel={l('Kırpmayı iptal et', 'Cancel crop')}
                        >
                            <Text style={styles.cropCancelText}>{t('common.cancel')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.cropResetBtn}
                            onPress={() => {
                                setCropBox({ x: 0, y: 0, width: 1, height: 1 });
                                setCropAspect('free');
                            }}
                            accessibilityRole="button"
                            accessibilityLabel={l('Kırpmayı sıfırla', 'Reset crop')}
                        >
                            <Text style={styles.cropResetText}>{l('Sıfırla', 'Reset')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.cropApplyBtn}
                            onPress={applyCrop}
                            disabled={cropping}
                            accessibilityRole="button"
                            accessibilityLabel={l('Kırpmayı uygula', 'Apply crop')}
                        >
                            {cropping ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.cropApplyText}>{l('Kırp', 'Crop')}</Text>}
                        </TouchableOpacity>
                    </View>
                </View>
            ) : tool === 'eraser' ? (
                <View style={styles.optionsRow}>
                    <View style={styles.eraserModeGroup} accessibilityRole="radiogroup">
                        {ERASER_MODES.map((option) => {
                            const isSelected = eraserMode === option.id;
                            return (
                                <TouchableOpacity
                                    key={option.id}
                                    style={[styles.eraserModeButton, isSelected && styles.eraserModeButtonActive]}
                                    onPress={() => setEraserMode(option.id)}
                                    accessibilityRole="radio"
                                    accessibilityState={{ selected: isSelected }}
                                    accessibilityLabel={option.id === 'partial'
                                        ? l('Kısmi silgi: sadece dokunduğun yeri siler', 'Partial eraser: rubs out only what you touch')
                                        : l('Tam silgi: dokunduğun çizimin tamamını siler', 'Whole eraser: removes the entire annotation')}
                                >
                                    <Text style={[styles.eraserModeText, isSelected && styles.eraserModeTextActive]}>
                                        {option.id === 'partial' ? l('Kısmi', 'Partial') : l('Tümü', 'Whole')}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                    <View style={styles.sizeGroup}>
                        {ERASER_RADII.map((radius) => {
                            const isSelected = eraserRadius === radius;
                            return (
                                <TouchableOpacity
                                    key={radius}
                                    style={[styles.sizeButton, isSelected && styles.sizeButtonActive]}
                                    onPress={() => setEraserRadius(radius)}
                                    accessibilityRole="button"
                                    accessibilityLabel={l(
                                        radius === ERASER_RADII[0] ? 'Küçük silgi ucu' : radius === ERASER_RADII[2] ? 'Büyük silgi ucu' : 'Orta silgi ucu',
                                        radius === ERASER_RADII[0] ? 'Small eraser tip' : radius === ERASER_RADII[2] ? 'Large eraser tip' : 'Medium eraser tip',
                                    )}
                                >
                                    <View style={[
                                        styles.sizeDot,
                                        {
                                            width: radius / 1.6,
                                            height: radius / 1.6,
                                            backgroundColor: isSelected ? colors.accent : colors.textPrimary,
                                        },
                                    ]} />
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                    <TouchableOpacity
                        style={styles.historyButton}
                        onPress={undo}
                        disabled={!undoStack.length}
                        accessibilityRole="button"
                        accessibilityLabel={l('Geri al', 'Undo')}
                    >
                        <Text style={[styles.historyIcon, !undoStack.length && styles.disabledText]}>↶</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={styles.historyButton}
                        onPress={redo}
                        disabled={!redoStack.length}
                        accessibilityRole="button"
                        accessibilityLabel={l('Yinele', 'Redo')}
                    >
                        <Text style={[styles.historyIcon, !redoStack.length && styles.disabledText]}>↷</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={styles.historyButton}
                        onPress={() => commitAnnotations([])}
                        disabled={!annotations.length}
                        accessibilityRole="button"
                        accessibilityLabel={l('Tüm düzenlemeleri temizle', 'Clear all edits')}
                    >
                        <Text style={[styles.historyIcon, !annotations.length && styles.disabledText]}>🗑</Text>
                    </TouchableOpacity>
                </View>
            ) : (
                <View style={styles.optionsRow}>
                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        style={styles.colorScroll}
                        contentContainerStyle={styles.colorList}
                    >
                        {DRAW_COLORS.map((itemColor) => (
                            <TouchableOpacity
                                key={itemColor}
                                style={[styles.colorButton, color === itemColor && styles.colorButtonActive]}
                                onPress={() => updateColor(itemColor)}
                                accessibilityRole="button"
                                accessibilityLabel={l(`Renk ${itemColor}`, `Color ${itemColor}`)}
                            >
                                <View style={[styles.colorDot, { backgroundColor: itemColor }]} />
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                    <View style={styles.sizeGroup}>
                        {(tool === 'text' ? FONT_SIZES : WIDTHS).map((size) => (
                            <TouchableOpacity
                                key={size}
                                style={[
                                    styles.sizeButton,
                                    (tool === 'text' ? fontSize === size : strokeWidth === size) && styles.sizeButtonActive,
                                ]}
                                onPress={() => updateSize(size)}
                                accessibilityRole="button"
                                accessibilityLabel={l(`Boyut ${size}`, `Size ${size}`)}
                            >
                                <View style={[
                                    styles.sizeDot,
                                    {
                                        width: tool === 'text' ? Math.max(7, size / 3) : Math.max(6, size * 1.1),
                                        height: tool === 'text' ? Math.max(7, size / 3) : Math.max(6, size * 1.1),
                                        backgroundColor: colors.textPrimary,
                                    },
                                ]} />
                            </TouchableOpacity>
                        ))}
                    </View>
                    <TouchableOpacity
                        style={styles.historyButton}
                        onPress={undo}
                        disabled={!undoStack.length}
                        accessibilityRole="button"
                        accessibilityLabel={l('Geri al', 'Undo')}
                    >
                        <Text style={[styles.historyIcon, !undoStack.length && styles.disabledText]}>↶</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={styles.historyButton}
                        onPress={redo}
                        disabled={!redoStack.length}
                        accessibilityRole="button"
                        accessibilityLabel={l('Yinele', 'Redo')}
                    >
                        <Text style={[styles.historyIcon, !redoStack.length && styles.disabledText]}>↷</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={styles.historyButton}
                        onPress={() => commitAnnotations([])}
                        disabled={!annotations.length}
                        accessibilityRole="button"
                        accessibilityLabel={l('Tüm düzenlemeleri temizle', 'Clear all edits')}
                    >
                        <Text style={[styles.historyIcon, !annotations.length && styles.disabledText]}>🗑</Text>
                    </TouchableOpacity>
                </View>
            )}
        </View>
    );
}
