import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { AppSettings } from '../lib/types';
import { DEFAULT_SETTINGS, loadSettings } from '../lib/storage';
import { useAppStartup } from '../hooks/useAppStartup';
import { useStudyNotifications } from '../hooks/useStudyNotifications';
import {
    INITIAL_CATALOG_ACCESS,
    loadCatalogAccess,
    purchaseBkaCatalog,
    restoreBkaCatalogPurchase,
    type CatalogAccessState,
    type CatalogPurchaseResult,
} from '../lib/catalogPurchases';
import {
    ensureBkaCatalogTier,
    getBkaCatalogTier,
    isBkaCatalogInstalled,
    uninstallBkaCatalog,
} from '../lib/bkaCatalog';
import { dbIndexAllCards } from '../lib/db';
import { getSearchIndexCards } from '../lib/noteManager';
import { invalidateSubjectsCache } from '../lib/subjects';
import { reconcileCatalogAccessWithInstall } from '../lib/catalogReconciliation';

/** Course + topic of the card currently on screen; drives the live sidebar highlight. */
export type StudyPosition = { subject: string; topic: string } | null;

export type AppContextType = {
    selectedSubject: string | null;
    setSelectedSubject: (s: string | null) => void;
    selectedTopic: string | null;
    setSelectedTopic: (t: string | null) => void;
    studyPosition: StudyPosition;
    setStudyPosition: (position: StudyPosition) => void;
    /** Anki's "current deck": the deck last opened for studying; null when studying by
     *  course/topic scope. Deck-aware screens (stats) default to it. */
    activeDeckName: string | null;
    setActiveDeckName: (name: string | null) => void;
    settings: AppSettings;
    refreshData: () => void;
    dataVersion: number;
    bumpDataVersion: () => void;
    startupError: string | null;
    isLoading: boolean;
    catalogAccess: CatalogAccessState;
    /** True while either the trial or purchased catalog is physically present. */
    catalogInstalled: boolean;
    /** True while cards are being written to or removed from the collection. */
    catalogInstalling: boolean;
    refreshCatalogAccess: () => Promise<CatalogAccessState>;
    purchaseCatalog: () => Promise<CatalogPurchaseResult>;
    restoreCatalogPurchase: () => Promise<CatalogPurchaseResult>;
};

export const AppContext = createContext<AppContextType>({
    selectedSubject: null,
    setSelectedSubject: () => { },
    selectedTopic: null,
    setSelectedTopic: () => { },
    studyPosition: null,
    setStudyPosition: () => { },
    activeDeckName: null,
    setActiveDeckName: () => { },
    settings: DEFAULT_SETTINGS,
    refreshData: () => { },
    dataVersion: 0,
    bumpDataVersion: () => { },
    startupError: null,
    isLoading: true,
    catalogAccess: INITIAL_CATALOG_ACCESS,
    catalogInstalled: false,
    catalogInstalling: false,
    refreshCatalogAccess: async () => INITIAL_CATALOG_ACCESS,
    purchaseCatalog: async () => ({ hasAccess: false, cancelled: false, state: INITIAL_CATALOG_ACCESS }),
    restoreCatalogPurchase: async () => ({ hasAccess: false, cancelled: false, state: INITIAL_CATALOG_ACCESS }),
});

/**
 * Hosts the shared app state and runs startup. Must wrap the ROOT navigator, not just
 * the (tabs) layout: modal screens (editor, import, backups, note types) live outside
 * (tabs) and call bumpDataVersion/refreshData — inside (tabs) they would silently get
 * the no-op default context and leave the rest of the app stale.
 */
export function AppProvider({ children }: { children: React.ReactNode }) {
    const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
    const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
    const [studyPosition, setStudyPosition] = useState<StudyPosition>(null);
    const [activeDeckName, setActiveDeckName] = useState<string | null>(null);
    const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
    const [dataVersion, setDataVersion] = useState(0);
    const [catalogAccess, setCatalogAccess] = useState<CatalogAccessState>(INITIAL_CATALOG_ACCESS);
    const [catalogInstalled, setCatalogInstalled] = useState(false);
    const [catalogInstalling, setCatalogInstalling] = useState(false);

    const refreshData = useCallback(() => {
        setSettings(loadSettings());
    }, []);

    const bumpDataVersion = useCallback(() => {
        setDataVersion((prev) => prev + 1);
    }, []);

    const { startupError, isLoading } = useAppStartup(refreshData, bumpDataVersion);
    useStudyNotifications(settings, isLoading);

    /** Match the physical collection to the entitlement. Locked users only see the manifest-
     * backed store preview: no paid note, card, template or media row remains studyable locally. */
    const matchCatalogToAccess = useCallback(async (hasAccess: boolean) => {
        setCatalogInstalling(true);
        try {
            const changed = hasAccess
                ? (await ensureBkaCatalogTier('full')).installed
                : uninstallBkaCatalog().removed;
            if (changed) {
                invalidateSubjectsCache();
                // Entitlement changes thousands of searchable rows; keep native FTS in lockstep.
                dbIndexAllCards(getSearchIndexCards());
                bumpDataVersion();
            }
            setCatalogInstalled(isBkaCatalogInstalled());
        } finally {
            setCatalogInstalling(false);
        }
    }, [bumpDataVersion]);

    const applyAccessState = useCallback(async (raw: CatalogAccessState) => {
        // Reconcile before acting: a store error while the catalog is installed must never
        // uninstall paid content, no matter which call (refresh, purchase, restore) hit it.
        const next = reconcileCatalogAccessWithInstall(raw, getBkaCatalogTier() === 'full');
        try {
            await matchCatalogToAccess(next.hasAccess);
            setCatalogAccess(next);
            return next;
        } catch (error) {
            const failed: CatalogAccessState = {
                ...next,
                status: 'error',
                hasAccess: getBkaCatalogTier() === 'full',
                error: error instanceof Error ? error.message : String(error),
            };
            setCatalogInstalled(isBkaCatalogInstalled());
            setCatalogAccess(failed);
            return failed;
        }
    }, [matchCatalogToAccess]);

    const refreshCatalogAccess = useCallback(async () => applyAccessState(await loadCatalogAccess()), [applyAccessState]);

    const purchaseCatalog = useCallback(async () => {
        const result = await purchaseBkaCatalog();
        result.state = await applyAccessState(result.state);
        result.hasAccess = result.state.hasAccess;
        return result;
    }, [applyAccessState]);

    const restoreCatalogPurchase = useCallback(async () => {
        const result = await restoreBkaCatalogPurchase();
        result.state = await applyAccessState(result.state);
        result.hasAccess = result.state.hasAccess;
        return result;
    }, [applyAccessState]);

    useEffect(() => {
        if (isLoading || startupError) return;
        setCatalogInstalled(isBkaCatalogInstalled());
        void refreshCatalogAccess();
    }, [isLoading, startupError, refreshCatalogAccess]);

    return (
        <AppContext.Provider
            value={{
                selectedSubject,
                setSelectedSubject,
                selectedTopic,
                setSelectedTopic,
                studyPosition,
                setStudyPosition,
                activeDeckName,
                setActiveDeckName,
                settings,
                refreshData,
                dataVersion,
                bumpDataVersion,
                startupError,
                isLoading,
                catalogAccess,
                catalogInstalled,
                catalogInstalling,
                refreshCatalogAccess,
                purchaseCatalog,
                restoreCatalogPurchase,
            }}
        >
            {children}
        </AppContext.Provider>
    );
}

export const useApp = () => useContext(AppContext);
