import { memo, useEffect, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Modal,
    PanResponder,
    PixelRatio,
    Platform,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
    type GestureResponderEvent,
    type LayoutChangeEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg from 'react-native-svg';
import { captureRef } from 'react-native-view-shot';
import { BorderRadius, FontSize, Shadows, Spacing, useThemeColors, type ColorScheme } from '../../constants/theme';
import { useI18n } from '../../hooks/useI18n';
import { alert, confirm } from '../../lib/confirm';
import { sanitizeMediaFilename } from '../../lib/mediaFilename';
import { saveMediaBytes, saveMediaFromUri } from '../../lib/mediaStore';
import { applyPhotoEraserSweep, photoExportSurface, type PhotoPoint, type PhotoStroke } from '../../lib/photoEditor';
import { BLANK_CANVAS_BACKGROUNDS, BLANK_CANVAS_SHAPES, defaultBlankCanvasRuling } from '../../lib/blankCanvas';
import { loadBlankCanvasSetup, saveBlankCanvasSetup, type BlankCanvasSetup } from '../../lib/blankCanvasSetup';
import {
    HIGHLIGHTER_INKS,
    HIGHLIGHTER_OPACITY,
    drawingInkForPage,
    drawingInks,
    drawingPenInks,
    drawingPointFromPage,
    drawingToolWidth,
    fitDrawingPage,
    refitDrawingStrokes,
    shouldAddDrawingPoint,
    type DrawingSize,
    type DrawingTool,
} from '../../lib/drawingPad';
import PaperSwatch, { pageColorLabel, paperLabel } from '../PaperSwatch';
import { EXPORT_MAX_DIMENSION, makeId, type ExportSurface } from '../photo-editor/editorModel';
import { renderAnnotation } from '../photo-editor/annotationRendering';
import { rasterizeBlankCanvasWeb } from '../photo-editor/webExport';
import { ExportSurfaceView } from '../photo-editor/ExportSurfaceView';
import { DrawingToolbar } from './DrawingToolbar';
import { PageOptionsSheet, shapeLabel } from './PageOptionsSheet';
import { ChevronDownGlyph } from './drawingGlyphs';

interface DrawingPadModalProps {
    visible: boolean;
    onClose: () => void;
    /** Receives the stored PNG's media filename once the drawing is added to the card. */
    onSaved: (filename: string) => void;
}

/** One state the page can return to: the ink and the sheet it was drawn on. */
type PadSnapshot = { strokes: PhotoStroke[]; setup: BlankCanvasSetup };

const HISTORY_LIMIT = 50;

function pageSizeFor(setup: BlankCanvasSetup) {
    return BLANK_CANVAS_SHAPES.find((shape) => shape.id === setup.shape) ?? BLANK_CANVAS_SHAPES[0];
}

/** The finished strokes. Kept apart from the live one so a stroke in progress redraws alone. */
const StrokeLayer = memo(function StrokeLayer({ strokes, width, height }: { strokes: PhotoStroke[]; width: number; height: number }) {
    return (
        <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
            {strokes.map((stroke) => renderAnnotation(stroke, width, height))}
        </Svg>
    );
});

/**
 * A blank page to draw on for a card: pen, highlighter and eraser, undo and redo, and the paper
 * underneath. It saves a PNG through the same export path the photo editor uses.
 */
export default function DrawingPadModal({ visible, onClose, onSaved }: DrawingPadModalProps) {
    const { t, l } = useI18n();
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const insets = useSafeAreaInsets();

    const [setup, setSetup] = useState<BlankCanvasSetup>(() => loadBlankCanvasSetup());
    const [strokes, setStrokes] = useState<PhotoStroke[]>([]);
    const [liveStroke, setLiveStroke] = useState<PhotoStroke | null>(null);
    const [undoStack, setUndoStack] = useState<PadSnapshot[]>([]);
    const [redoStack, setRedoStack] = useState<PadSnapshot[]>([]);
    const [tool, setTool] = useState<DrawingTool>('pen');
    const [penColor, setPenColor] = useState(() => drawingPenInks(setup.background)[0]);
    const [highlighterColor, setHighlighterColor] = useState<string>(HIGHLIGHTER_INKS[0]);
    const [sizes, setSizes] = useState<Record<DrawingTool, DrawingSize>>({ pen: 1, highlighter: 1, eraser: 1 });
    const [eraserRing, setEraserRing] = useState<{ x: number; y: number; radius: number } | null>(null);
    const [stage, setStage] = useState<{ width: number; height: number } | null>(null);
    const [pageSheet, setPageSheet] = useState(false);
    const [saving, setSaving] = useState(false);
    const [exportSurface, setExportSurface] = useState<ExportSurface | null>(null);

    // Every page opens the way the last one was left, with nothing on it.
    useEffect(() => {
        if (!visible) return;
        const stored = loadBlankCanvasSetup();
        setSetup(stored);
        setStrokes([]);
        setLiveStroke(null);
        setUndoStack([]);
        setRedoStack([]);
        setTool('pen');
        setPenColor(drawingPenInks(stored.background)[0]);
        setEraserRing(null);
        setPageSheet(false);
    }, [visible]);

    const pageSize = pageSizeFor(setup);
    const canvasSize = useMemo(
        () => (stage ? fitDrawingPage(stage, pageSize) : { width: 1, height: 1 }),
        [stage, pageSize],
    );

    // The gesture handlers are built once, so whatever they read that changes is read through a ref.
    const strokesRef = useRef(strokes);
    strokesRef.current = strokes;
    const setupRef = useRef(setup);
    setupRef.current = setup;
    const canvasSizeRef = useRef(canvasSize);
    canvasSizeRef.current = canvasSize;
    const brushRef = useRef({ tool, penColor, highlighterColor, sizes });
    brushRef.current = { tool, penColor, highlighterColor, sizes };
    const undoStackRef = useRef(undoStack);
    undoStackRef.current = undoStack;
    const redoStackRef = useRef(redoStack);
    redoStackRef.current = redoStack;

    /** Remember the page as it was before an edit, and drop the redo branch the edit replaces. */
    const remember = (before: PadSnapshot) => {
        undoStackRef.current = [...undoStackRef.current.slice(-(HISTORY_LIMIT - 1)), before];
        setUndoStack(undoStackRef.current);
        redoStackRef.current = [];
        setRedoStack([]);
    };

    const applyStrokes = (next: PhotoStroke[]) => {
        strokesRef.current = next;
        setStrokes(next);
    };

    const gestureRef = useRef<{
        origin: { x: number; y: number };
        last: PhotoPoint;
        stroke: PhotoStroke | null;
        before: PhotoStroke[];
        erased: boolean;
    } | null>(null);

    const eraseAlong = (from: PhotoPoint, to: PhotoPoint) => {
        const gesture = gestureRef.current;
        const { width, height } = canvasSizeRef.current;
        const radius = drawingToolWidth('eraser', brushRef.current.sizes.eraser);
        setEraserRing({ x: to.x * width, y: to.y * height, radius });
        const result = applyPhotoEraserSweep(strokesRef.current, from, to, width, height, radius, 'partial');
        if (!result.changed || !gesture) return;
        gesture.erased = true;
        applyStrokes(result.annotations as PhotoStroke[]);
    };

    const finishGesture = () => {
        const gesture = gestureRef.current;
        gestureRef.current = null;
        setEraserRing(null);
        if (!gesture) return;
        if (gesture.stroke) {
            const points = gesture.stroke.points;
            // A tap leaves a dot. The PNG is drawn as a polyline, and a one-point line draws
            // nothing, so the dot is given a second point a hair away.
            const finished = {
                ...gesture.stroke,
                points: points.length === 1 ? [points[0], { x: points[0].x + 0.0005, y: points[0].y }] : points,
            };
            remember({ strokes: gesture.before, setup: setupRef.current });
            applyStrokes([...strokesRef.current, finished]);
            setLiveStroke(null);
        } else if (gesture.erased) {
            remember({ strokes: gesture.before, setup: setupRef.current });
        }
    };

    /** Carry the stroke, or the eraser, on to where the finger is now. */
    const extendGesture = (event: GestureResponderEvent) => {
        const gesture = gestureRef.current;
        if (!gesture) return;
        const native = event.nativeEvent;
        const point = drawingPointFromPage({ x: native.pageX, y: native.pageY }, gesture.origin, canvasSizeRef.current);
        if (!shouldAddDrawingPoint(gesture.last, point, canvasSizeRef.current)) return;
        const from = gesture.last;
        gesture.last = point;
        if (gesture.stroke) {
            gesture.stroke = { ...gesture.stroke, points: [...gesture.stroke.points, point] };
            setLiveStroke(gesture.stroke);
        } else {
            eraseAlong(from, point);
        }
    };

    const panResponder = useRef(PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        // A stroke belongs to the page until the finger lifts.
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (event: GestureResponderEvent) => {
            const native = event.nativeEvent;
            // Everything on the page ignores touches, so `location` is measured from the page
            // itself and the page's origin falls out of the very touch that started the stroke.
            const origin = { x: native.pageX - native.locationX, y: native.pageY - native.locationY };
            const point = drawingPointFromPage({ x: native.pageX, y: native.pageY }, origin, canvasSizeRef.current);
            const brush = brushRef.current;
            const stroke: PhotoStroke | null = brush.tool === 'eraser' ? null : {
                id: makeId(),
                type: 'stroke',
                color: brush.tool === 'highlighter' ? brush.highlighterColor : brush.penColor,
                width: drawingToolWidth(brush.tool, brush.sizes[brush.tool]),
                opacity: brush.tool === 'highlighter' ? HIGHLIGHTER_OPACITY : 1,
                points: [point],
            };
            gestureRef.current = { origin, last: point, stroke, before: strokesRef.current, erased: false };
            if (stroke) setLiveStroke(stroke);
            else eraseAlong(point, point);
        },
        onPanResponderMove: (event: GestureResponderEvent) => extendGesture(event),
        // The lift can arrive with a position no move reported, so the stroke is taken that far
        // before it is finished; otherwise a quick flick ends short of where the finger left.
        onPanResponderRelease: (event: GestureResponderEvent) => {
            extendGesture(event);
            finishGesture();
        },
        onPanResponderTerminate: finishGesture,
    })).current;

    /** Move onto a remembered page, carrying the pen's ink across a change of page colour. */
    const restore = (target: PadSnapshot) => {
        if (target.setup.background !== setupRef.current.background) {
            setPenColor((current) => drawingInkForPage(current, setupRef.current.background, target.setup.background));
        }
        setupRef.current = target.setup;
        setSetup(target.setup);
        applyStrokes(target.strokes);
    };

    const undo = () => {
        const stack = undoStackRef.current;
        if (!stack.length) return;
        redoStackRef.current = [...redoStackRef.current, { strokes: strokesRef.current, setup: setupRef.current }];
        setRedoStack(redoStackRef.current);
        undoStackRef.current = stack.slice(0, -1);
        setUndoStack(undoStackRef.current);
        restore(stack[stack.length - 1]);
    };

    const redo = () => {
        const stack = redoStackRef.current;
        if (!stack.length) return;
        undoStackRef.current = [...undoStackRef.current, { strokes: strokesRef.current, setup: setupRef.current }];
        setUndoStack(undoStackRef.current);
        redoStackRef.current = stack.slice(0, -1);
        setRedoStack(redoStackRef.current);
        restore(stack[stack.length - 1]);
    };

    const clear = () => {
        if (!strokesRef.current.length) return;
        remember({ strokes: strokesRef.current, setup: setupRef.current });
        applyStrokes([]);
    };

    /** A new paper, colour or shape. The drawing stays; a new shape is fitted, not stretched. */
    const changeSetup = (next: BlankCanvasSetup) => {
        const current = setupRef.current;
        if (next.paper === current.paper && next.background === current.background && next.shape === current.shape) return;
        remember({ strokes: strokesRef.current, setup: current });
        if (next.shape !== current.shape) {
            applyStrokes(refitDrawingStrokes(strokesRef.current, pageSizeFor(current), pageSizeFor(next)));
        }
        if (next.background !== current.background) {
            setPenColor((color) => drawingInkForPage(color, current.background, next.background));
        }
        setupRef.current = next;
        setSetup(next);
        saveBlankCanvasSetup(next);
    };

    const close = () => {
        if (saving) return;
        if (!strokesRef.current.length && !undoStackRef.current.length) {
            onClose();
            return;
        }
        confirm(
            l('Çizimi bırak?', 'Discard drawing?'),
            l('Bu sayfadaki çizim karta eklenmeden silinecek.', 'This drawing will be lost without being added to the card.'),
            onClose,
            { destructive: true },
        );
    };

    // Native export: the page is drawn again off screen at export size and photographed there,
    // so the PNG is sharper than the page on screen and carries none of the editing chrome.
    const exportSurfaceRef = useRef<View>(null);
    const exportLaidOutRef = useRef(false);
    const exportPhotoLoadedRef = useRef(true);
    const exportPicturesReadyRef = useRef(0);
    const nextFrame = () => new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 32);
        requestAnimationFrame(() => {
            clearTimeout(timer);
            resolve();
        });
    });

    const captureNative = async (surface: ExportSurface): Promise<string> => {
        exportLaidOutRef.current = false;
        setExportSurface(surface);
        try {
            const deadline = Date.now() + 4000;
            while (!exportLaidOutRef.current && Date.now() < deadline) await nextFrame();
            await nextFrame();
            return await captureRef(exportSurfaceRef, { format: 'png', quality: 1, result: 'tmpfile', useRenderInContext: true });
        } finally {
            setExportSurface(null);
        }
    };

    const save = async () => {
        if (saving || !strokesRef.current.length) return;
        setSaving(true);
        try {
            const filename = sanitizeMediaFilename(`${Date.now()}_cizim.png`);
            const page = setupRef.current;
            const size = pageSizeFor(page);
            const surface = photoExportSurface({
                source: size,
                canvas: canvasSizeRef.current,
                pixelRatio: Platform.OS === 'web' ? 1 : PixelRatio.get(),
                maxDimension: EXPORT_MAX_DIMENSION,
            });
            if (Platform.OS === 'web') {
                const bytes = await rasterizeBlankCanvasWeb(
                    { background: page.background, paper: page.paper, width: size.width, height: size.height },
                    strokesRef.current,
                    surface,
                );
                await saveMediaBytes(filename, bytes, 'image/png');
            } else {
                const uri = await captureNative(surface);
                await saveMediaFromUri(filename, uri, 'image/png');
            }
            saveBlankCanvasSetup(page);
            onSaved(filename);
            onClose();
        } catch (error) {
            console.warn('[DrawingPad] save failed:', error);
            alert(t('common.error'), l('Çizim kaydedilemedi.', 'Could not save the drawing.'));
        } finally {
            setSaving(false);
        }
    };

    const onStageLayout = (event: LayoutChangeEvent) => {
        const { width, height } = event.nativeEvent.layout;
        if (width <= 0 || height <= 0) return;
        setStage((previous) => (
            previous && Math.abs(previous.width - width) < 1 && Math.abs(previous.height - height) < 1
                ? previous
                : { width, height }
        ));
    };

    const inks = drawingInks(tool, setup.background);
    const color = tool === 'highlighter' ? highlighterColor : penColor;
    const backgroundId = BLANK_CANVAS_BACKGROUNDS.find((option) => option.color === setup.background)?.id ?? 'white';
    const pageSummary = [paperLabel(setup.paper, l), pageColorLabel(backgroundId, l), shapeLabel(setup.shape, l)].join(' · ');
    const nothingDrawn = strokes.length === 0;

    return (
        <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={close}>
            <View style={[styles.container, { paddingTop: insets.top }]}>
                <View style={styles.header}>
                    <TouchableOpacity
                        style={styles.headerSide}
                        onPress={close}
                        disabled={saving}
                        accessibilityRole="button"
                        accessibilityLabel={l('Çizimi iptal et', 'Cancel drawing')}
                    >
                        <Text style={styles.cancelText}>{l('Vazgeç', 'Cancel')}</Text>
                    </TouchableOpacity>
                    <View style={styles.headerCenter}>
                        <Text style={styles.title}>{l('Çizim', 'Drawing')}</Text>
                        <TouchableOpacity
                            style={styles.pageButton}
                            onPress={() => setPageSheet(true)}
                            accessibilityRole="button"
                            accessibilityLabel={l(`Sayfa seçenekleri: ${pageSummary}`, `Page options: ${pageSummary}`)}
                        >
                            <Text style={styles.pageButtonText} numberOfLines={1}>{pageSummary}</Text>
                            <ChevronDownGlyph color={colors.accent} size={14} />
                        </TouchableOpacity>
                    </View>
                    <View style={[styles.headerSide, styles.headerRight]}>
                        <TouchableOpacity
                            style={[styles.addButton, (nothingDrawn || saving) && styles.addButtonDisabled]}
                            onPress={save}
                            disabled={nothingDrawn || saving}
                            accessibilityRole="button"
                            accessibilityLabel={l('Çizimi karta ekle', 'Add drawing to the card')}
                            accessibilityState={{ disabled: nothingDrawn || saving }}
                        >
                            {saving
                                ? <ActivityIndicator size="small" color={colors.white} />
                                : <Text style={styles.addText}>{l('Ekle', 'Add')}</Text>}
                        </TouchableOpacity>
                    </View>
                </View>

                <View style={styles.stage} onLayout={onStageLayout}>
                    {stage && (
                        <View style={[styles.pageShadow, { width: canvasSize.width, height: canvasSize.height }]}>
                            <View
                                style={[styles.page, { width: canvasSize.width, height: canvasSize.height }]}
                                accessible
                                accessibilityLabel={l('Çizim sayfası', 'Drawing page')}
                                accessibilityHint={l('Çizmek için parmağınızı sürükleyin', 'Drag a finger to draw')}
                                {...panResponder.panHandlers}
                            >
                                <View style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}>
                                    <PaperSwatch
                                        paper={setup.paper}
                                        background={setup.background}
                                        width={canvasSize.width}
                                        height={canvasSize.height}
                                        style={StyleSheet.absoluteFill}
                                    />
                                    <StrokeLayer strokes={strokes} width={canvasSize.width} height={canvasSize.height} />
                                    {liveStroke && (
                                        <Svg width={canvasSize.width} height={canvasSize.height} style={StyleSheet.absoluteFill}>
                                            {renderAnnotation(liveStroke, canvasSize.width, canvasSize.height)}
                                        </Svg>
                                    )}
                                    {eraserRing && (
                                        <View
                                            style={[
                                                styles.eraserRing,
                                                {
                                                    left: eraserRing.x - eraserRing.radius,
                                                    top: eraserRing.y - eraserRing.radius,
                                                    width: eraserRing.radius * 2,
                                                    height: eraserRing.radius * 2,
                                                    borderRadius: eraserRing.radius,
                                                },
                                            ]}
                                        />
                                    )}
                                </View>
                            </View>
                        </View>
                    )}
                </View>

                <DrawingToolbar
                    tool={tool}
                    onToolChange={setTool}
                    inks={inks}
                    color={color}
                    onColorChange={tool === 'highlighter' ? setHighlighterColor : setPenColor}
                    size={sizes[tool]}
                    onSizeChange={(size) => setSizes((current) => ({ ...current, [tool]: size }))}
                    canUndo={undoStack.length > 0}
                    canRedo={redoStack.length > 0}
                    canClear={!nothingDrawn}
                    onUndo={undo}
                    onRedo={redo}
                    onClear={clear}
                    bottomInset={insets.bottom}
                />

                <PageOptionsSheet
                    visible={pageSheet}
                    setup={setup}
                    onChange={changeSetup}
                    onClose={() => setPageSheet(false)}
                />

                {exportSurface && (
                    <ExportSurfaceView
                        exportSurface={exportSurface}
                        exportSurfaceRef={exportSurfaceRef}
                        exportLaidOutRef={exportLaidOutRef}
                        exportPhotoLoadedRef={exportPhotoLoadedRef}
                        exportPicturesReadyRef={exportPicturesReadyRef}
                        page={{
                            background: setup.background,
                            paper: setup.paper,
                            ruling: defaultBlankCanvasRuling(pageSize.width, pageSize.height),
                        }}
                        sourceUri=""
                        sourceSize={pageSize}
                        annotations={strokes}
                    />
                )}
            </View>
        </Modal>
    );
}

