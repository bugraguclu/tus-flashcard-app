/** Anki-compatible package and plain-text export. Packages use Anki's schema-11
 * interchange database under the scheduler-v2 collection name understood by
 * current Anki, AnkiMobile and AnkiDroid. */

import { FSRS_DEFAULT_DESIRED_RETENTION, FSRS_DEFAULT_HISTORICAL_RETENTION, formatFsrsCutoffDate } from './fsrs';
import { Platform } from 'react-native';
import JSZip from 'jszip';
import { deleteNativeDatabaseSync, openFtsSafeDatabaseSync } from './sqliteOpenOptions';
import type { AnkiCard, Deck, DeckConfig, Note, NoteType } from './models';
import { DEFAULT_DECK_CONFIG } from './models';
import { getAllAnkiCards, getAllNotes, getAllNoteTypes } from './noteManager';
import { getAllDecks, getAllDeckConfigs } from './deckManager';
import { getDB } from './db';
import { buildExportTextFromData } from './exportNotes';
import { renderCardHtml } from './templates';
import { readMediaBytes, sanitizeMediaFilename } from './mediaStore';
import { pristineOriginalForExport } from './ankiPackageArchive';
import { dayNumberToYmd, localDayNumber } from './ankiState';
import { normalizeNewCardGatherOrder } from './queueBuild';
import { loadSettings } from './storage';
import { humanizeCardText } from './displayText';
import { isCatalogDeck, isCatalogNote, PaidCatalogProtectionError } from './catalogProtection';

export type AnkiExportFormat = 'colpkg' | 'apkg' | 'notesTxt' | 'cardsTxt';

export interface ExportArtifact {
    fileName: string;
    mimeType: string;
    text?: string;
    bytes?: Uint8Array;
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
const MEDIA_REF_RE = /\[sound:([^\]]+)]|<(?:img|audio|video|source)\b[^>]*\bsrc=["']([^"']+)["']|url\(["']?([^"')]+)["']?\)/gi;

function safeStem(deckName?: string): string {
    return (deckName?.split('::').pop() || 'koleksiyon')
        .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9_-]+/gi, '-')
        .replace(/^-+|-+$/g, '') || 'koleksiyon';
}

function liveExportSource(): ExportCollectionSource {
    return {
        notes: getAllNotes(),
        cards: getAllAnkiCards(),
        decks: getAllDecks(),
        noteTypes: getAllNoteTypes(),
        deckConfigs: getAllDeckConfigs(),
        revlog: getDB().getAllSync<any>('SELECT * FROM revlog ORDER BY id'),
        graves: getDB().getAllSync<any>('SELECT * FROM graves'),
        rolloverHour: loadSettings().dayRolloverHour,
    };
}

