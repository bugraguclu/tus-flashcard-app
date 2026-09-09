import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
    beginStudyActivity,
    canRunAutoBackup,
    isStudyActive,
    resetStudyActivityForTests,
    subscribeToStudyIdle,
} from './backupWindow';

beforeEach(() => {
    resetStudyActivityForTests();
});

describe('canRunAutoBackup', () => {
    it('blocks the snapshot while the reviewer is in front of the learner', () => {
        expect(canRunAutoBackup({ appState: 'active', studyActive: true })).toBe(false);
    });

    it('allows the snapshot on a foreground screen that is not studying', () => {
        expect(canRunAutoBackup({ appState: 'active', studyActive: false })).toBe(true);
    });

    it('allows the snapshot once the app leaves the foreground, even mid-review', () => {
        // Backgrounding is the preferred window: an interrupted write is discarded, and the
        // learner cannot be looking at a stalled frame.
        expect(canRunAutoBackup({ appState: 'background', studyActive: true })).toBe(true);
        expect(canRunAutoBackup({ appState: 'inactive', studyActive: true })).toBe(true);
    });
});

describe('study activity registry', () => {
    it('reports idle until a surface registers', () => {
        expect(isStudyActive()).toBe(false);
        const release = beginStudyActivity();
        expect(isStudyActive()).toBe(true);
        release();
        expect(isStudyActive()).toBe(false);
    });

    it('stays busy while overlapping surfaces are registered', () => {
        const first = beginStudyActivity();
        const second = beginStudyActivity();
        first();
        expect(isStudyActive()).toBe(true);
        second();
        expect(isStudyActive()).toBe(false);
    });

    it('ignores a repeated release so the count cannot drift negative', () => {
        const release = beginStudyActivity();
        release();
        release();
        expect(isStudyActive()).toBe(false);

        // A drifted count would make the next surface look idle and let a snapshot start
        // while a card is on screen.
        beginStudyActivity();
        expect(isStudyActive()).toBe(true);
    });

    it('notifies idle listeners only when the last surface is released', () => {
        const onIdle = vi.fn();
        subscribeToStudyIdle(onIdle);

        const first = beginStudyActivity();
        const second = beginStudyActivity();
        first();
        expect(onIdle).not.toHaveBeenCalled();

        second();
        expect(onIdle).toHaveBeenCalledTimes(1);
    });

    it('stops notifying after unsubscribe', () => {
        const onIdle = vi.fn();
        const unsubscribe = subscribeToStudyIdle(onIdle);
        unsubscribe();

        beginStudyActivity()();
        expect(onIdle).not.toHaveBeenCalled();
    });
});
