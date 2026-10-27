// The blank drawing page's own model: a handful of tools, a short palette and three sizes.
//
// The pad deliberately offers less than the photo editor. Pen, highlighter, eraser and text sit
// on the bar; arrows, boxes, ellipses, cover-ups and pictures wait behind "More". Nothing turns,
// crops or restyles. Everything drawn is stored as the photo editor's annotations, so the export
// path and the partial eraser are shared with it.

import {
    calculatePhotoTextBounds,
    clampPhotoPoint,
    isPointInPhotoImage,
    photoImageBounds,
    isPointInPhotoText,
    photoImagePlacement,
    type PhotoAnnotation,
    type PhotoImage,
    type PhotoPoint,
    type PhotoText,
} from './photoEditor';
import { isDarkBlankCanvasPage } from './blankCanvas';

/** The tools on the bar itself. */
export type DrawingBarTool = 'pen' | 'highlighter' | 'eraser' | 'text';
/** The tools behind the bar's "More" button. */
export type DrawingShapeTool = 'arrow' | 'rect' | 'ellipse' | 'cover';
export type DrawingTool = DrawingBarTool | DrawingShapeTool | 'image';

export const DRAWING_MORE_TOOLS: (DrawingShapeTool | 'image')[] = ['arrow', 'rect', 'ellipse', 'cover', 'image'];

export function isDrawingShapeTool(tool: DrawingTool): tool is DrawingShapeTool {
    return tool === 'arrow' || tool === 'rect' || tool === 'ellipse' || tool === 'cover';
}

export type DrawingSize = 0 | 1 | 2;
export const DRAWING_SIZES: DrawingSize[] = [0, 1, 2];

/** Pen widths in canvas points: fine handwriting, normal writing, a marker. */
export const PEN_WIDTHS = [2.5, 4.5, 8] as const;
/** Highlighter widths: wide enough to sit behind a line of handwriting. */
export const HIGHLIGHTER_WIDTHS = [14, 22, 32] as const;
/** Eraser radii in canvas points. */
export const ERASER_RADII = [10, 20, 36] as const;

/** Label sizes in canvas points. */
export const TEXT_SIZES = [18, 26, 36] as const;
/** How much of the page a picture may take along either edge, at each size. */
export const IMAGE_COVERAGE = [0.35, 0.55, 0.8] as const;

export const HIGHLIGHTER_OPACITY = 0.35;

/** Ink for a light page. The first colour is the one a page opens with. */
export const LIGHT_PAGE_INKS = ['#111827', '#2563eb', '#dc2626', '#16a34a', '#ea580c'] as const;
/** The same five inks, lifted so they read on the dark page. */
export const DARK_PAGE_INKS = ['#ffffff', '#60a5fa', '#f87171', '#4ade80', '#fb923c'] as const;
/** Highlighter colours; they are see-through, so one set serves every page. */
export const HIGHLIGHTER_INKS = ['#facc15', '#4ade80', '#f472b6', '#60a5fa', '#fb923c'] as const;

/** The pen palette for a page colour. */
export function drawingPenInks(background: string): readonly string[] {
    return isDarkBlankCanvasPage(background) ? DARK_PAGE_INKS : LIGHT_PAGE_INKS;
}

/** The palette shown for the tool in hand. The eraser and pictures have none. */
export function drawingInks(tool: DrawingTool, background: string): readonly string[] {
    if (tool === 'highlighter') return HIGHLIGHTER_INKS;
    if (tool === 'eraser' || tool === 'image') return [];
    return drawingPenInks(background);
}

/** Whether the tool in hand comes in sizes. A cover-up is as large as it is dragged. */
export function drawingToolHasSizes(tool: DrawingTool): boolean {
    return tool !== 'cover';
}

/**
 * How wide the tool in hand draws, how large it erases or how large it letters, at this size.
 * Shapes are outlined with the pen's own widths.
 */
