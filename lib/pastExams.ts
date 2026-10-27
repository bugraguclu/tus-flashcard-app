/**
 * Installs "Çıkmış TUS Denemeleri" into the collection: one deck per exam under a single root,
 * one "TUS Sorusu" note per question, in booklet order.
 *
 * The result is ordinary collection content. Unlike the paid catalog these rows carry no pack
 * marker: the learner can edit, move, reset, export and delete them like their own cards, and a
 * backup keeps them. Installation is strictly additive and repeatable — a question already in the
 * collection (found by its guid) keeps its note, card and study history, so running it again only
 * brings back what was deleted.
 */

import { Platform } from 'react-native';
import { Asset } from 'expo-asset';
import JSZip from 'jszip';
import { dbUpsertFtsCard, getDB } from './db';
import { setDbSetting } from './dbSettings';
import { getDeckByName, nextSiblingSortOrderForAppend } from './deckStore';
import { getLegacyFileSystem, readUriBytes } from './files';
import { importMediaFromZip } from './importApkgMedia';
import { DEFAULT_DECK_CONFIG, checksumField, type AnkiCard, type CardFlag, type Deck, type DeckConfig, type Note, type NoteType } from './models';
import { sortFieldText } from './noteChecksum';
import { searchIndexCardFromNote, serializeTags } from './noteStore';
import { loadBundledPastExamPack, type BundledPastExamPack } from './pastExamAsset';
import {
    PAST_EXAM_ROOT_DECK,
    comparePastExamQuestions,
    isPastExamGuid,
    parsePastExamPack,
    pastExamCourseGroup,
    pastExamDeckLeaf,
    pastExamDeckName,
    pastExamGuid,
    pastExamNoteFields,
    pastExamTags,
    type PastExamManifest,
    type PastExamPack,
    type PastExamQuestion,
    type PastExamSummary,
} from './pastExamPack';
import { TUS_QUESTION_NOTE_TYPE_ID, buildTusQuestionNoteType } from './tusQuestionCard';

export type { PastExamManifest } from './pastExamPack';

let bundledPack: BundledPastExamPack | null | undefined;

function bundledPastExamPack(): BundledPastExamPack | null {
    if (bundledPack === undefined) bundledPack = loadBundledPastExamPack();
    return bundledPack;
}

/** Counts of the pack built into the app, or null when this build carries no pack. */
export function getBundledPastExamManifest(): PastExamManifest | null {
    return bundledPastExamPack()?.manifest ?? null;
}

/** Preset the exam decks share: a whole exam fits in one day, asked in booklet order. */
export const PAST_EXAM_DECK_CONFIG_ID = 1_761_400_000_002;
const VERSION_KEY = 'tus_past_exams_version_v1';
/** Anki's ceiling for a daily limit. */
const UNLIMITED_PER_DAY = 9999;

export interface PastExamInstallResult {
    /** Questions added by this run. */
    added: number;
    /** Questions that were already in the collection and were left as they were. */
    kept: number;
    decks: number;
    media: number;
    rootDeckName: string;
}

/** What the installer needs to know about the collection it adds to. */
export interface PastExamCollectionState {
    nowMs: number;
    hasNoteType: boolean;
    hasDeckConfig: boolean;
    existingGuids: ReadonlySet<string>;
    deckIdByName: (name: string) => number | undefined;
    rootSortOrder: number;
    nextNoteId: number;
    nextCardId: number;
    nextDeckId: number;
    nextNewPosition: number;
}

export interface PastExamInstallPlan {
    noteType: NoteType | null;
    deckConfig: DeckConfig | null;
    decks: Deck[];
    notes: Note[];
    cards: AnkiCard[];
    kept: number;
}

