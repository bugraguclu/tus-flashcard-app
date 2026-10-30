/**
 * Tag text handling, shared by every surface that lets the learner type tags.
 *
 * Anki stores a note's tags as one space-separated string and canonifies it on the way in:
 * whitespace runs are separators, blanks disappear, and a tag repeated in the same field is kept
 * once. Sorting is part of that canonical form, which is what makes two notes tagged the same way
 * compare equal after a round trip through the editor.
 */

/**
 * Anki's status tags: "marked" is the note's star and "leech" the scheduler's leech flag. They say
 * how a note is going rather than what it is about, so they never name its topic.
 */
export function isStatusTag(tag: string): boolean {
    const key = tag.toLocaleLowerCase('en-US');
    return key === 'marked' || key === 'leech';
}

/**
 * Whether two tag lists hold the same tags, matched the way Anki matches tags: NFC,
 * case-insensitive and in any order. Saving such a list back is not a change.
 */
export function sameTagSet(a: readonly string[], b: readonly string[]): boolean {
    const key = (tags: readonly string[]) => [...new Set(tags
        .map((tag) => tag.normalize('NFC').trim().toLocaleLowerCase('en-US'))
        .filter(Boolean))].sort().join(' ');
    return key(a) === key(b);
}

/** Split typed tag text into Anki's canonical tag list. */
export function canonifyTags(input: string | readonly string[]): string[] {
    const parts = typeof input === 'string' ? input.split(/\s+/) : input;
    const seen = new Map<string, string>();

    for (const part of parts) {
        const tag = part.normalize('NFC').trim();
        if (!tag) continue;
        // Anki treats tags case-insensitively but keeps the spelling it saw first, so re-typing
        // "Marked" next to "marked" does not create a second tag.
        const key = tag.toLocaleLowerCase('en-US');
        if (!seen.has(key)) seen.set(key, tag);
    }

    return [...seen.values()].sort((a, b) => a.localeCompare(b));
}
