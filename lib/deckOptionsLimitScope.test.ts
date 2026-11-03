// Daily-limit tabs (DST-7): https://docs.ankiweb.net/deck-options.html#daily-limits
// Tab behaviour independently derived from Anki's TabbedValue.svelte and ValueTab (ts/routes/deck-options).
import { describe, expect, it } from 'vitest';
import {
    chosenTabValue,
    effectiveLimitScope,
    formForSave,
    tabValuesToStore,
} from '../components/deck-options/limitScope';

describe('daily limit tabs', () => {
    const onScreen = { preset: '120', deck: '50', today: '80' };
    const loaded = { preset: '200', deck: '40', today: '' };

    it('opens on the tab whose limit is in effect', () => {
        expect(effectiveLimitScope('', '')).toBe('preset');
        expect(effectiveLimitScope('50', '')).toBe('deck');
        expect(effectiveLimitScope('50', '80')).toBe('today');
        expect(effectiveLimitScope('', '80')).toBe('today');
    });
    it('drops the overrides narrower than the chosen tab', () => {
        expect(tabValuesToStore('preset', onScreen, loaded)).toEqual({ preset: '120', deck: '', today: '' });
        expect(tabValuesToStore('deck', onScreen, loaded).today).toBe('');
    });
    it('keeps each broader tab passed over at the value it was loaded with', () => {
        // A limit typed on "This deck" and then left for "Today only" is not stored, nor one typed
        // on "Preset" and then left. Before, both were, the second for every deck on the preset.
        expect(tabValuesToStore('deck', onScreen, loaded)).toEqual({ preset: '200', deck: '50', today: '' });
        expect(tabValuesToStore('today', onScreen, loaded)).toEqual({ preset: '200', deck: '40', today: '80' });
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

describe('the form as Save stores it', () => {
    const form = {
        maxReviewsPerDay: '120',
        deckReviewLimit: '50',
        todayReviewLimit: '80',
        desiredRetention: '0.85',
        deckDesiredRetention: '0.80',
        fsrsEnabled: true,
        description: 'Kalp',
    };
    const asLoaded = { maxReviewsPerDay: '200', deckReviewLimit: '40', desiredRetention: '0.90' };

    it('settles the review limit fields by their tabs', () => {
        expect(formForSave(form, asLoaded, 'today', 'preset')).toMatchObject({
            maxReviewsPerDay: '200',
            deckReviewLimit: '40',
            todayReviewLimit: '80',
        });
        expect(formForSave(form, asLoaded, 'preset', 'preset')).toMatchObject({
            maxReviewsPerDay: '120',
            deckReviewLimit: '',
            todayReviewLimit: '',
        });
    });
    it('lets the desired retention tabs decide as the limit tabs do', () => {
        // Saving on "Preset" drops the deck's own value: before, the deck kept it while the
        // screen showed the preset's as the value in use.
        expect(formForSave(form, asLoaded, 'preset', 'preset')).toMatchObject({ desiredRetention: '0.85', deckDesiredRetention: '' });
        expect(formForSave(form, asLoaded, 'preset', 'deck')).toMatchObject({ desiredRetention: '0.90', deckDesiredRetention: '0.80' });
    });
    it('keeps both retention values while FSRS is off and their tabs are hidden', () => {
        expect(formForSave({ ...form, fsrsEnabled: false }, asLoaded, 'preset', 'preset'))
            .toMatchObject({ desiredRetention: '0.85', deckDesiredRetention: '0.80' });
    });
    it('leaves the fields no tab decides as they are', () => {
        expect(formForSave(form, asLoaded, 'today', 'deck').description).toBe('Kalp');
    });
});
