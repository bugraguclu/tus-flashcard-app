import { choose } from './confirm';

export type UnburyKind = 'all' | 'manual' | 'siblings';

type Localize = (turkish: string, english: string) => string;

/**
 * Anki's Unbury question (`on_unbury` in qt/aqt/overview.py, used by the overview and the
 * congratulations screen): when a deck holds both manually buried cards and buried siblings it
 * asks which to wake; with only one kind there is nothing to choose.
 */
export async function chooseUnburyKind(kinds: { manual: number; siblings: number }, l: Localize): Promise<UnburyKind> {
    if (!kinds.manual || !kinds.siblings) return 'all';
    const all = await choose(
        l('Gömülüleri aç', 'Unbury'),
        l(`${kinds.manual} kart elle, ${kinds.siblings} kart kardeşi yüzünden gömülü.`, `${kinds.manual} cards are buried manually and ${kinds.siblings} as siblings.`),
        l('Tümünü aç', 'Unbury all'),
        l('Türünü seç', 'Choose a kind'),
    );
    if (all) return 'all';
    const manual = await choose(
        l('Gömülüleri aç', 'Unbury'),
        l('Hangi gömülü kartlar açılsın?', 'Which buried cards should be unburied?'),
        l(`Elle gömülenler (${kinds.manual})`, `Manually buried (${kinds.manual})`),
        l(`Gömülü kardeşler (${kinds.siblings})`, `Buried siblings (${kinds.siblings})`),
    );
    return manual ? 'manual' : 'siblings';
}
