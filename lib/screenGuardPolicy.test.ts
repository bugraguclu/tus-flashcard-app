import { describe, expect, it } from 'vitest';
import { ScreenGuardPolicy } from './screenGuardPolicy';

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

        policy.reset();
        expect(policy.snapshot()).toEqual({ protect: false, blank: false, holders: [], screenshots: 0 });
    });
});
