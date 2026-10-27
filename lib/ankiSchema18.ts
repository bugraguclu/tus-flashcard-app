/**
 * Reads the note types, decks and presets of a schema-18 collection (Anki's default package format
 * since 2.1.50) into the legacy schema-11 JSON that "Support older Anki versions" writes for the
 * same collection, key for key. The importer then reads one shape whichever format a package
 * used, and keeps that JSON whole so an export can write back exactly what it was given.
 *
 * Schema 18 stores each object as a row whose options are a protobuf blob. The field numbers come
 * from Anki's .proto files (proto/anki/notetypes.proto, decks.proto, deck_config.proto); the JSON
 * each becomes was recorded from Anki 26.09.3 (scripts/anki-oracle/roundtrip.py). A blob's
 * `other` field holds the keys Anki does not model, as JSON, and they join the object unchanged.
 */

import { toF32Decimal } from './fsrs';
import { exactInteger, parseAnkiJson } from './ankiJson';
import type { SqliteReader } from './apkgFormat';

type Json = Record<string, any>;
type Value = bigint | Uint8Array;
type Message = Map<number, Value[]>;

function decode(input: unknown): Message {
    const bytes = input instanceof Uint8Array ? input : new Uint8Array((input as ArrayBufferLike) ?? 0);
    const message: Message = new Map();
    let offset = 0;
    const varint = (): bigint => {
        let value = 0n;
        for (let shift = 0n; offset < bytes.length; shift += 7n) {
            const byte = bytes[offset++];
            value |= BigInt(byte & 0x7f) << shift;
            if (!(byte & 0x80)) break;
        }
        return value;
    };
    while (offset < bytes.length) {
        const key = Number(varint());
        const wire = key & 7;
        let value: Value;
        if (wire === 0) value = varint();
        else if (wire === 2) {
            const length = Number(varint());
            value = bytes.subarray(offset, offset + length);
            offset += length;
        } else if (wire === 1 || wire === 5) {
            const length = wire === 1 ? 8 : 4;
            value = bytes.subarray(offset, offset + length);
            offset += length;
        } else {
            throw new Error(`unsupported protobuf wire type ${wire}`);
        }
        const values = message.get(key >> 3) ?? [];
        values.push(value);
        message.set(key >> 3, values);
    }
    return message;
}

const varintOf = (message: Message, field: number): bigint | undefined => {
    const value = message.get(field)?.at(-1);
    return typeof value === 'bigint' ? value : undefined;
};
const uint = (message: Message, field: number): number => Number(varintOf(message, field) ?? 0n);
const int64 = (message: Message, field: number): number | string => exactInteger(BigInt.asIntN(64, varintOf(message, field) ?? 0n));
const optionalInt64 = (message: Message, field: number): number | string | null =>
    message.has(field) ? int64(message, field) : null;
const bool = (message: Message, field: number): boolean => uint(message, field) !== 0;
const bytesOf = (message: Message, field: number): Uint8Array => {
    const value = message.get(field)?.at(-1);
    return value instanceof Uint8Array ? value : new Uint8Array();
};
const text = (message: Message, field: number): string => new TextDecoder().decode(bytesOf(message, field));
const nested = (message: Message, field: number): Message => decode(bytesOf(message, field));

/** A 32-bit float as its shortest decimal, the way Anki writes one into JSON. */
function f32(bytes: Uint8Array, offset = 0): number {
    return toF32Decimal(new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getFloat32(0, true));
}
const float = (message: Message, field: number): number => {
    const value = message.get(field)?.at(-1);
    return value instanceof Uint8Array && value.length === 4 ? f32(value) : 0;
};
/** A repeated float, packed or not. */
function floats(message: Message, field: number): number[] {
    return (message.get(field) ?? []).flatMap((value) => {
        if (!(value instanceof Uint8Array)) return [];
        return Array.from({ length: value.length / 4 }, (_, index) => f32(value, index * 4));
    });
}
/** The keys Anki keeps for other clients (`other`), as JSON. */
function other(message: Message, field = 255): Json {
    const bytes = bytesOf(message, field);
    if (!bytes.length) return {};
    const parsed = parseAnkiJson(new TextDecoder().decode(bytes));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
}

const REQUIREMENT_KIND = ['none', 'any', 'all'];

