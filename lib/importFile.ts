export type ImportFileType = 'csv' | 'tsv' | 'txt' | 'apkg' | 'colpkg';

export type ImportFormat = {
    id: ImportFileType;
    mimeTypes: string[];
    extensions: string[];
};

export const IMPORT_FORMATS: ImportFormat[] = [
    {
        id: 'csv',
        mimeTypes: ['text/csv', 'application/csv', 'text/comma-separated-values'],
        extensions: ['csv'],
    },
    {
        id: 'tsv',
        mimeTypes: ['text/tab-separated-values', 'text/tsv', 'text/plain'],
        extensions: ['tsv'],
    },
    {
        id: 'txt',
        mimeTypes: ['text/plain'],
        extensions: ['txt'],
    },
    {
        // Anki's own file dialog accepts ".zip" for packages, because browsers and mail clients
        // routinely rename a downloaded ".apkg". The archive content decides what it really is.
        id: 'apkg',
        mimeTypes: ['application/zip', 'application/x-zip-compressed', '*/*'],
        extensions: ['apkg', 'zip'],
    },
    {
        id: 'colpkg',
        mimeTypes: ['application/zip', 'application/x-zip-compressed', '*/*'],
        extensions: ['colpkg'],
    },
];

/** Returns a lower-case extension without the dot, ignoring URL query/fragment data. */
export function getImportFileExtension(nameOrUri: string): string | undefined {
    const withoutQuery = nameOrUri.trim().split(/[?#]/, 1)[0] ?? '';
    const decoded = (() => {
        try { return decodeURIComponent(withoutQuery); } catch { return withoutQuery; }
    })();
    const basename = decoded.slice(decoded.lastIndexOf('/') + 1).toLowerCase();
    const dot = basename.lastIndexOf('.');
    if (dot <= 0 || dot === basename.length - 1) return undefined;
    return basename.slice(dot + 1);
}

export function inferImportFileType(nameOrUri: string): ImportFileType | undefined {
    const extension = getImportFileExtension(nameOrUri);
    return IMPORT_FORMATS.find((format) => extension && format.extensions.includes(extension))?.id;
}

export function importFileNameFromUri(uri: string): string {
    const withoutQuery = uri.split(/[?#]/, 1)[0] ?? uri;
    const basename = withoutQuery.slice(withoutQuery.lastIndexOf('/') + 1);
    try { return decodeURIComponent(basename) || 'import'; } catch { return basename || 'import'; }
}

/**
 * Anki's import dialog has one "All supported formats" filter and decides what a file is from its
 * extension, so the app opens a single picker instead of asking the learner to pick a format
 * before the file. iOS document pickers need the union of the declared types to allow that.
 */
export const ALL_IMPORT_MIME_TYPES: string[] = Array.from(
    new Set(IMPORT_FORMATS.flatMap((format) => format.mimeTypes)),
);

export const ALL_IMPORT_EXTENSIONS: string[] = Array.from(
    new Set(IMPORT_FORMATS.flatMap((format) => format.extensions)),
);

/** `.apkg`/`.colpkg` carry a whole collection; the text formats carry rows of fields. */
export function isPackageImport(type: ImportFileType): boolean {
    return type === 'apkg' || type === 'colpkg';
}

export function importFormatLabel(type: ImportFileType): string {
    switch (type) {
        case 'csv': return 'CSV';
        case 'tsv': return 'TSV';
        case 'txt': return 'TXT';
        case 'apkg': return '.apkg';
        case 'colpkg': return '.colpkg';
    }
}
