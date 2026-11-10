/**
 * The file name stem of an export: the deck's own name (its last `::` part) in the characters
 * every file system and share target accepts.
 */
export function exportFileStem(deckName?: string): string {
    return (deckName?.split('::').pop() || 'koleksiyon')
        // The dotless ı has no decomposition, so NFKD left it for the next step to turn into
        // "-": "Çocuk Sağlığı" was exported as "Cocuk-Sagl-g".
        .replace(/ı/g, 'i')
        .normalize('NFKD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9_-]+/gi, '-')
        .replace(/^-+|-+$/g, '') || 'koleksiyon';
}
