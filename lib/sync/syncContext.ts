import { localDayNumber } from '../ankiState';
import { CATALOG_PACK_ID } from '../catalogRows';
import type { SyncKind } from '../syncContract';
import type { SyncDb } from './syncDb';

/*
 * What the codecs need to translate between this device's rows and the wire (§7.3):
 *
 * - References. A learner's deck, preset or note type is referred to by its id, which is the same
 *   on every device. A catalog row may sit under a different local id on each device
 *   (lib/catalogIds.ts), so a reference to it travels as `c:<package id>`.
 * - Today's day number, for buries (a bury only lasts for the day it was made).
 */

export type WireRef = number | string;

type CatalogTable = 'decks' | 'deck_configs' | 'note_types';

interface CatalogIndex {
    /** local id → package id */
    toSource: Map<number, number>;
    /** package id → local id */
    toLocal: Map<number, number>;
}

function parseJson(raw: unknown): Record<string, unknown> | null {
    if (typeof raw !== 'string') return null;
    try {
        const parsed = JSON.parse(raw) as unknown;
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
    } catch {
        return null;
    }
}

export class CodecContext {
    readonly db: SyncDb;
    readonly now: () => number;
    private readonly catalog = new Map<CatalogTable, CatalogIndex>();
    private readonly catalogNotes = new Map<number, boolean>();
    private rollover: number | null = null;
    /** Rows the sync changed as a consequence of what it applied, captured afterwards as derived writes. */
    readonly touched: Array<[table: string, key: string]> = [];
    /** Decks the sync removed, whose surviving subdecks the repair pass moves to the top level. */
    readonly removedDecks: Array<{ id: number; name: string; children: number[] }> = [];

    constructor(db: SyncDb, now: () => number = Date.now) {
        this.db = db;
        this.now = now;
    }

    /** Forget cached lookups after rows were written. */
    reset(): void {
        this.catalog.clear();
        this.catalogNotes.clear();
        this.rollover = null;
    }

    parse(raw: unknown): Record<string, unknown> | null {
        return parseJson(raw);
    }

    rolloverHour(): number {
        if (this.rollover === null) {
            const raw = this.db.getFirstSync<{ value: string }>("SELECT value FROM settings WHERE key = 'tus_app_settings_meta_v1'")?.value;
            const hour = Number(parseJson(raw)?.dayRolloverHour);
            this.rollover = Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : 4;
        }
        return this.rollover;
    }

    today(): number {
        return localDayNumber(this.now(), this.rolloverHour());
    }

    private index(table: CatalogTable): CatalogIndex {
        let index = this.catalog.get(table);
        if (!index) {
            index = { toSource: new Map(), toLocal: new Map() };
            const rows = this.db.getAllSync<{ id: number; data: string }>(`SELECT id, data FROM ${table} WHERE instr(data, ?) > 0`, CATALOG_PACK_ID);
            for (const row of rows) {
                const data = parseJson(row.data);
                if (data?.catalogPack !== CATALOG_PACK_ID) continue;
                const id = Number(row.id);
                const source = typeof data.catalogSourceId === 'number' ? data.catalogSourceId : id;
                index.toSource.set(id, source);
                if (!index.toLocal.has(source) || id === source) index.toLocal.set(source, id);
            }
            this.catalog.set(table, index);
        }
        return index;
    }

    /** The package id of a catalog row, or null for the learner's own row. */
    catalogSource(table: CatalogTable, localId: number): number | null {
        return this.index(table).toSource.get(localId) ?? null;
    }

    catalogLocal(table: CatalogTable, sourceId: number): number | null {
        return this.index(table).toLocal.get(sourceId) ?? null;
    }

    ref(table: CatalogTable, localId: number | null | undefined): WireRef {
        if (localId === null || localId === undefined || !Number.isFinite(localId)) return 0;
        const source = this.catalogSource(table, localId);
        return source === null ? localId : `c:${source}`;
    }

    /** The local id a reference points to, or null when that row is not on this device. */
    local(table: CatalogTable, ref: unknown): number | null {
        if (typeof ref === 'number') {
            if (ref === 0) return 0;
            return this.db.getFirstSync(`SELECT 1 AS x FROM ${table} WHERE id = ?`, ref) ? ref : null;
        }
        if (typeof ref === 'string' && ref.startsWith('c:')) {
            const source = Number(ref.slice(2));
            return Number.isFinite(source) ? this.catalogLocal(table, source) : null;
        }
        return null;
    }

    /** Whether a note (by id) belongs to the paid catalog. */
    isCatalogNote(noteId: number): boolean {
        let cached = this.catalogNotes.get(noteId);
        if (cached === undefined) {
            const raw = this.db.getFirstSync<{ data: string }>('SELECT data FROM notes WHERE id = ?', noteId)?.data;
            cached = typeof raw === 'string' && raw.includes(CATALOG_PACK_ID) && parseJson(raw)?.catalogPack === CATALOG_PACK_ID;
            this.catalogNotes.set(noteId, cached);
        }
        return cached;
    }

    noteCatalogFlag(noteId: number, isCatalog: boolean): void {
        this.catalogNotes.set(noteId, isCatalog);
    }
}

/** Kinds that carry the learner's state on the paid catalog, keyed by package ids. */
export const CATALOG_KINDS: ReadonlySet<SyncKind> = new Set<SyncKind>(['ccard', 'cnote', 'cdeck', 'cpreset']);
