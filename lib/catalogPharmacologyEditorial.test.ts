import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import JSZip from 'jszip';
import initSqlJs, { Database } from 'sql.js';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { unpackCatalogBytes } from './catalogPack';
import { catalogPackKey } from './catalogPackKey';
import { extractClozeNumbers, renderClozeAnswer, renderClozeQuestion } from './templates';

type Scope = { noteId: number; guid: string; ordinals: number[]; originalExtraEmpty: boolean };
const review = JSON.parse(readFileSync('docs/catalog-corrections/farmakoloji-editorial.json', 'utf8')) as {
    reviewedNotes: number;
    reviewedCards: number;
    boundaries: Record<string, string>;
    scope: Scope[];
    notes: { noteId: number; fields: Record<string, { before: string; after: string }> }[];
};
const notes = new Map<number, { guid: string; fields: Record<string, string>; ordinals: number[] }>();
// Later course passes are authorized. Rewind only their audited rows when
// checking the earlier pharmacology pass's historical boundary.
const beforeLaterPasses = new Map(['biyokimya', 'mikrobiyoloji', 'patoloji', 'anatomi'].flatMap(course => {
    const later = JSON.parse(readFileSync(`docs/catalog-corrections/${course}-editorial.json`, 'utf8')) as {
        noteRowsBefore: (string | number | null)[][];
    };
    return later.noteRowsBefore.map(row => [Number(row[0]), row] as const);
}));
const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
let db: Database;

