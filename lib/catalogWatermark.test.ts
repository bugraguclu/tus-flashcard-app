import { describe, expect, it } from 'vitest';
import {
    INSTALL_MARK_LENGTH,
    MARK_EVERY_NTH_NOTE,
    decodeInstallMarks,
    encodeInstallMark,
    installMarkFromAccountId,
    isInstallMark,
    markCatalogNotes,
    markNoteFields,
    markableFieldIndex,
    matchInstallMarks,
    shouldMarkNoteAt,
    stripInstallMarks,
} from './catalogWatermark';

const ACCOUNT = '$RCAnonymousID:8f2c1a4e5b6d7c8e9f0a1b2c3d4e5f60';
const OTHER_ACCOUNT = '$RCAnonymousID:0011223344556677889900aabbccddee';

describe('deriving a mark from an account', () => {
    it('is stable, and different accounts get different marks', () => {
        const mark = installMarkFromAccountId(ACCOUNT);
        expect(mark).toBe(installMarkFromAccountId(ACCOUNT));
        expect(isInstallMark(mark)).toBe(true);
        expect(mark).toHaveLength(INSTALL_MARK_LENGTH);
        expect(mark).not.toBe(installMarkFromAccountId(OTHER_ACCOUNT));
    });

    it('separates accounts that differ only slightly', () => {
        // Anonymous ids from the store are near-identical strings; a digest that collided on
        // them would point at the wrong customer, which is worse than pointing at nobody.
        const marks = new Set([
            installMarkFromAccountId('user-0001'),
            installMarkFromAccountId('user-0002'),
            installMarkFromAccountId('user-1000'),
            installMarkFromAccountId('user-0010'),
            installMarkFromAccountId('1000-resu'),
        ]);
        expect(marks.size).toBe(5);
    });

    it('has nothing to say about an absent account', () => {
        expect(installMarkFromAccountId('')).toBe('');
        expect(installMarkFromAccountId('   ')).toBe('');
        expect(installMarkFromAccountId(undefined as unknown as string)).toBe('');
    });

    it('does not carry the account id in the mark', () => {
        const mark = installMarkFromAccountId(ACCOUNT);
        // The digest is a fraction of the input's length: the id cannot be read back out of it.
        expect(mark.length).toBeLessThan(ACCOUNT.length / 2);
        expect(ACCOUNT).not.toContain(mark);
    });
});

describe('the invisible encoding', () => {
    it('round-trips a mark through text', () => {
        const mark = installMarkFromAccountId(ACCOUNT);
        const carrier = `Kalp yetmezliğinde ilk basamak tedavi nedir?${encodeInstallMark(mark)}`;

        expect(decodeInstallMarks(carrier)).toEqual([mark]);
    });

    it('adds nothing a reader or a layout can see', () => {
        const encoded = encodeInstallMark(installMarkFromAccountId(ACCOUNT));
        // Every character is zero-width, so the visible text is exactly what it was.
        expect(stripInstallMarks(`soru${encoded}`)).toBe('soru');
        expect(/[​‌⁠]/.test(encoded)).toBe(true);
        expect(encoded.replace(/[​‌⁠]/g, '')).toBe('');
    });

    it('survives being buried in a wall of other cards', () => {
        const mark = installMarkFromAccountId(ACCOUNT);
        const dump = [
            'Soru 1\tCevap 1',
            `Soru 2${encodeInstallMark(mark)}\tCevap 2`,
            'Soru 3\tCevap 3',
        ].join('\n');

        expect(decodeInstallMarks(dump)).toEqual([mark]);
    });

    it('reports each distinct mark once, in the order it appears', () => {
        const first = installMarkFromAccountId(ACCOUNT);
        const second = installMarkFromAccountId(OTHER_ACCOUNT);
        const dump = `a${encodeInstallMark(first)}b${encodeInstallMark(second)}c${encodeInstallMark(first)}`;

        expect(decodeInstallMarks(dump)).toEqual([first, second]);
    });

    it('finds nothing in text that was never marked', () => {
        expect(decodeInstallMarks('Aort diseksiyonu')).toEqual([]);
        expect(decodeInstallMarks('')).toEqual([]);
        expect(decodeInstallMarks(null)).toEqual([]);
        // Stray zero-width characters that are not a complete fenced payload decode to nothing.
        expect(decodeInstallMarks('soru​‌​')).toEqual([]);
        expect(decodeInstallMarks(`soru⁠​⁠`)).toEqual([]);
    });

    it('refuses to encode anything that is not a mark', () => {
        expect(encodeInstallMark('')).toBe('');
        expect(encodeInstallMark('not-hex-here')).toBe('');
        expect(encodeInstallMark('abc')).toBe('');
        expect(isInstallMark('ABCDEF012345')).toBe(false);
    });
});

