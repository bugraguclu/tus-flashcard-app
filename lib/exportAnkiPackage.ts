/** Anki-compatible package and plain-text export. Packages use Anki's schema-11
 * interchange database under the scheduler-v2 collection name understood by
 * current Anki, AnkiMobile and AnkiDroid. */

import { withoutPackageSchedulingData } from './importApkgCardData';
import { Platform } from 'react-native';
import JSZip from 'jszip';
import { deleteNativeDatabaseSync, openFtsSafeDatabaseSync } from './sqliteOpenOptions';
import { BUILTIN_NOTE_TYPES, checksumField, generateGuid, type AnkiCard, type Deck, type DeckConfig, type Note, type NoteType } from './models';
import { getAllAnkiCards, getAllNotes, getAllNoteTypes } from './noteManager';
import { getAllDecks, getAllDeckConfigs } from './deckManager';
import { getDB } from './db';
import { buildExportTextFromData, fieldToPlainText } from './exportNotes';
import { renderCardHtml } from './templates';
import { listStoredMediaFilenames, readMediaBytes } from './mediaStore';
import { extractMediaFilenames } from './mediaAttachment';
import { LATEST_PACKAGE_META, mediaEntriesProtobuf, zstdStoredFrame } from './ankiPackageLatest';
import { dayNumberToYmd, localDayNumber } from './ankiState';
import { loadSettings } from './storage';
import { isCatalogCard, isCatalogDeck, isCatalogNote, PaidCatalogProtectionError } from './catalogProtection';
import { stringifyAnkiJson } from './ankiJson';
import { collectionConf, rememberedCollection, type AnkiCollectionMeta } from './ankiCollectionConfig';
import type { AppSettings } from './types';
import { ANKI_DEFAULT_PRESET, deckJson, noteTypeJson, presetJson } from './ankiSchema11';

export { exportedReviewOrder, withoutPreservedReviewOrder } from './ankiSchema11';

export type AnkiExportFormat = 'colpkg' | 'apkg' | 'notesTxt' | 'cardsTxt';

export interface ExportArtifact {
    fileName: string;
    mimeType: string;
    text?: string;
    bytes?: Uint8Array;
    /** Anki reports what an export actually contained; these feed that confirmation. */
    noteCount?: number;
    cardCount?: number;
    mediaCount?: number;
}

export interface AnkiPackageExportOptions {
    /** Exact local deck ids selected in the export tree. Parents are added as metadata only. */
    selectedDeckIds?: number[];
    /** Anki .apkg option: retain queues, intervals, flags and review history. */
    includeScheduling?: boolean;
    /** Anki .apkg option: carry the presets used by exported decks. */
    includeDeckConfigs?: boolean;
    /** Plain-text options mirror Anki Desktop's export dialog. */
    includeHtml?: boolean;
    includeTags?: boolean;
    includeDeck?: boolean;
    includeNotetype?: boolean;
    includeGuid?: boolean;
    /**
     * Anki's "Support older Anki versions". On (the default here, and what earlier versions of
     * this app always wrote): `collection.anki21` with a JSON media map. Off, as in Anki's own
     * dialog: the current format, `collection.anki21b` with zstd frames and a protobuf media list.
     */
    legacySupport?: boolean;
}

export interface ExportCollectionSource {
    notes: Note[];
    cards: AnkiCard[];
    decks: Deck[];
    noteTypes: NoteType[];
    deckConfigs: DeckConfig[];
    revlog: Array<Record<string, any>>;
    graves: Array<Record<string, any>>;
    rolloverHour: number;
    /** The collection's other shared options; a stored snapshot leaves them out. */
    settings?: Partial<AppSettings>;
    /** The creation day and settings of the collection a `.colpkg` replaced this one with. */
    collection?: AnkiCollectionMeta | null;
    /** Present only when the source is a stored JSON snapshot. */
    backupName?: string;
    exportDate?: string;
}

interface WritableDb {
    execSync(sql: string): void;
    runSync(sql: string, ...params: any[]): unknown;
    serializeSync(): Uint8Array;
    closeSync(): void;
}

const FIELD_SEPARATOR = '\x1f';
function safeStem(deckName?: string): string {
    return (deckName?.split('::').pop() || 'koleksiyon')
        .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9_-]+/gi, '-')
        .replace(/^-+|-+$/g, '') || 'koleksiyon';
}