beforeAll(async () => {
    const apkg = readFileSync('assets/catalog/bka-tus-complete.apkg');
    const unpacked = unpackCatalogBytes(catalogPackKey(), readFileSync('assets/catalog/bka-tus-complete.tuspack'));
    expect(hash(unpacked)).toBe(hash(apkg));
    const manifest = JSON.parse(readFileSync('assets/catalog/bka-manifest.json', 'utf8'));
    expect(manifest.sha256).toBe(hash(apkg));
    const zip = await JSZip.loadAsync(unpacked);
    const SQL = await initSqlJs({ locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm' });
    db = new SQL.Database(await zip.file('collection.anki21')!.async('uint8array'));
    const models = JSON.parse(String(db.exec('select models from col')[0].values[0][0]));
    for (const scope of review.scope) {
        const [guid, mid, flds] = db.exec(`select guid,mid,flds from notes where id=${scope.noteId}`)[0].values[0];
        const names = models[String(mid)].flds.map((field: { name: string }) => field.name);
        const values = String(flds).split('\x1f');
        const ordinals = db.exec(`select ord from cards where nid=${scope.noteId} order by ord`)[0].values.map(row => Number(row[0]) + 1);
        notes.set(scope.noteId, { guid: String(guid), fields: Object.fromEntries(names.map((name: string, i: number) => [name, values[i]])), ordinals });
    }
}, 20_000);

afterAll(() => db?.close());

describe('Farmakoloji editorial scope in the shipped catalog', () => {
    it('preserves all 669 note identities, 827 sibling cards and renderable cloze ordinals', () => {
        expect(notes.size).toBe(669);
        expect(review.reviewedNotes).toBe(669);
        expect([...notes.values()].reduce((total, note) => total + note.ordinals.length, 0)).toBe(827);
        for (const scope of review.scope) {
            const note = notes.get(scope.noteId)!;
            expect(note.guid, String(scope.noteId)).toBe(scope.guid);
            expect(note.ordinals).toEqual(scope.ordinals);
            expect(extractClozeNumbers(note.fields.Text)).toEqual(scope.ordinals);
            for (const ordinal of scope.ordinals) {
                expect(renderClozeQuestion(note.fields.Text, ordinal)).not.toContain('{{c');
                expect(renderClozeAnswer(note.fields.Text, ordinal)).not.toContain('{{c');
            }
        }
    });

    it('removes all added backs from originally empty fields, and source attributions from both sides', () => {
        for (const scope of review.scope) {
            const note = notes.get(scope.noteId)!;
            if (scope.originalExtraEmpty) expect(note.fields.Extra, String(scope.noteId)).toBe('');
            for (const text of [note.fields.Text, note.fields.Extra]) {
                expect(text, String(scope.noteId)).not.toMatch(/https?:\/\/|\b(?:FDA|EMA|ECCO|Katzung|Goodman|Lippincott|PubMed)\b|Kaynak:|ürün bilgilerine göre|\b20\d{2}\b/i);
            }
        }
    });

    it('keeps original mnemonics and short back information', () => {
        for (const [id, expected] of [
            [1604757433700, 'ViSiBL'], [1604660768713, 'ARİF - O'], [1604664363789, 'PEN'],
            [1624177277163, 'Sadece Fab'], [1604734067819, 'İlk geçiş etkisi sebebiyle'],
        ] as const) expect(notes.get(id)!.fields.Extra.replace(/<[^>]+>/g, '')).toBe(expected);
        expect(notes.get(1604757433700)!.fields.Extra).toBe('<b>ViSiBL</b>');
        expect(notes.get(1628862729786)!.fields.Extra).toContain('<b>A</b>tezolizumab');
        expect(notes.get(1628862729786)!.fields.Extra).toContain('<b>A</b>velumab');
    });

    it('removes optional new list members without reverting corrected answers', () => {
        const absent: [number, RegExp][] = [
            [1604733203785, /eszopiklon/i], [1604734235843, /dantrolen/i],
            [1604757815433, /brodalumab|bimekizumab/i], [1604758281071, /tezakaftor|eleksakaftor/i],
            [1604758591245, /vilanterol/i], [1626880283926, /tafenokin/i],
            [1604736119248, /semaglutid|tirzepatid/i], [1604756396027, /enkorafenib/i],
            [1604756932888, /iksazomib/i],
        ];
        for (const [id, pattern] of absent) expect(Object.values(notes.get(id)!.fields).join(' ')).not.toMatch(pattern);
        expect(notes.get(1604757853167)!.fields.Text).toContain('krisaborol');
        expect(notes.get(1604668649061)!.fields.Text).toContain('Liddle sendromu');
        expect(notes.get(1604660192048)!.fields.Text).toMatch(/CYP2D6[\s\S]*CYP2C19/);
        expect(notes.get(1624188510902)!.fields.Text).toMatch(/<b>S<\/b>: \{\{c1::irinotekan\}\}/);
        expect(notes.get(1604658729642)!.fields.Text).toContain('Enzim indükleyen antibiyotikler');
        expect(notes.get(1604750468970)!.fields.Text).toContain('5. kuşak dışındaki');
        for (const ordinal of [1, 2]) {
            const visible = renderClozeQuestion(notes.get(1604674576990)!.fields.Text, ordinal).replace(/<[^>]+>/g, '');
            expect(visible).not.toMatch(/kandesartan|olmesartan|azilsartan/i);
        }
    });

    it('keeps scheduling, history, collection metadata and every other course byte-for-byte at row level', () => {
        const ids = review.scope.map(note => note.noteId).join(',');
        const queries: Record<string, string> = {
            cards: 'select * from cards order by id',
            revlog: 'select * from revlog order by id',
            graves: 'select * from graves order by oid,type',
            collection: 'select * from col order by id',
            noteIdentity: 'select id,guid,mid,usn,tags,flags,data from notes order by id',
            otherCourses: `select * from notes where id not in (${ids}) order by id`,
        };
        for (const [boundary, query] of Object.entries(queries)) {
            const rows = db.exec(query)[0]?.values ?? [];
            const atReviewTime = boundary === 'otherCourses'
                ? rows.map(row => beforeLaterPasses.get(Number(row[0])) ?? row)
                : rows;
            expect(hash(JSON.stringify(atReviewTime)), boundary).toBe(review.boundaries[boundary]);
        }
    });
});
