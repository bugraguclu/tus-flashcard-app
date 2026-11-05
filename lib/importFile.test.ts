import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
    ALL_IMPORT_EXTENSIONS,
    ALL_IMPORT_MIME_TYPES,
    getImportFileExtension,
    getImportPickerTypes,
    importFileNameFromUri,
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

    it('never enables all files in the native import picker', () => {
        const types = getImportPickerTypes('ios');
        expect(types).toEqual(ALL_IMPORT_MIME_TYPES);
        expect(types.length).toBeGreaterThan(0);
        expect(types.every((type) => !type.includes('*'))).toBe(true);
        expect(types).not.toContain('application/octet-stream');
        expect(types).toEqual(expect.arrayContaining(['text/plain', 'text/csv', 'text/tab-separated-values', 'application/zip']));
    });

    it('keeps Anki packages selectable without enabling unrelated files on iOS', () => {
        const app = JSON.parse(fs.readFileSync(new URL('../app.json', import.meta.url), 'utf8')).expo;
        for (const extension of ['apkg', 'colpkg']) {
            const declaration = app.ios.infoPlist.UTImportedTypeDeclarations.find(
                (entry: { UTTypeIdentifier: string }) => entry.UTTypeIdentifier === `com.tusankim.${extension}`,
            );
            expect(declaration.UTTypeTagSpecification['public.filename-extension']).toContain(extension);
            const mimeTypes = declaration.UTTypeTagSpecification['public.mime-type'];
            expect(mimeTypes).toEqual([`application/vnd.tusankim.${extension}`]);
            expect(ALL_IMPORT_MIME_TYPES).toEqual(expect.arrayContaining(mimeTypes));
        }
    });

    it('uses filename extensions on web so packages with no MIME type stay selectable', () => {
        expect(getImportPickerTypes('web')).toEqual(['.csv', '.tsv', '.txt', '.apkg', '.zip', '.colpkg']);
    });

    it.each(['pdf', 'png', 'jpg', 'docx', 'json', 'epub'])(
        'rejects an unrelated .%s file even when handed over outside the picker',
        (extension) => expect(inferImportFileType(`file:///Inbox/document.${extension}`)).toBeUndefined(),
    );

    it('separates package importers from text importers', () => {
        expect(isPackageImport('apkg')).toBe(true);
        expect(isPackageImport('colpkg')).toBe(true);
        expect(isPackageImport('csv')).toBe(false);
    });
});
