import { beforeEach, describe, expect, it, vi } from 'vitest';

const settings = vi.hoisted(() => new Map<string, string>());

vi.mock('./storage', () => ({
    getDbSetting: (key: string) => settings.get(key) ?? null,
    setDbSetting: (key: string, value: string) => settings.set(key, value),
}));

import { loadReviewerTtsEnabled, saveReviewerTtsEnabled } from './reviewerTtsState';

beforeEach(() => settings.clear());

describe('reviewer TTS preference', () => {
    it('persists the last reviewer toggle independently from lifecycle state', () => {
        expect(loadReviewerTtsEnabled()).toBe(false);
        saveReviewerTtsEnabled(true);
        expect(loadReviewerTtsEnabled()).toBe(true);
        saveReviewerTtsEnabled(false);
        expect(loadReviewerTtsEnabled()).toBe(false);
    });
});