function liveExportSource(): ExportCollectionSource {
    const settings = loadSettings();
    return {
        notes: getAllNotes(),
        cards: getAllAnkiCards(),
        decks: getAllDecks(),
        noteTypes: getAllNoteTypes(),
        deckConfigs: getAllDeckConfigs(),
        revlog: getDB().getAllSync<any>('SELECT * FROM revlog ORDER BY id'),
        graves: getDB().getAllSync<any>('SELECT * FROM graves'),
        rolloverHour: settings.dayRolloverHour,
        settings,
        collection: rememberedCollection(),
    };
}

/**
 * The notes, cards and decks an export covers, chosen as Anki's exporter chooses them: a selection
 * picks notes, and every card of a picked note comes along; a deck selection picks the cards that
 * are in those decks. The decks are the ones those cards are in or come from, with their parents,
 * except in a collection package, which keeps every deck.
 */
function scopedData(
    source: ExportCollectionSource,
    deckName?: string,
    selectedCardIds?: number[],
    selectedDeckIds?: number[],
    everyDeck = false,
): { notes: Note[]; cards: AnkiCard[]; decks: Deck[] } {
    const protectedNoteIds = new Set(source.notes.filter(isCatalogNote).map((note) => note.id));
    const notes = source.notes.filter((note) => !protectedNoteIds.has(note.id));
    const cards = source.cards.filter((card) => !protectedNoteIds.has(card.noteId));
    const decks = source.decks.filter((deck) => !isCatalogDeck(deck));
    const refuseCatalog = (picked: (card: AnkiCard) => boolean, message: string) => {
        if (source.cards.some((card) => picked(card) && protectedNoteIds.has(card.noteId))) throw new PaidCatalogProtectionError(message);
    };
    let picked: ((card: AnkiCard) => boolean) | null = null;
    if (selectedCardIds) {
        const selected = new Set(selectedCardIds);
        picked = (card) => selected.has(card.id);
        refuseCatalog(picked, 'Ücretli katalog kartları dışa aktarılamaz.');
    } else if (selectedDeckIds || deckName) {
        const selected = new Set(selectedDeckIds
            ?? source.decks.filter((deck) => deck.name === deckName || deck.name.startsWith(`${deckName}::`)).map((deck) => deck.id));
        if (source.decks.some((deck) => selected.has(deck.id) && isCatalogDeck(deck))) {
            throw new PaidCatalogProtectionError('Ücretli katalog desteleri dışa aktarılamaz.');
        }
        picked = (card) => selected.has(card.deckId);
        refuseCatalog(picked, 'Ücretli katalog desteleri dışa aktarılamaz.');
    }
    const noteIds = new Set(cards.filter(picked ?? (() => true)).map((card) => card.noteId));
    const scopedCards = cards.filter((card) => noteIds.has(card.noteId));
    if (everyDeck) return { notes: notes.filter((note) => noteIds.has(note.id)), cards: scopedCards, decks };
    const used = new Set(scopedCards.flatMap((card) => (card.odid ? [card.deckId, card.odid] : [card.deckId])));
    const includedNames = new Set(decks.filter((deck) => used.has(deck.id)).flatMap((deck) => {
        const parts = deck.name.split('::');
        return parts.map((_, index) => parts.slice(0, index + 1).join('::'));
    }));
    return {
        notes: notes.filter((note) => noteIds.has(note.id)),
        cards: scopedCards,
        decks: decks.filter((deck) => includedNames.has(deck.name)),
    };
}

function modelMap(noteTypes: NoteType[], exportedDeckIds: ReadonlySet<number>): string {
    const nowSecs = Math.floor(Date.now() / 1000);
    return stringifyAnkiJson(Object.fromEntries(noteTypes.map((type) => [type.id, noteTypeJson(type, exportedDeckIds, nowSecs)])));
}

function deckMap(decks: Deck[], includeScheduling: boolean, includeDeckConfigs: boolean): string {
    return stringifyAnkiJson(Object.fromEntries(decks.map((deck) => [deck.id, deckJson(deck, includeScheduling, includeDeckConfigs)])));
}

