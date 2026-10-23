import { getDB } from './db';
import { getDbSetting } from './dbSettings';
import { isCatalogPackRow } from './catalogRows';

export const CATALOG_LEARNER_DATA_KEY = 'tus_backup_catalog_learner_data_v1';
export interface CatalogLearnerData {
    notes: Record<string, string[]>;
    cards: Record<string, string>;
    /** Epoch ms the backup was taken; newer learner changes are never overwritten. */
    takenAt?: number;
}
export function emptyCatalogLearnerData(): CatalogLearnerData { return { notes: Object.create(null), cards: Object.create(null) }; }

/** The last review time an opaque card blob records (`lrt`, epoch seconds), in ms. */
function recordedReviewMs(ankiData: string): number | null {
    try {
        const value = JSON.parse(ankiData)?.lrt;
        return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value * 1000 : null;
    } catch {
        return null;
    }
}

/**
 * Put a restored backup's learner metadata — tags on catalog notes, opaque card data (FSRS memory
 * state) on catalog cards — back onto the reinstalled pack. It runs right after the pack is
 * installed (lib/bkaCatalog.ts) and never imports catalog note fields.
 *
 * Each entry is applied once, when its note or card is installed, and then leaves the pending
 * set; entries for content not installed yet stay pending for the next installation. A card
 * answered after the backup was taken (a review newer than the blob's own last review, or than
 * the backup) keeps its current data, so a late installation never rolls study back.
 */
export function applyPendingCatalogLearnerData(): void {
    const raw = getDbSetting(CATALOG_LEARNER_DATA_KEY);
    if (!raw) return;
    const stored: unknown = JSON.parse(raw);
    if (!stored || typeof stored !== 'object') throw new Error('Invalid catalog learner data');
    const data = stored as CatalogLearnerData;
    const takenAt = typeof data.takenAt === 'number' && Number.isFinite(data.takenAt) ? data.takenAt : null;
    const db = getDB(); const catalogIds = new Set<number>();
    const remaining = { notes: { ...data.notes }, cards: { ...data.cards } };
    db.execSync('BEGIN TRANSACTION;');
    try {
        for (const row of db.getAllSync<{ id: number; data: string }>('SELECT id, data FROM notes')) {
            if (!isCatalogPackRow(row.data)) continue;
            const note = JSON.parse(row.data); catalogIds.add(row.id);
            const key = note.guid || String(row.id);
            const tags = data.notes?.[key];
            if (!tags || !Array.isArray(tags) || !tags.every(tag => typeof tag === 'string')) continue;
            // Applied once, as the pack is installed: the entry leaves the pending set here, so a
            // tag edited after this installation is never rolled back by a later run.
            delete remaining.notes[key];
            db.runSync('UPDATE notes SET tags = ?, data = ? WHERE id = ?', tags.length ? ` ${tags.join(' ')} ` : '', JSON.stringify({ ...note, tags }), row.id);
        }
        const latestReview = new Map<number, number>();
        for (const row of db.getAllSync<{ cardId: number; latest: number }>('SELECT cardId, MAX(id) AS latest FROM revlog GROUP BY cardId')) {
            latestReview.set(Number(row.cardId), Number(row.latest));
        }
        for (const row of db.getAllSync<{ id: number; noteId: number; data: string }>('SELECT id, noteId, data FROM anki_cards')) {
            const overlay = data.cards?.[row.id];
            if (!catalogIds.has(row.noteId) || typeof overlay !== 'string') continue;
            delete remaining.cards[String(row.id)];
            // Reviews up to the blob's own last review (or, without one, up to the backup) are what
            // the blob already reflects; anything later means the learner studied since.
            const knownUntil = recordedReviewMs(overlay) ?? takenAt ?? 0;
            if ((latestReview.get(Number(row.id)) ?? 0) > knownUntil + 999) continue;
            const card = JSON.parse(row.data);
            db.runSync('UPDATE anki_cards SET data = ? WHERE id = ?', JSON.stringify({ ...card, ankiData: overlay }), row.id);
        }
        // Leave the overlay pending when entitlement installation has not happened yet.
        const left = Object.keys(remaining.notes).length || Object.keys(remaining.cards).length;
        const pending = left ? JSON.stringify({ ...remaining, ...(takenAt !== null ? { takenAt } : {}) }) : '';
        db.runSync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', CATALOG_LEARNER_DATA_KEY, pending);
        db.execSync('COMMIT;');
    } catch (error) { db.execSync('ROLLBACK;'); throw error; }
}
