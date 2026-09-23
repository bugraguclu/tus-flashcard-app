import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { beforeAll, describe, expect, it, vi } from 'vitest';

const settingsState = vi.hoisted(() => ({
    value: { language: 'tr', themeMode: 'light' },
}));

vi.mock('./storage', () => ({
    DEFAULT_SETTINGS: settingsState.value,
    loadSettings: () => ({ ...settingsState.value }),
}));

vi.mock('../hooks/useAppStartup', () => ({
    useAppStartup: () => ({ startupError: null, isLoading: true }),
}));

vi.mock('../hooks/useStudyNotifications', () => ({
    useStudyNotifications: () => undefined,
}));

vi.mock('./catalogPurchases', () => {
    const state = { status: 'idle', hasAccess: false, error: null };
    return {
        INITIAL_CATALOG_ACCESS: state,
        loadCatalogAccess: async () => state,
        purchaseBkaCatalog: async () => ({ hasAccess: false, cancelled: false, state }),
        restoreBkaCatalogPurchase: async () => ({ hasAccess: false, cancelled: false, state }),
    };
});

vi.mock('./bkaCatalog', () => ({
    ensureBkaCatalogTier: async () => ({ installed: false }),
    getBkaCatalogTier: () => 'none',
    isBkaCatalogInstalled: () => false,
    uninstallBkaCatalog: () => ({ removed: false }),
}));

vi.mock('./db', () => ({ dbIndexAllCards: () => undefined }));
vi.mock('./noteManager', () => ({ getSearchIndexCards: () => [] }));
vi.mock('./subjects', () => ({ invalidateSubjectsCache: () => undefined }));
vi.mock('./catalogReconciliation', () => ({ reconcileCatalogAccessWithInstall: (state: unknown) => state }));
vi.mock('expo-localization', () => ({ useLocales: () => [{ languageCode: 'tr' }] }));

import {
    AppProvider,
    type StudyPosition,
    useAppSettings,
    useCatalogStatus,
    useSetStudyPosition,
    useStudyPosition,
} from '../contexts/AppContext';
import { useI18n } from '../hooks/useI18n';

beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

describe('AppProvider context isolation', () => {
    it('does not recompute settings, i18n, or catalog consumers when studyPosition changes', () => {
        let settingsRenders = 0;
        let i18nRenders = 0;
        let catalogRenders = 0;
        let positionRenders = 0;
        let updatePosition: ((position: StudyPosition) => void) | null = null;
        let refreshSettings: (() => void) | null = null;

        function SettingsConsumer() {
            refreshSettings = useAppSettings().refreshSettings;
            settingsRenders += 1;
            return null;
        }

        function I18nConsumer() {
            useI18n();
            i18nRenders += 1;
            return null;
        }

        function CatalogConsumer() {
            useCatalogStatus();
            catalogRenders += 1;
            return null;
        }

        function PositionConsumer() {
            useStudyPosition();
            positionRenders += 1;
            return null;
        }

        function PositionWriter() {
            updatePosition = useSetStudyPosition();
            return null;
        }

        let renderer: TestRenderer.ReactTestRenderer;
        act(() => {
            renderer = TestRenderer.create(React.createElement(
                AppProvider,
                null,
                React.createElement(React.Fragment, null,
                    React.createElement(SettingsConsumer),
                    React.createElement(I18nConsumer),
                    React.createElement(CatalogConsumer),
                    React.createElement(PositionConsumer),
                    React.createElement(PositionWriter),
                ),
            ));
        });

        expect(updatePosition).not.toBeNull();
        act(() => {
            updatePosition?.({ subject: 'cerrahi', topic: 'travma' });
        });

        expect(positionRenders).toBe(2);
        expect(settingsRenders).toBe(1);
        expect(i18nRenders).toBe(1);
        expect(catalogRenders).toBe(1);

        settingsState.value = { language: 'tr', themeMode: 'dark' };
        act(() => refreshSettings?.());

        expect(settingsRenders).toBe(2);
        expect(i18nRenders).toBe(1);
        expect(catalogRenders).toBe(1);

        act(() => renderer!.unmount());
    });
});
