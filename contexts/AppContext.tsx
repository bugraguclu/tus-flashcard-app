import React, { createContext, useCallback, useContext, useState } from 'react';
import type { AppSettings } from '../lib/types';
import { DEFAULT_SETTINGS, loadSettings } from '../lib/storage';
import { useAppStartup } from '../hooks/useAppStartup';

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
            }}
        >
            {children}
        </AppContext.Provider>
    );
}

export const useApp = () => useContext(AppContext);
