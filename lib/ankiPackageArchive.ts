/**
 * Original Anki package preservation.
 *
 * A reconstructed SQLite/ZIP package can be semantically identical without being
 * byte-identical (SQLite page layout, ZIP timestamps and compression differ).  We
 * therefore retain the uploaded bytes while imported rows remain pristine.  The
 * first local edit/review marks the package dirty and export falls back to the
 * fully reconstructed package.
 */

import type { AnkiCard, Note } from './models';
import { getDB } from './db';
import { readMediaBytes, saveMediaBytes, sanitizeMediaFilename } from './mediaStore';

const META_PREFIX = 'anki_source_package_v1:';
const ARCHIVE_PREFIX = 'tusanki-source-';

export interface AnkiSourcePackageMeta {
    id: string;
    fileName: string;
    archiveName: string;
    importedAt: number;
    noteCount: number;
    cardCount: number;
    exactEligible: boolean;
    dirty: boolean;
}

/** Small deterministic fingerprint; identity only, not a security primitive. */
export function sourcePackageId(bytes: Uint8Array): string {
    let a = 0x811c9dc5;
    let b = 0x9e3779b9;
    for (let i = 0; i < bytes.length; i++) {
        a = Math.imul(a ^ bytes[i], 0x01000193);
        b = Math.imul(b ^ bytes[i], 0x85ebca6b);
    }
    return `${bytes.length.toString(36)}-${(a >>> 0).toString(36)}-${(b >>> 0).toString(36)}`;
}

function settingKey(id: string): string {
    return `${META_PREFIX}${id}`;
}

function readMeta(id: string): AnkiSourcePackageMeta | null {
    try {
        const row = getDB().getFirstSync<{ value: string }>('SELECT value FROM settings WHERE key = ?', settingKey(id));
        return row?.value ? JSON.parse(row.value) as AnkiSourcePackageMeta : null;
    } catch {
        return null;
    }
}

function writeMeta(meta: AnkiSourcePackageMeta): void {
    getDB().runSync(
        'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
        settingKey(meta.id),
        JSON.stringify(meta),
    );
}

export async function preserveOriginalAnkiPackage(
    bytes: Uint8Array,
    options: { fileName?: string; noteCount: number; cardCount: number; exactEligible: boolean },
): Promise<AnkiSourcePackageMeta> {
    const id = sourcePackageId(bytes);
    const archiveName = `${ARCHIVE_PREFIX}${id}.apkg`;
    await saveMediaBytes(archiveName, bytes, 'application/zip');
    const meta: AnkiSourcePackageMeta = {
        id,
        fileName: sanitizeMediaFilename(options.fileName || 'anki-import.apkg'),
        archiveName,
        importedAt: Date.now(),
        noteCount: options.noteCount,
        cardCount: options.cardCount,
        exactEligible: options.exactEligible,
        dirty: false,
    };
    writeMeta(meta);
    return meta;
}

export function markSourcePackageDirty(id: string | undefined): void {
    if (!id) return;
    const meta = readMeta(id);
    if (!meta || meta.dirty) return;
    writeMeta({ ...meta, dirty: true });
}

/** Return original bytes only when the requested scope is the complete pristine import. */
export async function pristineOriginalForExport(
    notes: Note[],
    cards: AnkiCard[],
    includeMedia: boolean,
): Promise<{ fileName: string; bytes: Uint8Array } | null> {
    if (!includeMedia || notes.length === 0 || cards.length === 0) return null;
    const packageIds = new Set([
        ...notes.map((note) => note.sourcePackageId),
        ...cards.map((card) => card.sourcePackageId),
    ]);
    if (packageIds.size !== 1) return null;
    const id = [...packageIds][0];
    if (!id) return null;
    const meta = readMeta(id);
    if (!meta || meta.dirty || !meta.exactEligible) return null;
    if (notes.length !== meta.noteCount || cards.length !== meta.cardCount) return null;
    const bytes = await readMediaBytes(meta.archiveName);
    return bytes ? { fileName: meta.fileName, bytes } : null;
}
