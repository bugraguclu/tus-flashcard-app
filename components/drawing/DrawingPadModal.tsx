import { memo, useEffect, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Image as NativeImage,
    Modal,
    PixelRatio,
    Platform,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
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
import { photoExportSurface, type PhotoAnnotation, type PhotoImage, type PhotoPoint, type PhotoText } from '../../lib/photoEditor';
import { BLANK_CANVAS_BACKGROUNDS, BLANK_CANVAS_SHAPES, defaultBlankCanvasRuling } from '../../lib/blankCanvas';
import { loadBlankCanvasSetup, saveBlankCanvasSetup, type BlankCanvasSetup } from '../../lib/blankCanvasSetup';
import {
    HIGHLIGHTER_INKS,
    TEXT_SIZES,
    drawingImageBox,
    drawingInkForPage,
    drawingInks,
    drawingPenInks,
    fitDrawingPage,
    keepDrawingObjectOnPage,
    refitDrawingAnnotations,
    type DrawingShapeTool,
    type DrawingSize,
    type DrawingTool,
} from '../../lib/drawingPad';
import PaperSwatch, { pageColorLabel, paperLabel } from '../PaperSwatch';
import { EXPORT_MAX_DIMENSION, makeId, type ExportSurface } from '../photo-editor/editorModel';
import { renderAnnotation, renderPlacedPictures } from '../photo-editor/annotationRendering';
import { rasterizeBlankCanvasWeb } from '../photo-editor/webExport';
import { ExportSurfaceView } from '../photo-editor/ExportSurfaceView';
import { DrawingToolbar } from './DrawingToolbar';
import { MoreToolsSheet } from './MoreToolsSheet';
import { PageOptionsSheet, shapeLabel } from './PageOptionsSheet';
import { SelectionFrame } from './SelectionFrame';
import { TextEntrySheet } from './TextEntrySheet';
import { ChevronDownGlyph, ClearGlyph, RedoGlyph, UndoGlyph } from './drawingGlyphs';
import { pickDrawingPicture } from './pickDrawingPicture';
import { useDrawingGestures, type DrawingBrush } from './useDrawingGestures';

interface DrawingPadModalProps {
    visible: boolean;
    onClose: () => void;
    /** Receives the stored PNG's media filename once the drawing is added to the card. */
    onSaved: (filename: string) => void;
}

/** One state the page can return to: what is on it and the sheet it was drawn on. */
type PadSnapshot = { annotations: PhotoAnnotation[]; setup: BlankCanvasSetup };

const HISTORY_LIMIT = 50;
const DEFAULT_SIZES: Record<DrawingTool, DrawingSize> = {
    pen: 1, highlighter: 1, eraser: 1, text: 1, arrow: 1, rect: 1, ellipse: 1, cover: 1, image: 1,
};

function pageSizeFor(setup: BlankCanvasSetup) {
    return BLANK_CANVAS_SHAPES.find((shape) => shape.id === setup.shape) ?? BLANK_CANVAS_SHAPES[0];
}

/** What is already on the page. Kept apart from the live mark so a stroke in progress redraws alone. */
const AnnotationLayer = memo(function AnnotationLayer({ annotations, width, height }: { annotations: PhotoAnnotation[]; width: number; height: number }) {
    return (
        <>
            <View style={StyleSheet.absoluteFill}>{renderPlacedPictures(annotations, width, height)}</View>
            <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
                {annotations.map((annotation) => renderAnnotation(annotation, width, height))}
            </Svg>
        </>
    );
});

/**
 * A blank page to draw on for a card: pen, highlighter, eraser and text on the bar, arrows,
 * boxes, cover-ups and pictures under "More", undo and redo, and the paper underneath. It saves
 * a PNG through the same export path the photo editor uses.
 */
export default function DrawingPadModal({ visible, onClose, onSaved }: DrawingPadModalProps) {
    const { t, l } = useI18n();
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const insets = useSafeAreaInsets();

    const [setup, setSetup] = useState<BlankCanvasSetup>(() => loadBlankCanvasSetup());
    const [annotations, setAnnotations] = useState<PhotoAnnotation[]>([]);
    const [liveAnnotation, setLiveAnnotation] = useState<PhotoAnnotation | null>(null);
    const [undoStack, setUndoStack] = useState<PadSnapshot[]>([]);
    const [redoStack, setRedoStack] = useState<PadSnapshot[]>([]);
    const [tool, setTool] = useState<DrawingTool>('pen');
    const [penColor, setPenColor] = useState(() => drawingPenInks(setup.background)[0]);
    const [highlighterColor, setHighlighterColor] = useState<string>(HIGHLIGHTER_INKS[0]);
    const [sizes, setSizes] = useState<Record<DrawingTool, DrawingSize>>(DEFAULT_SIZES);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [eraserRing, setEraserRing] = useState<{ x: number; y: number; radius: number } | null>(null);
    const [stage, setStage] = useState<{ width: number; height: number } | null>(null);
    const [pageSheet, setPageSheet] = useState(false);
    const [moreSheet, setMoreSheet] = useState(false);
    const [textEntry, setTextEntry] = useState<{ point: PhotoPoint } | { id: string } | null>(null);
    const [saving, setSaving] = useState(false);
    const [exportSurface, setExportSurface] = useState<ExportSurface | null>(null);

    // Every page opens the way the last one was left, with nothing on it.
    useEffect(() => {
        if (!visible) return;
        const stored = loadBlankCanvasSetup();
        setSetup(stored);
        setAnnotations([]);
        setLiveAnnotation(null);
        setUndoStack([]);
        setRedoStack([]);
        setTool('pen');
        setPenColor(drawingPenInks(stored.background)[0]);
        setSelectedId(null);
        setEraserRing(null);
        setPageSheet(false);
        setMoreSheet(false);
        setTextEntry(null);
    }, [visible]);

    const pageSize = pageSizeFor(setup);
    const canvasSize = useMemo(
        () => (stage ? fitDrawingPage(stage, pageSize) : { width: 1, height: 1 }),
        [stage, pageSize],
    );

    // What the gesture handlers and the history read, kept current on every render.
    const annotationsRef = useRef(annotations);
    annotationsRef.current = annotations;
    const setupRef = useRef(setup);
    setupRef.current = setup;
    const canvasSizeRef = useRef(canvasSize);
    canvasSizeRef.current = canvasSize;
    const brushRef = useRef<DrawingBrush>({ tool, penColor, highlighterColor, sizes });
    brushRef.current = { tool, penColor, highlighterColor, sizes };
    const undoStackRef = useRef(undoStack);
    undoStackRef.current = undoStack;
    const redoStackRef = useRef(redoStack);
    redoStackRef.current = redoStack;

    /** Remember the page as it was before an edit, and drop the redo branch the edit replaces. */
    const remember = (before: PhotoAnnotation[], beforeSetup = setupRef.current) => {
        undoStackRef.current = [...undoStackRef.current.slice(-(HISTORY_LIMIT - 1)), { annotations: before, setup: beforeSetup }];
        setUndoStack(undoStackRef.current);
        redoStackRef.current = [];
        setRedoStack([]);
    };

    const applyAnnotations = (next: PhotoAnnotation[]) => {
        annotationsRef.current = next;
        setAnnotations(next);
    };

    /** Change one label or picture, as one step of history. */
    const updateObject = (id: string, change: (object: PhotoText | PhotoImage) => PhotoText | PhotoImage) => {
        const before = annotationsRef.current;
        let changed = false;
        const next = before.map((annotation) => {
            if (annotation.id !== id || (annotation.type !== 'text' && annotation.type !== 'image')) return annotation;
            changed = true;
            return change(annotation);
        });
        if (!changed) return;
        remember(before);
        applyAnnotations(next);
    };

    const panResponder = useDrawingGestures({
        annotationsRef,
        canvasSizeRef,
        brushRef,
        applyAnnotations,
        remember: (before) => remember(before),
        setLiveAnnotation,
        setEraserRing,
        select: setSelectedId,
        openText: setTextEntry,
    });

    /** Move onto a remembered page, carrying the pen's ink across a change of page colour. */
    const restore = (target: PadSnapshot) => {
        if (target.setup.background !== setupRef.current.background) {
            setPenColor((current) => drawingInkForPage(current, setupRef.current.background, target.setup.background));
        }
        setupRef.current = target.setup;
        setSetup(target.setup);
        applyAnnotations(target.annotations);
        setSelectedId((id) => (id && target.annotations.some((annotation) => annotation.id === id) ? id : null));
    };

    const undo = () => {
        const current: PadSnapshot = { annotations: annotationsRef.current, setup: setupRef.current };
        const stack = undoStackRef.current;
        if (!stack.length) return;
        redoStackRef.current = [...redoStackRef.current, current];
        undoStackRef.current = stack.slice(0, -1);
        setRedoStack(redoStackRef.current);
        setUndoStack(undoStackRef.current);
        restore(stack[stack.length - 1]);
    };

    const redo = () => {
        const current: PadSnapshot = { annotations: annotationsRef.current, setup: setupRef.current };
        const stack = redoStackRef.current;
        if (!stack.length) return;
        undoStackRef.current = [...undoStackRef.current, current];
        redoStackRef.current = stack.slice(0, -1);
        setUndoStack(undoStackRef.current);
        setRedoStack(redoStackRef.current);
        restore(stack[stack.length - 1]);
    };

    /** Empty the page, after asking: one stray tap on the bin should not cost a whole drawing. */
    const clear = () => {
        if (!annotationsRef.current.length) return;
        confirm(
            l('Sayfa temizlensin mi?', 'Clear the page?'),
            l(
                'Sayfadaki çizimler, metinler ve görseller kaldırılacak. Fikrinizi değiştirirseniz geri alabilirsiniz.',
                'Every drawing, label and picture on the page will be removed. You can undo this if you change your mind.',
            ),
            () => {
                remember(annotationsRef.current);
                applyAnnotations([]);
                setSelectedId(null);
            },
            { destructive: true, confirmLabel: l('Temizle', 'Clear') },
        );
    };

    /** A new paper, colour or shape. The drawing stays; a new shape is fitted, not stretched. */
    const changeSetup = (next: BlankCanvasSetup) => {
        const current = setupRef.current;
        if (next.paper === current.paper && next.background === current.background && next.shape === current.shape) return;
        remember(annotationsRef.current, current);
        if (next.shape !== current.shape) {
            applyAnnotations(refitDrawingAnnotations(annotationsRef.current, pageSizeFor(current), pageSizeFor(next)));
        }
        if (next.background !== current.background) {
            setPenColor((color) => drawingInkForPage(color, current.background, next.background));
        }
        setupRef.current = next;
        setSetup(next);
        saveBlankCanvasSetup(next);
    };

    const chooseTool = (next: DrawingTool) => {
        setSelectedId(null);
        setTool(next);
    };

    const selectedObject = useMemo(() => {
        const found = selectedId ? annotations.find((annotation) => annotation.id === selectedId) : undefined;
        return found && (found.type === 'text' || found.type === 'image') ? found : null;
    }, [annotations, selectedId]);

    const changeColor = (color: string) => {
        if (tool === 'highlighter') {
            setHighlighterColor(color);
            return;
        }
        setPenColor(color);
        // A label in hand takes the colour too, the way selected text does everywhere else.
        if (selectedObject?.type === 'text' && selectedObject.color !== color) {
            updateObject(selectedObject.id, (object) => ({ ...object, color }));
        }
    };

    const changeSize = (size: DrawingSize) => {
        setSizes((current) => ({ ...current, [tool]: size }));
        if (selectedObject?.type === 'text' && tool === 'text') {
            updateObject(selectedObject.id, (object) => keepDrawingObjectOnPage({ ...object, fontSize: TEXT_SIZES[size] } as PhotoText, canvasSizeRef.current));
        } else if (selectedObject?.type === 'image' && tool === 'image') {
            const box = drawingImageBox(selectedObject, canvasSizeRef.current, size);
            updateObject(selectedObject.id, (object) => keepDrawingObjectOnPage({ ...object, width: box.width, height: box.height } as PhotoImage, canvasSizeRef.current));
        }
    };

    const deleteSelected = () => {
        if (!selectedObject) return;
        remember(annotationsRef.current);
        applyAnnotations(annotationsRef.current.filter((annotation) => annotation.id !== selectedObject.id));
        setSelectedId(null);
    };

    /** Put a picture from the library in the middle of the page, ready to be moved. */
    const addPicture = async () => {
        try {
            const asset = await pickDrawingPicture(l, t('common.cancel'));
            if (!asset) return;
            const box = drawingImageBox(asset, canvasSizeRef.current, brushRef.current.sizes.image);
            const picture: PhotoImage = {
                id: makeId(),
                type: 'image',
                uri: asset.uri,
                point: { x: 0.5, y: 0.5 },
                width: box.width,
                height: box.height,
                // A picture has no ink of its own; only the box and the source reach the page.
                color: '#ffffff',
                opacity: 1,
            };
            // Decode it now, so the export never photographs an empty box.
            if (Platform.OS !== 'web') NativeImage.prefetch(asset.uri).catch(() => {});
            remember(annotationsRef.current);
            applyAnnotations([...annotationsRef.current, picture]);
            setTool('image');
            setSelectedId(picture.id);
        } catch (error) {
            console.warn('[DrawingPad] picture pick failed:', error);
            alert(t('common.error'), l('Görsel eklenemedi.', 'Could not add the picture.'));
        }
    };

    const pickMoreTool = (next: DrawingShapeTool | 'image') => {
        setMoreSheet(false);
        if (next !== 'image') {
            chooseTool(next);
            return;
        }
        // The picker cannot be presented while the sheet is still leaving the screen.
        setTimeout(() => { void addPicture(); }, Platform.OS === 'ios' ? 450 : 0);
    };

    const editingText = textEntry && 'id' in textEntry
        ? annotations.find((annotation): annotation is PhotoText => annotation.id === textEntry.id && annotation.type === 'text') ?? null
        : null;

    const submitText = (text: string) => {
        const entry = textEntry;
        setTextEntry(null);
        if (!entry) return;
        if ('id' in entry) {
            if (!text) {
                remember(annotationsRef.current);
                applyAnnotations(annotationsRef.current.filter((annotation) => annotation.id !== entry.id));
                setSelectedId(null);
            } else {
                updateObject(entry.id, (object) => keepDrawingObjectOnPage({ ...object, text } as PhotoText, canvasSizeRef.current));
            }
            return;
        }
        if (!text) return;
        const label = keepDrawingObjectOnPage<PhotoText>({
            id: makeId(),
            type: 'text',
            text,
            point: entry.point,
            fontSize: TEXT_SIZES[brushRef.current.sizes.text],
            bgStyle: 'plain',
            textAlign: 'center',
            color: brushRef.current.penColor,
            width: 1,
            opacity: 1,
        }, canvasSizeRef.current);
        remember(annotationsRef.current);
        applyAnnotations([...annotationsRef.current, label]);
        setSelectedId(label.id);
    };

    const close = () => {
        if (saving) return;
        if (!annotationsRef.current.length && !undoStackRef.current.length) {
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
        exportPicturesReadyRef.current = 0;
        const pictures = annotationsRef.current.filter((annotation) => annotation.type === 'image').length;
        setExportSurface(surface);
        try {
            // Wait for the layout and for every picture to decode; a picture that never loads
            // costs the save a moment, not the drawing.
            const deadline = Date.now() + 4000;
            while ((!exportLaidOutRef.current || exportPicturesReadyRef.current < pictures) && Date.now() < deadline) {
                await nextFrame();
            }
            await nextFrame();
            return await captureRef(exportSurfaceRef, { format: 'png', quality: 1, result: 'tmpfile', useRenderInContext: true });
        } finally {
            setExportSurface(null);
        }
    };

    const save = async () => {
        if (saving || !annotationsRef.current.length) return;
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
                    annotationsRef.current,
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
    const nothingDrawn = annotations.length === 0;
    const showSelection = selectedObject && (tool === 'text' || tool === 'image');

    const historyButton = (label: string, enabled: boolean, onPress: () => void, Glyph: typeof UndoGlyph) => (
        <TouchableOpacity
            style={[styles.historyButton, !enabled && styles.disabled]}
            onPress={onPress}
            disabled={!enabled}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{ disabled: !enabled }}
        >
            <Glyph color={colors.textPrimary} size={20} />
        </TouchableOpacity>
    );

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

                <View style={styles.historyBar}>
                    {historyButton(l('Geri al', 'Undo'), undoStack.length > 0, undo, UndoGlyph)}
                    {historyButton(l('Yinele', 'Redo'), redoStack.length > 0, redo, RedoGlyph)}
                    {historyButton(l('Sayfayı temizle', 'Clear page'), !nothingDrawn, clear, ClearGlyph)}
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
                                    <AnnotationLayer annotations={annotations} width={canvasSize.width} height={canvasSize.height} />
                                    {liveAnnotation && (
                                        <Svg width={canvasSize.width} height={canvasSize.height} style={StyleSheet.absoluteFill}>
                                            {renderAnnotation(liveAnnotation, canvasSize.width, canvasSize.height)}
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
                                {showSelection && (
                                    <SelectionFrame object={selectedObject} canvas={canvasSize} onDelete={deleteSelected} />
                                )}
                            </View>
                        </View>
                    )}
                </View>

                <DrawingToolbar
                    tool={tool}
                    onToolChange={chooseTool}
                    onMorePress={() => setMoreSheet(true)}
                    inks={inks}
                    color={color}
                    onColorChange={changeColor}
                    size={sizes[tool]}
                    onSizeChange={changeSize}
                    bottomInset={insets.bottom}
                />

                <PageOptionsSheet
                    visible={pageSheet}
                    setup={setup}
                    onChange={changeSetup}
                    onClose={() => setPageSheet(false)}
                />
                <MoreToolsSheet
                    visible={moreSheet}
                    tool={tool}
                    onPick={pickMoreTool}
                    onClose={() => setMoreSheet(false)}
                />
                <TextEntrySheet
                    visible={textEntry !== null}
                    initialText={editingText?.text ?? ''}
                    editing={editingText !== null}
                    color={editingText?.color ?? penColor}
                    onSubmit={submitText}
                    onClose={() => setTextEntry(null)}
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
                        annotations={annotations}
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
        historyBar: {
            flexDirection: 'row',
            justifyContent: 'flex-end',
            gap: Spacing.sm,
            paddingHorizontal: Spacing.md,
            paddingTop: Spacing.sm,
        },
        historyButton: {
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: colors.bgCard,
            alignItems: 'center',
            justifyContent: 'center',
            ...Shadows.sm,
        },
        disabled: { opacity: 0.35 },
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
