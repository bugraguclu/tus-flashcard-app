import { describe, expect, it } from 'vitest';
import { parseExternalAppUrl, safeExternalCallbackUrl } from './externalLinking';

describe('TusAnkiM x-callback URLs', () => {
    it('parses an add-note request with named fields and tags', () => {
        expect(parseExternalAppUrl(
            'tusankim://x-callback-url/addnote?type=Basic&deck=TUS%3A%3ADahiliye&fldFront=Kalp&fldBack=Heart&tags=kardiyo%20marked',
        )).toEqual({
            kind: 'addnote',
            noteTypeName: 'Basic',
            deckName: 'TUS::Dahiliye',
            fields: { Front: 'Kalp', Back: 'Heart' },
            tags: ['kardiyo', 'marked'],
            allowDuplicates: false,
            successUrl: null,
        });
    });

    it('parses browser search and rejects unrelated or incomplete URLs', () => {
        expect(parseExternalAppUrl('tusankim://x-callback-url/search?query=tag%3Amarked')).toEqual({
            kind: 'search',
            query: 'tag:marked',
        });
        expect(parseExternalAppUrl('https://example.com')).toBeNull();
        expect(parseExternalAppUrl('tusankim://x-callback-url/addnote?type=Basic')).toBeNull();
    });

    it('allows only credential-free HTTPS and iOS Shortcuts callback targets', () => {
        expect(safeExternalCallbackUrl('https://example.com/done')).toBe('https://example.com/done');
        expect(safeExternalCallbackUrl('shortcuts://x-callback-url/run-shortcut?name=Done'))
            .toBe('shortcuts://x-callback-url/run-shortcut?name=Done');

        for (const value of [
            'http://example.com/done',
            'https://user:secret@example.com/done',
            'javascript:alert(1)',
            'data:text/html,hello',
            'file:///private/var/mobile/secret',
            'tusankim://x-callback-url/search?query=loop',
            '//example.com/done',
        ]) {
            expect(safeExternalCallbackUrl(value)).toBeNull();
        }
    });
});
