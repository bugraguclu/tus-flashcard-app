import { chooseOption } from './confirm';

export type UnburyKind = 'all' | 'manual' | 'siblings';

type Localize = (turkish: string, english: string) => string;

/**
 * Anki's Unbury question (`on_unbury` in qt/aqt/overview.py, used by the overview and the
 * congratulations screen): when a deck holds both manually buried cards and buried siblings it
 * asks which to wake — manual, siblings, all, or Cancel; with only one kind there is nothing to
 * choose. Null when the learner cancels.
 */
export async function chooseUnburyKind(kinds: { manual: number; siblings: number }, l: Localize): Promise<UnburyKind | null> {
    if (!kinds.manual || !kinds.siblings) return 'all';
    const choice = await chooseOption(
        l('Gömülüleri aç', 'Unbury'),
        l(
            `${kinds.manual} kart elle, ${kinds.siblings} kart kardeşi yüzünden gömülü. Hangileri açılsın?`,
            `${kinds.manual} cards are buried manually and ${kinds.siblings} as siblings. Which should be unburied?`,
        ),
        [
            l(`Elle gömülenler (${kinds.manual})`, `Manually buried (${kinds.manual})`),
            l(`Gömülü kardeşler (${kinds.siblings})`, `Buried siblings (${kinds.siblings})`),
            l('Tümü', 'All buried cards'),
        ],
    );
    if (choice === 0) return 'manual';
    if (choice === 1) return 'siblings';
    if (choice === 2) return 'all';
    return null;
}
