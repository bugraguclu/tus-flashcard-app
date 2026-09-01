import { beforeEach, describe, expect, it } from 'vitest';
import { setActiveLocale } from './i18n';
import { isTechnicalErrorMessage, userFacingErrorMessage } from './userFacingError';

describe('user-facing error boundary', () => {
    beforeEach(() => setActiveLocale('tr'));

    it('replaces Metro split-bundle HTML responses with a concise localized message', () => {
        const metroResponse = `Failed to load split bundle from URL:
http://192.168.1.103:8081/node_modules/jszip/dist/jszip.min.bundle?platform=ios
<!DOCTYPE HTML><html><body><h1>Error response</h1><p>Error code: 404</p></body></html>`;

        expect(isTechnicalErrorMessage(metroResponse)).toBe(true);
        expect(userFacingErrorMessage(metroResponse)).toBe(
            'İşlem tamamlanamadı. Lütfen tekrar deneyin.',
        );
    });

    it('hides stack traces, database codes and runtime exception names', () => {
        expect(userFacingErrorMessage(new Error('SQLITE_CONSTRAINT_UNIQUE: notes.guid')))
            .toBe('İşlem tamamlanamadı. Lütfen tekrar deneyin.');
        expect(userFacingErrorMessage('TypeError: undefined is not an object'))
            .toBe('İşlem tamamlanamadı. Lütfen tekrar deneyin.');
        expect(userFacingErrorMessage('SQLite migration v4 failed'))
            .toBe('İşlem tamamlanamadı. Lütfen tekrar deneyin.');
        expect(userFacingErrorMessage('Network request failed'))
            .toBe('İşlem tamamlanamadı. Lütfen tekrar deneyin.');
        expect(userFacingErrorMessage('Error\n    at saveCard (/app/editor.tsx:12:4)'))
            .toBe('İşlem tamamlanamadı. Lütfen tekrar deneyin.');
        expect(userFacingErrorMessage(
            'Element type is invalid: expected a string (for built-in components) or a class/function (for composite components) but got: object. Check the render method of `EditorScreen`.',
        )).toBe('İşlem tamamlanamadı. Lütfen tekrar deneyin.');
        expect(userFacingErrorMessage('Objects are not valid as a React child (found: object with keys {id, name}).'))
            .toBe('İşlem tamamlanamadı. Lütfen tekrar deneyin.');
        expect(userFacingErrorMessage('Rendered fewer hooks than during the previous render.'))
            .toBe('İşlem tamamlanamadı. Lütfen tekrar deneyin.');
    });

    it('preserves short domain and validation messages', () => {
        expect(userFacingErrorMessage('Bu adda bir deste zaten var.'))
            .toBe('Bu adda bir deste zaten var.');
        expect(userFacingErrorMessage('Dosya çok büyük (en fazla 200 MB).'))
            .toBe('Dosya çok büyük (en fazla 200 MB).');
    });

    it('uses a caller-provided contextual fallback', () => {
        expect(userFacingErrorMessage('<html>404</html>', 'Dışa aktarma tamamlanamadı.'))
            .toBe('Dışa aktarma tamamlanamadı.');
    });
});
