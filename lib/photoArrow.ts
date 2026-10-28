import { photoArrowHead, type PhotoPoint } from './photoEditor';

/** Shared by the live SVG, native PNG surface and browser PNG export. */
export function photoArrowGeometry(
    start: PhotoPoint,
    end: PhotoPoint,
    width: number,
    height: number,
    headSize: number,
) {
    const head = photoArrowHead(start, end, width, height, headSize);
    const shaftEnd = {
        x: (head[1].x + head[2].x) / 2,
        y: (head[1].y + head[2].y) / 2,
    };
    // Stop at the head's base: a round cap at the tip protrudes through the triangle.
    // A very short arrow needs only its head, never a backwards shaft or a stray dot.
    const length = Math.hypot((end.x - start.x) * width, (end.y - start.y) * height);
    const headDepth = Math.hypot(end.x * width - shaftEnd.x, end.y * height - shaftEnd.y);
    return { head, shaftEnd: length > headDepth ? shaftEnd : null };
}
