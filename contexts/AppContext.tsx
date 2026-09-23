import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import type { AppSettings } from '../lib/types';
import { DEFAULT_SETTINGS, loadSettings } from '../lib/storage';
import { useAppStartup, type StartupIssue } from '../hooks/useAppStartup';
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
import { DeferredSchedulingInvalidation } from '../lib/deferredInvalidation';

/** Course + topic of the card currently on screen; drives the live sidebar highlight. */
export type StudyPosition = { subject: string; topic: string } | null;

type SettingsContextValue = {
    settings: AppSettings;
    refreshSettings: () => void;
};

type CollectionContextValue = {
    /** Structural/content changes that mounted data views must observe immediately. */
    collectionVersion: number;
    invalidateCollection: () => void;
    /**
     * Scheduler-only changes are deliberately passive. A card answer marks the revision without
     * publishing a React update; count-heavy screens consume it when they regain focus.
     */
    markSchedulingStale: () => void;
    getSchedulingRevision: () => number;
};

type StudyScopeContextValue = {
    selectedSubject: string | null;
    setSelectedSubject: (subject: string | null) => void;
    selectedTopic: string | null;
    setSelectedTopic: (topic: string | null) => void;
    /** Anki's "current deck": the deck last opened for studying. */
    activeDeckName: string | null;
    setActiveDeckName: (name: string | null) => void;
};

type StartupContextValue = {
    startupError: StartupIssue | null;
    isLoading: boolean;
    startupActionPending: boolean;
    continueStartupWait: () => void;
    retryStartup: () => void;
};

type CatalogContextValue = {
    catalogAccess: CatalogAccessState;
    /** True while either the trial or purchased catalog is physically present. */
    catalogInstalled: boolean;
    /** True while cards are being written to or removed from the collection. */
    catalogInstalling: boolean;
    refreshCatalogAccess: () => Promise<CatalogAccessState>;
    purchaseCatalog: () => Promise<CatalogPurchaseResult>;
    restoreCatalogPurchase: () => Promise<CatalogPurchaseResult>;
};

const SettingsContext = createContext<SettingsContextValue>({
    settings: DEFAULT_SETTINGS,
    refreshSettings: () => { },
});
const LanguagePreferenceContext = createContext<AppSettings['language']>(DEFAULT_SETTINGS.language);

const CollectionContext = createContext<CollectionContextValue>({
    collectionVersion: 0,
    invalidateCollection: () => { },
    markSchedulingStale: () => { },
    getSchedulingRevision: () => 0,
});

const StudyScopeContext = createContext<StudyScopeContextValue>({
    selectedSubject: null,
    setSelectedSubject: () => { },
    selectedTopic: null,
    setSelectedTopic: () => { },
    activeDeckName: null,
    setActiveDeckName: () => { },
});

const StudyPositionContext = createContext<StudyPosition>(null);
const SetStudyPositionContext = createContext<(position: StudyPosition) => void>(() => { });

const StartupContext = createContext<StartupContextValue>({
    startupError: null,
    isLoading: true,
    startupActionPending: false,
    continueStartupWait: () => { },
    retryStartup: () => { },
});

const CatalogContext = createContext<CatalogContextValue>({
    catalogAccess: INITIAL_CATALOG_ACCESS,
    catalogInstalled: false,
    catalogInstalling: false,
    refreshCatalogAccess: async () => INITIAL_CATALOG_ACCESS,
    purchaseCatalog: async () => ({ hasAccess: false, cancelled: false, state: INITIAL_CATALOG_ACCESS }),
    restoreCatalogPurchase: async () => ({ hasAccess: false, cancelled: false, state: INITIAL_CATALOG_ACCESS }),
});

/**
 * Hosts shared app state and runs startup. The narrow providers prevent unrelated consumers
 * from subscribing to the card-by-card study position or collection invalidations.
 */