function deckConfigMap(
    decks: Deck[],
    sourceConfigs: DeckConfig[],
    includeScheduling: boolean,
    includeDeckConfigs: boolean,
): string {
    // Anki refuses a package whose deck names a preset the package lacks ("No such deck config").
    // Without presets every deck names preset 1, and the package carries Anki's own default
    // preset under that id, as Anki's exports carry their Default preset.
    if (!includeDeckConfigs) return stringifyAnkiJson({ 1: ANKI_DEFAULT_PRESET });
    const configIds = new Set(decks.filter((deck) => !deck.isFiltered).map((deck) => deck.configId || 1));
    const configs = sourceConfigs.filter((config) => configIds.has(config.id));
    const map: Record<string, unknown> = Object.fromEntries(configs.map((config) => [config.id, presetJson(config, includeScheduling)]));
    for (const id of configIds) map[id] ??= { ...ANKI_DEFAULT_PRESET, id };
    return stringifyAnkiJson(map);
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
        CREATE INDEX ix_notes_usn on notes (usn); CREATE INDEX ix_notes_csum on notes (csum); CREATE INDEX ix_cards_usn on cards (usn);
        CREATE INDEX ix_cards_nid on cards (nid); CREATE INDEX ix_cards_sched on cards (did, queue, due);
        CREATE INDEX ix_revlog_usn on revlog (usn); CREATE INDEX ix_revlog_cid on revlog (cid);
    `;
}

/** The legacy `col.tags` registry: every tag the exported notes use, so Anki's sidebar lists them. */
function tagRegistry(notes: Note[]): string {
    const tags: Record<string, number> = {};
    for (const note of notes) for (const tag of note.tags) if (tag) tags[tag] = 0;
    return JSON.stringify(tags);
}

function ankiDue(card: AnkiCard, collectionDay: number): number {
    if (card.queue === 1 || (card.queue < 0 && (card.type === 1 || card.type === 3) && card.due >= 1_000_000_000)) {
        return Math.floor(card.due / 1000);
    }
    if (card.queue === 2 || card.queue === 3 || card.type === 2 || card.type === 3 || card.type === 1) return card.due - collectionDay;
    return card.due;
}

function ankiOriginalDue(card: AnkiCard, collectionDay: number): number {
    if (!card.odue) return 0;
    if ((card.type === 1 || card.type === 3) && card.odue >= 1_000_000_000) return Math.floor(card.odue / 1000);
    return card.type === 1 || card.type === 2 || card.type === 3 ? card.odue - collectionDay : card.odue;
}

/** The start of a study day, as Anki stores a new collection's creation time. */
function dayStartSeconds(dayNumber: number, rolloverHour: number): number {
    const [year, month, day] = dayNumberToYmd(dayNumber).split('-').map(Number);
    return Math.floor(new Date(year, month - 1, day, rolloverHour, 0, 0, 0).getTime() / 1000);
}

/** An empty SQLite database a package's collection is written into. */
async function openExportDatabase(): Promise<{ db: WritableDb; cleanup: () => void }> {
    if (Platform.OS === 'web') {
        const { loadSqlJs } = await import('./webDb');
        const SQL = await loadSqlJs();
        const sqlDb = new SQL.Database();
        const db: WritableDb = {
            execSync: (sql) => { sqlDb.run(sql); },
            runSync: (sql, ...params) => { sqlDb.run(sql, params.length ? params : undefined); return undefined; },
            serializeSync: () => sqlDb.export(),
            closeSync: () => sqlDb.close(),
        };
        return { db, cleanup: () => db.closeSync() };
    }
    const name = `anki-export-${Date.now()}-${Math.floor(Math.random() * 1e6)}.db`;
    const db = openFtsSafeDatabaseSync(name) as WritableDb;
    return { db, cleanup: () => { db.closeSync(); deleteNativeDatabaseSync(name); } };
}

const UPGRADE_NOTICE = 'Please update to the latest Anki version, then import the .colpkg/.apkg file again.';

/**
 * The `collection.anki2` every Anki package carries beside its real collection: a new collection
 * whose one Basic note asks the reader to update Anki, which is what an Anki version too old to
 * read the package's collection imports instead. Anki writes this text and nothing else into it.
 */
async function upgradeNoticeCollection(nowMs: number): Promise<Uint8Array> {
    const { db, cleanup } = await openExportDatabase();
    try {
        const basic = BUILTIN_NOTE_TYPES[0];
        const id = nowMs;
        const fields = [UPGRADE_NOTICE, ''];
        db.execSync(schemaSql());
        db.runSync('INSERT INTO col VALUES (1, ?, ?, ?, 11, 0, 0, 0, ?, ?, ?, ?, ?)',
            Math.floor(nowMs / 1000), nowMs, nowMs, stringifyAnkiJson(collectionConf(undefined, {}, { nextPos: 2, deckIds: new Set([1]), creationOffset: new Date(nowMs).getTimezoneOffset() })),
            stringifyAnkiJson({ [id]: noteTypeJson({ ...basic, id }, new Set(), Math.floor(nowMs / 1000)) }),
            stringifyAnkiJson({ 1: deckJson({ id: 1, name: 'Default', configId: 1, mod: 0, usn: 0, description: '', collapsed: false, isFiltered: false }, true, true) }),
            stringifyAnkiJson({ 1: ANKI_DEFAULT_PRESET }), '{}');
        db.runSync('INSERT INTO notes VALUES (?, ?, ?, ?, -1, \'\', ?, ?, ?, 0, \'\')',
            id, generateGuid(), id, Math.floor(nowMs / 1000), fields.join(FIELD_SEPARATOR), UPGRADE_NOTICE, checksumField(UPGRADE_NOTICE));
        db.runSync('INSERT INTO cards VALUES (?, ?, 1, 0, ?, -1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, \'\')', id, id, Math.floor(nowMs / 1000));
        return db.serializeSync();
    } finally {
        cleanup();
    }
}

async function buildPackage(
    source: ExportCollectionSource,
    format: 'apkg' | 'colpkg',
    deckName: string | undefined,
    includeMedia: boolean,
    selectedCardIds?: number[],
    packageOptions: AnkiPackageExportOptions = {},
): Promise<ExportArtifact> {
    const scoped = scopedData(source, deckName, selectedCardIds, packageOptions.selectedDeckIds, format === 'colpkg');
    const includeScheduling = format === 'colpkg' || packageOptions.includeScheduling !== false;
    const includeDeckConfigs = format === 'colpkg' || packageOptions.includeDeckConfigs !== false;
    const decks = scoped.decks;
    const notes = includeScheduling
        ? scoped.notes
        : scoped.notes.map((note) => ({
            ...note,
            tags: note.tags.filter((tag) => !['marked', 'leech'].includes(tag.toLocaleLowerCase('en-US'))),
        }));
    const exportedCards = includeScheduling
        ? scoped.cards
        // Without scheduling a card in a filtered deck stays there, and the deck goes out as a
        // regular one, as Anki's exporter leaves it.
        : scoped.cards.map((card, index) => ({
            ...card,
            type: 0 as const,
            queue: 0 as const,
            due: index + 1,
            ivl: 0,
            factor: 0,
            reps: 0,
            lapses: 0,
            left: 0,
            odue: 0,
            odid: 0,
            flags: 0 as const,
            lastReview: 0,
            ankiData: withoutPackageSchedulingData(card.ankiData),
        }));
    if (notes.some(isCatalogNote) || exportedCards.some(isCatalogCard) || decks.some(isCatalogDeck)) {
        throw new PaidCatalogProtectionError('Ücretli katalog kartları veya desteleri dışa aktarılamaz.');
    }

    const { db, cleanup } = await openExportDatabase();
    const noteTypes = source.noteTypes.filter((type) => notes.some((note) => note.noteTypeId === type.id));
    const now = Date.now();
    const rolloverHour = source.rolloverHour;
    const today = localDayNumber(now, rolloverHour);
    // A collection that came from a `.colpkg` keeps its creation day; one made here starts today.
    // Review due dates are written as days since that creation, as Anki counts them.
    const collectionCreation = source.collection?.crt ?? dayStartSeconds(today, rolloverHour);
    const collectionDay = today - Math.max(0, Math.floor((now / 1000 - collectionCreation) / 86_400));
    const conf = collectionConf(source.collection?.conf, { ...source.settings, dayRolloverHour: rolloverHour }, {
        nextPos: exportedCards.reduce((max, card) => (card.type === 0 ? Math.max(max, card.due) : max), 0) + 1,
        deckIds: new Set(decks.map((deck) => deck.id)),
        creationOffset: new Date(collectionCreation * 1000).getTimezoneOffset(),
    });
    try {
        db.execSync(schemaSql());
        db.runSync('INSERT INTO col VALUES (?, ?, ?, ?, 11, 0, 0, 0, ?, ?, ?, ?, ?)',
            1, collectionCreation, now, now, stringifyAnkiJson(conf),
            modelMap(noteTypes, new Set(decks.map((deck) => deck.id))),
            deckMap(decks, includeScheduling, includeDeckConfigs),
            deckConfigMap(decks, source.deckConfigs, includeScheduling, includeDeckConfigs), tagRegistry(notes));
        for (const note of notes) {
            const tags = note.tags.length ? ` ${note.tags.join(' ')} ` : '';
            db.runSync('INSERT INTO notes VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                note.id, note.guid, note.noteTypeId, note.mod, note.usn ?? -1, tags, note.fields.join(FIELD_SEPARATOR), note.sfld, note.csum, note.flags, note.ankiData ?? '');
        }
        for (const card of exportedCards) {
            db.runSync('INSERT INTO cards VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                card.id, card.noteId, card.deckId, card.ord, card.mod, card.usn ?? -1, card.type, card.queue,
                ankiDue(card, collectionDay), card.ivl, card.factor, card.reps, card.lapses, card.left,
                ankiOriginalDue(card, collectionDay), card.odid, card.flags, card.ankiData ?? '');
        }
        if (includeScheduling) {
            const cardIds = new Set(exportedCards.map((card) => card.id));
            for (const row of source.revlog) {
                // A collection package keeps the review history of deleted cards, as Anki's does;
                // a deck package carries only the history of the cards it contains.
                if (format !== 'colpkg' && !cardIds.has(row.cardId)) continue;
                db.runSync('INSERT INTO revlog VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                    row.id, row.cardId, row.usn ?? -1, row.ease, row.ivl, row.lastIvl, row.factor, row.time, row.type);
            }
            if (format === 'colpkg') {
                for (const row of source.graves) {
                    db.runSync('INSERT INTO graves VALUES (?, ?, ?)', row.usn ?? -1, row.oid, row.type);
                }
            }
        }
        const collection = db.serializeSync();
        const zip = new JSZip();
        const legacy = packageOptions.legacySupport !== false;
        // The current format's collection is read by Anki through its schema upgrade, so the same
        // schema-11 file serves both; only how it is stored differs.
        zip.file(legacy ? 'collection.anki21' : 'collection.anki21b', legacy ? collection : zstdStoredFrame(collection));
        zip.file('collection.anki2', await upgradeNoticeCollection(now));
        const manifest: Record<string, string> = {};
        const mediaFiles: Array<{ name: string; bytes: Uint8Array }> = [];
        if (includeMedia) {
            // The same scan the media audit runs, so a file the audit calls referenced is a file
            // this package carries. They used to be two patterns that disagreed: an attachment
            // written as `<a href="notes.pdf">` was referenced by the audit and left out of here.
            const referencedBy = (fromNotes: Note[], fromTypes: NoteType[]) => extractMediaFilenames([
                ...fromNotes.flatMap((note) => note.fields),
                ...fromTypes.flatMap((type) => [type.css, ...type.templates.flatMap((template) => [template.qfmt, template.afmt])]),
            ]);
            const filenames = referencedBy(notes, noteTypes);
            if (format === 'colpkg') {
                // A collection package carries the whole media folder, as Anki's does, unused files
                // included; but not what only the paid catalog uses, nor the package copies earlier
                // versions of this app kept.
                const catalogOnly = referencedBy(source.notes.filter(isCatalogNote), source.noteTypes.filter((type) => type.catalogPack));
                for (const name of await listStoredMediaFilenames()) {
                    if (!name.startsWith('.') && !name.startsWith('tusanki-source-') && (filenames.has(name) || !catalogOnly.has(name))) filenames.add(name);
                }
            }
            for (const filename of filenames) {
                const bytes = await readMediaBytes(filename);
                if (!bytes) continue;
                const index = String(Object.keys(manifest).length);
                manifest[index] = filename;
                mediaFiles.push({ name: filename, bytes });
                zip.file(index, legacy ? bytes : zstdStoredFrame(bytes));
            }
        }
        if (legacy) {
            zip.file('media', JSON.stringify(manifest));
            // PackageMeta protobuf: field 1 (version) = 2, matching current legacy-schema exports.
            zip.file('meta', new Uint8Array([0x08, 0x02]));
        } else {
            zip.file('media', zstdStoredFrame(mediaEntriesProtobuf(mediaFiles)));
            zip.file('meta', LATEST_PACKAGE_META);
        }
        const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } });
        const snapshotStem = source.backupName?.replace(/\.json$/i, '');
        return {
            fileName: `${selectedCardIds ? 'secili-kartlar' : safeStem(deckName ?? snapshotStem)}.${format}`,
            mimeType: 'application/zip',
            bytes,
            noteCount: notes.length,
            cardCount: exportedCards.length,
            mediaCount: Object.keys(manifest).length,
        };
    } finally {
        cleanup();
    }
}

function csvField(value: string): string {
    return /[\t\r\n"]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** One side of a card as Anki's "Cards in Plain Text" writes it; the answer starts after the question. */
function textCardSide(value: string, withHtml: boolean, answerSide: boolean): string {
    let result = value.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
    if (answerSide) result = result.replace(/^[\s\S]*?<hr\s+id=["']?answer["']?\s*\/?>\s*/i, '');
    return withHtml ? result : fieldToPlainText(result);
}

function buildCardsText(
    source: ExportCollectionSource,
    deckName?: string,
    selectedCardIds?: number[],
    selectedDeckIds?: number[],
    withHtml = true,
): { text: string; cardCount: number } {
    const { notes, cards, decks } = scopedData(source, deckName, selectedCardIds, selectedDeckIds);
    const notesById = new Map(notes.map((note) => [note.id, note]));
    const types = new Map(source.noteTypes.map((type) => [type.id, type]));
    const deckNames = new Map(decks.map((deck) => [deck.id, deck.name]));
    const rows = ['#separator:tab', `#html:${withHtml}`];
    let exported = 0;
    for (const card of [...cards].sort((a, b) => a.id - b.id)) {
        const note = notesById.get(card.noteId);
        const type = note ? types.get(note.noteTypeId) : undefined;
        if (!note || !type) continue;
        const options = { deckName: deckNames.get(card.deckId), cardId: card.id, cardFlag: card.flags, forTextExport: true };
        const question = textCardSide(renderCardHtml(type, note, card.ord, 'question', options), withHtml, false);
        const answer = textCardSide(renderCardHtml(type, note, card.ord, 'answer', options), withHtml, true);
        rows.push(`${csvField(question)}\t${csvField(answer)}`);
        exported++;
    }
    // Anki ends every row, the last one too, with a newline.
    return { text: `${rows.join('\n')}\n`, cardCount: exported };
}

