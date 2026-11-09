import { describe, expect, it } from 'vitest';
import type { ExternalLinkRejection } from './externalLinking';
import { externalLinkRejectionText } from './externalLinkRejection';

const every: ExternalLinkRejection[] = [
    { reason: 'tooLong' },
    { reason: 'unknownAction', action: 'deletenote' },
    { reason: 'unknownAction', action: '' },
    { reason: 'missingQuery' },
    { reason: 'missingType' },
    { reason: 'missingDeck' },
    { reason: 'missingFields' },
    { reason: 'noteTypeNotFound', noteTypeName: 'Yok' },
    { reason: 'deckNotFound', deckName: 'Dahiliye' },
    { reason: 'filteredDeck', deckName: 'Tekrar' },
    { reason: 'catalogDeck', deckName: 'TUS Kartları' },
    { reason: 'noMatchingFields', noteTypeName: 'Basic', fieldNames: ['Front', 'Back'] },
];

describe('externalLinkRejectionText', () => {
    it('says why in both languages, for every reason', () => {
        for (const rejection of every) {
            for (const locale of ['tr', 'en'] as const) {
                const { title, message } = externalLinkRejectionText(locale, rejection);
                expect(title).toBe(locale === 'tr' ? 'Bağlantı açılamadı' : 'Couldn’t open the link');
                expect(message.length).toBeGreaterThan(10);
            }
        }
    });

    it('names what the link asked for, and the fields the note type has', () => {
        expect(externalLinkRejectionText('tr', { reason: 'deckNotFound', deckName: 'Dahiliye' }).message).toContain('“Dahiliye” destesi bulunamadı');
        expect(externalLinkRejectionText('en', { reason: 'unknownAction', action: 'deletenote' }).message).toContain('“deletenote”');
        const fields = externalLinkRejectionText('tr', { reason: 'noMatchingFields', noteTypeName: 'Basic', fieldNames: ['Front', 'Back'] }).message;
        expect(fields).toContain('Front (Ön), Back (Arka)');
        expect(fields).toContain('fldFront');
        expect(externalLinkRejectionText('en', { reason: 'noMatchingFields', noteTypeName: 'Basic', fieldNames: ['Front', 'Back'] }).message).toContain('Its fields are: Front, Back.');
    });
});
