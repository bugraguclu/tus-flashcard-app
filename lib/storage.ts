/**
 * Storage layer. SQLite is the canonical source (Anki tables, deck config, app and session
 * metadata); AsyncStorage is read only as a legacy import and migration source.
 *
 * Re-exported from settingsStore (settings, session statistics, legacy migrations) and
 * backupData (whole-collection export, import and reset).
 */
export {
    DEFAULT_KEY_BINDINGS,
    DEFAULT_SETTINGS,
    loadCardStates,
    clearLegacyCardStates,
    migrateLegacySettingsIfNeeded,
    loadCustomCards,
    saveCustomCards,
    loadSessionStats,
    saveSessionStats,
    saveCollectionDeckOptions,
    loadSettings,
    resetSettingsToDefaults,
    saveSettings,
} from './settingsStore';
export type {
    SaveSettingsResult,
} from './settingsStore';
export {
    resetAllData,
    exportAllData,
    importAllData,
} from './backupData';
export { getDbSetting, setDbSetting } from './dbSettings';
