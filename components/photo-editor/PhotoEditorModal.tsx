import { useEffect, useMemo, useRef, useState } from 'react';
import {
    Modal,
    PanResponder,
    PixelRatio,
    Platform,
    StyleSheet,
    View,
    type LayoutChangeEvent,
} from 'react-native';
import { GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { Text } from '../AppText';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg from 'react-native-svg';
import { captureRef } from 'react-native-view-shot';
import { BorderRadius, FontSize, Shadows, Spacing, useThemeColors, type ColorScheme } from '../../constants/theme';
import { useI18n } from '../../hooks/useI18n';
import { alert, confirm } from '../../lib/confirm';
import { attachmentMediaFilename } from '../../lib/mediaFilename';
import { guessMimeFromFilename, saveMediaBytes, saveMediaFromUri } from '../../lib/mediaStore';
import { HIGHLIGHTER_INKS, type DrawingShapeTool } from '../../lib/drawingPad';
import type { PhotoAnnotation, PhotoCropRect } from '../../lib/photoEditor';
import {
    FULL_PHOTO_CROP,
    isIdentityPhotoGeometry,
    orientedPhotoSize,
    photoBaseSteps,
    photoCropSize,
    type PhotoSize,
    type PhotoTurnDirection,
} from '../../lib/photoGeometry';
import { photoCropAspectRatio, photoCropForAspect, turnedPhotoCropAspect, type PhotoCropAspectId } from '../../lib/photoCrop';
import {
    PHOTO_FILTERS,
    isNeutralPhotoAdjustments,
    photoColorMatrix,
    samePhotoAdjustments,
    type PhotoAdjustmentKey,
    type PhotoAdjustments,
    type PhotoFilterId,
} from '../../lib/photoAdjustments';
import {
    INITIAL_PHOTO_EDIT,
    cropPhotoEdit,
    isPhotoEditUntouched,
    mirrorPhotoEdit,
    photoCropScreenCanvas,
    photoEditCanvas,
    photoEditExportSurface,
    resetPhotoEditGeometry,
    turnPhotoEdit,
    type PhotoEdit,
} from '../../lib/photoEdit';
import { PHOTO_LABEL_STYLES, PHOTO_PEN_INKS, photoCanvasScale, reframePhotoAnnotations } from '../../lib/photoMarkup';
import { PHOTO_JPEG_QUALITY } from '../../lib/photoCompression';
import ScreenHeader from '../ScreenHeader';
import { DrawingToolbar } from '../drawing/DrawingToolbar';
import { MoreToolsSheet } from '../drawing/MoreToolsSheet';
import { SelectionFrame } from '../drawing/SelectionFrame';
import { TextEntrySheet } from '../drawing/TextEntrySheet';
import { RedoGlyph, UndoGlyph } from '../drawing/drawingGlyphs';
import { Button, IconButton } from '../ui/Button';
import { LoadingState } from '../ui/Feedback';
import { EXPORT_MAX_DIMENSION, type ExportSurface } from './editorModel';
import { AnnotationLayer, renderAnnotation } from './annotationRendering';
import { rasterizeEditedPhotoWeb } from './webExport';
import { ExportSurfaceView } from './ExportSurfaceView';
import { PhotoLayer } from './PhotoLayer';
import { CropFrame } from './CropFrame';
import { CropPanel } from './CropPanel';
import { AdjustPanel, type PhotoAdjustTab } from './AdjustPanel';
import { EditModeTabs, type PhotoEditMode } from './EditModeTabs';
import { RevertGlyph } from './photoEditorGlyphs';
import { useCropGestures } from './useCropGestures';
import { usePhotoDrawing } from './usePhotoDrawing';
import { usePhotoEditHistory } from './usePhotoEditHistory';
import { bakePhotoGeometry, preparePhotoForEditing, type EditingPhoto, type PhotoFileFormat } from './photoExport';

export interface EditablePhoto {
    uri: string;
    name: string;
    width?: number;
    height?: number;
}

interface PhotoEditorModalProps {
    visible: boolean;
    photo: EditablePhoto | null;
    onClose: () => void;
    /** Receives the stored image's media filename once the photo is added to the card. */
    onSaved: (filename: string) => void;
}

/** The off-screen surface a native export photographs, and what goes on it. */
type ExportJob = {
    surface: ExportSurface;
    uri: string;
    size: PhotoSize;
    matrix: number[] | null;
    annotations: PhotoAnnotation[];
};

/** The panels under the photo, one per screen, all laid out so the tallest sets the room they take. */
const PANEL_MODES: PhotoEditMode[] = ['crop', 'adjust', 'draw'];
/** The photo is the picture, so "More" offers no second one. */
const PHOTO_MORE_TOOLS: DrawingShapeTool[] = ['arrow', 'rect', 'ellipse', 'cover'];
const UNIT: PhotoSize = { width: 1, height: 1 };

/**
 * A picked photo, edited the way a drawing is drawn: the drawing pad's header, history and bar,
 * with three screens under the tabs. Crop frames, turns and mirrors the photo; Adjust sets its
 * light and colour; Draw marks it up with the pad's tools. Nothing touches the photo's pixels
 * until it is added, so every step is instant, undoable and can be revisited in any order.
 */
export default function PhotoEditorModal({ visible, photo, onClose, onSaved }: PhotoEditorModalProps) {
    const { t, l } = useI18n();
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const insets = useSafeAreaInsets();
    const history = usePhotoEditHistory();
    const { edit, editRef } = history;
    const { geometry } = edit;

    const [working, setWorking] = useState<EditingPhoto | null>(null);
    const [mode, setMode] = useState<PhotoEditMode>('crop');
    const [stage, setStage] = useState<PhotoSize | null>(null);
    const [cropAspect, setCropAspect] = useState<PhotoCropAspectId>('free');
    const [draftCrop, setDraftCrop] = useState<PhotoCropRect | null>(null);
    const [adjustTab, setAdjustTab] = useState<PhotoAdjustTab>('filters');
    const [draftAdjustments, setDraftAdjustments] = useState<PhotoAdjustments | null>(null);
    const [comparing, setComparing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [exportJob, setExportJob] = useState<ExportJob | null>(null);
    // Each screen's panel height as laid out, kept at its tallest. The panels share one area as tall
    // as the tallest of them, so the photo above keeps its place and size from screen to screen.
    const [panelHeights, setPanelHeights] = useState<Record<PhotoEditMode, number>>({ crop: 0, adjust: 0, draw: 0 });

    const photoSize = useMemo<PhotoSize>(
        () => (working ? { width: working.preview.width, height: working.preview.height } : { width: 4, height: 3 }),
        [working],
    );
    const oriented = useMemo(() => orientedPhotoSize(photoSize, geometry.quarterTurns), [photoSize, geometry.quarterTurns]);
    const drawCanvas = useMemo(() => (stage ? photoEditCanvas(photoSize, geometry, stage) : UNIT), [stage, photoSize, geometry]);
    const cropCanvas = useMemo(() => (stage ? photoCropScreenCanvas(photoSize, geometry, stage) : UNIT), [stage, photoSize, geometry]);
    const cropOffset = stage
        ? { x: (stage.width - cropCanvas.width) / 2, y: (stage.height - cropCanvas.height) / 2 }
        : { x: 0, y: 0 };
    const shownAdjustments = draftAdjustments ?? edit.adjustments;
    const matrix = useMemo(() => (comparing ? null : photoColorMatrix(shownAdjustments)), [comparing, shownAdjustments]);

    // What the gesture handlers read, kept current on every render.
    const annotationsRef = useRef(edit.annotations);
    annotationsRef.current = edit.annotations;
    const drawCanvasRef = useRef(drawCanvas);
    drawCanvasRef.current = drawCanvas;
    const cropCanvasRef = useRef(cropCanvas);
    cropCanvasRef.current = cropCanvas;
    const cropOffsetRef = useRef(cropOffset);
    cropOffsetRef.current = cropOffset;
    const cropRef = useRef(geometry.crop);
    cropRef.current = geometry.crop;
    const aspectRef = useRef(photoCropAspectRatio(cropAspect, oriented));
    aspectRef.current = photoCropAspectRatio(cropAspect, oriented);
    const photoSizeRef = useRef(photoSize);
    photoSizeRef.current = photoSize;
    const stageRef = useRef(stage);
    stageRef.current = stage;

    /** One step of history. */
    const commit = (next: PhotoEdit) => {
        history.commit(next);
        annotationsRef.current = next.annotations;
    };

    const drawing = usePhotoDrawing({
        annotations: edit.annotations,
        annotationsRef,
        canvasSizeRef: drawCanvasRef,
        applyAnnotations: (next) => {
            annotationsRef.current = next;
            history.apply({ ...editRef.current, annotations: next });
        },
        remember: (before) => history.remember({ ...editRef.current, annotations: before }),
        enabled: mode === 'draw',
    });

    const cropResponder = useCropGestures({
        canvasRef: cropCanvasRef,
        offsetRef: cropOffsetRef,
        cropRef,
        aspectRef,
        setDraft: setDraftCrop,
        commit: (crop) => {
            if (stageRef.current) commit(cropPhotoEdit(editRef.current, crop, photoSizeRef.current, stageRef.current));
        },
    });

    // Holding the photo on the adjust screen shows it without the light and colour, to compare.
    const compareResponder = useRef(PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onPanResponderGrant: () => setComparing(true),
        onPanResponderRelease: () => setComparing(false),
        onPanResponderTerminate: () => setComparing(false),
    })).current;

    // Every photo opens on the crop screen with nothing done to it, once its upright copy is ready.
    useEffect(() => {
        if (!visible || !photo) return;
        let cancelled = false;
        history.reset();
        drawing.reset();
        setWorking(null);
        setMode('crop');
        setCropAspect('free');
        setDraftCrop(null);
        setAdjustTab('filters');
        setDraftAdjustments(null);
        setComparing(false);
        preparePhotoForEditing(photo.uri)
            .then((prepared) => {
                if (!cancelled) setWorking(prepared);
            })
            .catch((error) => {
                console.warn('[PhotoEditor] could not open the photo:', error);
                if (cancelled) return;
                alert(t('common.error'), l('Fotoğraf editörde açılamadı.', 'Could not open the photo in the editor.'));
                onClose();
            });
        return () => {
            cancelled = true;
        };
    }, [visible, photo?.uri]);

    const changeMode = (next: PhotoEditMode) => {
        if (next === mode) return;
        drawing.select(null);
        setDraftCrop(null);
        setDraftAdjustments(null);
        setComparing(false);
        setMode(next);
    };

    const turn = (direction: PhotoTurnDirection) => {
        if (!working || !stage) return;
        drawing.select(null);
        commit(turnPhotoEdit(editRef.current, direction, photoSize, stage));
        // A locked landscape frame is a portrait one once the photo stands up.
        setCropAspect(turnedPhotoCropAspect);
    };

    const mirror = () => {
        if (working) commit(mirrorPhotoEdit(editRef.current));
    };

    const resetGeometry = () => {
        if (!working || !stage) return;
        commit(resetPhotoEditGeometry(editRef.current, photoSize, stage));
        setCropAspect('free');
    };

    const chooseAspect = (id: PhotoCropAspectId) => {
        setCropAspect(id);
        const ratio = photoCropAspectRatio(id, oriented);
        if (!ratio || !working || !stage) return;
        const crop = photoCropForAspect(editRef.current.geometry.crop, ratio, oriented);
        commit(cropPhotoEdit(editRef.current, crop, photoSize, stage));
    };

    const slide = (key: PhotoAdjustmentKey, value: number) => {
        setDraftAdjustments({ ...editRef.current.adjustments, [key]: value });
    };

    const slideEnd = (key: PhotoAdjustmentKey, value: number) => {
        setDraftAdjustments(null);
        const adjustments = { ...editRef.current.adjustments, [key]: value };
        if (!samePhotoAdjustments(adjustments, editRef.current.adjustments)) commit({ ...editRef.current, adjustments });
    };

    const applyFilter = (id: PhotoFilterId) => {
        const filter = PHOTO_FILTERS.find((candidate) => candidate.id === id);
        if (!filter || samePhotoAdjustments(filter.adjustments, editRef.current.adjustments)) return;
        commit({ ...editRef.current, adjustments: filter.adjustments });
    };

    /** After a step through history: nothing half-done left over, and a lock the frame no longer keeps let go. */
    const settle = (restored: PhotoEdit | null) => {
        if (!restored) return;
        annotationsRef.current = restored.annotations;
        setDraftCrop(null);
        setDraftAdjustments(null);
        drawing.keepSelectionIn(restored.annotations);
        const ratio = photoCropAspectRatio(cropAspect, orientedPhotoSize(photoSize, restored.geometry.quarterTurns));
        const kept = photoCropSize(photoSize, restored.geometry);
        if (ratio && Math.abs(kept.width / kept.height - ratio) > 0.01) setCropAspect('free');
    };

    const undo = () => settle(history.undo());
    const redo = () => settle(history.redo());

    /** Everything off the photo at once, after asking: undo can still bring it back. */
    const revertAll = () => {
        if (isPhotoEditUntouched(editRef.current)) return;
        confirm(
            l('Orijinal fotoğrafa dönülsün mü?', 'Go back to the original photo?'),
            l(
                'Kırpma, döndürme, ayarlar ve çizimler kaldırılacak. Fikrinizi değiştirirseniz geri alabilirsiniz.',
                'The crop, rotation, adjustments and drawings will be removed. You can undo this if you change your mind.',
            ),
            () => {
                commit(INITIAL_PHOTO_EDIT);
                drawing.keepSelectionIn([]);
                setCropAspect('free');
            },
            { destructive: true, confirmLabel: l('Orijinale dön', 'Revert') },
        );
    };

    const close = () => {
        if (saving) return;
        if (!history.canUndo) {
            onClose();
            return;
        }
        confirm(
            l('Düzenlemeyi bırak?', 'Discard edits?'),
            l('Bu fotoğrafta yaptığınız değişiklikler karta eklenmeden silinecek.', 'Your changes to this photo will be lost without being added to the card.'),
            onClose,
            { destructive: true },
        );
    };

    // Native export: the edited photo is drawn again off screen at export size and photographed
    // there, through the same filter the screen used, with none of the editing chrome.
    const exportSurfaceRef = useRef<View>(null);
    const exportLaidOutRef = useRef(false);
    const exportPhotoLoadedRef = useRef(false);
    const exportPicturesReadyRef = useRef(0);
    const nextFrame = () => new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 32);
        requestAnimationFrame(() => {
            clearTimeout(timer);
            resolve();
        });
    });

    const captureNative = async (job: ExportJob, format: PhotoFileFormat): Promise<string> => {
        exportLaidOutRef.current = false;
        exportPhotoLoadedRef.current = false;
        exportPicturesReadyRef.current = 0;
        setExportJob(job);
        try {
            // Wait for the layout and for the photo to decode; a photo that never reports in costs
            // the save a moment, not the edit.
            const deadline = Date.now() + 5000;
            while ((!exportLaidOutRef.current || !exportPhotoLoadedRef.current) && Date.now() < deadline) {
                await nextFrame();
            }
            await nextFrame();
            return await captureRef(exportSurfaceRef, {
                format: format === 'png' ? 'png' : 'jpg',
                quality: PHOTO_JPEG_QUALITY,
                result: 'tmpfile',
                useRenderInContext: true,
            });
        } finally {
            setExportJob(null);
        }
    };

    const save = async () => {
        if (saving || !working || !photo) return;
        const current = editRef.current;
        setSaving(true);
        try {
            let filename: string;
            if (isPhotoEditUntouched(current)) {
                // Nothing was changed, so the photo goes in byte for byte, as "Insert as is" does.
                filename = attachmentMediaFilename(`${Date.now()}_${photo.name}`);
                await saveMediaFromUri(filename, photo.uri, guessMimeFromFilename(filename) || undefined);
            } else {
                const { format } = working;
                filename = attachmentMediaFilename(`${Date.now()}_duzenlenmis.${format === 'png' ? 'png' : 'jpg'}`);
                const mimeType = format === 'png' ? 'image/png' : 'image/jpeg';
                const colorMatrix = photoColorMatrix(current.adjustments);
                const overlay = colorMatrix !== null || current.annotations.length > 0;
                // The turn, mirror and crop go into the original's pixels first, at the export size;
                // light, colour and markup are laid over that.
                const base = await bakePhotoGeometry(photo.uri, working.original, current.geometry, EXPORT_MAX_DIMENSION, overlay ? 'png' : format);
                if (!overlay) {
                    await saveMediaFromUri(filename, base.uri, mimeType);
                } else {
                    const surface = photoEditExportSurface(base, drawCanvasRef.current, Platform.OS === 'web' ? 1 : PixelRatio.get());
                    if (Platform.OS === 'web') {
                        const bytes = await rasterizeEditedPhotoWeb(base.uri, colorMatrix, current.annotations, surface, format);
                        await saveMediaBytes(filename, bytes, mimeType);
                    } else {
                        const job = { surface, uri: base.uri, size: { width: base.width, height: base.height }, matrix: colorMatrix, annotations: current.annotations };
                        await saveMediaFromUri(filename, await captureNative(job, format), mimeType);
                    }
                }
            }
            onSaved(filename);
            onClose();
        } catch (error) {
            console.warn('[PhotoEditor] save failed:', error);
            alert(t('common.error'), l('Düzenlenen fotoğraf kaydedilemedi.', 'Could not save the edited photo.'));
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

    // The crop screen shows the whole photo, so the markup is drawn on it where it sits on the photo.
    const cropViewAnnotations = useMemo(() => {
        if (mode !== 'crop' || !edit.annotations.length) return edit.annotations;
        const factor = photoCanvasScale(cropCanvas.width, oriented.width)
            / photoCanvasScale(drawCanvas.width, photoCropSize(photoSize, geometry).width);
        return reframePhotoAnnotations(edit.annotations, geometry.crop, FULL_PHOTO_CROP, factor);
    }, [mode, edit.annotations, geometry, photoSize, oriented, cropCanvas, drawCanvas]);

    // What the card will get: the untouched original, or the crop at the export cap — taken to
    // whole points when light, colour or markup have to be photographed over it, as `save` does.
    const outputSize = useMemo(() => {
        if (!working) return null;
        const base = photoBaseSteps(
            working.original,
            { ...geometry, crop: draftCrop ?? geometry.crop },
            isPhotoEditUntouched(edit) && !draftCrop ? 0 : EXPORT_MAX_DIMENSION,
        ).size;
        if (!edit.annotations.length && isNeutralPhotoAdjustments(edit.adjustments)) return base;
        const ratio = Platform.OS === 'web' ? 1 : PixelRatio.get();
        const surface = photoEditExportSurface(base, drawCanvas, ratio);
        return { width: surface.width * ratio, height: surface.height * ratio };
    }, [working, geometry, draftCrop, edit, drawCanvas]);
    const inks = drawing.tool === 'highlighter' ? HIGHLIGHTER_INKS : drawing.tool === 'eraser' ? [] : PHOTO_PEN_INKS;
    const untouched = isPhotoEditUntouched(edit);

    const historyButton = (label: string, enabled: boolean, onPress: () => void, Glyph: typeof UndoGlyph) => (
        <IconButton accessibilityLabel={label} onPress={onPress} disabled={!enabled}>
            <Glyph color={colors.textPrimary} size={22} />
        </IconButton>
    );

    const measurePanel = (panel: PhotoEditMode) => (event: LayoutChangeEvent) => {
        const height = Math.ceil(event.nativeEvent.layout.height);
        setPanelHeights((current) => (current[panel] >= height ? current : { ...current, [panel]: height }));
    };
    const panelAreaHeight = Math.max(panelHeights.crop, panelHeights.adjust, panelHeights.draw);

    const panelFor = (panel: PhotoEditMode) => {
        if (panel === 'crop') {
            return (
                <CropPanel
                    aspect={cropAspect}
                    onAspectChange={chooseAspect}
                    onTurn={turn}
                    onMirror={mirror}
                    onReset={resetGeometry}
                    canReset={!isIdentityPhotoGeometry(geometry)}
                    disabled={!working}
                />
            );
        }
        if (panel === 'adjust') {
            return (
                <AdjustPanel
                    tab={adjustTab}
                    onTabChange={setAdjustTab}
                    adjustments={shownAdjustments}
                    onFilter={applyFilter}
                    onSlide={slide}
                    onSlideEnd={slideEnd}
                    disabled={!working}
                />
            );
        }
        return (
            <DrawingToolbar
                tool={drawing.tool}
                onToolChange={drawing.chooseTool}
                onMorePress={drawing.openMore}
                inks={inks}
                color={drawing.color}
                onColorChange={drawing.changeColor}
                size={drawing.sizes[drawing.tool]}
                onSizeChange={drawing.changeSize}
                bottomInset={0}
            />
        );
    };

    const cropStage = working && (
        <View
            style={[
                styles.cropCanvas,
                { left: cropOffset.x, top: cropOffset.y, width: cropCanvas.width, height: cropCanvas.height },
                { pointerEvents: 'none' },
            ]}
        >
            <PhotoLayer uri={working.preview.uri} source={photoSize} orientation={geometry} window={FULL_PHOTO_CROP} canvas={cropCanvas} matrix={matrix} />
            <AnnotationLayer annotations={cropViewAnnotations} width={cropCanvas.width} height={cropCanvas.height} />
            <CropFrame crop={draftCrop ?? geometry.crop} canvas={cropCanvas} active={draftCrop !== null} />
        </View>
    );

    const pageStage = working && (
        <View style={[styles.pageShadow, { width: drawCanvas.width, height: drawCanvas.height }]}>
            {/* Drawing is a native gesture, switched on only on the draw screen; the adjust
                screen's press-and-hold compare stays a JS responder. */}
            <GestureDetector gesture={drawing.gesture}>
                <View
                    style={[styles.page, { width: drawCanvas.width, height: drawCanvas.height }]}
                    accessible
                    accessibilityLabel={mode === 'draw' ? l('Fotoğraf, çizim alanı', 'Photo, drawing area') : l('Fotoğraf', 'Photo')}
                    accessibilityHint={mode === 'draw'
                        ? l('Çizmek için parmağınızı sürükleyin', 'Drag a finger to draw')
                        : l('Orijinalini görmek için basılı tutun', 'Press and hold to see the original')}
                    {...(mode === 'draw' ? null : compareResponder.panHandlers)}
                >
                    <View style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}>
                        <PhotoLayer uri={working.preview.uri} source={photoSize} orientation={geometry} window={geometry.crop} canvas={drawCanvas} matrix={matrix} />
                        <AnnotationLayer annotations={edit.annotations} width={drawCanvas.width} height={drawCanvas.height} />
                        {drawing.liveAnnotation && (
                            <Svg width={drawCanvas.width} height={drawCanvas.height} style={StyleSheet.absoluteFill}>
                                {renderAnnotation(drawing.liveAnnotation, drawCanvas.width, drawCanvas.height)}
                            </Svg>
                        )}
                        {drawing.eraserRing && (
                            <View
                                style={[
                                    styles.eraserRing,
                                    {
                                        left: drawing.eraserRing.x - drawing.eraserRing.radius,
                                        top: drawing.eraserRing.y - drawing.eraserRing.radius,
                                        width: drawing.eraserRing.radius * 2,
                                        height: drawing.eraserRing.radius * 2,
                                        borderRadius: drawing.eraserRing.radius,
                                    },
                                ]}
                            />
                        )}
                        {comparing && (
                            <View style={styles.compareBadge}>
                                <Text style={styles.compareText}>{l('Orijinal', 'Original')}</Text>
                            </View>
                        )}
                    </View>
                </View>
            </GestureDetector>
            {/* Over the photo rather than in it: a touch on the delete button must not also reach
                the drawing gesture, which would take it for a stroke. */}
            {mode === 'draw' && drawing.tool === 'text' && drawing.selectedLabel && (
                <View style={[StyleSheet.absoluteFill, { pointerEvents: 'box-none' }]}>
                    <SelectionFrame object={drawing.selectedLabel} canvas={drawCanvas} onDelete={drawing.deleteSelected} />
                </View>
            )}
        </View>
    );

    return (
        <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={close}>
            {/* A modal is a root of its own, so the drawing gesture needs its own gesture root. */}
            <GestureHandlerRootView style={[styles.container, { paddingTop: insets.top }]}>
                {/* × asks before edits are thrown away; `close` does nothing while a save runs.
                    Undo, redo and back to the original sit in the top bar, before Add. */}
                <ScreenHeader
                    leading="close"
                    onBack={close}
                    backAccessibilityLabel={l('Fotoğraf düzenlemeyi iptal et', 'Cancel photo editing')}
                    title={l('Fotoğraf', 'Photo')}
                    actions={(
                        <>
                            {historyButton(l('Geri al', 'Undo'), history.canUndo, undo, UndoGlyph)}
                            {historyButton(l('Yinele', 'Redo'), history.canRedo, redo, RedoGlyph)}
                            {historyButton(l('Orijinale dön', 'Revert to original'), !untouched, revertAll, RevertGlyph)}
                            <Button
                                label={l('Ekle', 'Add')}
                                size="compact"
                                onPress={save}
                                disabled={!working}
                                busy={saving}
                                accessibilityLabel={outputSize
                                    ? l(
                                        `Fotoğrafı karta ekle, ${outputSize.width} × ${outputSize.height} piksel`,
                                        `Add the photo to the card, ${outputSize.width} × ${outputSize.height} pixels`,
                                    )
                                    : l('Fotoğrafı karta ekle', 'Add the photo to the card')}
                                style={styles.addButton}
                            />
                        </>
                    )}
                />

                <View
                    style={styles.stage}
                    onLayout={onStageLayout}
                    {...(mode === 'crop' ? cropResponder.panHandlers : null)}
                    accessible={mode === 'crop' && working !== null}
                    accessibilityLabel={mode === 'crop' ? l('Kırpma çerçevesi', 'Crop frame') : undefined}
                    accessibilityHint={mode === 'crop'
                        ? l('Bir köşeyi ya da kenarı sürükleyerek boyutlandırın, içinden sürükleyerek taşıyın', 'Drag a corner or an edge to resize it, drag inside to move it')
                        : undefined}
                >
                    {!working || !stage
                        ? <LoadingState />
                        : mode === 'crop' ? cropStage : pageStage}
                </View>

                {/* All three panels are laid out, the others hidden, in one area as tall as the
                    tallest: the stage above, and the photo on it, never change size with the screen. */}
                <View style={[styles.panelArea, panelAreaHeight > 0 && { height: panelAreaHeight }]}>
                    {PANEL_MODES.map((panel) => {
                        const active = panel === mode;
                        return (
                            <View
                                key={panel}
                                onLayout={measurePanel(panel)}
                                style={[styles.panelSlot, !active && styles.panelHidden, { pointerEvents: active ? 'auto' : 'none' }]}
                                accessibilityElementsHidden={!active}
                                importantForAccessibility={active ? 'auto' : 'no-hide-descendants'}
                            >
                                {panelFor(panel)}
                            </View>
                        );
                    })}
                </View>
                <EditModeTabs mode={mode} onChange={changeMode} bottomInset={insets.bottom} />

                <MoreToolsSheet
                    visible={drawing.moreSheet}
                    tool={drawing.tool}
                    tools={PHOTO_MORE_TOOLS}
                    onPick={drawing.pickMoreTool}
                    onClose={drawing.closeMore}
                />
                <TextEntrySheet
                    visible={drawing.textEntry !== null}
                    initialText={drawing.editingText?.text ?? ''}
                    editing={drawing.editingText !== null}
                    color={drawing.editingText?.color ?? drawing.penColor}
                    labelStyles={PHOTO_LABEL_STYLES}
                    labelStyle={drawing.labelStyle}
                    onLabelStyleChange={drawing.setLabelStyle}
                    onSubmit={drawing.submitText}
                    onClose={drawing.closeText}
                />

                {exportJob && (
                    <ExportSurfaceView
                        exportSurface={exportJob.surface}
                        exportSurfaceRef={exportSurfaceRef}
                        exportLaidOutRef={exportLaidOutRef}
                        exportPhotoLoadedRef={exportPhotoLoadedRef}
                        exportPicturesReadyRef={exportPicturesReadyRef}
                        page={null}
                        sourceUri={exportJob.uri}
                        sourceSize={exportJob.size}
                        annotations={exportJob.annotations}
                        colorMatrix={exportJob.matrix}
                    />
                )}
            </GestureHandlerRootView>
        </Modal>
    );
}

