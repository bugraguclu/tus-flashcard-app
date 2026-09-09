/**
 * Verifies the shipped BKA catalog against the original Anki export:
 * does it carry the same content, is every card filed where the author put it, and does any
 * card render badly in the reviewer?
 *
 * Usage: npm run audit:catalog -- "/path/to/unzipped/apkg/folder"
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import JSZip from 'jszip';
import initSqlJs from 'sql.js';
import {
    BKA_TAG_TOPICS, BKA_UNGROUPED_TOPIC, classifyBkaTopicByContent, classifyBkaTopicByTag,
    normalizeTagToken,
} from '../lib/bkaTaxonomy';
import { renderCardHtml } from '../lib/templates';
import type { Note, NoteType } from '../lib/models';

const SOURCE_DIR = process.argv[2] ?? '/Users/bugra/Downloads/BKATUS Anki715 2';
const BUNDLE = 'assets/catalog/bka-tus-complete.apkg';

type Row = Record<string, any>;

const sha = (value: unknown) => createHash('sha256')
    .update(typeof value === 'string' ? value : Buffer.from(value as Uint8Array))
    .digest('hex');
const digest = (value: unknown) => sha(JSON.stringify(value));

function query(db: any) {
    return (sql: string): Row[] => {
        const [result] = db.exec(sql);
        if (!result) return [];
        return result.values.map((values: any[]) => Object.fromEntries(
            result.columns.map((column: string, index: number) => [column, values[index]]),
        ));
    };
}

function plain(html: string): string {
    return html
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

async function main(): Promise<void> {
    const SQL = await initSqlJs({ locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm' });
    const sourceDb = new SQL.Database(readFileSync(join(SOURCE_DIR, 'collection.anki21')));
    const zip = await JSZip.loadAsync(readFileSync(BUNDLE));
    const bundleDb = new SQL.Database(await zip.file('collection.anki21')!.async('uint8array'));
    const source = query(sourceDb);
    const bundle = query(bundleDb);

    // ---- 1. the shipped package is the export, byte for byte -------------------------------
    const noteSql = 'SELECT id, guid, mid, mod, usn, tags, flds, sfld, csum, flags FROM notes ORDER BY id';
    const cardSql = 'SELECT id, nid, did, ord, mod, usn, type, queue, due, ivl, factor, reps, lapses, "left", odue, odid, flags FROM cards ORDER BY id';
    const notes = source(noteSql);
    const cards = source(cardSql);
    const sourceCol = source('SELECT models, decks FROM col')[0];
    const bundleCol = bundle('SELECT models, decks FROM col')[0];

    console.log('== 1. Kaynak klasör ↔ pakete gömülü koleksiyon ==');
    console.log(`  notlar     : ${notes.length} | aynı: ${digest(notes) === digest(bundle(noteSql))}`);
    console.log(`  kartlar    : ${cards.length} | aynı: ${digest(cards) === digest(bundle(cardSql))}`);
    console.log(`  not tipleri: aynı: ${digest(sourceCol.models) === digest(bundleCol.models)}`);
    console.log(`  desteler   : aynı: ${digest(sourceCol.decks) === digest(bundleCol.decks)}`);

    const sourceMedia = JSON.parse(readFileSync(join(SOURCE_DIR, 'media'), 'utf8')) as Record<string, string>;
    const bundleMedia = JSON.parse(await zip.file('media')!.async('text')) as Record<string, string>;
    let mediaOk = digest(sourceMedia) === digest(bundleMedia);
    for (const index of Object.keys(sourceMedia)) {
        const entry = zip.file(index);
        if (!entry) { mediaOk = false; continue; }
        if (sha(readFileSync(join(SOURCE_DIR, index))) !== sha(await entry.async('uint8array'))) mediaOk = false;
    }
    console.log(`  medya      : ${Object.keys(sourceMedia).length} dosya | aynı: ${mediaOk}`);

    // ---- 2. every card is filed where its author put it ------------------------------------
    const decks = Object.values(JSON.parse(sourceCol.decks) as Record<string, any>)
        .filter((deck: any) => Number(deck.id) !== 1 && deck.name !== 'Default');
    const deckById = new Map(decks.map((deck: any) => [Number(deck.id), deck.name as string]));
    const deckOfNote = new Map<number, number>();
    for (const card of cards) {
        const nid = Number(card.nid);
        const did = Number(card.did);
        if (!deckOfNote.has(nid) || did < deckOfNote.get(nid)!) deckOfNote.set(nid, did);
    }

    const perCourse = new Map<string, {
        notes: number; byTag: number; byContent: number; topics: Map<string, number>;
    }>();
    const unmappedTags = new Map<string, number>();
    const mismatched: string[] = [];
    const topicOfNote = new Map<number, string>();

    for (const note of notes) {
        const course = deckById.get(deckOfNote.get(Number(note.id))!)!;
        const tags = String(note.tags ?? '').trim().split(/\s+/).filter(Boolean);
        const text = String(note.flds ?? '').split('\u001f').join(' ');
        const byTag = classifyBkaTopicByTag(course, tags);
        const byContent = byTag ? null : classifyBkaTopicByContent(course, text);
        const topic = byTag ?? byContent;
        topicOfNote.set(Number(note.id), topic ?? BKA_UNGROUPED_TOPIC);

        const bucket = perCourse.get(course) ?? { notes: 0, byTag: 0, byContent: 0, topics: new Map() };
        bucket.notes++;
        if (byTag) bucket.byTag++;
        if (byContent) bucket.byContent++;
        bucket.topics.set(topic ?? BKA_UNGROUPED_TOPIC, (bucket.topics.get(topic ?? BKA_UNGROUPED_TOPIC) ?? 0) + 1);
        perCourse.set(course, bucket);

        // A tagged note the tag pass did not claim means the author used a label the app ignores.
        if (!byTag && tags.length > 0) {
            const key = `${course} :: ${tags.join(' ')}`;
            unmappedTags.set(key, (unmappedTags.get(key) ?? 0) + 1);
        }
        // A note the tag pass placed must literally carry that rule's tokens.
        if (byTag) {
            const rule = BKA_TAG_TOPICS[course].find((entry) => entry.name === byTag)!;
            const owned = new Set(tags.map(normalizeTagToken));
            if (!rule.tokens.every((token) => owned.has(token))) mismatched.push(String(note.id));
        }
    }

    console.log('\n== 2. Konu yerleşimi (etiket önce, sonra kart metni) ==');
    let totalPlaced = 0;
    let totalNotes = 0;
    for (const [course, bucket] of perCourse) {
        const named = [...bucket.topics.entries()].filter(([name]) => name !== BKA_UNGROUPED_TOPIC);
        const placed = bucket.byTag + bucket.byContent;
        totalPlaced += placed;
        totalNotes += bucket.notes;
        console.log(
            `  ${course.padEnd(22)} ${String(bucket.notes).padStart(4)} not`
            + ` | etiket ${String(bucket.byTag).padStart(4)}`
            + ` | metin ${String(bucket.byContent).padStart(4)}`
            + ` | yerleşen %${(placed / bucket.notes * 100).toFixed(0).padStart(3)}`
            + ` | alt deste ${named.length}`,
        );
    }
    console.log(`  TOPLAM: ${totalPlaced}/${totalNotes} not yerleşti (%${(totalPlaced / totalNotes * 100).toFixed(0)})`);
    console.log(`  kural dışı etiket kombinasyonu: ${unmappedTags.size}`);
    for (const [key, count] of [...unmappedTags.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
        console.log(`     ${String(count).padStart(4)}  ${key}`);
    }
    console.log(`  etiketiyle uyuşmayan yerleşim: ${mismatched.length}`);

    // ---- 3. rendering ----------------------------------------------------------------------
    const noteTypeById = new Map<number, NoteType>();
    for (const model of Object.values(JSON.parse(sourceCol.models) as Record<string, any>)) {
        noteTypeById.set(Number(model.id), {
            id: Number(model.id),
            name: model.name,
            kind: model.type === 1 ? 'cloze' : 'standard',
            fields: (model.flds ?? []).map((field: any, index: number) => ({
                name: field.name, ord: Number(field.ord ?? index), sticky: false, rtl: false,
            })),
            templates: (model.tmpls ?? []).map((template: any, index: number) => ({
                name: template.name, ord: Number(template.ord ?? index), qfmt: template.qfmt, afmt: template.afmt,
            })),
            css: model.css ?? '',
            sortFieldIdx: Number(model.sortf ?? 0),
            mod: Number(model.mod ?? 0),
        });
    }
    const noteById = new Map<number, Row>(notes.map((note) => [Number(note.id), note]));
    const mediaNames = new Set(Object.values(sourceMedia));

    const issues: Record<string, string[]> = {
        'boş soru': [], 'boş cevap': [], 'işlenmemiş {{...}}': [], 'bozuk cloze (kaynakta)': [],
        'kaçırılmış HTML': [], 'kalan [sound:]': [], '<script> kalıntısı': [], 'soru = cevap': [],
        'eksik medya': [],
    };
    let longest = { id: 0, chars: 0 };

    for (const card of cards) {
        const note = noteById.get(Number(card.nid))!;
        const noteType = noteTypeById.get(Number(note.mid))!;
        const modelNote: Note = {
            id: Number(note.id), guid: String(note.guid), noteTypeId: noteType.id, mod: 0, usn: -1,
            tags: String(note.tags ?? '').trim().split(/\s+/).filter(Boolean),
            fields: String(note.flds ?? '').split('\x1f'),
            sfld: String(note.sfld ?? ''), csum: Number(note.csum ?? 0), flags: 0,
        };
        const ord = Number(card.ord);
        const question = renderCardHtml(noteType, modelNote, ord, 'question', { clozeOrd: ord + 1 });
        const answer = renderCardHtml(noteType, modelNote, ord, 'answer', { clozeOrd: ord + 1 });
        const qText = plain(question);
        const aText = plain(answer);
        const id = String(card.id);

        // Anki hides the answer of the active deletion in a `data-cloze` attribute, so its markup
        // is html-escaped by design. Strip those attributes before looking for escaped tags that
        // really did leak into the visible card.
        const visible = (question + answer).replace(/ data-cloze="[^"]*"/g, '');

        if (!qText) issues['boş soru'].push(id);
        if (!aText) issues['boş cevap'].push(id);
        // A `{{cN::` the renderer left alone is a deletion the author never closed — Anki prints
        // it literally too, so it is a content defect in the package, not a rendering failure.
        if (/\{\{c\d/.test(visible)) issues['bozuk cloze (kaynakta)'].push(id);
        else if (/\{\{[^}]+\}\}/.test(visible)) issues['işlenmemiş {{...}}'].push(id);
        if (/&lt;\/?(div|br|span|b|i|img)\b/i.test(visible)) issues['kaçırılmış HTML'].push(id);
        if (/\[sound:/i.test(question + answer)) issues['kalan [sound:]'].push(id);
        if (/<script/i.test(question + answer)) issues['<script> kalıntısı'].push(id);
        if (qText && qText === aText) issues['soru = cevap'].push(id);
        for (const match of (question + answer).matchAll(/<img[^>]+src=["']?([^"'\s>]+)/gi)) {
            const src = decodeURIComponent(match[1]);
            if (!/^https?:|^data:/i.test(src) && !mediaNames.has(src)) issues['eksik medya'].push(`${id}:${src}`);
        }
        if (aText.length > longest.chars) longest = { id: Number(card.id), chars: aText.length };
    }

    console.log('\n== 3. Kart oluşturma denetimi (tüm kartlar) ==');
    for (const [name, list] of Object.entries(issues)) {
        console.log(`  ${name.padEnd(22)} ${list.length}${list.length ? ' → ' + list.slice(0, 5).join(', ') : ''}`);
    }
    console.log(`  en uzun cevap: kart ${longest.id} → ${longest.chars} karakter`);

    sourceDb.close();
    bundleDb.close();
}

main().catch((error) => { console.error(error); process.exit(1); });
