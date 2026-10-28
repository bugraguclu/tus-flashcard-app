// Image Occlusion notes made in this app, read back by Anki itself (scripts/anki-oracle/
// image_occlusion.py): Anki's Image Occlusion editor must load the same shapes, and each card must
// render the same shape <div>s for Anki's occlusion script as the app renders, so both draw the
// same masks. Anki also reads a set of hand-written and malformed Occlusion fields, and the app's
// parser must agree with it on every one.
//
// It needs Anki.app and the oracle host, so it runs only on request:
//   (cd scripts/anki-oracle && ./build-host.sh)
//   ANKI_ORACLE=1 npx vitest run lib/imageOcclusion.oracle.test.ts
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { deflateSync } from 'node:zlib';
import initSqlJs from 'sql.js';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { Platform } from 'react-native';
import { createAppDb } from '../test/sqljsHarness';

const holder = vi.hoisted(() => ({ db: null as any, media: new Map<string, Uint8Array>() }));

vi.mock('./db', () => ({
    getDB: () => holder.db,
    dbGetSchemaVersion: () => 10,
    initDB: () => {},
    dbUpsertFtsCard: () => {},
    dbIndexAllCards: () => {},
    isPrimaryTab: () => true,
}));
vi.mock('@react-native-async-storage/async-storage', () => ({ default: { getItem: async () => null, setItem: async () => {}, removeItem: async () => {}, getAllKeys: async () => [], multiRemove: async () => {} } }));
vi.mock('./mediaStore', () => ({
    sanitizeMediaFilename: (name: string) => name,
    saveMediaBytes: async (name: string, bytes: Uint8Array) => { holder.media.set(name, new Uint8Array(bytes)); },
    readMediaBytes: async (name: string) => holder.media.get(name) ?? null,
    listStoredMediaFilenames: async () => [...holder.media.keys()],
}));

import { buildAnkiExport } from './exportAnkiPackage';
import { createDeck, getAllDecks } from './deckManager';
import { createNote, saveNoteType } from './noteManager';
import {
    createOcclusionShape,
    groupOcclusionShapes,
    occlusionImageField,
    parseOcclusionField,
    rotateOcclusionShape,
    serializeOcclusionField,
    setOccludesInactive,
    setOcclusionFill,
    type OcclusionShape,
} from './imageOcclusion';
import { movePolygonCorner, turnShape } from '../components/image-occlusion/occlusionEditorModel';
import { IMAGE_OCCLUSION_NOTE_TYPE } from './imageOcclusionNoteType';
import { renderClozeAnswer, renderClozeQuestion } from './templates';

const RUN = Boolean(process.env.ANKI_ORACLE);
const ORACLE = path.resolve(__dirname, '../scripts/anki-oracle');

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
let work: string;

function oracle(...args: string[]): void {
    execFileSync(path.join(ORACLE, 'run.sh'), ['image_occlusion.py', ...args], { cwd: ORACLE, stdio: 'inherit' });
}

/** A real 40×20 PNG, so Anki can load the picture into its editor. */
function png(width: number, height: number): Uint8Array {
    const crcTable = Array.from({ length: 256 }, (_, n) => {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        return c >>> 0;
    });
    const crc = (bytes: Buffer) => {
        let c = 0xffffffff;
        for (const byte of bytes) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
        return (c ^ 0xffffffff) >>> 0;
    };
    const chunk = (type: string, data: Buffer) => {
        const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
        const length = Buffer.alloc(4);
        length.writeUInt32BE(data.length);
        const sum = Buffer.alloc(4);
        sum.writeUInt32BE(crc(body));
        return Buffer.concat([length, body, sum]);
    };
    const header = Buffer.alloc(13);
    header.writeUInt32BE(width, 0);
    header.writeUInt32BE(height, 4);
    header.set([8, 2, 0, 0, 0], 8);
    const rows = Buffer.concat(Array.from({ length: height }, () => Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3, 0x80)])));
    return new Uint8Array(Buffer.concat([
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0)),
    ]));
}

