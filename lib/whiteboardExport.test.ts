import { describe, expect, it } from 'vitest';
import { whiteboardImageFileName, whiteboardSaveNotice } from './whiteboardExport';

const turkish = (tr: string) => tr;
const english = (_tr: string, en: string) => en;

describe('whiteboard image file name', () => {
    it('stamps the local date and time to the second', () => {
        expect(whiteboardImageFileName(new Date(2026, 9, 30, 20, 34, 12))).toBe('yazi-tahtasi-2026-10-30-203412.png');
    });

    it('pads single-digit parts so names sort in the order they were saved', () => {
        expect(whiteboardImageFileName(new Date(2027, 0, 2, 3, 4, 5))).toBe('yazi-tahtasi-2027-01-02-030405.png');
        const earlier = whiteboardImageFileName(new Date(2026, 8, 9, 9, 59, 59));
        const later = whiteboardImageFileName(new Date(2026, 9, 10, 10, 0, 0));
        expect([later, earlier].sort()).toEqual([earlier, later]);
    });

    it('stays ASCII and free of path separators', () => {
        const name = whiteboardImageFileName(new Date(2026, 11, 31, 23, 59, 59));
        expect(name).toMatch(/^[a-z0-9-]+\.png$/);
    });
});

describe('whiteboard save notice', () => {
    it('says nothing after the share sheet closes or a browser share is cancelled', () => {
        expect(whiteboardSaveNotice('shared', 'a.png', turkish)).toBeNull();
        expect(whiteboardSaveNotice('cancelled', 'a.png', turkish)).toBeNull();
    });

    it('names the downloaded file', () => {
        expect(whiteboardSaveNotice('downloaded', 'yazi-tahtasi-2026-10-30-203412.png', english)).toEqual({
            title: 'Drawing downloaded',
            message: 'Downloaded as yazi-tahtasi-2026-10-30-203412.png.',
        });
        expect(whiteboardSaveNotice('downloaded', 'x.png', turkish)?.message).toContain('x.png');
    });

    it('never claims a save when there is no share sheet, and never mentions the media folder', () => {
        const notice = whiteboardSaveNotice('unavailable', 'x.png', turkish);
        expect(notice?.message).toContain('kaydedilmedi');
        for (const handOff of ['shared', 'downloaded', 'cancelled', 'unavailable'] as const) {
            for (const l of [turkish, english]) {
                const text = JSON.stringify(whiteboardSaveNotice(handOff, 'x.png', l) ?? {});
                expect(text).not.toMatch(/medya|media/i);
            }
        }
    });
});
