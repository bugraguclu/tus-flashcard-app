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
import { ensureBkaCatalogTier, getBkaCatalogTier } from '../lib/bkaCatalog';
import { dbIndexAllCards } from '../lib/db';
import { getSearchIndexCards } from '../lib/noteManager';
import { reconcileCatalogAccessWithInstalledTier } from '../lib/catalogReconciliation';

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

    const refreshData = useCallback(() => {
        setSettings(loadSettings());
    }, []);

    const bumpDataVersion = useCallback(() => {
        setDataVersion((prev) => prev + 1);
    }, []);

    const { startupError, isLoading } = useAppStartup(refreshData, bumpDataVersion);
    useStudyNotifications(settings, dataVersion, isLoading);

    const matchCatalogTier = useCallback(async (tier: 'trial' | 'full') => {
        const result = await ensureBkaCatalogTier(tier);
        // Tier replacement clears the native FTS table. Rebuild immediately so search sees
        // the same physical catalog (plus personal cards) as the rest of the app.
        if (result.installed) dbIndexAllCards(getSearchIndexCards());
        return result;
    }, []);

    const refreshCatalogAccess = useCallback(async () => {
        const loaded = await loadCatalogAccess();
        const next = reconcileCatalogAccessWithInstalledTier(loaded, getBkaCatalogTier());
        try {
            await matchCatalogTier(next.hasAccess ? 'full' : 'trial');
            setCatalogAccess(next);
            bumpDataVersion();
            return next;
        } catch (error) {
            const failed: CatalogAccessState = {
                ...next,
                status: 'error',
                hasAccess: false,
                error: error instanceof Error ? error.message : String(error),
            };
            setCatalogAccess(failed);
            return failed;
        }
    }, [bumpDataVersion, matchCatalogTier]);

    const purchaseCatalog = useCallback(async () => {
        const result = await purchaseBkaCatalog();
        if (result.hasAccess) {
            try {
                await matchCatalogTier('full');
                bumpDataVersion();
            } catch (error) {
                result.hasAccess = false;
                result.state = {
                    ...result.state,
                    status: 'error',
                    hasAccess: false,
                    error: error instanceof Error ? error.message : String(error),
                };
            }
        }
        setCatalogAccess(result.state);
        return result;
    }, [bumpDataVersion, matchCatalogTier]);

    const restoreCatalogPurchase = useCallback(async () => {
        const result = await restoreBkaCatalogPurchase();
        try {
            await matchCatalogTier(result.hasAccess ? 'full' : 'trial');
            bumpDataVersion();
        } catch (error) {
            result.hasAccess = false;
            result.state = {
                ...result.state,
                status: 'error',
                hasAccess: false,
                error: error instanceof Error ? error.message : String(error),
            };
        }
        setCatalogAccess(result.state);
        return result;
    }, [bumpDataVersion, matchCatalogTier]);

    useEffect(() => {
        if (isLoading || startupError) return;
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
