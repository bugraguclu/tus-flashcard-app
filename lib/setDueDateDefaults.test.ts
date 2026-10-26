import { describe, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => new Map<string, string>());
vi.mock('./dbSettings', () => ({
    getDbSetting: (key: string) => store.get(key) ?? null,
    setDbSetting: (key: string, value: string) => { store.set(key, value); },
}));

import { getSetDueDateDefault, rememberSetDueDateInput } from './setDueDateDefaults';

describe('Set Due Date default text (Anki SET_DUE_BROWSER / SET_DUE_REVIEWER)', () => {
    it('opens empty, then on the last input, kept apart per context', () => {
        expect(getSetDueDateDefault('browser')).toBe('');
        rememberSetDueDateInput('browser', ' 3-7! ');
        rememberSetDueDateInput('reviewer', '1');
        expect(getSetDueDateDefault('browser')).toBe('3-7!');
        expect(getSetDueDateDefault('reviewer')).toBe('1');
    });
});
