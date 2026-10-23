import { withoutPackageSchedulingData } from './importApkgCardData';
import { readLegacyCollectionMeta, numberValue, importedNoteType, importedDeckConfig, importedDeck } from './importApkgMetadata';
import { sameImportedNoteShape, importedPresetKey } from './importApkgIdentity';
import { searchIndexCardFromNote } from './noteManager';
import {
    uniqueId,
    type AnkiCard,
    type CardFlag,
    type CardQueue,
    type CardType,
    type Deck,
    type DeckConfig,
    type Note,
    type NoteType,
} from './models';
import type { NewCardGatherOrder, NewCardSortOrder, ReviewSortOrder } from './types';
import { ankiDueDayToLocal } from './importApkgProgress';
import { ANKI_DEFAULT_DECK_ID, packageDecksToImport } from './importApkgDecks';
import { getDB } from './db';
import { CATALOG_LEARNER_DATA_KEY } from './backupCatalogLearnerData';
import { QUEUE_BOOKKEEPING_PREFIXES } from './backupSnapshot';
import { parsePreviewDelays } from './filteredDeckOptions';
import {
    FIELD_SEPARATOR,
    MEDIA_RE,
    type ApkgImportOptions,
    type ApkgImportResult,
    type SqliteReader,
} from './apkgFormat';

/**
 * The lossless .apkg import: note types, deck presets, decks, notes, cards and review history
 * read from a modern or legacy collection and written into this one.
 */

function sourceDueToLocal(row: any, crt: number, nowMs: number, rolloverHour: number): number {
    const due = numberValue(row.due);
    const queue = numberValue(row.queue);
    const type = numberValue(row.type);
    const effectiveQueue = queue < 0
        ? (type === 0 ? 0 : type === 2 ? 2 : (Math.abs(due) < 1_000_000 ? 3 : 1))
        : queue;
    if (effectiveQueue === 2 || effectiveQueue === 3) return ankiDueDayToLocal(due, crt, nowMs, rolloverHour);
    if (effectiveQueue === 1) return due > 0 ? due * 1000 : nowMs;
    return due;
}

function sourceOriginalDueToLocal(row: any, crt: number, nowMs: number, rolloverHour: number): number {
    const odue = numberValue(row.odue);
    if (!odue) return 0;
    const type = numberValue(row.type);
    if ((type === 1 || type === 3) && odue >= 1_000_000_000) return odue * 1000;
    return type === 1 || type === 2 || type === 3 ? ankiDueDayToLocal(odue, crt, nowMs, rolloverHour) : odue;
}

function serializeTags(tags: string[]): string {
    return tags.length ? ` ${tags.join(' ')} ` : '';
}

function nextFreeId(table: 'note_types' | 'deck_configs' | 'decks' | 'notes' | 'anki_cards' | 'revlog', preferred: number, reserved: Set<number>): number {
    const db = getDB();
    let candidate = Number.isSafeInteger(preferred) && preferred > 0 ? preferred : uniqueId();
    while (reserved.has(candidate) || db.getFirstSync(`SELECT 1 AS found FROM ${table} WHERE id = ? LIMIT 1`, candidate)) {
        candidate = uniqueId();
    }
    reserved.add(candidate);
    return candidate;
}

/**
 * Collection import with no field/template/deck flattening. Legacy schema-11
 * JSON and modern normalized protobuf metadata are both converted into the same
 * interchange model before rows are merged.
 */
