import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import { useAccount } from './AccountContext';
import { useAppSettingsActions, useCollectionInvalidation, useStartupStatus } from './AppContext';
import { dbUpsertFtsCard } from '../lib/db';
import { getCardsForNote, getNote, searchIndexCardFromNote } from '../lib/noteStore';
import { invalidateSubjectsCache } from '../lib/subjects';
import type { SyncDeviceInfo } from '../lib/syncContract';
import {
    acknowledgeDeletionBackup,
    configureSync,
    disableSync,
    enableSync,
    firstLinkPreview,
    getSyncStatus,
    listSyncDevices,
    removeSyncDevice,
    subscribeSyncApplied,
    subscribeSyncStatus,
    syncNow,
    type SyncAccount,
    type SyncStatus,
} from '../lib/sync/syncEngine';

/*
 * Two-way sync between the learner's devices (docs/HESAP_SENKRON.md). It follows the account:
 * signed in to the account this collection syncs with, it runs; signed out, it stops and the
 * collection stays as it is. When another device's changes arrive, the screens reload what they
 * show and the search index follows the notes that changed.
 */

interface SyncContextValue {
    /** The server offers sync and someone is signed in. */
    available: boolean;
    status: SyncStatus;
    /** Turns sync on for the signed-in account (the first link). Throws an AccountRequestError. */
    enable: () => Promise<void>;
    disable: () => void;
    syncNow: () => Promise<void>;
    preview: () => { studiedCards: number; notes: number; reviews: number };
    devices: () => Promise<SyncDeviceInfo[]>;
    removeDevice: (dev: number) => Promise<void>;
    dismissDeletionBackup: () => void;
}

const SyncContext = createContext<SyncContextValue>({
    available: false,
    status: getSyncStatus(),
    enable: async () => { },
    disable: () => { },
    syncNow: async () => { },
    preview: () => ({ studiedCards: 0, notes: 0, reviews: 0 }),
    devices: async () => [],
    removeDevice: async () => { },
    dismissDeletionBackup: () => { },
});

export function SyncProvider({ children }: { children: React.ReactNode }) {
    const account = useAccount();
    const { isLoading, startupError } = useStartupStatus();
    const { invalidateCollection } = useCollectionInvalidation();
    const { refreshSettings } = useAppSettingsActions();
    const [status, setStatus] = useState<SyncStatus>(getSyncStatus());

    const userId = account.status === 'signedIn' ? account.user?.id ?? null : null;
    const available = Boolean(userId && account.baseUrl && account.config?.sync && !isLoading && !startupError);
    const syncAccount = useMemo<SyncAccount | null>(() => (available && userId && account.baseUrl
        ? {
            baseUrl: account.baseUrl,
            clientLabel: Platform.OS === 'web' ? 'TusAnkiM web' : 'TusAnkiM iOS',
            userId,
            getToken: account.getToken,
        }
        : null), [available, userId, account.baseUrl, account.getToken]);

    useEffect(() => subscribeSyncStatus(setStatus), []);

    useEffect(() => subscribeSyncApplied((summary) => {
        if (Platform.OS !== 'web') {
            // The native search index follows the notes another device changed.
            for (const noteId of summary.notes) {
                const note = getNote(noteId);
                if (!note) continue;
                for (const card of getCardsForNote(noteId)) dbUpsertFtsCard(searchIndexCardFromNote(note, card.id));
            }
        }
        invalidateSubjectsCache();
        refreshSettings();
        invalidateCollection();
    }), [invalidateCollection, refreshSettings]);

    useEffect(() => {
        if (isLoading || startupError) return;
        configureSync(syncAccount);
    }, [syncAccount, isLoading, startupError]);

    const enable = useCallback(async () => {
        if (!syncAccount) return;
        await enableSync(syncAccount);
    }, [syncAccount]);

    const value = useMemo<SyncContextValue>(() => ({
        available,
        status,
        enable,
        disable: disableSync,
        syncNow,
        preview: () => firstLinkPreview(),
        devices: listSyncDevices,
        removeDevice: removeSyncDevice,
        dismissDeletionBackup: acknowledgeDeletionBackup,
    }), [available, status, enable]);

    return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export const useSync = () => useContext(SyncContext);