export async function buildAnkiExport(
    format: AnkiExportFormat,
    deckName?: string,
    includeMedia = true,
    selectedCardIds?: number[],
    packageOptions: AnkiPackageExportOptions = {},
    source?: ExportCollectionSource,
): Promise<ExportArtifact> {
    const exportSource = source ?? liveExportSource();
    const snapshotStem = source?.backupName?.replace(/\.json$/i, '');
    const stem = safeStem(format === 'colpkg' ? snapshotStem : deckName ?? snapshotStem);
    const selectedDeckIds = format === 'colpkg' ? undefined : packageOptions.selectedDeckIds;
    const selectedNoteIds = new Set(scopedData(exportSource, deckName, selectedCardIds, selectedDeckIds).notes.map((note) => note.id));
    const selectionStem = selectedCardIds ? 'secili-kartlar' : stem;
    if (format === 'notesTxt') return {
        fileName: `${selectionStem}-notlar.txt`, mimeType: 'text/plain',
        noteCount: selectedNoteIds.size,
        text: buildExportTextFromData(exportSource, deckName, selectedNoteIds, {
            withHtml: packageOptions.includeHtml,
            withTags: packageOptions.includeTags,
            withDeck: packageOptions.includeDeck,
            withNotetype: packageOptions.includeNotetype,
            withGuid: packageOptions.includeGuid,
            preferredDeckIds: selectedDeckIds ? new Set(selectedDeckIds) : undefined,
        }),
    };
    if (format === 'cardsTxt') {
        const cards = buildCardsText(exportSource, deckName, selectedCardIds, selectedDeckIds, packageOptions.includeHtml !== false);
        return {
            fileName: `${selectionStem}-kartlar.txt`,
            mimeType: 'text/plain',
            text: cards.text,
            cardCount: cards.cardCount,
        };
    }
    // A .colpkg is always the complete collection; deck scoping belongs to .apkg.
    return buildPackage(
        exportSource,
        format,
        format === 'colpkg' ? undefined : deckName,
        includeMedia,
        selectedCardIds,
        { ...packageOptions, selectedDeckIds },
    );
}
