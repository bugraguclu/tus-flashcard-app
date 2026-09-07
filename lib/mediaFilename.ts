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

/** `.jpg` / `.HEIC` style tail, short enough and plain enough to be a real extension. */
const EXTENSION_TAIL = /\.([A-Za-z0-9]{1,5})$/;

/** Strip the query string and fragment a content/asset URI can carry before its extension. */
function uriPath(uri: string): string {
    const withoutFragment = uri.split('#')[0];
    return withoutFragment.split('?')[0];
}

function extensionOf(name: string): string {
    const match = EXTENSION_TAIL.exec(name);
    return match ? match[1].toLowerCase() : '';
}

function baseNameOf(name: string): string {
    const withoutDirectories = name.replace(/^.*[\\/]/s, '');
    return withoutDirectories.replace(EXTENSION_TAIL, '');
}

/**
 * Name for a picked attachment whose bytes are copied from `uri`.
 *
 * The picker's `fileName` is the library's own name for the asset, which on iOS is routinely the
 * original capture (`IMG_0042.HEIC`) even though the file handed over has already been transcoded
 * to JPEG. Naming the stored media after it would leave the collection holding a `.HEIC` that is
 * really a JPEG: an `<img>` reference other Anki clients can refuse, and a media entry that
 * survives an `.apkg` round trip still mislabelled. The extension therefore comes from the file
 * actually being copied, and only its readable part — the base name — is taken from the picker.
 */
export function mediaFilenameForPickedAsset(asset: {
    uri: string;
    name?: string | null;
    /** Extension to use when neither the URI nor the picker name carries one. */
    fallbackExtension?: string;
}): string {
    const pickedName = typeof asset.name === 'string' ? asset.name.trim() : '';
    const path = uriPath(typeof asset.uri === 'string' ? asset.uri : '');
    const extension = extensionOf(path)
        || extensionOf(pickedName)
        || (asset.fallbackExtension ?? '').replace(/^\./, '').toLowerCase();
    const base = baseNameOf(pickedName) || baseNameOf(decodeUriComponentSafely(path)) || 'media';
    return extension ? `${base}.${extension}` : base;
}

/** A percent-encoded cache path still has to yield a readable base name. */
function decodeUriComponentSafely(value: string): string {
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
}
