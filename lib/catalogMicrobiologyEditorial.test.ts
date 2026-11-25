import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import JSZip from 'jszip';
import initSqlJs, { Database } from 'sql.js';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { unpackCatalogBytes } from './catalogPack';
import { catalogPackKey } from './catalogPackKey';
import { extractClozeNumbers, renderClozeAnswer, renderClozeQuestion } from './templates';

const review = JSON.parse(readFileSync('docs/catalog-corrections/mikrobiyoloji-editorial.json', 'utf8')) as {
    boundaries: Record<string, string>;
    scope: { noteId: number; guid: string; ordinals: number[]; originalExtraEmpty: boolean }[];
    notes: { noteId: number; fields: Record<string, { after: string }> }[];
};
const notes = new Map<number, { guid: string; fields: Record<string, string>; ordinals: number[] }>();
const beforeLaterPasses = new Map(['patoloji', 'anatomi'].flatMap(course => {
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

describe('Mikrobiyoloji editorial scope in the shipped catalog', () => {
    it('preserves all 587 notes, 730 cards and rendered sibling questions', () => {
        expect(notes.size).toBe(587);
        expect([...notes.values()].reduce((total, note) => total + note.ordinals.length, 0)).toBe(730);
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

    it('removes added backs and card citations while shipping the audited fields exactly', () => {
        for (const scope of review.scope) {
            const fields = notes.get(scope.noteId)!.fields;
            if (scope.originalExtraEmpty) expect(fields.Extra, String(scope.noteId)).toBe('');
            expect(fields.Text + fields.Extra).not.toMatch(/https?:\/\/|Kaynak:|\b(?:NIH|CDC|WHO|CLSI|EUCAST|PubMed)\b|\b20\d{2}\b/i);
        }
        for (const entry of review.notes) for (const [field, update] of Object.entries(entry.fields)) {
            expect(notes.get(entry.noteId)!.fields[field], `${entry.noteId}/${field}`).toBe(update.after);
        }
    });

    it('keeps original mnemonics, media and corrected core answers', () => {
        expect(visible(notes.get(1604300724517)!.fields.Extra)).toBe('LEKE');
        expect(visible(notes.get(1604338905056)!.fields.Extra)).toBe('Bazı Aşklar Zigot Oluşturur');
        expect(notes.get(1604338997009)!.fields.Extra).toContain('Peni');
        expect(notes.get(1629123946673)!.fields.Extra).toContain('ÖMGE');
        expect(notes.get(1629123946673)!.fields.Extra).toContain('EGÖM');
        expect(notes.get(1629124306179)!.fields.Text).toContain('<img');
        expect(notes.get(1629128118966)!.fields.Extra).toContain('<img');
        expect(notes.get(1627303087231)!.fields.Text).toContain('{{c1::Artemeter}} + {{c1::lumefantrin}}');
        expect(notes.get(1604340920860)!.fields.Text).toContain('{{c4::NTCP}}');
        expect(notes.get(1611909891157)!.fields.Text).toContain('iki segmentin her birinde karşıt yönlerde');
    });

    it('removes optional list expansions and reasons without restoring incorrect generalizations', () => {
        const text = (id: number) => notes.get(id)!.fields.Text;
        expect(text(1607442897224)).toContain('Parainfluenza: {{c1::hemaglütinin + nöraminidaz}}');
        expect(text(1607442897224)).not.toMatch(/Metapnömovirüs|Paramiksovirüsler/);
        expect(text(1604345019365)).not.toContain('-8');
        expect(text(1626590863733)).not.toContain('toksin üretimini');
        expect(text(1607369881765)).toContain('HIV veya ağır immün yetmezliği olmayan');
        expect(text(1612006124088)).toContain('≥37 gestasyon haftası ve ≥2 kg');
        expect(text(1612006124088)).not.toMatch(/NIH|Emzirme:/);
        expect(text(1604313261504)).toContain('türe özgü antijen testi / PCR');
        expect(text(1604313261504)).not.toContain('seroloji');
        expect(visible(renderClozeQuestion(text(1607442897224), 1))).not.toMatch(/hemaglütinin|G glikoproteini/);
    });

    it('preserves scheduling, history, metadata and the other eleven courses', () => {
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
