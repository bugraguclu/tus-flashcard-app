import { describe, expect, it } from 'vitest';
import { DEFAULT_DECK_CONFIG } from './models';
import { DEFAULT_SETTINGS } from './storage';

/**
 * Defaults parity with Anki.
 *
 * A fresh collection here has to behave the way a fresh collection in Anki does — a learner who
 * moves across should not silently get different scheduling. Every expectation below is quoted
 * from upstream so the source of truth is checkable:
 *
 *   - deck preset: rslib/src/deckconfig/mod.rs → DEFAULT_DECK_CONFIG_INNER
 *   - reviewer toggles: rslib/src/config/bool.rs → get_config_bool
 *   - collection scheduling: https://docs.ankiweb.net/preferences.html
 *
 * This file exists because three defaults had drifted without any test noticing: leeches were
 * suspended rather than tagged, sibling burying was on, and the learn-ahead limit was zero.
 */
describe('deck preset defaults match DEFAULT_DECK_CONFIG_INNER', () => {
    it.each([
        ['new_per_day', DEFAULT_DECK_CONFIG.newPerDay, 20],
        ['reviews_per_day', DEFAULT_DECK_CONFIG.maxReviewsPerDay, 200],
        // Anki stores the ease per mille; the UI shows 2.50.
        ['initial_ease', DEFAULT_DECK_CONFIG.startingEase, 2500],
        ['easy_multiplier', DEFAULT_DECK_CONFIG.easyBonus, 1.3],
        ['hard_multiplier', DEFAULT_DECK_CONFIG.hardIvl, 1.2],
        ['lapse_multiplier', DEFAULT_DECK_CONFIG.newIvlPercent, 0],
        ['interval_multiplier', DEFAULT_DECK_CONFIG.ivlModifier, 1.0],
        ['maximum_review_interval', DEFAULT_DECK_CONFIG.maxIvl, 36_500],
        ['minimum_lapse_interval', DEFAULT_DECK_CONFIG.minIvl, 1],
        ['graduating_interval_good', DEFAULT_DECK_CONFIG.graduatingIvl, 1],
        ['graduating_interval_easy', DEFAULT_DECK_CONFIG.easyIvl, 4],
        ['leech_threshold', DEFAULT_DECK_CONFIG.leechThreshold, 8],
        ['cap_answer_time_to_secs', DEFAULT_DECK_CONFIG.maxAnswerSecs, 60],
    ])('%s', (_field, actual, expected) => {
        expect(actual).toBe(expected);
    });

    it('tags leeches instead of suspending them', () => {
        // LeechAction::TagOnly. Suspending by default hides a card the learner is still on.
        expect(DEFAULT_DECK_CONFIG.leechAction).toBe('tag');
    });

    it('leaves sibling burying off', () => {
        expect(DEFAULT_DECK_CONFIG.buryNewSiblings).toBe(false);
        expect(DEFAULT_DECK_CONFIG.buryReviewSiblings).toBe(false);
        expect(DEFAULT_DECK_CONFIG.buryInterdayLearningSiblings).toBe(false);
    });

    it('leaves the answer timer off and mixes new cards with reviews', () => {
        expect(DEFAULT_DECK_CONFIG.showTimer).toBe(false);
        expect(DEFAULT_DECK_CONFIG.stopTimerOnAnswer).toBe(false);
        expect(DEFAULT_DECK_CONFIG.questionAction).toBe('showAnswer');
        expect(DEFAULT_DECK_CONFIG.answerAction).toBe('bury');
        expect(DEFAULT_DECK_CONFIG.newReviewOrder).toBe('mix');
        // ReviewCardOrder::Day, which Anki's deck options label "Due date, then random".
        expect(DEFAULT_DECK_CONFIG.reviewSortOrder).toBe('dueRandom');
    });

    it('starts new cards in their insertion order', () => {
        // NewCardInsertOrder::Due — new cards keep the position they were added at.
        expect(DEFAULT_DECK_CONFIG.insertionOrder).toBe('sequential');
    });

    it('uses Anki\'s learning and relearning steps', () => {
        expect(DEFAULT_DECK_CONFIG.learningSteps).toEqual([1, 10]);
        expect(DEFAULT_DECK_CONFIG.relearningSteps).toEqual([10]);
    });
});

