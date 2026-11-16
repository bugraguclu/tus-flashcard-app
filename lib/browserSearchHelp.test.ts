import { expect, it } from 'vitest';
import { isValidSearchQuery } from './searchValidation';
import { literalSearchNameTerm } from './searchQuery';
import { appendBrowserSearchTerm, buildSearchHelpGroups } from '../components/browser/searchHelpGroups';

it('narrows every alternative when adding a help filter', () => {
    expect(appendBrowserSearchTerm('kalp or böbrek', 'is:new')).toBe('(kalp or böbrek) is:new');
    expect(appendBrowserSearchTerm('(kalp or böbrek) tag:tus', 'is:new')).toBe('(kalp or böbrek) tag:tus is:new');
    expect(appendBrowserSearchTerm('"kalp or böbrek"', 'is:new')).toBe('"kalp or böbrek" is:new');
    expect(appendBrowserSearchTerm('', 'tag:none')).toBe('tag:none');
});

it('supplies complete, literal scope names and keeps all help entries valid', () => {
    expect(literalSearchNameTerm('deck:', 'Tıp::Kadın Doğum')).toBe('deck:"Tıp::Kadın Doğum"');
    expect(literalSearchNameTerm('tag:', 'anatomi_1')).toBe('tag:anatomi\\_1');
    expect(literalSearchNameTerm('tag:', 'none')).toBe('tag:None');
    expect(literalSearchNameTerm('note:', 'Basic (and reversed card)')).toBe('note:"Basic (and reversed card)"');
    for (const { items } of buildSearchHelpGroups((tr) => tr)) {
        for (const item of items) {
            const complete = item.value ? literalSearchNameTerm(item.term, item.value.example) : item.term;
            expect(isValidSearchQuery(complete), complete).toBe(true);
        }
    }
});
