// Every app setting is either synced (it changes how the learner studies) or kept on the device
// (docs/HESAP_SENKRON.md §4.3). A new setting fails this test until it is put in one of the lists.
import { describe, expect, it, vi } from 'vitest';

vi.mock('../db', () => ({ getDB: () => null, flushDatabaseWrites: async () => {} }));

import { DEFAULT_SETTINGS } from '../settingsStore';
import { COLLECTION_SETTINGS, DEVICE_SETTINGS, PRESET_BACKED_SETTINGS } from './syncCodecsOther';

describe('settings sync scope', () => {
    it('classifies every setting exactly once', () => {
        const lists = [COLLECTION_SETTINGS, DEVICE_SETTINGS, PRESET_BACKED_SETTINGS].map((list) => new Set<string>(list));
        const all = Object.keys(DEFAULT_SETTINGS);
        const unclassified = all.filter((key) => !lists.some((list) => list.has(key)));
        expect(unclassified, 'add the new setting to COLLECTION_SETTINGS or DEVICE_SETTINGS').toEqual([]);
        for (const [index, list] of lists.entries()) {
            for (const other of lists.slice(index + 1)) expect([...list].filter((key) => other.has(key))).toEqual([]);
        }
        const unknown = [...lists.flatMap((list) => [...list])].filter((key) => !all.includes(key));
        expect(unknown).toEqual([]);
    });

    it('keeps the screen, gesture and notification settings on the device', () => {
        for (const key of ['themeMode', 'textSizeLevel', 'keyBindings', 'keepScreenOn', 'studyNotificationHour', 'autoBackupEnabled']) {
            expect(DEVICE_SETTINGS as readonly string[]).toContain(key);
        }
        for (const key of ['dayRolloverHour', 'learnAheadMinutes', 'fsrsEnabled', 'language']) {
            expect(COLLECTION_SETTINGS as readonly string[]).toContain(key);
        }
    });
});