function scopedData(
    source: ExportCollectionSource,
    deckName?: string,
    selectedCardIds?: number[],
    selectedDeckIds?: number[],
): { notes: Note[]; cards: AnkiCard[]; decks: Deck[] } {
    const rawNotes = source.notes;
    const protectedNoteIds = new Set(rawNotes.filter(isCatalogNote).map((note) => note.id));
    const notes = rawNotes.filter((note) => !protectedNoteIds.has(note.id));
    const rawCards = source.cards;
    const cards = rawCards.filter((card) => !protectedNoteIds.has(card.noteId));
    const rawDecks = source.decks.filter((deck) => !deck.isFiltered);
    const allDecks = rawDecks.filter((deck) => !isCatalogDeck(deck));
    const withParents = (directDeckIds: Set<number>): Deck[] => {
        const includedNames = new Set(
            allDecks.filter((deck) => directDeckIds.has(deck.id)).flatMap((deck) => {
                const parts = deck.name.split('::');
                return parts.map((_, index) => parts.slice(0, index + 1).join('::'));
            }),
        );
        return allDecks.filter((deck) => includedNames.has(deck.name));
    };
    if (selectedCardIds) {
        const selected = new Set(selectedCardIds);
        if (rawCards.some((card) => selected.has(card.id) && protectedNoteIds.has(card.noteId))) {
            throw new PaidCatalogProtectionError('Ücretli katalog kartları dışa aktarılamaz.');
        }
        const noteIds = new Set(cards.filter((card) => selected.has(card.id)).map((card) => card.noteId));
        // Anki's package exporter selects notes first, then includes every card generated by
        // those notes. This preserves reverse/cloze siblings even if only one card was selected.
        const scopedCards = cards.filter((card) => noteIds.has(card.noteId));
        const deckIds = new Set(scopedCards.map((card) => card.deckId));
        return {
            notes: notes.filter((note) => noteIds.has(note.id)),
            cards: scopedCards,
            decks: withParents(deckIds),
        };
    }
    if (selectedDeckIds) {
        const selected = new Set(selectedDeckIds);
        if (rawDecks.some((deck) => selected.has(deck.id) && isCatalogDeck(deck))) {
            throw new PaidCatalogProtectionError('Ücretli katalog desteleri dışa aktarılamaz.');
        }
        const deckIds = new Set(allDecks.filter((deck) => selected.has(deck.id)).map((deck) => deck.id));
        const scopedCards = cards.filter((card) => deckIds.has(card.deckId));
        const noteIds = new Set(scopedCards.map((card) => card.noteId));
        const exportedDeckIds = new Set(scopedCards.map((card) => card.deckId));
        return {
            notes: notes.filter((note) => noteIds.has(note.id)),
            cards: scopedCards,
            decks: withParents(exportedDeckIds),
        };
    }
    if (!deckName) return { notes, cards, decks: allDecks };
    const rawDeckIds = new Set(rawDecks.filter((deck) => deck.name === deckName || deck.name.startsWith(`${deckName}::`)).map((deck) => deck.id));
    if (rawCards.some((card) => rawDeckIds.has(card.deckId) && protectedNoteIds.has(card.noteId))) {
        throw new PaidCatalogProtectionError('Ücretli katalog desteleri dışa aktarılamaz.');
    }
    const deckIds = new Set(allDecks.filter((deck) => deck.name === deckName || deck.name.startsWith(`${deckName}::`)).map((deck) => deck.id));
    const noteIds = new Set(cards.filter((card) => deckIds.has(card.deckId)).map((card) => card.noteId));
    const scopedCards = cards.filter((card) => noteIds.has(card.noteId));
    const exportedDeckIds = new Set(scopedCards.map((card) => card.deckId));
    return {
        notes: notes.filter((note) => noteIds.has(note.id)),
        cards: scopedCards,
        decks: withParents(exportedDeckIds),
    };
}

function modelMap(noteTypes: NoteType[]): string {
    const now = Math.floor(Date.now() / 1000);
    const map: Record<string, unknown> = {};
    for (const type of noteTypes) {
        const raw = type.ankiRaw ?? {};
        const rawFields = Array.isArray(raw.flds) ? raw.flds as Record<string, unknown>[] : [];
        const rawTemplates = Array.isArray(raw.tmpls) ? raw.tmpls as Record<string, unknown>[] : [];
        map[String(type.id)] = {
            ...raw,
            id: type.id, name: type.name, type: type.kind === 'cloze' ? 1 : 0,
            mod: type.mod || now, usn: Number(raw.usn ?? -1), sortf: type.sortFieldIdx, css: type.css,
            did: raw.did ?? null, latexPre: raw.latexPre ?? '', latexPost: raw.latexPost ?? '', req: raw.req ?? [],
            flds: type.fields.map((field, index) => ({
                ...(rawFields[index] ?? {}),
                name: field.name, ord: field.ord, sticky: field.sticky, rtl: field.rtl,
                font: rawFields[index]?.font ?? 'Arial', size: rawFields[index]?.size ?? 20,
                media: rawFields[index]?.media ?? [],
            })),
            tmpls: type.templates.map((template, index) => ({
                ...(rawTemplates[index] ?? {}),
                name: template.name, ord: template.ord, qfmt: template.qfmt, afmt: template.afmt,
                did: rawTemplates[index]?.did ?? null,
                bqfmt: rawTemplates[index]?.bqfmt ?? '', bafmt: rawTemplates[index]?.bafmt ?? '',
            })),
        };
    }
    return JSON.stringify(map);
}

