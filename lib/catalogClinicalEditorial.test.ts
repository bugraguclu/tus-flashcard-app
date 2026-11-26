import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import JSZip from 'jszip';
import initSqlJs, { Database } from 'sql.js';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { unpackCatalogBytes } from './catalogPack';
import { catalogPackKey } from './catalogPackKey';
import { readEditorial, rowsBeforeLaterPasses, type EditorialCourse } from '../test/catalogEditorialPasses';
import { extractClozeNumbers, renderClozeAnswer, renderClozeQuestion } from './templates';

// The second-round editorial pass of the seven clinical and mixed courses (2026-11-26):
// the first-round simplifications (kartlar f3266d5) re-audited against the original BKA cards.
type Review = {
    course: string; reviewedNotes: number; reviewedCards: number;
    boundaries: Record<string, string>; noteRowsBefore: (string | number | null)[][];
    scope: { noteId: number; guid: string; ordinals: number[] }[];
    notes: { noteId: number; fields: Record<string, { before: string; after: string }> }[];
    needsExpert: { noteId: number }[];
};
const COURSES: EditorialCourse[] = ['pediatri', 'dahiliye', 'deneme-ve-soru', 'fhe', 'genel-cerrahi', 'kadin-dogum', 'kucuk-stajlar'];
const reviews = COURSES.map(slug => ({ slug, ...readEditorial<Review>(slug) }));
const notes = new Map<number, { guid: string; cloze: boolean; fields: Record<string, string>; ordinals: number[] }>();
const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
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
        const model = models[String(mid)];
        const names = model.flds.map((field: { name: string }) => field.name);
        const values = String(flds).split('\x1f');
        const ordinals = db.exec(`select ord from cards where nid=${scope.noteId} order by ord`)[0].values.map(row => Number(row[0]) + 1);
        notes.set(scope.noteId, {
            guid: String(guid), cloze: model.type === 1, ordinals,
            fields: Object.fromEntries(names.map((name: string, i: number) => [name, values[i]])),
        });
    }
}, 20_000);
afterAll(() => db?.close());

it('covers 1,450 changed notes across the seven courses', () => {
    expect(reviews.map(review => [review.course, review.notes.length])).toEqual([
        ['Pediatri', 364], ['Dahiliye', 331], ['Deneme ve Soru', 290], ['FHE', 47],
        ['Genel Cerrahi', 173], ['Kadın Doğum', 121], ['Küçük Stajlar', 124],
    ]);
    expect(reviews.reduce((total, review) => total + review.notes.reduce((sum, note) => sum + Object.keys(note.fields).length, 0), 0)).toBe(1748);
});

describe.each(reviews)('$course editorial pass in the shipped catalog', review => {
    it('keeps every note identity, card and cloze sibling', () => {
        expect(review.scope).toHaveLength(review.reviewedNotes);
        expect(review.scope.reduce((total, scope) => total + notes.get(scope.noteId)!.ordinals.length, 0)).toBe(review.reviewedCards);
        for (const scope of review.scope) {
            const note = notes.get(scope.noteId)!;
            expect(note.guid).toBe(scope.guid);
            expect(note.ordinals).toEqual(scope.ordinals);
            if (!note.cloze) continue;
            expect(extractClozeNumbers(note.fields.Text), String(scope.noteId)).toEqual(scope.ordinals);
            for (const ordinal of scope.ordinals) {
                expect(renderClozeQuestion(note.fields.Text, ordinal)).not.toContain('{{c');
                expect(renderClozeAnswer(note.fields.Text, ordinal)).not.toContain('{{c');
            }
        }
    });

    it('ships every revised field without card-face sources', () => {
        for (const entry of review.notes) for (const [field, update] of Object.entries(entry.fields)) {
            const shipped = notes.get(entry.noteId)!.fields[field];
            expect(shipped, `${entry.noteId}/${field}`).toBe(update.after);
            expect(shipped, `${entry.noteId}/${field}`).not.toMatch(/https?:\/\/|Kaynak:|PubMed|PMID/i);
        }
    });

    it('leaves the cards waiting for an expert as they were', () => {
        const changed = new Set(review.notes.map(entry => entry.noteId));
        const untouched = review.needsExpert.filter(entry => !changed.has(entry.noteId)).map(entry => entry.noteId);
        if (!untouched.length) return;
        const mod = (ids: number[]) => (fn: string) => Number(db.exec(`select ${fn}(mod) from notes where id in (${ids.join(',')})`)[0].values[0][0]);
        expect(mod(untouched)('max')).toBeLessThan(mod([...changed])('min'));
    });

    it('preserves scheduling, history, metadata and every other course', () => {
        const ids = review.scope.map(note => note.noteId).join(',');
        const queries: Record<string, string> = {
            cards: 'select * from cards order by id', revlog: 'select * from revlog order by id',
            graves: 'select * from graves order by oid,type', collection: 'select * from col order by id',
            noteIdentity: 'select id,guid,mid,usn,tags,flags,data from notes order by id',
            otherCourses: `select * from notes where id not in (${ids}) order by id`,
        };
        const rewind = rowsBeforeLaterPasses(review.slug);
        for (const [boundary, query] of Object.entries(queries)) {
            const rows = db.exec(query)[0]?.values ?? [];
            const atReviewTime = boundary === 'otherCourses' ? rows.map(row => rewind.get(Number(row[0])) ?? row) : rows;
            expect(hash(JSON.stringify(atReviewTime)), boundary).toBe(review.boundaries[boundary]);
        }
    });
});

it('drops added backs and side facts while keeping the original answer', () => {
    const pediatrics = notes.get(1605091001575)!.fields;
    expect(pediatrics.Extra).toBe('');
    expect(pediatrics.Text).toContain('{{c1::prematürite}}');
    expect(pediatrics.Text).not.toContain('0–1 yaş');
});
