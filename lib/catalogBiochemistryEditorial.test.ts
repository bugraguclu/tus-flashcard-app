import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import JSZip from 'jszip';
import initSqlJs, { Database } from 'sql.js';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { unpackCatalogBytes } from './catalogPack';
import { catalogPackKey } from './catalogPackKey';
import { extractClozeNumbers, renderClozeAnswer, renderClozeQuestion } from './templates';

const review = JSON.parse(readFileSync('docs/catalog-corrections/biyokimya-editorial.json', 'utf8')) as {
    boundaries: Record<string, string>;
    scope: { noteId: number; guid: string; ordinals: number[]; originalExtraEmpty: boolean }[];
    notes: { noteId: number; fields: Record<string, { after: string }> }[];
};
const notes = new Map<number, { guid: string; fields: Record<string, string>; ordinals: number[] }>();
const beforeLaterPasses = new Map(['mikrobiyoloji', 'patoloji', 'anatomi'].flatMap(course => {
    const later = JSON.parse(readFileSync(`docs/catalog-corrections/${course}-editorial.json`, 'utf8')) as {
        noteRowsBefore: (string | number | null)[][];
    };
    return later.noteRowsBefore.map(row => [Number(row[0]), row] as const);
}));
const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
const visible = (value: string) => value.replace(/<[^>]*>/g, '');
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
    for (const scope of review.scope) {
        const [guid, mid, flds] = db.exec(`select guid,mid,flds from notes where id=${scope.noteId}`)[0].values[0];
        const names = models[String(mid)].flds.map((field: { name: string }) => field.name);
        const values = String(flds).split('\x1f');
        const ordinals = db.exec(`select ord from cards where nid=${scope.noteId} order by ord`)[0].values.map(row => Number(row[0]) + 1);
        notes.set(scope.noteId, { guid: String(guid), fields: Object.fromEntries(names.map((name: string, i: number) => [name, values[i]])), ordinals });
    }
}, 20_000);
afterAll(() => db?.close());

describe('Biyokimya editorial scope in the shipped catalog', () => {
    it('preserves 484 note identities, 602 cards and valid rendered cloze siblings', () => {
        expect(notes.size).toBe(484);
        expect([...notes.values()].reduce((total, note) => total + note.ordinals.length, 0)).toBe(602);
        for (const scope of review.scope) {
            const note = notes.get(scope.noteId)!;
            expect(note.guid).toBe(scope.guid);
            expect(note.ordinals).toEqual(scope.ordinals);
            expect(extractClozeNumbers(note.fields.Text)).toEqual(scope.ordinals);
            for (const ordinal of scope.ordinals) {
                expect(renderClozeQuestion(note.fields.Text, ordinal)).not.toContain('{{c');
                expect(renderClozeAnswer(note.fields.Text, ordinal)).not.toContain('{{c');
            }
        }
    });

    it('removes added backs and ships every audited field with no card-face source citations', () => {
        for (const scope of review.scope) {
            const fields = notes.get(scope.noteId)!.fields;
            if (scope.originalExtraEmpty) expect(fields.Extra, String(scope.noteId)).toBe('');
            expect(fields.Text + fields.Extra).not.toMatch(/https?:\/\/|Kaynak:|\b(?:Harper|Lehninger|Tietz|Lippincott|PubMed)\b|güncel kaynaklarda/i);
        }
        for (const entry of review.notes) for (const [field, update] of Object.entries(entry.fields)) {
            expect(notes.get(entry.noteId)!.fields[field], `${entry.noteId}/${field}`).toBe(update.after);
        }
    });

    it('preserves existing mnemonics, core corrections and short original backs', () => {
        expect(visible(notes.get(1604232447551)!.fields.Extra)).toBe('VaLİ FaTiH MuTLu');
        expect(notes.get(1604232324607)!.fields.Text).toContain('FİT Trp');
        expect(notes.get(1604232492463)!.fields.Text).toContain('VİM Thr');
        expect(notes.get(1611004887633)!.fields.Text).toContain('PEST');
        expect(notes.get(1604160792094)!.fields.Extra).toBe('Demire bağlanmaz.');
        expect(notes.get(1611156046763)!.fields.Extra).toContain('başlıca');
        expect(notes.get(1611214067113)!.fields.Text).toContain('{{c1::4}} tane yüksek enerjili');
        expect(notes.get(1629141532040)!.fields.Text).toContain('{{c1::Aldehit}} oksidaz');
    });

    it('corrects contradictions directly and removes optional list expansions', () => {
        const text = (id: number) => notes.get(id)!.fields.Text;
        for (const id of [1604236697830, 1607285224180]) expect(text(id)).not.toContain('LDH');
        expect(text(1607241801491)).not.toContain('Apo {{c1::D}}');
        expect(text(1611081097048)).toContain('{{c1::EF-G}}');
        expect(text(1611081097048)).not.toContain('EF-2');
        expect(text(1607275635294)).toContain('{{c1::translokasyonu}}');
        expect(text(1626980997096)).toContain('{{c1::Glukoz 6-fosfat translokazı}}');
        expect(text(1629143953395)).toContain('imidazolidinon');
        expect(text(1607191236052)).toContain('sitokrom {{c1::b}}');
        expect(text(1620934561789)).not.toContain('His');
        expect(notes.get(1620833753648)!.fields.Extra).not.toMatch(/palmitoil|miristoil/);
        expect(notes.get(1628958431560)!.fields.Extra).not.toContain('kardiyolipin');
    });

    it('preserves scheduling, history, metadata and all other courses including the completed pharmacology pass', () => {
        const ids = review.scope.map(note => note.noteId).join(',');
        const queries: Record<string, string> = {
            cards: 'select * from cards order by id', revlog: 'select * from revlog order by id',
            graves: 'select * from graves order by oid,type', collection: 'select * from col order by id',
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