function notetype(row: Json, fieldRows: Json[], templateRows: Json[]): Json {
    const config = decode(row.config);
    return {
        id: Number(row.id), name: String(row.name), type: uint(config, 1), mod: Number(row.mtime_secs), usn: Number(row.usn),
        sortf: uint(config, 2), did: int64(config, 4) || null,
        tmpls: templateRows.map((template) => {
            const cfg = decode(template.config);
            return {
                name: String(template.name), ord: Number(template.ord), qfmt: text(cfg, 1), afmt: text(cfg, 2),
                bqfmt: text(cfg, 3), bafmt: text(cfg, 4), did: int64(cfg, 5) || null, bfont: text(cfg, 6), bsize: uint(cfg, 7),
                id: optionalInt64(cfg, 8), ...other(cfg),
            };
        }),
        flds: fieldRows.map((field) => {
            const cfg = decode(field.config);
            return {
                name: String(field.name), ord: Number(field.ord), sticky: bool(cfg, 1), rtl: bool(cfg, 2),
                font: text(cfg, 3), size: uint(cfg, 4), description: text(cfg, 5), plainText: bool(cfg, 6),
                collapsed: bool(cfg, 7), excludeFromSearch: bool(cfg, 8), id: optionalInt64(cfg, 9),
                tag: cfg.has(10) ? uint(cfg, 10) : null, preventDeletion: bool(cfg, 11), ...other(cfg),
            };
        }),
        css: text(config, 3), latexPre: text(config, 5), latexPost: text(config, 6), latexsvg: bool(config, 7),
        req: (config.get(8) ?? []).map((value) => {
            const requirement = decode(value);
            return [uint(requirement, 1), REQUIREMENT_KIND[uint(requirement, 2)] ?? 'none', repeatedUints(requirement, 3)];
        }),
        ...(uint(config, 9) ? { originalStockKind: uint(config, 9) } : {}),
        ...(config.has(10) ? { originalId: int64(config, 10) } : {}),
        ...other(config),
    };
}

/** A repeated uint32, packed (as proto3 writes it) or not. */
function repeatedUints(message: Message, field: number): number[] {
    return (message.get(field) ?? []).flatMap((value) => {
        if (typeof value === 'bigint') return [Number(value)];
        const values: number[] = [];
        let number = 0;
        let shift = 0;
        for (const byte of value) {
            number += (byte & 0x7f) * 2 ** shift;
            shift += 7;
            if (!(byte & 0x80)) {
                values.push(number);
                number = 0;
                shift = 0;
            }
        }
        return values;
    });
}

function dayLimit(message: Message, field: number): Json | null {
    if (!message.has(field)) return null;
    const limit = nested(message, field);
    return { limit: uint(limit, 1), today: uint(limit, 2) };
}

function deck(row: Json): Json {
    const common = decode(row.common);
    const kind = decode(row.kind);
    const day = uint(common, 3);
    const base = {
        id: Number(row.id), mod: Number(row.mtime_secs), name: String(row.name).replaceAll('\x1f', '::'), usn: Number(row.usn),
        lrnToday: [day, uint(common, 6)], revToday: [day, uint(common, 5)], newToday: [day, uint(common, 4)],
        timeToday: [day, uint(common, 7)], collapsed: bool(common, 1), browserCollapsed: bool(common, 2),
    };
    if (kind.has(2)) {
        const filtered = nested(kind, 2);
        const delays = floats(filtered, 3);
        return {
            ...base, desc: '', dyn: 1, ...other(common), resched: bool(filtered, 1),
            terms: (filtered.get(2) ?? []).map((value) => {
                const term = decode(value);
                return [text(term, 1), uint(term, 2), uint(term, 3)];
            }),
            separate: true, delays: delays.length ? delays : null, previewDelay: uint(filtered, 4),
            previewAgainSecs: uint(filtered, 7), previewHardSecs: uint(filtered, 5), previewGoodSecs: uint(filtered, 6),
        };
    }
    const normal = nested(kind, 1);
    return {
        ...base, desc: text(normal, 4), ...(bool(normal, 5) ? { md: true } : {}), dyn: 0, ...other(common),
        conf: Number(int64(normal, 1)), extendNew: uint(normal, 2), extendRev: uint(normal, 3),
        reviewLimit: normal.has(6) ? uint(normal, 6) : null, newLimit: normal.has(7) ? uint(normal, 7) : null,
        reviewLimitToday: dayLimit(normal, 8), newLimitToday: dayLimit(normal, 9),
        // The legacy JSON keeps the deck's own desired retention as a whole percent.
        desiredRetention: normal.has(10) ? Math.round(float(normal, 10) * 100) : null,
    };
}