export function drawingToolWidth(tool: DrawingTool, size: DrawingSize): number {
    if (tool === 'highlighter') return HIGHLIGHTER_WIDTHS[size];
    if (tool === 'eraser') return ERASER_RADII[size];
    if (tool === 'text') return TEXT_SIZES[size];
    return PEN_WIDTHS[size];
}

/** Two samples closer than this, in canvas points, add nothing a smooth curve can show. */
export const MIN_SAMPLE_DISTANCE = 1.5;

/**
 * Whether a new finger position is far enough from the last kept one to be worth recording.
 * Points are normalised, so the distance is measured back in canvas points.
 */
export function shouldAddDrawingPoint(
    last: PhotoPoint | undefined,
    next: PhotoPoint,
    canvas: { width: number; height: number },
    minDistance = MIN_SAMPLE_DISTANCE,
): boolean {
    if (!last) return true;
    const dx = (next.x - last.x) * canvas.width;
    const dy = (next.y - last.y) * canvas.height;
    return Math.hypot(dx, dy) >= minDistance;
}

/**
 * Where a finger is on the page, as a normalised point.
 *
 * `origin` is the canvas's top-left in page coordinates. It is taken from the touch that started
 * the gesture (`pageX - locationX`) rather than measured from the view: the page is laid out
 * while its modal is still sliding up, and a measurement taken then sits a screen-height too low,
 * which pinned every stroke to the top edge.
 */
export function drawingPointFromPage(
    page: { x: number; y: number },
    origin: { x: number; y: number },
    canvas: { width: number; height: number },
): PhotoPoint {
    return clampPhotoPoint({
        x: (page.x - origin.x) / Math.max(1, canvas.width),
        y: (page.y - origin.y) / Math.max(1, canvas.height),
    });
}

/** One finger on the glass, as a touch event reports it. */
export interface DrawingTouch {
    identifier?: number | string;
    pageX: number;
    pageY: number;
}

/** A touch event: the finger that changed, plus every finger down and every finger that changed. */
export interface DrawingTouchEvent extends DrawingTouch {
    touches?: DrawingTouch[];
    changedTouches?: DrawingTouch[];
}

/**
 * The finger a gesture follows, out of everything on the glass, or null when this event is about
 * other fingers only. A stroke keeps to the finger that began it, so a palm or a second finger set
 * down mid-stroke can neither drag the line across the page nor end it where that palm lifts.
 */
export function followedTouch(event: DrawingTouchEvent, identifier: DrawingTouch['identifier']): DrawingTouch | null {
    if (identifier === undefined) return event;
    // A finger that has just lifted is no longer among `touches`, only among `changedTouches`.
    const fingers = [...(event.changedTouches ?? []), ...(event.touches ?? [])];
    if (!fingers.length) return event.identifier === undefined || event.identifier === identifier ? event : null;
    return fingers.find((finger) => finger.identifier === identifier) ?? null;
}

/** The largest page of this aspect that fits the stage, leaving `margin` on every side. */
export function fitDrawingPage(
    stage: { width: number; height: number },
    page: { width: number; height: number },
    margin = 12,
): { width: number; height: number } {
    const availableWidth = Math.max(1, stage.width - margin * 2);
    const availableHeight = Math.max(1, stage.height - margin * 2);
    const ratio = page.width > 0 && page.height > 0 ? page.width / page.height : 4 / 3;
    if (availableWidth / availableHeight > ratio) {
        return { width: Math.max(1, Math.round(availableHeight * ratio)), height: Math.max(1, Math.round(availableHeight)) };
    }
    return { width: Math.max(1, Math.round(availableWidth)), height: Math.max(1, Math.round(availableWidth / ratio)) };
}

/**
 * Carry a drawing onto a page of a different shape without stretching it.
 *
 * Positions are normalised to the page, so switching a landscape page to a portrait one would
 * squash every letter. Instead the old page is scaled to fit inside the new one and centred,
 * and every position is moved with it: the drawing keeps its proportions.
 */
