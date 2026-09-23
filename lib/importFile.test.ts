import { describe, expect, it } from 'vitest';
import {
    ALL_IMPORT_EXTENSIONS,
    ALL_IMPORT_MIME_TYPES,
    getImportFileExtension,
    importFileNameFromUri,
    importFormatLabel,
    inferImportFileType,
    isPackageImport,
} from './importFile';

describe('incoming import files', () => {
    it('recognizes Anki packages and delimited text case-insensitively', () => {
        expect(inferImportFileType('file:///Inbox/Cardiology.APKG')).toBe('apkg');
        expect(inferImportFileType('file:///Inbox/collection.colpkg')).toBe('colpkg');
        expect(inferImportFileType('file:///Inbox/notes.CSV')).toBe('csv');
        expect(inferImportFileType('file:///Inbox/notes.tsv')).toBe('tsv');
        expect(inferImportFileType('file:///Inbox/notes.txt')).toBe('txt');
    });

    it('ignores URL query and fragment data', () => {
        expect(getImportFileExtension('content://provider/cards.apkg?token=abc#open')).toBe('apkg');
    });

    it('decodes a user-facing filename and rejects unrelated files', () => {
        expect(importFileNameFromUri('file:///Inbox/TUS%20Kardiyoloji.apkg')).toBe('TUS Kardiyoloji.apkg');
        expect(inferImportFileType('file:///Inbox/photo.jpg')).toBeUndefined();
    });

    it('treats a .zip as a package, the way Anki\'s own file dialog does', () => {
        // Browsers and mail clients rename a downloaded .apkg; the archive content still decides.
        expect(inferImportFileType('file:///Downloads/shared-deck.zip')).toBe('apkg');
    });

    it('exposes one combined filter for the file-first picker', () => {
        expect(ALL_IMPORT_EXTENSIONS).toEqual(expect.arrayContaining(['csv', 'tsv', 'txt', 'apkg', 'colpkg', 'zip']));
        expect(new Set(ALL_IMPORT_MIME_TYPES).size).toBe(ALL_IMPORT_MIME_TYPES.length);
        expect(ALL_IMPORT_MIME_TYPES).toContain('text/csv');
    });

    it('separates package importers from text importers', () => {
        expect(isPackageImport('apkg')).toBe(true);
        expect(isPackageImport('colpkg')).toBe(true);
        expect(isPackageImport('csv')).toBe(false);
        expect(importFormatLabel('colpkg')).toBe('.colpkg');
        expect(importFormatLabel('tsv')).toBe('TSV');
    });
});
