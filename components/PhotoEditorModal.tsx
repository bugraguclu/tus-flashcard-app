import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Image as NativeImage,
    KeyboardAvoidingView,
    Modal,
    PanResponder,
    PixelRatio,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
    Pressable,
    useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, {
    Ellipse,
    G,
    Line,
    Path,
    Polygon,
    Rect,
    Text as SvgText,
} from 'react-native-svg';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { captureRef } from 'react-native-view-shot';
import { BorderRadius, FontSize, Spacing, useThemeColors, type ColorScheme } from '../constants/theme';
import { alert } from '../lib/confirm';
import { readUriBytes } from '../lib/files';
import { sanitizeMediaFilename } from '../lib/mediaFilename';
import { saveMediaBytes } from '../lib/mediaStore';
import {
    applyAspectRatioToCropRect,
    applyPhotoEraserSweep,
    calculatePhotoTextBounds,
    calculateSourceCropPixels,
    clampCropRect,
    clampPhotoPoint,
    cropPhotoAnnotation,
    isPointInPhotoText,
    normalizePhotoRotation,
    normalizedRect,
    photoArrowHead,
    photoTextAnchorPixels,
    photoTextColors,
    resolvePhotoTextAlign,
    rotatePhotoAnnotationClockwise,
    type PhotoAnnotation,
    type PhotoCropRect,
    type PhotoEraserMode,
    type PhotoPoint,
    type PhotoShape,
    type PhotoText,
    type PhotoTextAlign,
    type PhotoTextStyle,
} from '../lib/photoEditor';
import {
    BLANK_CANVAS_BACKGROUNDS,
    BLANK_CANVAS_PAPERS,
    blankCanvasDefaultInk,
    blankCanvasPaperGeometry,
    blankCanvasPaperInk,
    cropBlankCanvasSize,
    type BlankCanvasPage,
    type BlankCanvasPaper,
} from '../lib/blankCanvas';
import PaperSwatch, { pageColorLabel, paperLabel } from './PaperSwatch';
import SwipeDismissSheet from './SwipeDismissSheet';
import { useI18n } from '../hooks/useI18n';

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

type EditorTool = 'pen' | 'highlighter' | 'arrow' | 'rect' | 'ellipse' | 'cover' | 'text' | 'eraser' | 'crop';

const TOOL_ITEMS: { id: EditorTool; icon: string }[] = [
    { id: 'pen', icon: '✏️' },
    { id: 'highlighter', icon: '🖍️' },
    { id: 'arrow', icon: '↗️' },
    { id: 'rect', icon: '▭' },
    { id: 'ellipse', icon: '◯' },
    { id: 'cover', icon: '■' },
    { id: 'text', icon: 'T' },
    { id: 'eraser', icon: '⌫' },
    { id: 'crop', icon: '✂️' },
];

const DRAW_COLORS = ['#ffffff', '#111827', '#ef4444', '#f97316', '#f59e0b', '#22c55e', '#06b6d4', '#0ea5e9', '#8b5cf6', '#ec4899'];
const WIDTHS = [3, 6, 10];
const FONT_SIZES = [18, 24, 32, 44];
/** Eraser tip radii in canvas points; independent from the pen width. */
const ERASER_RADII = [12, 24, 42];
const MIN_TEXT_SIZE = 12;
const MAX_TEXT_SIZE = 96;
/** Two fingers must travel this far apart before a pinch counts as a resize. */
const PINCH_ACTIVATION_PX = 12;
const ERASER_MODES: { id: PhotoEraserMode }[] = [{ id: 'partial' }, { id: 'object' }];

interface EditorHistoryState {
    sourceUri: string;
    sourceSize: { width: number; height: number };
    annotations: PhotoAnnotation[];
}

function makeId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function sameSourceSize(a: { width: number; height: number }, b: { width: number; height: number }): boolean {
    return a.width === b.width && a.height === b.height;
}

function smoothPath(points: PhotoPoint[], width: number, height: number): string {
    if (!points.length) return '';
    const px = (point: PhotoPoint) => ({ x: point.x * width, y: point.y * height });
    const first = px(points[0]);
    if (points.length === 1) return `M${first.x},${first.y} L${first.x + 0.01},${first.y}`;
    let path = `M${first.x},${first.y}`;
    for (let index = 1; index < points.length - 1; index += 1) {
        const current = px(points[index]);
        const next = px(points[index + 1]);
        path += ` Q${current.x},${current.y} ${(current.x + next.x) / 2},${(current.y + next.y) / 2}`;
    }
    const last = px(points[points.length - 1]);
    return `${path} L${last.x},${last.y}`;
}

function renderAnnotation(annotation: PhotoAnnotation | null | undefined, width: number, height: number) {
    if (!annotation) return null;
    if (annotation.type === 'stroke') {
        const points = Array.isArray(annotation.points) ? annotation.points : [];
        if (!points.length) return null;
        return (
            <Path
                key={annotation.id}
                d={smoothPath(points, width, height)}
                stroke={annotation.color || '#000000'}
                strokeWidth={annotation.width || 2}
                strokeOpacity={annotation.opacity ?? 1}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
            />
        );
    }

    if (annotation.type === 'text') {
        if (!annotation.point) return null;
        const bounds = calculatePhotoTextBounds(annotation, width, height);
        const bgStyle = annotation.bgStyle || 'classic';
        const textColor = annotation.color || '#ffffff';
        const textAlign = resolvePhotoTextAlign(annotation);
        const textAnchor = textAlign === 'left' ? 'start' : textAlign === 'right' ? 'end' : 'middle';
        const textX = textAlign === 'left'
            ? bounds.x + bounds.paddingX
            : textAlign === 'right'
                ? bounds.x + bounds.width - bounds.paddingX
                : bounds.x + bounds.width / 2;

        const { background: badgeBgColor, text: finalTextColor } = photoTextColors(annotation);

        const anchor = photoTextAnchorPixels(annotation, width, height);
        const rotation = normalizePhotoRotation(annotation.rotation ?? 0);

        return (
            <G
                key={annotation.id}
                transform={rotation ? `rotate(${rotation}, ${anchor.x}, ${anchor.y})` : undefined}
            >
                {bgStyle !== 'classic' && (
                    <Rect
                        x={bounds.x}
                        y={bounds.y}
                        width={bounds.width}
                        height={bounds.height}
                        rx={Math.max(6, (annotation.fontSize || 20) * 0.3)}
                        ry={Math.max(6, (annotation.fontSize || 20) * 0.3)}
                        fill={bgStyle === 'outline' ? 'none' : badgeBgColor}
                        fillOpacity={bgStyle === 'frosted' ? 0.75 : 1}
                        stroke={bgStyle === 'outline' ? textColor : 'none'}
                        strokeWidth={bgStyle === 'outline' ? 2.5 : 0}
                    />
                )}
                {bounds.lines.map((line, lineIndex) => {
                    const lineY = bounds.y + bounds.paddingY + (lineIndex + 0.82) * bounds.lineHeight;
                    return (
                        <React.Fragment key={`${annotation.id}-${lineIndex}`}>
                            {bgStyle === 'classic' && (
                                <SvgText
                                    x={textX}
                                    y={lineY}
                                    fill={textColor === '#ffffff' ? '#111827' : '#ffffff'}
                                    stroke={textColor === '#ffffff' ? '#111827' : '#ffffff'}
                                    strokeWidth={Math.max(3, (annotation.fontSize || 20) * 0.18)}
                                    strokeLinejoin="round"
                                    strokeLinecap="round"
                                    fontSize={annotation.fontSize || 20}
                                    fontWeight="800"
                                    textAnchor={textAnchor}
                                >
                                    {line}
                                </SvgText>
                            )}
                            <SvgText
                                x={textX}
                                y={lineY}
                                fill={finalTextColor}
                                fontSize={annotation.fontSize || 20}
                                fontWeight="800"
                                textAnchor={textAnchor}
                            >
                                {line}
                            </SvgText>
                        </React.Fragment>
                    );
                })}
            </G>
        );
    }

    if (!annotation.start || !annotation.end) return null;
    const start = { x: (annotation.start.x ?? 0) * width, y: (annotation.start.y ?? 0) * height };
    const end = { x: (annotation.end.x ?? 0) * width, y: (annotation.end.y ?? 0) * height };
    if (annotation.type === 'arrow') {
        const head = photoArrowHead(annotation.start, annotation.end, width, height, 12 + (annotation.width || 3) * 1.5);
        return (
            <React.Fragment key={annotation.id}>
                <Line
                    x1={start.x} y1={start.y} x2={end.x} y2={end.y}
                    stroke={annotation.color} strokeWidth={annotation.width || 3}
                    strokeOpacity={annotation.opacity ?? 1} strokeLinecap="round"
                />
                <Polygon
                    points={head.map((point) => `${point.x},${point.y}`).join(' ')}
                    fill={annotation.color}
                    fillOpacity={annotation.opacity ?? 1}
                />
            </React.Fragment>
        );
    }

    const rect = normalizedRect(annotation.start, annotation.end);
    if (annotation.type === 'ellipse') {
        return (
            <Ellipse
                key={annotation.id}
                cx={(rect.x + rect.width / 2) * width}
                cy={(rect.y + rect.height / 2) * height}
                rx={rect.width * width / 2}
                ry={rect.height * height / 2}
                stroke={annotation.color}
                strokeWidth={annotation.width || 3}
                strokeOpacity={annotation.opacity ?? 1}
                fill="none"
            />
        );
    }
    return (
        <Rect
            key={annotation.id}
            x={rect.x * width}
            y={rect.y * height}
            width={rect.width * width}
            height={rect.height * height}
            stroke={annotation.color}
            strokeWidth={annotation.width || 3}
            strokeOpacity={annotation.opacity ?? 1}
            fill={annotation.type === 'cover' ? annotation.color : 'none'}
            fillOpacity={annotation.type === 'cover' ? 0.96 : 0}
        />
    );
}