/** `NewCardInsertOrder` numbers Due 0 and Random 1; the legacy `new.order` numbers them 1 and 0. */
const PROTO_INSERT_ORDER_RANDOM = 1;

function preset(row: Json): Json {
    const c = decode(row.config);
    return {
        id: Number(row.id), mod: Number(row.mtime_secs), name: String(row.name), usn: Number(row.usn),
        maxTaken: uint(c, 24), autoplay: !bool(c, 23), timer: uint(c, 25), replayq: !bool(c, 26),
        new: {
            bury: bool(c, 27), delays: floats(c, 1), initialFactor: Math.round(float(c, 11) * 1000),
            ints: [uint(c, 18), uint(c, 19), 0], order: uint(c, 20) === PROTO_INSERT_ORDER_RANDOM ? 0 : 1, perDay: uint(c, 9),
        },
        rev: { bury: bool(c, 28), ease4: float(c, 12), ivlFct: float(c, 15), maxIvl: uint(c, 16), perDay: uint(c, 10), hardFactor: float(c, 13) },
        lapse: { delays: floats(c, 2), leechAction: uint(c, 21), leechFails: uint(c, 22), minInt: uint(c, 17), mult: float(c, 14) },
        dyn: false, newMix: uint(c, 30), newPerDayMinimum: uint(c, 35), interdayLearningMix: uint(c, 31),
        reviewOrder: uint(c, 33), newSortOrder: uint(c, 32), newGatherPriority: uint(c, 34), buryInterdayLearning: bool(c, 29),
        fsrsWeights: floats(c, 3), fsrsParams5: floats(c, 5), fsrsParams6: floats(c, 6), desiredRetention: float(c, 37),
        ignoreRevlogsBeforeDate: text(c, 46), easyDaysPercentages: floats(c, 4), stopTimerOnAnswer: bool(c, 38),
        secondsToShowQuestion: float(c, 41), secondsToShowAnswer: float(c, 42), questionAction: uint(c, 36),
        answerAction: uint(c, 43), waitForAudio: bool(c, 44), sm2Retention: float(c, 40), weightSearch: text(c, 45),
        ...other(c),
    };
}

export interface Schema11Maps {
    models: Record<string, Json>;
    decks: Record<string, Json>;
    dconf: Record<string, Json>;
    conf: Json;
}

export function readSchema18(reader: SqliteReader): Schema11Maps {
    const byNotetype = (table: string) => {
        const rows = new Map<number, Json[]>();
        for (const row of reader.getAllSync<Json>(`SELECT * FROM ${table} ORDER BY ntid, ord`)) {
            rows.set(Number(row.ntid), [...(rows.get(Number(row.ntid)) ?? []), row]);
        }
        return rows;
    };
    const fields = byNotetype('fields');
    const templates = byNotetype('templates');
    const models: Record<string, Json> = {};
    for (const row of reader.getAllSync<Json>('SELECT * FROM notetypes ORDER BY id')) {
        models[String(row.id)] = notetype(row, fields.get(Number(row.id)) ?? [], templates.get(Number(row.id)) ?? []);
    }
    const decks: Record<string, Json> = {};
    for (const row of reader.getAllSync<Json>('SELECT * FROM decks ORDER BY id')) decks[String(row.id)] = deck(row);
    const dconf: Record<string, Json> = {};
    for (const row of reader.getAllSync<Json>('SELECT * FROM deck_config ORDER BY id')) dconf[String(row.id)] = preset(row);
    const conf: Json = {};
    try {
        for (const row of reader.getAllSync<Json>('SELECT KEY AS key, val FROM config')) {
            conf[String(row.key)] = parseAnkiJson(new TextDecoder().decode(row.val instanceof Uint8Array ? row.val : new Uint8Array(row.val)));
        }
    } catch { /* a package's collection may leave its config out */ }
    return { models, decks, dconf, conf };
}