function createStyles(colors: ColorScheme) {
    return StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.bgPrimary },
        addButton: { marginLeft: Spacing.xs },
        stage: { flex: 1, minHeight: 0, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
        panelArea: { backgroundColor: colors.bgCard },
        panelSlot: { position: 'absolute', left: 0, right: 0, top: 0 },
        panelHidden: { opacity: 0 },
        cropCanvas: { position: 'absolute' },
        // The shadow sits on a wrapper: iOS clips a shadow drawn by a view that clips its content.
        pageShadow: { borderRadius: BorderRadius.sm, backgroundColor: colors.bgCard, ...Shadows.md },
        page: {
            borderRadius: BorderRadius.sm,
            overflow: 'hidden',
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: colors.border,
        },
        // The ring and the badge are drawn over the photo, whatever its colours, like the crop
        // frame, so they keep their own grey, white and black.
        eraserRing: {
            position: 'absolute',
            borderWidth: 1.5,
            borderColor: 'rgba(100, 116, 110, 0.9)',
            backgroundColor: 'rgba(255, 255, 255, 0.35)',
        },
        compareBadge: {
            position: 'absolute',
            top: Spacing.sm,
            left: Spacing.sm,
            paddingHorizontal: Spacing.sm,
            paddingVertical: 3,
            borderRadius: BorderRadius.full,
            backgroundColor: 'rgba(0, 0, 0, 0.6)',
        },
        compareText: { color: '#ffffff', fontSize: FontSize.xs, fontWeight: '700' },
    });
}
