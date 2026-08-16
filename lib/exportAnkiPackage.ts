/** Anki-compatible package and plain-text export. Packages use Anki's schema-11
 * interchange database under the scheduler-v2 collection name understood by
 * current Anki, AnkiMobile and AnkiDroid. */

import { Platform } from 'react-native';
import type { AnkiCard, Deck, Note, NoteType } from './models';
import { DEFAULT_DECK_CONFIG } from './models';
import { getAllAnkiCards, getAllNotes, getAllNoteTypes } from './noteManager';
import { getAllDecks, getAllDeckConfigs } from './deckManager';
import { getDB } from './db';
import { buildExportText } from './exportNotes';
import { renderCardHtml } from './templates';
import { readMediaBytes, sanitizeMediaFilename } from './mediaStore';

export type AnkiExportFormat = 'colpkg' | 'apkg' | 'notesTxt' | 'cardsTxt';

export interface ExportArtifact {
    fileName: string;
    mimeType: string;
    text?: string;
    bytes?: Uint8Array;
}

interface WritableDb {
    execSync(sql: string): void;
    runSync(sql: string, ...params: any[]): unknown;
    serializeSync(): Uint8Array;
    closeSync(): void;
}

const FIELD_SEPARATOR = '\x1f';
const MEDIA_REF_RE = /\[sound:([^\]]+)]|<(?:img|audio|video|source)\b[^>]*\bsrc=["']([^"']+)["']/gi;

function safeStem(deckName?: string): string {
    return (deckName?.split('::').pop() || 'koleksiyon')
        .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9_-]+/gi, '-')
        .replace(/^-+|-+$/g, '') || 'koleksiyon';
}

function scopedData(deckName?: string, selectedCardIds?: number[]): { notes: Note[]; cards: AnkiCard[]; decks: Deck[] } {
    const allDecks = getAllDecks().filter((deck) => !deck.isFiltered);
    if (selectedCardIds) {
        const selected = new Set(selectedCardIds);
        const cards = getAllAnkiCards().filter((card) => selected.has(card.id));
        const noteIds = new Set(cards.map((card) => card.noteId));
        const deckIds = new Set(cards.map((card) => card.deckId));
        return {
            notes: getAllNotes().filter((note) => noteIds.has(note.id)),
            cards,
            decks: allDecks.filter((deck) => deckIds.has(deck.id)),
        };
    }
    if (!deckName) return { notes: getAllNotes(), cards: getAllAnkiCards(), decks: allDecks };
    const deckIds = new Set(allDecks.filter((deck) => deck.name === deckName || deck.name.startsWith(`${deckName}::`)).map((deck) => deck.id));
    const cards = getAllAnkiCards().filter((card) => deckIds.has(card.deckId));
    const noteIds = new Set(cards.map((card) => card.noteId));
    return {
        notes: getAllNotes().filter((note) => noteIds.has(note.id)),
        cards,
        decks: allDecks.filter((deck) => deckIds.has(deck.id)),
    };
}

function modelMap(noteTypes: NoteType[]): string {
    const now = Math.floor(Date.now() / 1000);
    const map: Record<string, unknown> = {};
    for (const type of noteTypes) {
        map[String(type.id)] = {
            id: type.id, name: type.name, type: type.kind === 'cloze' ? 1 : 0,
            mod: type.mod || now, usn: -1, sortf: type.sortFieldIdx, css: type.css,
            did: null, latexPre: '', latexPost: '', req: [],
            flds: type.fields.map((field) => ({
                name: field.name, ord: field.ord, sticky: field.sticky, rtl: field.rtl,
                font: 'Arial', size: 20, media: [],
            })),
            tmpls: type.templates.map((template) => ({
                name: template.name, ord: template.ord, qfmt: template.qfmt, afmt: template.afmt,
                did: null, bqfmt: '', bafmt: '',
            })),
        };
    }
    return JSON.stringify(map);
}

function deckMap(decks: Deck[]): string {
    const map: Record<string, unknown> = {};
    for (const deck of decks) {
        map[String(deck.id)] = {
            id: deck.id, name: deck.name, mod: deck.mod, usn: -1, desc: deck.description || '',
            dyn: deck.isFiltered ? 1 : 0, collapsed: deck.collapsed, browserCollapsed: false,
            conf: deck.configId || 1, extendNew: 0, extendRev: 0,
        };
    }
    return JSON.stringify(map);
}

