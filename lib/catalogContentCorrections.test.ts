import { readFileSync } from 'node:fs';
import JSZip from 'jszip';
import initSqlJs from 'sql.js';
import { beforeAll, describe, expect, it } from 'vitest';
import { unpackCatalogBytes } from './catalogPack';
import { catalogPackKey } from './catalogPackKey';
import { extractClozeNumbers, renderClozeQuestion, renderClozeAnswer } from './templates';

// Medical source evidence and change history: docs/catalog-corrections/gemini-followup.md.
const cases = [
    ['patoloji', 1622492118390, 'g9rYMw$GGF', [1, 2]],
    ['patoloji', 1630168520911, 'C7A0:^JU+S', [1]],
    ['biyokimya', 1611214067113, 'HYjf:N!4Uo', [1]],
    ['biyokimya', 1628928200910, 'ur2?>+@gO[', [1, 2]],
    ['biyokimya', 1629141532040, 'Ar:YAPac&!', [1]],
    ['biyokimya', 1611156046763, 'W/-5^_yg1', [1]],
] as const;
const notes = new Map<number, { guid: string; fields: Record<string, string>; ords: number[] }>();
const followup = JSON.parse(readFileSync('docs/catalog-corrections/publish-front-followup.json', 'utf8')) as {
    notes: { noteId: number; guid: string; ordinals: number[]; fields: Record<string, { after: string }> }[];
};
const allCourseFollowup = JSON.parse(readFileSync('docs/catalog-corrections/all-course-front-followup.json', 'utf8')) as {
    notes: { noteId: number; guid: string; ordinals: number[]; fields: Record<string, { after: string }>; questionChecks: { ordinal: number; absent: string[] }[] }[];
};
const normalizeQuestion = (text: string) => text.toLocaleLowerCase('tr-TR').replace(/ı/g, 'i').replace(/[.,:;()\[\]{}]/g, ' ').replace(/\s+/g, ' ').trim();
const visibleQuestion = (id: number, ord = 1) => renderClozeQuestion(notes.get(id)!.fields.Text, ord).replace(/<[^>]*>/g, ' ');

