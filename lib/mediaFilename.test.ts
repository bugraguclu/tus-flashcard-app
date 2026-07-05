import { describe, it, expect } from 'vitest';
import { sanitizeMediaFilename } from './mediaFilename';

describe('sanitizeMediaFilename', () => {
    it('keeps a normal filename', () => {
        expect(sanitizeMediaFilename('heart.jpg')).toBe('heart.jpg');
    });

    it('drops directory components (both slash styles)', () => {
        expect(sanitizeMediaFilename('sub/dir/img.png')).toBe('img.png');
        expect(sanitizeMediaFilename('a\\b\\c.png')).toBe('c.png');
    });

    it('blocks path traversal', () => {
        expect(sanitizeMediaFilename('../../etc/passwd')).toBe('passwd');
        expect(sanitizeMediaFilename('..')).toBe('media');
    });

    it('removes control characters', () => {
        const withControls = `evil${String.fromCharCode(0)}${String.fromCharCode(31)}.png`;
        expect(sanitizeMediaFilename(withControls)).toBe('evil.png');
    });

    it('falls back for empty or dot-only names', () => {
        expect(sanitizeMediaFilename('')).toBe('media');
        expect(sanitizeMediaFilename('...')).toBe('media');
    });
});