export function buildPastExamDeckConfig(nowMs: number): DeckConfig {
    return {
        ...DEFAULT_DECK_CONFIG,
        id: PAST_EXAM_DECK_CONFIG_ID,
        name: PAST_EXAM_ROOT_DECK,
        mod: Math.floor(nowMs / 1000),
        usn: -1,
        newPerDay: UNLIMITED_PER_DAY,
        maxReviewsPerDay: UNLIMITED_PER_DAY,
        insertionOrder: 'sequential',
        newCardGatherOrder: 'deck',
    };
}

function rootDescription(pack: PastExamPack, exams: PastExamSummary[]): string {
    const years = exams.map((exam) => exam.year);
    return `${Math.min(...years)}–${Math.max(...years)} yılları arasında yapılan ${exams.length} TUS sınavının `
        + `${pack.questions.length.toLocaleString('tr-TR')} sorusu. Her alt deste bir sınavdır ve sorular kitapçıktaki sırayla gelir. `
        + 'Cevaplamak için bir seçeneğe dokunun; elemek için çift dokunun veya basılı tutun.';
}

function examDescription(exam: PastExamSummary, questions: PastExamQuestion[]): string {
    const basic = questions.filter((question) => pastExamCourseGroup(question.course) === 'Temel Bilimler').length;
    return `${exam.year} yılı ${exam.exam}. dönem TUS: ${exam.questions} soru `
        + `(Temel Bilimler ${basic}, Klinik Bilimler ${exam.questions - basic}).`;
}

/**
 * Decide every row to write, without touching the database. Exams are ordered newest first, which
 * is both their order in the deck list and the order their new cards are introduced in.
 */
export function planPastExamInstall(pack: PastExamPack, state: PastExamCollectionState): PastExamInstallPlan {
    const nowSec = Math.floor(state.nowMs / 1000);
    const questions = [...pack.questions].sort(comparePastExamQuestions);
    const exams: PastExamSummary[] = [];
    const questionsByExam = new Map<string, PastExamQuestion[]>();
    for (const question of questions) {
        const deckName = pastExamDeckName(question.year, question.exam);
        let bucket = questionsByExam.get(deckName);
        if (!bucket) {
            bucket = [];
            questionsByExam.set(deckName, bucket);
            exams.push({ year: question.year, exam: question.exam, questions: 0 });
        }
        bucket.push(question);
        exams[exams.length - 1].questions += 1;
    }

    let nextDeckId = state.nextDeckId;
    const decks: Deck[] = [];
    const deckIdFor = (name: string, create: () => Omit<Deck, 'id'>): number => {
        const existing = state.deckIdByName(name);
        if (existing !== undefined) return existing;
        const id = nextDeckId++;
        decks.push({ id, ...create() });
        return id;
    };
    const baseDeck = { configId: PAST_EXAM_DECK_CONFIG_ID, mod: nowSec, usn: -1, isFiltered: false };
    deckIdFor(PAST_EXAM_ROOT_DECK, () => ({
        ...baseDeck,
        name: PAST_EXAM_ROOT_DECK,
        sortOrder: state.rootSortOrder,
        description: rootDescription(pack, exams),
        // Fifty-four exams are a long list; the root opens on demand.
        collapsed: true,
    }));
    const examDeckIds = new Map<string, number>();
    exams.forEach((exam, index) => {
        const name = pastExamDeckName(exam.year, exam.exam);
        examDeckIds.set(name, deckIdFor(name, () => ({
            ...baseDeck,
            name,
            sortOrder: index,
            description: examDescription(exam, questionsByExam.get(name) ?? []),
            collapsed: false,
        })));
    });

    let nextNoteId = state.nextNoteId;
    let nextCardId = state.nextCardId;
    let nextPosition = state.nextNewPosition;
    const notes: Note[] = [];
    const cards: AnkiCard[] = [];
    let kept = 0;
    for (const question of questions) {
        const guid = pastExamGuid(question.id);
        if (state.existingGuids.has(guid)) {
            kept += 1;
            continue;
        }
        const fields = pastExamNoteFields(question);
        const note: Note = {
            id: nextNoteId++,
            guid,
            noteTypeId: TUS_QUESTION_NOTE_TYPE_ID,
            mod: nowSec,
            usn: -1,
            tags: pastExamTags(question),
            fields,
            sfld: sortFieldText(fields, 0),
            csum: checksumField(fields[0]),
            flags: 0,
            // Search and navigation read the unit from here; the fields stay as the note type has them.
            catalogTopic: `${question.course} · ${question.unit}`,
        };
        notes.push(note);
        cards.push({
            id: nextCardId++,
            noteId: note.id,
            deckId: examDeckIds.get(pastExamDeckName(question.year, question.exam))!,
            ord: 0,
            mod: nowSec,
            usn: -1,
            type: 0,
            queue: 0,
            due: nextPosition++,
            ivl: 0,
            factor: 0,
            reps: 0,
            lapses: 0,
            left: 0,
            odue: 0,
            odid: 0,
            flags: 0 as CardFlag,
            lastReview: 0,
        });
    }

    return {
        noteType: state.hasNoteType ? null : buildTusQuestionNoteType(),
        deckConfig: state.hasDeckConfig ? null : buildPastExamDeckConfig(state.nowMs),
        decks,
        notes,
        cards,
        kept,
    };
}

