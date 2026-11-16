import { groupSearchAlternatives } from '../../lib/searchQuery';
import type { BrowserI18n } from './types';

export interface SearchHelpItem {
    term: string;
    hint: string;
    value?: { label: string; example: string };
}

interface SearchHelpGroup {
    title: string;
    items: SearchHelpItem[];
}

/** Apply a help filter to all branches of the current query, as Anki does when adding a filter. */
export function appendBrowserSearchTerm(query: string, term: string): string {
    const current = groupSearchAlternatives(query);
    return current ? `${current} ${term}` : term;
}

export function buildSearchHelpGroups(l: BrowserI18n['l']): SearchHelpGroup[] {
    return [
        {
            title: l('Kapsam', 'Scope'),
            items: [
                {
                    term: 'deck:',
                    hint: l('Deste ve alt desteleri', 'A deck and its subdecks'),
                    value: { label: l('Tam deste adı', 'Full deck name'), example: l('Tıp::Kadın Doğum', 'Medicine::Anatomy') },
                },
                {
                    term: 'tag:',
                    hint: l('Etiket ve alt etiketleri', 'A tag and its subtags'),
                    value: { label: l('Etiket adı', 'Tag name'), example: l('anatomi::kemikler', 'anatomy::bones') },
                },
                { term: 'tag:none', hint: l('Etiketsiz notların kartları', 'Cards from untagged notes') },
                {
                    term: 'note:',
                    hint: l('Bir not türünün kartları', 'Cards from a note type'),
                    value: { label: l('Not türünün Anki adı', 'Anki note type name'), example: 'Basic' },
                },
            ],
        },
        {
            title: l('Kart durumu', 'Card state'),
            items: [
                { term: 'is:due', hint: l('Çalışılmayı bekleyen tekrar ve öğrenme kartları', 'Review and learning cards waiting to be studied') },
                { term: 'is:new', hint: l('Yeni ve yeniye sıfırlanan kartlar', 'New cards, including cards reset to new') },
                { term: 'is:learn', hint: l('Öğrenilen ve yeniden öğrenilen kartlar', 'Cards in learning or relearning') },
                { term: 'is:review', hint: l('Tekrar ve yeniden öğrenme kartları', 'Review cards, due or future, and relearning cards') },
                { term: 'is:suspended', hint: l('Askıya alınmış kartlar', 'Suspended cards') },
                { term: 'is:buried', hint: l('Gömülmüş kartlar', 'Buried cards') },
                { term: 'flag:1', hint: l('Kırmızı bayrak (0 bayraksız, 1 kırmızı, 2 turuncu, 3 yeşil, 4 mavi, 5 pembe, 6 turkuaz, 7 mor)', 'Red flag (0 none, 1 red, 2 orange, 3 green, 4 blue, 5 pink, 6 turquoise, 7 purple)') },
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
                { term: 'prop:ivl>=21', hint: l('Aralığı en az 21 gün olanlar', 'Interval of at least 21 days') },
                { term: 'prop:lapses>=5', hint: l('En az 5 kez unutulanlar', 'Forgotten at least five times') },
                { term: 'prop:reps<10', hint: l('10 kereden az yanıtlananlar', 'Answered fewer than 10 times') },
                { term: 'prop:due<=3', hint: l('Vadesi geçmiş veya en geç 3 gün içinde gelecekler', 'Overdue or due within three days') },
            ],
        },
        {
            title: l('Metin ve birleştirme', 'Text and combining terms'),
            items: [
                { term: 'nc:bobrek', hint: l('Aksanları yok sayarak böbrek ara', 'Find böbrek without typing the accent') },
                { term: 're:\\d{3}', hint: l('Düzenli ifadeyle üç ardışık rakam ara', 'Find three consecutive digits with a regular expression') },
                { term: '-is:suspended', hint: l('Askıya alınanları dışla', 'Exclude suspended cards') },
                { term: '(is:new or is:learn)', hint: l('Yeni veya öğrenilen kartları bul', 'Find new cards or cards in learning') },
            ],
        },
    ];
}
