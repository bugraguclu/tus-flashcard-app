import { describe, expect, it } from 'vitest';
import { rebaseSettingsDraft } from './settingsDraft';
import type { AppSettings } from './types';

const opened = {
    language: 'tr',
    themeMode: 'light',
    dailyNewLimit: 20,
    learningSteps: [1, 10],
    keyBindings: { showAnswer: ' ', again: '1', hard: '2', good: '3', easy: '4', replayAudio: 'r', buryCard: '-', suspendCard: '@', markNote: '*' },
} as unknown as AppSettings;

describe('a Settings draft over settings restored underneath it', () => {
    it('takes every field the learner did not touch from storage', () => {
        const draft = { ...opened, themeMode: 'dark' } as AppSettings;
        const restored = { ...opened, language: 'en', dailyNewLimit: 50, learningSteps: [5] } as AppSettings;

        expect(rebaseSettingsDraft(opened, draft, restored)).toEqual({
            ...restored,
            themeMode: 'dark',
        });
    });

    it('keeps the learner’s edit of a field storage changed as well', () => {
        const draft = { ...opened, language: 'en' } as AppSettings;
        const restored = { ...opened, language: 'system' } as AppSettings;

        expect(rebaseSettingsDraft(opened, draft, restored).language).toBe('en');
    });

    it('treats an edit undone before saving as untouched', () => {
        const draft = { ...opened, themeMode: 'light' } as AppSettings;
        const restored = { ...opened, themeMode: 'dark' } as AppSettings;

        expect(rebaseSettingsDraft(opened, draft, restored).themeMode).toBe('dark');
    });

    it('compares nested values by content, not by object identity', () => {
        const draft = { ...opened, keyBindings: { ...opened.keyBindings } } as AppSettings;
        const restored = { ...opened, keyBindings: { ...opened.keyBindings, again: 'j' } } as AppSettings;

        expect(rebaseSettingsDraft(opened, draft, restored).keyBindings.again).toBe('j');
    });

    it('returns storage unchanged when the draft has no edits', () => {
        const restored = { ...opened, language: 'en' } as AppSettings;

        expect(rebaseSettingsDraft(opened, { ...opened }, restored)).toEqual(restored);
    });
});
