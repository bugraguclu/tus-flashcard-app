/**
 * Web backend for collection backups. Snapshots are full-collection JSON and
 * easily exceed localStorage's ~5 MB cap, so they live in their own IndexedDB
 * database (separate from the sqlite snapshot DB to avoid coupling the two
 * schemas' upgrade paths). Keys are backup filenames; values carry the JSON
 * and a creation timestamp.
 */

import type { BackupInfo, BackupStore } from './backup';

const IDB_NAME = 'tus_flashcard_backups';
const IDB_STORE = 'backups';

interface StoredBackup {
    contents: string;
    createdAt: number;
}

function openIdb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(IDB_NAME, 1);
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

function withStore<T>(
    mode: IDBTransactionMode,
    run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
    return openIdb().then(
        (db) =>
            new Promise<T>((resolve, reject) => {
                const tx = db.transaction(IDB_STORE, mode);
                const req = run(tx.objectStore(IDB_STORE));
                tx.oncomplete = () => {
                    db.close();
                    resolve(req.result);
                };
                tx.onerror = () => {
                    db.close();
                    reject(tx.error);
                };
                tx.onabort = () => {
                    db.close();
                    reject(tx.error);
                };
            }),
    );
}

export function createWebBackupStore(): BackupStore {
    return {
        async list(): Promise<BackupInfo[]> {
            const db = await openIdb();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(IDB_STORE, 'readonly');
                const store = tx.objectStore(IDB_STORE);
                const keysReq = store.getAllKeys();
                const valuesReq = store.getAll();
                tx.oncomplete = () => {
                    db.close();
                    const keys = keysReq.result as string[];
                    const values = valuesReq.result as StoredBackup[];
                    resolve(
                        keys.map((name, i) => ({
                            name,
                            size: values[i]?.contents.length ?? 0,
                            createdAt: values[i]?.createdAt ?? 0,
                        })),
                    );
                };
                tx.onerror = () => {
                    db.close();
                    reject(tx.error);
                };
            });
        },

        async read(name: string): Promise<string> {
            const stored = await withStore<StoredBackup | undefined>('readonly', (s) => s.get(name));
            if (!stored) throw new Error(`Backup not found: ${name}`);
            return stored.contents;
        },

        async write(name: string, contents: string): Promise<void> {
            const value: StoredBackup = { contents, createdAt: Date.now() };
            await withStore('readwrite', (s) => s.put(value, name));
        },

        async remove(name: string): Promise<void> {
            await withStore('readwrite', (s) => s.delete(name));
        },
    };
}
