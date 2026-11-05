import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from './settingsStore';
import { STUDY_DATA_SETTING_KEYS, studyDataSettingsKey } from './studyDataSettings';

describe('settings that refresh the reviewer queue', () => {
    it('keeps the same session for display, touch, audio, timebox and notification changes', () => {
        const before = studyDataSettingsKey(DEFAULT_SETTINGS);
        const changed = {
            ...DEFAULT_SETTINGS, textSizeLevel: 'xlarge' as const, themeMode: 'dark' as const,
            language: 'en' as const, cardZoomPercent: 175, imageZoomPercent: 150,
            answerButtonScalePercent: 150, browserFontScalePercent: 150, twoRowAnswerButtons: true,
            newStudyScreenEnabled: true, showAnswerButtons: false, showRemainingCount: false,
            timeboxMinutes: 10, gesturesEnabled: true, swipeSensitivity: 200,
            autoPlayAudio: false, audioPlaybackRate: 1.5, studyNotificationHour: 20,
            keyBindings: { ...DEFAULT_SETTINGS.keyBindings, again: 'j' },
        };
        expect(studyDataSettingsKey(changed)).toBe(before);
        expect(studyDataSettingsKey(structuredClone(DEFAULT_SETTINGS))).toBe(before);
    });

    it.each(STUDY_DATA_SETTING_KEYS)('refreshes when %s changes, including nested array values', (field) => {
        const before = DEFAULT_SETTINGS[field];
        const changed = Array.isArray(before) ? [...before, 1]
            : typeof before === 'number' ? before + 1
            : typeof before === 'boolean' ? !before : 'changed';
        expect(studyDataSettingsKey({ ...DEFAULT_SETTINGS, [field]: changed }))
            .not.toBe(studyDataSettingsKey(DEFAULT_SETTINGS));
    });
});