function drawAnnotationOnCanvas(
    ctx: CanvasRenderingContext2D,
    annotation: PhotoAnnotation | null | undefined,
    width: number,
    height: number,
) {
    if (!annotation) return;
    ctx.save();
    ctx.globalAlpha = annotation.opacity ?? 1;
    ctx.strokeStyle = annotation.color || '#000000';
    ctx.fillStyle = annotation.color || '#000000';
    ctx.lineWidth = (annotation.width || 3) * (width / 500);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (annotation.type === 'stroke') {
        const points = Array.isArray(annotation.points) ? annotation.points : [];
        if (!points.length) return ctx.restore();
        ctx.beginPath();
        ctx.moveTo((points[0].x ?? 0) * width, (points[0].y ?? 0) * height);
        for (let index = 1; index < points.length; index += 1) {
            ctx.lineTo((points[index].x ?? 0) * width, (points[index].y ?? 0) * height);
        }
        ctx.stroke();
        return ctx.restore();
    }

    if (annotation.type === 'text') {
        if (!annotation.point) return ctx.restore();
        const rotation = normalizePhotoRotation(annotation.rotation ?? 0);
        if (rotation) {
            const anchor = photoTextAnchorPixels(annotation, width, height);
            ctx.translate(anchor.x, anchor.y);
            ctx.rotate((rotation * Math.PI) / 180);
            ctx.translate(-anchor.x, -anchor.y);
        }
        const bounds = calculatePhotoTextBounds(annotation, width, height);
        const bgStyle = annotation.bgStyle || 'classic';
        const textColor = annotation.color || '#ffffff';
        const fontSize = (annotation.fontSize || 20) * (width / 500);
        const lineHeight = fontSize * 1.25;
        const textAlign = resolvePhotoTextAlign(annotation);
        const { background: badgeBgColor, text: finalTextColor } = photoTextColors(annotation);

        if (bgStyle !== 'classic') {
            const radius = Math.max(6, fontSize * 0.3);
            ctx.beginPath();
            if (typeof ctx.roundRect === 'function') {
                ctx.roundRect(bounds.x, bounds.y, bounds.width, bounds.height, radius);
            } else {
                ctx.rect(bounds.x, bounds.y, bounds.width, bounds.height);
            }
            if (bgStyle === 'outline') {
                ctx.strokeStyle = textColor;
                ctx.lineWidth = 2.5 * (width / 500);
                ctx.stroke();
            } else {
                ctx.fillStyle = badgeBgColor;
                ctx.globalAlpha = bgStyle === 'frosted' ? 0.75 : 1;
                ctx.fill();
            }
        }

        ctx.globalAlpha = 1;
        ctx.font = `800 ${fontSize}px -apple-system, BlinkMacSystemFont, sans-serif`;
        ctx.textAlign = textAlign === 'left' ? 'left' : textAlign === 'right' ? 'right' : 'center';
        const textX = textAlign === 'left'
            ? bounds.x + bounds.paddingX
            : textAlign === 'right'
                ? bounds.x + bounds.width - bounds.paddingX
                : bounds.x + bounds.width / 2;

        bounds.lines.forEach((line, index) => {
            const lineY = bounds.y + bounds.paddingY + (index + 0.82) * lineHeight;
            if (bgStyle === 'classic') {
                ctx.strokeStyle = textColor === '#ffffff' ? '#111827' : '#ffffff';
                ctx.lineWidth = Math.max(3, fontSize * 0.18);
                ctx.lineJoin = 'round';
                ctx.strokeText(line, textX, lineY);
            }
            ctx.fillStyle = finalTextColor;
            ctx.fillText(line, textX, lineY);
        });

        return ctx.restore();
    }

    if (!annotation.start || !annotation.end) return ctx.restore();
    const start = { x: (annotation.start.x ?? 0) * width, y: (annotation.start.y ?? 0) * height };
    const end = { x: (annotation.end.x ?? 0) * width, y: (annotation.end.y ?? 0) * height };
    if (annotation.type === 'arrow') {
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();
        const head = photoArrowHead(annotation.start, annotation.end, width, height, 18 + ctx.lineWidth * 1.5);
        ctx.beginPath();
        ctx.moveTo(head[0].x, head[0].y);
        ctx.lineTo(head[1].x, head[1].y);
        ctx.lineTo(head[2].x, head[2].y);
        ctx.closePath();
        ctx.fill();
        return ctx.restore();
    }

    const rect = normalizedRect(annotation.start, annotation.end);
    if (annotation.type === 'rect') {
        ctx.strokeRect(rect.x * width, rect.y * height, rect.width * width, rect.height * height);
    } else if (annotation.type === 'cover') {
        ctx.globalAlpha = 0.96;
        ctx.fillRect(rect.x * width, rect.y * height, rect.width * width, rect.height * height);
    } else {
        ctx.beginPath();
        ctx.ellipse(
            (rect.x + rect.width / 2) * width,
            (rect.y + rect.height / 2) * height,
            rect.width * width / 2,
            rect.height * height / 2,
            0, 0, Math.PI * 2,
        );
        ctx.stroke();
    }
    ctx.restore();
}

async function rasterizePhotoWeb(
    uri: string,
    annotations: PhotoAnnotation[],
    sourceWidth: number,
    sourceHeight: number,
): Promise<Uint8Array> {
    const maxDimension = 2000;
    const scale = Math.min(1, maxDimension / Math.max(sourceWidth, sourceHeight));
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const element = new window.Image();
        element.onload = () => resolve(element);
        element.onerror = () => reject(new Error('Photo could not be loaded'));
        element.src = uri;
    });
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas context unavailable');
    ctx.drawImage(image, 0, 0, width, height);
    annotations.forEach((annotation) => drawAnnotationOnCanvas(ctx, annotation, width, height));
    const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((value) => value ? resolve(value) : reject(new Error('PNG encode failed')), 'image/png');
    });
    return new Uint8Array(await blob.arrayBuffer());
}

