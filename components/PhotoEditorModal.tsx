import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
    useWindowDimensions,
    type LayoutChangeEvent,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg from 'react-native-svg';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { captureRef } from 'react-native-view-shot';
import { useThemeColors } from '../constants/theme';
import { alert, confirm } from '../lib/confirm';
import { promptPermissionSettings } from '../lib/permissions';
import { mediaFilenameForPickedAsset, sanitizeMediaFilename } from '../lib/mediaFilename';
import { guessMimeFromFilename, saveMediaBytes, saveMediaFromUri } from '../lib/mediaStore';
import {
    applyAspectRatioToCropRect,
    calculateSourceCropPixels,
    clampPhotoPoint,
    clampPhotoTextSize,
    cropPhotoAnnotation,
    normalizePhotoRotation,
    photoRotateHandleSide,
    photoImagePlacement,
    photoSelectionHandlePoints,
    photoTrashPillRect,
    photoExportSurface,
    resizePhotoImage,
    rotatePhotoAnnotationClockwise,
    type PhotoAnnotation,
    type PhotoCropRect,
    type PhotoEraserMode,
    type PhotoImage,
    type PhotoPoint,
    type PhotoSelectionHandle,
    type PhotoText,
    type PhotoTextAlign,
    type PhotoTextStyle,
} from '../lib/photoEditor';
import {
    blankCanvasDefaultInk,
    cropBlankCanvasRuling,
    cropBlankCanvasSize,
    defaultBlankCanvasRuling,
    rotateBlankCanvasRulingClockwise,
    scaleBlankCanvasRuling,
    type BlankCanvasPage,
    type BlankCanvasPaper,
} from '../lib/blankCanvas';
import { useI18n } from '../hooks/useI18n';
import PaperSwatch from './PaperSwatch';
import {
    DRAW_COLORS,
    ERASER_RADII,
    EXPORT_MAX_DIMENSION,
    FONT_SIZES,
    TOOL_ITEMS,
    WIDTHS,
    makeId,
    sameSourceSize,
    selectionGeometryFor,
    tick,
    type EditorHistoryState,
    type EditorPage,
    type EditorTool,
    type ExportSurface,
} from './photo-editor/editorModel';
import { renderAnnotation, renderPlacedPictures } from './photo-editor/annotationRendering';
import { rasterizeBlankCanvasWeb, rasterizePhotoWeb } from './photo-editor/webExport';
import { createPhotoEditorStyles } from './photo-editor/photoEditorStyles';
import { usePhotoEditorPanResponder } from './photo-editor/usePhotoEditorPanResponder';
import { CropOverlay, SelectionOverlay, TrashZone } from './photo-editor/CanvasOverlays';
import { EditorControls } from './photo-editor/EditorControls';
import { PageSheet, PictureSourceSheet, TextComposerModal } from './photo-editor/EditorSheets';
import { ExportSurfaceView } from './photo-editor/ExportSurfaceView';

export interface EditablePhoto {
    uri: string;
    name: string;
    width?: number;
    height?: number;
}

interface PhotoEditorModalProps {
    visible: boolean;
    photo: EditablePhoto | null;
    /**
     * Opens the same editor on a drawn page instead of a picture. The page has no source
     * bitmap, so rotate and crop are pure geometry and the export renders the page itself.
     */
    blankPage?: BlankCanvasPage | null;
    onClose: () => void;
    onSaved: (filename: string) => void;
}

