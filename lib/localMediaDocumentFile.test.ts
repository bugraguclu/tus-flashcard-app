import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Platform } from 'react-native';
import { setLegacyFileSystemForTesting } from './files';
import { LOCAL_MEDIA_DOCUMENT_PREFIX, localMediaDocumentVersion } from './localMediaDocument';
import {
    localMediaDocumentExists,
    removeLocalMediaDocument,
    setLocalMediaDocumentFileSystemForTesting,
    sweepLocalMediaDocuments,
    writeLocalMediaDocument,
} from './localMediaDocumentFile';

const MEDIA_BASE = 'file:///var/mobile/Containers/Data/Application/ABC/Documents/tus-media/';

/** A disk of path -> text, behind stand-ins for the synchronous and the legacy file APIs. */
function fakeDisk() {
    const files = new Map<string, string>();
    const folders = new Set<string>();
    const strip = (uri: string) => uri.replace(/\/+$/, '');
    class File {
        constructor(readonly uri: string) {}
        get exists() { return files.has(this.uri); }
        write(content: string) {
            const parent = this.uri.slice(0, this.uri.lastIndexOf('/'));
            if (!folders.has(parent)) throw new Error(`no folder ${parent}`);
            files.set(this.uri, content);
        }
        delete() {
            if (!files.delete(this.uri)) throw new Error('missing');
        }
    }
    class Directory {
        constructor(readonly uri: string) {}
        get exists() { return folders.has(strip(this.uri)); }
        create() { folders.add(strip(this.uri)); }
    }
    const legacy = {
        async readDirectoryAsync(uri: string) {
            const folder = `${strip(uri)}/`;
            return [...files.keys()].filter((path) => path.startsWith(folder)).map((path) => path.slice(folder.length));
        },
        async deleteAsync(uri: string) { files.delete(uri); },
    };
    return { files, folders, File, Directory, legacy };
}

let disk: ReturnType<typeof fakeDisk>;

beforeEach(() => {
    Platform.OS = 'ios';
    disk = fakeDisk();
    setLocalMediaDocumentFileSystemForTesting({ File: disk.File, Directory: disk.Directory });
    setLegacyFileSystemForTesting(disk.legacy);
});

afterEach(() => {
    setLocalMediaDocumentFileSystemForTesting(null);
    setLegacyFileSystemForTesting(null);
    Platform.OS = 'ios';
});

describe('WebView documents in the media folder', () => {
    it('writes the document before handing out its address, creating the folder on a fresh install', () => {
        const uri = writeLocalMediaDocument(MEDIA_BASE, 'abc', '<img src="kalp.png">');
        const fileUri = `${MEDIA_BASE}${LOCAL_MEDIA_DOCUMENT_PREFIX}abc.html`;
        expect(uri).toBe(`${fileUri}?v=${localMediaDocumentVersion('<img src="kalp.png">')}`);
        // Marked as UTF-8: a file page with no declared charset is read as Latin-1 by WebKit.
        expect(disk.files.get(fileUri)).toBe('\uFEFF<img src="kalp.png">');
        expect(localMediaDocumentExists(MEDIA_BASE, 'abc')).toBe(true);
    });

    it('rewrites the same file under a new address when the content changes', () => {
        const first = writeLocalMediaDocument(MEDIA_BASE, 'abc', 'one');
        const second = writeLocalMediaDocument(MEDIA_BASE, 'abc', 'two');
        expect(second).not.toBe(first);
        expect(first?.split('?')[0]).toBe(second?.split('?')[0]);
        expect([...disk.files.values()]).toEqual(['\uFEFFtwo']);
    });

    it('deletes the document when its WebView goes, and only that one', () => {
        writeLocalMediaDocument(MEDIA_BASE, 'abc', 'one');
        writeLocalMediaDocument(MEDIA_BASE, 'def', 'two');
        removeLocalMediaDocument(MEDIA_BASE, 'abc');
        expect(localMediaDocumentExists(MEDIA_BASE, 'abc')).toBe(false);
        expect(localMediaDocumentExists(MEDIA_BASE, 'def')).toBe(true);
        // Removing twice is harmless.
        removeLocalMediaDocument(MEDIA_BASE, 'abc');
    });

    it('sweeps what an earlier run left, keeping live documents and the media', async () => {
        disk.folders.add(MEDIA_BASE.replace(/\/$/, ''));
        disk.files.set(`${MEDIA_BASE}${LOCAL_MEDIA_DOCUMENT_PREFIX}old1.html`, 'stale');
        disk.files.set(`${MEDIA_BASE}kalp.png`, 'png');
        disk.files.set(`${MEDIA_BASE}.DS_Store`, 'finder');
        writeLocalMediaDocument(MEDIA_BASE, 'live', 'shown');
        expect(await sweepLocalMediaDocuments(MEDIA_BASE)).toBe(1);
        expect([...disk.files.keys()].sort()).toEqual([
            `${MEDIA_BASE}${LOCAL_MEDIA_DOCUMENT_PREFIX}live.html`,
            `${MEDIA_BASE}.DS_Store`,
            `${MEDIA_BASE}kalp.png`,
        ].sort());
    });

    it('falls back to the HTML string when the file cannot be written, or off iPhone', () => {
        setLocalMediaDocumentFileSystemForTesting({
            File: class { constructor() { throw new Error('disk full'); } },
            Directory: disk.Directory,
        });
        expect(writeLocalMediaDocument(MEDIA_BASE, 'abc', 'one')).toBeNull();
        setLocalMediaDocumentFileSystemForTesting({ File: disk.File, Directory: disk.Directory });
        Platform.OS = 'android';
        expect(writeLocalMediaDocument(MEDIA_BASE, 'abc', 'one')).toBeNull();
        Platform.OS = 'web';
        expect(writeLocalMediaDocument('', 'abc', 'one')).toBeNull();
        expect(disk.files.size).toBe(0);
    });
});
