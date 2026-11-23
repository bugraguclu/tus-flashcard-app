/*
 * The two-way sync's wire contract, shared by the app (`lib/sync/`) and the account server
 * (`server/account/sync*.ts`). Keep this file import-free: Node runs the server's TypeScript
 * directly, and this file is loaded by both sides. The design is `docs/HESAP_SENKRON.md`.
 *
 * Every synced object is a map of field groups. Each group carries its value, the hybrid logical
 * clock stamp it was written at, and the short number of the device that wrote it. Both sides
 * keep, per group, whichever version has the larger (stamp, device) pair, so every copy reaches
 * the same state whatever the order, delay or repetition of the messages.
 */

/** Raised when the wire format changes incompatibly; the server refuses older clients. */
export const SYNC_FORMAT = 1;

/** A stamp is `milliseconds × HLC_SCALE + counter`, inside JavaScript's safe integers. */
export const HLC_SCALE = 1000;

/** The server refuses stamps this far ahead of its own clock (`clock_ahead`). */
export const MAX_CLOCK_AHEAD_MS = 5 * 60 * 1000;

/** One request body's limit on the sync endpoints. The client keeps each part well below it. */
export const SYNC_MAX_BODY_BYTES = 2 * 1024 * 1024;

/** What the client aims for per push part, leaving room for JSON overhead. */
export const SYNC_PART_BYTES = 768 * 1024;

/** How long a long poll waits for another device's change before answering "nothing new". */
export const SYNC_WAIT_MS = 20_000;

/** Objects per pull page. */
export const SYNC_PULL_PAGE = 2_000;

/** Header carrying the client's random device id. */
export const SYNC_DEVICE_HEADER = 'x-device';

/**
 * Object kinds. The `c…` kinds are the learner's state on the paid catalog: keyed by the
 * package's ids, carrying only the learner's own fields, never the catalog's content.
 */
export const SYNC_KINDS = [
    'ntype', 'preset', 'cpreset', 'deck', 'cdeck', 'note', 'cnote', 'card', 'ccard', 'rev', 'sess', 'set',
] as const;
export type SyncKind = typeof SYNC_KINDS[number];

export function isSyncKind(value: unknown): value is SyncKind {
    return typeof value === 'string' && (SYNC_KINDS as readonly string[]).includes(value);
}

/** A group as the server stores and sends it: value, stamp, device number. */
export type WireGroup = [value: unknown, hlc: number, dev: number];

/** A group as a device pushes it; the server adds the device number it knows the device by. */
export type PushGroup = [value: unknown, hlc: number];

export interface WireObject {
    k: SyncKind;
    id: string;
    /** The object's identity trace (GUID, name at creation, ...); null when the kind has none. */
    ident: string | null;
    f: Record<string, WireGroup>;
}

export interface PushObject {
    k: SyncKind;
    id: string;
    ident: string | null;
    f: Record<string, PushGroup>;
}

export interface PushBatch {
    /** Random id shared by the parts of one push. */
    id: string;
    part: number;
    /** The last part: the server merges every part of the batch in one transaction. */
    final: boolean;
}

export interface PushRequest {
    format: number;
    objs: PushObject[];
    batch?: PushBatch;
}

export interface SyncConflict {
    k: SyncKind;
    id: string;
    /** The identity the server holds for that id. */
    ident: string | null;
    /** The object the server holds under that id, so the device can take it in at once. */
    f: Record<string, WireGroup>;
}

export interface PushReply {
    /** The account's change counter after this push. */
    usn: number;
    /** The server's clock (ms). */
    now: number;
    /** True for a non-final part: it was stored and waits for the rest of its batch. */
    staged?: boolean;
    /** The usn this push's own changes landed at, or null when nothing changed. */
    ownUsn?: number | null;
    /** For every pushed group that lost, the version that beat it. */
    win: WireObject[];
    /** Objects refused because the server holds a different object under the same id. */
    conflicts: SyncConflict[];
}

export interface PullReply {
    objs: WireObject[];
    /** The account's change counter when this page was read. */
    usn: number;
    /** Continue with this cursor; null when the client has everything up to `usn`. */
    next: string | null;
    now: number;
}

export interface SyncStateReply {
    usn: number;
    /** This device's short number, used to break ties between equal stamps. */
    dev: number;
    now: number;
    format: number;
}

export interface WaitReply {
    usn: number;
    now: number;
    changed: boolean;
}

export interface SyncDeviceInfo {
    dev: number;
    name: string;
    platform: string;
    lastSeenAt: string;
    current: boolean;
}

export type SyncErrorCode =
    | 'clock_ahead'
    | 'format_too_old'
    | 'device_unknown'
    | 'quota_exceeded'
    | 'batch_expired';

/** Compares two (stamp, device) versions: positive when `a` wins. */
export function compareVersion(aHlc: number, aDev: number, bHlc: number, bDev: number): number {
    if (aHlc !== bHlc) return aHlc > bHlc ? 1 : -1;
    if (aDev !== bDev) return aDev > bDev ? 1 : -1;
    return 0;
}

export function isValidStamp(value: unknown): value is number {
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

/** Group names are short, printable and never collide with JSON's own keys. */
export function isValidGroupName(value: string): boolean {
    return value.length > 0 && value.length <= 200 && !/[\u0000-\u001f]/.test(value) && value !== '__proto__';
}

export function isValidObjectId(value: unknown): value is string {
    return typeof value === 'string' && value.length > 0 && value.length <= 200 && !/[\u0000-\u001f]/.test(value);
}
