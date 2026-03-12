import { describe, expect, it } from 'vitest';
import type { Note, NoteType } from './models';
import { BUILTIN_NOTE_TYPES } from './models';
import { renderCardHtml, renderTemplate } from './templates';

describe('templates', () => {
    it('renders nested positive/negative conditionals correctly', () => {
        const template = '{{#A}}A{{#B}}B{{/B}}{{^B}}NB{{/B}}{{/A}}{{^A}}NA{{/A}}';

        expect(renderTemplate(template, { fields: { A: '1', B: 'x' } })).toBe('AB');
        expect(renderTemplate(template, { fields: { A: '1', B: '' } })).toBe('ANB');
        expect(renderTemplate(template, { fields: { A: '', B: 'x' } })).toBe('NA');
    });

    it('sanitizes svg/event-handler/javascript/data-uri vectors while preserving safe html', () => {
        const basic = BUILTIN_NOTE_TYPES.find((nt) => nt.id === 1)!;
        const note: Note = {
            id: 1,
            guid: 'abc',
            noteTypeId: basic.id,
            mod: 0,
            usn: -1,
            tags: [],
            fields: [
                '<b>safe</b> <svg onload="alert(1)"><script>alert(1)</script></svg> <img src="data:image/svg+xml;base64,PHN2Zy8+" onerror="alert(1)" /> <a href="javascript:alert(1)">x</a> <img src="data:image/png;base64,AAAA" />',
                'back',
            ],
            sfld: 'safe',
            csum: 0,
            flags: 0,
        };

        const html = renderCardHtml(basic as NoteType, note, 0, 'question');

        expect(html).toContain('<b>safe</b>');
        expect(html).toContain('data:image/png;base64,AAAA');

        expect(html.toLowerCase()).not.toContain('<script');
        expect(html.toLowerCase()).not.toContain('<svg');
        expect(html.toLowerCase()).not.toContain('onerror=');
        expect(html.toLowerCase()).not.toContain('onload=');
        expect(html.toLowerCase()).not.toContain('javascript:');
        expect(html.toLowerCase()).not.toContain('data:image/svg+xml');
    });
});
