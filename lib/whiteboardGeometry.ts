export type WhiteboardPoint = { x: number; y: number };

export type WhiteboardStroke = {
    points: WhiteboardPoint[];
    color: string;
    width: number;
};

export type WhiteboardHistory = {
    strokes: WhiteboardStroke[];
    past: WhiteboardStroke[][];
    future: WhiteboardStroke[][];
};

export type WhiteboardHistoryAction =
    | { type: 'commit'; strokes: WhiteboardStroke[] }
    | { type: 'undo' }
    | { type: 'redo' }
    | { type: 'reset' };

export const EMPTY_WHITEBOARD_HISTORY: WhiteboardHistory = { strokes: [], past: [], future: [] };
const WHITEBOARD_HISTORY_LIMIT = 60;

export function whiteboardHistoryReducer(
    state: WhiteboardHistory,
    action: WhiteboardHistoryAction,
): WhiteboardHistory {
    if (action.type === 'reset') return EMPTY_WHITEBOARD_HISTORY;
    if (action.type === 'undo') {
        const previous = state.past.at(-1);
        if (!previous) return state;
        return {
            strokes: previous,
            past: state.past.slice(0, -1),
            future: [state.strokes, ...state.future].slice(0, WHITEBOARD_HISTORY_LIMIT),
        };
    }
    if (action.type === 'redo') {
        const next = state.future[0];
        if (!next) return state;
        return {
            strokes: next,
            past: [...state.past, state.strokes].slice(-WHITEBOARD_HISTORY_LIMIT),
            future: state.future.slice(1),
        };
    }
    if (action.strokes === state.strokes) return state;
    return {
        strokes: action.strokes,
        past: [...state.past, state.strokes].slice(-WHITEBOARD_HISTORY_LIMIT),
        future: [],
    };
}

function pointToSegmentDistanceSquared(
    point: WhiteboardPoint,
    start: WhiteboardPoint,
    end: WhiteboardPoint,
): number {
    const segmentX = end.x - start.x;
    const segmentY = end.y - start.y;
    const lengthSquared = segmentX * segmentX + segmentY * segmentY;
    if (lengthSquared === 0) {
        const dx = point.x - start.x;
        const dy = point.y - start.y;
        return dx * dx + dy * dy;
    }

    const projection = Math.max(0, Math.min(1,
        ((point.x - start.x) * segmentX + (point.y - start.y) * segmentY) / lengthSquared,
    ));
    const closestX = start.x + projection * segmentX;
    const closestY = start.y + projection * segmentY;
    const dx = point.x - closestX;
    const dy = point.y - closestY;
    return dx * dx + dy * dy;
}

function orientation(a: WhiteboardPoint, b: WhiteboardPoint, c: WhiteboardPoint): number {
    return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function segmentsIntersect(
    a: WhiteboardPoint,
    b: WhiteboardPoint,
    c: WhiteboardPoint,
    d: WhiteboardPoint,
): boolean {
    const abC = orientation(a, b, c);
    const abD = orientation(a, b, d);
    const cdA = orientation(c, d, a);
    const cdB = orientation(c, d, b);
    return ((abC <= 0 && abD >= 0) || (abC >= 0 && abD <= 0))
        && ((cdA <= 0 && cdB >= 0) || (cdA >= 0 && cdB <= 0));
}

function segmentDistanceSquared(
    a: WhiteboardPoint,
    b: WhiteboardPoint,
    c: WhiteboardPoint,
    d: WhiteboardPoint,
): number {
    if (segmentsIntersect(a, b, c, d)) return 0;
    return Math.min(
        pointToSegmentDistanceSquared(a, c, d),
        pointToSegmentDistanceSquared(b, c, d),
        pointToSegmentDistanceSquared(c, a, b),
        pointToSegmentDistanceSquared(d, a, b),
    );
}

/** True when an eraser trail crosses or comes within `radius` of any part of a stroke. */
export function strokeHitByEraser(
    stroke: WhiteboardStroke,
    eraserPoints: WhiteboardPoint[],
    radius: number,
): boolean {
    if (stroke.points.length === 0 || eraserPoints.length === 0) return false;
    const threshold = radius * radius;

    if (stroke.points.length === 1) {
        if (eraserPoints.length === 1) {
            const dx = stroke.points[0].x - eraserPoints[0].x;
            const dy = stroke.points[0].y - eraserPoints[0].y;
            return dx * dx + dy * dy <= threshold;
        }
        for (let index = 1; index < eraserPoints.length; index++) {
            if (pointToSegmentDistanceSquared(stroke.points[0], eraserPoints[index - 1], eraserPoints[index]) <= threshold) return true;
        }
        return false;
    }

    if (eraserPoints.length === 1) {
        for (let index = 1; index < stroke.points.length; index++) {
            if (pointToSegmentDistanceSquared(eraserPoints[0], stroke.points[index - 1], stroke.points[index]) <= threshold) return true;
        }
        return false;
    }

    for (let strokeIndex = 1; strokeIndex < stroke.points.length; strokeIndex++) {
        for (let eraserIndex = 1; eraserIndex < eraserPoints.length; eraserIndex++) {
            if (segmentDistanceSquared(
                stroke.points[strokeIndex - 1],
                stroke.points[strokeIndex],
                eraserPoints[eraserIndex - 1],
                eraserPoints[eraserIndex],
            ) <= threshold) return true;
        }
    }
    return false;
}

/** Smooth a raw pointer trail with midpoint quadratic curves. */
export function toSmoothWhiteboardPath(points: WhiteboardPoint[]): string {
    if (points.length === 0) return '';
    const first = points[0];
    if (points.length === 1) {
        return `M${first.x.toFixed(1)},${first.y.toFixed(1)} L${(first.x + 0.01).toFixed(1)},${first.y.toFixed(1)}`;
    }
    let path = `M${first.x.toFixed(1)},${first.y.toFixed(1)}`;
    for (let index = 1; index < points.length - 1; index++) {
        const midpointX = (points[index].x + points[index + 1].x) / 2;
        const midpointY = (points[index].y + points[index + 1].y) / 2;
        path += ` Q${points[index].x.toFixed(1)},${points[index].y.toFixed(1)} ${midpointX.toFixed(1)},${midpointY.toFixed(1)}`;
    }
    const last = points[points.length - 1];
    path += ` L${last.x.toFixed(1)},${last.y.toFixed(1)}`;
    return path;
}
