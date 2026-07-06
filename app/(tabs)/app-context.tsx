import React, { createContext, useCallback, useContext, useState } from 'react';
import type { AppSettings } from '../../lib/types';
import { DEFAULT_SETTINGS, loadSettings } from '../../lib/storage';
import { useAppStartup } from './use-app-startup';

export type AppContextType = {
    selectedSubject: string | null;
    setSelectedSubject: (s: string | null) => void;
    selectedTopic: string | null;
    setSelectedTopic: (t: string | null) => void;
    settings: AppSettings;
    refreshData: () => void;
    dataVersion: number;
    bumpDataVersion: () => void;
    startupError: string | null;
    isLoading: boolean;
};

export const AppContext = createContext<AppContextType>({
    selectedSubject: null,
    setSelectedSubject: () => { },
    selectedTopic: null,
    setSelectedTopic: () => { },
    settings: DEFAULT_SETTINGS,
    refreshData: () => { },
    dataVersion: 0,
    bumpDataVersion: () => { },
    startupError: null,
    isLoading: true,
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
    const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
    const [dataVersion, setDataVersion] = useState(0);

    const refreshData = useCallback(() => {
        setSettings(loadSettings());
    }, []);

    const bumpDataVersion = useCallback(() => {
        setDataVersion((prev) => prev + 1);
    }, []);

    const { startupError, isLoading } = useAppStartup(refreshData, bumpDataVersion);

    return (
        <AppContext.Provider
            value={{
                selectedSubject,
                setSelectedSubject,
                selectedTopic,
                setSelectedTopic,
                settings,
                refreshData,
                dataVersion,
                bumpDataVersion,
                startupError,
                isLoading,
            }}
        >
            {children}
        </AppContext.Provider>
    );
}

export const useApp = () => useContext(AppContext);
