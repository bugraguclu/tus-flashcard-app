import { describe, expect, it } from 'vitest';
import { assertKnownFileSize, toFileUri } from './files';

describe('picked file size boundary', () => {
    it('rejects known oversized files before reading them', () => {
        expect(() => assertKnownFileSize(1025, 1024)).toThrowError('FILE_TOO_LARGE');
        expect(() => assertKnownFileSize(1024, 1024)).not.toThrow();
        expect(() => assertKnownFileSize(undefined, 1024)).not.toThrow();
    });
});

describe('local file uri normalization', () => {
    it('gives a bare capture path the file scheme so it is not fetched as a relative URL', () => {
        expect(toFileUri('/private/var/tmp/ReactNative/abc.png')).toBe('file:///private/var/tmp/ReactNative/abc.png');
        expect(toFileUri('  /var/tmp/shot.png  ')).toBe('file:///var/tmp/shot.png');
    });

    it('escapes characters a URL would otherwise reinterpret', () => {
        expect(toFileUri('/var/tmp/my drawing.png')).toBe('file:///var/tmp/my%20drawing.png');
        expect(toFileUri('/var/tmp/a#b.png')).toBe('file:///var/tmp/a%23b.png');
    });

    it('leaves anything that already carries a scheme alone', () => {
        expect(toFileUri('file:///var/tmp/a.png')).toBe('file:///var/tmp/a.png');
        expect(toFileUri('content://media/1')).toBe('content://media/1');
        expect(toFileUri('blob:http://localhost/abc')).toBe('blob:http://localhost/abc');
        expect(toFileUri('data:image/png;base64,AAA')).toBe('data:image/png;base64,AAA');
        expect(toFileUri('')).toBe('');
    });
});