function deckMap(decks: Deck[], includeScheduling: boolean, includeDeckConfigs: boolean): string {
    const map: Record<string, unknown> = {};
    for (const deck of decks) {
        map[String(deck.id)] = {
            ...(deck.ankiRaw ?? {}),
            id: deck.id, name: deck.name, mod: deck.mod, usn: deck.usn ?? -1, desc: deck.description || '',
            // Anki turns exported filtered decks into normal decks when scheduling is stripped.
            dyn: includeScheduling && deck.isFiltered ? 1 : 0,
            collapsed: includeScheduling ? deck.collapsed : false,
            browserCollapsed: false,
            conf: includeDeckConfigs ? deck.configId || 1 : 1,
            extendNew: includeScheduling ? Number(deck.ankiRaw?.extendNew ?? 0) : 0,
            extendRev: includeScheduling ? Number(deck.ankiRaw?.extendRev ?? 0) : 0,
        };
    }
    return JSON.stringify(map);
}

/** Inverse of the import tables: our string unions back to Anki's dconf ordinals. */
const REVIEW_MIX_ORDINAL: Record<string, number> = { mix: 0, after: 1, before: 2 };
const ANSWER_ACTION_ORDINAL: Record<string, number> = { bury: 0, again: 1, good: 2, hard: 3, showReminder: 4 };
const GATHER_ORDER_ORDINAL: Record<string, number> = {
    deck: 0, ascendingPosition: 1, descendingPosition: 2,
    randomNotes: 3, randomCards: 4, deckThenRandomNotes: 5,
};
const NEW_SORT_ORDER_ORDINAL: Record<string, number> = {
    template: 0, noSort: 1, templateThenRandom: 2, randomNoteThenTemplate: 3, randomCard: 4,
};
const REVIEW_ORDER_ORDINAL: Record<string, number> = {
    dueRandom: 0, dueThenDeck: 1, deckThenDue: 2, intervalsAsc: 3, intervalsDesc: 4,
    easeAsc: 5, easeDesc: 6, random: 8, added: 9, reverseAdded: 10, relativeOverdueness: 12,
};

