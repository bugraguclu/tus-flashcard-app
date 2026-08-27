import { getAllNotes } from './noteManager';
import { listStoredMediaFilenames } from './mediaStore';
import { sanitizeMediaFilename } from './mediaFilename';

const MEDIA_REFERENCE_RE = /\[sound:([^\]]+)]|<(?:img|audio|video|source)\b[^>]*\bsrc\s*=\s*["']([^"']+)["']|<a\b[^>]*\bhref\s*=\s*["']([^"']+)["']/gi;

function localMediaFilename(raw: string): string | null {
    const value = raw.trim().replace(/&amp;/gi, '&');
    if (!value || /^(?:data|https?|file|content|blob|javascript):/i.test(value)) return null;
    if (value.startsWith('/') || value.startsWith('\\') || value.includes('../') || value.includes('..\\')) return null;
    const safe = sanitizeMediaFilename(value);
    return safe || null;
}

export function extractNoteMediaReferences(fields: string[]): Set<string> {
    const references = new Set<string>();
    for (const field of fields) {
        MEDIA_REFERENCE_RE.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = MEDIA_REFERENCE_RE.exec(field)) !== null) {
            const filename = localMediaFilename(match[1] ?? match[2] ?? match[3] ?? '');
            if (filename) references.add(filename);
        }
    }
    return references;
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
        for (const filename of extractNoteMediaReferences(note.fields)) referenced.add(filename);
    }
    return auditMediaFilenames(referenced, await listStoredMediaFilenames());
}
