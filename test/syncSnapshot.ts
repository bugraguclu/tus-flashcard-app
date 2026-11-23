// A device's learning data in a form two devices can be compared by: everything sync carries,
// nothing that is allowed to differ (modification times, usn, device-only settings).
import type { SyncDb } from './sqljsHarness';
import { COLLECTION_SETTINGS } from '../lib/sync/syncCodecsOther';
import { DEFAULT_SETTINGS } from '../lib/settingsStore';

const parse = (raw: string): Record<string, any> => JSON.parse(raw);
const without = (record: Record<string, any>, keys: string[]) => {
    const copy = { ...record };
    for (const key of keys) delete copy[key];
    return copy;
};

export function collectionSnapshot(db: SyncDb) {
    const cards = db.getAllSync<{ id: number; data: string; queue: number; deckId: number }>('SELECT id, data, queue, deckId FROM anki_cards ORDER BY id')
        .map((row) => {
            const card = parse(row.data);
            // A sibling bury lasts until the day ends on the device that made it; keep the queue.
            return { ...without(card, ['mod', 'usn']), queue: row.queue, column: row.deckId };
        });
    const notes = db.getAllSync<{ data: string }>('SELECT data FROM notes ORDER BY id').map((row) => {
        const note = parse(row.data);
        return { ...without(note, ['mod', 'usn']), tags: [...(note.tags ?? [])].map((tag: string) => tag.toLowerCase()).sort() };
    });
    const decks = db.getAllSync<{ id: number; name: string; data: string }>('SELECT id, name, data FROM decks ORDER BY id')
        .map((row) => ({ name: row.name, ...without(parse(row.data), ['mod', 'usn', 'name']) }));
    const presets = db.getAllSync<{ data: string }>('SELECT data FROM deck_configs ORDER BY id').map((row) => without(parse(row.data), ['mod', 'usn']));
    const noteTypes = db.getAllSync<{ data: string }>('SELECT data FROM note_types ORDER BY id').map((row) => without(parse(row.data), ['mod', 'usn']));
    const revlog = db.getAllSync('SELECT id, cardId, ease, ivl, lastIvl, factor, time, type FROM revlog ORDER BY id');
    const sessions = db.getAllSync('SELECT id, subject, kind, pass, startMs, endMs, studyMs, breakMs, breakCount, note, source FROM study_sessions ORDER BY id');
    const rawMeta = db.getFirstSync<{ value: string }>("SELECT value FROM settings WHERE key = 'tus_app_settings_meta_v1'")?.value;
    const meta = rawMeta ? parse(rawMeta) : {};
    // A setting never written reads as its default, so "missing" and "default" are the same value.
    const defaults = DEFAULT_SETTINGS as unknown as Record<string, unknown>;
    const learning = Object.fromEntries(COLLECTION_SETTINGS.map((key) => [key, meta[key] ?? defaults[key] ?? null]));
    const synced = db.getAllSync<{ key: string; value: string }>(
        "SELECT key, value FROM settings WHERE key IN ('user_subjects_v1', 'tus_stopwatch_prefs_v1', 'tus_study_plans_v1') ORDER BY key",
    );
    return { cards, notes, decks, presets, noteTypes, revlog, sessions, learning, synced };
}