describe('collection preferences match Anki', () => {
    it('starts the next day at 4 AM', () => {
        expect(DEFAULT_SETTINGS.dayRolloverHour).toBe(4);
    });

    it('keeps Anki\'s 20 minute learn-ahead limit', () => {
        expect(DEFAULT_SETTINGS.learnAheadMinutes).toBe(20);
    });

    it('leaves the timebox off', () => {
        expect(DEFAULT_SETTINGS.timeboxMinutes).toBe(0);
    });

    it('starts study reminders on for any pending review', () => {
        expect(DEFAULT_SETTINGS.studyNotificationsEnabled).toBe(true);
        expect(DEFAULT_SETTINGS.studyNotificationThreshold).toBe(0);
    });

    it('places the compact reviewer toolbar at the top', () => {
        expect(DEFAULT_SETTINGS.reviewerToolbarPosition).toBe('top');
    });

    it('defaults to light theme', () => {
        expect(DEFAULT_SETTINGS.themeMode).toBe('light');
    });

    it('defaults to Turkish language', () => {
        expect(DEFAULT_SETTINGS.language).toBe('tr');
    });

    it('keeps the redesigned study screen opt-in for existing users', () => {
        expect(DEFAULT_SETTINGS.newStudyScreenEnabled).toBe(false);
    });

    it('keeps in-card typing opt-in and focuses typed answers by default', () => {
        expect(DEFAULT_SETTINGS.typeAnswerInCard).toBe(false);
        expect(DEFAULT_SETTINGS.focusTypeAnswer).toBe(true);
    });

    it.each([
        // BoolKey::ShowRemainingDueCountsInStudy
        ['showRemainingCount', DEFAULT_SETTINGS.showRemainingCount, true],
        // BoolKey::ShowIntervalsAboveAnswerButtons — on in Anki, despite what the manual implies.
        ['showNextReviewTimes', DEFAULT_SETTINGS.showNextReviewTimes, true],
        // BoolKey::InterruptAudioWhenAnswering
        ['interruptAudioOnAnswer', DEFAULT_SETTINGS.interruptAudioOnAnswer, true],
        // BoolKey::HideAudioPlayButtons is false, so the buttons are shown.
        ['showAudioPlayButtons', DEFAULT_SETTINGS.showAudioPlayButtons, true],
    ])('%s', (_key, actual, expected) => {
        expect(actual).toBe(expected);
    });

    it('adds new notes to the current deck', () => {
        // BoolKey::AddingDefaultsToCurrentDeck
        expect(DEFAULT_SETTINGS.newCardDeckMode).toBe('current');
    });

    it('uses AnkiMobile reviewer gestures when gestures are enabled', () => {
        expect(DEFAULT_SETTINGS.swipeLeftAction).toBe('tools');
        expect(DEFAULT_SETTINGS.swipeRightAction).toBe('decks');
        // Vertical gestures stay opt-in so they never steal a normal iOS card scroll.
        expect(DEFAULT_SETTINGS.swipeUpAction).toBe('off');
        expect(DEFAULT_SETTINGS.swipeDownAction).toBe('off');
    });

    it('keeps optional platform integrations opt-in', () => {
        expect(DEFAULT_SETTINGS.pasteClipboardImagesAsPng).toBe(false);
        expect(DEFAULT_SETTINGS.fullScreenNavigationDrawer).toBe(false);
        expect(DEFAULT_SETTINGS.doubleBackToExit).toBe(false);
        expect(DEFAULT_SETTINGS.showBrowserAudioFilenames).toBe(false);
    });

    it('keeps the same daily limits as the default preset', () => {
        expect(DEFAULT_SETTINGS.dailyNewLimit).toBe(DEFAULT_DECK_CONFIG.newPerDay);
        expect(DEFAULT_SETTINGS.dailyReviewLimit).toBe(DEFAULT_DECK_CONFIG.maxReviewsPerDay);
    });
});

describe('leech action survives an Anki round trip', () => {
    // rslib proto: LEECH_ACTION_SUSPEND = 0, LEECH_ACTION_TAG_ONLY = 1. Reading these the wrong
    // way round silently flips the behaviour of every imported preset, which is what the packaged
    // catalog was doing.
    const readAnkiLeechAction = (value: number) => (value === 0 ? 'suspend' : 'tag');
    const writeAnkiLeechAction = (action: 'suspend' | 'tag') => (action === 'suspend' ? 0 : 1);

    it.each([
        [0, 'suspend'],
        [1, 'tag'],
    ] as const)('reads %i as %s', (stored, action) => {
        expect(readAnkiLeechAction(stored)).toBe(action);
    });

    it.each(['suspend', 'tag'] as const)('round trips %s', (action) => {
        expect(readAnkiLeechAction(writeAnkiLeechAction(action))).toBe(action);
    });

    it('defaults an absent value to Anki\'s Tag Only', () => {
        expect(readAnkiLeechAction(1)).toBe(DEFAULT_DECK_CONFIG.leechAction);
    });
});
