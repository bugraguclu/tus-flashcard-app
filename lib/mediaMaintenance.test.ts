import { describe, expect, it, vi } from 'vitest';

const holder = vi.hoisted(() => ({
    notes: [] as { fields: string[] }[],
    noteTypes: [] as { css: string; templates: { qfmt: string; afmt: string }[] }[],
    stored: [] as string[],
}));

vi.mock('./noteManager', () => ({
    getAllNotes: () => holder.notes,
    getAllNoteTypes: () => holder.noteTypes,
}));
vi.mock('./mediaStore', () => ({
    listStoredMediaFilenames: async () => holder.stored,
}));

import { auditMediaFilenames, checkMedia, extractNoteMediaReferences } from './mediaMaintenance';


describe('media maintenance', () => {
    it('extracts local Anki media references and ignores remote/data URLs', () => {
        expect(extractNoteMediaReferences([
            '<img src="kalp.png"><audio src="ses.mp3"></audio>[sound:tekrar.wav]',
            '<a href="ek.pdf">ek</a><img src="https://example.com/x.png"><img src="data:image/png;base64,AAAA">',
        ])).toEqual(new Set(['kalp.png', 'ses.mp3', 'tekrar.wav', 'ek.pdf']));
    });

    it('reports missing and unused files without deleting either side', () => {
        expect(auditMediaFilenames(
            new Set(['used.png', 'missing.mp3']),
            ['used.png', 'unused.jpg'],
        )).toEqual({ missing: ['missing.mp3'], unused: ['unused.jpg'], referenced: 2, stored: 2 });
    });
});

describe('checkMedia', () => {
    it('counts a file a note type refers to as referenced, not unused', async () => {
        // The audit read only note fields, so a background image named in a note type's CSS —
        // or a logo in its template — was reported as unused: the one answer that can lead a
        // learner to throw away a file that is on every one of their cards.
        holder.notes = [{ fields: ['<img src="kalp.png">', ''] }];
        holder.noteTypes = [{
            css: '.card { background: url(zemin.png); }',
            templates: [{ qfmt: '{{Front}}<img src="logo.png">', afmt: '{{Back}}' }],
        }];
        holder.stored = ['kalp.png', 'zemin.png', 'logo.png', 'gercekten-kullanilmayan.png'];

        const result = await checkMedia();
        expect(result.unused).toEqual(['gercekten-kullanilmayan.png']);
        expect(result.missing).toEqual([]);
        expect(result.referenced).toBe(3);
    });
});
