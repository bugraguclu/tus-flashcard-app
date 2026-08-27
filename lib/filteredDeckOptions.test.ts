import { describe, expect, it } from 'vitest';
import { filteredOrderLabel } from './i18n';
import { FILTERED_DECK_ORDER_UI } from './filteredDeckOptions';

describe('filtered deck options', () => {
    it('presents every gather order in the same sequence as Anki', () => {
        expect(FILTERED_DECK_ORDER_UI.map((order) => filteredOrderLabel('en', order))).toEqual([
            'Oldest seen first',
            'Random',
            'Increasing intervals',
            'Decreasing intervals',
            'Most lapses',
            'Order added',
            'Order due',
            'Latest added first',
            'Ascending retrievability',
            'Descending retrievability',
        ]);
    });

    it('keeps scheduler ids stable when labels are localized', () => {
        expect(FILTERED_DECK_ORDER_UI.map((order) => filteredOrderLabel('tr', order))).toEqual([
            'En eski görülen önce',
            'Rastgele',
            'Aralıklar (artan)',
            'Aralıklar (azalan)',
            'En çok unutulan',
            'Ekleniş sırası',
            'Vade sırası',
            'Son eklenen önce',
            'Hatırlanabilirlik (artan)',
            'Hatırlanabilirlik (azalan)',
        ]);
    });
});
