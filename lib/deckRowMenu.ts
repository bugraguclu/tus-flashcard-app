/**
 * The deck list's ••• menu: which actions a deck offers, in display order.
 *
 * The set and the order follow AnkiDroid's deck context menu (`DeckPickerMenuContentProvider`):
 * filtered decks trade Create Subdeck, Options and Custom Study for Rebuild, Empty and their own
 * options; Unbury appears only while the deck holds buried cards; Edit Description belongs to
 * regular decks, because a filtered deck's overview always shows Anki's fixed explanation instead
 * (`Overview._desc`), so a description typed there would never be seen. Overview leads because
 * tapping a deck here starts study straight away, as in AnkiMobile. Catalog decks keep their name,
 * place, description and contents fixed, so the actions that would change them are left out.
 */
export type DeckRowMenuAction =
    | 'overview'
    | 'add'
    | 'browse'
    | 'rename'
    | 'createSubdeck'
    | 'options'
    | 'customStudy'
    | 'export'
    | 'filterOptions'
    | 'rebuild'
    | 'empty'
    | 'unbury'
    | 'shortcut'
    | 'description'
    | 'delete';

export interface DeckRowMenuContext {
    isFiltered: boolean;
    isCatalog: boolean;
    /** Cards in the deck and its subdecks that are buried until the next day. */
    buriedCount: number;
}

export function deckRowMenuActions({ isFiltered, isCatalog, buriedCount }: DeckRowMenuContext): DeckRowMenuAction[] {
    const actions: DeckRowMenuAction[] = ['overview'];
    if (!isFiltered) actions.push('add');
    actions.push('browse');
    if (!isCatalog) actions.push('rename');
    if (isFiltered) {
        actions.push('filterOptions', 'rebuild', 'empty');
    } else {
        if (!isCatalog) actions.push('createSubdeck');
        actions.push('options', 'customStudy');
        if (!isCatalog) actions.push('export');
    }
    if (buriedCount > 0) actions.push('unbury');
    actions.push('shortcut');
    if (!isCatalog && !isFiltered) actions.push('description');
    if (!isCatalog) actions.push('delete');
    return actions;
}

export function deckRowMenuLabel(action: DeckRowMenuAction, l: (turkish: string, english: string) => string): string {
    switch (action) {
        case 'overview': return l('Genel bakış', 'Overview');
        case 'add': return l('Ekle', 'Add');
        case 'browse': return l('Kartlara göz at', 'Browse cards');
        case 'rename': return l('Desteyi yeniden adlandır', 'Rename deck');
        case 'createSubdeck': return l('Alt deste oluştur', 'Create subdeck');
        case 'options': return l('Deste seçenekleri', 'Deck options');
        case 'customStudy': return l('Özel çalışma', 'Custom study');
        case 'export': return l('Desteyi dışa aktar', 'Export deck');
        case 'filterOptions': return l('Filtre seçenekleri', 'Filtered deck options');
        case 'rebuild': return l('Yeniden oluştur', 'Rebuild');
        case 'empty': return l('Desteyi boşalt', 'Empty deck');
        case 'unbury': return l('Gömülüleri aç', 'Unbury');
        case 'shortcut': return l('Kısayol oluştur', 'Create shortcut');
        case 'description': return l('Açıklamayı düzenle', 'Edit description');
        case 'delete': return l('Desteyi sil', 'Delete deck');
    }
}