export function refitDrawingAnnotations<T extends PhotoAnnotation>(
    annotations: T[],
    from: { width: number; height: number },
    to: { width: number; height: number },
): T[] {
    if (from.width <= 0 || from.height <= 0 || to.width <= 0 || to.height <= 0) return annotations;
    if (from.width / from.height === to.width / to.height) return annotations;
    const scale = Math.min(to.width / from.width, to.height / from.height);
    const offsetX = (to.width - from.width * scale) / 2;
    const offsetY = (to.height - from.height * scale) / 2;
    const move = (point: PhotoPoint): PhotoPoint => ({
        x: (point.x * from.width * scale + offsetX) / to.width,
        y: (point.y * from.height * scale + offsetY) / to.height,
    });
    return annotations.map((annotation) => {
        if (annotation.type === 'stroke') return { ...annotation, points: annotation.points.map(move) };
        if (annotation.type === 'text' || annotation.type === 'image') return { ...annotation, point: move(annotation.point) };
        return { ...annotation, start: move(annotation.start), end: move(annotation.end) };
    });
}

/**
 * The label or picture under a finger, topmost first, the way the page paints them: labels sit
 * over the ink and the ink over pictures, so a label wins where the two overlap.
 */
export function drawingObjectAt(
    annotations: PhotoAnnotation[],
    point: PhotoPoint,
    canvas: { width: number; height: number },
): PhotoText | PhotoImage | null {
    for (let index = annotations.length - 1; index >= 0; index -= 1) {
        const annotation = annotations[index];
        if (annotation.type === 'text' && isPointInPhotoText(annotation, point, canvas.width, canvas.height, 12)) return annotation;
    }
    for (let index = annotations.length - 1; index >= 0; index -= 1) {
        const annotation = annotations[index];
        if (annotation.type === 'image' && isPointInPhotoImage(annotation, point, canvas.width, canvas.height, 8)) return annotation;
    }
    return null;
}

/** The same label or picture, moved by a drag, its anchor kept on the page. */
export function moveDrawingObject<T extends PhotoText | PhotoImage>(object: T, from: PhotoPoint, to: PhotoPoint): T {
    return {
        ...object,
        point: clampPhotoPoint({ x: object.point.x + to.x - from.x, y: object.point.y + to.y - from.y }),
    };
}

/**
 * The same label or picture, nudged so its whole box is on the page. Dragged against an edge or
 * grown past one, it stops at the edge instead of hanging off where it would be cut from the PNG;
 * one larger than the page is centred on it.
 */
export function keepDrawingObjectOnPage<T extends PhotoText | PhotoImage>(
    object: T,
    canvas: { width: number; height: number },
): T {
    const bounds = object.type === 'text'
        ? calculatePhotoTextBounds(object, canvas.width, canvas.height)
        : photoImageBounds(object, canvas.width, canvas.height);
    const shift = (start: number, size: number, extent: number) => {
        if (size >= extent) return extent / 2 - (start + size / 2);
        if (start < 0) return -start;
        if (start + size > extent) return extent - (start + size);
        return 0;
    };
    const dx = shift(bounds.x, bounds.width, canvas.width);
    const dy = shift(bounds.y, bounds.height, canvas.height);
    if (dx === 0 && dy === 0) return object;
    return {
        ...object,
        point: {
            x: object.point.x + dx / Math.max(1, canvas.width),
            y: object.point.y + dy / Math.max(1, canvas.height),
        },
    };
}

/** A picture's box at one of the pad's sizes, keeping its own aspect. */
export function drawingImageBox(
    source: { width?: number | null; height?: number | null },
    canvas: { width: number; height: number },
    size: DrawingSize,
): { width: number; height: number } {
    return photoImagePlacement({ source, canvas, coverage: IMAGE_COVERAGE[size] });
}

/**
 * The pen colour after the page colour changes. A pen still holding one of the old page's inks
 * takes the matching ink of the new page, so a black pen on a page turned dark becomes white
 * instead of drawing invisible strokes.
 */
export function drawingInkForPage(color: string, fromBackground: string, toBackground: string): string {
    const index = drawingPenInks(fromBackground).indexOf(color);
    if (index < 0) return color;
    return drawingPenInks(toBackground)[index] ?? color;
}
