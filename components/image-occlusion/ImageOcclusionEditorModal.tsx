import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Ellipse, Path, Polygon, Rect } from 'react-native-svg';
import { useThemeColors } from '../../constants/theme';
import { useI18n } from '../../hooks/useI18n';
import { confirmAsync } from '../../lib/confirm';
import {
    OCCLUSION_DEFAULT_TEXT_PIXELS,
    createOcclusionShape,
    formatOcclusionNumber,
    groupOcclusionShapes,
    moveOcclusionShape,
    nextOcclusionOrdinal,
    occludesInactive,
    occlusionGeometry,
    parseOcclusionField,
    resizeOcclusionShape,
    serializeOcclusionField,
    setOccludesInactive,
    ungroupOcclusionShapes,
    withOcclusionProperties,
    type OcclusionShape,
} from '../../lib/imageOcclusion';
import OcclusionCanvas from './OcclusionCanvas';
import { createOcclusionEditorStyles } from './occlusionEditorStyles';
import type { OcclusionTool, Point, Size } from './occlusionEditorModel';

interface Props {
    visible: boolean;
    uri: string;
    natural: Size;
    /** The note's Occlusion field as it stands. */
    occlusion: string;
    onCancel: () => void;
    /** The new Occlusion field; the field passed in, unchanged, when nothing was edited. */
    onDone: (occlusion: string) => void;
}

interface History { past: OcclusionShape[][]; future: OcclusionShape[][] }

const TOOLS: OcclusionTool[] = ['select', 'rect', 'ellipse', 'polygon', 'text'];

/**
 * Anki's mask editor for an Image Occlusion note, offline: draw rectangles, ellipses, polygons and
 * text labels over the picture, group masks into one question, and choose whether the other masks
 * stay hidden while one is asked. Shapes keep Anki's text form (lib/imageOcclusion.ts); a shape
 * left alone is written back exactly as it was read.
 */
