import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, TouchableOpacity, View } from 'react-native';
import { Text } from '../AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Ellipse, Path, Polygon, Rect } from 'react-native-svg';
import { useThemeColors } from '../../constants/theme';
import { useI18n } from '../../hooks/useI18n';
import { confirmAsync } from '../../lib/confirm';
import {
    OCCLUSION_DEFAULT_FILL,
    OCCLUSION_DEFAULT_TEXT_PIXELS,
    OCCLUSION_TEXT_DEFAULT_FILL,
    createOcclusionShape,
    formatOcclusionNumber,
    groupOcclusionShapes,
    moveOcclusionShape,
    nextOcclusionOrdinal,
    occludesInactive,
    occlusionFill,
    occlusionGeometry,
    parseOcclusionField,
    serializeOcclusionField,
    setOccludesInactive,
    setOcclusionFill,
    ungroupOcclusionShapes,
    withOcclusionProperties,
    type OcclusionShape,
} from '../../lib/imageOcclusion';
import { DECORATIVE_SVG_PROPS } from '../decorativeSvgProps';
import { RedoGlyph, UndoGlyph } from '../drawing/drawingGlyphs';
import { RotateLeftGlyph, RotateRightGlyph } from '../photo-editor/photoEditorGlyphs';
import ScreenHeader from '../ScreenHeader';
import { Button, IconButton, type ButtonVariant } from '../ui/Button';
import { AppDialog } from '../ui/Dialog';
import { TextField } from '../ui/Fields';
import OcclusionCanvas from './OcclusionCanvas';
import { createOcclusionEditorStyles } from './occlusionEditorStyles';
import { LABEL_COLOURS, MASK_COLOURS, removePolygonCorner, snappedTurn, turnShape, type OcclusionTool, type Point, type Size } from './occlusionEditorModel';

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
/** The turn the turn-left and turn-right buttons give, in degrees. */
const TURN_STEP = 15;

