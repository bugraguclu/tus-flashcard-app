import { getDB } from './db';
import { getDbSetting } from './dbSettings';
import { isCatalogPackRow } from './catalogRows';

export const CATALOG_LEARNER_DATA_KEY = 'tus_backup_catalog_learner_data_v1';
export interface CatalogLearnerData { notes: Record<string, string[]>; cards: Record<string, string> }
export function emptyCatalogLearnerData(): CatalogLearnerData { return { notes: Object.create(null), cards: Object.create(null) }; }
/** Apply only learner metadata to installed content; never import catalog note fields. */
export function applyPendingCatalogLearnerData(): void {
    const raw = getDbSetting(CATALOG_LEARNER_DATA_KEY);
    if (!raw) return;
    const stored: unknown = JSON.parse(raw);
    if (!stored || typeof stored !== 'object') throw new Error('Invalid catalog learner data');
    const data = stored as CatalogLearnerData;
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
            db.runSync('UPDATE notes SET tags = ?, data = ? WHERE id = ?', tags.length ? ` ${tags.join(' ')} ` : '', JSON.stringify({ ...note, tags }), row.id);
            delete remaining.notes[key];
        }
        for (const row of db.getAllSync<{ id: number; noteId: number; data: string }>('SELECT id, noteId, data FROM anki_cards')) {
            if (!catalogIds.has(row.noteId) || typeof data.cards?.[row.id] !== 'string') continue;
            const card = JSON.parse(row.data);
            db.runSync('UPDATE anki_cards SET data = ? WHERE id = ?', JSON.stringify({ ...card, ankiData: data.cards[row.id] }), row.id);
            delete remaining.cards[String(row.id)];
        }
        // Leave the overlay pending when entitlement installation has not happened yet.
        const pending = Object.keys(remaining.notes).length || Object.keys(remaining.cards).length ? JSON.stringify(remaining) : '';
        db.runSync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', CATALOG_LEARNER_DATA_KEY, pending);
        db.execSync('COMMIT;');
    } catch (error) { db.execSync('ROLLBACK;'); throw error; }
}
