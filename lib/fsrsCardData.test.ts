import { describe, expect, it } from 'vitest';
import {
    memoryStateFromCardData,
    parseAnkiCardData,
    serializeAnkiCardData,
    withFsrsMemoryState,
} from './fsrsCardData';

describe('Anki card data column', () => {
    it('reads Anki’s short keys', () => {
        const data = parseAnkiCardData('{"pos":12,"s":31.7,"d":7.38,"dr":0.9,"decay":0.1542,"lrt":1700000000,"cd":"{\\"v\\":1}"}');
        expect(data).toEqual({
            originalPosition: 12,
            stability: 31.7,
            difficulty: 7.38,
            desiredRetention: 0.9,
            decay: 0.1542,
            lastReviewTimeSecs: 1700000000,
            customData: '{"v":1}',
        });
    });

    it('treats an empty or unusable blob as no data', () => {
        expect(parseAnkiCardData(undefined)).toEqual({});
        expect(parseAnkiCardData('')).toEqual({});
        expect(parseAnkiCardData('not json')).toEqual({});
        expect(parseAnkiCardData('[1,2]')).toEqual({});
        expect(parseAnkiCardData('{"s":"abc"}').stability).toBeUndefined();
    });

    it('keeps keys it does not model, so a foreign collection survives a round trip', () => {
        const raw = '{"s":10,"d":5,"someAddon":{"keep":true}}';
        const written = serializeAnkiCardData(parseAnkiCardData(raw), raw);
        expect(JSON.parse(written!)).toEqual({ someAddon: { keep: true }, s: 10, d: 5 });
    });

    it('omits absent values and returns nothing for an empty record', () => {
        expect(serializeAnkiCardData({})).toBeUndefined();
        expect(serializeAnkiCardData({ stability: 4 })).toBe('{"s":4}');
        expect(serializeAnkiCardData({ stability: Number.NaN })).toBeUndefined();
    });

    it('exposes a memory state only when both halves are present', () => {
        expect(memoryStateFromCardData({ stability: 10, difficulty: 5 })).toEqual({ stability: 10, difficulty: 5 });
        expect(memoryStateFromCardData({ stability: 10 })).toBeNull();
        expect(memoryStateFromCardData({ stability: 0, difficulty: 5 })).toBeNull();
        expect(memoryStateFromCardData({})).toBeNull();
    });

    it('writes and clears the memory state without disturbing other keys', () => {
        const withState = withFsrsMemoryState('{"pos":3}', { stability: 12.5, difficulty: 6 }, 0.9, 0.1542);
        expect(JSON.parse(withState!)).toEqual({ pos: 3, s: 12.5, d: 6, dr: 0.9, decay: 0.1542 });

        const cleared = withFsrsMemoryState(withState, null, undefined, undefined);
        expect(JSON.parse(cleared!)).toEqual({ pos: 3 });
        expect(withFsrsMemoryState('{"s":1,"d":2}', null, undefined, undefined)).toBeUndefined();
    });
});
