import { describe, expect, it } from 'vitest';
import { SCREENSHOT_BLANK_MS, ScreenGuardPolicy } from './screenGuardPolicy';

describe('screen guard policy', () => {
    it('protects while at least one screen holds the guard', () => {
        const policy = new ScreenGuardPolicy();
        expect(policy.snapshot().protect).toBe(false);

        const releaseReviewer = policy.acquire('reviewer');
        expect(policy.snapshot().protect).toBe(true);

        releaseReviewer();
        expect(policy.snapshot().protect).toBe(false);
    });

    it('keeps protection while a second screen still needs it', () => {
        const policy = new ScreenGuardPolicy();
        const releaseReviewer = policy.acquire('reviewer');
        const releaseBrowser = policy.acquire('browser');

        releaseReviewer();
        // The browser is still showing catalog rows behind the reviewer that just unmounted.
        expect(policy.snapshot().protect).toBe(true);
        expect(policy.snapshot().holders).toEqual(['browser']);

        releaseBrowser();
        expect(policy.snapshot().protect).toBe(false);
    });

    it('refcounts repeated acquires from the same screen', () => {
        const policy = new ScreenGuardPolicy();
        const releaseFirst = policy.acquire('reviewer');
        const releaseSecond = policy.acquire('reviewer');

        releaseFirst();
        expect(policy.snapshot().protect).toBe(true);

        releaseSecond();
        expect(policy.snapshot().protect).toBe(false);
    });

    it('ignores a release that runs twice', () => {
        const policy = new ScreenGuardPolicy();
        const releaseReviewer = policy.acquire('reviewer');
        policy.acquire('browser');

        releaseReviewer();
        // Strict Mode can run a cleanup twice; the second call must not drop the browser's hold.
        releaseReviewer();
        expect(policy.snapshot().holders).toEqual(['browser']);
    });

    it('ignores a release for a screen that never acquired', () => {
        const policy = new ScreenGuardPolicy();
        policy.release('editor');
        expect(policy.snapshot().protect).toBe(false);
    });

    it('blanks content only while capture runs and protection is held', () => {
        const policy = new ScreenGuardPolicy();

        policy.setCaptured(true);
        // Recording the learner's own decks is allowed, so nothing is hidden yet.
        expect(policy.snapshot().blank).toBe(false);

        const release = policy.acquire('reviewer');
        expect(policy.snapshot().blank).toBe(true);

        release();
        expect(policy.snapshot().blank).toBe(false);
    });

    it('counts screenshots only while protected content is on screen', () => {
        const policy = new ScreenGuardPolicy();

        policy.noteScreenshot();
        expect(policy.snapshot().screenshots).toBe(0);

        const release = policy.acquire('reviewer');
        policy.noteScreenshot();
        policy.noteScreenshot();
        expect(policy.snapshot().screenshots).toBe(2);

        release();
        policy.noteScreenshot();
        expect(policy.snapshot().screenshots).toBe(2);
    });

    it('publishes the current state on subscribe and on every change', () => {
        const policy = new ScreenGuardPolicy();
        const seen: boolean[] = [];
        const unsubscribe = policy.subscribe((state) => seen.push(state.protect));

        expect(seen).toEqual([false]);

        const release = policy.acquire('reviewer');
        expect(seen).toEqual([false, true]);

        release();
        expect(seen).toEqual([false, true, false]);

        unsubscribe();
        policy.acquire('browser');
        expect(seen).toEqual([false, true, false]);
    });

    it('drops every holder on reset', () => {
        const policy = new ScreenGuardPolicy();
        policy.acquire('reviewer');
        policy.acquire('browser');
        policy.setCaptured(true);
        policy.setShielded(true);
        policy.noteScreenshot();

        policy.reset();
        expect(policy.snapshot()).toEqual({
            protect: false,
            blank: false,
            captured: false,
            holders: [],
            screenshots: 0,
            shielded: false,
            blankUntil: null,
        });
    });
});

/**
 * A screenshot cannot be undone, so the only thing left to protect is the next one. Capturing a
 * deck of nine thousand cards is a mechanical job at one shot per second and an impossible one
 * when every shot costs a wait and a tap to bring the card back.
 */
