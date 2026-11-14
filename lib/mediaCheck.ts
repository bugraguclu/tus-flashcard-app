/**
 * Check Media: which stored files no note or note type refers to, and which referenced files are
 * missing — Anki's Tools › Check Media (https://docs.ankiweb.net/media.html#checking-media).
 *
 * As in Anki, a file whose name starts with `_` is never reported as unused (templates and
 * add-ons refer to such files indirectly), and unused files are not deleted outright: they move
 * to a trash folder beside the media folder, from which they can be put back. A collection backup
 * is taken first (the caller asks for it), and nothing is moved without the learner's
 * confirmation.
 */
import { Platform } from 'react-native';
import { getDB } from './db';
import { extractMediaFilenames } from './mediaAttachment';
import { ensureMediaDir, listStoredMediaFilenames } from './mediaStore';
import { getLegacyFileSystem } from './files';

export interface MediaCheckResult {
    /** Stored files nothing refers to, sorted. */
    unused: string[];
    /** Files the collection refers to that are not stored, sorted. */
    missing: string[];
    storedCount: number;
    referencedCount: number;
}

/** Every filename a note field, template or stylesheet refers to. */
export function referencedMediaFilenames(): Set<string> {
    const db = getDB();
    const sources: string[] = [];
    for (const row of db.getAllSync<{ data: string }>('SELECT data FROM notes')) {
        try {
            const note = JSON.parse(row.data);
            if (Array.isArray(note?.fields)) for (const field of note.fields) if (typeof field === 'string') sources.push(field);
        } catch { /* an unreadable note refers to nothing we can read */ }
    }
    for (const row of db.getAllSync<{ data: string }>('SELECT data FROM note_types')) {
        try {
            const type = JSON.parse(row.data);
            if (typeof type?.css === 'string') sources.push(type.css);
            for (const template of Array.isArray(type?.templates) ? type.templates : []) {
                for (const side of [template?.qfmt, template?.afmt, template?.bqfmt, template?.bafmt]) if (typeof side === 'string') sources.push(side);
            }
        } catch { /* as above */ }
    }
    return extractMediaFilenames(sources);
}

export async function checkMedia(list: () => Promise<string[]> = listStoredMediaFilenames): Promise<MediaCheckResult> {
    const stored = (await list()).filter((name) => !name.startsWith('.'));
    const referenced = referencedMediaFilenames();
    const storedSet = new Set(stored);
    const unused = stored.filter((name) => !referenced.has(name) && !name.startsWith('_')).sort();
    const missing = [...referenced].filter((name) => !storedSet.has(name)).sort();
    return { unused, missing, storedCount: stored.length, referencedCount: referenced.size };
}

/** Whether unused files can be moved to the trash here (the web build only reports). */
export function canTrashMedia(): boolean {
    return Platform.OS !== 'web';
}

function trashDir(mediaDir: string): string {
    return mediaDir.replace(/tus-media\/$/, 'tus-media-trash/');
}

/**
 * Move the given files to the media trash. Only names the latest check reported as unused are
 * moved, and only if they are still unused now (a note added since the check keeps its file).
 * One file that cannot be moved does not stop the others: each is counted as moved or failed, so
 * the learner is told what actually happened. Setting up the trash itself still throws.
 */
export async function moveUnusedMediaToTrash(names: readonly string[]): Promise<{ moved: number; failed: number; trashFolder: string }> {
    if (!canTrashMedia()) throw new Error('Media trash is not available on this platform.');
    const stillUsed = referencedMediaFilenames();
    const mediaDir = await ensureMediaDir();
    const fs = getLegacyFileSystem();
    const folder = `${trashDir(mediaDir)}${new Date().toISOString().replace(/[:.]/g, '-')}/`;
    await fs.makeDirectoryAsync(folder, { intermediates: true });
    let moved = 0;
    let failed = 0;
    for (const name of names) {
        if (stillUsed.has(name) || name.startsWith('_') || name.includes('/') || name.startsWith('.')) continue;
        const from = `${mediaDir}${name}`;
        try {
            const info = await fs.getInfoAsync(from);
            if (!info.exists || info.isDirectory) continue;
            await fs.moveAsync({ from, to: `${folder}${name}` });
            moved++;
        } catch (error) {
            console.warn('[Media] could not move to the trash:', name, error);
            failed++;
        }
    }
    return { moved, failed, trashFolder: folder };
}

/**
 * Put every file in the media trash back, unless a file of that name has appeared since. A file
 * that cannot be put back stays in the trash and is counted, without stopping the rest.
 */
export async function restoreMediaTrash(): Promise<{ restored: number; skipped: number; failed: number }> {
    if (!canTrashMedia()) return { restored: 0, skipped: 0, failed: 0 };
    const mediaDir = await ensureMediaDir();
    const fs = getLegacyFileSystem();
    const root = trashDir(mediaDir);
    const rootInfo = await fs.getInfoAsync(root);
    if (!rootInfo.exists) return { restored: 0, skipped: 0, failed: 0 };
    let restored = 0; let skipped = 0; let failed = 0;
    for (const folder of await fs.readDirectoryAsync(root)) {
        const dir = `${root}${folder}/`;
        for (const name of await fs.readDirectoryAsync(dir)) {
            const target = `${mediaDir}${name}`;
            try {
                if ((await fs.getInfoAsync(target)).exists) { skipped++; continue; }
                await fs.moveAsync({ from: `${dir}${name}`, to: target });
                restored++;
            } catch (error) {
                console.warn('[Media] could not restore from the trash:', name, error);
                failed++;
            }
        }
    }
    return { restored, skipped, failed };
}