/** The app's reading in Anki's form: shapes grouped by cloze number, each group in field order. */
function grouped(shapes: readonly OcclusionShape[]) {
    const ordinals = [...new Set(shapes.map((shape) => shape.ordinal))].sort((a, b) => a - b);
    return ordinals.map((ordinal) => ({
        ordinal,
        shapes: shapes.filter((shape) => shape.ordinal === ordinal).map((shape) => [shape.kind, shape.properties.map(({ name, value }) => [name, value])]),
    }));
}

const PICTURE = { width: 40, height: 20 };

/**
 * Shapes a learner draws in the editor: every kind, turned, coloured and reshaped as the editor
 * does it, a group, and labels that need escaping.
 */
function drawnShapes(hideAll: boolean): OcclusionShape[] {
    let shapes: OcclusionShape[] = [
        createOcclusionShape({ kind: 'rect', left: 0.05, top: 0.1, width: 0.3, height: 0.2, angle: 0 }, 1, hideAll),
        createOcclusionShape({ kind: 'ellipse', left: 0.5, top: 0.55, rx: 0.12, ry: 0.2, angle: 30 }, 2, hideAll),
        createOcclusionShape({ kind: 'polygon', left: 0.1, top: 0.5, points: [[0.1, 0.5], [0.35, 0.55], [0.2, 0.9]], angle: 0 }, 3, hideAll),
        createOcclusionShape({ kind: 'rect', left: 0.7, top: 0.1, width: 0.2, height: 0.15, angle: 0 }, 4, hideAll),
        createOcclusionShape({ kind: 'text', left: 0.4, top: 0.05, text: 'Sol: ventrikül \\ sağ\nİkinci satır & <b>', scale: 1.25, fs: 0.05, angle: 0 }, 0, hideAll),
    ];
    // Turned about their centres, coloured, and a polygon given a new corner and a moved one.
    shapes[0] = rotateOcclusionShape(shapes[0], 20, PICTURE);
    shapes[1] = setOcclusionFill(rotateOcclusionShape(shapes[1], -45, PICTURE), '#8ecbff');
    shapes[2] = rotateOcclusionShape(movePolygonCorner(movePolygonCorner(shapes[2], 1, { x: 0.3, y: 0.45 }, true), 3, { x: 0.15, y: 0.95 }), 30, PICTURE);
    shapes[4] = setOcclusionFill(turnShape(shapes[4], 15, PICTURE), '#d32f2f');
    // The last mask is grouped with the first: one question asks both.
    shapes = groupOcclusionShapes(shapes, new Set([0, 3]));
    return shapes;
}

