import type { DeckConfig, NoteType } from './models';
import { sameAnkiId } from './ankiJson';

/**
 * A small deterministic fingerprint of a package's bytes, recorded on what it imported so a later
 * import of the same package finds its own note types, decks and presets. Identity only, not a
 * security primitive.
 */
export function sourcePackageId(bytes: Uint8Array): string {
    let a = 0x811c9dc5;
    let b = 0x9e3779b9;
    for (let i = 0; i < bytes.length; i++) {
        a = Math.imul(a ^ bytes[i], 0x01000193);
        b = Math.imul(b ^ bytes[i], 0x85ebca6b);
    }
    return `${bytes.length.toString(36)}-${(a >>> 0).toString(36)}-${(b >>> 0).toString(36)}`;
}
/** Compare schema identity independently: stable Anki ids survive field/template renaming. */
export function sameImportedNoteShape(current: NoteType, incoming: NoteType): boolean {
    if (current.kind !== incoming.kind) return false;
    return (['fields', 'templates'] as const).every(key => {
        const rawKey = key === 'fields' ? 'flds' : 'tmpls';
        const beforeRaw = current.ankiRaw?.[rawKey] as any[] | undefined;
        const afterRaw = incoming.ankiRaw?.[rawKey] as any[] | undefined;
        return current[key].length === incoming[key].length && current[key].every((part, i) => {
            const beforeId = beforeRaw?.[i]?.id; const afterId = afterRaw?.[i]?.id;
            return part.ord === incoming[key][i]?.ord && (beforeId != null && afterId != null ? sameAnkiId(beforeId, afterId) : part.name === incoming[key][i]?.name);
        });
    });
}
/** Provenance and edit stamps are not preset behavior; stable key order avoids JSON-order drift. */
export function importedPresetKey(config: DeckConfig): string {
    const { id, mod, usn, sourcePackageId, ankiRaw, ...settings } = config;
    return JSON.stringify(Object.fromEntries(Object.entries(settings).filter(([, value]) => value !== undefined).sort(([a], [b]) => a.localeCompare(b))));
}
