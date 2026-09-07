import { getAllNotes, getAllNoteTypes } from './noteManager';
import { listStoredMediaFilenames } from './mediaStore';
import { sanitizeMediaFilename } from './mediaFilename';
import { extractMediaFilenames } from './mediaAttachment';

export function extractNoteMediaReferences(fields: string[]): Set<string> {
    return extractMediaFilenames(fields);
}

export interface MediaAuditResult {
    missing: string[];
    unused: string[];
    referenced: number;
    stored: number;
}

export function auditMediaFilenames(referenced: Set<string>, storedNames: string[]): MediaAuditResult {
    const stored = new Set(storedNames.map(sanitizeMediaFilename));
    return {
        missing: [...referenced].filter((name) => !stored.has(name)).sort(),
        unused: [...stored].filter((name) => !referenced.has(name)).sort(),
        referenced: referenced.size,
        stored: stored.size,
    };
}

/** Read-only AnkiMobile-style media audit. Deletion always remains an explicit later action. */
export async function checkMedia(): Promise<MediaAuditResult> {
    const referenced = new Set<string>();
    for (const note of getAllNotes()) {
        for (const filename of extractMediaFilenames(note.fields)) referenced.add(filename);
    }
    // A note type's stylesheet and templates carry references too — a background image or a logo
    // belongs to every card built from them. Reading only the notes reported those files as
    // unused, which is the one answer this audit must never give about a file that is in use.
    for (const type of getAllNoteTypes()) {
        const sources = [type.css, ...type.templates.flatMap((template) => [template.qfmt, template.afmt])];
        for (const filename of extractMediaFilenames(sources)) referenced.add(filename);
    }
    return auditMediaFilenames(referenced, await listStoredMediaFilenames());
}
