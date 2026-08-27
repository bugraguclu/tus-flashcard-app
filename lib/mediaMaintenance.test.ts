import { describe, expect, it } from 'vitest';
import { auditMediaFilenames, extractNoteMediaReferences } from './mediaMaintenance';

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
