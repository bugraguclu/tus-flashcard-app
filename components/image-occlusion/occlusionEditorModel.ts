/**
 * The Image Occlusion editor's geometry: fitting the picture on screen, zooming it, finding the
 * shape under a finger, and the box a drag draws. Shapes are kept in image fractions
 * (lib/imageOcclusion.ts); `size` is the picture's size on screen in points, so a turn and a
 * label's text size are measured the way Anki's occlusion script measures them.
 */

import {
    OCCLUSION_DEFAULT_TEXT_PIXELS,
    occlusionGeometry,
    placedPolygonPoints,
    rotateOcclusionShape,
    setOcclusionPolygonPoints,
    type OcclusionGeometry,
    type OcclusionShape,
} from '../../lib/imageOcclusion';

export type OcclusionTool = 'select' | 'rect' | 'ellipse' | 'polygon' | 'text';
export interface Point { x: number; y: number }
export interface Size { width: number; height: number }
export interface Box { left: number; top: number; width: number; height: number }
/** How the picture sits in the stage: its top-left corner and its zoom over the fitted size. */
export interface View { x: number; y: number; scale: number }

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 6;
/** Anki's editor drops a shape narrower or shorter than 5 image pixels; a drag needs this many points. */
export const MIN_DRAG_POINTS = 8;
/** How close (in points) a tap must land to a polygon's first point to close it. */
export const CLOSE_POLYGON_POINTS = 22;
export const HANDLE_POINTS = 26;
/** How far (in points) the turn handle sits from the shape's edge. */
export const ROTATE_HANDLE_POINTS = 30;
/** A turn this close (in degrees) to a multiple of 15° lands on it. */
export const SNAP_DEGREES = 4;

/** A colour the editor offers, with its Turkish and English name; a null fill is Anki's default. */
export interface OcclusionColour { fill: string | null; name: [string, string] }

/** Mask fills; the default is Anki's yellow. The asked mask is always drawn red. */
export const MASK_COLOURS: readonly OcclusionColour[] = [
    { fill: null, name: ['Varsayılan sarı', 'Default yellow'] },
    { fill: '#ffffff', name: ['Beyaz', 'White'] },
    { fill: '#d1d5db', name: ['Gri', 'Grey'] },
    { fill: '#8ecbff', name: ['Mavi', 'Blue'] },
    { fill: '#a2f0b5', name: ['Yeşil', 'Green'] },
    { fill: '#ffb3d9', name: ['Pembe', 'Pink'] },
    { fill: '#c4b5fd', name: ['Mor', 'Purple'] },
];
/** Label text colours; the default is Anki's black. Labels sit on a white box, so white is left out. */
export const LABEL_COLOURS: readonly OcclusionColour[] = [
    { fill: null, name: ['Varsayılan siyah', 'Default black'] },
    { fill: '#d32f2f', name: ['Kırmızı', 'Red'] },
    { fill: '#1565c0', name: ['Mavi', 'Blue'] },
    { fill: '#2e7d32', name: ['Yeşil', 'Green'] },
    { fill: '#6a1b9a', name: ['Mor', 'Purple'] },
    { fill: '#ef6c00', name: ['Turuncu', 'Orange'] },
];

/** The picture's largest size inside the stage, centred. */
export function fitImage(stage: Size, natural: Size): Box {
    if (natural.width <= 0 || natural.height <= 0 || stage.width <= 0 || stage.height <= 0) {
        return { left: 0, top: 0, width: 0, height: 0 };
    }
    const scale = Math.min(stage.width / natural.width, stage.height / natural.height);
    const width = natural.width * scale;
    const height = natural.height * scale;
    return { left: (stage.width - width) / 2, top: (stage.height - height) / 2, width, height };
}

/** The view after zooming by `factor` about a stage point, kept so the picture cannot drift away. */
export function zoomView(view: View, factor: number, about: Point, fitted: Box, stage: Size): View {
    const scale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, view.scale * factor));
    const applied = scale / view.scale;
    return clampView({ x: about.x - (about.x - view.x) * applied, y: about.y - (about.y - view.y) * applied, scale }, fitted, stage);
}