export function importAnkiReaderLossless(
    reader: SqliteReader,
    options: ApkgImportOptions,
    packageId: string,
): ApkgImportResult | null {
    const meta = readLegacyCollectionMeta(reader);
    if (!meta) return null;

    const db = getDB();
    const nowMs = options.nowMs ?? Date.now();
    const rolloverHour = options.rolloverHour ?? 4;
    const withScheduling = options.withScheduling !== false;
    const withDeckConfigs = options.withDeckConfigs !== false;
    const updateNotes = options.updateNotes ?? 'ifNewer';
    const updateNoteTypes = options.updateNoteTypes ?? 'ifNewer';
    const noteRows = reader.getAllSync<any>('SELECT id, guid, mid, mod, usn, tags, flds, sfld, csum, flags, data FROM notes ORDER BY id');
    const cardRows = reader.getAllSync<any>('SELECT id, nid, did, ord, mod, usn, type, queue, due, ivl, factor, reps, lapses, left, odue, odid, flags, data FROM cards ORDER BY id');
    let revlogRows: any[] = [];
    try {
        revlogRows = reader.getAllSync<any>('SELECT id, cid, usn, ease, ivl, lastIvl, factor, time, type FROM revlog ORDER BY id');
    } catch { /* packages without history are valid */ }

    const existingNoteTypes = options.replaceCollection ? [] : db.getAllSync<{ id: number; name: string; data: string }>('SELECT id, name, data FROM note_types');
    const existingDecks = options.replaceCollection ? [] : db.getAllSync<{ id: number; name: string; data: string }>('SELECT id, name, data FROM decks');
    const existingConfigs = options.replaceCollection ? [] : db.getAllSync<{ id: number; data: string }>('SELECT id, data FROM deck_configs');
    const noteTypeMap = new Map<number, number>();
    const configMap = new Map<number, number>();
    const deckMap = new Map<number, number>();
    const reservedTypes = new Set<number>();
    const reservedConfigs = new Set<number>();
    const reservedDecks = new Set<number>();

    db.execSync('BEGIN TRANSACTION;');
    try {
        if (options.replaceCollection) {
            db.execSync(`
                DELETE FROM revlog;
                DELETE FROM anki_cards;
                DELETE FROM notes;
                DELETE FROM decks;
                DELETE FROM deck_configs;
                DELETE FROM note_types;
                DELETE FROM graves;
                DELETE FROM cards_fts;
                DELETE FROM session_stats;
            `);
            // State that belonged to the replaced collection: a backup's pending catalog overlay
            // and the queue's per-deck / per-answer bookkeeping rows.
            db.runSync('DELETE FROM settings WHERE key = ?', CATALOG_LEARNER_DATA_KEY);
            for (const prefix of QUEUE_BOOKKEEPING_PREFIXES) {
                db.runSync('DELETE FROM settings WHERE substr(key, 1, ?) = ?', prefix.length, prefix);
            }
        }
        const reservedTypeNames = new Set(existingNoteTypes.map((row) => row.name));
        for (const [sourceKey, raw] of Object.entries(meta.models)) {
            const sourceId = numberValue(raw.id, numberValue(sourceKey));
            const samePackage = existingNoteTypes.find((row) => {
                try { return (JSON.parse(row.data) as NoteType).sourcePackageId === packageId && numberValue((JSON.parse(row.data) as NoteType).ankiRaw?.id) === sourceId; }
                catch { return false; }
            });
            const candidate = importedNoteType(raw, sourceId, packageId);
            const sameOrigin = existingNoteTypes.find(row => {
                try {
                    const type = JSON.parse(row.data) as NoteType;
                    const original = type.ankiRaw?.originalId ?? type.ankiRaw?.original_id;
                    return Number(original) === sourceId && sameImportedNoteShape(type, candidate);
                } catch { return false; }
            });
            const sameIdentity = sameOrigin ?? existingNoteTypes.find((row) => row.id === sourceId);
            let targetId = samePackage?.id ?? sameIdentity?.id ?? nextFreeId('note_types', sourceId, reservedTypes);
            const existing = samePackage ?? sameIdentity;
            if (!existing) {
                const noteType = importedNoteType(raw, targetId, packageId);
                if (reservedTypeNames.has(noteType.name)) {
                    const base = `${noteType.name} (Imported)`;
                    noteType.name = base;
                    let suffix = 2;
                    while (reservedTypeNames.has(noteType.name)) noteType.name = `${base} ${suffix++}`;
                }
                reservedTypeNames.add(noteType.name);
                db.runSync(
                    'INSERT INTO note_types (id, name, data, updated_at, usn, tombstone) VALUES (?, ?, ?, ?, ?, 0)',
                    noteType.id, noteType.name, JSON.stringify(noteType), nowMs, numberValue(raw.usn, -1),
                );
            } else {
                try {
                    const current = JSON.parse(existing.data) as NoteType;
                    const incoming = importedNoteType(raw, targetId, packageId);
                    if (current.ankiRaw?.originalId != null) incoming.ankiRaw = { ...incoming.ankiRaw, originalId: current.ankiRaw.originalId };
                    const sameShape = sameImportedNoteShape(current, incoming);
                    if (!sameShape) {
                        // Anki's non-merge mode duplicates a schema-conflicting note type and
                        // remaps the incoming notes/cards to it instead of corrupting local notes.
                        targetId = nextFreeId('note_types', sourceId, reservedTypes);
                        const duplicate = importedNoteType({ ...raw, originalId: sourceId }, targetId, packageId);
                        const base = `${duplicate.name} (Imported)`;
                        duplicate.name = base;
                        let suffix = 2;
                        while (reservedTypeNames.has(duplicate.name)) duplicate.name = `${base} ${suffix++}`;
                        reservedTypeNames.add(duplicate.name);
                        db.runSync(
                            'INSERT INTO note_types (id, name, data, updated_at, usn, tombstone) VALUES (?, ?, ?, ?, ?, 0)',
                            duplicate.id, duplicate.name, JSON.stringify(duplicate), nowMs, -1,
                        );
                    }
                    const shouldUpdate = sameShape && (
                        updateNoteTypes === 'always'
                        || (updateNoteTypes === 'ifNewer' && incoming.mod > (current.mod ?? 0))
                    );
                    if (shouldUpdate) {
                        db.runSync(
                            'UPDATE note_types SET name = ?, data = ?, updated_at = ?, usn = ?, tombstone = 0 WHERE id = ?',
                            incoming.name, JSON.stringify(incoming), nowMs, -1, targetId,
                        );
                    }
                } catch { /* malformed local note types remain untouched */ }
            }
            noteTypeMap.set(sourceId, targetId);
        }

        for (const [sourceKey, raw] of Object.entries(meta.dconf)) {
            const sourceId = numberValue(raw.id, numberValue(sourceKey));
            if (!withDeckConfigs) {
                configMap.set(sourceId, 1);
                continue;
            }
            const samePackage = existingConfigs.find((row) => {
                try {
                    const parsed = JSON.parse(row.data) as DeckConfig;
                    return parsed.sourcePackageId === packageId && numberValue(parsed.ankiRaw?.id) === sourceId;
                } catch { return false; }
            });
            const incoming = importedDeckConfig(raw, sourceId, packageId);
            const sameSettings = existingConfigs.find(row => {
                try { return importedPresetKey(JSON.parse(row.data) as DeckConfig) === importedPresetKey(incoming); }
                catch { return false; }
            });
            const match = samePackage ?? sameSettings;
            const targetId = match?.id ?? nextFreeId('deck_configs', sourceId, reservedConfigs);
            configMap.set(sourceId, targetId);
            if (!match) {
                const config = importedDeckConfig(raw, targetId, packageId);
                db.runSync('INSERT INTO deck_configs (id, data) VALUES (?, ?)', config.id, JSON.stringify(config));
            }
        }

        const importedDeckNames = new Set<string>();
        const reservedDeckNames = new Set(existingDecks.map((row) => row.name));
        // Only the decks the package's cards use, chosen as Anki chooses them, so the empty Default
        // deck every package carries stays out. A collection package replaces the collection and
        // brings all of its decks. When an import without progress leaves the package's Default
        // deck out, its cards keep deck id 1 below and so join this collection's own default deck.
        const decksToImport = options.replaceCollection ? null : packageDecksToImport(
            Object.entries(meta.decks).map(([sourceKey, raw]) => ({
                id: numberValue(raw.id, numberValue(sourceKey)),
                name: String(raw.name || 'Anki Deck'),
            })),
            cardRows.map((row) => ({ did: numberValue(row.did), odid: numberValue(row.odid) })),
            { withScheduling, hasOwnDefaultDeck: existingDecks.some((row) => row.id === ANKI_DEFAULT_DECK_ID) },
        );
        for (const [sourceKey, raw] of Object.entries(meta.decks)) {
            const sourceId = numberValue(raw.id, numberValue(sourceKey));
            if (decksToImport && !decksToImport.has(sourceId)) continue;
            const sourceName = String(raw.name || 'Anki Deck');
            const sourceFiltered = numberValue(raw.dyn) === 1;
            const compatible = (row: { data: string }): boolean => {
                try { return (JSON.parse(row.data) as Deck).isFiltered === sourceFiltered; }
                catch { return false; }
            };
            const samePackage = existingDecks.find((row) => {
                try {
                    const parsed = JSON.parse(row.data) as Deck;
                    return parsed.sourcePackageId === packageId && numberValue(parsed.ankiRaw?.id) === sourceId && compatible(row);
                } catch { return false; }
            });
            const sameIdentity = existingDecks.find((row) => row.id === sourceId && row.name === sourceName && compatible(row));
            const sameName = existingDecks.find((row) => row.name === sourceName && compatible(row));
            const incompatibleName = existingDecks.find((row) => row.name === sourceName && !compatible(row));
            let name = sourceName;
            if (incompatibleName) {
                const base = `${sourceName} (Imported)`;
                name = base;
                let suffix = 2;
                while (reservedDeckNames.has(name)) name = `${base} ${suffix++}`;
            }
            reservedDeckNames.add(name);
            const targetId = samePackage?.id ?? sameIdentity?.id ?? sameName?.id ?? nextFreeId('decks', sourceId, reservedDecks);
            deckMap.set(sourceId, targetId);
            importedDeckNames.add(name);
            const existing = samePackage ?? sameIdentity ?? sameName;
            if (!existing) {
                const sourceConfigId = numberValue(raw.conf, 1);
                const deck = importedDeck({ ...raw, name }, targetId, configMap.get(sourceConfigId) ?? sourceConfigId, packageId);
                db.runSync(
                    'INSERT INTO decks (id, name, data, updated_at, usn, tombstone) VALUES (?, ?, ?, ?, ?, 0)',
                    deck.id, deck.name, JSON.stringify(deck), nowMs, deck.usn,
                );
            } else {
                try {
                    const current = JSON.parse(existing.data) as Deck;
                    if (numberValue(raw.mod) > (current.mod ?? 0)) {
                        const sourceConfigId = numberValue(raw.conf, 1);
                        const keepLocal = !withDeckConfigs || sourceConfigId === 1;
                        const incomingDeck = importedDeck({ ...raw, name }, targetId, configMap.get(sourceConfigId) ?? current.configId ?? 1, packageId);
                        const deck: Deck = { ...incomingDeck, sortOrder: current.sortOrder,
                            ...(keepLocal ? { configId: current.configId, newLimit: current.newLimit, reviewLimit: current.reviewLimit, desiredRetention: current.desiredRetention } : {}) };
                        db.runSync(
                            'UPDATE decks SET name = ?, data = ?, updated_at = ?, usn = ?, tombstone = 0 WHERE id = ?',
                            deck.name, JSON.stringify(deck), nowMs, -1, targetId,
                        );
                    }
                } catch { /* malformed local decks remain untouched */ }
            }
        }

        // Official Anki exporters include ancestors, but malformed/third-party packages do not
        // always do so. Anki creates missing parents on import; without this, a child such as
        // "Medicine::Cardiology" appears as a detached root in our deck tree.
        const installedDecks = parseRowsForImport<Deck>(db, 'decks');
        const installedNames = new Set(installedDecks.map((deck) => deck.name));
        const parentCandidates = [...importedDeckNames].flatMap((name) => {
            const parts = name.split('::');
            return parts.slice(0, -1).map((_, index) => parts.slice(0, index + 1).join('::'));
        }).sort((left, right) => left.split('::').length - right.split('::').length);
        for (const parentName of parentCandidates) {
            if (installedNames.has(parentName)) continue;
            const parentId = nextFreeId('decks', uniqueId(), reservedDecks);
            const parent: Deck = {
                id: parentId,
                name: parentName,
                configId: 1,
                mod: Math.floor(nowMs / 1000),
                usn: -1,
                description: '',
                collapsed: false,
                isFiltered: false,
                sourcePackageId: packageId,
            };
            db.runSync(
                'INSERT INTO decks (id, name, data, updated_at, usn, tombstone) VALUES (?, ?, ?, ?, -1, 0)',
                parent.id, parent.name, JSON.stringify(parent), nowMs,
            );
            installedNames.add(parentName);
        }

        const existingNotesByGuid = new Map<string, { id: number; note: Note }>();
        for (const row of db.getAllSync<{ id: number; data: string }>('SELECT id, data FROM notes')) {
            try {
                const note = JSON.parse(row.data) as Note;
                if (note.guid) existingNotesByGuid.set(note.guid, { id: Number(row.id), note });
            } catch { /* malformed local rows cannot participate in Anki guid matching */ }
        }
        const noteIdMap = new Map<number, number>();
        const importedNotes = new Map<number, Note>();
        const reservedNotes = new Set<number>();
        let duplicates = 0;
        let conflicting = 0;
        let updated = 0;
        let withMedia = 0;
        let clozeImported = 0;

        for (const row of noteRows) {
            const guid = String(row.guid ?? '');
            const sourceId = numberValue(row.id);
            const sourceMid = numberValue(row.mid);
            const targetMid = noteTypeMap.get(sourceMid);
            if (!targetMid) throw new Error(`Anki not türü bulunamadı: ${sourceMid}`);
            const fields = String(row.flds ?? '').split(FIELD_SEPARATOR);
            const tags = String(row.tags ?? '').split(/\s+/).filter(Boolean)
                .filter((tag) => withScheduling || !['marked', 'leech'].includes(tag.toLocaleLowerCase('en-US')));
            const modelRaw = meta.models[String(sourceMid)] ?? Object.values(meta.models).find((model) => numberValue(model.id) === sourceMid);
            const existing = !options.allowDuplicates && guid ? existingNotesByGuid.get(guid) : undefined;
            if (existing) {
                // A schema conflict must not attach incoming ordinals to the old note type.
                if (existing.note.noteTypeId !== targetMid) {
                    conflicting++;
                    duplicates++;
                    continue;
                }
                noteIdMap.set(sourceId, existing.id);
                const incomingMod = numberValue(row.mod);
                const shouldUpdate = existing.note.noteTypeId === targetMid && (
                    updateNotes === 'always' || (updateNotes === 'ifNewer' && incomingMod > (existing.note.mod ?? 0))
                );
                if (!shouldUpdate) {
                    duplicates++;
                    continue;
                }
                const note: Note = {
                    ...existing.note,
                    guid,
                    noteTypeId: targetMid,
                    mod: incomingMod,
                    usn: -1,
                    tags,
                    fields,
                    sfld: String(row.sfld ?? fields[numberValue(modelRaw?.sortf)] ?? fields[0] ?? ''),
                    csum: numberValue(row.csum),
                    flags: numberValue(row.flags),
                    ankiData: String(row.data ?? ''),
                    sourcePackageId: packageId,
                };
                db.runSync(
                    `UPDATE notes SET noteTypeId = ?, sfld = ?, csum = ?, tags = ?, data = ?, updated_at = ?, usn = ?, tombstone = 0
                     WHERE id = ?`,
                    note.noteTypeId, note.sfld, note.csum, serializeTags(note.tags), JSON.stringify(note), nowMs, -1, note.id,
                );
                importedNotes.set(note.id, note);
                updated++;
                continue;
            }
            const targetId = nextFreeId('notes', sourceId, reservedNotes);
            const note: Note = {
                id: targetId,
                guid,
                noteTypeId: targetMid,
                mod: numberValue(row.mod),
                usn: numberValue(row.usn, -1),
                tags,
                fields,
                sfld: String(row.sfld ?? fields[numberValue(modelRaw?.sortf)] ?? fields[0] ?? ''),
                csum: numberValue(row.csum),
                flags: numberValue(row.flags),
                ankiData: String(row.data ?? ''),
                sourcePackageId: packageId,
                catalogSubject: options.subject,
                catalogTopic: (options.topic ?? '').trim() || 'Genel',
            };
            db.runSync(
                `INSERT INTO notes (id, noteTypeId, sfld, csum, tags, data, updated_at, usn, tombstone)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
                note.id, note.noteTypeId, note.sfld, note.csum, serializeTags(note.tags), JSON.stringify(note), nowMs, note.usn,
            );
            noteIdMap.set(sourceId, targetId);
            importedNotes.set(targetId, note);
            if (fields.some((field) => MEDIA_RE.test(field))) withMedia++;
            if (numberValue(modelRaw?.type) === 1) clozeImported++;
            if (guid) existingNotesByGuid.set(guid, { id: note.id, note });
        }

        const lastReviewByCard = new Map<number, number>();
        for (const row of revlogRows) {
            const cid = numberValue(row.cid);
            lastReviewByCard.set(cid, Math.max(lastReviewByCard.get(cid) ?? 0, numberValue(row.id)));
        }
        const cardIdMap = new Map<number, number>();
        const importedCards: AnkiCard[] = [];
        const reservedCards = new Set<number>();
        const existingCardKeys = new Set(
            db.getAllSync<{ noteId: number; ord: number }>('SELECT noteId, ord FROM anki_cards')
                .map((row) => `${row.noteId}\0${row.ord}`),
        );
        let newPosition = (db.getFirstSync<{ maxDue: number | null }>(
            'SELECT MAX(due) AS maxDue FROM anki_cards WHERE type = 0',
        )?.maxDue ?? 0) + 1;
        let progressCards = 0;
        const newPositionsByNote = new Map<number, number>();
        const rowsInOrder = withScheduling ? cardRows : [...cardRows].sort((a, b) => {
            const position = (row: any) => numberValue(row.type) === 0 ? numberValue(row.odid) ? numberValue(row.odue) : numberValue(row.due) : Number.MAX_SAFE_INTEGER;
            return position(a) - position(b) || numberValue(a.id) - numberValue(b.id);
        });
        for (const row of rowsInOrder) {
            const targetNoteId = noteIdMap.get(numberValue(row.nid));
            if (!targetNoteId) continue;
            const cardKey = `${targetNoteId}\0${numberValue(row.ord)}`;
            if (existingCardKeys.has(cardKey)) continue;
            if (!withScheduling && !newPositionsByNote.has(targetNoteId)) newPositionsByNote.set(targetNoteId, newPosition++);
            const sourceCardId = numberValue(row.id);
            const targetCardId = nextFreeId('anki_cards', sourceCardId, reservedCards);
            const card: AnkiCard = {
                id: targetCardId,
                noteId: targetNoteId,
                deckId: deckMap.get(numberValue(row.did)) ?? numberValue(row.did),
                ord: numberValue(row.ord),
                mod: numberValue(row.mod),
                usn: numberValue(row.usn, -1),
                type: withScheduling ? Math.min(3, Math.max(0, numberValue(row.type))) as CardType : 0,
                queue: withScheduling ? Math.min(4, Math.max(-3, numberValue(row.queue))) as CardQueue : 0,
                due: withScheduling ? sourceDueToLocal(row, meta.crt, nowMs, rolloverHour) : newPositionsByNote.get(targetNoteId)!,
                ivl: withScheduling ? numberValue(row.ivl) : 0,
                factor: withScheduling ? numberValue(row.factor) : 0,
                reps: withScheduling ? numberValue(row.reps) : 0,
                lapses: withScheduling ? numberValue(row.lapses) : 0,
                left: withScheduling ? numberValue(row.left) : 0,
                odue: withScheduling ? sourceOriginalDueToLocal(row, meta.crt, nowMs, rolloverHour) : 0,
                odid: withScheduling ? deckMap.get(numberValue(row.odid)) ?? numberValue(row.odid) : 0,
                // Anki keeps the user flag in the low three bits of this field and reserves the
                // rest, so the flag is masked out rather than clamped: a card stored as 9
                // (flag 1 plus a reserved bit) is red in Anki, and clamping turned it turquoise.
                flags: (withScheduling ? numberValue(row.flags) & 0b111 : 0) as CardFlag,
                lastReview: withScheduling ? lastReviewByCard.get(sourceCardId) ?? 0 : 0,
                ankiData: withScheduling ? String(row.data ?? '') : withoutPackageSchedulingData(String(row.data ?? '')),
                sourcePackageId: packageId,
            };
            db.runSync(
                `INSERT INTO anki_cards
                 (id, noteId, deckId, ord, type, queue, due, ivl, factor, reps, lapses, "left", flags, data, updated_at, created_at, usn, tombstone)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
                card.id, card.noteId, card.deckId, card.ord, card.type, card.queue, card.due, card.ivl,
                card.factor, card.reps, card.lapses, card.left, card.flags, JSON.stringify(card), nowMs, nowMs, card.usn,
            );
            cardIdMap.set(sourceCardId, targetCardId);
            existingCardKeys.add(cardKey);
            importedCards.push(card);
            if (card.type !== 0 || card.queue !== 0 || card.reps > 0) progressCards++;
        }

        const reservedRevlog = new Set<number>();
        let progressReviews = 0;
        for (const row of withScheduling ? revlogRows : []) {
            const targetCardId = cardIdMap.get(numberValue(row.cid));
            if (!targetCardId) continue;
            const targetReviewId = nextFreeId('revlog', numberValue(row.id), reservedRevlog);
            db.runSync(
                `INSERT INTO revlog (id, cardId, usn, ease, ivl, lastIvl, factor, time, type)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                targetReviewId, targetCardId, numberValue(row.usn, -1), numberValue(row.ease), numberValue(row.ivl),
                numberValue(row.lastIvl), numberValue(row.factor), numberValue(row.time), numberValue(row.type),
            );
            progressReviews++;
        }
        const indexNotes = new Map([...existingNotesByGuid.values()].map(({ note }) => [note.id, note]));
        for (const [id, note] of importedNotes) indexNotes.set(id, note);
        const indexed = importedCards.map((card) => searchIndexCardFromNote(indexNotes.get(card.noteId)!, card.id));
        db.execSync('COMMIT;');

        return {
            totalNotes: noteRows.length,
            added: importedNotes.size - updated,
            updated,
            duplicates,
            conflicting,
            emptyRows: 0,
            clozeImported,
            cardsImported: importedCards.length,
            structurePreserved: true,
            withMedia,
            progressCards,
            progressReviews,
            mediaImported: 0,
            mediaSkipped: 0,
            indexed,
        };
    } catch (error) {
        db.execSync('ROLLBACK;');
        throw error;
    }
}

function parseRowsForImport<T>(db: ReturnType<typeof getDB>, table: 'decks'): T[] {
    return db.getAllSync<{ data: string }>(`SELECT data FROM ${table}`).flatMap((row) => {
        try { return [JSON.parse(row.data) as T]; } catch { return []; }
    });
}
