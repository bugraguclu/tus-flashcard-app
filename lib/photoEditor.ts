export type PhotoPoint = { x: number; y: number };

type AnnotationBase = {
    id: string;
    color: string;
    width: number;
    opacity: number;
};

export type PhotoStroke = AnnotationBase & {
    type: 'stroke';
    points: PhotoPoint[];
};

export type PhotoShape = AnnotationBase & {
    type: 'arrow' | 'rect' | 'ellipse' | 'cover';
    start: PhotoPoint;
    end: PhotoPoint;
};

export type PhotoText = AnnotationBase & {
    type: 'text';
    point: PhotoPoint;
    text: string;
    fontSize: number;
};

export type PhotoAnnotation = PhotoStroke | PhotoShape | PhotoText;

export function clampPhotoPoint(point: PhotoPoint): PhotoPoint {
    return {
        x: Math.min(1, Math.max(0, point.x)),
        y: Math.min(1, Math.max(0, point.y)),
    };
}

/** Rotate a normalized point 90 degrees clockwise together with its source image. */
export function rotatePhotoPointClockwise(point: PhotoPoint): PhotoPoint {
    return { x: 1 - point.y, y: point.x };
}

/** Keep annotations attached to the same image feature after a 90-degree rotation. */
export function rotatePhotoAnnotationClockwise(annotation: PhotoAnnotation): PhotoAnnotation {
    if (annotation.type === 'stroke') {
        return { ...annotation, points: annotation.points.map(rotatePhotoPointClockwise) };
    }
    if (annotation.type === 'text') {
        return { ...annotation, point: rotatePhotoPointClockwise(annotation.point) };
    }
    return {
        ...annotation,
        start: rotatePhotoPointClockwise(annotation.start),
        end: rotatePhotoPointClockwise(annotation.end),
    };
}

export function normalizedRect(start: PhotoPoint, end: PhotoPoint) {
    return {
        x: Math.min(start.x, end.x),
        y: Math.min(start.y, end.y),
        width: Math.abs(end.x - start.x),
        height: Math.abs(end.y - start.y),
    };
}

function pointDistance(a: PhotoPoint, b: PhotoPoint, width: number, height: number): number {
    return Math.hypot((a.x - b.x) * width, (a.y - b.y) * height);
}

function distanceToSegment(
    point: PhotoPoint,
    start: PhotoPoint,
    end: PhotoPoint,
    width: number,
    height: number,
): number {
    const px = point.x * width;
    const py = point.y * height;
    const x1 = start.x * width;
    const y1 = start.y * height;
    const x2 = end.x * width;
    const y2 = end.y * height;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lengthSquared = dx * dx + dy * dy;
    if (lengthSquared === 0) return Math.hypot(px - x1, py - y1);
    const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lengthSquared));
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

/**
 * Find the visually top-most annotation near a tap. Used by the eraser tool; the
 * tolerance is expressed in display pixels so it behaves consistently on phone/iPad.
 */
export function findPhotoAnnotationAtPoint(
    annotations: PhotoAnnotation[],
    point: PhotoPoint,
    width: number,
    height: number,
    tolerance = 24,
): number {
    for (let index = annotations.length - 1; index >= 0; index -= 1) {
        const annotation = annotations[index];
        if (annotation.type === 'text') {
            const textWidth = Math.max(44, annotation.text.length * annotation.fontSize * 0.58);
            const x = annotation.point.x * width;
            const y = annotation.point.y * height;
            const px = point.x * width;
            const py = point.y * height;
            const left = annotation.point.x > 0.65
                ? x - textWidth
                : annotation.point.x < 0.35
                    ? x
                    : x - textWidth / 2;
            if (px >= left - tolerance && px <= left + textWidth + tolerance
                && py >= y - annotation.fontSize - tolerance && py <= y + tolerance) {
                return index;
            }
            continue;
        }

        if (annotation.type === 'stroke') {
            for (let i = 1; i < annotation.points.length; i += 1) {
                if (distanceToSegment(point, annotation.points[i - 1], annotation.points[i], width, height)
                    <= tolerance + annotation.width / 2) return index;
            }
            if (annotation.points.length === 1
                && pointDistance(point, annotation.points[0], width, height) <= tolerance) return index;
            continue;
        }

        if (annotation.type === 'arrow') {
            if (distanceToSegment(point, annotation.start, annotation.end, width, height)
                <= tolerance + annotation.width / 2) return index;
            continue;
        }

        const rect = normalizedRect(annotation.start, annotation.end);
        const px = point.x;
        const py = point.y;
        const horizontal = Math.min(Math.abs(px - rect.x), Math.abs(px - (rect.x + rect.width))) * width;
        const vertical = Math.min(Math.abs(py - rect.y), Math.abs(py - (rect.y + rect.height))) * height;
        const insideExpanded = px >= rect.x - tolerance / width
            && px <= rect.x + rect.width + tolerance / width
            && py >= rect.y - tolerance / height
            && py <= rect.y + rect.height + tolerance / height;
        if (insideExpanded && (horizontal <= tolerance || vertical <= tolerance)) return index;
    }
    return -1;
}

export function photoArrowHead(
    start: PhotoPoint,
    end: PhotoPoint,
    width: number,
    height: number,
    size: number,
): [PhotoPoint, PhotoPoint, PhotoPoint] {
    const sx = start.x * width;
    const sy = start.y * height;
    const ex = end.x * width;
    const ey = end.y * height;
    const angle = Math.atan2(ey - sy, ex - sx);
    const wing = Math.PI / 6;
    return [
        { x: ex, y: ey },
        { x: ex - size * Math.cos(angle - wing), y: ey - size * Math.sin(angle - wing) },
        { x: ex - size * Math.cos(angle + wing), y: ey - size * Math.sin(angle + wing) },
    ];
}
