import { describe, expect, it } from 'vitest';
import { assertKnownFileSize } from './files';

describe('picked file size boundary', () => {
    it('rejects known oversized files before reading them', () => {
        expect(() => assertKnownFileSize(1025, 1024)).toThrowError('FILE_TOO_LARGE');
        expect(() => assertKnownFileSize(1024, 1024)).not.toThrow();
        expect(() => assertKnownFileSize(undefined, 1024)).not.toThrow();
    });
});