/**
 * Anki's mask editor for an Image Occlusion note, offline: draw rectangles, ellipses, polygons and
 * text labels over the picture, turn and colour them, reshape a polygon corner by corner, group
 * masks into one question, and choose whether the other masks stay hidden while one is asked.
 * Shapes keep Anki's text form (lib/imageOcclusion.ts); a shape left alone is written back exactly
 * as it was read.
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
    const [activeCorner, setActiveCorner] = useState<number | null>(null);
    const [showColours, setShowColours] = useState(false);
    const initialRef = useRef('');

    // A corner and the colour row belong to the selection they were opened for.
    useEffect(() => {
        setActiveCorner(null);
        if (!selected.size) setShowColours(false);
    }, [selected]);

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
    const singleIndex = selected.size === 1 ? [...selected][0] : -1;
    const singleGeometry = singleIndex >= 0 && shapes[singleIndex] ? occlusionGeometry(shapes[singleIndex]) : null;
    const canRemoveCorner = activeCorner !== null && singleGeometry?.kind === 'polygon' && singleGeometry.points.length > 3;
    const turnedSelection = selectedShapes.some((shape) => {
        const geometry = occlusionGeometry(shape);
        return !!geometry && geometry.kind !== 'polygon' && geometry.angle !== 0;
    });
    // A colour goes to the selected masks, or to the labels when only labels are selected.
    const colouring = selectedMasks.length ? 'mask' : 'label';
    const colourTargets = (shape: OcclusionShape) => (colouring === 'mask' ? shape.kind !== 'text' : shape.kind === 'text');
    const palette = colouring === 'mask' ? MASK_COLOURS : LABEL_COLOURS;
    const currentFills = new Set(selectedShapes.filter(colourTargets).map((shape) => occlusionFill(shape)));

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

    /** Applies a change to every selected shape, recording one undo step when anything changed. */
    const changeSelected = (change: (shape: OcclusionShape) => OcclusionShape) => {
        const next = shapes.map((shape, index) => (selected.has(index) ? change(shape) : shape));
        if (next.some((shape, index) => shape !== shapes[index])) commit(next);
    };

    // Snapped, so steps of 15° land on 30°, 45°… instead of adding up the rounding of each stored turn.
    const turnSelection = (degrees: number) => changeSelected((shape) => turnShape(shape, snappedTurn(shape, degrees), natural));

    const straighten = () => changeSelected((shape) => {
        const geometry = occlusionGeometry(shape);
        return geometry && geometry.kind !== 'polygon' && geometry.angle ? turnShape(shape, -geometry.angle, natural) : shape;
    });

    const colourSelection = (fill: string | null) => changeSelected((shape) => (colourTargets(shape) ? setOcclusionFill(shape, fill) : shape));

    const removeCorner = () => {
        if (activeCorner === null || singleIndex < 0) return;
        commit(shapes.map((shape, index) => (index === singleIndex ? removePolygonCorner(shape, activeCorner) : shape)));
        setActiveCorner(null);
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
                : l('Bir maskeye dokunup sürükleyin; köşedeki kareden boyutlandırın, üstteki tutamaçla döndürün.',
                    'Tap a mask and drag it; resize it from the square at its corner, turn it with the handle above it.');

    return (
        <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={cancel}>
            <SafeAreaView style={styles.container}>
                {/* × asks before changed masks are thrown away. */}
                <ScreenHeader
                    leading="close"
                    onBack={cancel}
                    backAccessibilityLabel={l('İptal', 'Cancel')}
                    title={l('Görüntü Örtme', 'Image Occlusion')}
                    subtitle={l(`${masks.length} maske · ${cardCount} kart`, `${masks.length} masks · ${cardCount} cards`)}
                    actions={<Button label={l('Tamam', 'Done')} size="compact" onPress={finish} accessibilityLabel={l('Tamam', 'Done')} />}
                />

                <View style={styles.optionsRow}>
                    <View style={styles.modeSwitch} accessibilityRole="radiogroup">
                        {[true, false].map((option) => (
                            <TouchableOpacity
                                key={String(option)}
                                style={[styles.modeOption, hideAll === option && styles.modeOptionActive]}
                                onPress={() => changeMode(option)}
                                hitSlop={{ top: 4, bottom: 4 }}
                                accessibilityRole="radio"
                                accessibilityState={{ selected: hideAll === option }}
                            >
                                <Text style={[styles.modeText, hideAll === option && styles.modeTextActive]}>
                                    {option ? l('Hepsini gizle, birini sor', 'Hide all, guess one') : l('Birini gizle, birini sor', 'Hide one, guess one')}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                    <IconButton accessibilityLabel={l('Geri al', 'Undo')} disabled={!history.past.length} onPress={() => step('undo')}>
                        <UndoGlyph color={colors.textPrimary} size={22} />
                    </IconButton>
                    <IconButton accessibilityLabel={l('Yinele', 'Redo')} disabled={!history.future.length} onPress={() => step('redo')}>
                        <RedoGlyph color={colors.textPrimary} size={22} />
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
                    activeCorner={activeCorner}
                    onActiveCornerChange={setActiveCorner}
                    accent={colors.accent}
                    surface={colors.bgPrimary}
                    onSelectionChange={setSelected}
                    onCreateBox={(kind, box) => {
                        const geometry = kind === 'rect'
                            ? { kind, left: box.left, top: box.top, width: box.width, height: box.height, angle: 0 } as const
                            : { kind, left: box.left, top: box.top, rx: box.width / 2, ry: box.height / 2, angle: 0 } as const;
                        commit([...shapes, createOcclusionShape(geometry, nextOcclusionOrdinal(shapes), hideAll)], new Set([shapes.length]));
                    }}
                    onPolygonPoint={(point, closes) => {
                        if (closes) {
                            finishPolygon(polygon);
                            return;
                        }
                        // A new polygon lets go of the last shape, so its handles do not catch the taps.
                        if (!polygon.length) setSelected(new Set());
                        setPolygon([...polygon, point]);
                    }}
                    onTextAt={(at) => setTextPrompt({ at, value: '' })}
                    onMove={(indexes, dx, dy) => commit(shapes.map((shape, index) => (indexes.has(index) ? moveOcclusionShape(shape, dx, dy) : shape)), new Set(indexes))}
                    onChangeShape={(index, changed) => commit(shapes.map((shape, at) => (at === index ? changed : shape)))}
                    zoomLabels={{ zoomIn: l('Yakınlaştır', 'Zoom in'), zoomOut: l('Uzaklaştır', 'Zoom out'), fit: l('Sığdır', 'Fit') }}
                />

                {polygon.length > 0 ? (
                    <View style={styles.bar}>
                        <Text style={styles.barLabel}>{l(`${polygon.length} nokta`, `${polygon.length} points`)}</Text>
                        <BarButton label={l('Son noktayı sil', 'Remove last point')} onPress={() => setPolygon(polygon.slice(0, -1))} />
                        <BarButton label={l('Vazgeç', 'Discard')} variant="plain" onPress={() => setPolygon([])} />
                        {polygon.length >= 3 && <BarButton label={l('Bitir', 'Finish')} variant="primary" onPress={() => finishPolygon(polygon)} />}
                    </View>
                ) : selected.size > 0 ? (
                    <>
                        <View style={styles.bar}>
                            <Text style={styles.barLabel}>
                                {selectedMasks.length === 0
                                    ? l('Etiket', 'Label')
                                    : selectedOrdinals.size === 1
                                        ? l(`Soru ${[...selectedOrdinals][0]}`, `Question ${[...selectedOrdinals][0]}`)
                                        : l(`${selected.size} şekil`, `${selected.size} shapes`)}
                            </Text>
                            {canGroup && <BarButton label={l('Grupla', 'Group')} onPress={() => commit(groupOcclusionShapes(shapes, selected))} />}
                            {canUngroup && <BarButton label={l('Ayır', 'Ungroup')} onPress={() => commit(ungroupOcclusionShapes(shapes, selected))} />}
                            <IconButton accessibilityLabel={l('Sola döndür', 'Turn left')} onPress={() => turnSelection(-TURN_STEP)}>
                                <RotateLeftGlyph color={colors.textPrimary} size={22} />
                            </IconButton>
                            <IconButton accessibilityLabel={l('Sağa döndür', 'Turn right')} onPress={() => turnSelection(TURN_STEP)}>
                                <RotateRightGlyph color={colors.textPrimary} size={22} />
                            </IconButton>
                            {turnedSelection && <BarButton label={l('Düzelt', 'Straighten')} onPress={straighten} />}
                            {/* Filled while the colour row under the bar is open. */}
                            <BarButton label={l('Renk', 'Colour')} variant={showColours ? 'primary' : 'secondary'} onPress={() => setShowColours(!showColours)} />
                            {canRemoveCorner && <BarButton label={l('Köşeyi sil', 'Remove corner')} onPress={removeCorner} />}
                            {singleText >= 0 && (
                                <>
                                    <BarButton label="A−" accessibilityLabel={l('Metni küçült', 'Smaller text')} onPress={() => scaleText(1 / 1.25)} />
                                    <BarButton label="A+" accessibilityLabel={l('Metni büyüt', 'Larger text')} onPress={() => scaleText(1.25)} />
                                    <BarButton label={l('Düzenle', 'Edit')}
                                        onPress={() => setTextPrompt({ index: singleText, value: labelText(shapes[singleText]) })} />
                                </>
                            )}
                            <BarButton label={l('Sil', 'Delete')} variant="destructive" onPress={deleteSelection} />
                        </View>
                        {showColours && (
                            <View style={styles.swatches} accessibilityRole="radiogroup"
                                accessibilityLabel={colouring === 'mask' ? l('Maske rengi', 'Mask colour') : l('Etiket rengi', 'Label colour')}>
                                {palette.map(({ fill, name }) => {
                                    const chosen = currentFills.size === 1 && currentFills.has(fill);
                                    const shown = fill ?? (colouring === 'mask' ? OCCLUSION_DEFAULT_FILL : OCCLUSION_TEXT_DEFAULT_FILL);
                                    return (
                                        // The masks' own colours: data the note keeps, not chrome.
                                        <TouchableOpacity key={fill ?? 'default'} onPress={() => colourSelection(fill)}
                                            style={[styles.swatch, chosen && { borderColor: colors.accent }]}
                                            hitSlop={{ top: 4, right: 4, bottom: 4, left: 4 }}
                                            accessibilityRole="radio" accessibilityState={{ selected: chosen }}
                                            accessibilityLabel={l(...name)}>
                                            <View style={[styles.swatchFill, { backgroundColor: shown }]} />
                                        </TouchableOpacity>
                                    );
                                })}
                                {colouring === 'mask' && (
                                    <Text style={styles.swatchNote}>{l('Sorulan maske kırmızı görünür.', 'The asked mask shows red.')}</Text>
                                )}
                            </View>
                        )}
                    </>
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
                            <ToolIcon tool={entry} color={tool === entry ? colors.accent : colors.textMuted} />
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
                            <ToolIcon tool="multi" color={multiSelect ? colors.accent : colors.textMuted} />
                            <Text style={[styles.toolText, multiSelect && styles.toolTextActive]}>{l('Çoklu', 'Multi')}</Text>
                        </TouchableOpacity>
                    )}
                </View>

                {/* A tap outside does not close it: the typed label would be lost. */}
                <AppDialog
                    visible={textPrompt !== null}
                    onClose={() => setTextPrompt(null)}
                    title={l('Etiket metni', 'Label text')}
                    dismissOnBackdrop={false}
                    actions={(
                        <>
                            <Button label={l('İptal', 'Cancel')} variant="plain" onPress={() => setTextPrompt(null)} />
                            <Button label={l('Tamam', 'Done')} onPress={saveText} />
                        </>
                    )}
                >
                    <TextField
                        style={styles.promptInput}
                        value={textPrompt?.value ?? ''}
                        onChangeText={(value) => setTextPrompt((current) => (current ? { ...current, value } : current))}
                        multiline
                        autoFocus
                        accessibilityLabel={l('Etiket metni', 'Label text')}
                        placeholder={l('Örn. Sol ventrikül', 'e.g. Left ventricle')}
                    />
                </AppDialog>
            </SafeAreaView>
        </Modal>
    );
}

function labelText(shape: OcclusionShape | undefined): string {
    const geometry = shape ? occlusionGeometry(shape) : null;
    return geometry?.kind === 'text' ? geometry.text : '';
}

/** One action of the bar under the picture: outlined unless it finishes, discards or deletes. */
function BarButton({ variant = 'secondary', ...props }: {
    label: string; onPress: () => void; variant?: ButtonVariant; accessibilityLabel?: string;
}) {
    return <Button size="compact" variant={variant} {...props} />;
}

/** The tools' own glyphs: a pointer, the three mask shapes, a label and two stacked boxes. */
function ToolIcon({ tool, color }: { tool: OcclusionTool | 'multi'; color: string }) {
    const paint = { stroke: color, strokeWidth: 2, fill: 'none', strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const };
    return (
        <Svg width={24} height={24} viewBox="0 0 24 24" {...DECORATIVE_SVG_PROPS}>
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
