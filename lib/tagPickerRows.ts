// Pure row model and tag normalisation for the tag picker (components/TagPickerModal.tsx).
// A collection's tag list grows without bound, so the modal renders these rows through a
// FlatList. The normalisation helpers moved here with the row model because the filter and the
// selection check both depend on them agreeing on what makes two tags the same tag.

/** Case- and unicode-insensitive identity: Anki treats "TUS" and "tus" as one tag. */
export function tagKey(tag: string): string {
    return tag.normalize('NFC').toLowerCase();
}

/** De-duplicates by key, keeping first-seen spelling; "marked" is Anki's reserved lowercase tag. */
export function uniqueTags(tags: readonly string[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const raw of tags) {
        const normalized = raw.normalize('NFC').trim();
        const tag = tagKey(normalized) === 'marked' ? 'marked' : normalized;
        if (!tag) continue;
        const key = tagKey(tag);
        if (seen.has(key)) continue;
        seen.add(key);
        result.push(tag);
    }
    return result;
}

/** Anki separates tags with whitespace and uses :: for hierarchical tag paths. */
export function parseNewTags(raw: string): string[] {
    return uniqueTags(raw
        .split(/\s+/)
        .map((tag) => tag.replace(/[\u0000-\u001f\u007f]/g, ''))
        .map((tag) => tag.split('::').filter(Boolean).join('::'))
        .filter(Boolean));
}

export interface TagPickerRow {
    key: string;
    tag: string;
    /** Rendered as an indent; capped by the view so a pathological tag path cannot push text off-screen. */
    depth: number;
    selected: boolean;
    /** "Etiket › Alt etiket", the form shown to the reader and read out by VoiceOver. */
    label: string;
}

export interface TagPickerRowsInput {
    known: readonly string[];
    selected: readonly string[];
    /** Empty means no filter; matching is substring on the normalised key, as Anki does. */
    query: string;
}

export function buildTagPickerRows(input: TagPickerRowsInput): TagPickerRow[] {
    const selectedKeys = new Set(input.selected.map(tagKey));
    const query = tagKey(input.query.trim());

    return input.known
        .filter((tag) => !query || tagKey(tag).includes(query))
        .map((tag) => ({
            key: tagKey(tag),
            tag,
            depth: Math.max(0, tag.split('::').length - 1),
            selected: selectedKeys.has(tagKey(tag)),
            label: tag.replaceAll('::', ' › '),
        }));
}

/** True when every visible row is already selected, which flips "select all" into "clear all". */
export function allRowsSelected(rows: readonly TagPickerRow[]): boolean {
    return rows.length > 0 && rows.every((row) => row.selected);
}
