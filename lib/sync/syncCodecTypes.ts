import type { SyncKind } from '../syncContract';
import type { CodecContext } from './syncContext';

/** Group name → value. A group missing from an encoding means "no value" (null). */
export type Groups = Record<string, unknown>;

/** [value hash, stamp, device number] */
export type ShadowGroup = [hash: string, hlc: number, dev: number];

export interface ShadowRow {
    kind: SyncKind;
    id: string;
    lid: string | null;
    ident: string | null;
    f: Record<string, ShadowGroup>;
}

export interface Encoded {
    kind: SyncKind;
    /** Wire id. */
    id: string;
    /** Local key (row id, or settings key). */
    lid: string;
    ident: string | null;
    groups: Groups;
    /**
     * When the row says it was last changed (ms), if it keeps that. A group this device has never
     * synced is stamped with it, so the first link orders edits made before it by their real time,
     * and untouched defaults (time 0) never win (§7.4, §7.6).
     */
    modMs: number | null;
    /**
     * Groups whose current value is one every fresh install also has (a built-in note type, the
     * Default deck, an untouched catalog card). The first time such a group is seen it is stamped
     * 0, so it never overrides what the learner set on another device (§7.4).
     */
    defaults?: ReadonlySet<string>;
}

export type WriteOutcome = { lid: string } | { park: string };

export interface Codec {
    /** The local table, or 'settings'. */
    table: string;
    kinds: readonly SyncKind[];
    /** This device's state of a row, or null when it is gone or not synced. */
    encode(ctx: CodecContext, lid: string, shadow: (kind: SyncKind, id: string) => ShadowRow | null): Encoded | null;
    /** The local key an object has on this device, when it has one. */
    localKey(ctx: CodecContext, kind: SyncKind, id: string): string | null;
    /** Writes the merged groups; parks the object when something it needs is not here yet. */
    write(ctx: CodecContext, kind: SyncKind, id: string, lid: string | null, ident: string | null, groups: Groups): WriteOutcome;
    remove(ctx: CodecContext, kind: SyncKind, lid: string): void;
}

/** `mod` columns hold seconds (Anki) or, in a few places, milliseconds. */
export function modToMs(mod: unknown): number | null {
    const value = Number(mod);
    if (!Number.isFinite(value) || value <= 0) return null;
    return value > 100_000_000_000 ? Math.floor(value) : Math.floor(value * 1000);
}

/** The object keys not covered by named groups, kept whole in an `x` group so nothing is lost. */
export function restOf(record: Record<string, unknown>, known: ReadonlySet<string>): Record<string, unknown> | null {
    const rest: Record<string, unknown> = {};
    let any = false;
    for (const [key, value] of Object.entries(record)) {
        if (known.has(key) || value === undefined) continue;
        rest[key] = value;
        any = true;
    }
    return any ? rest : null;
}

/** Puts an `x` group back: its keys are set, and other unknown keys are removed. */
export function applyRest(record: Record<string, unknown>, known: ReadonlySet<string>, rest: unknown): void {
    const incoming = rest && typeof rest === 'object' && !Array.isArray(rest) ? rest as Record<string, unknown> : {};
    for (const key of Object.keys(record)) {
        if (!known.has(key) && !(key in incoming)) delete record[key];
    }
    for (const [key, value] of Object.entries(incoming)) {
        if (!known.has(key)) record[key] = value;
    }
}