function createStyles(colors: ColorScheme) {
    return StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.bgPrimary },
        header: {
            flexDirection: 'row',
            alignItems: 'center',
            minHeight: 56,
            paddingHorizontal: Spacing.md,
            backgroundColor: colors.bgCard,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: colors.border,
        },
        headerSide: { minWidth: 76, minHeight: 44, justifyContent: 'center' },
        headerRight: { alignItems: 'flex-end' },
        headerCenter: { flex: 1, alignItems: 'center', gap: 1 },
        cancelText: { fontSize: FontSize.lg, color: colors.accent, fontWeight: '600' },
        title: { fontSize: FontSize.lg, fontWeight: '700', color: colors.textPrimary },
        pageButton: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 2,
            minHeight: 24,
            paddingHorizontal: Spacing.sm,
            maxWidth: '100%',
        },
        pageButtonText: { fontSize: FontSize.sm, color: colors.accent, fontWeight: '600', flexShrink: 1 },
        addButton: {
            minWidth: 64,
            height: 36,
            paddingHorizontal: Spacing.lg,
            borderRadius: BorderRadius.full,
            backgroundColor: colors.accent,
            alignItems: 'center',
            justifyContent: 'center',
        },
        addButtonDisabled: { opacity: 0.4 },
        addText: { color: colors.white, fontWeight: '700', fontSize: FontSize.md },
        stage: { flex: 1, minHeight: 0, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
        // The shadow sits on a wrapper: iOS clips a shadow drawn by a view that clips its content.
        pageShadow: { borderRadius: BorderRadius.sm, backgroundColor: colors.bgCard, ...Shadows.md },
        page: {
            borderRadius: BorderRadius.sm,
            overflow: 'hidden',
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: colors.border,
        },
        eraserRing: {
            position: 'absolute',
            borderWidth: 1.5,
            borderColor: 'rgba(100, 116, 110, 0.9)',
            backgroundColor: 'rgba(255, 255, 255, 0.35)',
        },
    });
}