function deckConfigMap(
    decks: Deck[],
    sourceConfigs: DeckConfig[],
    includeScheduling: boolean,
    includeDeckConfigs: boolean,
): string {
    if (!includeDeckConfigs) return '{}';
    const configIds = new Set(decks.map((deck) => deck.configId || 1));
    const configs = sourceConfigs.filter((config) => configIds.has(config.id));
    if (!configs.length) configs.push({ ...DEFAULT_DECK_CONFIG });
    const map: Record<string, unknown> = {};
    for (const config of configs) {
        const raw = config.ankiRaw ?? {};
        const rawReview = raw.rev && typeof raw.rev === 'object' ? raw.rev as Record<string, unknown> : {};
        const rawNew = raw.new && typeof raw.new === 'object' ? raw.new as Record<string, unknown> : {};
        const rawLapse = raw.lapse && typeof raw.lapse === 'object' ? raw.lapse as Record<string, unknown> : {};
        map[String(config.id)] = {
            ...raw,
            id: config.id, name: config.name, mod: config.mod, usn: config.usn ?? -1, dyn: false,
            autoplay: config.autoPlayAudio !== false,
            replayq: config.skipQuestionWhenReplayingAnswer !== true,
            timer: config.showTimer ? 1 : 0, stopTimerOnAnswer: config.stopTimerOnAnswer === true,
            secondsToShowQuestion: config.secondsToShowQuestion ?? 0,
            secondsToShowAnswer: config.secondsToShowAnswer ?? 0,
            questionAction: config.questionAction === 'showReminder' ? 1 : 0,
            waitForAudio: config.waitForAudio !== false,
            answerAction: ANSWER_ACTION_ORDINAL[config.answerAction ?? 'bury'] ?? 0,
            interdayLearningMix: REVIEW_MIX_ORDINAL[config.interdayLearningMix ?? 'mix'] ?? 0,
            newMix: REVIEW_MIX_ORDINAL[config.newReviewOrder ?? 'mix'] ?? 0,
            newGatherPriority: GATHER_ORDER_ORDINAL[normalizeNewCardGatherOrder(config.newCardGatherOrder)] ?? 0,
            newSortOrder: NEW_SORT_ORDER_ORDINAL[config.newCardSortOrder ?? 'template'] ?? 0,
            reviewOrder: REVIEW_ORDER_ORDINAL[config.reviewSortOrder ?? 'dueRandom'] ?? 0,
            easyDays: config.easyDays ?? [1, 1, 1, 1, 1, 1, 1],
            // FSRS, under Anki's schema11 names. The parameters are written to the FSRS-6 slot;
            // an importer that only understands older generations falls back to its own defaults.
            fsrsParams6: config.fsrsParams ?? [],
            desiredRetention: config.desiredRetention ?? FSRS_DEFAULT_DESIRED_RETENTION,
            sm2Retention: config.historicalRetention ?? FSRS_DEFAULT_HISTORICAL_RETENTION,
            ignoreRevlogsBeforeDate: formatFsrsCutoffDate(config.ignoreRevlogsBeforeMs),
            maxTaken: config.maxAnswerSecs, rev: { ...rawReview, perDay: config.maxReviewsPerDay, ease4: config.easyBonus,
                hardFactor: config.hardIvl, ivlFct: config.ivlModifier, maxIvl: config.maxIvl, bury: config.buryReviewSiblings },
            new: { ...rawNew, perDay: config.newPerDay, delays: config.learningSteps, ints: [config.graduatingIvl, config.easyIvl],
                initialFactor: config.startingEase, order: config.insertionOrder === 'random' ? 0 : 1, bury: config.buryNewSiblings },
            lapse: { ...rawLapse, delays: config.relearningSteps, minInt: config.minIvl, leechFails: config.leechThreshold,
                leechAction: config.leechAction === 'suspend' ? 0 : 1, mult: config.newIvlPercent },
        };
        // FSRS parameters describe the learner's scheduling history, and Anki removes them from
        // a shareable package when scheduling is excluded.
        if (!includeScheduling) {
            for (const key of ['fsrsWeights', 'fsrsParams4', 'fsrsParams5', 'fsrsParams6', 'desiredRetention', 'sm2Retention', 'ignoreRevlogsBeforeDate']) {
                delete (map[String(config.id)] as any)[key];
            }
        }
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
    if (card.queue === 1 || (card.queue < 0 && (card.type === 1 || card.type === 3) && card.due >= 1_000_000_000)) {
        return Math.floor(card.due / 1000);
    }
    if (card.queue === 2 || card.queue === 3 || card.type === 2 || card.type === 3) return Math.max(0, card.due - collectionDay);
    return card.due;
}

function ankiOriginalDue(card: AnkiCard, collectionDay: number): number {
    if (!card.odue) return 0;
    return card.type === 2 || card.type === 3 ? Math.max(0, card.odue - collectionDay) : card.odue;
}

function collectionCreationSeconds(collectionDay: number, rolloverHour: number): number {
    const [year, month, day] = dayNumberToYmd(collectionDay).split('-').map(Number);
    return Math.floor(new Date(year, month - 1, day, rolloverHour, 0, 0, 0).getTime() / 1000);
}

async function buildPackage(
    source: ExportCollectionSource,
    format: 'apkg' | 'colpkg',
    deckName: string | undefined,
    includeMedia: boolean,
    selectedCardIds?: number[],
    packageOptions: AnkiPackageExportOptions = {},
    allowPristineOriginal = false,
): Promise<ExportArtifact> {
    const scoped = scopedData(source, deckName, selectedCardIds, packageOptions.selectedDeckIds);
    const includeScheduling = format === 'colpkg' || packageOptions.includeScheduling !== false;
    const includeDeckConfigs = format === 'colpkg' || packageOptions.includeDeckConfigs !== false;
    const notes = includeScheduling
        ? scoped.notes
        : scoped.notes.map((note) => ({
            ...note,
            tags: note.tags.filter((tag) => !['marked', 'leech'].includes(tag.toLocaleLowerCase('en-US'))),
        }));
    const cards = includeScheduling
        ? scoped.cards
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
        }));
    const decks = scoped.decks;
    if (allowPristineOriginal && format === 'apkg' && includeScheduling && includeDeckConfigs) {
        const pristine = await pristineOriginalForExport(notes, cards, includeMedia);
        if (pristine) {
            return { fileName: pristine.fileName, mimeType: 'application/zip', bytes: pristine.bytes };
        }
    }

    const dbName = `anki-export-${Date.now()}-${Math.floor(Math.random() * 1e6)}.db`;
    let db: WritableDb;
    let cleanup: () => void;
    if (Platform.OS === 'web') {
        const { loadSqlJs } = await import('./webDb');
        const SQL = await loadSqlJs();
        const sqlDb = new SQL.Database();
        db = {
            execSync: (sql) => { sqlDb.run(sql); },
            runSync: (sql, ...params) => { sqlDb.run(sql, params.length ? params : undefined); return undefined; },
            serializeSync: () => sqlDb.export(),
            closeSync: () => sqlDb.close(),
        };
        cleanup = () => db.closeSync();
    } else {
        db = openFtsSafeDatabaseSync(dbName) as WritableDb;
        cleanup = () => {
            db.closeSync();
            deleteNativeDatabaseSync(dbName);
        };
    }
    const noteTypes = source.noteTypes.filter((type) => notes.some((note) => note.noteTypeId === type.id));
    const now = Date.now();
    const rolloverHour = source.rolloverHour;
    const collectionDay = localDayNumber(now, rolloverHour);
    const collectionCreation = collectionCreationSeconds(collectionDay, rolloverHour);
    try {
        db.execSync(schemaSql());
        db.runSync('INSERT INTO col VALUES (?, ?, ?, ?, 11, 0, 0, 0, ?, ?, ?, ?, ?)',
            1, collectionCreation, now, now, '{}', modelMap(noteTypes),
            deckMap(decks, includeScheduling, includeDeckConfigs),
            deckConfigMap(decks, source.deckConfigs, includeScheduling, includeDeckConfigs), '{}');
        for (const note of notes) {
            const tags = note.tags.length ? ` ${note.tags.join(' ')} ` : '';
            db.runSync('INSERT INTO notes VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                note.id, note.guid, note.noteTypeId, note.mod, note.usn ?? -1, tags, note.fields.join(FIELD_SEPARATOR), note.sfld, note.csum, note.flags, note.ankiData ?? '');
        }
        for (const card of cards) {
            db.runSync('INSERT INTO cards VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                card.id, card.noteId, card.deckId, card.ord, card.mod, card.usn ?? -1, card.type, card.queue,
                ankiDue(card, collectionDay), card.ivl, card.factor, card.reps, card.lapses, card.left,
                ankiOriginalDue(card, collectionDay), card.odid, card.flags, card.ankiData ?? '');
        }
        if (includeScheduling) {
            const cardIds = new Set(cards.map((card) => card.id));
            for (const row of source.revlog) {
                if (!cardIds.has(row.cardId)) continue;
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
        zip.file('collection.anki21', collection);
        const manifest: Record<string, string> = {};
        if (includeMedia) {
            const filenames = new Set<string>();
            for (const note of notes) for (const field of note.fields) {
                MEDIA_REF_RE.lastIndex = 0;
                let match: RegExpExecArray | null;
                while ((match = MEDIA_REF_RE.exec(field))) filenames.add(sanitizeMediaFilename(match[1] || match[2] || match[3]));
            }
            for (const type of noteTypes) {
                for (const source of [type.css, ...type.templates.flatMap((template) => [template.qfmt, template.afmt])]) {
                    MEDIA_REF_RE.lastIndex = 0;
                    let match: RegExpExecArray | null;
                    while ((match = MEDIA_REF_RE.exec(source))) filenames.add(sanitizeMediaFilename(match[1] || match[2] || match[3]));
                }
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
        // PackageMeta protobuf: field 1 (version) = 2, matching current legacy-schema exports.
        zip.file('meta', new Uint8Array([0x08, 0x02]));
        const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } });
        const snapshotStem = source.backupName?.replace(/\.json$/i, '');
        return {
            fileName: `${selectedCardIds ? 'secili-kartlar' : safeStem(deckName ?? snapshotStem)}.${format}`,
            mimeType: 'application/zip',
            bytes,
        };
    } finally {
        cleanup();
    }
}

function csvField(value: string): string {
    return /[\t\r\n"]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function textCardSide(value: string, withHtml: boolean, answerSide: boolean): string {
    let result = value.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '').replace(/\[\[type:[^\]]+]]/gi, '');
    if (answerSide) result = result.replace(/^[\s\S]*?<hr\s+id=["']?answer["']?\s*\/?>\s*/i, '');
    return withHtml ? result : humanizeCardText(result);
}

function buildCardsText(
    source: ExportCollectionSource,
    deckName?: string,
    selectedCardIds?: number[],
    selectedDeckIds?: number[],
    withHtml = true,
): string {
    const { notes, cards, decks } = scopedData(source, deckName, selectedCardIds, selectedDeckIds);
    const notesById = new Map(notes.map((note) => [note.id, note]));
    const types = new Map(source.noteTypes.map((type) => [type.id, type]));
    const deckNames = new Map(decks.map((deck) => [deck.id, deck.name]));
    const rows = ['#separator:tab', `#html:${withHtml}`];
    for (const card of cards) {
        const note = notesById.get(card.noteId);
        const type = note ? types.get(note.noteTypeId) : undefined;
        if (!note || !type) continue;
        const options = { deckName: deckNames.get(card.deckId), clozeOrd: card.ord };
        const question = textCardSide(renderCardHtml(type, note, card.ord, 'question', options), withHtml, false);
        const answer = textCardSide(renderCardHtml(type, note, card.ord, 'answer', options), withHtml, true);
        rows.push(`${csvField(question)}\t${csvField(answer)}`);
    }
    return rows.join('\n');
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
        text: buildExportTextFromData(exportSource, deckName, selectedNoteIds, {
            withHtml: packageOptions.includeHtml,
            withTags: packageOptions.includeTags,
            withDeck: packageOptions.includeDeck,
            withNotetype: packageOptions.includeNotetype,
            withGuid: packageOptions.includeGuid,
            preferredDeckIds: selectedDeckIds ? new Set(selectedDeckIds) : undefined,
        }),
    };
    if (format === 'cardsTxt') return {
        fileName: `${selectionStem}-kartlar.txt`,
        mimeType: 'text/plain',
        text: buildCardsText(exportSource, deckName, selectedCardIds, selectedDeckIds, packageOptions.includeHtml !== false),
    };
    // A .colpkg is always the complete collection; deck scoping belongs to .apkg.
    return buildPackage(
        exportSource,
        format,
        format === 'colpkg' ? undefined : deckName,
        includeMedia,
        selectedCardIds,
        { ...packageOptions, selectedDeckIds },
        source === undefined,
    );
}
