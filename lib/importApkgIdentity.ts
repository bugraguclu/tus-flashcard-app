import type { DeckConfig, NoteType } from './models';
/** Compare schema identity independently: stable Anki ids survive field/template renaming. */
export function sameImportedNoteShape(current: NoteType, incoming: NoteType): boolean {
    if (current.kind !== incoming.kind) return false;
    return (['fields', 'templates'] as const).every(key => {
        const rawKey = key === 'fields' ? 'flds' : 'tmpls';
        const beforeRaw = current.ankiRaw?.[rawKey] as any[] | undefined;
        const afterRaw = incoming.ankiRaw?.[rawKey] as any[] | undefined;
        return current[key].length === incoming[key].length && current[key].every((part, i) => {
            const beforeId = beforeRaw?.[i]?.id; const afterId = afterRaw?.[i]?.id;
            return part.ord === incoming[key][i]?.ord && (beforeId != null && afterId != null ? beforeId === afterId : part.name === incoming[key][i]?.name);
        });
    });
}
/** Provenance and edit stamps are not preset behavior; stable key order avoids JSON-order drift. */
export function importedPresetKey(config: DeckConfig): string {
    const { id, mod, usn, sourcePackageId, ankiRaw, ...settings } = config;
    return JSON.stringify(Object.fromEntries(Object.entries(settings).filter(([, value]) => value !== undefined).sort(([a], [b]) => a.localeCompare(b))));
}