describe('choosing where a mark goes', () => {
    it('uses the first field that already has content', () => {
        expect(markableFieldIndex(['Soru', 'Cevap'])).toBe(0);
        expect(markableFieldIndex(['', 'Cevap'])).toBe(1);
        expect(markableFieldIndex(['   ', '\n', 'Cevap'])).toBe(2);
    });

    it('refuses a note whose fields are all empty', () => {
        // Anki makes a card when a template's required field is non-empty. Writing into an empty
        // field would conjure cards the package never had.
        expect(markableFieldIndex(['', '   '])).toBe(-1);
        expect(markableFieldIndex([])).toBe(-1);
        expect(markNoteFields(['', ''], installMarkFromAccountId(ACCOUNT))).toEqual(['', '']);
    });

    it('leaves the visible text of the field exactly as it was', () => {
        const mark = installMarkFromAccountId(ACCOUNT);
        const fields = markNoteFields(['<b>Kalp</b> yetmezliği', 'Cevap'], mark);

        expect(stripInstallMarks(fields[0])).toBe('<b>Kalp</b> yetmezliği');
        expect(fields[1]).toBe('Cevap');
        expect(decodeInstallMarks(fields[0])).toEqual([mark]);
    });

    it('replaces an existing mark rather than stacking them on a reinstall', () => {
        const first = installMarkFromAccountId(ACCOUNT);
        const second = installMarkFromAccountId(OTHER_ACCOUNT);
        const once = markNoteFields(['Soru'], first);
        const twice = markNoteFields(once, second);

        expect(decodeInstallMarks(twice[0])).toEqual([second]);
        expect(stripInstallMarks(twice[0])).toBe('Soru');
    });
});