export default function ImageOcclusionEditorModal({ visible, uri, natural, occlusion, onCancel, onDone }: Props) {
    const { l } = useI18n();
    const colors = useThemeColors();
    const styles = useMemo(() => createOcclusionEditorStyles(colors), [colors]);
    const [shapes, setShapes] = useState<OcclusionShape[]>([]);
    const [history, setHistory] = useState<History>({ past: [], future: [] });
    const [hideAll, setHideAll] = useState(true);
    const [tool, setTool] = useState<OcclusionTool>('rect');
    const [selected, setSelected] = useState<Set<number>>(new Set());
    const [multiSelect, setMultiSelect] = useState(false);
    const [polygon, setPolygon] = useState<Point[]>([]);
    const [textPrompt, setTextPrompt] = useState<{ at?: Point; index?: number; value: string } | null>(null);
    const initialRef = useRef('');

    useEffect(() => {
        if (!visible) return;
        const read = parseOcclusionField(occlusion);
        initialRef.current = serializeOcclusionField(read);
        setShapes(read);
        setHistory({ past: [], future: [] });
        // A new note starts in Anki's default, "hide all, guess one".
        setHideAll(read.length ? occludesInactive(read) : true);
        setTool(read.length ? 'select' : 'rect');
        setSelected(new Set());
        setMultiSelect(false);
        setPolygon([]);
        setTextPrompt(null);
    }, [visible, occlusion]);

    const commit = (next: OcclusionShape[], nextSelection?: Set<number>) => {
        setHistory((current) => ({ past: [...current.past, shapes], future: [] }));
        setShapes(next);
        if (nextSelection) setSelected(nextSelection);
    };

    const step = (direction: 'undo' | 'redo') => {
        const from = direction === 'undo' ? history.past : history.future;
        if (!from.length) return;
        const target = from[from.length - 1];
        setHistory(direction === 'undo'
            ? { past: history.past.slice(0, -1), future: [...history.future, shapes] }
            : { past: [...history.past, shapes], future: history.future.slice(0, -1) });
        setShapes(target);
        setSelected(new Set());
    };

    const masks = shapes.filter((shape) => shape.kind !== 'text');
    const cardCount = new Set(masks.map((shape) => shape.ordinal).filter((ordinal) => ordinal > 0)).size;
    const selectedShapes = [...selected].map((index) => shapes[index]).filter(Boolean);
    const selectedMasks = selectedShapes.filter((shape) => shape.kind !== 'text');
    const selectedOrdinals = new Set(selectedMasks.map((shape) => shape.ordinal));
    const canGroup = selectedOrdinals.size > 1;
    const canUngroup = selectedMasks.some((shape) => shapes.filter((other) => other.ordinal === shape.ordinal).length > 1);
    const singleText = selectedShapes.length === 1 && selectedShapes[0].kind === 'text' ? [...selected][0] : -1;

    const changeTool = (next: OcclusionTool) => {
        setTool(next);
        setPolygon([]);
        if (next !== 'select') setSelected(new Set());
    };

    const finishPolygon = (points: Point[]) => {
        setPolygon([]);
        if (points.length < 3) return;
        const left = Math.min(...points.map((p) => p.x));
        const top = Math.min(...points.map((p) => p.y));
        const shape = createOcclusionShape({ kind: 'polygon', left, top, points: points.map((p) => [p.x, p.y]), angle: 0 }, nextOcclusionOrdinal(shapes), hideAll);
        commit([...shapes, shape], new Set([shapes.length]));
    };

    const saveText = () => {
        const prompt = textPrompt;
        setTextPrompt(null);
        if (!prompt) return;
        const text = prompt.value.replace(/\r\n?/g, '\n');
        if (prompt.index !== undefined) {
            const current = shapes[prompt.index];
            if (!current) return;
            if (!text.trim()) {
                commit(shapes.filter((_, index) => index !== prompt.index), new Set());
                return;
            }
            const next = withOcclusionProperties(current, { text });
            if (next !== current) commit(shapes.map((shape, index) => (index === prompt.index ? next : shape)));
            return;
        }
        if (!prompt.at || !text.trim()) return;
        // Anki's editor writes a new label 40 image pixels tall, as a fraction of the image height.
        const fs = OCCLUSION_DEFAULT_TEXT_PIXELS / Math.max(1, natural.height);
        const shape = createOcclusionShape({ kind: 'text', left: prompt.at.x, top: prompt.at.y, text, scale: 1, fs, angle: 0 }, 0, hideAll);
        commit([...shapes, shape], new Set([shapes.length]));
    };

    const scaleText = (factor: number) => {
        const shape = shapes[singleText];
        const geometry = shape ? occlusionGeometry(shape) : null;
        if (!geometry || geometry.kind !== 'text') return;
        const scale = Math.min(8, Math.max(0.25, geometry.scale * factor));
        commit(shapes.map((entry, index) => (index === singleText ? withOcclusionProperties(entry, { scale: formatOcclusionNumber(scale) }) : entry)));
    };

    const deleteSelection = () => {
        commit(shapes.filter((_, index) => !selected.has(index)), new Set());
    };

    const changeMode = (next: boolean) => {
        setHideAll(next);
        const updated = setOccludesInactive(shapes, next);
        if (updated.some((shape, index) => shape !== shapes[index])) commit(updated);
    };

    const finish = () => {
        const written = serializeOcclusionField(shapes);
        onDone(written === initialRef.current ? occlusion : written);
    };

    const cancel = async () => {
        if (serializeOcclusionField(shapes) !== initialRef.current) {
            const discard = await confirmAsync(
                l('Değişiklikler atılsın mı?', 'Discard changes?'),
                l('Maskelerde yaptığınız değişiklikler kaydedilmeyecek.', 'The changes you made to the masks will not be kept.'),
            );
            if (!discard) return;
        }
        onCancel();
    };

    const toolLabel: Record<OcclusionTool, string> = {
        select: l('Seç', 'Select'),
        rect: l('Dikdörtgen', 'Rectangle'),
        ellipse: l('Elips', 'Ellipse'),
        polygon: l('Çokgen', 'Polygon'),
        text: l('Metin', 'Text'),
    };
    const hint = tool === 'rect' || tool === 'ellipse'
        ? l('Örtmek için resmin üzerinde sürükleyin.', 'Drag over the picture to cover it.')
        : tool === 'polygon'
            ? l('Köşelere dokunun; ilk noktaya dokunarak kapatın.', 'Tap each corner; tap the first point to close.')
            : tool === 'text'
                ? l('Etiketin yerine dokunun.', 'Tap where the label goes.')
                : l('Bir maskeye dokunup sürükleyin; köşeden boyutlandırın.', 'Tap a mask and drag it; resize it from its corner.');

    return (
        <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={cancel}>
            <SafeAreaView style={styles.container}>
                <View style={styles.header}>
                    <TouchableOpacity style={styles.headerButton} onPress={cancel} accessibilityRole="button" accessibilityLabel={l('İptal', 'Cancel')}>
                        <Text style={styles.headerButtonText}>{l('İptal', 'Cancel')}</Text>
                    </TouchableOpacity>
                    <View style={styles.headerCenter}>
                        <Text style={styles.title}>{l('Görüntü Örtme', 'Image Occlusion')}</Text>
                        <Text style={styles.subtitle}>{l(`${masks.length} maske · ${cardCount} kart`, `${masks.length} masks · ${cardCount} cards`)}</Text>
                    </View>
                    <TouchableOpacity style={styles.doneButton} onPress={finish} accessibilityRole="button" accessibilityLabel={l('Tamam', 'Done')}>
                        <Text style={styles.doneButtonText}>{l('Tamam', 'Done')}</Text>
                    </TouchableOpacity>
                </View>

                <View style={styles.optionsRow}>
                    <View style={styles.modeSwitch} accessibilityRole="radiogroup">
                        {[true, false].map((option) => (
                            <TouchableOpacity
                                key={String(option)}
                                style={[styles.modeOption, hideAll === option && styles.modeOptionActive]}
                                onPress={() => changeMode(option)}
                                accessibilityRole="radio"
                                accessibilityState={{ selected: hideAll === option }}
                            >
                                <Text style={[styles.modeText, hideAll === option && styles.modeTextActive]}>
                                    {option ? l('Hepsini gizle, birini sor', 'Hide all, guess one') : l('Birini gizle, birini sor', 'Hide one, guess one')}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                    <IconButton label={l('Geri al', 'Undo')} disabled={!history.past.length} onPress={() => step('undo')} styles={styles}>
                        <Path d="M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11" stroke="#fff" strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                    </IconButton>
                    <IconButton label={l('Yinele', 'Redo')} disabled={!history.future.length} onPress={() => step('redo')} styles={styles}>
                        <Path d="m15 14 5-5-5-5M20 9H9.5a5.5 5.5 0 0 0 0 11H13" stroke="#fff" strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                    </IconButton>
                </View>

                <OcclusionCanvas
                    uri={uri}
                    natural={natural}
                    shapes={shapes}
                    selected={selected}
                    tool={tool}
                    multiSelect={multiSelect}
                    polygon={polygon}
                    accent={colors.accent}
                    surface="#030712"
                    onSelectionChange={setSelected}
                    onCreateBox={(kind, box) => {
                        const geometry = kind === 'rect'
                            ? { kind, left: box.left, top: box.top, width: box.width, height: box.height, angle: 0 } as const
                            : { kind, left: box.left, top: box.top, rx: box.width / 2, ry: box.height / 2, angle: 0 } as const;
                        commit([...shapes, createOcclusionShape(geometry, nextOcclusionOrdinal(shapes), hideAll)], new Set([shapes.length]));
                    }}
                    onPolygonPoint={(point, closes) => (closes ? finishPolygon(polygon) : setPolygon([...polygon, point]))}
                    onTextAt={(at) => setTextPrompt({ at, value: '' })}
                    onMove={(indexes, dx, dy) => commit(shapes.map((shape, index) => (indexes.has(index) ? moveOcclusionShape(shape, dx, dy) : shape)), new Set(indexes))}
                    onResize={(index, box) => commit(shapes.map((shape, at) => (at === index ? resizeOcclusionShape(shape, box) : shape)))}
                    zoomLabels={{ zoomIn: l('Yakınlaştır', 'Zoom in'), zoomOut: l('Uzaklaştır', 'Zoom out'), fit: l('Sığdır', 'Fit') }}
                />

                {polygon.length > 0 ? (
                    <View style={styles.bar}>
                        <Text style={styles.barLabel}>{l(`${polygon.length} nokta`, `${polygon.length} points`)}</Text>
                        <Chip label={l('Son noktayı sil', 'Remove last point')} onPress={() => setPolygon(polygon.slice(0, -1))} styles={styles} />
                        <Chip label={l('Vazgeç', 'Discard')} onPress={() => setPolygon([])} styles={styles} />
                        {polygon.length >= 3 && <Chip label={l('Bitir', 'Finish')} active onPress={() => finishPolygon(polygon)} styles={styles} />}
                    </View>
                ) : selected.size > 0 ? (
                    <View style={styles.bar}>
                        <Text style={styles.barLabel}>
                            {selectedMasks.length === 0
                                ? l('Etiket', 'Label')
                                : selectedOrdinals.size === 1
                                    ? l(`Soru ${[...selectedOrdinals][0]}`, `Question ${[...selectedOrdinals][0]}`)
                                    : l(`${selected.size} şekil`, `${selected.size} shapes`)}
                        </Text>
                        {canGroup && <Chip label={l('Grupla', 'Group')} onPress={() => commit(groupOcclusionShapes(shapes, selected))} styles={styles} />}
                        {canUngroup && <Chip label={l('Ayır', 'Ungroup')} onPress={() => commit(ungroupOcclusionShapes(shapes, selected))} styles={styles} />}
                        {singleText >= 0 && (
                            <>
                                <Chip label="A−" accessibilityLabel={l('Metni küçült', 'Smaller text')} onPress={() => scaleText(1 / 1.25)} styles={styles} />
                                <Chip label="A+" accessibilityLabel={l('Metni büyüt', 'Larger text')} onPress={() => scaleText(1.25)} styles={styles} />
                                <Chip label={l('Düzenle', 'Edit')} styles={styles}
                                    onPress={() => setTextPrompt({ index: singleText, value: labelText(shapes[singleText]) })} />
                            </>
                        )}
                        <Chip label={l('Sil', 'Delete')} danger onPress={deleteSelection} styles={styles} />
                    </View>
                ) : (
                    <Text style={styles.hint}>{hint}</Text>
                )}

                <View style={styles.tools} accessibilityRole="tablist">
                    {TOOLS.map((entry) => (
                        <TouchableOpacity
                            key={entry}
                            style={[styles.tool, tool === entry && styles.toolActive]}
                            onPress={() => changeTool(entry)}
                            accessibilityRole="tab"
                            accessibilityLabel={toolLabel[entry]}
                            accessibilityState={{ selected: tool === entry }}
                        >
                            <ToolIcon tool={entry} color={tool === entry ? colors.accent : '#9ca3af'} />
                            <Text style={[styles.toolText, tool === entry && styles.toolTextActive]}>{toolLabel[entry]}</Text>
                        </TouchableOpacity>
                    ))}
                    {tool === 'select' && (
                        <TouchableOpacity
                            style={[styles.tool, multiSelect && styles.toolActive]}
                            onPress={() => setMultiSelect(!multiSelect)}
                            accessibilityRole="switch"
                            accessibilityLabel={l('Çoklu seçim', 'Multiple selection')}
                            accessibilityState={{ checked: multiSelect }}
                        >
                            <ToolIcon tool="multi" color={multiSelect ? colors.accent : '#9ca3af'} />
                            <Text style={[styles.toolText, multiSelect && styles.toolTextActive]}>{l('Çoklu', 'Multi')}</Text>
                        </TouchableOpacity>
                    )}
                </View>

                <Modal visible={textPrompt !== null} transparent animationType="fade" onRequestClose={() => setTextPrompt(null)}>
                    <KeyboardAvoidingView style={styles.promptBackdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                        <View style={styles.prompt}>
                            <Text style={styles.promptTitle}>{l('Etiket metni', 'Label text')}</Text>
                            <TextInput
                                style={styles.promptInput}
                                value={textPrompt?.value ?? ''}
                                onChangeText={(value) => setTextPrompt((current) => (current ? { ...current, value } : current))}
                                multiline
                                autoFocus
                                accessibilityLabel={l('Etiket metni', 'Label text')}
                                placeholder={l('Örn. Sol ventrikül', 'e.g. Left ventricle')}
                                placeholderTextColor={colors.textMuted}
                            />
                            <View style={styles.promptActions}>
                                <TouchableOpacity style={styles.promptButton} onPress={() => setTextPrompt(null)} accessibilityRole="button">
                                    <Text style={styles.promptButtonText}>{l('İptal', 'Cancel')}</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={[styles.promptButton, styles.promptButtonPrimary]} onPress={saveText} accessibilityRole="button">
                                    <Text style={[styles.promptButtonText, styles.promptButtonPrimaryText]}>{l('Tamam', 'Done')}</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </KeyboardAvoidingView>
                </Modal>
            </SafeAreaView>
        </Modal>
    );
}

function labelText(shape: OcclusionShape | undefined): string {
    const geometry = shape ? occlusionGeometry(shape) : null;
    return geometry?.kind === 'text' ? geometry.text : '';
}

type Styles = ReturnType<typeof createOcclusionEditorStyles>;

function Chip({ label, onPress, styles, active, danger, accessibilityLabel }: {
    label: string; onPress: () => void; styles: Styles; active?: boolean; danger?: boolean; accessibilityLabel?: string;
}) {
    return (
        <TouchableOpacity style={[styles.chip, active && styles.chipActive, danger && styles.chipDanger]} onPress={onPress}
            accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label}>
            <Text style={styles.chipText}>{label}</Text>
        </TouchableOpacity>
    );
}

function IconButton({ label, disabled, onPress, styles, children }: {
    label: string; disabled: boolean; onPress: () => void; styles: Styles; children: ReactNode;
}) {
    return (
        <TouchableOpacity style={[styles.iconButton, disabled && styles.iconButtonDisabled]} onPress={onPress} disabled={disabled}
            accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }}>
            <Svg width={22} height={22} viewBox="0 0 24 24">{children}</Svg>
        </TouchableOpacity>
    );
}

function ToolIcon({ tool, color }: { tool: OcclusionTool | 'multi'; color: string }) {
    const paint = { stroke: color, strokeWidth: 2, fill: 'none', strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const };
    return (
        <Svg width={24} height={24} viewBox="0 0 24 24">
            {tool === 'select' && <Path d="M5 3l13 7-6 1.5L9.5 18z" {...paint} />}
            {tool === 'rect' && <Rect x={3} y={6} width={18} height={12} rx={1} {...paint} />}
            {tool === 'ellipse' && <Ellipse cx={12} cy={12} rx={9} ry={6.5} {...paint} />}
            {tool === 'polygon' && <Polygon points="4,18 7,5 17,4 21,13 13,20" {...paint} />}
            {tool === 'text' && <Path d="M5 6V4h14v2M12 4v16M9 20h6" {...paint} />}
            {tool === 'multi' && (
                <>
                    <Rect x={3} y={3} width={11} height={11} rx={1} {...paint} />
                    <Rect x={10} y={10} width={11} height={11} rx={1} {...paint} />
                </>
            )}
        </Svg>
    );
}
