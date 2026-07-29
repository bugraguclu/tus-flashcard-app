import { describe, expect, it } from 'vitest';
import {
    clampPhotoPoint,
    findPhotoAnnotationAtPoint,
    normalizedRect,
    rotatePhotoAnnotationClockwise,
    rotatePhotoPointClockwise,
    type PhotoAnnotation,
} from './photoEditor';

describe('photo editor geometry', () => {
    it('clamps pointer coordinates into the image', () => {
        expect(clampPhotoPoint({ x: -0.2, y: 1.4 })).toEqual({ x: 0, y: 1 });
    });

    it('rotates normalized points and annotations clockwise', () => {
        const rotatedPoint = rotatePhotoPointClockwise({ x: 0.25, y: 0.8 });
        expect(rotatedPoint.x).toBeCloseTo(0.2);
        expect(rotatedPoint.y).toBeCloseTo(0.25);
        const annotation: PhotoAnnotation = {
            id: 'a', type: 'arrow', start: { x: 0, y: 0 }, end: { x: 1, y: 0.5 },
            color: '#fff', width: 4, opacity: 1,
        };
        expect(rotatePhotoAnnotationClockwise(annotation)).toMatchObject({
            start: { x: 1, y: 0 },
            end: { x: 0.5, y: 1 },
        });
    });

    it('normalizes a rectangle drawn in any direction', () => {
        expect(normalizedRect({ x: 0.8, y: 0.7 }, { x: 0.2, y: 0.1 })).toEqual({
            x: 0.2, y: 0.1, width: 0.6000000000000001, height: 0.6,
        });
    });

    it('erases the top-most annotation hit by a tap', () => {
        const annotations: PhotoAnnotation[] = [
            {
                id: 'stroke', type: 'stroke', points: [{ x: 0.1, y: 0.5 }, { x: 0.9, y: 0.5 }],
                color: '#000', width: 4, opacity: 1,
            },
            {
                id: 'text', type: 'text', point: { x: 0.45, y: 0.52 }, text: 'Kalp', fontSize: 20,
                color: '#f00', width: 1, opacity: 1,
            },
        ];
        expect(findPhotoAnnotationAtPoint(annotations, { x: 0.48, y: 0.5 }, 400, 300)).toBe(1);
        expect(findPhotoAnnotationAtPoint(annotations, { x: 0.2, y: 0.5 }, 400, 300)).toBe(0);
        expect(findPhotoAnnotationAtPoint(annotations, { x: 0.1, y: 0.1 }, 400, 300)).toBe(-1);
    });
});