beforeAll(async () => {
    SQL = await initSqlJs({ locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm' });
    Platform.OS = 'web';
    work = mkdtempSync(path.join(tmpdir(), 'anki-occlusion-'));
});

describe.skipIf(!RUN)('Image Occlusion notes made here, read by Anki 26.09.3', () => {
    it('loads the same shapes into Anki’s editor and renders the same masks', async () => {
        holder.db = createAppDb(SQL);
        holder.media.clear();
        saveNoteType(IMAGE_OCCLUSION_NOTE_TYPE);
        const deck = createDeck('Anatomi');
        holder.media.set('kalp.png', png(PICTURE.width, PICTURE.height));
        const notes = [
            { occlusion: serializeOcclusionField(drawnShapes(true)), header: 'Kalp', backExtra: 'Ek <i>bilgi</i>' },
            { occlusion: serializeOcclusionField(setOccludesInactive(drawnShapes(true), false)), header: '', backExtra: '' },
        ];
        for (const note of notes) {
            createNote(IMAGE_OCCLUSION_NOTE_TYPE, [note.occlusion, occlusionImageField('kalp.png'), note.header, note.backExtra, ''], deck.id);
        }
        expect(getAllDecks().some((entry) => entry.name === 'Anatomi')).toBe(true);
        const artifact = await buildAnkiExport('apkg', undefined, true, undefined, { includeScheduling: true, includeDeckConfigs: true });
        writeFileSync(path.join(work, 'made.apkg'), artifact.bytes!);
        oracle('package', path.join(work, 'made.apkg'), path.join(work, 'made.json'));
        const read = JSON.parse(readFileSync(path.join(work, 'made.json'), 'utf8'));

        expect(read).toHaveLength(notes.length);
        read.forEach((anki: any, index: number) => {
            const note = notes[index];
            const shapes = parseOcclusionField(note.occlusion);
            expect(anki.fields[0]).toBe(note.occlusion);
            // A fresh Anki collection already holds its own Image Occlusion type, so Anki keeps the
            // imported one beside it under a `+` name, as it does for one from another collection.
            expect(anki.notetype).toEqual({ name: 'Image Occlusion+', originalStockKind: 6, tags: [0, 1, 2, 3, 4] });
            expect(anki.media).toEqual({ 'kalp.png': true });
            // Anki's Image Occlusion editor loads exactly the shapes the app wrote.
            expect(anki.anki).toEqual({
                groups: grouped(shapes),
                occludeInactive: index === 0,
                imageFileName: 'kalp.png',
                header: note.header,
                backExtra: note.backExtra,
            });
            // One card per question, and each side renders the shape <div>s the app renders.
            expect(anki.cards.map((card: any) => card.ord)).toEqual([0, 1, 2]);
            for (const card of anki.cards) {
                expect(card.question).toBe(renderClozeQuestion(note.occlusion, card.ord + 1));
                expect(card.answer).toBe(renderClozeAnswer(note.occlusion, card.ord + 1));
            }
        });
    }, 120_000);

    it('reads hand-written and malformed Occlusion fields as Anki does', () => {
        const fields = [
            '{{c1::image-occlusion:rect:left=.1:top=.2:width=.3:height=.4:oi=1}}<br>{{c2::image-occlusion:ellipse:left=.5:top=.5:rx=.1:ry=.2:angle=250:fill=#00ff00}}',
            '{{c3::image-occlusion:polygon:left=.1:top=.1:points=.1,.1 .2,.1 .2,.2:oi=1}} text {{c1::plain cloze}} {{c3::image-occlusion:rect:left=.6:top=.6:width=.1:height=.1:foo=bar:oi=1}}',
            '{{c0::image-occlusion:text:left=.2:top=.3:text=a\\:b\\\\c d:scale=1.5:fs=.0400:oi=1}}{{c1::image-occlusion:rect:left=0:top=0:width=1:height=1}}',
            '{{c1::image-occlusion:text:left=.1:top=.2:text=a\\xb:scale=1:fs=.04}}{{c2::image-occlusion:rect:left=.1:noeq:oi=1}}',
            '{{c1::image-occlusion:text:left=.1:top=.2:text=a:b:scale=1}}{{c1::image-occlusion:rect:left=.1:oi=1::hint}}',
            '{{c1::image-occlusion:text:left=.1:top=.2:text=x\ny & z}b:scale=2}}{{c12::image-occlusion:rect}}{{c2::image-occlusion:}}',
        ];
        writeFileSync(path.join(work, 'fields.json'), JSON.stringify(fields));
        oracle('fields', path.join(work, 'fields.json'), path.join(work, 'fields-read.json'));
        const read = JSON.parse(readFileSync(path.join(work, 'fields-read.json'), 'utf8'));
        fields.forEach((field, index) => {
            const shapes = parseOcclusionField(field);
            // Anki's editor does not list a deletion without a shape name.
            expect(read[index].anki.groups, field).toEqual(grouped(shapes.filter((shape) => shape.kind !== '')));
            expect(read[index].anki.occludeInactive, field).toBe(shapes.some((shape) => shape.properties.some((p) => p.name === 'oi' && p.value === '1')));
            for (const card of read[index].cards) {
                expect(card.question, field).toBe(renderClozeQuestion(field, card.ord + 1));
            }
            // And the app writes an untouched field back as it came.
            expect(serializeOcclusionField(shapes).replace(/<br>/g, '')).toBe(shapes.map((shape) => shape.source).join(''));
        });
    }, 120_000);
});
