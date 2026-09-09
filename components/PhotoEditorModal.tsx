import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
    type LayoutChangeEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, {
    Ellipse,
    G,
    Line,
    Path,
    Polygon,
    Rect,
    Text as SvgText,
} from 'react-native-svg';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { captureRef } from 'react-native-view-shot';
import { BorderRadius, FontSize, Spacing, useThemeColors, type ColorScheme } from '../constants/theme';
import { alert, confirm } from '../lib/confirm';
import { promptPermissionSettings } from '../lib/permissions';
import { mediaFilenameForPickedAsset, sanitizeMediaFilename } from '../lib/mediaFilename';
import { guessMimeFromFilename, saveMediaBytes, saveMediaFromUri } from '../lib/mediaStore';
import {
    applyAspectRatioToCropRect,
    applyPhotoEraserSweep,
    calculatePhotoTextBounds,
    calculateSourceCropPixels,
    clampCropRect,
    clampPhotoPoint,
    clampPhotoTextSize,
    cropPhotoAnnotation,
    findPhotoSelectionHandle,
    isPhotoShapeDragCommittable,
    isPointInPhotoImage,
    isPointInPhotoText,
    isPointInPhotoTrashZone,
    normalizePhotoRotation,
    normalizedRect,
    PHOTO_ROTATE_HANDLE_OFFSET,
    photoArrowHead,
    photoHandleTouchRadius,
    photoRotateHandleSide,
    photoImageAnchorPixels,
    photoImageBounds,
    photoImagePlacement,
    photoPointerAngle,
    photoSelectionHandlePoints,
    photoTextAnchorPixels,
    photoTextColors,
    photoTrashPillRect,
    photoExportSurface,
    scalePhotoAnnotation,
    photoTrashZoneRect,
    resolvePhotoTextAlign,
    resizePhotoImage,
    resizePhotoImageByHandle,
    resizePhotoTextByHandle,
    resolvePhotoDragSnap,
    resolvePhotoHandleRotation,
    resolvePhotoTextDragRelease,
    rotatePhotoAnnotationClockwise,
    type PhotoAnnotation,
    type PhotoCornerHandle,
    type PhotoCropRect,
    type PhotoEraserMode,
    type PhotoImage,
    type PhotoPoint,
    type PhotoSelectionGeometry,
    type PhotoSelectionHandle,
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
    cropBlankCanvasRuling,
    cropBlankCanvasSize,
    defaultBlankCanvasRuling,
    rotateBlankCanvasRulingClockwise,
    scaleBlankCanvasRuling,
    type BlankCanvasPage,
    type BlankCanvasPaper,
    type BlankCanvasRuling,
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

type EditorTool = 'pen' | 'highlighter' | 'arrow' | 'rect' | 'ellipse' | 'cover' | 'text' | 'image' | 'eraser' | 'crop';

const TOOL_ITEMS: { id: EditorTool; icon: string }[] = [
    { id: 'pen', icon: '✏️' },
    { id: 'highlighter', icon: '🖍️' },
    { id: 'arrow', icon: '↗️' },
    { id: 'rect', icon: '▭' },
    { id: 'ellipse', icon: '◯' },
    { id: 'cover', icon: '■' },
    { id: 'text', icon: 'T' },
    { id: 'image', icon: '🖼️' },
    { id: 'eraser', icon: '⌫' },
    { id: 'crop', icon: '✂️' },
];

const DRAW_COLORS = ['#ffffff', '#111827', '#ef4444', '#f97316', '#f59e0b', '#22c55e', '#06b6d4', '#0ea5e9', '#8b5cf6', '#ec4899'];
const WIDTHS = [3, 6, 10];
const FONT_SIZES = [18, 24, 32, 44];
/** Eraser tip radii in canvas points; independent from the pen width. */
const ERASER_RADII = [12, 24, 42];
/** Two fingers must travel this far apart before a pinch counts as a resize. */
const PINCH_ACTIVATION_PX = 12;
/** How soon after a tap a second one on the same label counts as opening it for editing. */
const DOUBLE_TAP_MS = 320;
/** Longest edge an exported PNG may reach. A card image past this is weight, not detail. */
const EXPORT_MAX_DIMENSION = 2000;
/** What one press of the picture pill's − and + does to the box it is sized in. */
const PICTURE_STEP_DOWN = 0.85;
const PICTURE_STEP_UP = 1.18;

/** The off-screen surface an export is rendered on: its size, and its ratio to the live canvas. */
type ExportSurface = { width: number; height: number; scale: number };
const ERASER_MODES: { id: PhotoEraserMode }[] = [{ id: 'partial' }, { id: 'object' }];

/** A drawn page's paper, in the page's own export pixels. */
type EditorPage = { background: string; paper: BlankCanvasPaper; ruling: BlankCanvasRuling };

interface EditorHistoryState {
    sourceUri: string;
    sourceSize: { width: number; height: number };
    annotations: PhotoAnnotation[];
    /**
     * The sheet as it was, so undoing a crop or a turn puts the ruling back under the ink it was
     * drawn against instead of leaving the paper one edit ahead of the strokes.
     */
    page: EditorPage | null;
}

function makeId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function sameSourceSize(a: { width: number; height: number }, b: { width: number; height: number }): boolean {
    return a.width === b.width && a.height === b.height;
}

/**
 * The frame a label or a picture is manipulated by: the point it turns about, its box before
 * that turn, and the turn itself.
 *
 * The two kinds answer those questions from different fields — a label from its font size and
 * its text, a picture from the box it was placed in — and everything downstream (the handles,
 * the resize, the snap, the frame on screen) works from the answers rather than from the
 * annotation, so one set of controls serves both.
 */
function selectionGeometryFor(
    annotation: PhotoText | PhotoImage,
    canvas: { width: number; height: number },
): PhotoSelectionGeometry {
    if (annotation.type === 'text') {
        return {
            anchor: photoTextAnchorPixels(annotation, canvas.width, canvas.height),
            bounds: calculatePhotoTextBounds(annotation, canvas.width, canvas.height),
            rotation: annotation.rotation ?? 0,
        };
    }
    return {
        anchor: photoImageAnchorPixels(annotation, canvas.width, canvas.height),
        bounds: photoImageBounds(annotation, canvas.width, canvas.height),
        rotation: annotation.rotation ?? 0,
    };
}

/**
 * How far the middle of the frame sits from the point the annotation is placed by.
 *
 * A picture is placed by its centre and the answer is zero; a left-aligned label is placed by
 * its left edge and hangs off to one side. Turning is affine, so the middle of the two turned
 * corners is the turned middle — no second rotation is needed here.
 */
function selectionCentreOffset(geometry: PhotoSelectionGeometry): { x: number; y: number } {
    const handles = photoSelectionHandlePoints(geometry);
    return {
        x: (handles.tl.x + handles.br.x) / 2 - geometry.anchor.x,
        y: (handles.tl.y + handles.br.y) / 2 - geometry.anchor.y,
    };
}

/** The annotation with this id, when it is one of the two kinds a frame is drawn around. */
function objectById(annotations: PhotoAnnotation[], id: string): PhotoText | PhotoImage | undefined {
    const found = annotations.find((ann) => ann.id === id);
    return found && (found.type === 'text' || found.type === 'image') ? found : undefined;
}

/**
 * A short tick under the finger, on the devices that have one.
 *
 * It marks the moments a drag cannot show on its own — a guide caught, an angle settled, the bin
 * armed — and it is a courtesy rather than a dependency: a device without a taptic engine, or a
 * build without the module, simply carries on.
 */
function tick() {
    if (Platform.OS === 'web') return;
    try {
        void Haptics.selectionAsync().catch(() => undefined);
    } catch {
        // No haptics available on this device.
    }
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

/**
 * One annotation on a surface `width` x `height`. `scale` says how much larger that surface is
 * than the canvas the annotation was drawn on: positions are normalised and follow on their own,
 * but widths, font sizes and the fixed sizes below are in canvas units and have to be taken up
 * with it, or an export renders the same drawing in hairlines.
 */
function renderAnnotation(
    source: PhotoAnnotation | null | undefined,
    width: number,
    height: number,
    scale = 1,
) {
    if (!source) return null;
    const annotation = scalePhotoAnnotation(source, scale);
    if (annotation.type === 'stroke') {
        const points = Array.isArray(annotation.points) ? annotation.points : [];
        if (!points.length) return null;
        return (
            <Path
                key={annotation.id}
                d={smoothPath(points, width, height)}
                stroke={annotation.color || '#000000'}
                strokeWidth={annotation.width || 2 * scale}
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
                        rx={Math.max(6 * scale, (annotation.fontSize || 20 * scale) * 0.3)}
                        ry={Math.max(6 * scale, (annotation.fontSize || 20 * scale) * 0.3)}
                        fill={bgStyle === 'outline' ? 'none' : badgeBgColor}
                        fillOpacity={bgStyle === 'frosted' ? 0.75 : 1}
                        stroke={bgStyle === 'outline' ? textColor : 'none'}
                        strokeWidth={bgStyle === 'outline' ? 2.5 * scale : 0}
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
                                    strokeWidth={Math.max(3 * scale, (annotation.fontSize || 20 * scale) * 0.18)}
                                    strokeLinejoin="round"
                                    strokeLinecap="round"
                                    fontSize={annotation.fontSize || 20 * scale}
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
                                fontSize={annotation.fontSize || 20 * scale}
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

    // Pictures are laid out in their own layer beneath this one (`renderPlacedPictures`), so
    // every stroke, label and shape is drawn over them however late a picture is added.
    if (annotation.type === 'image') return null;

    if (!annotation.start || !annotation.end) return null;
    const start = { x: (annotation.start.x ?? 0) * width, y: (annotation.start.y ?? 0) * height };
    const end = { x: (annotation.end.x ?? 0) * width, y: (annotation.end.y ?? 0) * height };
    if (annotation.type === 'arrow') {
        const head = photoArrowHead(annotation.start, annotation.end, width, height, 12 * scale + (annotation.width || 3 * scale) * 1.5);
        return (
            <React.Fragment key={annotation.id}>
                <Line
                    x1={start.x} y1={start.y} x2={end.x} y2={end.y}
                    stroke={annotation.color} strokeWidth={annotation.width || 3 * scale}
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
                strokeWidth={annotation.width || 3 * scale}
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
            strokeWidth={annotation.width || 3 * scale}
            strokeOpacity={annotation.opacity ?? 1}
            fill={annotation.type === 'cover' ? annotation.color : 'none'}
            fillOpacity={annotation.type === 'cover' ? 0.96 : 0}
        />
    );
}

/** The web export's counterpart to `renderAnnotation`, scaled the same way and by the same rule. */
function drawAnnotationOnCanvas(
    ctx: CanvasRenderingContext2D,
    source: PhotoAnnotation | null | undefined,
    width: number,
    height: number,
    scale = 1,
) {
    if (!source) return;
    const annotation = scalePhotoAnnotation(source, scale);
    ctx.save();
    ctx.globalAlpha = annotation.opacity ?? 1;
    ctx.strokeStyle = annotation.color || '#000000';
    ctx.fillStyle = annotation.color || '#000000';
    ctx.lineWidth = annotation.width || 3 * scale;
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
        const fontSize = annotation.fontSize || 20 * scale;
        const lineHeight = fontSize * 1.25;
        const textAlign = resolvePhotoTextAlign(annotation);
        const { background: badgeBgColor, text: finalTextColor } = photoTextColors(annotation);

        if (bgStyle !== 'classic') {
            const radius = Math.max(6 * scale, fontSize * 0.3);
            ctx.beginPath();
            if (typeof ctx.roundRect === 'function') {
                ctx.roundRect(bounds.x, bounds.y, bounds.width, bounds.height, radius);
            } else {
                ctx.rect(bounds.x, bounds.y, bounds.width, bounds.height);
            }
            if (bgStyle === 'outline') {
                ctx.strokeStyle = textColor;
                ctx.lineWidth = 2.5 * scale;
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
                ctx.lineWidth = Math.max(3 * scale, fontSize * 0.18);
                ctx.lineJoin = 'round';
                ctx.strokeText(line, textX, lineY);
            }
            ctx.fillStyle = finalTextColor;
            ctx.fillText(line, textX, lineY);
        });

        return ctx.restore();
    }

    // Painted by `drawPlacedPicturesOnCanvas` before this pass, for the reason above.
    if (annotation.type === 'image') return ctx.restore();

    if (!annotation.start || !annotation.end) return ctx.restore();
    const start = { x: (annotation.start.x ?? 0) * width, y: (annotation.start.y ?? 0) * height };
    const end = { x: (annotation.end.x ?? 0) * width, y: (annotation.end.y ?? 0) * height };
    if (annotation.type === 'arrow') {
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();
        const head = photoArrowHead(annotation.start, annotation.end, width, height, 12 * scale + ctx.lineWidth * 1.5);
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

/**
 * The pictures a page carries, laid out as real views under the ink.
 *
 * They are views rather than SVG nodes because both exporters have to be able to wait for them:
 * the native export photographs this same tree off screen, and a picture that had not decoded
 * yet would be photographed as a hole in the drawing. `onReady` is how that wait is counted.
 */
function renderPlacedPictures(
    annotations: PhotoAnnotation[],
    width: number,
    height: number,
    scale = 1,
    onReady?: () => void,
) {
    return annotations.map((source, index) => {
        if (source.type !== 'image') return null;
        const picture = scalePhotoAnnotation(source, scale);
        const bounds = photoImageBounds(picture, width, height);
        const rotation = normalizePhotoRotation(picture.rotation ?? 0);
        return (
            <NativeImage
                // Two copies of one picture are two placements, so the index keeps them apart
                // even if a duplicate ever shares an id.
                key={`${picture.id}-${index}`}
                source={{ uri: picture.uri }}
                fadeDuration={0}
                resizeMode="stretch"
                onLoad={onReady}
                onError={onReady}
                style={{
                    position: 'absolute',
                    left: bounds.x,
                    top: bounds.y,
                    width: bounds.width,
                    height: bounds.height,
                    // A view transform turns around the view's own centre, which is where the
                    // picture's anchor is, so no origin has to be spelled out here.
                    transform: rotation ? [{ rotate: `${rotation}deg` }] : undefined,
                }}
            />
        );
    });
}

/** Load one picture for a web export; the DOM decodes before the canvas can draw it. */
function loadWebImage(uri: string): Promise<HTMLImageElement> {
    return new Promise<HTMLImageElement>((resolve, reject) => {
        const element = new window.Image();
        element.onload = () => resolve(element);
        element.onerror = () => reject(new Error('Image could not be loaded'));
        element.src = uri;
    });
}

/**
 * The web export's counterpart to `renderPlacedPictures`: every placed picture, in order, under
 * the pass that draws the ink. A picture that cannot be read is skipped rather than allowed to
 * fail the whole save — the rest of the drawing is still worth keeping.
 */
async function drawPlacedPicturesOnCanvas(
    ctx: CanvasRenderingContext2D,
    annotations: PhotoAnnotation[],
    width: number,
    height: number,
    scale = 1,
): Promise<void> {
    for (const source of annotations) {
        if (source.type !== 'image') continue;
        const picture = scalePhotoAnnotation(source, scale);
        let element: HTMLImageElement;
        try {
            element = await loadWebImage(picture.uri);
        } catch (error) {
            console.warn('[PhotoEditor] a placed picture could not be exported:', error);
            continue;
        }
        const bounds = photoImageBounds(picture, width, height);
        const rotation = normalizePhotoRotation(picture.rotation ?? 0);
        ctx.save();
        if (rotation) {
            const anchor = photoImageAnchorPixels(picture, width, height);
            ctx.translate(anchor.x, anchor.y);
            ctx.rotate((rotation * Math.PI) / 180);
            ctx.translate(-anchor.x, -anchor.y);
        }
        ctx.drawImage(element, bounds.x, bounds.y, bounds.width, bounds.height);
        ctx.restore();
    }
}

async function rasterizePhotoWeb(
    uri: string,
    annotations: PhotoAnnotation[],
    surface: { width: number; height: number; scale: number },
): Promise<Uint8Array> {
    const width = Math.max(1, Math.round(surface.width));
    const height = Math.max(1, Math.round(surface.height));
    const image = await loadWebImage(uri);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas context unavailable');
    ctx.drawImage(image, 0, 0, width, height);
    await drawPlacedPicturesOnCanvas(ctx, annotations, width, height, surface.scale);
    annotations.forEach((annotation) => drawAnnotationOnCanvas(ctx, annotation, width, height, surface.scale));
    const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((value) => value ? resolve(value) : reject(new Error('PNG encode failed')), 'image/png');
    });
    return new Uint8Array(await blob.arrayBuffer());
}

/** Web export for a drawn page: paint the paper, then replay the annotations over it. */
async function rasterizeBlankCanvasWeb(
    page: BlankCanvasPage,
    annotations: PhotoAnnotation[],
    surface: { width: number; height: number; scale: number },
): Promise<Uint8Array> {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(surface.width));
    canvas.height = Math.max(1, Math.round(surface.height));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas context unavailable');

    ctx.fillStyle = page.background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const pageRuling = page.ruling
        ? scaleBlankCanvasRuling(page.ruling, canvas.width / Math.max(1, page.width))
        : null;
    const ruling = blankCanvasPaperGeometry(page.paper, canvas.width, canvas.height, pageRuling);
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

    await drawPlacedPicturesOnCanvas(ctx, annotations, canvas.width, canvas.height, surface.scale);
    annotations.forEach((annotation) => (
        drawAnnotationOnCanvas(ctx, annotation, canvas.width, canvas.height, surface.scale)
    ));
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
    const styles = useMemo(() => createStyles(colors), [colors]);
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

    const gestureRef = useRef<{ start: PhotoPoint; points: PhotoPoint[] } | null>(null);
    const erasedInCurrentGestureRef = useRef(false);
    const gestureStartAnnotationsRef = useRef<PhotoAnnotation[] | null>(null);
    const cropDragRef = useRef<{
        mode: 'move' | 'tl' | 'tr' | 'bl' | 'br' | 't' | 'b' | 'l' | 'r' | 'new';
        initialBox: PhotoCropRect;
        startPoint: PhotoPoint;
    } | null>(null);
    const dragRef = useRef<{
        id: string;
        startPoint: PhotoPoint;
        initialPoint: PhotoPoint;
        hasMoved: boolean;
        /**
         * Where the finger was last seen, so the release can re-run the bin's hit test on state
         * the responder owns instead of on a rendered value it cannot see.
         */
        lastPoint: PhotoPoint | null;
        /** Where the middle of the frame sits relative to the point being dragged. */
        centreOffset: { x: number; y: number };
    } | null>(null);
    /**
     * A corner of the frame being pulled. The annotation is kept as it was when the corner was
     * taken hold of, so every sample of the drag is measured from that one box rather than from
     * the box the previous sample produced — the same reason a pinch keeps its starting size.
     */
    const handleDragRef = useRef<{
        handle: PhotoCornerHandle;
        annotation: PhotoText | PhotoImage;
        beforeAnnotations: PhotoAnnotation[];
        applied: boolean;
    } | null>(null);
    /** The knob being turned, and how far round the finger was from the object when it grabbed. */
    const rotateDragRef = useRef<{
        id: string;
        grabOffset: number;
        beforeAnnotations: PhotoAnnotation[];
        applied: boolean;
        snapped: boolean;
    } | null>(null);
    /** The last tap on a label, so a second one on the same label opens it for editing. */
    const lastTapRef = useRef<{ id: string; at: number } | null>(null);
    /** Where a label being written is going to land: the tap that opened the composer. */
    const textDropPointRef = useRef<PhotoPoint | null>(null);
    const pinchRef = useRef<{
        id: string;
        startDistance: number;
        startAngle: number;
        /** Labels grow by their font size, pictures by their box; only one of these is used. */
        initialFontSize: number;
        initialBox: { width: number; height: number } | null;
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

            const { width: grantCanvasW, height: grantCanvasH } = canvasSizeRef.current;
            const grantPointer = { x: point.x * grantCanvasW, y: point.y * grantCanvasH };

            /** Start moving an object, with the frame the snap and the bin will be measured on. */
            const beginDrag = (target: PhotoText | PhotoImage) => {
                dragRef.current = {
                    id: target.id,
                    startPoint: point,
                    initialPoint: { ...target.point },
                    hasMoved: false,
                    lastPoint: null,
                    centreOffset: selectionCentreOffset(selectionGeometryFor(target, canvasSizeRef.current)),
                };
            };

            const selectedAnn = selectedIdRef.current
                ? annotationsRef.current.find((ann) => ann.id === selectedIdRef.current)
                : undefined;
            const selectedObject = selectedAnn && (selectedAnn.type === 'text' || selectedAnn.type === 'image')
                ? selectedAnn
                : null;

            // 1. The frame's own handles come before anything underneath them. A corner resizes
            // what the frame is around and the knob turns it; both sit out on the frame, where
            // nothing else is listening, so they are safe to claim whatever the tool in hand is.
            if (selectedObject) {
                const geometry = selectionGeometryFor(selectedObject, canvasSizeRef.current);
                const handle = findPhotoSelectionHandle(
                    grantPointer,
                    photoSelectionHandlePoints(geometry, photoRotateHandleSide(geometry, canvasSizeRef.current)),
                    photoHandleTouchRadius(geometry.bounds),
                );
                if (handle === 'rotate') {
                    rotateDragRef.current = {
                        id: selectedObject.id,
                        grabOffset: normalizePhotoRotation(
                            photoPointerAngle(grantPointer, geometry.anchor) - (selectedObject.rotation ?? 0),
                        ),
                        beforeAnnotations: annotationsRef.current,
                        applied: false,
                        snapped: false,
                    };
                    setActiveHandle('rotate');
                    setRotationPreview(Math.round(normalizePhotoRotation(selectedObject.rotation ?? 0)));
                    return;
                }
                if (handle) {
                    handleDragRef.current = {
                        handle,
                        annotation: selectedObject,
                        beforeAnnotations: annotationsRef.current,
                        applied: false,
                    };
                    setActiveHandle(handle);
                    return;
                }
            }

            /**
             * The object under the finger, taken in the order the page draws them: labels sit
             * over the ink and the ink over the pictures, so where a label overlaps a picture the
             * label is what the finger has reached for.
             */
            const objectUnderFinger = ((): PhotoText | PhotoImage | null => {
                const current = annotationsRef.current;
                for (let i = current.length - 1; i >= 0; i -= 1) {
                    const ann = current[i];
                    if (ann.type === 'text' && isPointInPhotoText(ann, point, grantCanvasW, grantCanvasH, 28)) return ann;
                }
                for (let i = current.length - 1; i >= 0; i -= 1) {
                    const ann = current[i];
                    if (ann.type === 'image' && isPointInPhotoImage(ann, point, grantCanvasW, grantCanvasH, 12)) return ann;
                }
                return null;
            })();

            // 2. A tap on what is already selected starts moving it, whichever tool happens to be
            // in hand. A second tap on a label opens it for editing, the way a text box does
            // everywhere else — the pencil on the pill is for the finger that would rather aim.
            if (selectedObject && objectUnderFinger?.id === selectedObject.id) {
                if (selectedObject.type === 'text') {
                    const now = Date.now();
                    const previous = lastTapRef.current;
                    lastTapRef.current = { id: selectedObject.id, at: now };
                    if (previous && previous.id === selectedObject.id && now - previous.at <= DOUBLE_TAP_MS) {
                        lastTapRef.current = null;
                        editSelectedTextRef.current();
                        return;
                    }
                }
                beginDrag(selectedObject);
                return;
            }

            // 3. The label and picture tools take hold of whatever object they land on, either
            // kind: a page is a page, and the user should not have to remember which tool made
            // the thing they are reaching for. Drawing tools deliberately grab neither, so a pen
            // stroke can cross a label or run over a picture instead of picking it up.
            if ((currentTool === 'text' || currentTool === 'image') && objectUnderFinger) {
                selectAnnotation(objectUnderFinger.id);
                if (objectUnderFinger.type === 'text') {
                    // The pickers follow the label that was picked up, so the next change to a
                    // colour or a size lands on the thing the user is looking at.
                    setColor(objectUnderFinger.color);
                    setFontSize(objectUnderFinger.fontSize);
                    setTextBgStyle(objectUnderFinger.bgStyle || 'badge');
                    setTextAlign(objectUnderFinger.textAlign || 'center');
                    lastTapRef.current = { id: objectUnderFinger.id, at: Date.now() };
                }
                beginDrag(objectUnderFinger);
                return;
            }

            // 4. The same tools on empty canvas: put the selection down if there is one, and
            // otherwise start a new label or a new picture.
            if (currentTool === 'text') {
                if (selectedIdRef.current) {
                    setSelectedId(null);
                    return;
                }
                textDropPointRef.current = point;
                setTextDraft('');
                setTextBgStyle('badge');
                setTextAlign('center');
                setTextModal(true);
                return;
            }

            if (currentTool === 'image') {
                if (selectedIdRef.current) {
                    setSelectedId(null);
                    return;
                }
                addPictureRef.current(point);
                return;
            }

            if (selectedIdRef.current) {
                setSelectedId(null);
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

            // Two fingers on the selection scale and twist it, the way story editors do: a
            // label by its font size, a picture by its box. A corner or the knob already has the
            // gesture, though, so a second finger landing mid-drag must not take it over.
            if (touches.length >= 2 && selectedIdRef.current && !handleDragRef.current && !rotateDragRef.current) {
                const [first, second] = touches;
                const selected = annotationsRef.current.find(
                    (ann) => ann.id === selectedIdRef.current && (ann.type === 'text' || ann.type === 'image'),
                ) as PhotoText | PhotoImage | undefined;
                if (!selected) return;

                const distance = Math.hypot(second.pageX - first.pageX, second.pageY - first.pageY);
                const angle = (Math.atan2(second.pageY - first.pageY, second.pageX - first.pageX) * 180) / Math.PI;

                if (!pinchRef.current || pinchRef.current.id !== selected.id) {
                    pinchRef.current = {
                        id: selected.id,
                        startDistance: Math.max(1, distance),
                        startAngle: angle,
                        initialFontSize: selected.type === 'text' ? selected.fontSize : 0,
                        initialBox: selected.type === 'image'
                            ? { width: selected.width, height: selected.height }
                            : null,
                        initialRotation: selected.rotation ?? 0,
                        beforeAnnotations: annotationsRef.current,
                        applied: false,
                    };
                    // A second finger ends any drag in progress so the label does not jump.
                    dragRef.current = null;
                    setIsDraggingSelection(false);
                    updateTrashHovered(false);
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

                const rotation = normalizePhotoRotation(pinch.initialRotation + turned);
                const factor = distance / pinch.startDistance;
                setRotationPreview(Math.round(rotation));

                if (pinch.initialBox) {
                    // Sized from the box the pinch started on rather than from the current one,
                    // so the picture follows the fingers instead of compounding every sample.
                    const initialBox = pinch.initialBox;
                    const next = annotationsRef.current.map((ann) => {
                        if (ann.id !== pinch.id || ann.type !== 'image') return ann;
                        const resized = resizePhotoImage(
                            { ...ann, width: initialBox.width, height: initialBox.height },
                            factor,
                            canvasSizeRef.current,
                        );
                        return { ...resized, rotation };
                    });
                    annotationsRef.current = next;
                    setAnnotations(next);
                    return;
                }

                const scaled = Math.round(clampPhotoTextSize(pinch.initialFontSize * factor));
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
            const { width: moveCanvasW, height: moveCanvasH } = canvasSizeRef.current;
            const movePointer = { x: point.x * moveCanvasW, y: point.y * moveCanvasH };

            // A corner being pulled. Every sample is measured from the box the corner was taken
            // hold of, never from the box the last sample produced, so the picture follows the
            // finger instead of drifting away from it as the samples compound.
            const resize = handleDragRef.current;
            if (resize) {
                const resized = resize.annotation.type === 'image'
                    ? resizePhotoImageByHandle({
                        annotation: resize.annotation,
                        handle: resize.handle,
                        pointer: movePointer,
                        canvas: canvasSizeRef.current,
                    })
                    : resizePhotoTextByHandle({
                        annotation: resize.annotation,
                        handle: resize.handle,
                        pointer: movePointer,
                        canvas: canvasSizeRef.current,
                    });
                // A corner dragged back out to where it started asks for the size it was grabbed
                // at, and that is a real answer: the original has to go back on the page rather
                // than leaving the last sample's size standing.
                if (objectById(annotationsRef.current, resized.id) === resized) return;
                if (resized !== resize.annotation) resize.applied = true;
                const next = annotationsRef.current.map((ann) => (ann.id === resized.id ? resized : ann));
                annotationsRef.current = next;
                setAnnotations(next);
                // A label pulled bigger leaves the size picker holding its new size, so the next
                // label is written at the size the last one ended up.
                if (resized.type === 'text') setFontSize(resized.fontSize);
                return;
            }

            // The knob being turned.
            const turn = rotateDragRef.current;
            if (turn) {
                const target = annotationsRef.current.find((ann) => ann.id === turn.id);
                if (!target || (target.type !== 'text' && target.type !== 'image')) return;
                const geometry = selectionGeometryFor(target, canvasSizeRef.current);
                const turned = resolvePhotoHandleRotation({
                    pointer: movePointer,
                    anchor: geometry.anchor,
                    grabOffset: turn.grabOffset,
                });
                if (turned.snapped !== turn.snapped) {
                    if (turned.snapped) tick();
                    turn.snapped = turned.snapped;
                }
                if ((target.rotation ?? 0) === turned.rotation) return;
                turn.applied = true;
                const next = annotationsRef.current.map((ann) => (
                    ann.id === turn.id ? { ...ann, rotation: turned.rotation } : ann
                ));
                annotationsRef.current = next;
                setAnnotations(next);
                setRotationPreview(Math.round(turned.rotation));
                return;
            }

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

            if (dragRef.current) {
                const drag = dragRef.current;
                const dx = point.x - drag.startPoint.x;
                const dy = point.y - drag.startPoint.y;
                drag.lastPoint = point;
                if (Math.hypot(dx, dy) > 0.003) {
                    drag.hasMoved = true;
                    setIsDraggingSelection(true);
                }

                const freePoint = clampPhotoPoint({
                    x: Math.max(0.04, Math.min(0.96, drag.initialPoint.x + dx)),
                    y: Math.max(0.04, Math.min(0.96, drag.initialPoint.y + dy)),
                });
                // Give way to the middle of the page when the drag comes within a fingertip of
                // it, and show the guide it caught. Centring by eye on a phone is a fiddle.
                const snap = resolvePhotoDragSnap({
                    point: freePoint,
                    centreOffset: drag.centreOffset,
                    canvas: canvasSizeRef.current,
                });
                const newPoint = snap.point;
                updateSnapGuides(drag.hasMoved ? snap.guides : { x: false, y: false });

                // Highlight the bin from the same rect the release hit-tests against, so what the
                // finger lights up is always what letting go will do. The bin is only on screen
                // once the drag has started, so it cannot claim a release that never moved.
                const { width: dragCanvasW, height: dragCanvasH } = canvasSizeRef.current;
                updateTrashHovered(drag.hasMoved && isPointInPhotoTrashZone(
                    point,
                    photoTrashZoneRect(dragCanvasW, dragCanvasH),
                    dragCanvasW,
                    dragCanvasH,
                ));

                const next = annotationsRef.current.map((ann) => (
                    ann.id === drag.id && (ann.type === 'text' || ann.type === 'image')
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
                // The release commits from the gesture record, not from the live preview it
                // cannot read, so the shape tools must leave their moving end there too. Keeping
                // only the latest sample is enough — a shape is defined by its two corners — and
                // without it letting go would commit `start` twice: an arrow collapsed into its
                // own head, a rectangle and an ellipse with no size at all.
                gesture.points[1] = point;
                setLiveAnnotation((current) => current && current.type !== 'stroke' && current.type !== 'text'
                    ? { ...current, end: point }
                    : current);
            }
        },
        onPanResponderRelease: () => {
            const pinch = pinchRef.current;
            if (pinch) {
                pinchRef.current = null;
                setRotationPreview(null);
                if (pinch.applied) {
                    pushHistory({ ...snapshotEditor(), annotations: pinch.beforeAnnotations });
                }
                gestureRef.current = null;
                dragRef.current = null;
                setLiveAnnotation(null);
                return;
            }
            // A corner or the knob just let go. One history entry covers the whole gesture, taken
            // from the state it started on, exactly as a pinch records itself.
            const releasedResize = handleDragRef.current;
            if (releasedResize) {
                handleDragRef.current = null;
                setActiveHandle(null);
                // A pull that ended at the size it started on leaves nothing to undo: the object
                // put back on the page is the very one the gesture began with.
                const settledSize = objectById(annotationsRef.current, releasedResize.annotation.id);
                if (releasedResize.applied && settledSize !== releasedResize.annotation) {
                    pushHistory({ ...snapshotEditor(), annotations: releasedResize.beforeAnnotations });
                }
                return;
            }
            const releasedTurn = rotateDragRef.current;
            if (releasedTurn) {
                rotateDragRef.current = null;
                setActiveHandle(null);
                setRotationPreview(null);
                const settledAngle = objectById(annotationsRef.current, releasedTurn.id);
                const startingAngle = objectById(releasedTurn.beforeAnnotations, releasedTurn.id);
                if (releasedTurn.applied && (settledAngle?.rotation ?? 0) !== (startingAngle?.rotation ?? 0)) {
                    pushHistory({ ...snapshotEditor(), annotations: releasedTurn.beforeAnnotations });
                }
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
                        ...snapshotEditor(),
                        annotations: gestureStartAnnotationsRef.current,
                    };
                    pushHistory(snapshot);
                }
                gestureRef.current = null;
                gestureStartAnnotationsRef.current = null;
                erasedInCurrentGestureRef.current = false;
                return;
            }
            if (dragRef.current) {
                const drag = dragRef.current;
                const { width: releaseCanvasW, height: releaseCanvasH } = canvasSizeRef.current;
                // Decided from the drag record, which the responder owns, rather than from the
                // `trashHovered` state: this handler was created on the first render and would
                // read that variable's initial `false` no matter what the user just dragged over.
                const outcome = resolvePhotoTextDragRelease({
                    point: drag.lastPoint,
                    zone: photoTrashZoneRect(releaseCanvasW, releaseCanvasH),
                    canvasWidth: releaseCanvasW,
                    canvasHeight: releaseCanvasH,
                    hasMoved: drag.hasMoved,
                });
                setIsDraggingSelection(false);
                updateTrashHovered(false);
                updateSnapGuides({ x: false, y: false });

                if (outcome === 'delete') {
                    const next = annotationsRef.current.filter((ann) => ann.id !== drag.id);
                    commitAnnotations(next);
                    setSelectedId(null);
                } else if (outcome === 'reposition') {
                    const initialPt = drag.initialPoint;
                    const dragId = drag.id;
                    const previousAnnotations = annotationsRef.current.map((ann) => (
                        ann.id === dragId && (ann.type === 'text' || ann.type === 'image')
                            ? { ...ann, point: initialPt }
                            : ann
                    ));
                    const snapshot: EditorHistoryState = {
                        ...snapshotEditor(),
                        annotations: previousAnnotations,
                    };
                    pushHistory(snapshot);
                }
                dragRef.current = null;
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
                    const { width: shapeCanvasW, height: shapeCanvasH } = canvasSizeRef.current;
                    // A tap with a shape tool selected is not a drawing; committing it would
                    // leave a stray mark the user then has to hunt down and erase.
                    if (isPhotoShapeDragCommittable(gesture.start, lastPoint, shapeCanvasW, shapeCanvasH)) {
                        commitAnnotations([
                            ...annotationsRef.current,
                            { ...base, type: currentTool, start: gesture.start, end: lastPoint } as PhotoShape,
                        ]);
                    }
                }
            }
            gestureRef.current = null;
            setLiveAnnotation(null);
        },
        onPanResponderTerminate: () => {
            pinchRef.current = null;
            handleDragRef.current = null;
            rotateDragRef.current = null;
            setActiveHandle(null);
            setRotationPreview(null);
            updateSnapGuides({ x: false, y: false });
            if (toolRef.current === 'eraser') {
                setEraserCursor(null);
                if (erasedInCurrentGestureRef.current && gestureStartAnnotationsRef.current) {
                    const snapshot: EditorHistoryState = {
                        ...snapshotEditor(),
                        annotations: gestureStartAnnotationsRef.current,
                    };
                    pushHistory(snapshot);
                }
                gestureStartAnnotationsRef.current = null;
                erasedInCurrentGestureRef.current = false;
            }
            setIsDraggingSelection(false);
            updateTrashHovered(false);
            cropDragRef.current = null;
            dragRef.current = null;
            gestureRef.current = null;
            setLiveAnnotation(null);
        },
    })).current;

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
            {/*
              * The inset is applied here rather than by a SafeAreaView. A modal is a separate
              * native view hierarchy, and the safe-area view measures against a window it is not
              * parented in there, so it reported no inset at all and the header was drawn under
              * the clock and the battery. `useSafeAreaInsets` reads through React context, which
              * does cross the modal boundary — the same way every other sheet in the app gets its
              * insets.
              */}
            <View style={[styles.container, { paddingTop: insets.top }]}>
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
                        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
                            {renderPlacedPictures(allAnnotations, canvasSize.width, canvasSize.height)}
                        </View>
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

                        {/* The page's own centre lines, shown only while a drag is settling onto
                            one of them, so the guide means something every time it appears. */}
                        {snapGuides.x && (
                            <View pointerEvents="none" style={[styles.snapGuide, styles.snapGuideVertical, { left: canvasSize.width / 2 - 1 }]} />
                        )}
                        {snapGuides.y && (
                            <View pointerEvents="none" style={[styles.snapGuide, styles.snapGuideHorizontal, { top: canvasSize.height / 2 - 1 }]} />
                        )}

                        {/* The frame around whatever is selected: a label or a picture. It stays
                            up through a drag, a pull and a turn, because the thing being moved is
                            exactly the thing the frame is drawn around. */}
                        {selectionGeometry && selectedBounds && selectionHandles && (
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
                                            transform: [{ rotate: `${selectedRotation}deg` }],
                                        },
                                    ]}
                                >
                                    {/* The stem the knob hangs from. It lives inside the frame so
                                        it leans with it without any maths of its own. */}
                                    <View
                                        style={[
                                            styles.rotateStem,
                                            rotateSide === 'bottom'
                                                ? { top: selectedBounds.height + 8, height: PHOTO_ROTATE_HANDLE_OFFSET - 4 }
                                                : { top: -PHOTO_ROTATE_HANDLE_OFFSET + 4, height: PHOTO_ROTATE_HANDLE_OFFSET - 4 },
                                        ]}
                                    />
                                </View>

                                {/* Corner handles, drawn at exactly the points the gesture
                                    handlers hit-test against. Touches are read by the canvas
                                    itself, which is why these stay out of the way. */}
                                {(['tl', 'tr', 'bl', 'br'] as const).map((corner) => (
                                    <View
                                        key={corner}
                                        pointerEvents="none"
                                        style={[
                                            styles.selectionHandle,
                                            {
                                                left: selectionHandles[corner].x - 7,
                                                top: selectionHandles[corner].y - 7,
                                            },
                                            activeHandle === corner && styles.selectionHandleActive,
                                        ]}
                                    />
                                ))}

                                <View
                                    pointerEvents="none"
                                    style={[
                                        styles.rotateKnob,
                                        {
                                            left: selectionHandles.rotate.x - 15,
                                            top: selectionHandles.rotate.y - 15,
                                        },
                                        activeHandle === 'rotate' && styles.rotateKnobActive,
                                    ]}
                                >
                                    <Text style={[styles.rotateKnobIcon, activeHandle === 'rotate' && styles.rotateKnobIconActive]}>↻</Text>
                                </View>

                                {/* The angle, while it is being turned: a picture straightened by
                                    eye is never quite straight, and this is how the user knows
                                    the turn has settled on a quarter of one. */}
                                {rotationPreview !== null && (
                                    <View
                                        pointerEvents="none"
                                        style={[
                                            styles.anglePill,
                                            {
                                                left: Math.max(4, Math.min(canvasSize.width - 56, selectionHandles.rotate.x - 26)),
                                                top: Math.max(4, selectionHandles.rotate.y - 44),
                                            },
                                        ]}
                                    >
                                        <Text style={styles.anglePillText}>{rotationPreview}°</Text>
                                    </View>
                                )}

                                {/* Floating Action Pill */}
                                {selectedText && !manipulating && (
                                <View
                                    style={[
                                        styles.textFloatingToolbar,
                                        {
                                            top: selectionPillTop,
                                            left: Math.max(6, Math.min(canvasSize.width - 236, selectionPillCentre - 118)),
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
                                            (selectedText.bgStyle || 'classic') === 'badge' && styles.textStyleBadgeSolid,
                                            (selectedText.bgStyle || 'classic') === 'frosted' && styles.textStyleBadgeFrosted,
                                            (selectedText.bgStyle || 'classic') === 'outline' && styles.textStyleBadgeOutline,
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
                                            {(selectedText.textAlign || 'center') === 'left' ? '⇤' : (selectedText.textAlign || 'center') === 'right' ? '⇥' : '≡'}
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
                                )}

                                {/* The same pill for a picture: size it, turn it, throw it away.
                                    Pinching does all three at once; these are for the finger that
                                    wants one small step, and for a picture too big to pinch. */}
                                {selectedPicture && !manipulating && (
                                <View
                                    style={[
                                        styles.textFloatingToolbar,
                                        {
                                            top: selectionPillTop,
                                            left: Math.max(6, Math.min(canvasSize.width - 172, selectionPillCentre - 86)),
                                        },
                                    ]}
                                >
                                    <TouchableOpacity
                                        style={styles.textFloatingBtn}
                                        onPress={() => resizeSelectedPicture(PICTURE_STEP_DOWN)}
                                        accessibilityRole="button"
                                        accessibilityLabel={l('Görseli küçült', 'Make the picture smaller')}
                                    >
                                        <Text style={styles.textFloatingSmallA}>−</Text>
                                    </TouchableOpacity>

                                    <TouchableOpacity
                                        style={styles.textFloatingBtn}
                                        onPress={() => resizeSelectedPicture(PICTURE_STEP_UP)}
                                        accessibilityRole="button"
                                        accessibilityLabel={l('Görseli büyüt', 'Make the picture bigger')}
                                    >
                                        <Text style={styles.textFloatingBigA}>+</Text>
                                    </TouchableOpacity>

                                    <TouchableOpacity
                                        style={styles.textFloatingBtn}
                                        onPress={rotateSelectedPicture}
                                        accessibilityRole="button"
                                        accessibilityLabel={l('Görseli çeyrek tur döndür', 'Turn the picture a quarter turn')}
                                    >
                                        <Text style={styles.textFloatingIcon}>↻</Text>
                                    </TouchableOpacity>

                                    <View style={styles.textFloatingDivider} />

                                    <TouchableOpacity
                                        style={[styles.textFloatingBtn, styles.textFloatingDeleteBtn]}
                                        onPress={deleteSelectedPicture}
                                        accessibilityRole="button"
                                        accessibilityLabel={l('Görseli sil', 'Delete the picture')}
                                    >
                                        <Text style={styles.textFloatingDeleteIcon}>🗑</Text>
                                    </TouchableOpacity>
                                </View>
                                )}
                            </View>
                        )}

                        {/* Interactive Drag-to-Delete Trash Area */}
                        {isDraggingSelection && (
                            <View
                                pointerEvents="none"
                                style={[
                                    styles.textTrashZone,
                                    {
                                        left: trashPill.x,
                                        top: trashPill.y,
                                        width: trashPill.width,
                                        height: trashPill.height,
                                    },
                                    trashHovered && styles.textTrashZoneHovered,
                                ]}
                            >
                                <Text style={[styles.textTrashIcon, trashHovered && styles.textTrashIconHovered]}>🗑</Text>
                                {/* Both captions have to occupy the same box: a pill that resized
                                    itself as the highlight came and went would change the target
                                    the finger is already hovering over. */}
                                <Text
                                    numberOfLines={1}
                                    style={[styles.textTrashLabel, trashHovered && styles.textTrashLabelHovered]}
                                >
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

                {/* The tray carries the home-indicator inset itself, so the last row of tools is
                    never sitting under it. */}
                <View style={[styles.controls, { paddingBottom: Math.max(insets.bottom, Platform.OS === 'ios' ? 8 : 12) }]}>
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
                                <Text
                                    numberOfLines={1}
                                    style={[styles.toolLabel, tool === item.id && styles.toolLabelActive]}
                                >
                                    {item.label}
                                </Text>
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
                            <Text numberOfLines={1} style={styles.toolLabel}>{l('Döndür', 'Rotate')}</Text>
                        </TouchableOpacity>
                        {page && (
                            <TouchableOpacity
                                style={styles.toolButton}
                                onPress={() => setPageSheet(true)}
                                accessibilityRole="button"
                                accessibilityLabel={l('Kağıt ve zemin rengini değiştir', 'Change paper and page colour')}
                            >
                                <Text style={styles.toolIcon}>▤</Text>
                                <Text numberOfLines={1} style={styles.toolLabel}>{l('Kağıt', 'Paper')}</Text>
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

                {/* Where the picture is coming from. Asked once, on the way to the picker, so
                    the page keeps the tap that said where the picture should land. */}
                <Modal
                    visible={pictureSourceSheet}
                    transparent
                    animationType="fade"
                    onRequestClose={() => setPictureSourceSheet(false)}
                >
                    <View style={styles.pageSheetOverlay}>
                        <Pressable
                            style={StyleSheet.absoluteFill}
                            onPress={() => setPictureSourceSheet(false)}
                            accessibilityLabel={l('Görsel kaynağı seçimini kapat', 'Close picture source options')}
                        />
                        <SwipeDismissSheet
                            active={pictureSourceSheet}
                            style={styles.pageSheet}
                            onDismiss={() => setPictureSourceSheet(false)}
                        >
                            <Text style={styles.pageSheetTitle}>{l('Görsel ekle', 'Add a picture')}</Text>
                            <TouchableOpacity
                                style={styles.sourceRow}
                                onPress={() => addPictureFrom('library')}
                                accessibilityRole="button"
                                accessibilityLabel={l('Galeriden görsel seç', 'Choose a picture from the library')}
                            >
                                <Text style={styles.sourceRowIcon}>🖼️</Text>
                                <Text style={styles.sourceRowText}>{l('Galeriden seç', 'Choose from Library')}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={styles.sourceRow}
                                onPress={() => addPictureFrom('camera')}
                                accessibilityRole="button"
                                accessibilityLabel={l('Kamerayla fotoğraf çek', 'Take a photo with the camera')}
                            >
                                <Text style={styles.sourceRowIcon}>📷</Text>
                                <Text style={styles.sourceRowText}>{l('Fotoğraf çek', 'Take Photo')}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={styles.sourceCancel}
                                onPress={() => setPictureSourceSheet(false)}
                                accessibilityRole="button"
                            >
                                <Text style={styles.sourceCancelText}>{t('common.cancel')}</Text>
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

                        {/* Top Action Bar — same modal inset problem as the editor's own header. */}
                        <View style={[styles.instagramTextHeader, { paddingTop: insets.top + Spacing.sm }]}>
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
                        </View>

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

                {/* The surface the native export is photographed on. Mounted only while a save is
                    running, and parked off screen: it is the same drawing at export size, without
                    the selection frame, eraser ring or crop overlay, none of which belong in the
                    card. It has to be a real, laid-out view — `renderInContext` photographs a
                    layer, and a layer only exists once the view is in the tree. */}
                {exportSurface && (
                    <View
                        ref={exportSurfaceRef}
                        collapsable={false}
                        pointerEvents="none"
                        onLayout={() => { exportLaidOutRef.current = true; }}
                        style={[
                            styles.exportSurface,
                            { width: exportSurface.width, height: exportSurface.height },
                        ]}
                    >
                        {page ? (
                            <PaperSwatch
                                paper={page.paper}
                                background={page.background}
                                width={exportSurface.width}
                                height={exportSurface.height}
                                ruling={scaleBlankCanvasRuling(
                                    page.ruling,
                                    exportSurface.width / Math.max(1, sourceSize.width),
                                )}
                                style={StyleSheet.absoluteFill}
                            />
                        ) : sourceUri ? (
                            <NativeImage
                                source={{ uri: sourceUri }}
                                style={StyleSheet.absoluteFill}
                                resizeMode="stretch"
                                fadeDuration={0}
                                onLoad={() => { exportPhotoLoadedRef.current = true; }}
                                onError={() => { exportPhotoLoadedRef.current = true; }}
                            />
                        ) : null}
                        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
                            {renderPlacedPictures(
                                annotations,
                                exportSurface.width,
                                exportSurface.height,
                                exportSurface.scale,
                                () => { exportPicturesReadyRef.current += 1; },
                            )}
                        </View>
                        <Svg
                            width={exportSurface.width}
                            height={exportSurface.height}
                            style={StyleSheet.absoluteFill}
                        >
                            {annotations.map((annotation) => renderAnnotation(
                                annotation,
                                exportSurface.width,
                                exportSurface.height,
                                exportSurface.scale,
                            ))}
                        </Svg>
                    </View>
                )}
            </View>
        </Modal>
    );
}

function createStyles(colors: ColorScheme) {
    return StyleSheet.create({
        // The chrome — the header, the tool tray and the paper sheet — follows the app's theme so
        // the editor reads as part of it rather than as a borrowed tool. What sits *over* the
        // photo (selection handles, the text composer, the drag-to-delete bin) stays dark and
        // white on purpose: those have to be legible against whatever the learner photographed,
        // not against the app's background.
        container: { flex: 1, backgroundColor: colors.bgPrimary },
        header: {
            minHeight: 62,
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: Spacing.md,
            backgroundColor: colors.bgCard,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: colors.border,
        },
        headerButton: { minWidth: 64, minHeight: 44, justifyContent: 'center' },
        headerButtonText: { color: colors.accent, fontSize: FontSize.md, fontWeight: '600' },
        headerCenter: { flex: 1, alignItems: 'center', paddingHorizontal: Spacing.sm },
        title: { color: colors.textPrimary, fontSize: FontSize.lg, fontWeight: '800' },
        subtitle: { color: colors.textMuted, fontSize: FontSize.sm, marginTop: 2 },
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
        stage: { flex: 1, minHeight: 0, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', padding: 8 },
        exportSurface: {
        position: 'absolute',
        // Far enough off screen that it can never be seen, close enough to stay laid out.
        left: -30000,
        top: 0,
        overflow: 'hidden',
    },
    canvas: { backgroundColor: '#000', overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
        controls: {
            backgroundColor: colors.bgCard,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: colors.border,
        },
        toolList: { paddingHorizontal: Spacing.sm, paddingVertical: 7, gap: 5 },
        toolButton: {
            // A fixed width broke the longest Turkish label in half — "Dikdörtgen" wrapped to
            // "Dikdörtge" over a lone "n". The row already scrolls, so a button is free to be as
            // wide as its own label needs and no narrower than a comfortable tap target.
            minWidth: 54,
            paddingHorizontal: 6,
            minHeight: 52,
            borderRadius: BorderRadius.md,
            alignItems: 'center',
            justifyContent: 'center',
            gap: 2,
        },
        toolButtonActive: { backgroundColor: colors.accentLight },
        pageSheetOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.5)', justifyContent: 'flex-end' },
        pageSheet: {
            backgroundColor: colors.bgCard,
            borderTopLeftRadius: BorderRadius.lg,
            borderTopRightRadius: BorderRadius.lg,
            paddingHorizontal: Spacing.lg,
            paddingTop: 44,
            paddingBottom: 28,
            gap: Spacing.xs,
        },
        pageSheetTitle: { color: colors.textPrimary, fontSize: FontSize.lg, fontWeight: '800' },
        // The source rows arrived written for the sheet's old dark background. The sheet now
        // follows the app's theme, so white-on-white would have made them invisible in light
        // mode; they take the same tokens as everything else in the tray.
        sourceRow: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: Spacing.md,
            paddingVertical: Spacing.md,
            paddingHorizontal: Spacing.sm,
            borderRadius: BorderRadius.md,
            backgroundColor: colors.bgInput,
            marginTop: Spacing.sm,
        },
        sourceRowIcon: { fontSize: FontSize.lg },
        sourceRowText: { color: colors.textPrimary, fontSize: FontSize.md, fontWeight: '700' },
        sourceCancel: { alignItems: 'center', paddingVertical: Spacing.md, marginTop: Spacing.xs },
        sourceCancelText: { color: colors.textMuted, fontSize: FontSize.md, fontWeight: '700' },
        pageSheetLabel: { color: colors.textMuted, fontSize: FontSize.sm, fontWeight: '600', marginTop: Spacing.sm },
        pageChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
        pageChip: {
            minWidth: 76,
            alignItems: 'center',
            gap: 6,
            paddingVertical: Spacing.sm,
            paddingHorizontal: Spacing.sm,
            borderRadius: BorderRadius.md,
            borderWidth: 2,
            borderColor: colors.border,
            backgroundColor: colors.bgInput,
        },
        pageChipActive: { borderColor: colors.accent, backgroundColor: colors.accentLight },
        pageChipSwatch: { borderRadius: 4, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
        pageChipText: { color: colors.textMuted, fontSize: FontSize.sm, fontWeight: '600' },
        pageChipTextActive: { color: colors.textPrimary },
        pageColorDot: {
            width: 44,
            height: 34,
            borderRadius: 4,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: colors.border,
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
        toolIcon: { color: colors.textPrimary, fontSize: 20, lineHeight: 23 },
        textToolIcon: { fontWeight: '900' },
        toolLabel: { color: colors.textMuted, fontSize: 10, fontWeight: '600' },
        toolLabelActive: { color: colors.accent, fontWeight: '800' },
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
        colorButtonActive: { backgroundColor: colors.accentLight },
        // The swatch ring has to stay visible against both a white and a near-black swatch, so it
        // takes the theme's border rather than a fixed grey.
        colorDot: { width: 23, height: 23, borderRadius: 12, borderWidth: 1, borderColor: colors.border },
        sizeGroup: { flexDirection: 'row', alignItems: 'center' },
        sizeButton: { width: 34, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: BorderRadius.sm },
        sizeButtonActive: { backgroundColor: colors.accentLight },
        sizeDot: { borderRadius: 999 },
        historyButton: { width: 42, height: 44, alignItems: 'center', justifyContent: 'center' },
        historyIcon: { color: colors.textPrimary, fontSize: 23 },
        disabledText: { color: colors.textMuted, opacity: 0.5 },

        // Interactive Text Selection Styles
        textSelectionBox: {
            position: 'absolute',
            borderWidth: 1.5,
            borderColor: colors.accent,
            borderStyle: 'dashed',
            borderRadius: 8,
            overflow: 'visible',
        },
        // The corners are laid out in canvas coordinates rather than inside the frame, so the
        // handle the finger reaches for is drawn at the point the gesture handler tests.
        selectionHandle: {
            position: 'absolute',
            width: 14,
            height: 14,
            borderRadius: 7,
            backgroundColor: '#ffffff',
            borderWidth: 3,
            borderColor: colors.accent,
        },
        selectionHandleActive: {
            backgroundColor: colors.accent,
            borderColor: '#ffffff',
            transform: [{ scale: 1.25 }],
        },
        rotateStem: {
            position: 'absolute',
            left: '50%',
            width: 2,
            marginLeft: -1,
            backgroundColor: colors.accent,
            opacity: 0.9,
        },
        rotateKnob: {
            position: 'absolute',
            width: 30,
            height: 30,
            borderRadius: 15,
            backgroundColor: '#ffffff',
            borderWidth: 2,
            borderColor: colors.accent,
            alignItems: 'center',
            justifyContent: 'center',
        },
        rotateKnobActive: {
            backgroundColor: colors.accent,
            borderColor: '#ffffff',
        },
        rotateKnobIcon: { color: colors.accent, fontSize: FontSize.md, fontWeight: '800' },
        rotateKnobIconActive: { color: '#ffffff' },
        anglePill: {
            position: 'absolute',
            minWidth: 52,
            paddingHorizontal: 8,
            paddingVertical: 4,
            borderRadius: 12,
            backgroundColor: 'rgba(17, 24, 39, 0.94)',
            alignItems: 'center',
        },
        anglePillText: { color: '#ffffff', fontSize: FontSize.sm, fontWeight: '800' },
        // Guides are the one piece of chrome that has to read against ink of any colour, so they
        // take a hue nothing in the palette draws with.
        snapGuide: { position: 'absolute', backgroundColor: '#ff2d95', opacity: 0.9 },
        snapGuideVertical: { top: 0, bottom: 0, width: 2 },
        snapGuideHorizontal: { left: 0, right: 0, height: 2 },
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
            // Position and size come from `photoTrashPillRect`, the same geometry the drop hit
            // test uses; only the paint lives here.
            position: 'absolute',
            justifyContent: 'center',
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
            // The pill has a fixed width now, so a long translation shortens itself instead of
            // spilling past the edge of the drop target.
            flexShrink: 1,
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
            backgroundColor: colors.bgInput,
            alignItems: 'center',
            justifyContent: 'center',
        },
        cropAspectBtnActive: {
            backgroundColor: colors.accent,
        },
        cropAspectLabel: {
            color: colors.textMuted,
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
            backgroundColor: colors.bgInput,
        },
        cropCancelText: {
            color: colors.textSecondary,
            fontSize: FontSize.sm,
            fontWeight: '600',
        },
        cropResetBtn: {
            flex: 1,
            height: 40,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: BorderRadius.md,
            backgroundColor: colors.bgInput,
        },
        cropResetText: {
            color: colors.textSecondary,
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
            backgroundColor: colors.bgInput,
        },
        eraserModeButton: {
            flex: 1,
            minHeight: 34,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 10,
            borderRadius: BorderRadius.full,
        },
        eraserModeButtonActive: { backgroundColor: colors.bgCard },
        eraserModeText: {
            color: colors.textMuted,
            fontSize: FontSize.xs,
            fontWeight: '600',
        },
        eraserModeTextActive: { color: colors.accent, fontWeight: '800' },

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