/** Swap renamed media into the pack's HTML before any note is written. */
export function applyMediaRenames(pack: PastExamPack, renames: Record<string, string>): PastExamPack {
    const entries = Object.entries(renames);
    if (entries.length === 0) return pack;
    const rename = (html: string) => entries.reduce(
        (result, [from, to]) => result.split(`src="${from}"`).join(`src="${to}"`),
        html,
    );
    return {
        ...pack,
        questions: pack.questions.map((question) => ({
            ...question,
            stem: rename(question.stem),
            options: question.options.map(rename),
            ...(question.explanation ? { explanation: rename(question.explanation) } : {}),
        })),
    };
}

async function loadBundledPack(assetModule: number): Promise<{ zip: JSZip; uri: string }> {
    const asset = Asset.fromModule(assetModule);
    await asset.downloadAsync();
    const uri = asset.localUri ?? asset.uri;
    if (!uri) throw new Error('Çıkmış TUS soruları paketi açılamadı.');
    return { zip: await JSZip.loadAsync(await readUriBytes(uri)), uri };
}

/**
 * expo-asset may stage the 7 MB pack in the cache directory to read it; once the questions are in
 * the collection that copy is dead weight. Only a cache copy is removed — the same call can hand
 * back a path inside the read-only app bundle.
 */
async function dropCachedPackCopy(uri: string): Promise<void> {
    if (Platform.OS === 'web') return;
    try {
        const fs = getLegacyFileSystem();
        if (!fs.cacheDirectory || !uri.startsWith(fs.cacheDirectory)) return;
        await fs.deleteAsync(uri, { idempotent: true });
    } catch (error) {
        // A leftover cache file costs disk, never correctness: iOS purges it under pressure.
        console.warn('[Çıkmış TUS] Önbellek kopyası silinemedi:', error);
    }
}

export async function readPastExamPack(zip: JSZip): Promise<PastExamPack> {
    const entry = zip.file('questions.json');
    if (!entry) throw new Error('Çıkmış TUS soruları paketinde soru listesi yok.');
    return parsePastExamPack(JSON.parse(await entry.async('string')));
}

function maxId(table: 'notes' | 'anki_cards' | 'decks'): number {
    return Number(getDB().getFirstSync<{ maxId: number | null }>(`SELECT MAX(id) AS maxId FROM ${table}`)?.maxId ?? 0);
}

