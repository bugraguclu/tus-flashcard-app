const CONTROL_CHARS = /\p{Cc}/gu;
const MAX_FILENAME_LENGTH = 255;

/**
 * Reduce a filename to a safe base name so an imported name can't escape the
 * media folder via a path separator or `..`. Falls back to "media" when nothing
 * usable remains, and caps the length to stay within filesystem limits.
 */
export function sanitizeMediaFilename(name: string): string {
    // The `s` flag lets `.` match newlines, so a newline can't hide a path
    // separator from the directory strip.
    const base = name.normalize('NFC').replace(/^.*[\\/]/s, '');
    const cleaned = base.replace(CONTROL_CHARS, '').replace(/^\.+/, '');
    return truncateFilename(cleaned || 'media', MAX_FILENAME_LENGTH);
}

/** Cap a filename's length, keeping a short trailing extension when present. */
function truncateFilename(name: string, max: number): string {
    if (name.length <= max) return name;
    const dot = name.lastIndexOf('.');
    const ext = dot > 0 && name.length - dot <= 10 ? name.slice(dot) : '';
    return name.slice(0, max - ext.length) + ext;
}
