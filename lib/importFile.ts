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
        id: 'apkg',
        mimeTypes: ['application/zip', 'application/x-zip-compressed', '*/*'],
        extensions: ['apkg'],
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
