import { getDeckDisplayName } from '../models';
import type { ApplySummary } from './syncApply';
import type { SyncEnv } from './syncCapture';
import { DUPLICATE_MARK, renameSubdecks } from './syncCodecsDecks';

/*
 * Repairs every device makes the same way after taking in other devices' changes
 * (docs/HESAP_SENKRON.md §6.4). The rows they change are marked and captured as derived writes,
 * stamped one step above the version they correct, so they replace that state but never a real
 * edit made after it. Two devices making the same repair write the same values.
 *
 * - Two decks under one full name (two devices each made "Anatomi" offline): the one with the
 *   smaller id stays; the other's cards and subdecks move into it and it is deleted.
 * - Subdecks of a deck another device deleted move to the top level.
 * - A card in a deck that no longer exists moves to the deck that deck was merged into, else to
 *   the Default deck.
 */

const MAX_ROUNDS = 50;

function markDirty(env: SyncEnv, table: string, ids: readonly (number | string)[]): void {
    for (const id of ids) env.db.runSync('INSERT INTO sync_dirty (tbl, rid) VALUES (?, ?)', table, String(id));
}

function deckIdsUnder(env: SyncEnv, name: string): number[] {
    return env.db.getAllSync<{ id: number }>(
        'SELECT id FROM decks WHERE name = ? OR substr(name, 1, ?) = ?',
        name, name.length + 2, `${name}::`,
    ).map((row) => Number(row.id));
}

/** Renames a deck and its subtree, marking every row that moved. */
function renameDeckTree(env: SyncEnv, id: number, oldName: string, newName: string): void {
    const affected = deckIdsUnder(env, oldName);
    const data = env.ctx.parse(env.db.getFirstSync<{ data: string }>('SELECT data FROM decks WHERE id = ?', id)?.data) ?? {};
    data.name = newName;
    env.db.runSync('UPDATE decks SET name = ?, data = ? WHERE id = ?', newName, JSON.stringify(data), id);
    renameSubdecks(env.ctx, oldName, newName);
    markDirty(env, 'decks', affected);
}

function moveCards(env: SyncEnv, fromDeck: number, toDeck: number): void {
    const { db } = env;
    const cards = db.getAllSync<{ id: number }>(
        "SELECT id FROM anki_cards WHERE deckId = ? OR json_extract(data, '$.odid') = ?",
        fromDeck, fromDeck,
    ).map((row) => Number(row.id));
    if (cards.length === 0) return;
    db.runSync("UPDATE anki_cards SET deckId = ?, data = json_set(data, '$.deckId', ?) WHERE deckId = ?", toDeck, toDeck, fromDeck);
    db.runSync("UPDATE anki_cards SET data = json_set(data, '$.odid', ?) WHERE json_extract(data, '$.odid') = ?", toDeck, fromDeck);
    markDirty(env, 'anki_cards', cards);
}

function mergeDeck(env: SyncEnv, loser: { id: number; name: string }, winner: { id: number; name: string }): void {
    const { db } = env;
    moveCards(env, loser.id, winner.id);
    // Subdecks follow into the winner; one that collides there is merged in a later round.
    const children = deckIdsUnder(env, loser.name).filter((id) => id !== loser.id);
    renameSubdecks(env.ctx, loser.name, winner.name);
    markDirty(env, 'decks', children);
    db.runSync('DELETE FROM decks WHERE id = ?', loser.id);
    for (const prefix of ['filtered_membership_v1:', 'deck_today_limits:', 'deck_today_boost:']) {
        db.runSync('DELETE FROM settings WHERE key = ?', `${prefix}${loser.id}`);
    }
    db.runSync('INSERT OR REPLACE INTO sync_merged (loser, winner) VALUES (?, ?)', loser.id, winner.id);
    markDirty(env, 'decks', [loser.id]);
}