function deckConfigMap(): string {
    const configs = getAllDeckConfigs();
    if (!configs.length) configs.push({ ...DEFAULT_DECK_CONFIG });
    const map: Record<string, unknown> = {};
    for (const config of configs) {
        map[String(config.id)] = {
            id: config.id, name: config.name, mod: config.mod, usn: -1, dyn: false,
            autoplay: config.autoPlayAudio !== false, replayq: true, timer: config.showTimer ? 1 : 0,
            maxTaken: config.maxAnswerSecs, rev: { perDay: config.maxReviewsPerDay, ease4: config.easyBonus,
                hardFactor: config.hardIvl, ivlFct: config.ivlModifier, maxIvl: config.maxIvl, bury: config.buryReviewSiblings },
            new: { perDay: config.newPerDay, delays: config.learningSteps, ints: [config.graduatingIvl, config.easyIvl],
                initialFactor: config.startingEase, order: config.insertionOrder === 'random' ? 0 : 1, bury: config.buryNewSiblings },
            lapse: { delays: config.relearningSteps, minInt: config.minIvl, leechFails: config.leechThreshold,
                leechAction: config.leechAction === 'suspend' ? 0 : 1, mult: config.newIvlPercent },
        };
    }
    return JSON.stringify(map);
}

function schemaSql(): string {
    return `
        CREATE TABLE col (id integer primary key, crt integer not null, mod integer not null, scm integer not null,
            ver integer not null, dty integer not null, usn integer not null, ls integer not null,
            conf text not null, models text not null, decks text not null, dconf text not null, tags text not null);
        CREATE TABLE notes (id integer primary key, guid text not null, mid integer not null, mod integer not null,
            usn integer not null, tags text not null, flds text not null, sfld integer not null, csum integer not null,
            flags integer not null, data text not null);
        CREATE TABLE cards (id integer primary key, nid integer not null, did integer not null, ord integer not null,
            mod integer not null, usn integer not null, type integer not null, queue integer not null, due integer not null,
            ivl integer not null, factor integer not null, reps integer not null, lapses integer not null,
            left integer not null, odue integer not null, odid integer not null, flags integer not null, data text not null);
        CREATE TABLE revlog (id integer primary key, cid integer not null, usn integer not null, ease integer not null,
            ivl integer not null, lastIvl integer not null, factor integer not null, time integer not null, type integer not null);
        CREATE TABLE graves (usn integer not null, oid integer not null, type integer not null);
        CREATE INDEX ix_notes_usn on notes (usn); CREATE INDEX ix_cards_usn on cards (usn);
        CREATE INDEX ix_cards_nid on cards (nid); CREATE INDEX ix_cards_sched on cards (did, queue, due);
        CREATE INDEX ix_revlog_usn on revlog (usn); CREATE INDEX ix_revlog_cid on revlog (cid);
    `;
}

function ankiDue(card: AnkiCard, collectionDay: number): number {
    if (card.queue === 1) return Math.floor(card.due / 1000);
    if (card.queue === 2 || card.queue === 3 || card.type === 2 || card.type === 3) return Math.max(0, card.due - collectionDay);
    return card.due;
}

