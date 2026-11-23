import { HLC_SCALE } from '../syncContract';
import { getNumberMeta, setMeta, type SyncDb } from './syncDb';

/*
 * The persistent hybrid logical clock (docs/HESAP_SENKRON.md §6.1). A stamp is
 * `ms × 1000 + counter`. A local write takes max(last + 1, corrected wall clock); every incoming
 * stamp is observed, so a change made after seeing another device's change always stamps higher,
 * even when this device's clock is behind. The value is kept in `sync_meta` and saved in the same
 * transaction as the writes it stamped, so a restart never moves it back.
 */

export interface ClockState {
    hlc: number;
    /** Server time minus local time, in ms (corrected by half the round trip). */
    offset: number;
    /** The largest stamp seen from elsewhere, kept to rebuild the clock after `clock_ahead`. */
    remoteMax: number;
    /** The largest of this device's own stamps the server accepted. */
    ownMax: number;
}

export class SyncClock {
    private state: ClockState;
    private readonly db: SyncDb;
    private readonly now: () => number;
    private dirty = false;

    constructor(db: SyncDb, now: () => number = Date.now) {
        this.db = db;
        this.now = now;
        this.state = {
            hlc: getNumberMeta(db, 'hlc', 0),
            offset: getNumberMeta(db, 'offset', 0),
            remoteMax: getNumberMeta(db, 'remoteMax', 0),
            ownMax: getNumberMeta(db, 'ownMax', 0),
        };
    }

    get value(): number {
        return this.state.hlc;
    }

    get offset(): number {
        return this.state.offset;
    }

    wallStamp(): number {
        return Math.floor(this.now() + this.state.offset) * HLC_SCALE;
    }

    /** A stamp for a write made now. */
    tick(): number {
        this.state.hlc = Math.max(this.state.hlc + 1, this.wallStamp());
        this.dirty = true;
        return this.state.hlc;
    }

    /** Moves the clock past a stamp this device gave out without ticking (a first-link stamp). */
    witness(stamp: number): void {
        if (stamp > this.state.hlc) {
            this.state.hlc = stamp;
            this.dirty = true;
        }
    }

    /** Takes in a stamp written elsewhere. */
    observe(stamp: number): void {
        if (stamp > this.state.remoteMax) {
            this.state.remoteMax = stamp;
            this.dirty = true;
        }
        if (stamp > this.state.hlc) {
            this.state.hlc = stamp;
            this.dirty = true;
        }
    }

    /** Learns the server's time from a reply that took `roundTripMs`. */
    calibrate(serverNowMs: number, sentAtMs: number, receivedAtMs: number): void {
        const midpoint = sentAtMs + (receivedAtMs - sentAtMs) / 2;
        const offset = Math.round(serverNowMs - midpoint);
        if (Number.isFinite(offset) && offset !== this.state.offset) {
            this.state.offset = offset;
            this.dirty = true;
        }
    }

    /** Records stamps the server accepted from this device. */
    accepted(stamp: number): void {
        if (stamp > this.state.ownMax) {
            this.state.ownMax = stamp;
            this.dirty = true;
        }
    }

    /**
     * After the server refused stamps as too far ahead: start again from the corrected wall clock,
     * dropping only the refused stamps nobody has seen. It never goes below a stamp another device
     * wrote or one of this device's the server accepted, so no stamp is ever given out twice.
     */
    resetAfterClockAhead(serverNowMs: number): void {
        this.state.offset = serverNowMs - this.now();
        this.state.hlc = Math.max(this.state.remoteMax, this.state.ownMax, Math.floor(serverNowMs) * HLC_SCALE);
        this.dirty = true;
    }

    /** Writes the clock to `sync_meta`; call inside the transaction that used it. */
    save(): void {
        if (!this.dirty) return;
        setMeta(this.db, 'hlc', String(this.state.hlc));
        setMeta(this.db, 'offset', String(this.state.offset));
        setMeta(this.db, 'remoteMax', String(this.state.remoteMax));
        setMeta(this.db, 'ownMax', String(this.state.ownMax));
        this.dirty = false;
    }
}

/** Key-sorted JSON, so equal values always hash the same. */
export function stableStringify(value: unknown): string {
    if (value === undefined) return 'null';
    if (value === null || typeof value !== 'object') {
        if (typeof value === 'number' && !Number.isFinite(value)) return 'null';
        return JSON.stringify(value);
    }
    if (Array.isArray(value)) return `[${value.map((item) => (item === undefined ? 'null' : stableStringify(item))).join(',')}]`;
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).filter((key) => record[key] !== undefined).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`;
}

/** A 53-bit hash of a value (cyrb53), as a short base-36 string. */
export function hashValue(value: unknown): string {
    const text = stableStringify(value);
    let h1 = 0xdeadbeef;
    let h2 = 0x41c6ce57;
    for (let index = 0; index < text.length; index += 1) {
        const code = text.charCodeAt(index);
        h1 = Math.imul(h1 ^ code, 2654435761);
        h2 = Math.imul(h2 ^ code, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}
