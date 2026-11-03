// Daily-limit tabs (DST-7): https://docs.ankiweb.net/deck-options.html#daily-limits
// Tab behaviour independently derived from Anki's TabbedValue.svelte and ValueTab (ts/routes/deck-options).
import { describe, expect, it } from 'vitest';
import {
    chosenTabValue,
    deckRetentionForScope,
    effectiveLimitScope,
    limitsForScope,
    scopeDropsOverride,
} from '../components/deck-options/limitScope';

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
    it('starts a chosen tab that has no value from the value on screen', () => {
        // Choosing "This deck" while the preset shows 200 makes 200 this deck's own limit, which
        // Save can then store; before, the tab showed an empty field and Save had nothing to do.
        expect(chosenTabValue('', '200')).toBe('200');
        expect(chosenTabValue('  ', '200')).toBe('200');
        // A tab that already has its own value keeps it.
        expect(chosenTabValue('50', '200')).toBe('50');
    });
});

describe('desired retention tabs', () => {
    it('let the chosen tab decide, as the limit tabs do', () => {
        expect(deckRetentionForScope('deck', 0.85, true)).toBe(0.85);
        // Saving on "Preset" drops the deck's own value: before, the deck kept 0.85 while the
        // screen showed the preset's 0.90 as the value in use.
        expect(deckRetentionForScope('preset', 0.85, true)).toBeUndefined();
        expect(scopeDropsOverride('preset', '0.85', '')).toBe(true);
    });
    it('keep the deck value while FSRS is off and the tabs are hidden', () => {
        expect(deckRetentionForScope('preset', 0.85, false)).toBe(0.85);
        expect(deckRetentionForScope('deck', undefined, false)).toBeUndefined();
    });
});
