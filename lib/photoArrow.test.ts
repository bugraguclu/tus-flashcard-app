import { describe, expect, it } from 'vitest';
import { photoArrowGeometry } from './photoArrow';

describe('arrow silhouette', () => {
    it.each([2.5, 4.5, 8])('keeps the round shaft cap inside the head at width %s in every direction', (strokeWidth) => {
        for (let degrees = 0; degrees < 360; degrees += 15) {
            const angle = degrees * Math.PI / 180;
            const ux = Math.cos(angle);
            const uy = Math.sin(angle);
            const start = { x: 0.5, y: 0.5 };
            const end = { x: 0.5 + ux * 0.3, y: 0.5 + uy * 0.4 };
            const { head, shaftEnd } = photoArrowGeometry(start, end, 400, 300, 12 + strokeWidth * 1.5);
            expect(shaftEnd).not.toBeNull();
            const depth = (head[0].x - shaftEnd!.x) * ux + (head[0].y - shaftEnd!.y) * uy;
            // The cap stays behind the tip and fits entirely between the head's sides.
            expect(depth).toBeGreaterThan(strokeWidth / 2);
            expect(depth * Math.sin(Math.PI / 6)).toBeGreaterThan(strokeWidth / 2);
            expect((shaftEnd!.x - 200) * uy - (shaftEnd!.y - 150) * ux).toBeCloseTo(0);
        }
    });

    it('scales the same silhouette for a full-resolution PNG', () => {
        const start = { x: 0.1, y: 0.8 };
        const end = { x: 0.8, y: 0.2 };
        const live = photoArrowGeometry(start, end, 400, 300, 24);
        const png = photoArrowGeometry(start, end, 1600, 1200, 96);
        expect(png.shaftEnd!.x).toBeCloseTo(live.shaftEnd!.x * 4);
        expect(png.shaftEnd!.y).toBeCloseTo(live.shaftEnd!.y * 4);
        live.head.forEach((point, i) => {
            expect(png.head[i].x).toBeCloseTo(point.x * 4);
            expect(png.head[i].y).toBeCloseTo(point.y * 4);
        });
    });

    it('omits the shaft when the head covers a short drag', () => {
        expect(photoArrowGeometry({ x: 0, y: 0 }, { x: 0.015, y: 0 }, 400, 300, 24).shaftEnd).toBeNull();
    });
});
