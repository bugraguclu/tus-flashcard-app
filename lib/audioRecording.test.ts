import { describe, expect, it } from 'vitest';
import {
    LEVEL_BAR_COUNT,
    MIN_TAKE_BYTES,
    emptyLevels,
    isEmptyLoadedTake,
    isUsableTake,
    formatRecordingTime,
    levelFromMetering,
    pushLevel,
    recordingFileType,
} from './audioRecording';

describe('formatRecordingTime', () => {
    it('shows minutes and seconds, and hours once a take runs past one', () => {
        expect(formatRecordingTime(0)).toBe('0:00');
        expect(formatRecordingTime(7_900)).toBe('0:07');
        expect(formatRecordingTime(754_000)).toBe('12:34');
        expect(formatRecordingTime(3_723_000)).toBe('1:02:03');
    });

    it('never shows a negative or broken clock', () => {
        expect(formatRecordingTime(-5)).toBe('0:00');
        expect(formatRecordingTime(Number.NaN)).toBe('0:00');
    });
});

describe('levelFromMetering', () => {
    it('maps the recorder reading onto a bar height', () => {
        expect(levelFromMetering(0)).toBe(1);
        expect(levelFromMetering(-25)).toBe(0.5);
        expect(levelFromMetering(-50)).toBe(0);
    });

    it('draws silence, missing readings and clipping inside the bar', () => {
        expect(levelFromMetering(-160)).toBe(0);
        expect(levelFromMetering(undefined)).toBe(0);
        expect(levelFromMetering(Number.NEGATIVE_INFINITY)).toBe(0);
        expect(levelFromMetering(3)).toBe(1);
    });
});

describe('pushLevel', () => {
    it('adds the newest reading at the end and drops the oldest', () => {
        const meter = pushLevel(emptyLevels(3), 0.5, 3);
        expect(meter).toEqual([0, 0, 0.5]);
        expect(pushLevel(meter, 1, 3)).toEqual([0, 0.5, 1]);
    });

    it('keeps the meter its own length and its bars in range', () => {
        expect(emptyLevels()).toHaveLength(LEVEL_BAR_COUNT);
        expect(pushLevel(emptyLevels(), 2)).toHaveLength(LEVEL_BAR_COUNT);
        expect(pushLevel([], 2, 3)).toEqual([1]);
        expect(pushLevel([], Number.NaN, 3)).toEqual([0]);
    });
});

describe('recordingFileType', () => {
    it('stores an iPhone recording as AAC in an m4a', () => {
        expect(recordingFileType(undefined)).toEqual({ extension: 'm4a', mimeType: 'audio/mp4' });
        expect(recordingFileType('')).toEqual({ extension: 'm4a', mimeType: 'audio/mp4' });
    });

    it('names a browser recording after what its MediaRecorder produced', () => {
        expect(recordingFileType('audio/webm;codecs=opus')).toEqual({ extension: 'webm', mimeType: 'audio/webm;codecs=opus' });
        expect(recordingFileType('audio/ogg')).toEqual({ extension: 'ogg', mimeType: 'audio/ogg' });
        expect(recordingFileType('audio/wav')).toEqual({ extension: 'wav', mimeType: 'audio/wav' });
        expect(recordingFileType('audio/mp4')).toEqual({ extension: 'm4a', mimeType: 'audio/mp4' });
    });
});

describe('takes with nothing in them', () => {
    it('keeps a file with sound in it and refuses a missing or header-only one', () => {
        expect(isUsableTake({ exists: true, size: 6_000 })).toBe(true);
        expect(isUsableTake({ exists: true, size: MIN_TAKE_BYTES })).toBe(true);
        expect(isUsableTake({ exists: true, size: 600 })).toBe(false);
        expect(isUsableTake({ exists: true, size: 0 })).toBe(false);
        expect(isUsableTake({ exists: true })).toBe(false);
        expect(isUsableTake({ exists: false, size: 6_000 })).toBe(false);
    });

    it('judges a loaded take only once the player has finished loading it', () => {
        expect(isEmptyLoadedTake({ isLoaded: false, duration: 0, playbackState: 'unknown' })).toBe(false);
        expect(isEmptyLoadedTake({ isLoaded: true, duration: 2.4, playbackState: 'readyToPlay' })).toBe(false);
        expect(isEmptyLoadedTake({ isLoaded: true, duration: 0, playbackState: 'readyToPlay' })).toBe(true);
        expect(isEmptyLoadedTake({ isLoaded: false, duration: 0, playbackState: 'failed' })).toBe(true);
        // A browser's take can report no length until it has been played through.
        expect(isEmptyLoadedTake({ isLoaded: true, duration: Number.POSITIVE_INFINITY })).toBe(false);
        expect(isEmptyLoadedTake({ isLoaded: true, duration: Number.NaN })).toBe(false);
    });
});