export default function PhotoEditorModal({ visible, photo, blankPage, onClose, onSaved }: PhotoEditorModalProps) {
    const { t, l } = useI18n();
    const toolItems = useMemo(() => [
        { ...TOOL_ITEMS[0], label: l('Kalem', 'Pen') },
        { ...TOOL_ITEMS[1], label: l('Vurgula', 'Highlighter') },
        { ...TOOL_ITEMS[2], label: l('Ok', 'Arrow') },
        { ...TOOL_ITEMS[3], label: l('Dikdörtgen', 'Rectangle') },
        { ...TOOL_ITEMS[4], label: l('Elips', 'Ellipse') },
        { ...TOOL_ITEMS[5], label: l('Ört', 'Cover') },
        { ...TOOL_ITEMS[6], label: l('Metin', 'Text') },
        { ...TOOL_ITEMS[7], label: l('Görsel', 'Picture') },
        { ...TOOL_ITEMS[8], label: l('Silgi', 'Eraser') },
        { ...TOOL_ITEMS[9], label: l('Kırp', 'Crop') },
    ], [l]);

    const aspectOptions = useMemo(() => [
        { id: 'free', label: l('Serbest', 'Free'), value: 0 },
        { id: '1:1', label: '1:1', value: 1 },
        { id: '4:3', label: '4:3', value: 4 / 3 },
        { id: '16:9', label: '16:9', value: 16 / 9 },
        { id: '3:4', label: '3:4', value: 3 / 4 },
        { id: '9:16', label: '9:16', value: 9 / 16 },
    ], [l]);

    const colors = useThemeColors();
    const styles = useMemo(() => createPhotoEditorStyles(colors), [colors]);
    const { width: screenWidth, height: screenHeight } = useWindowDimensions();
    const canvasRef = useRef<View>(null);
    const [sourceUri, setSourceUri] = useState('');
    const [sourceSize, setSourceSize] = useState({ width: 4, height: 3 });
    // Set only in blank-page mode: the paper the user draws on, in place of a source bitmap.
    const [page, setPage] = useState<EditorPage | null>(null);
    const [pageSheet, setPageSheet] = useState(false);
    const [annotations, setAnnotations] = useState<PhotoAnnotation[]>([]);
    const [undoStack, setUndoStack] = useState<EditorHistoryState[]>([]);
    const [redoStack, setRedoStack] = useState<EditorHistoryState[]>([]);
    const [tool, setTool] = useState<EditorTool>('pen');
    const [color, setColor] = useState(DRAW_COLORS[2]);
    const [strokeWidth, setStrokeWidth] = useState(WIDTHS[1]);
    const [fontSize, setFontSize] = useState(FONT_SIZES[1]);
    const [liveAnnotation, setLiveAnnotation] = useState<PhotoAnnotation | null>(null);
    const [textModal, setTextModal] = useState(false);
    const [textDraft, setTextDraft] = useState('');
    const [textBgStyle, setTextBgStyle] = useState<PhotoTextStyle>('badge');
    const [textAlign, setTextAlign] = useState<PhotoTextAlign>('center');
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [rotating, setRotating] = useState(false);
    const [cropping, setCropping] = useState(false);
    const [imageReady, setImageReady] = useState(false);
    const [eraserCursor, setEraserCursor] = useState<{ x: number; y: number; radius: number } | null>(null);
    const [eraserRadius, setEraserRadius] = useState(ERASER_RADII[1]);
    const [eraserMode, setEraserMode] = useState<PhotoEraserMode>('partial');
    const [isDraggingSelection, setIsDraggingSelection] = useState(false);
    const [trashHovered, setTrashHovered] = useState(false);
    // The handle currently under the finger, so the frame can highlight it and the floating
    // controls can get out of the way of the corner being pulled.
    const [activeHandle, setActiveHandle] = useState<PhotoSelectionHandle | null>(null);
    // The angle a turn is passing through, shown while the knob is held.
    const [rotationPreview, setRotationPreview] = useState<number | null>(null);
    const [snapGuides, setSnapGuides] = useState({ x: false, y: false });
    const [pictureSourceSheet, setPictureSourceSheet] = useState(false);

    // Set only for the length of one save: the off-screen surface the export is photographed on.
    const [exportSurface, setExportSurface] = useState<ExportSurface | null>(null);
    const exportSurfaceRef = useRef<View>(null);
    const exportLaidOutRef = useRef(false);
    const exportPhotoLoadedRef = useRef(false);
    // How many placed pictures the export surface is waiting on, and how many have reported in.
    // A picture that has not decoded yet is photographed as a hole in the drawing.
    const exportPicturesTotalRef = useRef(0);
    const exportPicturesReadyRef = useRef(0);
    const [cropBox, setCropBox] = useState<PhotoCropRect>({ x: 0, y: 0, width: 1, height: 1 });
    const [cropAspect, setCropAspect] = useState<string>('free');

    const annotationsRef = useRef(annotations);
    annotationsRef.current = annotations;
    const sourceUriRef = useRef(sourceUri);
    sourceUriRef.current = sourceUri;
    const sourceSizeRef = useRef(sourceSize);
    sourceSizeRef.current = sourceSize;
    const pageRef = useRef(page);
    pageRef.current = page;
    const undoStackRef = useRef(undoStack);
    undoStackRef.current = undoStack;
    const redoStackRef = useRef(redoStack);
    redoStackRef.current = redoStack;
    const toolRef = useRef(tool);
    toolRef.current = tool;
    const colorRef = useRef(color);
    colorRef.current = color;
    const strokeWidthRef = useRef(strokeWidth);
    strokeWidthRef.current = strokeWidth;
    const fontSizeRef = useRef(fontSize);
    fontSizeRef.current = fontSize;
    const selectedIdRef = useRef(selectedId);
    selectedIdRef.current = selectedId;
    const textBgStyleRef = useRef(textBgStyle);
    textBgStyleRef.current = textBgStyle;
    const textAlignRef = useRef(textAlign);
    textAlignRef.current = textAlign;
    const cropBoxRef = useRef(cropBox);
    cropBoxRef.current = cropBox;
    const cropAspectRef = useRef(cropAspect);
    cropAspectRef.current = cropAspect;
    const eraserRadiusRef = useRef(eraserRadius);
    eraserRadiusRef.current = eraserRadius;
    const eraserModeRef = useRef(eraserMode);
    eraserModeRef.current = eraserMode;

    // The gesture handlers below live in a PanResponder that is built once, so they keep the
    // first render's copy of every variable they close over forever. `trashHovered` therefore
    // needs the same ref mirror the values above have, or a handler reading it would see the
    // initial `false` for the whole life of the editor. This one is written by the setter rather
    // than on render, so a handler that raises the highlight can read it back inside the same
    // gesture instead of waiting for React to re-render.
    const trashHoveredRef = useRef(false);
    const updateTrashHovered = (next: boolean) => {
        if (trashHoveredRef.current === next) return;
        trashHoveredRef.current = next;
        // Arming the bin is worth a tick: the finger is over the pill, not over the thing it is
        // carrying, so the highlight alone is easy to miss.
        if (next) tick();
        setTrashHovered(next);
    };

    // Mirrors the guides for the same reason: the gesture handlers were built on the first
    // render and cannot read the state they are setting.
    const snapGuidesRef = useRef({ x: false, y: false });
    const updateSnapGuides = (next: { x: boolean; y: boolean }) => {
        const current = snapGuidesRef.current;
        if (current.x === next.x && current.y === next.y) return;
        if ((next.x && !current.x) || (next.y && !current.y)) tick();
        snapGuidesRef.current = next;
        setSnapGuides(next);
    };

    // Touch coordinates must be resolved against the canvas itself. `locationX` is relative to
    // whichever view the finger happens to be over (a selection frame, a handle), so overlays
    // would silently break dragging; the canvas origin in window space never lies.
    const canvasOriginRef = useRef({ x: 0, y: 0 });
    const measureCanvasOrigin = () => {
        canvasRef.current?.measureInWindow((x, y) => {
            if (Number.isFinite(x) && Number.isFinite(y)) canvasOriginRef.current = { x, y };
        });
    };

    /** Where a label being written is going to land: the tap that opened the composer. */
    const textDropPointRef = useRef<PhotoPoint | null>(null);

    useEffect(() => {
        if (!visible) return;
        // A picture wins if both are supplied; a caller opens the editor for one or the other.
        const drawnPage = photo ? null : blankPage;
        if (!photo && !drawnPage) return;
        setAnnotations([]);
        undoStackRef.current = [];
        setUndoStack([]);
        redoStackRef.current = [];
        setRedoStack([]);
        setLiveAnnotation(null);
        setSelectedId(null);
        setTextBgStyle('badge');
        setTextAlign('center');
        setTool('pen');
        setEraserRadius(ERASER_RADII[1]);
        setEraserMode('partial');
        setCropBox({ x: 0, y: 0, width: 1, height: 1 });
        setCropAspect('free');
        setPageSheet(false);

        if (drawnPage) {
            setPage({
                background: drawnPage.background,
                paper: drawnPage.paper,
                ruling: drawnPage.ruling ?? defaultBlankCanvasRuling(drawnPage.width, drawnPage.height),
            });
            setSourceUri('');
            // Nothing has to load: the page is drawn, so the editor is usable immediately.
            setImageReady(true);
            setSourceSize({ width: drawnPage.width, height: drawnPage.height });
            setColor(blankCanvasDefaultInk(drawnPage.background));
            return;
        }
        if (!photo) return;

        setPage(null);
        setColor(DRAW_COLORS[2]);
        setSourceUri(photo.uri);
        setImageReady(false);
        if (photo.width && photo.height) {
            setSourceSize({ width: photo.width, height: photo.height });
        } else {
            NativeImage.getSize(
                photo.uri,
                (width, height) => setSourceSize({ width, height }),
                () => setSourceSize({ width: 4, height: 3 }),
            );
        }
    }, [visible, photo?.uri, blankPage]);

    const insets = useSafeAreaInsets();
    const [stageLayout, setStageLayout] = useState<{ width: number; height: number } | null>(null);

    const onStageLayout = useCallback((event: LayoutChangeEvent) => {
        const { width, height } = event.nativeEvent.layout;
        if (width > 0 && height > 0) {
            setStageLayout((prev) => {
                if (prev && Math.abs(prev.width - width) < 2 && Math.abs(prev.height - height) < 2) {
                    return prev;
                }
                return { width, height };
            });
        }
    }, []);

    const estimatedControlsHeight = tool === 'crop' ? 168 : 124;
    const fallbackAvailableHeight = Math.max(
        180,
        screenHeight - insets.top - insets.bottom - 56 - estimatedControlsHeight - 24,
    );

    const availableWidth = stageLayout ? Math.max(120, stageLayout.width - 16) : Math.min(screenWidth - 16, 940);
    const availableHeight = stageLayout ? Math.max(120, stageLayout.height - 16) : fallbackAvailableHeight;

    const ratio = sourceSize.width / sourceSize.height;
    const canvasSize = useMemo(() => {
        if (availableWidth / availableHeight > ratio) {
            return {
                width: Math.max(1, Math.round(availableHeight * ratio)),
                height: Math.max(1, Math.round(availableHeight)),
            };
        }
        return {
            width: Math.max(1, Math.round(availableWidth)),
            height: Math.max(1, Math.round(availableWidth / ratio)),
        };
    }, [availableWidth, availableHeight, ratio]);
    const canvasSizeRef = useRef(canvasSize);
    canvasSizeRef.current = canvasSize;

    // The canvas is the export sheet scaled down by one factor, so the ruling is scaled by that
    // same factor rather than re-derived: what the drawer sees is what the PNG holds.
    const canvasRuling = useMemo(() => {
        if (!page) return null;
        return scaleBlankCanvasRuling(page.ruling, canvasSize.width / Math.max(1, sourceSize.width));
    }, [page, canvasSize.width, sourceSize.width]);

    // The bin is laid out from the geometry the gesture handlers hit-test against, so the pill
    // the user aims at and the region that deletes are one rect rather than two guesses that
    // drift apart as the canvas changes shape.
    const trashPill = useMemo(
        () => photoTrashPillRect(canvasSize.width, canvasSize.height),
        [canvasSize.width, canvasSize.height],
    );

    /** Remember a state and drop the redo branch, the way any edit does. */
    const pushHistory = (snapshot: EditorHistoryState) => {
        undoStackRef.current = [...undoStackRef.current.slice(-29), snapshot];
        setUndoStack(undoStackRef.current);
        redoStackRef.current = [];
        setRedoStack(redoStackRef.current);
    };

    /** The current sheet and ink, as a point history can return to. */
    const snapshotEditor = (): EditorHistoryState => ({
        sourceUri: sourceUriRef.current,
        sourceSize: sourceSizeRef.current,
        annotations: annotationsRef.current,
        page: pageRef.current,
    });

    const commitAnnotations = (next: PhotoAnnotation[]) => {
        const snapshot = snapshotEditor();
        pushHistory(snapshot);
        annotationsRef.current = next;
        setAnnotations(next);
    };

    const pointFromEvent = (event: any): PhotoPoint => {
        const { width, height } = canvasSizeRef.current;
        const native = event.nativeEvent;
        const origin = canvasOriginRef.current;
        // Page coordinates keep the maths in one frame even when an overlay is the touch target.
        const x = typeof native.pageX === 'number' ? native.pageX - origin.x : native.locationX;
        const y = typeof native.pageY === 'number' ? native.pageY - origin.y : native.locationY;
        return clampPhotoPoint({
            x: x / Math.max(1, width),
            y: y / Math.max(1, height),
        });
    };

    const selectedText = useMemo(() => {
        if (!selectedId) return null;
        return (annotations.find((ann) => ann.id === selectedId && ann.type === 'text') as PhotoText) || null;
    }, [annotations, selectedId]);

    const selectedPicture = useMemo(() => {
        if (!selectedId) return null;
        return (annotations.find((ann) => ann.id === selectedId && ann.type === 'image') as PhotoImage) || null;
    }, [annotations, selectedId]);

    // A label and a picture are both moved, resized and turned by the same frame, so the frame
    // asks each of them for its geometry rather than being built twice.
    const selectionGeometry = useMemo(() => {
        const selected = selectedText ?? selectedPicture;
        return selected ? selectionGeometryFor(selected, canvasSize) : null;
    }, [selectedText, selectedPicture, canvasSize]);

    const selectedBounds = selectionGeometry?.bounds ?? null;
    const selectedAnchor = selectionGeometry?.anchor ?? { x: 0, y: 0 };
    const selectedRotation = selectionGeometry?.rotation ?? 0;

    // The handles are drawn at exactly the points the gesture handlers hit-test against, so a
    // corner can never sit somewhere other than where the finger has to reach for it.
    const rotateSide = useMemo(
        () => (selectionGeometry ? photoRotateHandleSide(selectionGeometry, canvasSize) : 'top'),
        [selectionGeometry, canvasSize],
    );
    const selectionHandles = useMemo(
        () => (selectionGeometry ? photoSelectionHandlePoints(selectionGeometry, rotateSide) : null),
        [selectionGeometry, rotateSide],
    );

    /** Take hold of an annotation, with the tick that tells the finger it has caught something. */
    const selectAnnotation = (id: string) => {
        if (selectedIdRef.current !== id) tick();
        setSelectedId(id);
    };

    const editSelectedText = () => {
        if (!selectedText) return;
        setTextDraft(selectedText.text);
        setTextBgStyle(selectedText.bgStyle || 'badge');
        setTextAlign(selectedText.textAlign || 'center');
        setColor(selectedText.color);
        setFontSize(selectedText.fontSize);
        setTextModal(true);
    };

    const cycleSelectedTextStyle = () => {
        if (!selectedId || !selectedText) return;
        const stylesList: PhotoTextStyle[] = ['classic', 'badge', 'frosted', 'outline'];
        const currentStyle = selectedText.bgStyle || 'classic';
        const nextStyle = stylesList[(stylesList.indexOf(currentStyle) + 1) % stylesList.length];
        setTextBgStyle(nextStyle);
        const next = annotations.map((ann) => (ann.id === selectedId ? { ...ann, bgStyle: nextStyle } : ann));
        commitAnnotations(next);
    };

    const cycleSelectedTextAlign = () => {
        if (!selectedId || !selectedText) return;
        const aligns: PhotoTextAlign[] = ['center', 'right', 'left'];
        const currentAlign = selectedText.textAlign || 'center';
        const nextAlign = aligns[(aligns.indexOf(currentAlign) + 1) % aligns.length];
        setTextAlign(nextAlign);
        const next = annotations.map((ann) => (ann.id === selectedId ? { ...ann, textAlign: nextAlign } : ann));
        commitAnnotations(next);
    };

    const deleteSelectedText = () => {
        if (!selectedId) return;
        const next = annotations.filter((ann) => ann.id !== selectedId);
        commitAnnotations(next);
        setSelectedId(null);
    };

    const changeSelectedTextSize = (delta: number) => {
        if (!selectedId || !selectedText) return;
        const newSize = clampPhotoTextSize((selectedText.fontSize || 20) + delta);
        setFontSize(newSize);
        const next = annotations.map((ann) => (ann.id === selectedId ? { ...ann, fontSize: newSize } : ann));
        commitAnnotations(next);
    };

    /** Resize the selected picture about its centre; the helper keeps its aspect and its limits. */
    const resizeSelectedPicture = (factor: number) => {
        if (!selectedPicture) return;
        const resized = resizePhotoImage(selectedPicture, factor, canvasSizeRef.current);
        if (resized === selectedPicture) return;
        commitAnnotations(annotations.map((ann) => (ann.id === selectedPicture.id ? resized : ann)));
    };

    /** Turn the selected picture a quarter turn, for a photo that came in on its side. */
    const rotateSelectedPicture = () => {
        if (!selectedPicture) return;
        const rotation = normalizePhotoRotation((selectedPicture.rotation ?? 0) + 90);
        commitAnnotations(annotations.map((ann) => (
            ann.id === selectedPicture.id ? { ...ann, rotation } : ann
        )));
    };

    const deleteSelectedPicture = () => {
        if (!selectedPicture) return;
        commitAnnotations(annotations.filter((ann) => ann.id !== selectedPicture.id));
        setSelectedId(null);
    };

    /** Ask for the library, then for one picture from it. Null means the user backed out. */
    const pickPictureAsset = async (): Promise<ImagePicker.ImagePickerAsset | null> => {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
            await promptPermissionSettings({
                title: l('İzin gerekli', 'Permission Required'),
                message: l(
                    'Sayfaya görsel eklemek için galeri izni gerekiyor. Ayarlardan erişim iznini açabilirsiniz.',
                    'Allow photo library access to add a picture to the page. You can enable access in Settings.',
                ),
                settingsLabel: l('Ayarları Aç', 'Open Settings'),
                cancelLabel: t('common.cancel'),
            });
            return null;
        }
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsEditing: false,
            quality: 1,
            selectionLimit: 1,
        });
        if (result.canceled || !result.assets?.length) return null;
        return result.assets[0];
    };

    /** The same, straight from the camera, for the page that is being drawn from life. */
    const capturePictureAsset = async (): Promise<ImagePicker.ImagePickerAsset | null> => {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
            await promptPermissionSettings({
                title: l('İzin gerekli', 'Permission Required'),
                message: l(
                    'Sayfaya fotoğraf çekmek için kamera izni gerekiyor. Ayarlardan kamera iznini açabilirsiniz.',
                    'Allow camera access to put a photo on the page. You can enable camera access in Settings.',
                ),
                settingsLabel: l('Ayarları Aç', 'Open Settings'),
                cancelLabel: t('common.cancel'),
            });
            return null;
        }
        const result = await ImagePicker.launchCameraAsync({
            mediaTypes: ['images'],
            allowsEditing: false,
            quality: 1,
        });
        if (result.canceled || !result.assets?.length) return null;
        return result.assets[0];
    };

    /**
     * Put a picture on the page.
     *
     * It lands under the finger that asked for it, at its own aspect and at a size that leaves
     * the sheet visible around it, and it comes out selected: the frame is already there to drag
     * it, pull it by a corner or turn it by, so choosing and placing are one action, not two.
     */
    const addPicture = async (from: 'library' | 'camera', at?: PhotoPoint | null) => {
        try {
            const asset = from === 'camera' ? await capturePictureAsset() : await pickPictureAsset();
            if (!asset) return;
            const canvas = canvasSizeRef.current;
            const box = photoImagePlacement({
                source: { width: asset.width, height: asset.height },
                canvas,
            });
            // Dropped where the page was tapped, but never hanging off the sheet: a picture
            // pushed half over the edge has no corner left to take hold of. One that is wider
            // than the page it was dropped on simply takes the middle.
            const halfWidth = box.width / 2 / Math.max(1, canvas.width);
            const halfHeight = box.height / 2 / Math.max(1, canvas.height);
            const target = clampPhotoPoint(at ?? { x: 0.5, y: 0.5 });
            const picture: PhotoImage = {
                id: makeId(),
                type: 'image',
                uri: asset.uri,
                point: {
                    x: halfWidth >= 0.5 ? 0.5 : Math.min(1 - halfWidth, Math.max(halfWidth, target.x)),
                    y: halfHeight >= 0.5 ? 0.5 : Math.min(1 - halfHeight, Math.max(halfHeight, target.y)),
                },
                width: box.width,
                height: box.height,
                // A picture has no ink of its own; the base fields are carried for the annotation
                // list's sake and only `opacity` ever reaches the screen.
                color: '#ffffff',
                opacity: 1,
            };
            // Warm the decoder while the user is still looking at the page, so the off-screen
            // export surface can photograph the picture immediately instead of a blank box.
            if (Platform.OS !== 'web') {
                NativeImage.prefetch(asset.uri).catch(() => {});
            }
            commitAnnotations([...annotationsRef.current, picture]);
            setSelectedId(picture.id);
            setTool('image');
        } catch (error) {
            console.warn('[PhotoEditor] picture pick failed:', error);
            alert(t('common.error'), l('Görsel eklenemedi.', 'Could not add the picture.'));
        }
    };

    // Where on the page the picture being chosen is going to land, held while the source sheet
    // is open: the tap that asked for it is long gone by the time the picker returns.
    const pictureDropPointRef = useRef<PhotoPoint | null>(null);
    const openPictureSource = (at: PhotoPoint | null) => {
        pictureDropPointRef.current = at;
        setPictureSourceSheet(true);
    };

    const addPictureFrom = (from: 'library' | 'camera') => {
        setPictureSourceSheet(false);
        const at = pictureDropPointRef.current;
        pictureDropPointRef.current = null;
        void addPicture(from, at);
    };

    // The gesture handlers are built once and keep the first render's copy of everything they
    // close over, so the picker is reached through the same ref mirror the values above use.
    const addPictureRef = useRef<(at: PhotoPoint) => void>(() => {});
    addPictureRef.current = (at: PhotoPoint) => { openPictureSource(at); };

    // The same mirror for opening a label the user has just double-tapped.
    const editSelectedTextRef = useRef<() => void>(() => {});
    editSelectedTextRef.current = editSelectedText;

    const updateColor = (newColor: string) => {
        setColor(newColor);
        if (tool === 'text' && selectedId) {
            const next = annotations.map((ann) => (ann.id === selectedId ? { ...ann, color: newColor } : ann));
            commitAnnotations(next);
        }
    };

    const updateSize = (newSize: number) => {
        if (tool === 'text') {
            setFontSize(newSize);
            if (selectedId) {
                const next = annotations.map((ann) => (ann.id === selectedId ? { ...ann, fontSize: newSize } : ann));
                commitAnnotations(next);
            }
        } else {
            setStrokeWidth(newSize);
        }
    };

    const panResponder = usePhotoEditorPanResponder({
        annotationsRef,
        toolRef,
        colorRef,
        strokeWidthRef,
        selectedIdRef,
        cropBoxRef,
        eraserRadiusRef,
        eraserModeRef,
        canvasSizeRef,
        textDropPointRef,
        addPictureRef,
        editSelectedTextRef,
        setAnnotations,
        setColor,
        setFontSize,
        setLiveAnnotation,
        setTextModal,
        setTextDraft,
        setTextBgStyle,
        setTextAlign,
        setSelectedId,
        setEraserCursor,
        setIsDraggingSelection,
        setActiveHandle,
        setRotationPreview,
        setCropBox,
        updateTrashHovered,
        updateSnapGuides,
        pushHistory,
        snapshotEditor,
        commitAnnotations,
        pointFromEvent,
        selectAnnotation,
    });

    /**
     * Move the editor onto a remembered state. Both directions do the same restore, so they share
     * it; the caller decides which stack the state left behind belongs on.
     */
    const restoreEditorState = (target: EditorHistoryState) => {
        if (target.sourceUri !== sourceUriRef.current) {
            setImageReady(false);
            sourceUriRef.current = target.sourceUri;
            setSourceUri(target.sourceUri);
        }
        // A drawn page rotates and crops without ever swapping its (empty) source, so the size
        // and the ruling have to be restored on their own or the ink would land on the wrong sheet.
        if (!sameSourceSize(target.sourceSize, sourceSizeRef.current)) {
            sourceSizeRef.current = target.sourceSize;
            setSourceSize(target.sourceSize);
        }
        if (target.page !== pageRef.current) {
            pageRef.current = target.page;
            setPage(target.page);
        }
        annotationsRef.current = target.annotations;
        setAnnotations(target.annotations);
    };

    // History is read and written outside the state updaters: an updater that also queued the
    // other stack's push would run that push twice under StrictMode's double invocation.
    const undo = () => {
        const stack = undoStackRef.current;
        if (!stack.length) return;
        const previous = stack[stack.length - 1];
        const undone = snapshotEditor();
        undoStackRef.current = stack.slice(0, -1);
        setUndoStack(undoStackRef.current);
        redoStackRef.current = [...redoStackRef.current.slice(-29), undone];
        setRedoStack(redoStackRef.current);
        restoreEditorState(previous);
    };

    const redo = () => {
        const stack = redoStackRef.current;
        if (!stack.length) return;
        const next = stack[stack.length - 1];
        const redone = snapshotEditor();
        redoStackRef.current = stack.slice(0, -1);
        setRedoStack(redoStackRef.current);
        undoStackRef.current = [...undoStackRef.current.slice(-29), redone];
        setUndoStack(undoStackRef.current);
        restoreEditorState(next);
    };

    const closeEditor = () => {
        if (saving || rotating || cropping) return;
        // Leaving throws the work away — there is nowhere it is kept — so anything the user has
        // drawn, cropped or turned is worth one question first. An untouched sheet just closes.
        const hasUnsavedWork = annotationsRef.current.length > 0 || undoStackRef.current.length > 0;
        if (!hasUnsavedWork) {
            onClose();
            return;
        }
        confirm(
            page
                ? l('Çizimi bırak?', 'Discard drawing?')
                : l('Düzenlemeyi bırak?', 'Discard edits?'),
            page
                ? l('Bu sayfadaki çizim kaydedilmeden silinecek.', 'This drawing will be lost without being added to the card.')
                : l('Bu fotoğrafta yaptığınız değişiklikler kaydedilmeden silinecek.', 'Your changes to this photo will be lost without being added to the card.'),
            onClose,
            { destructive: true },
        );
    };

    const rotate = async () => {
        if (rotating || cropping) return;
        if (page) {
            // A drawn page has no bitmap to turn: swap the page dimensions and take the ink with it.
            const snapshot = snapshotEditor();
            pushHistory(snapshot);
            const rotated = annotationsRef.current.map(rotatePhotoAnnotationClockwise);
            annotationsRef.current = rotated;
            setAnnotations(rotated);
            setSourceSize({ width: sourceSize.height, height: sourceSize.width });
            // The ruling is turned too. Leaving it put would slide the lines out from under the
            // writing that was made on them, and would keep a lined page ruled the old way.
            const turnedPage = {
                ...page,
                ruling: rotateBlankCanvasRulingClockwise(page.ruling, sourceSize.height),
            };
            pageRef.current = turnedPage;
            setPage(turnedPage);
            setSelectedId(null);
            return;
        }
        if (!sourceUri || !imageReady) return;
        setRotating(true);
        try {
            const result = await manipulateAsync(sourceUri, [{ rotate: 90 }], {
                compress: 1,
                format: SaveFormat.PNG,
            });
            const snapshot = snapshotEditor();
            pushHistory(snapshot);

            const rotated = annotationsRef.current.map(rotatePhotoAnnotationClockwise);
            annotationsRef.current = rotated;
            setAnnotations(rotated);

            setImageReady(false);
            setSourceUri(result.uri);
            setSourceSize({ width: result.width, height: result.height });
        } catch (error) {
            console.warn('[PhotoEditor] rotate failed:', error);
            alert(t('common.error'), l('Fotoğraf döndürülemedi.', 'Could not rotate the photo.'));
        } finally {
            setRotating(false);
        }
    };

    const applyCrop = async () => {
        if (cropping || (!page && (!sourceUri || !imageReady))) return;
        if (cropBox.x <= 0.005 && cropBox.y <= 0.005 && cropBox.width >= 0.99 && cropBox.height >= 0.99) {
            setTool('pen');
            return;
        }
        const pixels = calculateSourceCropPixels(cropBox, sourceSize.width, sourceSize.height);
        if (pixels.width <= 0 || pixels.height <= 0) return;

        if (page) {
            // Trimming a drawn page is pure geometry: keep the ink and the ruling, shrink the sheet.
            const snapshot = snapshotEditor();
            pushHistory(snapshot);
            const trimmed = annotationsRef.current.map((ann) => cropPhotoAnnotation(ann, cropBox));
            annotationsRef.current = trimmed;
            setAnnotations(trimmed);
            setSourceSize(cropBlankCanvasSize(sourceSize, cropBox));
            // Only the ruling's phase moves: trimming a sheet does not resize its squares, so a
            // stroke drawn along a line is still along that line on the smaller page.
            const trimmedPage = {
                ...page,
                ruling: cropBlankCanvasRuling(page.ruling, sourceSize, cropBox),
            };
            pageRef.current = trimmedPage;
            setPage(trimmedPage);
            setCropBox({ x: 0, y: 0, width: 1, height: 1 });
            setCropAspect('free');
            setSelectedId(null);
            setTool('pen');
            return;
        }

        setCropping(true);
        try {
            const result = await manipulateAsync(sourceUri, [{ crop: pixels }], {
                compress: 1,
                format: SaveFormat.PNG,
            });
            const snapshot = snapshotEditor();
            pushHistory(snapshot);

            const transformedAnnotations = annotationsRef.current.map((ann) => cropPhotoAnnotation(ann, cropBox));
            annotationsRef.current = transformedAnnotations;
            setAnnotations(transformedAnnotations);

            setImageReady(false);
            setSourceUri(result.uri);
            setSourceSize({ width: result.width, height: result.height });
            setCropBox({ x: 0, y: 0, width: 1, height: 1 });
            setCropAspect('free');
            setTool('pen');
        } catch (error) {
            console.warn('[PhotoEditor] crop failed:', error);
            alert(t('common.error'), l('Fotoğraf kırpılamadı.', 'Could not crop the photo.'));
        } finally {
            setCropping(false);
        }
    };

    const selectCropAspect = (optId: string, aspectValue: number) => {
        setCropAspect(optId);
        if (aspectValue > 0) {
            setCropBox((curr) => applyAspectRatioToCropRect(curr, aspectValue, sourceSize.width, sourceSize.height));
        }
    };

    /** Native fallback: photograph the live canvas, at whatever the screen happens to measure. */
    const captureCanvasFile = async (): Promise<string> => {
        return captureRef(canvasRef, {
            format: 'png',
            quality: 1,
            result: 'tmpfile',
            useRenderInContext: true,
        });
    };

    /** One frame, with a timer behind it so a backgrounded app can never leave a save hanging. */
    const nextFrame = () => new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 32);
        requestAnimationFrame(() => {
            clearTimeout(timer);
            resolve();
        });
    });

    /**
     * Hold until the off-screen surface has been laid out, its photo (if any) has loaded, and
     * every picture placed on the page has reported itself decoded. The deadline is the backstop:
     * a picture that never loads costs the save a moment, not the whole drawing.
     */
    const waitForExportSurface = async (needsPhoto: boolean) => {
        const deadline = Date.now() + 4000;
        while (Date.now() < deadline) {
            const ready = exportLaidOutRef.current
                && (!needsPhoto || exportPhotoLoadedRef.current)
                && exportPicturesReadyRef.current >= exportPicturesTotalRef.current;
            if (ready) break;
            await nextFrame();
        }
        // One more frame, so the finished tree is on the layer before the shutter.
        await nextFrame();
    };

    /**
     * Native export: render the drawing once more on a surface sized for the export, off screen,
     * and photograph that instead of the canvas the user was drawing on. `renderInContext` draws
     * a layer at its own size, so asking `captureRef` for a larger image would only pad the
     * canvas — the surface itself has to be the bigger one.
     */
    const captureExportSurface = async (surface: ExportSurface): Promise<string> => {
        exportLaidOutRef.current = false;
        exportPhotoLoadedRef.current = false;
        exportPicturesReadyRef.current = 0;
        exportPicturesTotalRef.current = annotationsRef.current.filter((ann) => ann.type === 'image').length;
        setExportSurface(surface);
        try {
            await waitForExportSurface(!pageRef.current);
            return await captureRef(exportSurfaceRef, {
                format: 'png',
                quality: 1,
                result: 'tmpfile',
                useRenderInContext: true,
            });
        } finally {
            setExportSurface(null);
        }
    };

    /** The export surface, falling back to the on-screen canvas if the off-screen one fails. */
    const captureForExport = async (surface: ExportSurface): Promise<string> => {
        try {
            return await captureExportSurface(surface);
        } catch (error) {
            console.warn('[PhotoEditor] export surface capture failed, using the canvas:', error);
            return captureCanvasFile();
        }
    };

    const save = async () => {
        if (saving || rotating || cropping) return;
        if (!page && (!sourceUri || !imageReady)) return;
        if (page && annotationsRef.current.length === 0) {
            alert(
                l('Kaydedilecek bir şey yok', 'Nothing to Save'),
                l('Kaydetmeden önce sayfaya bir şeyler çizin.', 'Draw something on the page before saving.'),
            );
            return;
        }
        // The selection frame, the eraser ring and the crop overlay are editing chrome, and the
        // native export is a capture of the live canvas — clear them before the shutter, then
        // let the removal reach the screen.
        if (Platform.OS !== 'web' && (selectedIdRef.current || eraserCursor || tool === 'crop')) {
            setSelectedId(null);
            setEraserCursor(null);
            if (tool === 'crop') {
                setTool('pen');
                setCropBox({ x: 0, y: 0, width: 1, height: 1 });
                setCropAspect('free');
            }
            await new Promise<void>((resolve) => {
                requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
            });
        }
        setSaving(true);
        try {
            let filename = sanitizeMediaFilename(`${Date.now()}_${page ? 'cizim' : 'duzenlenmis'}.png`);
            // Web paints into a canvas of its own, so it is measured in pixels directly; native
            // renders a view, so it is measured in points the device's scale turns back into
            // those pixels.
            const surface = photoExportSurface({
                source: sourceSizeRef.current,
                canvas: canvasSizeRef.current,
                pixelRatio: Platform.OS === 'web' ? 1 : PixelRatio.get(),
                maxDimension: EXPORT_MAX_DIMENSION,
            });
            if (page && Platform.OS === 'web') {
                const bytes = await rasterizeBlankCanvasWeb(
                    { ...page, width: sourceSize.width, height: sourceSize.height },
                    annotationsRef.current,
                    surface,
                );
                await saveMediaBytes(filename, bytes, 'image/png');
            } else if (page) {
                const captureUri = await captureForExport(surface);
                await saveMediaFromUri(filename, captureUri, 'image/png');
            } else if (annotationsRef.current.length === 0) {
                // Nothing was drawn, so the source is copied rather than re-encoded — and it has
                // to be named after what it actually is. A crop or a turn leaves a PNG behind,
                // while an untouched pick is still the JPEG that came out of the picker; the
                // `.png` name above would have described neither.
                filename = sanitizeMediaFilename(mediaFilenameForPickedAsset({
                    uri: sourceUri,
                    name: `${Date.now()}_duzenlenmis`,
                    fallbackExtension: 'png',
                }));
                await saveMediaFromUri(filename, sourceUri, guessMimeFromFilename(filename) || undefined);
            } else if (Platform.OS === 'web') {
                const bytes = await rasterizePhotoWeb(sourceUri, annotationsRef.current, surface);
                await saveMediaBytes(filename, bytes, 'image/png');
            } else {
                const captureUri = await captureForExport(surface);
                await saveMediaFromUri(filename, captureUri, 'image/png');
            }
            onSaved(filename);
            onClose();
        } catch (error) {
            console.warn('[PhotoEditor] save failed:', error);
            alert(t('common.error'), page
                ? l('Çizim kaydedilemedi.', 'Could not save the drawing.')
                : l('Düzenlenen fotoğraf kaydedilemedi.', 'Could not save the edited photo.'));
        } finally {
            setSaving(false);
        }
    };

    const chooseTool = (nextTool: EditorTool) => {
        if (nextTool === 'text') {
            const editingLabel = annotationsRef.current.some(
                (ann) => ann.id === selectedIdRef.current && ann.type === 'text',
            );
            if (editingLabel) {
                editSelectedText();
            } else {
                // A picture may be the thing selected; the text tool puts it down rather than
                // trying to edit it as a label.
                setSelectedId(null);
                textDropPointRef.current = null;
                setTextDraft('');
                setTextBgStyle('badge');
                setTextAlign('center');
                setTextModal(true);
            }
        } else if (nextTool === 'image') {
            setTool('image');
            // With nothing on the page to select yet, the tool has only one thing it could mean,
            // so it opens the picker straight away. Once a picture is there, tapping the tool
            // just arms it: tap a picture to pick it up, tap the page to add another.
            const hasPicture = annotationsRef.current.some((ann) => ann.type === 'image');
            if (!hasPicture) {
                setSelectedId(null);
                // No tap to place it by yet: it takes the middle of the page.
                openPictureSource(null);
            }
        } else if (nextTool === 'crop') {
            setSelectedId(null);
            setTool('crop');
        } else {
            setSelectedId(null);
            setTool(nextTool);
        }
    };

    const confirmText = () => {
        const value = textDraft.trim();
        if (!value) {
            setTextModal(false);
            return;
        }
        if (selectedId) {
            const next = annotations.map((ann) => (
                ann.id === selectedId && ann.type === 'text'
                    ? { ...ann, text: value, color, fontSize, bgStyle: textBgStyle, textAlign }
                    : ann
            ));
            commitAnnotations(next);
        } else {
            const newId = makeId();
            // A label lands where the page was tapped, kept far enough from the edge that its
            // frame and its handles are still on the sheet. Written from the toolbar rather than
            // from a tap, it takes the middle.
            const drop = textDropPointRef.current;
            const newAnnotation: PhotoText = {
                id: newId,
                type: 'text',
                point: drop
                    ? { x: Math.min(0.9, Math.max(0.1, drop.x)), y: Math.min(0.92, Math.max(0.08, drop.y)) }
                    : { x: 0.5, y: 0.45 },
                text: value,
                color,
                fontSize,
                bgStyle: textBgStyle,
                textAlign,
                width: 1,
                opacity: 1,
            };
            commitAnnotations([...annotations, newAnnotation]);
            setSelectedId(newId);
        }
        textDropPointRef.current = null;
        setTool('text');
        setTextModal(false);
    };

    /**
     * Swap the sheet under the ink. History carries the page, so a paper change has to be recorded
     * like any other edit; without it the next undo would quietly put the old paper back.
     */
    const changePage = (change: Partial<EditorPage>) => {
        if (!page) return;
        pushHistory(snapshotEditor());
        const next = { ...page, ...change };
        pageRef.current = next;
        setPage(next);
    };

    const changePaper = (paper: BlankCanvasPaper) => changePage({ paper });

    const changePageColor = (background: string) => {
        if (!page) return;
        // A pen still holding the old page's default ink follows the page, so switching to a dark
        // sheet never leaves the user drawing invisible black strokes.
        const penFollowsPage = color === blankCanvasDefaultInk(page.background);
        changePage({ background });
        if (penFollowsPage) setColor(blankCanvasDefaultInk(background));
    };

    const allAnnotations = liveAnnotation ? [...annotations, liveAnnotation] : annotations;
    // While something is being moved, pulled by a corner, turned by the knob or pinched, the
    // floating controls step aside: the finger is on the object, the bin is up, and a pill under
    // the thumb is in the way of both.
    const manipulating = isDraggingSelection || activeHandle !== null || rotationPreview !== null;

    // What the frame actually covers on the page once its turn is applied: the box its four
    // handles enclose. A turned object's upright box is not where the eye sees it — a label
    // stood on its end is as tall as it was wide — so anything placed beside the frame is placed
    // from this rather than from the box the geometry was measured in.
    const selectionExtent = useMemo(() => {
        if (!selectionHandles) return null;
        const corners = [selectionHandles.tl, selectionHandles.tr, selectionHandles.bl, selectionHandles.br];
        return {
            left: Math.min(...corners.map((corner) => corner.x)),
            right: Math.max(...corners.map((corner) => corner.x)),
            top: Math.min(...corners.map((corner) => corner.y)),
            bottom: Math.max(...corners.map((corner) => corner.y)),
        };
    }, [selectionHandles]);

    // The pill takes the side of the frame the knob is not on — asked of the knob's own position
    // rather than of the side it was given, because a turn carries it round with the object.
    // They are reached for by the same thumb, and a pill drawn over the knob would take the
    // touches meant to turn the object: the knob is painted underneath it and never grabbed.
    const selectionPillTop = selectionExtent
        ? (selectionHandles && selectionHandles.rotate.y > (selectionExtent.top + selectionExtent.bottom) / 2
            ? Math.max(6, selectionExtent.top - 50)
            : Math.min(canvasSize.height - 44, selectionExtent.bottom + 14))
        : 0;
    const selectionPillCentre = selectionExtent ? (selectionExtent.left + selectionExtent.right) / 2 : 0;
    // Adding a picture is a page-building action: a photo being edited already is the picture,
    // and pasting a second one over it is a different job from marking this one up.
    const visibleToolItems = page ? toolItems : toolItems.filter((item) => item.id !== 'image');
    /** An untouched page has nothing to export; a photo is worth keeping on its own. */
    const nothingDrawn = page !== null && annotations.length === 0;
    const activeToolLabel = tool === 'crop'
        ? l('Kırpma alanını ayarlayın ve onaylayın', 'Adjust crop area and confirm')
        : tool === 'text'
            ? selectedText
                ? l('Sürükleyin, köşeden boyutlandırın, düzenlemek için çift dokunun', 'Drag it, pull a corner, double-tap to edit')
                : selectedPicture
                    ? l('Sürükleyin, köşeden boyutlandırın, düğmeden çevirin', 'Drag it, pull a corner, turn it by the knob')
                    : l('Metin eklemek için dokunun', 'Tap to add text')
            : tool === 'image'
                ? selectedPicture || selectedText
                    ? l('Sürükleyin, köşeden boyutlandırın, düğmeden çevirin', 'Drag it, pull a corner, turn it by the knob')
                    : l('Görsel eklemek için dokunun', 'Tap to add a picture')
            : tool === 'eraser'
                ? eraserMode === 'partial'
                    ? l('Sürükleyerek dokunduğunuz yeri silin', 'Drag to rub out just what you touch')
                    : l('Dokunduğunuz çizimin tamamı silinir', 'Tap to remove a whole annotation')
                : l(`${toolItems.find((item) => item.id === tool)?.label ?? 'Kalem'} seçili`, `${toolItems.find((item) => item.id === tool)?.label ?? 'Pen'} selected`);

    return (
        <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={closeEditor}>
            <SafeAreaView style={styles.container}>
                <View style={styles.header}>
                    <TouchableOpacity
                        style={styles.headerButton}
                        onPress={closeEditor}
                        disabled={saving || rotating || cropping}
                        accessibilityRole="button"
                        accessibilityLabel={page
                            ? l('Çizimi iptal et', 'Cancel drawing')
                            : l('Fotoğraf düzenlemeyi iptal et', 'Cancel photo editing')}
                    >
                        <Text style={styles.headerButtonText}>{t('common.cancel')}</Text>
                    </TouchableOpacity>
                    <View style={styles.headerCenter}>
                        <Text style={styles.title}>{page ? l('Çizim', 'Drawing') : l('Fotoğrafı düzenle', 'Edit Photo')}</Text>
                        <Text style={styles.subtitle} numberOfLines={1}>{activeToolLabel}</Text>
                    </View>
                    <TouchableOpacity
                        style={[styles.saveButton, (!imageReady || cropping || nothingDrawn) && styles.saveButtonDisabled]}
                        onPress={save}
                        disabled={saving || rotating || cropping || !imageReady || nothingDrawn}
                        accessibilityRole="button"
                        accessibilityLabel={page
                            ? l('Çizimi karta ekle', 'Add drawing to the card')
                            : l('Düzenlenen fotoğrafı kullan', 'Use edited photo')}
                    >
                        {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.saveButtonText}>{t('common.completed')}</Text>}
                    </TouchableOpacity>
                </View>

                <View style={styles.stage} onLayout={onStageLayout}>
                    <View
                        ref={canvasRef}
                        collapsable={false}
                        onLayout={measureCanvasOrigin}
                        style={[styles.canvas, { width: canvasSize.width, height: canvasSize.height }]}
                        {...panResponder.panHandlers}
                    >
                        {page ? (
                            <PaperSwatch
                                paper={page.paper}
                                background={page.background}
                                width={canvasSize.width}
                                height={canvasSize.height}
                                ruling={canvasRuling}
                                style={StyleSheet.absoluteFill}
                            />
                        ) : sourceUri ? (
                            <NativeImage
                                source={{ uri: sourceUri }}
                                style={StyleSheet.absoluteFill}
                                resizeMode="stretch"
                                onLoad={() => setImageReady(true)}
                                onError={() => {
                                    setImageReady(false);
                                    alert(t('common.error'), l('Fotoğraf editörde açılamadı.', 'Could not open the photo in the editor.'));
                                }}
                            />
                        ) : <ActivityIndicator color={colors.accent} />}
                        <View style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}>
                            {renderPlacedPictures(allAnnotations, canvasSize.width, canvasSize.height)}
                        </View>
                        <Svg width={canvasSize.width} height={canvasSize.height} style={StyleSheet.absoluteFill}>
                            {allAnnotations.map((annotation) => renderAnnotation(annotation, canvasSize.width, canvasSize.height))}
                        </Svg>

                        {/* Interactive Eraser Indicator */}
                        {eraserCursor && (
                            <View
                                style={[
                                    styles.eraserIndicator,
                                    {
                                        left: eraserCursor.x - eraserCursor.radius,
                                        top: eraserCursor.y - eraserCursor.radius,
                                        width: eraserCursor.radius * 2,
                                        height: eraserCursor.radius * 2,
                                        borderRadius: eraserCursor.radius,
                                    },
                                    { pointerEvents: 'none' },
                                ]}
                            />
                        )}

                        {/* The page's own centre lines, shown only while a drag is settling onto
                            one of them, so the guide means something every time it appears. */}
                        {snapGuides.x && (
                            <View style={[styles.snapGuide, styles.snapGuideVertical, { left: canvasSize.width / 2 - 1 }, { pointerEvents: 'none' }]} />
                        )}
                        {snapGuides.y && (
                            <View style={[styles.snapGuide, styles.snapGuideHorizontal, { top: canvasSize.height / 2 - 1 }, { pointerEvents: 'none' }]} />
                        )}

                        {/* The frame around whatever is selected: a label or a picture. It stays
                            up through a drag, a pull and a turn, because the thing being moved is
                            exactly the thing the frame is drawn around. */}
                        {selectionGeometry && selectedBounds && selectionHandles && (
                            <SelectionOverlay
                                selectedBounds={selectedBounds}
                                selectedAnchor={selectedAnchor}
                                selectedRotation={selectedRotation}
                                rotateSide={rotateSide}
                                selectionHandles={selectionHandles}
                                activeHandle={activeHandle}
                                rotationPreview={rotationPreview}
                                canvasSize={canvasSize}
                                selectedText={selectedText}
                                selectedPicture={selectedPicture}
                                manipulating={manipulating}
                                selectionPillTop={selectionPillTop}
                                selectionPillCentre={selectionPillCentre}
                                editSelectedText={editSelectedText}
                                cycleSelectedTextStyle={cycleSelectedTextStyle}
                                cycleSelectedTextAlign={cycleSelectedTextAlign}
                                changeSelectedTextSize={changeSelectedTextSize}
                                deleteSelectedText={deleteSelectedText}
                                resizeSelectedPicture={resizeSelectedPicture}
                                rotateSelectedPicture={rotateSelectedPicture}
                                deleteSelectedPicture={deleteSelectedPicture}
                                styles={styles}
                                l={l}
                            />
                        )}

                        {/* Interactive Drag-to-Delete Trash Area */}
                        {isDraggingSelection && (
                            <TrashZone
                                trashPill={trashPill}
                                trashHovered={trashHovered}
                                styles={styles}
                                l={l}
                            />
                        )}

                        {/* Interactive Crop Box Overlay */}
                        {tool === 'crop' && (
                            <CropOverlay
                                cropBox={cropBox}
                                canvasSize={canvasSize}
                                styles={styles}
                            />
                        )}
                    </View>
                </View>

                <EditorControls
                    visibleToolItems={visibleToolItems}
                    tool={tool}
                    chooseTool={chooseTool}
                    rotate={rotate}
                    rotating={rotating}
                    cropping={cropping}
                    imageReady={imageReady}
                    page={page}
                    setPageSheet={setPageSheet}
                    aspectOptions={aspectOptions}
                    cropAspect={cropAspect}
                    selectCropAspect={selectCropAspect}
                    setTool={setTool}
                    setCropBox={setCropBox}
                    setCropAspect={setCropAspect}
                    applyCrop={applyCrop}
                    eraserMode={eraserMode}
                    setEraserMode={setEraserMode}
                    eraserRadius={eraserRadius}
                    setEraserRadius={setEraserRadius}
                    undo={undo}
                    redo={redo}
                    undoStack={undoStack}
                    redoStack={redoStack}
                    annotations={annotations}
                    commitAnnotations={commitAnnotations}
                    color={color}
                    updateColor={updateColor}
                    fontSize={fontSize}
                    strokeWidth={strokeWidth}
                    updateSize={updateSize}
                    colors={colors}
                    styles={styles}
                    l={l}
                    t={t}
                />

                {/* Paper and page colour, changeable while drawing */}
                <PageSheet
                    pageSheet={pageSheet}
                    page={page}
                    setPageSheet={setPageSheet}
                    changePaper={changePaper}
                    changePageColor={changePageColor}
                    styles={styles}
                    l={l}
                    t={t}
                />

                {/* Where the picture is coming from. Asked once, on the way to the picker, so
                    the page keeps the tap that said where the picture should land. */}
                <PictureSourceSheet
                    pictureSourceSheet={pictureSourceSheet}
                    setPictureSourceSheet={setPictureSourceSheet}
                    addPictureFrom={addPictureFrom}
                    styles={styles}
                    l={l}
                    t={t}
                />

                {/* Instagram-Style Fullscreen Text Composer Modal */}
                <TextComposerModal
                    textModal={textModal}
                    setTextModal={setTextModal}
                    textDraft={textDraft}
                    setTextDraft={setTextDraft}
                    textBgStyle={textBgStyle}
                    setTextBgStyle={setTextBgStyle}
                    textAlign={textAlign}
                    setTextAlign={setTextAlign}
                    fontSize={fontSize}
                    setFontSize={setFontSize}
                    color={color}
                    setColor={setColor}
                    confirmText={confirmText}
                    styles={styles}
                    l={l}
                    t={t}
                />

                {/* The surface the native export is photographed on. Mounted only while a save is
                    running, and parked off screen: it is the same drawing at export size, without
                    the selection frame, eraser ring or crop overlay, none of which belong in the
                    card. It has to be a real, laid-out view — `renderInContext` photographs a
                    layer, and a layer only exists once the view is in the tree. */}
                {exportSurface && (
                    <ExportSurfaceView
                        exportSurface={exportSurface}
                        exportSurfaceRef={exportSurfaceRef}
                        exportLaidOutRef={exportLaidOutRef}
                        exportPhotoLoadedRef={exportPhotoLoadedRef}
                        exportPicturesReadyRef={exportPicturesReadyRef}
                        page={page}
                        sourceUri={sourceUri}
                        sourceSize={sourceSize}
                        annotations={annotations}
                        styles={styles}
                    />
                )}
            </SafeAreaView>
        </Modal>
    );
}