function readCollectionState(nowMs: number): PastExamCollectionState {
    const db = getDB();
    const existingGuids = new Set<string>();
    for (const row of db.getAllSync<{ data: string }>('SELECT data FROM notes WHERE noteTypeId = ?', TUS_QUESTION_NOTE_TYPE_ID)) {
        try {
            const guid = (JSON.parse(row.data) as Note).guid;
            if (isPastExamGuid(guid)) existingGuids.add(guid);
        } catch { /* An unreadable note is the database check's to report, not a question to re-add. */ }
    }
    const nextPosition = Number(db.getFirstSync<{ maxDue: number | null }>(
        'SELECT MAX(due) AS maxDue FROM anki_cards WHERE type = 0',
    )?.maxDue ?? 0) + 1;
    const rootExists = Boolean(getDeckByName(PAST_EXAM_ROOT_DECK));
    return {
        nowMs,
        hasNoteType: Boolean(db.getFirstSync('SELECT id FROM note_types WHERE id = ?', TUS_QUESTION_NOTE_TYPE_ID)),
        hasDeckConfig: Boolean(db.getFirstSync('SELECT id FROM deck_configs WHERE id = ?', PAST_EXAM_DECK_CONFIG_ID)),
        existingGuids,
        deckIdByName: (name) => getDeckByName(name)?.id,
        rootSortOrder: rootExists ? 0 : nextSiblingSortOrderForAppend(null),
        nextNoteId: Math.max(nowMs, maxId('notes') + 1),
        nextCardId: Math.max(nowMs, maxId('anki_cards') + 1),
        nextDeckId: Math.max(nowMs, maxId('decks') + 1),
        nextNewPosition: nextPosition,
    };
}

function writePlan(plan: PastExamInstallPlan, nowMs: number): void {
    const db = getDB();
    db.execSync('BEGIN TRANSACTION;');
    try {
        if (plan.deckConfig) {
            db.runSync('INSERT INTO deck_configs (id, data) VALUES (?, ?)', plan.deckConfig.id, JSON.stringify(plan.deckConfig));
        }
        if (plan.noteType) {
            db.runSync(
                `INSERT INTO note_types (id, name, data, updated_at, usn, tombstone) VALUES (?, ?, ?, ?, -1, 0)`,
                plan.noteType.id, plan.noteType.name, JSON.stringify(plan.noteType), nowMs,
            );
        }
        for (const deck of plan.decks) {
            db.runSync(
                `INSERT INTO decks (id, name, data, updated_at, usn, tombstone) VALUES (?, ?, ?, ?, ?, 0)`,
                deck.id, deck.name, JSON.stringify(deck), nowMs, deck.usn,
            );
        }
        const noteById = new Map(plan.notes.map((note) => [note.id, note]));
        for (const note of plan.notes) {
            db.runSync(
                `INSERT INTO notes (id, noteTypeId, sfld, csum, tags, data, updated_at, usn, tombstone)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
                note.id, note.noteTypeId, note.sfld, note.csum, serializeTags(note.tags), JSON.stringify(note), nowMs, note.usn,
            );
        }
        for (const card of plan.cards) {
            db.runSync(
                `INSERT INTO anki_cards
                 (id, noteId, deckId, ord, type, queue, due, ivl, factor, reps, lapses, "left", flags,
                  data, updated_at, created_at, usn, tombstone)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
                card.id, card.noteId, card.deckId, card.ord, card.type, card.queue, card.due,
                card.ivl, card.factor, card.reps, card.lapses, card.left, card.flags,
                JSON.stringify(card), nowMs, nowMs, card.usn,
            );
            dbUpsertFtsCard(searchIndexCardFromNote(noteById.get(card.noteId)!, card.id));
        }
        db.execSync('COMMIT;');
    } catch (error) {
        db.execSync('ROLLBACK;');
        throw error;
    }
}

/** Questions of the pack that are in the collection now. */
export function countInstalledPastExamQuestions(): number {
    try {
        return Number(getDB().getFirstSync<{ count: number }>(
            'SELECT COUNT(*) AS count FROM notes WHERE noteTypeId = ?',
            TUS_QUESTION_NOTE_TYPE_ID,
        )?.count ?? 0);
    } catch {
        return 0;
    }
}

