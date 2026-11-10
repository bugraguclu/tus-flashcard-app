/**
 * A SQL expression whose byte order is Turkish alphabet order for `expression`.
 *
 * SQLite's NOCASE folds only A–Z and compares every other letter by its UTF-8 bytes, so "Çölyak",
 * "İnme", "Ödem" and "Şok" all sorted after "Zona", and apart from "çölyak" and "ödem". The system
 * SQLite takes no custom collation from the app, so the key is spelled with `replace()`:
 *
 * - a letter the alphabet places right after its base letter (ç ğ ö ş ü, and the dotted i after
 *   the dotless ı) becomes that base letter plus "~", which sorts after "z": "ça" follows "cz" and
 *   precedes "d", and every "ı…" word precedes every "i…" word;
 * - "I" is the capital of "ı" and "İ" of "i", as Turkish writes them;
 * - a circumflexed vowel (kâr, hâl) sorts with its vowel.
 *
 * The order between two texts that differ only in case is left to the caller's tiebreak.
 */
export function turkishSortKeySql(expression: string): string {
    const steps: Array<[from: string, to: string]> = [
        // The dotted i first: the dotless forms below turn into a bare "i" and must stay bare.
        ['i', 'i~'], ['İ', 'i~'], ['î', 'i~'], ['Î', 'i~'],
        ['ı', 'i'], ['I', 'i'],
    ];
    const afterLower: Array<[from: string, to: string]> = [
        ['ç', 'c~'], ['Ç', 'c~'], ['ğ', 'g~'], ['Ğ', 'g~'], ['ö', 'o~'], ['Ö', 'o~'],
        ['ş', 's~'], ['Ş', 's~'], ['ü', 'u~'], ['Ü', 'u~'],
        ['â', 'a'], ['Â', 'a'], ['û', 'u'], ['Û', 'u'],
    ];
    let sql = expression;
    for (const [from, to] of steps) sql = `replace(${sql}, '${from}', '${to}')`;
    sql = `lower(${sql})`;
    for (const [from, to] of afterLower) sql = `replace(${sql}, '${from}', '${to}')`;
    return sql;
}