beforeAll(async () => {
    // Test the asset actually shipped to learners, rather than a second hand-written fixture.
    const packed = readFileSync('assets/catalog/bka-tus-complete.tuspack');
    const zip = await JSZip.loadAsync(unpackCatalogBytes(catalogPackKey(), packed));
    const SQL = await initSqlJs({ locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm' });
    const db = new SQL.Database(await zip.file('collection.anki21')!.async('uint8array'));
    try {
        const models = JSON.parse(String(db.exec('SELECT models FROM col')[0].values[0][0]));
        for (const id of [...cases.map(([, id]) => id), ...followup.notes.map(row => row.noteId), ...allCourseFollowup.notes.map(row => row.noteId)]) {
            const [guid, mid, flds] = db.exec(`SELECT guid, mid, flds FROM notes WHERE id = ${id}`)[0].values[0];
            const names = models[String(mid)].flds.map((field: { name: string }) => field.name);
            const fields = Object.fromEntries(names.map((name: string, i: number) => [name, String(flds).split('\x1f')[i]]));
            const ords = db.exec(`SELECT ord FROM cards WHERE nid = ${id} ORDER BY ord`)[0].values.map(row => Number(row[0]) + 1);
            notes.set(id, { guid: String(guid), fields, ords });
        }
    } finally { db.close(); }
}, 20_000);

describe('corrected catalog content in the shipped package', () => {
    it('keeps note identity, existing sibling cards and canonical patch fields aligned', () => {
        for (const [course, id, guid, ords] of cases) {
            const note = notes.get(id)!;
            const patch = JSON.parse(readFileSync(`docs/catalog-corrections/${course}.patch.json`, 'utf8'));
            const entry = patch.notes.find((row: { noteId: number }) => row.noteId === id);
            expect(note.guid).toBe(guid);
            expect(note.ords).toEqual(ords);
            expect(extractClozeNumbers(note.fields.Text)).toEqual(ords);
            for (const [name, value] of Object.entries(entry.fields) as [string, { after: string }][]) {
                expect(note.fields[name]).toBe(value.after);
            }
        }
    });

    it('hides repeated HIV and oral-site answers on the actual c1 question', () => {
        const visible = (id: number) => renderClozeQuestion(notes.get(id)!.fields.Text, 1).replace(/<[^>]*>/g, ' ');
        expect(visible(1622492118390)).not.toMatch(/germinal merkezler/i);
        expect(visible(1630168520911)).not.toMatch(/dudak|ağız tabanı/i);
    });

    it('keeps UMP energy accounting consistent across both notes', () => {
        const first = notes.get(1611214067113)!.fields.Text;
        const second = notes.get(1628928200910)!.fields.Text;
        expect(first).toMatch(/UMP[\s\S]*?\{\{c1::3\}\} mol ATP, \{\{c1::4\}\} tane/);
        expect(second).toMatch(/UMP[\s\S]*?\{\{c1::3\}\} ATP \/ \{\{c1::4\}\} YEPB/);
    });

    it('teaches the oxidase on the question side and avoids liver-only ketogenesis', () => {
        expect(notes.get(1629141532040)!.fields.Text).toContain('{{c1::Aldehit}} oksidaz');
        expect(notes.get(1629141532040)!.fields.Text).not.toContain('dehidrogenaz');
        expect(notes.get(1611156046763)!.fields.Extra).not.toContain('yalnız');
        expect(notes.get(1611156046763)!.fields.Extra).toContain('başlıca');
    });

    it('ships all scoped follow-up fields without changing note or sibling-card identity', () => {
        for (const entry of followup.notes) {
            const note = notes.get(entry.noteId)!;
            expect(note.guid).toBe(entry.guid);
            expect(note.ords).toEqual(entry.ordinals);
            expect(extractClozeNumbers(note.fields.Text)).toEqual(entry.ordinals);
            for (const [field, value] of Object.entries(entry.fields)) expect(note.fields[field]).toBe(value.after);
            for (const ord of note.ords) {
                expect(visibleQuestion(entry.noteId, ord)).not.toContain('{{c');
                expect(renderClozeAnswer(note.fields.Text, ord)).not.toContain('{{c');
            }
        }
    });

    it('keeps both ARB tasks distinct and hides reciprocal answers on both questions', () => {
        const first = visibleQuestion(1604674576990, 1);
        const second = visibleQuestion(1604674576990, 2);
        expect(first).toContain('Ön ilaç formuyla');
        expect(first).not.toContain('ABD ürün bilgilerine');
        expect(second).toContain('ABD ürün bilgilerine');
        expect(second).not.toContain('Ön ilaç formuyla');
        for (const question of [first, second]) expect(question).not.toMatch(/kandesartan|olmesartan|azilsartan/i);
        for (const ord of [1, 2]) expect(renderClozeAnswer(notes.get(1604674576990)!.fields.Text, ord)).toMatch(/Olmesartan/);
    });

    it('hides the repeated lymphoma answer and neutralizes the infectious-disease root', () => {
        expect(visibleQuestion(1620369027703)).not.toMatch(/Diffüz büyük B hücreli lenfoma/i);
        expect(visibleQuestion(1625238469386)).not.toMatch(/sifiliz|sifilitik|Treponema/i);
    });

    it('separates activation enzymes and places irinotecan in the S-phase row', () => {
        expect(notes.get(1604660192048)!.fields.Text).toMatch(/Tamoksifen:[\s\S]*?CYP2D6[\s\S]*?Klopidogrel:[\s\S]*?CYP2C19/);
        expect(notes.get(1604660192048)!.fields.Text).not.toContain('etkinlikleri');
        const phaseTable = notes.get(1624188510902)!.fields.Text;
        expect(phaseTable).toMatch(/<b>S<\/b>: \{\{c1::irinotekan\}\}/);
        expect(phaseTable).not.toMatch(/G2-M<\/b>:[^<]*irinotekan/);
    });

    it('asks source-qualified warming, spirometry, placental collagen and differentiation management', () => {
        expect(notes.get(1605009641509)!.fields.Text).toContain('{{c1::battaniyeyle pasif ısıtma}}');
        expect(notes.get(1605009641509)!.fields.Text).not.toContain('30');
        expect(notes.get(1604143049764)!.fields.Text).toContain('ekspiratuvar efora {{c1::güçlü biçimde bağımlıdır}}');
        expect(notes.get(1618700546655)!.fields.Text).toContain('Tip {{c1::IV}}');
        const treatment = notes.get(1622986369091)!.fields.Text;
        expect(treatment).toContain('{{c1::IV deksametazon}}');
        expect(treatment).toContain('Belirgin lökosit artışında');
        expect(treatment).not.toContain('{{c1::antrasiklin}}');
    });

    it('keeps the corrected pregnancy mechanism and all three related CVLM questions aligned', () => {
        expect(notes.get(1604850094654)!.fields.Text).toContain('tidal volüm');
        expect(notes.get(1604850094654)!.fields.Text).not.toContain('Takipneye bağlı');
        for (const id of [1604130656359, 1604130778095, 1604130826422]) {
            expect(notes.get(id)!.fields.Text).toContain('CVLM');
            expect(notes.get(id)!.fields.Text).not.toMatch(/\bA2\b/);
        }
    });

    it('ships the all-course corrections with unchanged identities and complete sibling ordinals', () => {
        for (const entry of allCourseFollowup.notes) {
            const note = notes.get(entry.noteId)!;
            expect(note.guid).toBe(entry.guid);
            expect(note.ords).toEqual(entry.ordinals);
            expect(extractClozeNumbers(note.fields.Text)).toEqual(entry.ordinals);
            for (const [field, value] of Object.entries(entry.fields)) expect(note.fields[field]).toBe(value.after);
            for (const ord of entry.ordinals) {
                expect(visibleQuestion(entry.noteId, ord)).not.toContain('{{c');
                expect(renderClozeAnswer(note.fields.Text, ord)).not.toContain('{{c');
            }
        }
    });

    it('does not reveal the audited repeated answers on any affected sibling question', () => {
        for (const entry of allCourseFollowup.notes) for (const check of entry.questionChecks) {
            const question = normalizeQuestion(visibleQuestion(entry.noteId, check.ordinal));
            for (const answer of check.absent) expect(question, `${entry.noteId}/c${check.ordinal}: ${answer}`).not.toContain(normalizeQuestion(answer));
        }
    });

    it('includes the neonatal risk, gestational-age, weight and treatment-duration qualifiers', () => {
        const note = notes.get(1612006124088)!;
        expect(note.fields.Text).toContain('≥37 gestasyon haftası ve ≥2 kg');
        expect(note.fields.Text).toContain('Yüksek risk');
        expect(note.fields.Extra).toContain('2–6 hafta');
        expect(note.fields.Extra).toContain('toplam 6 haftaya');
        expect(notes.get(1627303087231)!.fields.Extra).not.toContain('Artemisin kullanılmaz');
    });

    it('resolves opposite front/back treatment answers without removing the treatment context', () => {
        expect(notes.get(1605557361713)!.fields.Text).toContain('{{c1::lamotrijin}}');
        expect(notes.get(1621755175266)!.fields.Text).toContain('{{c1::uzar}}');
        expect(notes.get(1621755175266)!.fields.Text).not.toContain('{{c1::azalır}}');
        expect(notes.get(1605357983025)!.fields.Text).toContain('koagülopati riskini artırır');
        expect(notes.get(1605527255835)!.fields.Text).toContain('{{c2::PPİ veya H2 reseptör blokörü}}');
        expect(notes.get(1605527352945)!.fields.Text).toContain('önerilmez');
        expect(notes.get(1605859298768)!.fields.Text).toContain('metronidazol');
    });

    it('qualifies ischemia, perioperative steroids and critical-care decisions on the front', () => {
        expect(notes.get(1604958109689)!.fields.Text).toContain('Süren miyokard iskemisini');
        expect(notes.get(1604958109689)!.fields.Text).not.toContain('Yeni gelişmiş sol dal bloğu');
        const steroid = notes.get(1620674119061)!.fields.Text;
        expect(steroid).toContain('Adrenal yetmezliği dışlanmamış');
        expect(steroid).toContain('oral alım uygunsa');
        expect(steroid).not.toContain('daha sonra 25 mg');
        expect(visibleQuestion(1620674119061, 3)).not.toMatch(/\b100\b|\b200\b|\b50\b/);
        expect(notes.get(1604995288460)!.fields.Text).toContain('gerektiğinde yoğun bakım değerlendirmesi');
        expect(notes.get(1604995288460)!.fields.Text).not.toContain('{{c1::yoğun bakım}}');
    });

    it('keeps a named historical formula distinct from current treatment and corrects risk-group thresholds', () => {
        expect(notes.get(1605362934889)!.fields.Text).toContain('Tarihsel yanık resüsitasyon formülü');
        expect(notes.get(1605362934889)!.fields.Extra).toContain('2 mL/kg/%');
        expect(notes.get(1605606243131)!.fields.Text).toContain('güncel profilaksi olarak önerilmez');
        expect(notes.get(1605853179605)!.fields.Text).toContain('günde ≥15');
        expect(notes.get(1606121863630)!.fields.Text).toContain('kısa serviksi bulunan');
        expect(notes.get(1605016745065)!.fields.Text).toContain('ASCVD mevcut: LDL {{c2::&lt;55}}');
        expect(notes.get(1604994431809)!.fields.Text).toContain('<b>bileşik</b>');
    });

});