/**
 * Add the bundled exams to the collection. The pack is read and its images stored before the
 * collection is touched, and the rows go in as one transaction, so a failure leaves the
 * collection as it was.
 */
export async function installPastExams(nowMs: number = Date.now()): Promise<PastExamInstallResult> {
    const startedAt = Date.now();
    const bundled = bundledPastExamPack();
    if (!bundled) throw new Error('Bu sürümde çıkmış TUS soruları paketi yok.');
    const { manifest } = bundled;
    const { zip, uri } = await loadBundledPack(bundled.assetModule);
    let pack = await readPastExamPack(zip);
    if (pack.questions.length !== manifest.questions) {
        throw new Error(`Çıkmış TUS soruları paketi eksik: ${pack.questions.length}/${manifest.questions} soru.`);
    }

    // Images are stored before the transaction: a note must never reference a file that is not
    // there. A name taken by different bytes is stored under a new name, written into the HTML.
    // A file already stored with the same bytes (an earlier install) is listed but not re-written.
    const media = await importMediaFromZip(zip, true);
    if (media.filenames.length !== manifest.media || media.skipped !== 0) {
        throw new Error(`Soru görselleri aktarılamadı: ${media.filenames.length}/${manifest.media}. Koleksiyon değiştirilmedi.`);
    }
    pack = applyMediaRenames(pack, media.renames ?? {});

    const plan = planPastExamInstall(pack, readCollectionState(nowMs));
    writePlan(plan, nowMs);
    setDbSetting(VERSION_KEY, manifest.version);
    await dropCachedPackCopy(uri);
    console.log(
        `[Çıkmış TUS] ${plan.notes.length} soru eklendi, ${plan.kept} soru zaten vardı `
        + `(${Math.round((Date.now() - startedAt) / 100) / 10}s).`,
    );
    return {
        added: plan.notes.length,
        kept: plan.kept,
        decks: plan.decks.length,
        media: media.filenames.length,
        rootDeckName: PAST_EXAM_ROOT_DECK,
    };
}

export interface PastExamProgress {
    correct: number;
    wrong: number;
    blank: number;
    total: number;
}

/**
 * Doğru / Yanlış / Boş for the question cards in the given decks. A card's latest answer decides:
 * "Tekrar" counts as wrong, any other grade as right, and a card never answered — or reset to new —
 * as blank. The reviewer suggests "Tekrar" for a wrong option and "İyi" for the key, so following
 * its suggestion keeps these the exam result.
 */
export function getPastExamProgress(deckIds: readonly number[]): PastExamProgress {
    const progress: PastExamProgress = { correct: 0, wrong: 0, blank: 0, total: 0 };
    if (deckIds.length === 0) return progress;
    const db = getDB();
    for (let index = 0; index < deckIds.length; index += 400) {
        const chunk = deckIds.slice(index, index + 400);
        const rows = db.getAllSync<{ type: number; lastEase: number | null }>(
            `SELECT c.type AS type,
                    (SELECT r.ease FROM revlog r WHERE r.cardId = c.id AND r.ease > 0 AND r.type <> 4
                     ORDER BY r.id DESC LIMIT 1) AS lastEase
             FROM anki_cards c
             JOIN notes n ON n.id = c.noteId
             WHERE n.noteTypeId = ? AND c.deckId IN (${chunk.map(() => '?').join(',')})`,
            TUS_QUESTION_NOTE_TYPE_ID, ...chunk,
        );
        for (const row of rows) {
            progress.total += 1;
            if (Number(row.type) === 0 || row.lastEase === null) progress.blank += 1;
            else if (Number(row.lastEase) === 1) progress.wrong += 1;
            else progress.correct += 1;
        }
    }
    return progress;
}

export { PAST_EXAM_ROOT_DECK, pastExamDeckLeaf };
