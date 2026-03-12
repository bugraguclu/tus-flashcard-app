import { createContext, useContext } from 'react';
import type { AppSettings } from '../../lib/types';
import { DEFAULT_SETTINGS } from '../../lib/storage';

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
});

export const useApp = () => useContext(AppContext);