/** Keeps the zoomed picture covering the stage where it can, and centred where it is smaller. */
export function clampView(view: View, fitted: Box, stage: Size): View {
    const width = fitted.width * view.scale;
    const height = fitted.height * view.scale;
    const axis = (position: number, length: number, room: number) => (length <= room
        ? (room - length) / 2
        : Math.min(0, Math.max(room - length, position)));
    return { x: axis(view.x, width, stage.width), y: axis(view.y, height, stage.height), scale: view.scale };
}

/** A stage point as image fractions. */
export function toImagePoint(point: Point, view: View, fitted: Box): Point {
    return {
        x: (point.x - view.x) / Math.max(1, fitted.width * view.scale),
        y: (point.y - view.y) / Math.max(1, fitted.height * view.scale),
    };
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/** The box between two image points, clamped to the picture. */
export function boxBetween(a: Point, b: Point): Box {
    const left = clamp01(Math.min(a.x, b.x));
    const top = clamp01(Math.min(a.y, b.y));
    return { left, top, width: clamp01(Math.max(a.x, b.x)) - left, height: clamp01(Math.max(a.y, b.y)) - top };
}

/** Whether a drawn box is big enough to keep, in on-screen points. */
export function isDrawableBox(box: Box, size: Size): boolean {
    return box.width * size.width >= MIN_DRAG_POINTS && box.height * size.height >= MIN_DRAG_POINTS;
}

/** A label's text size on screen, as Anki's script sizes it (`fs` of the image height, or 40 image pixels). */
export function labelFontSize(geometry: Extract<OcclusionGeometry, { kind: 'text' }>, size: Size, natural: Size): number {
    const base = geometry.fs ? geometry.fs * size.height : OCCLUSION_DEFAULT_TEXT_PIXELS * (size.height / Math.max(1, natural.height));
    return base * geometry.scale;
}

/** A label's box on screen in points: its lines at 1.07 em with Anki's 5-pixel margin, width estimated. */
export function labelBox(geometry: Extract<OcclusionGeometry, { kind: 'text' }>, size: Size, natural: Size): Box {
    const font = labelFontSize(geometry, size, natural);
    const lines = geometry.text.split('\n');
    const longest = Math.max(1, ...lines.map((line) => line.length));
    const pad = 5 * geometry.scale;
    return {
        left: geometry.left * size.width,
        top: geometry.top * size.height,
        width: longest * font * 0.58 + pad,
        height: lines.length * font * 1.07 + pad,
    };
}

/** A polygon's points in image fractions where Anki draws them: moved so their corner is the shape's. */
export const polygonPoints = placedPolygonPoints;

/** A shape's unturned box on screen in points. */
export function shapeBox(geometry: OcclusionGeometry, size: Size, natural: Size): Box {
    switch (geometry.kind) {
        case 'rect':
            return { left: geometry.left * size.width, top: geometry.top * size.height, width: geometry.width * size.width, height: geometry.height * size.height };
        case 'ellipse':
            return { left: geometry.left * size.width, top: geometry.top * size.height, width: geometry.rx * 2 * size.width, height: geometry.ry * 2 * size.height };
        case 'polygon': {
            const points = polygonPoints(geometry);
            const xs = points.map(([x]) => x * size.width);
            const ys = points.map(([, y]) => y * size.height);
            return { left: Math.min(...xs), top: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
        }
        case 'text':
            return labelBox(geometry, size, natural);
    }
}

/** A vector turned clockwise by `degrees`. */
function turn(x: number, y: number, degrees: number): Point {
    const radians = (degrees * Math.PI) / 180;
    return { x: x * Math.cos(radians) - y * Math.sin(radians), y: x * Math.sin(radians) + y * Math.cos(radians) };
}

/** A screen point turned back by a shape's angle about its corner, so it can be tested against the unturned shape. */
function unturn(point: Point, geometry: OcclusionGeometry, size: Size): Point {
    if (!geometry.angle || geometry.kind === 'polygon') return point;
    const ox = geometry.left * size.width;
    const oy = geometry.top * size.height;
    const back = turn(point.x - ox, point.y - oy, -geometry.angle);
    return { x: ox + back.x, y: oy + back.y };
}

/** A point of a shape's unturned box, given from its corner, where it shows once turned. */
function turnedBoxPoint(geometry: OcclusionGeometry, box: Box, x: number, y: number): Point {
    if (geometry.kind === 'polygon' || !geometry.angle) return { x: box.left + x, y: box.top + y };
    const turned = turn(x, y, geometry.angle);
    return { x: box.left + turned.x, y: box.top + turned.y };
}

function insidePolygon(point: Point, points: Point[]): boolean {
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const a = points[i];
        const b = points[j];
        if ((a.y > point.y) !== (b.y > point.y) && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
    }
    return inside;
}

/** Whether a screen point (in the picture's points) falls on the shape; `slop` widens thin shapes. */
export function hitsShape(shape: OcclusionShape, point: Point, size: Size, natural: Size, slop = 6): boolean {
    const geometry = occlusionGeometry(shape);
    if (!geometry) return false;
    const local = unturn(point, geometry, size);
    const box = shapeBox(geometry, size, natural);
    if (geometry.kind === 'ellipse') {
        const rx = box.width / 2 + slop;
        const ry = box.height / 2 + slop;
        const dx = local.x - (box.left + box.width / 2);
        const dy = local.y - (box.top + box.height / 2);
        return rx > 0 && ry > 0 && (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) <= 1;
    }
    if (geometry.kind === 'polygon') {
        const points = polygonPoints(geometry).map(([x, y]) => ({ x: x * size.width, y: y * size.height }));
        if (insidePolygon(local, points)) return true;
    }
    return local.x >= box.left - slop && local.x <= box.left + box.width + slop
        && local.y >= box.top - slop && local.y <= box.top + box.height + slop
        && (geometry.kind !== 'polygon' || Math.min(box.width, box.height) < slop * 2);
}

/** The topmost shape under a point (the last drawn), or -1. */
export function hitTest(shapes: readonly OcclusionShape[], point: Point, size: Size, natural: Size): number {
    for (let index = shapes.length - 1; index >= 0; index--) {
        if (hitsShape(shapes[index], point, size, natural)) return index;
    }
    return -1;
}

/** The resize handle's centre for a single selected rect or ellipse: its bottom-right corner, turned with it. */
export function resizeHandle(shape: OcclusionShape | undefined, size: Size, natural: Size): Point | null {
    const geometry = shape ? occlusionGeometry(shape) : null;
    if (!geometry || (geometry.kind !== 'rect' && geometry.kind !== 'ellipse')) return null;
    const box = shapeBox(geometry, size, natural);
    return turnedBoxPoint(geometry, box, box.width, box.height);
}

/**
 * The box a resize drag leaves, in image fractions: the top-left corner held (a turned shape turns
 * about it, so it stays put) and the far corner under the finger, measured along the shape's turn.
 */
export function resizedBox(shape: OcclusionShape, to: Point, natural: Size): Box | null {
    const geometry = occlusionGeometry(shape);
    if (!geometry || (geometry.kind !== 'rect' && geometry.kind !== 'ellipse')) return null;
    if (!geometry.angle) return boxBetween({ x: geometry.left, y: geometry.top }, to);
    const back = turn((to.x - geometry.left) * natural.width, (to.y - geometry.top) * natural.height, -geometry.angle);
    return {
        left: geometry.left,
        top: geometry.top,
        width: Math.max(0, back.x / Math.max(1, natural.width)),
        height: Math.max(0, back.y / Math.max(1, natural.height)),
    };
}

/** A shape's centre on screen, as it is drawn (turned). */
export function shapeCentre(shape: OcclusionShape, size: Size, natural: Size): Point | null {
    const geometry = occlusionGeometry(shape);
    if (!geometry) return null;
    const box = shapeBox(geometry, size, natural);
    return turnedBoxPoint(geometry, box, box.width / 2, box.height / 2);
}

/**
 * The turn handle's centre: past the middle of the shape's top edge, turned with it, or past the
 * bottom edge when the top one would put it off the picture (where it would not show).
 */
export function rotateHandle(shape: OcclusionShape | undefined, size: Size, natural: Size): Point | null {
    const geometry = shape ? occlusionGeometry(shape) : null;
    if (!geometry) return null;
    const box = shapeBox(geometry, size, natural);
    const onPicture = (point: Point) => point.x >= 0 && point.x <= size.width && point.y >= 0 && point.y <= size.height;
    const above = turnedBoxPoint(geometry, box, box.width / 2, -ROTATE_HANDLE_POINTS);
    if (onPicture(above)) return above;
    const below = turnedBoxPoint(geometry, box, box.width / 2, box.height + ROTATE_HANDLE_POINTS);
    if (onPicture(below)) return below;
    // A shape filling the picture keeps the handle just inside its edge.
    return { x: Math.min(size.width, Math.max(0, above.x)), y: Math.min(size.height, Math.max(0, above.y)) };
}

/** The direction (degrees, clockwise from +x) from a centre to a point. */
export function bearing(centre: Point, point: Point): number {
    return (Math.atan2(point.y - centre.y, point.x - centre.x) * 180) / Math.PI;
}

/**
 * The turn a handle drag of `delta` degrees applies, landing a box on a multiple of 15° when it comes
 * within SNAP_DEGREES of one (a polygon, which keeps no angle, snaps the turn itself).
 */
export function snappedTurn(shape: OcclusionShape, delta: number): number {
    const geometry = occlusionGeometry(shape);
    const base = geometry && geometry.kind !== 'polygon' ? geometry.angle : 0;
    const wrapped = ((((delta + 180) % 360) + 360) % 360) - 180;
    const target = base + wrapped;
    const snapped = Math.round(target / 15) * 15;
    return (Math.abs(snapped - target) <= SNAP_DEGREES ? snapped : target) - base;
}

/** The shape turned about its centre; a label is measured on the picture to find its centre. */
export function turnShape(shape: OcclusionShape, degrees: number, natural: Size): OcclusionShape {
    const geometry = occlusionGeometry(shape);
    if (geometry?.kind !== 'text') return rotateOcclusionShape(shape, degrees, natural);
    const box = labelBox(geometry, natural, natural);
    const extent = { width: box.width / Math.max(1, natural.width), height: box.height / Math.max(1, natural.height) };
    return rotateOcclusionShape(shape, degrees, natural, extent);
}

/** A polygon's corner handles and the handles halfway along each edge (which add a corner), on screen. */
export function polygonHandles(shape: OcclusionShape | undefined, size: Size): { corners: Point[]; midpoints: Point[] } | null {
    const geometry = shape ? occlusionGeometry(shape) : null;
    if (geometry?.kind !== 'polygon') return null;
    const corners = polygonPoints(geometry).map(([x, y]) => ({ x: x * size.width, y: y * size.height }));
    const midpoints = corners.map((corner, index) => {
        const next = corners[(index + 1) % corners.length];
        return { x: (corner.x + next.x) / 2, y: (corner.y + next.y) / 2 };
    });
    return { corners, midpoints };
}

/** The polygon with one corner moved to an image point, or a new corner put in at `index` (`insert`). */
export function movePolygonCorner(shape: OcclusionShape, index: number, to: Point, insert = false): OcclusionShape {
    const geometry = occlusionGeometry(shape);
    if (geometry?.kind !== 'polygon') return shape;
    const points = polygonPoints(geometry);
    if (insert) points.splice(index, 0, [to.x, to.y]);
    else if (index >= 0 && index < points.length) points[index] = [to.x, to.y];
    return setOcclusionPolygonPoints(shape, points);
}

/** The polygon without one corner; it keeps at least three. */
export function removePolygonCorner(shape: OcclusionShape, index: number): OcclusionShape {
    const geometry = occlusionGeometry(shape);
    if (geometry?.kind !== 'polygon' || geometry.points.length <= 3) return shape;
    return setOcclusionPolygonPoints(shape, polygonPoints(geometry).filter((_, at) => at !== index));
}
