// The blank drawing page's own model: three tools, a short palette and three sizes.
//
// The pad deliberately offers less than the photo editor. A learner sketching a diagram for a
// card wants a pen, a highlighter and an eraser that behave the same way every time; shapes,
// labels, crops and placed pictures belong to marking up a photo. Strokes are stored as the
// photo editor's `PhotoStroke`, so the export path and the partial eraser are shared with it.

import { clampPhotoPoint, type PhotoPoint, type PhotoStroke } from './photoEditor';
import { isDarkBlankCanvasPage } from './blankCanvas';

export type DrawingTool = 'pen' | 'highlighter' | 'eraser';

export type DrawingSize = 0 | 1 | 2;
export const DRAWING_SIZES: DrawingSize[] = [0, 1, 2];

/** Pen widths in canvas points: fine handwriting, normal writing, a marker. */
export const PEN_WIDTHS = [2.5, 4.5, 8] as const;
/** Highlighter widths: wide enough to sit behind a line of handwriting. */
export const HIGHLIGHTER_WIDTHS = [14, 22, 32] as const;
/** Eraser radii in canvas points. */
export const ERASER_RADII = [10, 20, 36] as const;

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

/** The palette shown for the tool in hand. The eraser has none. */
export function drawingInks(tool: DrawingTool, background: string): readonly string[] {
    if (tool === 'highlighter') return HIGHLIGHTER_INKS;
    if (tool === 'pen') return drawingPenInks(background);
    return [];
}

/** How wide the tool in hand draws, or how large it erases, at this size. */
export function drawingToolWidth(tool: DrawingTool, size: DrawingSize): number {
    if (tool === 'highlighter') return HIGHLIGHTER_WIDTHS[size];
    if (tool === 'eraser') return ERASER_RADII[size];
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
 * Points are normalised to the page, so switching a landscape page to a portrait one would
 * squash every letter. Instead the old page is scaled to fit inside the new one and centred,
 * and every point is moved with it: the drawing keeps its proportions.
 */
export function refitDrawingStrokes(
    strokes: PhotoStroke[],
    from: { width: number; height: number },
    to: { width: number; height: number },
): PhotoStroke[] {
    if (from.width <= 0 || from.height <= 0 || to.width <= 0 || to.height <= 0) return strokes;
    if (from.width / from.height === to.width / to.height) return strokes;
    const scale = Math.min(to.width / from.width, to.height / from.height);
    const offsetX = (to.width - from.width * scale) / 2;
    const offsetY = (to.height - from.height * scale) / 2;
    const move = (point: PhotoPoint): PhotoPoint => ({
        x: (point.x * from.width * scale + offsetX) / to.width,
        y: (point.y * from.height * scale + offsetY) / to.height,
    });
    return strokes.map((stroke) => ({ ...stroke, points: stroke.points.map(move) }));
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