function repairDuplicateNames(env: SyncEnv): number {
    const { db } = env;
    let merged = 0;
    for (let round = 0; round < MAX_ROUNDS; round += 1) {
        const dup = db.getFirstSync<{ id: number; name: string }>(
            'SELECT id, name FROM decks WHERE instr(name, ?) > 0 ORDER BY length(name), id LIMIT 1',
            DUPLICATE_MARK,
        );
        if (!dup) break;
        const base = dup.name.slice(0, dup.name.indexOf(DUPLICATE_MARK));
        const holder = db.getFirstSync<{ id: number; name: string }>('SELECT id, name FROM decks WHERE name = ?', base);
        if (!holder) {
            renameDeckTree(env, Number(dup.id), dup.name, base);
            continue;
        }
        const dupId = Number(dup.id);
        const holderId = Number(holder.id);
        if (dupId < holderId) {
            // The smaller id keeps the name on every device.
            const aside = `${base}${DUPLICATE_MARK}${holderId}`;
            renameDeckTree(env, holderId, base, aside);
            renameDeckTree(env, dupId, dup.name, base);
            mergeDeck(env, { id: holderId, name: aside }, { id: dupId, name: base });
        } else {
            mergeDeck(env, { id: dupId, name: dup.name }, { id: holderId, name: base });
        }
        merged += 1;
    }
    return merged;
}

/**
 * Subdecks of a deck another device deleted follow it into the deck it was merged into, or move
 * to the top level. They are re-captured either way: their parent is a different deck now, even
 * when a new deck took the old parent's name.
 */
function repairOrphanedSubdecks(env: SyncEnv): void {
    const removed = env.ctx.removedDecks.splice(0);
    for (const { id, name, children: childIds } of removed) {
        const children = childIds
            .map((childId) => env.db.getFirstSync<{ id: number; name: string }>('SELECT id, name FROM decks WHERE id = ?', childId))
            .filter((row): row is { id: number; name: string } => Boolean(row) && row!.name.startsWith(`${name}::`));
        let winner: { id: number; name: string } | null = null;
        let hop = id;
        for (let depth = 0; depth < 20 && !winner; depth += 1) {
            const next = env.db.getFirstSync<{ winner: number }>('SELECT winner FROM sync_merged WHERE loser = ?', hop)?.winner;
            if (next === undefined) break;
            const row = env.db.getFirstSync<{ id: number; name: string }>('SELECT id, name FROM decks WHERE id = ?', next);
            if (row) winner = { id: Number(row.id), name: row.name };
            hop = Number(next);
        }
        for (const child of children) {
            const leaf = getDeckDisplayName(child.name);
            const wanted = winner ? `${winner.name}::${leaf}` : leaf;
            const taken = env.db.getFirstSync<{ id: number }>('SELECT id FROM decks WHERE name = ?', wanted);
            const target = taken && Number(taken.id) !== Number(child.id) ? `${wanted}${DUPLICATE_MARK}${child.id}` : wanted;
            if (target !== child.name) renameDeckTree(env, Number(child.id), child.name, target);
            else markDirty(env, 'decks', deckIdsUnder(env, child.name));
        }
    }
}

function repairCardsInMissingDecks(env: SyncEnv): void {
    const { db } = env;
    const stray = db.getAllSync<{ deckId: number }>(
        'SELECT DISTINCT deckId FROM anki_cards WHERE deckId NOT IN (SELECT id FROM decks)',
    ).map((row) => Number(row.deckId));
    const strayOriginal = db.getAllSync<{ odid: number }>(
        "SELECT DISTINCT CAST(json_extract(data, '$.odid') AS INTEGER) AS odid FROM anki_cards WHERE COALESCE(json_extract(data, '$.odid'), 0) != 0 AND CAST(json_extract(data, '$.odid') AS INTEGER) NOT IN (SELECT id FROM decks)",
    ).map((row) => Number(row.odid));
    for (const missing of new Set([...stray, ...strayOriginal])) {
        let target = 1;
        let hop = missing;
        for (let depth = 0; depth < 20; depth += 1) {
            const next = db.getFirstSync<{ winner: number }>('SELECT winner FROM sync_merged WHERE loser = ?', hop)?.winner;
            if (next === undefined) break;
            if (db.getFirstSync('SELECT 1 AS x FROM decks WHERE id = ?', next)) {
                target = Number(next);
                break;
            }
            hop = Number(next);
        }
        if (!db.getFirstSync('SELECT 1 AS x FROM decks WHERE id = ?', target)) continue;
        moveCards(env, missing, target);
    }
}

export function repairCollection(env: SyncEnv, _summary: ApplySummary): void {
    repairOrphanedSubdecks(env);
    repairDuplicateNames(env);
    repairCardsInMissingDecks(env);
    env.ctx.reset();
}
