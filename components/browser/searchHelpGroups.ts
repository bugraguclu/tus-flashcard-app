import type { BrowserI18n } from './types';

export interface SearchHelpGroup { title: string; items: { term: string; hint: string }[] }

/**
 * Anki's search terms, grouped the way the help sheet lists them. Tapping a row appends the
 * term to the search box, so the syntax can be learned by using it instead of memorising it.
 */
export function buildSearchHelpGroups(l: BrowserI18n['l']): SearchHelpGroup[] {
    return [
        {
            title: l('Kapsam', 'Scope'),
            items: [
                { term: 'deck:', hint: l('Belirli bir destede ara', 'Search inside one deck') },
                { term: 'tag:', hint: l('Belirli bir etikette ara', 'Search cards with a tag') },
                { term: 'tag:none', hint: l('Etiketi olmayan kartlar', 'Cards with no tags at all') },
                { term: 'note:', hint: l('Not türüne göre', 'By note type') },
            ],
        },
        {
            title: l('Kart durumu', 'Card state'),
            items: [
                { term: 'is:due', hint: l('Bugün çalışılacaklar', 'Waiting for review today') },
                { term: 'is:new', hint: l('Hiç çalışılmamış kartlar', 'Never studied yet') },
                { term: 'is:learn', hint: l('Öğrenme aşamasındakiler', 'Currently in learning') },
                { term: 'is:review', hint: l('Tekrar aşamasındakiler', 'In the review stage') },
                { term: 'is:suspended', hint: l('Askıya alınmış kartlar', 'Suspended cards') },
                { term: 'is:buried', hint: l('Gömülmüş kartlar', 'Buried cards') },
                { term: 'flag:1', hint: l('Bayrağa göre (0–7)', 'By flag colour (0–7)') },
            ],
        },
        {
            title: l('Zamana göre', 'By time'),
            items: [
                { term: 'added:7', hint: l('Son 7 günde eklenenler', 'Added in the last 7 days') },
                { term: 'edited:7', hint: l('Son 7 günde düzenlenenler', 'Edited in the last 7 days') },
                { term: 'rated:7', hint: l('Son 7 günde çalışılanlar', 'Reviewed in the last 7 days') },
                { term: 'rated:7:1', hint: l('Son 7 günde "Tekrar" denenler', 'Answered "Again" in 7 days') },
            ],
        },
        {
            title: l('Kart özellikleri', 'Card properties'),
            items: [
                { term: 'prop:ivl>=21', hint: l('Aralığı 21 günden uzun', 'Interval of 21 days or more') },
                { term: 'prop:lapses>=5', hint: l('5 kez veya daha çok unutulan', 'Forgotten five times or more') },
                { term: 'prop:reps<10', hint: l('10 kereden az çalışılan', 'Reviewed fewer than 10 times') },
                { term: 'prop:due<=3', hint: l('3 gün içinde gelecekler', 'Due within three days') },
            ],
        },
        {
            title: l('Birleştirme', 'Combining terms'),
            items: [
                { term: '-is:suspended', hint: l('Başına - koyarak dışla', 'A leading - excludes') },
                { term: '(tag:a or tag:b)', hint: l('or ile alternatif, parantezle grupla', 'or for alternatives, brackets to group') },
                { term: 're:', hint: l('Düzenli ifadeyle ara', 'Search with a regular expression') },
            ],
        },
    ];
}
