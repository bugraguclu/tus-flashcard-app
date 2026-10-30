import { describe, expect, it } from 'vitest';

import {
    PHOTO_CROP_ASPECTS,
    dragPhotoCrop,
    photoCropAspectRatio,
    photoCropForAspect,
    photoCropHandleAt,
    turnedPhotoCropAspect,
} from './photoCrop';
import type { PhotoCropRect } from './photoEditor';

const canvas = { width: 400, height: 300 };
const frame: PhotoCropRect = { x: 0.25, y: 0.2, width: 0.5, height: 0.6 }; // 100,60 → 300,240

const pixels = (crop: PhotoCropRect) => ({
    left: crop.x * canvas.width,
    top: crop.y * canvas.height,
    width: crop.width * canvas.width,
    height: crop.height * canvas.height,
});

describe('taking hold of the crop frame', () => {
    it('finds the corner, the edge or the inside under a finger', () => {
        expect(photoCropHandleAt({ x: 104, y: 58 }, frame, canvas)).toBe('tl');
        expect(photoCropHandleAt({ x: 290, y: 245 }, frame, canvas)).toBe('br');
        expect(photoCropHandleAt({ x: 200, y: 64 }, frame, canvas)).toBe('t');
        expect(photoCropHandleAt({ x: 96, y: 150 }, frame, canvas)).toBe('l');
        expect(photoCropHandleAt({ x: 200, y: 150 }, frame, canvas)).toBe('move');
    });

    it('lets a finger just outside the frame take its edge, and ignores one far away', () => {
        expect(photoCropHandleAt({ x: 320, y: 150 }, frame, canvas)).toBe('r');
        expect(photoCropHandleAt({ x: 20, y: 20 }, frame, canvas)).toBeNull();
    });

    it('keeps the middle of a small frame free for moving it', () => {
        const small: PhotoCropRect = { x: 0.5, y: 0.5, width: 0.1, height: 0.1 }; // 40×30 points
        expect(photoCropHandleAt({ x: 220, y: 165 }, small, canvas)).toBe('move');
        expect(photoCropHandleAt({ x: 201, y: 151 }, small, canvas)).toBe('tl');
    });
});

describe('dragging a free frame', () => {
    it('moves only the edges the handle holds', () => {
        const next = pixels(dragPhotoCrop({ start: frame, handle: 'br', delta: { x: 40, y: 20 }, aspect: null, canvas }));
        expect(next.left).toBeCloseTo(100);
        expect(next.top).toBeCloseTo(60);
        expect(next.width).toBeCloseTo(240);
        expect(next.height).toBeCloseTo(200);
    });

    it('stops at the photo edge and at the smallest frame', () => {
        const pastEdge = pixels(dragPhotoCrop({ start: frame, handle: 'l', delta: { x: -500, y: 0 }, aspect: null, canvas }));
        expect(pastEdge.left).toBeCloseTo(0);
        expect(pastEdge.width).toBeCloseTo(300);
        const crushed = pixels(dragPhotoCrop({ start: frame, handle: 't', delta: { x: 0, y: 900 }, aspect: null, canvas, minEdge: 36 }));
        expect(crushed.height).toBeCloseTo(36);
        expect(crushed.top + crushed.height).toBeCloseTo(240);
    });

    it('moves the whole frame without letting it leave the photo', () => {
        const moved = pixels(dragPhotoCrop({ start: frame, handle: 'move', delta: { x: 500, y: -20 }, aspect: null, canvas }));
        expect(moved.width).toBeCloseTo(200);
        expect(moved.height).toBeCloseTo(180);
        expect(moved.left + moved.width).toBeCloseTo(400);
        expect(moved.top).toBeCloseTo(40);
    });
});

describe('dragging a locked frame', () => {
    const square: PhotoCropRect = { x: 0.25, y: 0.2, width: 0.375, height: 0.5 }; // 100,60, 150×150

    it('keeps the shape when a corner is pulled, following the larger movement', () => {
        const next = pixels(dragPhotoCrop({ start: square, handle: 'br', delta: { x: 60, y: 10 }, aspect: 1, canvas }));
        expect(next.width).toBeCloseTo(next.height);
        expect(next.width).toBeCloseTo(210);
        expect(next.left).toBeCloseTo(100);
        expect(next.top).toBeCloseTo(60);
    });

    it('shrinks from the corner along the axis that moved further', () => {
        const next = pixels(dragPhotoCrop({ start: square, handle: 'tl', delta: { x: 4, y: 50 }, aspect: 1, canvas }));
        expect(next.width).toBeCloseTo(100);
        expect(next.left + next.width).toBeCloseTo(250);
        expect(next.top + next.height).toBeCloseTo(210);
    });

    it('stops a growing locked frame at whichever photo edge it reaches first', () => {
        const next = pixels(dragPhotoCrop({ start: square, handle: 'br', delta: { x: 400, y: 400 }, aspect: 1, canvas }));
        expect(next.width).toBeCloseTo(240);
        expect(next.height).toBeCloseTo(240);
        expect(next.top + next.height).toBeLessThanOrEqual(300.0001);
    });

    it('grows about its middle when an edge is pulled, and stays on the photo', () => {
        const next = pixels(dragPhotoCrop({ start: square, handle: 'r', delta: { x: 100, y: 0 }, aspect: 1, canvas }));
        expect(next.width).toBeCloseTo(250);
        expect(next.height).toBeCloseTo(250);
        expect(next.left).toBeCloseTo(100);
        expect(next.top).toBeGreaterThanOrEqual(0);
        expect(next.top + next.height).toBeLessThanOrEqual(300.0001);
    });
});

describe('frame shapes', () => {
    it('reshapes the whole photo to the largest centred square', () => {
        const next = pixels(photoCropForAspect({ x: 0, y: 0, width: 1, height: 1 }, 1, canvas));
        expect(next.width).toBeCloseTo(300);
        expect(next.height).toBeCloseTo(300);
        expect(next.left).toBeCloseTo(50);
    });

    it('keeps the area and the middle of a smaller frame', () => {
        const next = pixels(photoCropForAspect(frame, 16 / 9, canvas));
        expect(next.width * next.height).toBeCloseTo(200 * 180);
        expect(next.width / next.height).toBeCloseTo(16 / 9);
        expect(next.left + next.width / 2).toBeCloseTo(200);
        expect(next.top + next.height / 2).toBeCloseTo(150);
    });

    it('leaves a free frame alone', () => {
        expect(photoCropForAspect(frame, null, canvas)).toBe(frame);
    });

    it('measures the ratios and turns them with the photo', () => {
        expect(photoCropAspectRatio('free', canvas)).toBeNull();
        expect(photoCropAspectRatio('original', canvas)).toBeCloseTo(4 / 3);
        expect(photoCropAspectRatio('9:16', canvas)).toBeCloseTo(9 / 16);
        expect(PHOTO_CROP_ASPECTS.map(turnedPhotoCropAspect)).toEqual(['free', 'original', 'square', '3:4', '4:3', '9:16', '16:9']);
    });
});
