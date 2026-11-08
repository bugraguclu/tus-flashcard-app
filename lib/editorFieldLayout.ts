/**
 * The editor keeps a note's field values by position. The note type screen can add, remove or
 * move that type's fields while the editor is still open beneath it (from Kartlar:, or Manage note
 * types), and it migrates every stored note at once. The editor's values must then follow their
 * fields too, or Save writes each value into whichever field now sits where it used to.
 */

const fieldKey = (name: string) => name.trim().normalize('NFC').toLowerCase();

/** Whether two field lists name the same fields in the same order (field names ignore case). */
export function sameFieldLayout(a: readonly string[], b: readonly string[]): boolean {
    return a.length === b.length && a.every((name, index) => fieldKey(name) === fieldKey(b[index]));
}

/**
 * The editor's values laid out for the note type's new fields; a value follows its field by name.
 *
 * - Editing a saved note, `stored` is that note as the note type screen migrated it, already in
 *   the new layout: a field the learner has not changed here takes its stored value (so a renamed
 *   field keeps its text), and a field changed here keeps the change.
 * - Adding a note (`stored` null), a field that no longer matches a name starts empty.
 */
export function remapFieldValues(
    previousNames: readonly string[],
    nextNames: readonly string[],
    values: readonly string[],
    baseline: readonly string[] | null,
    stored: readonly string[] | null,
): string[] {
    const previousIndex = new Map(previousNames.map((name, index) => [fieldKey(name), index]));
    return nextNames.map((name, index) => {
        const from = previousIndex.get(fieldKey(name));
        if (!stored) return from === undefined ? '' : values[from] ?? '';
        const changedHere = from !== undefined
            && (baseline === null || (values[from] ?? '') !== (baseline[from] ?? ''));
        return changedHere ? values[from!] ?? '' : stored[index] ?? '';
    });
}

/** Field positions that stay pinned after the same change: a pin follows its field by name. */
export function remapFieldPositions(
    previousNames: readonly string[],
    nextNames: readonly string[],
    positions: ReadonlySet<number>,
): Set<number> {
    const nextIndex = new Map(nextNames.map((name, index) => [fieldKey(name), index]));
    const moved = new Set<number>();
    for (const position of positions) {
        const name = previousNames[position];
        const index = name === undefined ? undefined : nextIndex.get(fieldKey(name));
        if (index !== undefined) moved.add(index);
    }
    return moved;
}