describe('marking a catalog', () => {
    const catalog = Array.from({ length: 100 }, (_, index) => ({
        id: index + 1,
        fields: [`Soru ${index + 1}`, `Cevap ${index + 1}`],
    }));

    it('marks a sampled share of the notes and leaves the rest byte-for-byte alone', () => {
        const mark = installMarkFromAccountId(ACCOUNT);
        const marked = markCatalogNotes(catalog, mark);

        const carrying = marked.filter((note) => decodeInstallMarks(note.fields[0]).length > 0);
        expect(carrying).toHaveLength(Math.ceil(catalog.length / MARK_EVERY_NTH_NOTE));
        // An unmarked note is the original object, so nothing about it can have changed.
        expect(marked[1]).toBe(catalog[1]);
        expect(marked.every((note, index) => stripInstallMarks(note.fields[0]) === `Soru ${index + 1}`)).toBe(true);
    });

    it('does not mutate the snapshot the installer goes on to count', () => {
        const mark = installMarkFromAccountId(ACCOUNT);
        markCatalogNotes(catalog, mark);

        expect(catalog[0].fields[0]).toBe('Soru 1');
    });

    it('marks the same notes every time, so a reinstall is not a different collection', () => {
        const mark = installMarkFromAccountId(ACCOUNT);
        const first = markCatalogNotes(catalog, mark).map((note) => note.fields[0]);
        const second = markCatalogNotes(catalog, mark).map((note) => note.fields[0]);

        expect(first).toEqual(second);
    });

    it('leaves the catalog untouched when there is no account to mark it with', () => {
        const marked = markCatalogNotes(catalog, '');
        expect(marked.every((note, index) => note === catalog[index])).toBe(true);
    });

    it('puts a mark in any slice of the catalog worth leaking', () => {
        const mark = installMarkFromAccountId(ACCOUNT);
        const marked = markCatalogNotes(catalog, mark);
        // A thief who takes a course's worth of cards rather than all of them still takes marks.
        const slice = marked.slice(37, 77).map((note) => note.fields.join('\t')).join('\n');

        expect(decodeInstallMarks(slice)).toEqual([mark]);
    });

    it('honours a caller-supplied sampling rate', () => {
        const mark = installMarkFromAccountId(ACCOUNT);
        const marked = markCatalogNotes(catalog, mark, 4);
        const carrying = marked.filter((note) => decodeInstallMarks(note.fields[0]).length > 0);

        expect(carrying).toHaveLength(25);
        expect(shouldMarkNoteAt(0, 4)).toBe(true);
        expect(shouldMarkNoteAt(3, 4)).toBe(false);
        // A nonsense rate falls back to the default rather than marking everything or nothing.
        expect(shouldMarkNoteAt(0, 0)).toBe(true);
        expect(shouldMarkNoteAt(1, -5)).toBe(false);
        expect(shouldMarkNoteAt(-1)).toBe(false);
    });
});

/**
 * The forensic tool carries its own copy of the digest and the decoder so it can run on a bare
 * Node years from now with nothing installed. That copy is only useful while it still agrees
 * with what the app writes, which is what this pins: a change to the encoding that forgets the
 * tool would leave every leak untraceable, and nothing else would notice.
 */
describe('the leak-tracing tool agrees with what the app writes', () => {
    it('derives the same mark from the same account', async () => {
        const tool = await import('../scripts/trace-catalog-leak.mjs');
        for (const accountId of [ACCOUNT, OTHER_ACCOUNT, 'user-0001', 'a', '']) {
            expect(tool.installMarkFromAccountId(accountId)).toBe(installMarkFromAccountId(accountId));
        }
    });

    it('reads back a mark the app embedded', async () => {
        const tool = await import('../scripts/trace-catalog-leak.mjs');
        const mark = installMarkFromAccountId(ACCOUNT);
        const marked = markNoteFields(['Aort diseksiyonunda ilk tetkik?'], mark);

        expect(tool.decodeInstallMarks(marked[0])).toEqual([mark]);
        expect(tool.decodeInstallMarks('hiçbir işaret yok')).toEqual([]);
    });
});

describe('tracing a leak back to an account', () => {
    it('names the account whose digest is in the leak', () => {
        const mark = installMarkFromAccountId(ACCOUNT);
        const leak = `Soru${encodeInstallMark(mark)}`;

        expect(matchInstallMarks(decodeInstallMarks(leak), [OTHER_ACCOUNT, ACCOUNT]))
            .toEqual([{ mark, accountId: ACCOUNT }]);
    });

    it('says nothing when the leak came from an account not on the list', () => {
        const leak = `Soru${encodeInstallMark(installMarkFromAccountId('someone-else'))}`;

        expect(matchInstallMarks(decodeInstallMarks(leak), [ACCOUNT, OTHER_ACCOUNT])).toEqual([]);
    });

    it('reports every account when a leak was assembled from several copies', () => {
        const first = installMarkFromAccountId(ACCOUNT);
        const second = installMarkFromAccountId(OTHER_ACCOUNT);
        const leak = `a${encodeInstallMark(first)}b${encodeInstallMark(second)}`;

        expect(matchInstallMarks(decodeInstallMarks(leak), [ACCOUNT, OTHER_ACCOUNT]))
            .toEqual([
                { mark: first, accountId: ACCOUNT },
                { mark: second, accountId: OTHER_ACCOUNT },
            ]);
    });
});
