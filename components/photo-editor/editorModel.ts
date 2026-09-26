import * as Haptics from 'expo-haptics';
import {
    calculatePhotoTextBounds,
    photoImageAnchorPixels,
    photoImageBounds,
    photoSelectionHandlePoints,
    photoTextAnchorPixels,
    type PhotoAnnotation,
    type PhotoEraserMode,
    type PhotoImage,
    type PhotoSelectionGeometry,
    type PhotoText,
} from '../../lib/photoEditor';
import type { BlankCanvasPaper, BlankCanvasRuling } from '../../lib/blankCanvas';
import type { useI18n } from '../../hooks/useI18n';

/** The two translation helpers the editor's pieces render their copy through. */
export type PhotoEditorI18n = Pick<ReturnType<typeof useI18n>, 'l' | 't'>;

export type EditorTool = 'pen' | 'highlighter' | 'arrow' | 'rect' | 'ellipse' | 'cover' | 'text' | 'image' | 'eraser' | 'crop';

export const TOOL_ITEMS: { id: EditorTool; icon: string }[] = [
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

export const DRAW_COLORS = ['#ffffff', '#111827', '#ef4444', '#f97316', '#f59e0b', '#22c55e', '#06b6d4', '#0ea5e9', '#8b5cf6', '#ec4899'];
export const WIDTHS = [3, 6, 10];
export const FONT_SIZES = [18, 24, 32, 44];
/** Eraser tip radii in canvas points; independent from the pen width. */
export const ERASER_RADII = [12, 24, 42];
/** Two fingers must travel this far apart before a pinch counts as a resize. */
export const PINCH_ACTIVATION_PX = 12;
/** How soon after a tap a second one on the same label counts as opening it for editing. */
export const DOUBLE_TAP_MS = 320;
/** Longest edge an exported PNG may reach. A card image past this is weight, not detail. */
export const EXPORT_MAX_DIMENSION = 2000;
/** What one press of the picture pill's − and + does to the box it is sized in. */
export const PICTURE_STEP_DOWN = 0.85;
export const PICTURE_STEP_UP = 1.18;

/** The off-screen surface an export is rendered on: its size, and its ratio to the live canvas. */
export type ExportSurface = { width: number; height: number; scale: number };
export const ERASER_MODES: { id: PhotoEraserMode }[] = [{ id: 'partial' }, { id: 'object' }];

/** A drawn page's paper, in the page's own export pixels. */
export type EditorPage = { background: string; paper: BlankCanvasPaper; ruling: BlankCanvasRuling };

export interface EditorHistoryState {
    sourceUri: string;
    sourceSize: { width: number; height: number };
    annotations: PhotoAnnotation[];
    /**
     * The sheet as it was, so undoing a crop or a turn puts the ruling back under the ink it was
     * drawn against instead of leaving the paper one edit ahead of the strokes.
     */
    page: EditorPage | null;
}

export function makeId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function sameSourceSize(a: { width: number; height: number }, b: { width: number; height: number }): boolean {
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
export function selectionGeometryFor(
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
export function selectionCentreOffset(geometry: PhotoSelectionGeometry): { x: number; y: number } {
    const handles = photoSelectionHandlePoints(geometry);
    return {
        x: (handles.tl.x + handles.br.x) / 2 - geometry.anchor.x,
        y: (handles.tl.y + handles.br.y) / 2 - geometry.anchor.y,
    };
}

/** The annotation with this id, when it is one of the two kinds a frame is drawn around. */
export function objectById(annotations: PhotoAnnotation[], id: string): PhotoText | PhotoImage | undefined {
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
export function tick() {
    try {
        void Haptics.selectionAsync().catch(() => undefined);
    } catch {
        // No haptics available on this device.
    }
}
