// Daily-limit tabs (DST-7): https://docs.ankiweb.net/deck-options.html#daily-limits
import { describe, expect, it } from 'vitest';
import { effectiveLimitScope, limitsForScope, scopeDropsOverride } from '../components/deck-options/limitScope';

describe('daily limit tabs', () => {
    it('opens on the tab whose limit is in effect', () => {
        expect(effectiveLimitScope('', '')).toBe('preset');
        expect(effectiveLimitScope('50', '')).toBe('deck');
        expect(effectiveLimitScope('50', '80')).toBe('today');
        expect(effectiveLimitScope('', '80')).toBe('today');
    });
    it('drops the overrides the chosen tab does not use', () => {
        expect(limitsForScope('preset', 50, 80)).toEqual({ deck: undefined, today: undefined });
        expect(limitsForScope('deck', 50, 80)).toEqual({ deck: 50, today: undefined });
        expect(limitsForScope('today', 50, 80)).toEqual({ deck: 50, today: 80 });
    });
    it('marks the form dirty when choosing a tab would drop a stored override', () => {
        expect(scopeDropsOverride('preset', '50', '')).toBe(true);
        expect(scopeDropsOverride('deck', '50', '')).toBe(false);
        expect(scopeDropsOverride('deck', '50', '80')).toBe(true);
        expect(scopeDropsOverride('today', '50', '80')).toBe(false);
    });
});