export function AppProvider({ children }: { children: React.ReactNode }) {
    const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
    const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
    const [studyPosition, setStudyPosition] = useState<StudyPosition>(null);
    const [activeDeckName, setActiveDeckName] = useState<string | null>(null);
    const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
    const [collectionVersion, setCollectionVersion] = useState(0);
    const schedulingInvalidationRef = useRef(new DeferredSchedulingInvalidation());
    const [catalogAccess, setCatalogAccess] = useState<CatalogAccessState>(INITIAL_CATALOG_ACCESS);
    const [catalogInstalled, setCatalogInstalled] = useState(false);
    const [catalogInstalling, setCatalogInstalling] = useState(false);

    const refreshSettings = useCallback(() => {
        setSettings(loadSettings());
    }, []);

    const markSchedulingStale = useCallback(() => {
        schedulingInvalidationRef.current.markStale();
    }, []);

    const getSchedulingRevision = useCallback(() => schedulingInvalidationRef.current.current(), []);

    const invalidateCollection = useCallback(() => {
        schedulingInvalidationRef.current.markStale();
        setCollectionVersion((previous) => previous + 1);
    }, []);

    const {
        startupError,
        isLoading,
        startupActionPending,
        continueStartupWait,
        retryStartup,
    } = useAppStartup(refreshSettings, invalidateCollection);
    useStudyNotifications(settings, isLoading);

    /** Match physical catalog rows to entitlement without exposing partial installation state. */
    const matchCatalogToAccess = useCallback(async (hasAccess: boolean) => {
        setCatalogInstalling(true);
        try {
            const changed = hasAccess
                ? (await ensureBkaCatalogTier('full')).installed
                : uninstallBkaCatalog().removed;
            if (changed) {
                invalidateSubjectsCache();
                dbIndexAllCards(getSearchIndexCards());
                invalidateCollection();
            }
            setCatalogInstalled(isBkaCatalogInstalled());
        } finally {
            setCatalogInstalling(false);
        }
    }, [invalidateCollection]);

    const applyAccessState = useCallback(async (raw: CatalogAccessState) => {
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

    const settingsValue = useMemo<SettingsContextValue>(() => ({
        settings,
        refreshSettings,
    }), [settings, refreshSettings]);

    const collectionValue = useMemo<CollectionContextValue>(() => ({
        collectionVersion,
        invalidateCollection,
        markSchedulingStale,
        getSchedulingRevision,
    }), [collectionVersion, invalidateCollection, markSchedulingStale, getSchedulingRevision]);

    const studyScopeValue = useMemo<StudyScopeContextValue>(() => ({
        selectedSubject,
        setSelectedSubject,
        selectedTopic,
        setSelectedTopic,
        activeDeckName,
        setActiveDeckName,
    }), [selectedSubject, selectedTopic, activeDeckName]);

    const startupValue = useMemo<StartupContextValue>(() => ({
        startupError,
        isLoading,
        startupActionPending,
        continueStartupWait,
        retryStartup,
    }), [
        startupError,
        isLoading,
        startupActionPending,
        continueStartupWait,
        retryStartup,
    ]);

    const catalogValue = useMemo<CatalogContextValue>(() => ({
        catalogAccess,
        catalogInstalled,
        catalogInstalling,
        refreshCatalogAccess,
        purchaseCatalog,
        restoreCatalogPurchase,
    }), [
        catalogAccess,
        catalogInstalled,
        catalogInstalling,
        refreshCatalogAccess,
        purchaseCatalog,
        restoreCatalogPurchase,
    ]);

    return (
        <LanguagePreferenceContext.Provider value={settings.language}>
            <SettingsContext.Provider value={settingsValue}>
                <CollectionContext.Provider value={collectionValue}>
                    <StudyScopeContext.Provider value={studyScopeValue}>
                        <StudyPositionContext.Provider value={studyPosition}>
                            <SetStudyPositionContext.Provider value={setStudyPosition}>
                                <StartupContext.Provider value={startupValue}>
                                    <CatalogContext.Provider value={catalogValue}>
                                        {children}
                                    </CatalogContext.Provider>
                                </StartupContext.Provider>
                            </SetStudyPositionContext.Provider>
                        </StudyPositionContext.Provider>
                    </StudyScopeContext.Provider>
                </CollectionContext.Provider>
            </SettingsContext.Provider>
        </LanguagePreferenceContext.Provider>
    );
}

export const useAppSettings = () => useContext(SettingsContext);
export const useLanguagePreference = () => useContext(LanguagePreferenceContext);
export const useCollectionInvalidation = () => useContext(CollectionContext);
export const useStudyScope = () => useContext(StudyScopeContext);
export const useStudyPosition = () => useContext(StudyPositionContext);
export const useSetStudyPosition = () => useContext(SetStudyPositionContext);
export const useStartupStatus = () => useContext(StartupContext);
export const useCatalogStatus = () => useContext(CatalogContext);
