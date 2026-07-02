const CONTROL_CHARS = /\p{Cc}/gu;

/**
 * Reduce a filename to a safe base name so an imported name can't escape the
 * media folder via a path separator or `..`. Falls back to "media" when nothing
 * usable remains.
 */
export function sanitizeMediaFilename(name: string): string {
    const base = name.normalize('NFC').replace(/^.*[\\/]/, '');
    const cleaned = base.replace(CONTROL_CHARS, '').replace(/^\.+/, '');
    return cleaned || 'media';
}
