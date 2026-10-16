import { describe, expect, it } from 'vitest';
import { chartPressPoint } from './chartPressPoint';

describe('chartPressPoint', () => {
    it('keeps native chart coordinates, including an edge at zero', () => {
        expect(chartPressPoint({ locationX: 0, locationY: 42 })).toEqual({ x: 0, y: 42 });
    });

    it('converts a web click to chart coordinates even when a child SVG bar is the target', () => {
        // RN Web onPress passes a MouseEvent, which has no locationX/locationY.
        expect(chartPressPoint({ clientX: 184, clientY: 620 }, { left: 20, top: 580 }))
            .toEqual({ x: 164, y: 40 });
    });

    it('ignores keyboard clicks or invalid positions instead of selecting a NaN bucket', () => {
        expect(chartPressPoint({})).toBeNull();
        expect(chartPressPoint({ locationX: NaN, locationY: 20 })).toBeNull();
        expect(chartPressPoint({ clientX: 10, clientY: 20 })).toBeNull();
    });
});