/** Web export for a drawn page: paint the paper, then replay the annotations over it. */
async function rasterizeBlankCanvasWeb(
    page: BlankCanvasPage,
    annotations: PhotoAnnotation[],
    width: number,
    height: number,
): Promise<Uint8Array> {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width));
    canvas.height = Math.max(1, Math.round(height));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas context unavailable');

    ctx.fillStyle = page.background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const ruling = blankCanvasPaperGeometry(page.paper, canvas.width, canvas.height);
    if (ruling.lines.length || ruling.dots.length) {
        const ink = blankCanvasPaperInk(page.background);
        ctx.save();
        ctx.strokeStyle = ink;
        ctx.fillStyle = ink;
        ctx.lineWidth = Math.max(1, ruling.spacing / 40);
        ruling.lines.forEach((line) => {
            ctx.beginPath();
            ctx.moveTo(line.x1, line.y1);
            ctx.lineTo(line.x2, line.y2);
            ctx.stroke();
        });
        const dotRadius = Math.max(1, ruling.spacing / 22);
        ruling.dots.forEach((dot) => {
            ctx.beginPath();
            ctx.arc(dot.x, dot.y, dotRadius, 0, Math.PI * 2);
            ctx.fill();
        });
        ctx.restore();
    }

    annotations.forEach((annotation) => drawAnnotationOnCanvas(ctx, annotation, canvas.width, canvas.height));
    const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((value) => value ? resolve(value) : reject(new Error('PNG encode failed')), 'image/png');
    });
    return new Uint8Array(await blob.arrayBuffer());
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
        { ...TOOL_ITEMS[7], label: l('Silgi', 'Eraser') },
        { ...TOOL_ITEMS[8], label: l('Kırp', 'Crop') },
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
    const styles = useMemo(() => createStyles(colors), [colors]);
    const { width: screenWidth, height: screenHeight } = useWindowDimensions();
    const canvasRef = useRef<View>(null);
    const [sourceUri, setSourceUri] = useState('');
    const [sourceSize, setSourceSize] = useState({ width: 4, height: 3 });
    // Set only in blank-page mode: the paper the user draws on, in place of a source bitmap.
    const [page, setPage] = useState<{ background: string; paper: BlankCanvasPaper } | null>(null);
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
    const [selectedTextId, setSelectedTextId] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [rotating, setRotating] = useState(false);
    const [cropping, setCropping] = useState(false);
    const [imageReady, setImageReady] = useState(false);
    const [eraserCursor, setEraserCursor] = useState<{ x: number; y: number; radius: number } | null>(null);
    const [eraserRadius, setEraserRadius] = useState(ERASER_RADII[1]);
    const [eraserMode, setEraserMode] = useState<PhotoEraserMode>('partial');
    const [isDraggingText, setIsDraggingText] = useState(false);
    const [trashHovered, setTrashHovered] = useState(false);

    const [cropBox, setCropBox] = useState<PhotoCropRect>({ x: 0, y: 0, width: 1, height: 1 });
    const [cropAspect, setCropAspect] = useState<string>('free');

    const annotationsRef = useRef(annotations);
    annotationsRef.current = annotations;
    const sourceUriRef = useRef(sourceUri);
    sourceUriRef.current = sourceUri;
    const sourceSizeRef = useRef(sourceSize);
    sourceSizeRef.current = sourceSize;
    const toolRef = useRef(tool);
    toolRef.current = tool;
    const colorRef = useRef(color);
    colorRef.current = color;
    const strokeWidthRef = useRef(strokeWidth);
    strokeWidthRef.current = strokeWidth;
    const fontSizeRef = useRef(fontSize);
    fontSizeRef.current = fontSize;
    const selectedTextIdRef = useRef(selectedTextId);
    selectedTextIdRef.current = selectedTextId;
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

    // Touch coordinates must be resolved against the canvas itself. `locationX` is relative to
    // whichever view the finger happens to be over (a selection frame, a handle), so overlays
    // would silently break dragging; the canvas origin in window space never lies.
    const canvasOriginRef = useRef({ x: 0, y: 0 });
    const measureCanvasOrigin = () => {
        canvasRef.current?.measureInWindow((x, y) => {
            if (Number.isFinite(x) && Number.isFinite(y)) canvasOriginRef.current = { x, y };
        });
    };

    const gestureRef = useRef<{ start: PhotoPoint; points: PhotoPoint[] } | null>(null);
    const erasedInCurrentGestureRef = useRef(false);
    const gestureStartAnnotationsRef = useRef<PhotoAnnotation[] | null>(null);
    const cropDragRef = useRef<{
        mode: 'move' | 'tl' | 'tr' | 'bl' | 'br' | 't' | 'b' | 'l' | 'r' | 'new';
        initialBox: PhotoCropRect;
        startPoint: PhotoPoint;
    } | null>(null);
    const textDragRef = useRef<{
        id: string;
        startPoint: PhotoPoint;
        initialTextPoint: PhotoPoint;
        hasMoved: boolean;
    } | null>(null);
    const pinchRef = useRef<{
        id: string;
        startDistance: number;
        startAngle: number;
        initialFontSize: number;
        initialRotation: number;
        beforeAnnotations: PhotoAnnotation[];
        applied: boolean;
    } | null>(null);

    useEffect(() => {
        if (!visible) return;
        // A picture wins if both are supplied; a caller opens the editor for one or the other.
        const drawnPage = photo ? null : blankPage;
        if (!photo && !drawnPage) return;
        setAnnotations([]);
        setUndoStack([]);
        setRedoStack([]);
        setLiveAnnotation(null);
        setSelectedTextId(null);
        setTextBgStyle('badge');
        setTextAlign('center');
        setTool('pen');
        setEraserRadius(ERASER_RADII[1]);
        setEraserMode('partial');
        setCropBox({ x: 0, y: 0, width: 1, height: 1 });
        setCropAspect('free');
        setPageSheet(false);

        if (drawnPage) {
            setPage({ background: drawnPage.background, paper: drawnPage.paper });
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

    const compact = screenHeight < 760;
    const maxCanvasWidth = Math.min(screenWidth - 16, 940);
    const maxCanvasHeight = Math.max(220, screenHeight - (compact ? 244 : 286));
    const ratio = sourceSize.width / sourceSize.height;
    const canvasSize = useMemo(() => {
        if (maxCanvasWidth / maxCanvasHeight > ratio) {
            return { width: maxCanvasHeight * ratio, height: maxCanvasHeight };
        }
        return { width: maxCanvasWidth, height: maxCanvasWidth / ratio };
    }, [maxCanvasWidth, maxCanvasHeight, ratio]);
    const canvasSizeRef = useRef(canvasSize);
    canvasSizeRef.current = canvasSize;

    const commitAnnotations = (next: PhotoAnnotation[]) => {
        const snapshot: EditorHistoryState = {
            sourceUri: sourceUriRef.current,
            sourceSize: sourceSizeRef.current,
            annotations: annotationsRef.current,
        };
        setUndoStack((stack) => [...stack.slice(-29), snapshot]);
        setRedoStack([]);
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

    const selectedAnnotation = useMemo(() => {
        if (!selectedTextId) return null;
        return (annotations.find((ann) => ann.id === selectedTextId && ann.type === 'text') as PhotoText) || null;
    }, [annotations, selectedTextId]);

    const selectedBounds = useMemo(() => {
        if (!selectedAnnotation) return null;
        return calculatePhotoTextBounds(selectedAnnotation, canvasSize.width, canvasSize.height);
    }, [selectedAnnotation, canvasSize.width, canvasSize.height]);

    const selectedAnchor = useMemo(() => {
        if (!selectedAnnotation) return { x: 0, y: 0 };
        return photoTextAnchorPixels(selectedAnnotation, canvasSize.width, canvasSize.height);
    }, [selectedAnnotation, canvasSize.width, canvasSize.height]);

    const editSelectedText = () => {
        if (!selectedAnnotation) return;
        setTextDraft(selectedAnnotation.text);
        setTextBgStyle(selectedAnnotation.bgStyle || 'badge');
        setTextAlign(selectedAnnotation.textAlign || 'center');
        setColor(selectedAnnotation.color);
        setFontSize(selectedAnnotation.fontSize);
        setTextModal(true);
    };

    const cycleSelectedTextStyle = () => {
        if (!selectedTextId || !selectedAnnotation) return;
        const stylesList: PhotoTextStyle[] = ['classic', 'badge', 'frosted', 'outline'];
        const currentStyle = selectedAnnotation.bgStyle || 'classic';
        const nextStyle = stylesList[(stylesList.indexOf(currentStyle) + 1) % stylesList.length];
        setTextBgStyle(nextStyle);
        const next = annotations.map((ann) => (ann.id === selectedTextId ? { ...ann, bgStyle: nextStyle } : ann));
        commitAnnotations(next);
    };

    const cycleSelectedTextAlign = () => {
        if (!selectedTextId || !selectedAnnotation) return;
        const aligns: PhotoTextAlign[] = ['center', 'right', 'left'];
        const currentAlign = selectedAnnotation.textAlign || 'center';
        const nextAlign = aligns[(aligns.indexOf(currentAlign) + 1) % aligns.length];
        setTextAlign(nextAlign);
        const next = annotations.map((ann) => (ann.id === selectedTextId ? { ...ann, textAlign: nextAlign } : ann));
        commitAnnotations(next);
    };

    const deleteSelectedText = () => {
        if (!selectedTextId) return;
        const next = annotations.filter((ann) => ann.id !== selectedTextId);
        commitAnnotations(next);
        setSelectedTextId(null);
    };

    const changeSelectedTextSize = (delta: number) => {
        if (!selectedTextId || !selectedAnnotation) return;
        const newSize = Math.max(14, Math.min(52, (selectedAnnotation.fontSize || 20) + delta));
        setFontSize(newSize);
        const next = annotations.map((ann) => (ann.id === selectedTextId ? { ...ann, fontSize: newSize } : ann));
        commitAnnotations(next);
    };

    const updateColor = (newColor: string) => {
        setColor(newColor);
        if (tool === 'text' && selectedTextId) {
            const next = annotations.map((ann) => (ann.id === selectedTextId ? { ...ann, color: newColor } : ann));
            commitAnnotations(next);
        }
    };

    const updateSize = (newSize: number) => {
        if (tool === 'text') {
            setFontSize(newSize);
            if (selectedTextId) {
                const next = annotations.map((ann) => (ann.id === selectedTextId ? { ...ann, fontSize: newSize } : ann));
                commitAnnotations(next);
            }
        } else {
            setStrokeWidth(newSize);
        }
    };

    const panResponder = useRef(PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (event) => {
            const point = pointFromEvent(event);
            const currentTool = toolRef.current;

            if (currentTool === 'crop') {
                const box = cropBoxRef.current;
                const { width: cW, height: cH } = canvasSizeRef.current;
                const px = point.x * cW;
                const py = point.y * cH;
                const boxLeft = box.x * cW;
                const boxTop = box.y * cH;
                const boxRight = (box.x + box.width) * cW;
                const boxBottom = (box.y + box.height) * cH;
                const handleR = 30;
                const edgeR = 20;

                let mode: 'move' | 'tl' | 'tr' | 'bl' | 'br' | 't' | 'b' | 'l' | 'r' | 'new' = 'new';
                if (Math.hypot(px - boxLeft, py - boxTop) < handleR) mode = 'tl';
                else if (Math.hypot(px - boxRight, py - boxTop) < handleR) mode = 'tr';
                else if (Math.hypot(px - boxLeft, py - boxBottom) < handleR) mode = 'bl';
                else if (Math.hypot(px - boxRight, py - boxBottom) < handleR) mode = 'br';
                else if (Math.abs(py - boxTop) < edgeR && px >= boxLeft && px <= boxRight) mode = 't';
                else if (Math.abs(py - boxBottom) < edgeR && px >= boxLeft && px <= boxRight) mode = 'b';
                else if (Math.abs(px - boxLeft) < edgeR && py >= boxTop && py <= boxBottom) mode = 'l';
                else if (Math.abs(px - boxRight) < edgeR && py >= boxTop && py <= boxBottom) mode = 'r';
                else if (px > boxLeft && px < boxRight && py > boxTop && py < boxBottom) mode = 'move';

                cropDragRef.current = {
                    mode,
                    initialBox: { ...box },
                    startPoint: point,
                };
                return;
            }

            if (currentTool === 'eraser') {
                const radius = eraserRadiusRef.current;
                setEraserCursor({
                    x: point.x * canvasSizeRef.current.width,
                    y: point.y * canvasSizeRef.current.height,
                    radius,
                });
                gestureRef.current = { start: point, points: [point] };
                gestureStartAnnotationsRef.current = annotationsRef.current;
                erasedInCurrentGestureRef.current = false;

                const result = applyPhotoEraserSweep(
                    annotationsRef.current, point, point,
                    canvasSizeRef.current.width, canvasSizeRef.current.height,
                    radius, eraserModeRef.current,
                );
                if (result.changed) {
                    erasedInCurrentGestureRef.current = true;
                    annotationsRef.current = result.annotations;
                    setAnnotations(result.annotations);
                }
                return;
            }

            // 1. Check if tap hits the currently selected text
            const selectedAnn = selectedTextIdRef.current
                ? (annotationsRef.current.find((ann) => ann.id === selectedTextIdRef.current && ann.type === 'text') as PhotoText | undefined)
                : null;

            if (selectedAnn && isPointInPhotoText(selectedAnn, point, canvasSizeRef.current.width, canvasSizeRef.current.height, 28)) {
                textDragRef.current = {
                    id: selectedAnn.id,
                    startPoint: point,
                    initialTextPoint: { ...selectedAnn.point },
                    hasMoved: false,
                };
                return;
            }

            // 2. The text tool grabs any label it lands on. Drawing tools deliberately do not,
            // so a pen stroke can cross a label instead of picking it up.
            if (currentTool === 'text') {
                for (let i = annotationsRef.current.length - 1; i >= 0; i -= 1) {
                    const ann = annotationsRef.current[i];
                    if (ann.type === 'text' && isPointInPhotoText(ann as PhotoText, point, canvasSizeRef.current.width, canvasSizeRef.current.height, 28)) {
                        setSelectedTextId(ann.id);
                        setColor(ann.color);
                        setFontSize(ann.fontSize);
                        setTextBgStyle(ann.bgStyle || 'badge');
                        setTextAlign(ann.textAlign || 'center');
                        textDragRef.current = {
                            id: ann.id,
                            startPoint: point,
                            initialTextPoint: { ...ann.point },
                            hasMoved: false,
                        };
                        return;
                    }
                }
            }

            // 3. If text tool is active and tapped empty canvas:
            if (currentTool === 'text') {
                if (selectedTextIdRef.current) {
                    setSelectedTextId(null);
                    return;
                }
                setTextDraft('');
                setTextBgStyle('badge');
                setTextAlign('center');
                setTextModal(true);
                return;
            }

            if (selectedTextIdRef.current) {
                setSelectedTextId(null);
            }

            gestureRef.current = { start: point, points: [point] };
            const base = {
                id: 'live', color: colorRef.current,
                width: currentTool === 'highlighter' ? Math.max(14, strokeWidthRef.current * 3) : strokeWidthRef.current,
                opacity: currentTool === 'highlighter' ? 0.32 : 1,
            };
            if (currentTool === 'pen' || currentTool === 'highlighter') {
                setLiveAnnotation({ ...base, type: 'stroke', points: [point] });
            } else {
                setLiveAnnotation({ ...base, type: currentTool, start: point, end: point } as PhotoShape);
            }
        },
        onPanResponderMove: (event) => {
            const currentTool = toolRef.current;
            const touches = event.nativeEvent.touches ?? [];

            // Two fingers on the selected label scale and twist it, the way story editors do.
            if (touches.length >= 2 && selectedTextIdRef.current) {
                const [first, second] = touches;
                const selected = annotationsRef.current.find(
                    (ann) => ann.id === selectedTextIdRef.current && ann.type === 'text',
                ) as PhotoText | undefined;
                if (!selected) return;

                const distance = Math.hypot(second.pageX - first.pageX, second.pageY - first.pageY);
                const angle = (Math.atan2(second.pageY - first.pageY, second.pageX - first.pageX) * 180) / Math.PI;

                if (!pinchRef.current || pinchRef.current.id !== selected.id) {
                    pinchRef.current = {
                        id: selected.id,
                        startDistance: Math.max(1, distance),
                        startAngle: angle,
                        initialFontSize: selected.fontSize,
                        initialRotation: selected.rotation ?? 0,
                        beforeAnnotations: annotationsRef.current,
                        applied: false,
                    };
                    // A second finger ends any drag in progress so the label does not jump.
                    textDragRef.current = null;
                    setIsDraggingText(false);
                    setTrashHovered(false);
                    return;
                }

                const pinch = pinchRef.current;
                let turned = angle - pinch.startAngle;
                if (turned > 180) turned -= 360;
                else if (turned < -180) turned += 360;
                if (!pinch.applied
                    && Math.abs(distance - pinch.startDistance) < PINCH_ACTIVATION_PX
                    && Math.abs(turned) < 4) {
                    return;
                }
                pinch.applied = true;

                const scaled = Math.round(Math.max(MIN_TEXT_SIZE, Math.min(
                    MAX_TEXT_SIZE,
                    pinch.initialFontSize * (distance / pinch.startDistance),
                )));
                const rotation = normalizePhotoRotation(pinch.initialRotation + turned);
                const next = annotationsRef.current.map((ann) => (
                    ann.id === pinch.id && ann.type === 'text'
                        ? { ...ann, fontSize: scaled, rotation }
                        : ann
                ));
                annotationsRef.current = next;
                setAnnotations(next);
                setFontSize(scaled);
                return;
            }

            // Ignore the leftover single finger after a pinch: resuming a drag mid-gesture
            // would snap the label to wherever that finger happens to be.
            if (pinchRef.current) return;

            const point = pointFromEvent(event);

            if (currentTool === 'crop') {
                const drag = cropDragRef.current;
                if (!drag) return;
                const dx = point.x - drag.startPoint.x;
                const dy = point.y - drag.startPoint.y;
                const init = drag.initialBox;

                let nextBox = { ...init };
                if (drag.mode === 'move') {
                    nextBox.x = Math.max(0, Math.min(1 - init.width, init.x + dx));
                    nextBox.y = Math.max(0, Math.min(1 - init.height, init.y + dy));
                } else if (drag.mode === 'new') {
                    const minX = Math.min(drag.startPoint.x, point.x);
                    const minY = Math.min(drag.startPoint.y, point.y);
                    const maxX = Math.max(drag.startPoint.x, point.x);
                    const maxY = Math.max(drag.startPoint.y, point.y);
                    nextBox = { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
                } else {
                    let left = init.x;
                    let top = init.y;
                    let right = init.x + init.width;
                    let bottom = init.y + init.height;

                    if (drag.mode.includes('l')) left = Math.min(right - 0.05, Math.max(0, init.x + dx));
                    if (drag.mode.includes('r')) right = Math.max(left + 0.05, Math.min(1, init.x + init.width + dx));
                    if (drag.mode.includes('t')) top = Math.min(bottom - 0.05, Math.max(0, init.y + dy));
                    if (drag.mode.includes('b')) bottom = Math.max(top + 0.05, Math.min(1, init.y + init.height + dy));

                    nextBox = { x: left, y: top, width: right - left, height: bottom - top };
                }

                const clamped = clampCropRect(nextBox);
                setCropBox(clamped);
                return;
            }

            if (currentTool === 'eraser') {
                const prevPoint = gestureRef.current?.points[gestureRef.current.points.length - 1] || point;
                gestureRef.current?.points.push(point);

                const radius = eraserRadiusRef.current;
                setEraserCursor({
                    x: point.x * canvasSizeRef.current.width,
                    y: point.y * canvasSizeRef.current.height,
                    radius,
                });

                const result = applyPhotoEraserSweep(
                    annotationsRef.current, prevPoint, point,
                    canvasSizeRef.current.width, canvasSizeRef.current.height,
                    radius, eraserModeRef.current,
                );
                if (result.changed) {
                    erasedInCurrentGestureRef.current = true;
                    annotationsRef.current = result.annotations;
                    setAnnotations(result.annotations);
                }
                return;
            }

            if (textDragRef.current) {
                const drag = textDragRef.current;
                const dx = point.x - drag.startPoint.x;
                const dy = point.y - drag.startPoint.y;
                if (Math.hypot(dx, dy) > 0.003) {
                    drag.hasMoved = true;
                    setIsDraggingText(true);
                }

                const newPoint = clampPhotoPoint({
                    x: Math.max(0.04, Math.min(0.96, drag.initialTextPoint.x + dx)),
                    y: Math.max(0.04, Math.min(0.96, drag.initialTextPoint.y + dy)),
                });

                // Detect hovering over trash zone at bottom center
                const isOverTrash = point.y > 0.82 && point.x >= 0.28 && point.x <= 0.72;
                setTrashHovered(isOverTrash);

                const next = annotationsRef.current.map((ann) => (
                    ann.id === drag.id && ann.type === 'text'
                        ? { ...ann, point: newPoint }
                        : ann
                ));
                annotationsRef.current = next;
                setAnnotations(next);
                return;
            }

            const gesture = gestureRef.current;
            if (!gesture || !Array.isArray(gesture.points)) return;
            if (currentTool === 'pen' || currentTool === 'highlighter') {
                gesture.points.push(point);
                const strokePoints = [...gesture.points];
                setLiveAnnotation((current) => current && current.type === 'stroke'
                    ? { ...current, points: strokePoints }
                    : current);
            } else {
                setLiveAnnotation((current) => current && current.type !== 'stroke' && current.type !== 'text'
                    ? { ...current, end: point }
                    : current);
            }
        },
        onPanResponderRelease: () => {
            const pinch = pinchRef.current;
            if (pinch) {
                pinchRef.current = null;
                if (pinch.applied) {
                    setUndoStack((stack) => [...stack.slice(-29), {
                        sourceUri: sourceUriRef.current,
                        sourceSize: sourceSizeRef.current,
                        annotations: pinch.beforeAnnotations,
                    }]);
                    setRedoStack([]);
                }
                gestureRef.current = null;
                textDragRef.current = null;
                setLiveAnnotation(null);
                return;
            }
            if (toolRef.current === 'crop') {
                cropDragRef.current = null;
                setCropBox((curr) => clampCropRect(curr));
                return;
            }
            if (toolRef.current === 'eraser') {
                setEraserCursor(null);
                if (erasedInCurrentGestureRef.current && gestureStartAnnotationsRef.current) {
                    const snapshot: EditorHistoryState = {
                        sourceUri: sourceUriRef.current,
                        sourceSize: sourceSizeRef.current,
                        annotations: gestureStartAnnotationsRef.current,
                    };
                    setUndoStack((stack) => [...stack.slice(-29), snapshot]);
                    setRedoStack([]);
                }
                gestureRef.current = null;
                gestureStartAnnotationsRef.current = null;
                erasedInCurrentGestureRef.current = false;
                return;
            }
            if (textDragRef.current) {
                const drag = textDragRef.current;
                const wasOverTrash = trashHovered;
                setIsDraggingText(false);
                setTrashHovered(false);

                if (wasOverTrash) {
                    const next = annotationsRef.current.filter((ann) => ann.id !== drag.id);
                    commitAnnotations(next);
                    setSelectedTextId(null);
                } else if (drag.hasMoved) {
                    const initialPt = drag.initialTextPoint;
                    const dragId = drag.id;
                    const previousAnnotations = annotationsRef.current.map((ann) => (
                        ann.id === dragId && ann.type === 'text'
                            ? { ...ann, point: initialPt }
                            : ann
                    ));
                    const snapshot: EditorHistoryState = {
                        sourceUri: sourceUriRef.current,
                        sourceSize: sourceSizeRef.current,
                        annotations: previousAnnotations,
                    };
                    setUndoStack((stack) => [...stack.slice(-29), snapshot]);
                    setRedoStack([]);
                }
                textDragRef.current = null;
                return;
            }
            const gesture = gestureRef.current;
            const currentTool = toolRef.current;
            if (gesture && Array.isArray(gesture.points) && gesture.points.length > 0) {
                const base = {
                    id: makeId(),
                    color: colorRef.current,
                    width: currentTool === 'highlighter' ? Math.max(14, strokeWidthRef.current * 3) : strokeWidthRef.current,
                    opacity: currentTool === 'highlighter' ? 0.32 : 1,
                };
                if (currentTool === 'pen' || currentTool === 'highlighter') {
                    commitAnnotations([
                        ...annotationsRef.current,
                        { ...base, type: 'stroke', points: [...gesture.points] },
                    ]);
                } else if (currentTool !== 'text') {
                    const lastPoint = gesture.points[gesture.points.length - 1] ?? gesture.start;
                    commitAnnotations([
                        ...annotationsRef.current,
                        { ...base, type: currentTool, start: gesture.start, end: lastPoint } as PhotoShape,
                    ]);
                }
            }
            gestureRef.current = null;
            setLiveAnnotation(null);
        },
        onPanResponderTerminate: () => {
            pinchRef.current = null;
            if (toolRef.current === 'eraser') {
                setEraserCursor(null);
                if (erasedInCurrentGestureRef.current && gestureStartAnnotationsRef.current) {
                    const snapshot: EditorHistoryState = {
                        sourceUri: sourceUriRef.current,
                        sourceSize: sourceSizeRef.current,
                        annotations: gestureStartAnnotationsRef.current,
                    };
                    setUndoStack((stack) => [...stack.slice(-29), snapshot]);
                    setRedoStack([]);
                }
                gestureStartAnnotationsRef.current = null;
                erasedInCurrentGestureRef.current = false;
            }
            setIsDraggingText(false);
            setTrashHovered(false);
            cropDragRef.current = null;
            textDragRef.current = null;
            gestureRef.current = null;
            setLiveAnnotation(null);
        },
    })).current;

    const undo = () => {
        setUndoStack((stack) => {
            if (!stack.length) return stack;
            const previous = stack[stack.length - 1];
            const currentSnapshot: EditorHistoryState = {
                sourceUri: sourceUriRef.current,
                sourceSize: sourceSizeRef.current,
                annotations: annotationsRef.current,
            };
            setRedoStack((redo) => [...redo.slice(-29), currentSnapshot]);
            if (previous.sourceUri !== sourceUriRef.current) {
                setImageReady(false);
                setSourceUri(previous.sourceUri);
            }
            // A drawn page rotates and crops without ever swapping its (empty) source, so the
            // size has to be restored on its own or the ink would land on the wrong sheet.
            if (!sameSourceSize(previous.sourceSize, sourceSizeRef.current)) {
                setSourceSize(previous.sourceSize);
            }
            annotationsRef.current = previous.annotations;
            setAnnotations(previous.annotations);
            return stack.slice(0, -1);
        });
    };

    const redo = () => {
        setRedoStack((stack) => {
            if (!stack.length) return stack;
            const next = stack[stack.length - 1];
            const currentSnapshot: EditorHistoryState = {
                sourceUri: sourceUriRef.current,
                sourceSize: sourceSizeRef.current,
                annotations: annotationsRef.current,
            };
            setUndoStack((undoItems) => [...undoItems.slice(-29), currentSnapshot]);
            if (next.sourceUri !== sourceUriRef.current) {
                setImageReady(false);
                setSourceUri(next.sourceUri);
            }
            if (!sameSourceSize(next.sourceSize, sourceSizeRef.current)) {
                setSourceSize(next.sourceSize);
            }
            annotationsRef.current = next.annotations;
            setAnnotations(next.annotations);
            return stack.slice(0, -1);
        });
    };

    const closeEditor = () => {
        if (saving || rotating || cropping) return;
        onClose();
    };

    const rotate = async () => {
        if (rotating || cropping) return;
        if (page) {
            // A drawn page has no bitmap to turn: swap the page dimensions and take the ink with it.
            const snapshot: EditorHistoryState = { sourceUri, sourceSize, annotations: annotationsRef.current };
            setUndoStack((stack) => [...stack.slice(-29), snapshot]);
            setRedoStack([]);
            const rotated = annotationsRef.current.map(rotatePhotoAnnotationClockwise);
            annotationsRef.current = rotated;
            setAnnotations(rotated);
            setSourceSize({ width: sourceSize.height, height: sourceSize.width });
            setSelectedTextId(null);
            return;
        }
        if (!sourceUri || !imageReady) return;
        setRotating(true);
        try {
            const result = await manipulateAsync(sourceUri, [{ rotate: 90 }], {
                compress: 1,
                format: SaveFormat.PNG,
            });
            const snapshot: EditorHistoryState = {
                sourceUri,
                sourceSize,
                annotations: annotationsRef.current,
            };
            setUndoStack((stack) => [...stack.slice(-29), snapshot]);
            setRedoStack([]);

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
            // Trimming a drawn page is pure geometry: keep the ink, shrink the sheet, re-rule it.
            const snapshot: EditorHistoryState = { sourceUri, sourceSize, annotations: annotationsRef.current };
            setUndoStack((stack) => [...stack.slice(-29), snapshot]);
            setRedoStack([]);
            const trimmed = annotationsRef.current.map((ann) => cropPhotoAnnotation(ann, cropBox));
            annotationsRef.current = trimmed;
            setAnnotations(trimmed);
            setSourceSize(cropBlankCanvasSize(sourceSize, cropBox));
            setCropBox({ x: 0, y: 0, width: 1, height: 1 });
            setCropAspect('free');
            setSelectedTextId(null);
            setTool('pen');
            return;
        }

        setCropping(true);
        try {
            const result = await manipulateAsync(sourceUri, [{ crop: pixels }], {
                compress: 1,
                format: SaveFormat.PNG,
            });
            const snapshot: EditorHistoryState = {
                sourceUri,
                sourceSize,
                annotations: annotationsRef.current,
            };
            setUndoStack((stack) => [...stack.slice(-29), snapshot]);
            setRedoStack([]);

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

    /** Native export: capture the live canvas, scaled up to the source's own resolution. */
    const captureCanvasBytes = async (): Promise<Uint8Array> => {
        // captureRef takes its size in points but writes out at the screen's pixel density, so the
        // request has to be divided by that density to land on the resolution we actually want —
        // otherwise a 3x iPhone turns a 1600px target into a 4800px, multi-megabyte attachment.
        const canvasLongEdge = Math.max(1, canvasSize.width, canvasSize.height) * PixelRatio.get();
        const targetLongEdge = Math.min(3000, Math.max(sourceSize.width, sourceSize.height, canvasLongEdge));
        const scale = Math.min(4, Math.max(1, targetLongEdge / canvasLongEdge));
        const uri = await captureRef(canvasRef, {
            format: 'png',
            quality: 1,
            result: 'tmpfile',
            width: Math.round(canvasSize.width * scale),
            height: Math.round(canvasSize.height * scale),
        });
        return readUriBytes(uri);
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
        if (Platform.OS !== 'web' && (selectedTextIdRef.current || eraserCursor || tool === 'crop')) {
            setSelectedTextId(null);
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
            const filename = sanitizeMediaFilename(`${Date.now()}_${page ? 'cizim' : 'duzenlenmis'}.png`);
            let bytes: Uint8Array;
            if (page && Platform.OS === 'web') {
                bytes = await rasterizeBlankCanvasWeb(
                    { ...page, width: sourceSize.width, height: sourceSize.height },
                    annotationsRef.current,
                    sourceSize.width,
                    sourceSize.height,
                );
            } else if (page) {
                bytes = await captureCanvasBytes();
            } else if (annotationsRef.current.length === 0) {
                bytes = await readUriBytes(sourceUri);
            } else if (Platform.OS === 'web') {
                bytes = await rasterizePhotoWeb(
                    sourceUri, annotationsRef.current, sourceSize.width, sourceSize.height,
                );
            } else {
                // Export at the photo's own resolution, not the on-screen preview size, so an
                // annotated picture stays as sharp as the original the user picked.
                bytes = await captureCanvasBytes();
            }
            await saveMediaBytes(filename, bytes, 'image/png');
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
            if (selectedTextIdRef.current) {
                editSelectedText();
            } else {
                setTextDraft('');
                setTextBgStyle('badge');
                setTextAlign('center');
                setTextModal(true);
            }
        } else if (nextTool === 'crop') {
            setSelectedTextId(null);
            setTool('crop');
        } else {
            setSelectedTextId(null);
            setTool(nextTool);
        }
    };

    const confirmText = () => {
        const value = textDraft.trim();
        if (!value) {
            setTextModal(false);
            return;
        }
        if (selectedTextId) {
            const next = annotations.map((ann) => (
                ann.id === selectedTextId && ann.type === 'text'
                    ? { ...ann, text: value, color, fontSize, bgStyle: textBgStyle, textAlign }
                    : ann
            ));
            commitAnnotations(next);
        } else {
            const newId = makeId();
            const newAnnotation: PhotoText = {
                id: newId,
                type: 'text',
                point: { x: 0.5, y: 0.45 },
                text: value,
                color,
                fontSize,
                bgStyle: textBgStyle,
                textAlign,
                width: 1,
                opacity: 1,
            };
            commitAnnotations([...annotations, newAnnotation]);
            setSelectedTextId(newId);
        }
        setTool('text');
        setTextModal(false);
    };

    const changePaper = (paper: BlankCanvasPaper) => {
        if (!page) return;
        setPage({ ...page, paper });
    };

    const changePageColor = (background: string) => {
        if (!page) return;
        // A pen still holding the old page's default ink follows the page, so switching to a dark
        // sheet never leaves the user drawing invisible black strokes.
        const penFollowsPage = color === blankCanvasDefaultInk(page.background);
        setPage({ ...page, background });
        if (penFollowsPage) setColor(blankCanvasDefaultInk(background));
    };

    const allAnnotations = liveAnnotation ? [...annotations, liveAnnotation] : annotations;
    /** An untouched page has nothing to export; a photo is worth keeping on its own. */
    const nothingDrawn = page !== null && annotations.length === 0;
    const activeToolLabel = tool === 'crop'
        ? l('Kırpma alanını ayarlayın ve onaylayın', 'Adjust crop area and confirm')
        : tool === 'text'
            ? selectedTextId
                ? l('Metni sürükleyin veya düzenleyin', 'Drag or edit the text')
                : l('Metin eklemek için dokunun', 'Tap to add text')
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

                <View style={styles.stage}>
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
                        <Svg width={canvasSize.width} height={canvasSize.height} style={StyleSheet.absoluteFill}>
                            {allAnnotations.map((annotation) => renderAnnotation(annotation, canvasSize.width, canvasSize.height))}
                        </Svg>

                        {/* Interactive Eraser Indicator */}
                        {eraserCursor && (
                            <View
                                pointerEvents="none"
                                style={[
                                    styles.eraserIndicator,
                                    {
                                        left: eraserCursor.x - eraserCursor.radius,
                                        top: eraserCursor.y - eraserCursor.radius,
                                        width: eraserCursor.radius * 2,
                                        height: eraserCursor.radius * 2,
                                        borderRadius: eraserCursor.radius,
                                    },
                                ]}
                            />
                        )}

                        {/* Interactive Text Selection Overlay */}
                        {selectedAnnotation && selectedBounds && !isDraggingText && (
                            <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
                                <View
                                    pointerEvents="none"
                                    style={[
                                        styles.textSelectionBox,
                                        {
                                            left: selectedBounds.x - 4,
                                            top: selectedBounds.y - 4,
                                            width: selectedBounds.width + 8,
                                            height: selectedBounds.height + 8,
                                            transformOrigin: [
                                                selectedAnchor.x - (selectedBounds.x - 4),
                                                selectedAnchor.y - (selectedBounds.y - 4),
                                                0,
                                            ],
                                            transform: [{ rotate: `${selectedAnnotation.rotation ?? 0}deg` }],
                                        },
                                    ]}
                                >
                                    <View style={[styles.textHandle, styles.textHandleTL]} />
                                    <View style={[styles.textHandle, styles.textHandleTR]} />
                                    <View style={[styles.textHandle, styles.textHandleBL]} />
                                    <View style={[styles.textHandle, styles.textHandleBR]} />
                                </View>

                                {/* Floating Action Pill */}
                                <View
                                    style={[
                                        styles.textFloatingToolbar,
                                        {
                                            top: selectedBounds.y < 52
                                                ? Math.min(canvasSize.height - 44, selectedBounds.y + selectedBounds.height + 10)
                                                : Math.max(6, selectedBounds.y - 46),
                                            left: Math.max(6, Math.min(canvasSize.width - 236, selectedBounds.x + selectedBounds.width / 2 - 118)),
                                        },
                                    ]}
                                >
                                    <TouchableOpacity
                                        style={styles.textFloatingBtn}
                                        onPress={editSelectedText}
                                        accessibilityRole="button"
                                        accessibilityLabel={l('Metni düzenle', 'Edit text')}
                                    >
                                        <Text style={styles.textFloatingIcon}>✏️</Text>
                                    </TouchableOpacity>

                                    <TouchableOpacity
                                        style={styles.textFloatingBtn}
                                        onPress={cycleSelectedTextStyle}
                                        accessibilityRole="button"
                                        accessibilityLabel={l('Metin stilini değiştir', 'Change text style')}
                                    >
                                        <View style={[
                                            styles.textStyleIconBadge,
                                            (selectedAnnotation.bgStyle || 'classic') === 'badge' && styles.textStyleBadgeSolid,
                                            (selectedAnnotation.bgStyle || 'classic') === 'frosted' && styles.textStyleBadgeFrosted,
                                            (selectedAnnotation.bgStyle || 'classic') === 'outline' && styles.textStyleBadgeOutline,
                                        ]}>
                                            <Text style={styles.textStyleIconText}>A</Text>
                                        </View>
                                    </TouchableOpacity>

                                    <TouchableOpacity
                                        style={styles.textFloatingBtn}
                                        onPress={cycleSelectedTextAlign}
                                        accessibilityRole="button"
                                        accessibilityLabel={l('Hizalamayı değiştir', 'Change alignment')}
                                    >
                                        <Text style={styles.textFloatingIcon}>
                                            {(selectedAnnotation.textAlign || 'center') === 'left' ? '⇤' : (selectedAnnotation.textAlign || 'center') === 'right' ? '⇥' : '≡'}
                                        </Text>
                                    </TouchableOpacity>

                                    <TouchableOpacity
                                        style={styles.textFloatingBtn}
                                        onPress={() => changeSelectedTextSize(-4)}
                                        accessibilityRole="button"
                                        accessibilityLabel={l('Metni küçült', 'Decrease text size')}
                                    >
                                        <Text style={styles.textFloatingSmallA}>A-</Text>
                                    </TouchableOpacity>

                                    <TouchableOpacity
                                        style={styles.textFloatingBtn}
                                        onPress={() => changeSelectedTextSize(4)}
                                        accessibilityRole="button"
                                        accessibilityLabel={l('Metni büyüt', 'Increase text size')}
                                    >
                                        <Text style={styles.textFloatingBigA}>A+</Text>
                                    </TouchableOpacity>

                                    <View style={styles.textFloatingDivider} />

                                    <TouchableOpacity
                                        style={[styles.textFloatingBtn, styles.textFloatingDeleteBtn]}
                                        onPress={deleteSelectedText}
                                        accessibilityRole="button"
                                        accessibilityLabel={l('Metni sil', 'Delete text')}
                                    >
                                        <Text style={styles.textFloatingDeleteIcon}>🗑</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        )}

                        {/* Interactive Drag-to-Delete Trash Area */}
                        {isDraggingText && (
                            <View
                                pointerEvents="none"
                                style={[
                                    styles.textTrashZone,
                                    trashHovered && styles.textTrashZoneHovered,
                                ]}
                            >
                                <Text style={[styles.textTrashIcon, trashHovered && styles.textTrashIconHovered]}>🗑</Text>
                                <Text style={[styles.textTrashLabel, trashHovered && styles.textTrashLabelHovered]}>
                                    {trashHovered ? l('Silmek için bırakın', 'Release to delete') : l('Silmek için buraya sürükleyin', 'Drag here to delete')}
                                </Text>
                            </View>
                        )}

                        {/* Interactive Crop Box Overlay */}
                        {tool === 'crop' && (
                            <View style={StyleSheet.absoluteFill} pointerEvents="none">
                                {/* Dimming masks */}
                                <View style={[styles.cropDim, { top: 0, left: 0, right: 0, height: cropBox.y * canvasSize.height }]} />
                                <View style={[styles.cropDim, { top: (cropBox.y + cropBox.height) * canvasSize.height, left: 0, right: 0, bottom: 0 }]} />
                                <View style={[styles.cropDim, { top: cropBox.y * canvasSize.height, left: 0, width: cropBox.x * canvasSize.width, height: cropBox.height * canvasSize.height }]} />
                                <View style={[styles.cropDim, { top: cropBox.y * canvasSize.height, left: (cropBox.x + cropBox.width) * canvasSize.width, right: 0, height: cropBox.height * canvasSize.height }]} />

                                {/* Active Crop Box Frame */}
                                <View
                                    style={[
                                        styles.cropBox,
                                        {
                                            left: cropBox.x * canvasSize.width,
                                            top: cropBox.y * canvasSize.height,
                                            width: cropBox.width * canvasSize.width,
                                            height: cropBox.height * canvasSize.height,
                                        },
                                    ]}
                                >
                                    {/* 3x3 Grid Guidelines */}
                                    <View style={[styles.cropGridH, { top: '33.33%' }]} />
                                    <View style={[styles.cropGridH, { top: '66.66%' }]} />
                                    <View style={[styles.cropGridV, { left: '33.33%' }]} />
                                    <View style={[styles.cropGridV, { left: '66.66%' }]} />

                                    {/* Corner Markers */}
                                    <View style={[styles.cornerHandle, styles.cornerTL]} />
                                    <View style={[styles.cornerHandle, styles.cornerTR]} />
                                    <View style={[styles.cornerHandle, styles.cornerBL]} />
                                    <View style={[styles.cornerHandle, styles.cornerBR]} />

                                    {/* Edge Markers */}
                                    <View style={[styles.edgeHandleH, { top: -3 }]} />
                                    <View style={[styles.edgeHandleH, { bottom: -3 }]} />
                                    <View style={[styles.edgeHandleV, { left: -3 }]} />
                                    <View style={[styles.edgeHandleV, { right: -3 }]} />
                                </View>
                            </View>
                        )}
                    </View>
                </View>

                <View style={styles.controls}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.toolList}>
                        {toolItems.map((item) => (
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

                {/* Paper and page colour, changeable while drawing */}
                <Modal visible={pageSheet && page !== null} transparent animationType="fade" onRequestClose={() => setPageSheet(false)}>
                    <View style={styles.pageSheetOverlay}>
                        <Pressable
                            style={StyleSheet.absoluteFill}
                            onPress={() => setPageSheet(false)}
                            accessibilityLabel={l('Kağıt seçimini kapat', 'Close paper options')}
                        />
                        <SwipeDismissSheet active={pageSheet} style={styles.pageSheet} onDismiss={() => setPageSheet(false)}>
                            <Text style={styles.pageSheetTitle}>{l('Sayfa', 'Page')}</Text>

                            <Text style={styles.pageSheetLabel}>{l('Kağıt', 'Paper')}</Text>
                            <View style={styles.pageChipRow}>
                                {BLANK_CANVAS_PAPERS.map((option) => {
                                    const isSelected = page?.paper === option;
                                    return (
                                        <TouchableOpacity
                                            key={option}
                                            style={[styles.pageChip, isSelected && styles.pageChipActive]}
                                            onPress={() => changePaper(option)}
                                            accessibilityRole="button"
                                            accessibilityState={{ selected: isSelected }}
                                            accessibilityLabel={paperLabel(option, l)}
                                        >
                                            <PaperSwatch
                                                paper={option}
                                                background={page?.background ?? BLANK_CANVAS_BACKGROUNDS[0].color}
                                                width={44}
                                                height={34}
                                                style={styles.pageChipSwatch}
                                            />
                                            <Text style={[styles.pageChipText, isSelected && styles.pageChipTextActive]}>
                                                {paperLabel(option, l)}
                                            </Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>

                            <Text style={styles.pageSheetLabel}>{l('Zemin', 'Page colour')}</Text>
                            <View style={styles.pageChipRow}>
                                {BLANK_CANVAS_BACKGROUNDS.map((option) => {
                                    const isSelected = page?.background === option.color;
                                    return (
                                        <TouchableOpacity
                                            key={option.id}
                                            style={[styles.pageChip, isSelected && styles.pageChipActive]}
                                            onPress={() => changePageColor(option.color)}
                                            accessibilityRole="button"
                                            accessibilityState={{ selected: isSelected }}
                                            accessibilityLabel={pageColorLabel(option.id, l)}
                                        >
                                            <View style={[styles.pageColorDot, { backgroundColor: option.color }]} />
                                            <Text style={[styles.pageChipText, isSelected && styles.pageChipTextActive]}>
                                                {pageColorLabel(option.id, l)}
                                            </Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>

                            <TouchableOpacity
                                style={styles.pageSheetDone}
                                onPress={() => setPageSheet(false)}
                                accessibilityRole="button"
                                accessibilityLabel={l('Kağıt seçimini bitir', 'Done choosing paper')}
                            >
                                <Text style={styles.pageSheetDoneText}>{t('common.completed')}</Text>
                            </TouchableOpacity>
                        </SwipeDismissSheet>
                    </View>
                </Modal>

                {/* Instagram-Style Fullscreen Text Composer Modal */}
                <Modal visible={textModal} transparent animationType="fade" onRequestClose={() => setTextModal(false)}>
                    <KeyboardAvoidingView
                        style={styles.instagramTextOverlay}
                        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                    >
                        <Pressable
                            style={StyleSheet.absoluteFill}
                            onPress={() => setTextModal(false)}
                            accessibilityLabel={l('Metin düzenleyiciyi kapat', 'Close text composer')}
                        />

                        {/* Top Action Bar */}
                        <SafeAreaView edges={['top']} style={styles.instagramTextHeader}>
                            <TouchableOpacity
                                style={styles.instagramHeaderBtn}
                                onPress={() => setTextModal(false)}
                                accessibilityRole="button"
                            >
                                <Text style={styles.instagramHeaderBtnText}>{t('common.cancel')}</Text>
                            </TouchableOpacity>

                            <View style={styles.instagramHeaderCenter}>
                                {/* Style Toggle Button */}
                                <TouchableOpacity
                                    style={[styles.instagramToolPill, textBgStyle !== 'classic' && styles.instagramToolPillActive]}
                                    onPress={() => {
                                        const stylesList: PhotoTextStyle[] = ['classic', 'badge', 'frosted', 'outline'];
                                        setTextBgStyle(stylesList[(stylesList.indexOf(textBgStyle) + 1) % stylesList.length]);
                                    }}
                                    accessibilityRole="button"
                                    accessibilityLabel={l('Stil', 'Style')}
                                >
                                    <View style={[
                                        styles.instagramStyleBadge,
                                        textBgStyle === 'badge' && styles.textStyleBadgeSolid,
                                        textBgStyle === 'frosted' && styles.textStyleBadgeFrosted,
                                        textBgStyle === 'outline' && styles.textStyleBadgeOutline,
                                    ]}>
                                        <Text style={styles.instagramStyleBadgeText}>A</Text>
                                    </View>
                                </TouchableOpacity>

                                {/* Alignment Toggle Button */}
                                <TouchableOpacity
                                    style={styles.instagramToolPill}
                                    onPress={() => {
                                        const aligns: PhotoTextAlign[] = ['center', 'right', 'left'];
                                        setTextAlign(aligns[(aligns.indexOf(textAlign) + 1) % aligns.length]);
                                    }}
                                    accessibilityRole="button"
                                    accessibilityLabel={l('Hizalama', 'Alignment')}
                                >
                                    <Text style={styles.instagramAlignText}>
                                        {textAlign === 'left' ? '⇤' : textAlign === 'right' ? '⇥' : '≡'}
                                    </Text>
                                </TouchableOpacity>
                            </View>

                            <TouchableOpacity
                                style={[styles.instagramDoneBtn, !textDraft.trim() && styles.instagramDoneBtnDisabled]}
                                onPress={confirmText}
                                disabled={!textDraft.trim()}
                                accessibilityRole="button"
                            >
                                <Text style={styles.instagramDoneBtnText}>{t('common.completed')}</Text>
                            </TouchableOpacity>
                        </SafeAreaView>

                        {/* Center Area with Vertical Size Slider & Multiline Input */}
                        <View style={styles.instagramCenterWrapper}>
                            {/* Left Vertical Font Size Slider (Instagram Story Style) */}
                            <View style={styles.instagramSliderColumn}>
                                <Text style={styles.instagramSliderLabel}>{fontSize}</Text>
                                <View
                                    style={styles.instagramSliderTrack}
                                    onStartShouldSetResponder={() => true}
                                    onMoveShouldSetResponder={() => true}
                                    onResponderGrant={(evt) => {
                                        const y = evt.nativeEvent.locationY;
                                        const ratio = Math.max(0, Math.min(1, 1 - y / 160));
                                        const newSize = Math.round(14 + ratio * 38);
                                        setFontSize(newSize);
                                    }}
                                    onResponderMove={(evt) => {
                                        const y = evt.nativeEvent.locationY;
                                        const ratio = Math.max(0, Math.min(1, 1 - y / 160));
                                        const newSize = Math.round(14 + ratio * 38);
                                        setFontSize(newSize);
                                    }}
                                >
                                    <View
                                        style={[
                                            styles.instagramSliderThumb,
                                            {
                                                bottom: `${Math.max(0, Math.min(100, Math.round(((fontSize - 14) / 38) * 100)))}%`,
                                            },
                                        ]}
                                    />
                                </View>
                                <Text style={styles.instagramSliderMinLabel}>A</Text>
                            </View>

                            {/* Centered Large Multiline Input */}
                            <View style={styles.instagramInputContainer}>
                                <TextInput
                                    style={[
                                        styles.instagramTextInput,
                                        {
                                            fontSize: fontSize,
                                            textAlign: textAlign,
                                            color: textBgStyle === 'badge'
                                                ? (color === '#ffffff' ? '#ffffff' : (['#ffffff', '#f59e0b', '#22c55e', '#06b6d4', '#0ea5e9'].includes(color) ? '#111827' : '#ffffff'))
                                                : (textBgStyle === 'frosted' ? (['#ffffff', '#f59e0b', '#22c55e', '#06b6d4', '#0ea5e9'].includes(color) ? '#ffffff' : '#111827') : color),
                                            backgroundColor: textBgStyle === 'classic'
                                                ? 'transparent'
                                                : textBgStyle === 'badge'
                                                    ? (color === '#ffffff' ? '#111827' : color)
                                                    : textBgStyle === 'frosted'
                                                        ? (['#ffffff', '#f59e0b', '#22c55e', '#06b6d4', '#0ea5e9'].includes(color) ? 'rgba(0,0,0,0.68)' : 'rgba(255,255,255,0.85)')
                                                        : 'transparent',
                                            borderColor: textBgStyle === 'outline' ? color : 'transparent',
                                            borderWidth: textBgStyle === 'outline' ? 2.5 : 0,
                                        },
                                    ]}
                                    value={textDraft}
                                    onChangeText={setTextDraft}
                                    placeholder={l('Yazmaya başlayın…', 'Start typing…')}
                                    placeholderTextColor="rgba(255,255,255,0.4)"
                                    autoFocus
                                    multiline
                                    maxLength={200}
                                />
                            </View>
                        </View>

                        {/* Bottom Color Swatches in Composer */}
                        <View style={styles.instagramColorRow}>
                            <ScrollView
                                horizontal
                                showsHorizontalScrollIndicator={false}
                                contentContainerStyle={styles.instagramColorList}
                            >
                                {DRAW_COLORS.map((itemColor) => (
                                    <TouchableOpacity
                                        key={`modal-${itemColor}`}
                                        style={[styles.instagramColorBtn, color === itemColor && styles.instagramColorBtnActive]}
                                        onPress={() => setColor(itemColor)}
                                        accessibilityRole="button"
                                        accessibilityLabel={l(`Renk ${itemColor}`, `Color ${itemColor}`)}
                                    >
                                        <View style={[styles.instagramColorDot, { backgroundColor: itemColor }]} />
                                    </TouchableOpacity>
                                ))}
                            </ScrollView>
                        </View>
                    </KeyboardAvoidingView>
                </Modal>
            </SafeAreaView>
        </Modal>
    );
}

function createStyles(colors: ColorScheme) {
    return StyleSheet.create({
        container: { flex: 1, backgroundColor: '#111827' },
        header: {
            minHeight: 62,
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: Spacing.md,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: '#374151',
        },
        headerButton: { minWidth: 64, minHeight: 44, justifyContent: 'center' },
        headerButtonText: { color: '#d1d5db', fontSize: FontSize.md, fontWeight: '600' },
        headerCenter: { flex: 1, alignItems: 'center', paddingHorizontal: Spacing.sm },
        title: { color: '#ffffff', fontSize: FontSize.lg, fontWeight: '800' },
        subtitle: { color: '#9ca3af', fontSize: FontSize.sm, marginTop: 2 },
        saveButton: {
            minWidth: 64,
            minHeight: 44,
            paddingHorizontal: Spacing.md,
            borderRadius: BorderRadius.md,
            backgroundColor: colors.accent,
            alignItems: 'center',
            justifyContent: 'center',
        },
        saveButtonText: { color: '#fff', fontWeight: '800', fontSize: FontSize.md },
        saveButtonDisabled: { opacity: 0.5 },
        stage: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 8 },
        canvas: { backgroundColor: '#000', overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
        controls: {
            backgroundColor: '#1f2937',
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: '#374151',
            paddingBottom: Platform.OS === 'ios' ? 8 : 12,
        },
        toolList: { paddingHorizontal: Spacing.sm, paddingVertical: 7, gap: 5 },
        toolButton: {
            width: 54,
            minHeight: 52,
            borderRadius: BorderRadius.md,
            alignItems: 'center',
            justifyContent: 'center',
            gap: 2,
        },
        toolButtonActive: { backgroundColor: '#374151' },
        pageSheetOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.5)', justifyContent: 'flex-end' },
        pageSheet: {
            backgroundColor: '#1f2937',
            borderTopLeftRadius: BorderRadius.lg,
            borderTopRightRadius: BorderRadius.lg,
            paddingHorizontal: Spacing.lg,
            paddingTop: 44,
            paddingBottom: 28,
            gap: Spacing.xs,
        },
        pageSheetTitle: { color: '#ffffff', fontSize: FontSize.lg, fontWeight: '800' },
        pageSheetLabel: { color: '#9ca3af', fontSize: FontSize.sm, fontWeight: '600', marginTop: Spacing.sm },
        pageChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
        pageChip: {
            minWidth: 76,
            alignItems: 'center',
            gap: 6,
            paddingVertical: Spacing.sm,
            paddingHorizontal: Spacing.sm,
            borderRadius: BorderRadius.md,
            borderWidth: 2,
            borderColor: '#374151',
            backgroundColor: '#111827',
        },
        pageChipActive: { borderColor: colors.accent, backgroundColor: '#0b1220' },
        pageChipSwatch: { borderRadius: 4, borderWidth: StyleSheet.hairlineWidth, borderColor: '#4b5563' },
        pageChipText: { color: '#9ca3af', fontSize: FontSize.sm, fontWeight: '600' },
        pageChipTextActive: { color: '#ffffff' },
        pageColorDot: {
            width: 44,
            height: 34,
            borderRadius: 4,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: '#4b5563',
        },
        pageSheetDone: {
            marginTop: Spacing.lg,
            minHeight: 48,
            borderRadius: BorderRadius.md,
            backgroundColor: colors.accent,
            alignItems: 'center',
            justifyContent: 'center',
        },
        pageSheetDoneText: { color: '#ffffff', fontWeight: '800', fontSize: FontSize.md },
        toolIcon: { color: '#f9fafb', fontSize: 20, lineHeight: 23 },
        textToolIcon: { fontWeight: '900' },
        toolLabel: { color: '#9ca3af', fontSize: 10, fontWeight: '600' },
        toolLabelActive: { color: '#ffffff' },
        optionsRow: {
            minHeight: 50,
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: Spacing.sm,
            gap: 4,
        },
        colorList: { alignItems: 'center', gap: 4, paddingRight: 4 },
        colorScroll: { flex: 1 },
        colorButton: {
            width: 36,
            height: 44,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: BorderRadius.sm,
        },
        colorButtonActive: { backgroundColor: '#4b5563' },
        colorDot: { width: 23, height: 23, borderRadius: 12, borderWidth: 1, borderColor: '#6b7280' },
        sizeGroup: { flexDirection: 'row', alignItems: 'center' },
        sizeButton: { width: 34, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: BorderRadius.sm },
        sizeButtonActive: { backgroundColor: '#4b5563' },
        sizeDot: { borderRadius: 999 },
        historyButton: { width: 42, height: 44, alignItems: 'center', justifyContent: 'center' },
        historyIcon: { color: '#f9fafb', fontSize: 23 },
        disabledText: { color: '#4b5563' },

        // Interactive Text Selection Styles
        textSelectionBox: {
            position: 'absolute',
            borderWidth: 1.5,
            borderColor: colors.accent,
            borderStyle: 'dashed',
            borderRadius: 8,
            overflow: 'visible',
        },
        textHandle: {
            position: 'absolute',
            width: 9,
            height: 9,
            borderRadius: 5,
            backgroundColor: colors.accent,
            borderWidth: 1.5,
            borderColor: '#ffffff',
        },
        textHandleTL: { top: -4.5, left: -4.5 },
        textHandleTR: { top: -4.5, right: -4.5 },
        textHandleBL: { bottom: -4.5, left: -4.5 },
        textHandleBR: { bottom: -4.5, right: -4.5 },
        textFloatingToolbar: {
            position: 'absolute',
            height: 38,
            borderRadius: 19,
            backgroundColor: 'rgba(17, 24, 39, 0.94)',
            borderWidth: 1,
            borderColor: 'rgba(255, 255, 255, 0.25)',
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 6,
            gap: 4,
            shadowColor: '#000',
            shadowOpacity: 0.45,
            shadowRadius: 6,
            shadowOffset: { width: 0, height: 2 },
            zIndex: 99,
        },
        textFloatingBtn: {
            width: 34,
            height: 30,
            borderRadius: 15,
            alignItems: 'center',
            justifyContent: 'center',
        },
        textFloatingIcon: {
            color: '#ffffff',
            fontSize: 16,
            fontWeight: '700',
        },
        textFloatingSmallA: {
            color: '#ffffff',
            fontSize: 13,
            fontWeight: '800',
        },
        textFloatingBigA: {
            color: '#ffffff',
            fontSize: 16,
            fontWeight: '900',
        },
        textFloatingDivider: {
            width: 1,
            height: 18,
            backgroundColor: 'rgba(255, 255, 255, 0.2)',
            marginHorizontal: 2,
        },
        textFloatingDeleteBtn: {
            width: 32,
            height: 30,
        },
        textFloatingDeleteIcon: {
            color: '#ef4444',
            fontSize: 16,
        },
        textTrashZone: {
            position: 'absolute',
            bottom: 14,
            alignSelf: 'center',
            height: 44,
            paddingHorizontal: 18,
            borderRadius: 22,
            backgroundColor: 'rgba(31, 41, 55, 0.92)',
            borderWidth: 1.5,
            borderColor: 'rgba(255, 255, 255, 0.3)',
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            shadowColor: '#000',
            shadowOpacity: 0.45,
            shadowRadius: 8,
            shadowOffset: { width: 0, height: 3 },
            zIndex: 999,
        },
        textTrashZoneHovered: {
            backgroundColor: '#ef4444',
            borderColor: '#fca5a5',
            transform: [{ scale: 1.08 }],
        },
        textTrashIcon: {
            fontSize: 20,
        },
        textTrashIconHovered: {
            transform: [{ scale: 1.15 }],
        },
        textTrashLabel: {
            color: '#ffffff',
            fontSize: FontSize.xs,
            fontWeight: '700',
        },
        textTrashLabelHovered: {
            color: '#ffffff',
            fontWeight: '900',
        },
        textStyleIconBadge: {
            width: 22,
            height: 22,
            borderRadius: 5,
            borderWidth: 1,
            borderColor: '#ffffff',
            alignItems: 'center',
            justifyContent: 'center',
        },
        textStyleBadgeSolid: {
            backgroundColor: '#ffffff',
        },
        textStyleBadgeFrosted: {
            backgroundColor: 'rgba(255, 255, 255, 0.5)',
        },
        textStyleBadgeOutline: {
            backgroundColor: 'transparent',
            borderWidth: 2,
            borderColor: '#38bdf8',
        },
        textStyleIconText: {
            color: '#111827',
            fontSize: 13,
            fontWeight: '900',
        },

        // Crop UI styles
        cropDim: {
            position: 'absolute',
            backgroundColor: 'rgba(0, 0, 0, 0.65)',
        },
        cropBox: {
            position: 'absolute',
            borderWidth: 2,
            borderColor: '#ffffff',
            overflow: 'visible',
        },
        cropGridH: {
            position: 'absolute',
            left: 0,
            right: 0,
            height: StyleSheet.hairlineWidth,
            backgroundColor: 'rgba(255, 255, 255, 0.45)',
        },
        cropGridV: {
            position: 'absolute',
            top: 0,
            bottom: 0,
            width: StyleSheet.hairlineWidth,
            backgroundColor: 'rgba(255, 255, 255, 0.45)',
        },
        cornerHandle: {
            position: 'absolute',
            width: 16,
            height: 16,
            borderColor: '#ffffff',
        },
        cornerTL: { top: -2, left: -2, borderTopWidth: 4, borderLeftWidth: 4 },
        cornerTR: { top: -2, right: -2, borderTopWidth: 4, borderRightWidth: 4 },
        cornerBL: { bottom: -2, left: -2, borderBottomWidth: 4, borderLeftWidth: 4 },
        cornerBR: { bottom: -2, right: -2, borderBottomWidth: 4, borderRightWidth: 4 },
        edgeHandleH: {
            position: 'absolute',
            left: '50%',
            marginLeft: -14,
            width: 28,
            height: 6,
            borderRadius: 3,
            backgroundColor: '#ffffff',
        },
        edgeHandleV: {
            position: 'absolute',
            top: '50%',
            marginTop: -14,
            width: 6,
            height: 28,
            borderRadius: 3,
            backgroundColor: '#ffffff',
        },
        cropControlsContainer: {
            paddingHorizontal: Spacing.sm,
            paddingTop: 4,
            gap: Spacing.xs,
        },
        cropAspectList: {
            alignItems: 'center',
            gap: Spacing.xs,
            paddingVertical: 2,
        },
        cropAspectBtn: {
            paddingHorizontal: 12,
            height: 32,
            borderRadius: BorderRadius.full,
            backgroundColor: '#374151',
            alignItems: 'center',
            justifyContent: 'center',
        },
        cropAspectBtnActive: {
            backgroundColor: colors.accent,
        },
        cropAspectLabel: {
            color: '#9ca3af',
            fontSize: FontSize.xs,
            fontWeight: '600',
        },
        cropAspectLabelActive: {
            color: '#ffffff',
            fontWeight: '700',
        },
        cropActionRow: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: Spacing.sm,
            paddingVertical: 4,
        },
        cropCancelBtn: {
            flex: 1,
            height: 40,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: BorderRadius.md,
            backgroundColor: '#374151',
        },
        cropCancelText: {
            color: '#d1d5db',
            fontSize: FontSize.sm,
            fontWeight: '600',
        },
        cropResetBtn: {
            flex: 1,
            height: 40,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: BorderRadius.md,
            backgroundColor: '#374151',
        },
        cropResetText: {
            color: '#d1d5db',
            fontSize: FontSize.sm,
            fontWeight: '600',
        },
        cropApplyBtn: {
            flex: 1.2,
            height: 40,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: BorderRadius.md,
            backgroundColor: colors.accent,
        },
        cropApplyText: {
            color: '#ffffff',
            fontSize: FontSize.sm,
            fontWeight: '700',
        },

        eraserIndicator: {
            position: 'absolute',
            borderWidth: 2,
            borderColor: 'rgba(255, 255, 255, 0.95)',
            backgroundColor: 'rgba(239, 68, 68, 0.28)',
            shadowColor: '#000',
            shadowOpacity: 0.4,
            shadowRadius: 5,
            shadowOffset: { width: 0, height: 1 },
            zIndex: 99,
        },
        eraserModeGroup: {
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            alignSelf: 'center',
            marginHorizontal: Spacing.sm,
            padding: 3,
            borderRadius: BorderRadius.full,
            backgroundColor: '#1f2937',
        },
        eraserModeButton: {
            flex: 1,
            minHeight: 34,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 10,
            borderRadius: BorderRadius.full,
        },
        eraserModeButtonActive: { backgroundColor: '#374151' },
        eraserModeText: {
            color: '#9ca3af',
            fontSize: FontSize.xs,
            fontWeight: '600',
        },
        eraserModeTextActive: { color: '#f9fafb', fontWeight: '800' },

        // Instagram Fullscreen Text Composer Styles
        instagramTextOverlay: {
            flex: 1,
            backgroundColor: 'rgba(0, 0, 0, 0.88)',
            justifyContent: 'space-between',
        },
        instagramTextHeader: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: Spacing.md,
            paddingVertical: Spacing.sm,
        },
        instagramHeaderBtn: {
            minWidth: 60,
            height: 44,
            justifyContent: 'center',
        },
        instagramHeaderBtnText: {
            color: '#ffffff',
            fontSize: FontSize.md,
            fontWeight: '600',
        },
        instagramHeaderCenter: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: Spacing.sm,
        },
        instagramToolPill: {
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: 'rgba(255, 255, 255, 0.16)',
            alignItems: 'center',
            justifyContent: 'center',
        },
        instagramToolPillActive: {
            backgroundColor: 'rgba(255, 255, 255, 0.32)',
        },
        instagramStyleBadge: {
            width: 22,
            height: 22,
            borderRadius: 5,
            borderWidth: 1,
            borderColor: '#ffffff',
            alignItems: 'center',
            justifyContent: 'center',
        },
        instagramStyleBadgeText: {
            color: '#ffffff',
            fontSize: 13,
            fontWeight: '900',
        },
        instagramAlignText: {
            color: '#ffffff',
            fontSize: 20,
            fontWeight: '700',
        },
        instagramDoneBtn: {
            paddingHorizontal: 16,
            height: 38,
            borderRadius: 19,
            backgroundColor: colors.accent,
            alignItems: 'center',
            justifyContent: 'center',
        },
        instagramDoneBtnDisabled: {
            opacity: 0.5,
        },
        instagramDoneBtnText: {
            color: '#ffffff',
            fontSize: FontSize.sm,
            fontWeight: '800',
        },
        instagramCenterWrapper: {
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: Spacing.md,
        },
        instagramSliderColumn: {
            width: 40,
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
        },
        instagramSliderLabel: {
            color: 'rgba(255, 255, 255, 0.85)',
            fontSize: 11,
            fontWeight: '700',
        },
        instagramSliderTrack: {
            width: 6,
            height: 160,
            borderRadius: 3,
            backgroundColor: 'rgba(255, 255, 255, 0.25)',
            alignItems: 'center',
            justifyContent: 'flex-end',
            position: 'relative',
        },
        instagramSliderThumb: {
            position: 'absolute',
            left: -9,
            width: 24,
            height: 24,
            borderRadius: 12,
            backgroundColor: '#ffffff',
            borderWidth: 2,
            borderColor: colors.accent,
            shadowColor: '#000',
            shadowOpacity: 0.5,
            shadowRadius: 4,
            shadowOffset: { width: 0, height: 2 },
        },
        instagramSliderMinLabel: {
            color: 'rgba(255, 255, 255, 0.5)',
            fontSize: 14,
            fontWeight: '800',
        },
        instagramInputContainer: {
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
            paddingHorizontal: Spacing.md,
        },
        instagramTextInput: {
            maxWidth: '100%',
            fontWeight: '800',
            borderRadius: 14,
            paddingHorizontal: 18,
            paddingVertical: 12,
        },
        instagramColorRow: {
            paddingVertical: Spacing.md,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: 'rgba(255, 255, 255, 0.12)',
        },
        instagramColorList: {
            paddingHorizontal: Spacing.md,
            gap: Spacing.sm,
            alignItems: 'center',
        },
        instagramColorBtn: {
            width: 40,
            height: 44,
            alignItems: 'center',
            justifyContent: 'center',
        },
        instagramColorBtnActive: {
            transform: [{ scale: 1.18 }],
        },
        instagramColorDot: {
            width: 28,
            height: 28,
            borderRadius: 14,
            borderWidth: 2,
            borderColor: '#ffffff',
        },
    });
}