describe('hiding the card after a screenshot', () => {
    const T0 = 1_760_000_000_000;

    it('hides the card for a few seconds after the shutter', () => {
        const policy = new ScreenGuardPolicy();
        policy.acquire('reviewer');

        expect(policy.snapshot(T0).blank).toBe(false);
        policy.noteScreenshot(T0);

        expect(policy.snapshot(T0).blank).toBe(true);
        expect(policy.snapshot(T0 + SCREENSHOT_BLANK_MS - 1).blank).toBe(true);
        // And it comes back on its own; nothing has to be turned off.
        expect(policy.snapshot(T0 + SCREENSHOT_BLANK_MS).blank).toBe(false);
    });

    it('extends the wait when a second screenshot lands inside the first', () => {
        const policy = new ScreenGuardPolicy();
        policy.acquire('reviewer');
        policy.noteScreenshot(T0);
        policy.noteScreenshot(T0 + 1000);

        // Hammering the shutter buys nothing: the window is measured from the last one.
        expect(policy.snapshot(T0 + SCREENSHOT_BLANK_MS).blank).toBe(true);
        expect(policy.snapshot(T0 + 1000 + SCREENSHOT_BLANK_MS).blank).toBe(false);
        expect(policy.snapshot(T0).screenshots).toBe(2);
    });

    it('never extends the wait backwards when shots arrive out of order', () => {
        const policy = new ScreenGuardPolicy();
        policy.acquire('reviewer');
        policy.noteScreenshot(T0 + 1000);
        policy.noteScreenshot(T0);

        expect(policy.snapshot(T0 + 1000 + SCREENSHOT_BLANK_MS - 1).blank).toBe(true);
    });

    it('reports when the blanking ends so the screen can bring the card back', () => {
        const policy = new ScreenGuardPolicy();
        policy.acquire('reviewer');
        expect(policy.snapshot(T0).blankUntil).toBeNull();

        policy.noteScreenshot(T0);
        expect(policy.snapshot(T0).blankUntil).toBe(T0 + SCREENSHOT_BLANK_MS);
        expect(policy.snapshot(T0 + SCREENSHOT_BLANK_MS).blankUntil).toBeNull();
    });

    it('ignores a screenshot taken while no protected screen is showing', () => {
        const policy = new ScreenGuardPolicy();
        policy.noteScreenshot(T0);

        expect(policy.snapshot(T0).screenshots).toBe(0);
        expect(policy.snapshot(T0).blank).toBe(false);
        // And a screen opened afterwards is not blanked by a shot that predates it.
        policy.acquire('reviewer');
        expect(policy.snapshot(T0).blank).toBe(false);
    });

    it('keeps the card hidden for a running capture regardless of the screenshot clock', () => {
        const policy = new ScreenGuardPolicy();
        policy.acquire('reviewer');
        policy.setCaptured(true);
        policy.noteScreenshot(T0);

        expect(policy.snapshot(T0 + SCREENSHOT_BLANK_MS * 10).blank).toBe(true);
        expect(policy.snapshot(T0 + SCREENSHOT_BLANK_MS * 10).captured).toBe(true);
    });
});

/**
 * The native call reports whether the window-level shield actually went in, and that answer used
 * to be discarded — so a build that could not install it believed it was protected.
 */
describe('tracking whether the window shield is really installed', () => {
    it('starts unshielded and records what the native side reported', () => {
        const policy = new ScreenGuardPolicy();
        policy.acquire('reviewer');
        expect(policy.snapshot().shielded).toBe(false);

        policy.setShielded(true);
        expect(policy.snapshot().shielded).toBe(true);

        policy.setShielded(false);
        expect(policy.snapshot().shielded).toBe(false);
    });

    it('publishes a change in shield state so a screen can react to losing it', () => {
        const policy = new ScreenGuardPolicy();
        const seen: boolean[] = [];
        policy.subscribe((state) => seen.push(state.shielded));

        policy.setShielded(true);
        // An unchanged value is not an event; only real transitions are published.
        policy.setShielded(true);
        policy.setShielded(false);

        expect(seen).toEqual([false, true, false]);
    });
});
