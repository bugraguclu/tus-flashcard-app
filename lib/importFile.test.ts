import { describe, expect, it } from 'vitest';
import { getImportFileExtension, importFileNameFromUri, inferImportFileType } from './importFile';

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
});
