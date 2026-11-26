import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import JSZip from 'jszip';
import initSqlJs, { Database } from 'sql.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { unpackCatalogBytes } from './catalogPack';
import { catalogPackKey } from './catalogPackKey';
import { rowsBeforeLaterPasses } from '../test/catalogEditorialPasses';
import { extractClozeNumbers, renderClozeAnswer, renderClozeQuestion } from './templates';

type Review = {
    course: string; reviewedNotes: number; reviewedCards: number;
    boundaries: Record<string, string>; noteRowsBefore: (string | number | null)[][];
    scope: { noteId: number; guid: string; ordinals: number[]; originalExtraEmpty: boolean }[];
    notes: { noteId: number; fields: Record<string, { after: string }> }[];
};
const reviews = ['patoloji', 'anatomi'].map(course =>
    JSON.parse(readFileSync(`docs/catalog-corrections/${course}-editorial.json`, 'utf8')) as Review);
const beforeLaterPasses = { Patoloji: rowsBeforeLaterPasses('patoloji'), Anatomi: rowsBeforeLaterPasses('anatomi') };
const notes = new Map<number, { guid: string; fields: Record<string, string>; ordinals: number[] }>();
const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
const text = (id: number) => notes.get(id)!.fields.Text;
let db: Database;

beforeAll(async () => {
    const apkg = readFileSync('assets/catalog/bka-tus-complete.apkg');
    const unpacked = unpackCatalogBytes(catalogPackKey(), readFileSync('assets/catalog/bka-tus-complete.tuspack'));
    expect(hash(unpacked)).toBe(hash(apkg));
    expect(JSON.parse(readFileSync('assets/catalog/bka-manifest.json', 'utf8')).sha256).toBe(hash(apkg));
    const zip = await JSZip.loadAsync(unpacked);
    const SQL = await initSqlJs({ locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm' });
    db = new SQL.Database(await zip.file('collection.anki21')!.async('uint8array'));
    const models = JSON.parse(String(db.exec('select models from col')[0].values[0][0]));
    for (const scope of reviews.flatMap(review => review.scope)) {
        const [guid, mid, flds] = db.exec(`select guid,mid,flds from notes where id=${scope.noteId}`)[0].values[0];
        const names = models[String(mid)].flds.map((field: { name: string }) => field.name);
        const values = String(flds).split('\x1f');
        const ordinals = db.exec(`select ord from cards where nid=${scope.noteId} order by ord`)[0].values.map(row => Number(row[0]) + 1);
        notes.set(scope.noteId, { guid: String(guid), fields: Object.fromEntries(names.map((name: string, i: number) => [name, values[i]])), ordinals });
    }
}, 20_000);
afterAll(() => db?.close());

describe.each(reviews)('$course editorial scope in the shipped catalog', review => {
    it('preserves every original identity, ordinal and rendered sibling', () => {
        expect(review.scope.length).toBe(review.course === 'Patoloji' ? 609 : 381);
        expect(review.scope.reduce((sum, n) => sum + n.ordinals.length, 0)).toBe(review.course === 'Patoloji' ? 724 : 477);
        for (const scope of review.scope) {
            const note = notes.get(scope.noteId)!;
            expect(note.guid).toBe(scope.guid);
            expect(note.ordinals).toEqual(scope.ordinals);
            expect(extractClozeNumbers(note.fields.Text)).toEqual(scope.ordinals);
            for (const ord of scope.ordinals) {
                expect(renderClozeQuestion(note.fields.Text, ord)).not.toContain('{{c');
                expect(renderClozeAnswer(note.fields.Text, ord)).not.toContain('{{c');
            }
        }
    });
    it('ships the exact field-scoped audit and removes all newly added backs', () => {
        for (const scope of review.scope) {
            const fields = notes.get(scope.noteId)!.fields;
            if (scope.originalExtraEmpty) {
                expect(fields.Extra.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim(), String(scope.noteId)).toBe('');
                expect(fields.Extra).not.toMatch(/<img|\[sound:/i);
            }
            expect(fields.Text + fields.Extra).not.toMatch(/https?:\/\/|Kaynak:|\b(?:PubMed|NIH|CDC|NCCN|ESMO)\b/i);
        }
        for (const entry of review.notes) for (const [field, update] of Object.entries(entry.fields)) {
            expect(notes.get(entry.noteId)!.fields[field], `${entry.noteId}/${field}`).toBe(update.after);
        }
    });
    it('preserves history, metadata and the other eleven courses at this pass boundary', () => {
        const ids = review.scope.map(n => n.noteId).join(',');
        const queries: Record<string, string> = {
            cards: 'select * from cards order by id', revlog: 'select * from revlog order by id',
            graves: 'select * from graves order by oid,type', collection: 'select * from col order by id',
            noteIdentity: 'select id,guid,mid,usn,tags,flags,data from notes order by id',
            otherCourses: `select * from notes where id not in (${ids}) order by id`,
        };
        for (const [boundary, query] of Object.entries(queries)) {
            const rows = db.exec(query)[0]?.values ?? [];
            const rewind = beforeLaterPasses[review.course as keyof typeof beforeLaterPasses];
            const atReviewTime = boundary === 'otherCourses'
                ? rows.map(row => rewind.get(Number(row[0])) ?? row) : rows;
            expect(hash(JSON.stringify(atReviewTime)), boundary).toBe(review.boundaries[boundary]);
        }
    });
});

it('keeps short correct pathology answers without optional examples or false inherited scope', () => {
    expect(text(1604390919198)).not.toContain('meme ve over');
    expect(text(1627823535802)).not.toMatch(/Grup 3|Grup 4|risk sınıflaması/);
    expect(text(1604579385372)).toContain('koruyuculuğu kanıtlanmamış');
    expect(text(1604575731886)).toContain('Eski histolojik sınıflamada');
    expect(text(1620304216366)).toContain('Amiloidoz örnekleri:');
    expect(text(1620304216366)).not.toContain('Herediter');
    expect(text(1617125833702)).toContain('dejeneratif uzantılar');
    expect(text(1617125833702)).not.toContain('Yaşlılarda asemptomatik formuna');
    expect(renderClozeQuestion(text(1627823535802), 1).replace(/<[^>]*>/g, '')).not.toMatch(/WNT|SHH/);
});

it('keeps anatomy mnemonics, media and necessary joint/movement scope', () => {
    expect(notes.get(1609008341248)!.fields.Extra).toContain('SELaM');
    expect(notes.get(1609075331023)!.fields.Extra).toContain('THORA3 X2');
    expect(notes.get(1615968957593)!.fields.Extra).toContain('TOP');
    expect(text(1609008499738)).toContain('LFT');
    expect(text(1615977750293)).toContain('LAFF');
    expect(text(1606479971655)).toMatch(/ODTÜ/);
    expect(text(1627967988630)).toContain('<img');
    expect(text(1609011092823)).toContain('{{c1::talonavicularis}}');
    expect(text(1606378140391)).toContain('kapalı kinetik zincirde');
    expect(text(1615977655788)).not.toContain('flexor hallucis brevis');
    expect(text(1627968128663)).not.toContain('ve CN III lifleri');
    expect(text(1628938779713)).toContain('T{{c1::11}} ve T{{c1::12}}');
});