async function buildPackage(format: 'apkg' | 'colpkg', deckName: string | undefined, includeMedia: boolean, selectedCardIds?: number[]): Promise<ExportArtifact> {
    if (Platform.OS === 'web') throw new Error('Anki paket dışa aktarımı bu sürümde iPhone/iPad uygulamasında kullanılabilir.');
    const SQLite = require('expo-sqlite') as typeof import('expo-sqlite');
    const dbName = `anki-export-${Date.now()}-${Math.floor(Math.random() * 1e6)}.db`;
    const db = SQLite.openDatabaseSync(dbName) as WritableDb;
    const { notes, cards, decks } = scopedData(deckName, selectedCardIds);
    const noteTypes = getAllNoteTypes().filter((type) => notes.some((note) => note.noteTypeId === type.id));
    const now = Date.now();
    const collectionDay = Math.floor(now / 86_400_000);
    try {
        db.execSync(schemaSql());
        db.runSync('INSERT INTO col VALUES (?, ?, ?, ?, 11, 0, 0, 0, ?, ?, ?, ?, ?)',
            1, collectionDay * 86400, now, now, '{}', modelMap(noteTypes), deckMap(decks), deckConfigMap(), '{}');
        for (const note of notes) {
            const tags = note.tags.length ? ` ${note.tags.join(' ')} ` : '';
            db.runSync('INSERT INTO notes VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                note.id, note.guid, note.noteTypeId, note.mod, -1, tags, note.fields.join(FIELD_SEPARATOR), note.sfld, note.csum, note.flags, '');
        }
        for (const card of cards) {
            db.runSync('INSERT INTO cards VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                card.id, card.noteId, card.deckId, card.ord, card.mod, -1, card.type, card.queue,
                ankiDue(card, collectionDay), card.ivl, card.factor, card.reps, card.lapses, card.left,
                card.odue, card.odid, card.flags, '');
        }
        const cardIds = new Set(cards.map((card) => card.id));
        for (const row of getDB().getAllSync<any>('SELECT * FROM revlog ORDER BY id')) {
            if (!cardIds.has(row.cardId)) continue;
            db.runSync('INSERT INTO revlog VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                row.id, row.cardId, -1, row.ease, row.ivl, row.lastIvl, row.factor, row.time, row.type);
        }
        const collection = db.serializeSync();
        const JSZip = (await import('jszip')).default;
        const zip = new JSZip();
        zip.file('collection.anki21', collection);
        const manifest: Record<string, string> = {};
        if (includeMedia) {
            const filenames = new Set<string>();
            for (const note of notes) for (const field of note.fields) {
                MEDIA_REF_RE.lastIndex = 0;
                let match: RegExpExecArray | null;
                while ((match = MEDIA_REF_RE.exec(field))) filenames.add(sanitizeMediaFilename(match[1] || match[2]));
            }
            for (const filename of filenames) {
                const bytes = await readMediaBytes(filename);
                if (!bytes) continue;
                const index = String(Object.keys(manifest).length);
                manifest[index] = filename;
                zip.file(index, bytes);
            }
        }
        zip.file('media', JSON.stringify(manifest));
        const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } });
        return { fileName: `${selectedCardIds ? 'secili-kartlar' : safeStem(deckName)}.${format}`, mimeType: 'application/zip', bytes };
    } finally {
        db.closeSync();
        SQLite.deleteDatabaseSync(dbName);
    }
}

function buildCardsText(deckName?: string, selectedCardIds?: number[]): string {
    const { notes, cards, decks } = scopedData(deckName, selectedCardIds);
    const notesById = new Map(notes.map((note) => [note.id, note]));
    const types = new Map(getAllNoteTypes().map((type) => [type.id, type]));
    const deckNames = new Map(decks.map((deck) => [deck.id, deck.name]));
    const rows = ['#separator:tab', '#html:true'];
    for (const card of cards) {
        const note = notesById.get(card.noteId);
        const type = note ? types.get(note.noteTypeId) : undefined;
        if (!note || !type) continue;
        const options = { deckName: deckNames.get(card.deckId), clozeOrd: card.ord };
        const question = renderCardHtml(type, note, card.ord, 'question', options).replace(/\t/g, ' ').replace(/\r?\n/g, ' ');
        const answer = renderCardHtml(type, note, card.ord, 'answer', options).replace(/\t/g, ' ').replace(/\r?\n/g, ' ');
        rows.push(`${question}\t${answer}`);
    }
    return rows.join('\n');
}

export async function buildAnkiExport(format: AnkiExportFormat, deckName?: string, includeMedia = true, selectedCardIds?: number[]): Promise<ExportArtifact> {
    const stem = safeStem(format === 'colpkg' ? undefined : deckName);
    const selectedNoteIds = selectedCardIds
        ? new Set(scopedData(undefined, selectedCardIds).notes.map((note) => note.id))
        : undefined;
    const selectionStem = selectedCardIds ? 'secili-kartlar' : stem;
    if (format === 'notesTxt') return { fileName: `${selectionStem}-notlar.txt`, mimeType: 'text/plain', text: buildExportText(deckName, selectedNoteIds) };
    if (format === 'cardsTxt') return { fileName: `${selectionStem}-kartlar.txt`, mimeType: 'text/plain', text: buildCardsText(deckName, selectedCardIds) };
    // A .colpkg is always the complete collection; deck scoping belongs to .apkg.
    return buildPackage(format, format === 'colpkg' ? undefined : deckName, includeMedia, selectedCardIds);
}
