import { describe, expect, it, vi } from 'vitest';
import {
    CarriedSoundGate,
    MEDIA_PLAYBACK_REPORTER,
    anyMediaPlaying,
    reportMediaPlayback,
    shouldCarrySound,
    silencedCallbacks,
} from './reviewerCarriedSound';

describe('Settings › Reviewing › Interrupt audio when answering', () => {
    it('lets a playing sound run on only when the setting is off', () => {
        expect(shouldCarrySound(false, true)).toBe(true);
        expect(shouldCarrySound(true, true)).toBe(false);
        expect(shouldCarrySound(false, false)).toBe(false);
    });

    it('counts an element as playing until it is paused or has ended', () => {
        expect(anyMediaPlaying([])).toBe(false);
        expect(anyMediaPlaying([{ paused: true, ended: false }, { paused: false, ended: false }])).toBe(true);
        expect(anyMediaPlaying([{ paused: false, ended: true }])).toBe(false);
    });
});

describe('media playback reporting', () => {
    function fakeDocument() {
        const media = [{ paused: true, ended: false }];
        const handlers = new Map<string, () => void>();
        const doc = {
            addEventListener: (type: string, handler: () => void, capture?: boolean) => {
                expect(capture).toBe(true);
                handlers.set(type, handler);
            },
            querySelectorAll: () => media,
        };
        return { media, fire: (type: string) => handlers.get(type)?.(), doc: doc as unknown as Document };
    }

    it('reports each change once, whichever media event brings it', () => {
        const { media, fire, doc } = fakeDocument();
        const report = vi.fn();
        reportMediaPlayback(doc, report);
        media[0].paused = false;
        fire('play');
        fire('playing');
        media[0].ended = true;
        fire('ended');
        expect(report.mock.calls).toEqual([[true], [false]]);
    });

    it('listens to the same events in the native card view', () => {
        for (const type of ['play', 'playing', 'pause', 'ended', 'error', 'emptied']) {
            expect(MEDIA_PLAYBACK_REPORTER).toContain(`"${type}"`);
        }
        expect(MEDIA_PLAYBACK_REPORTER).toContain("'MEDIA:'");
    });
});

describe('the carried card view', () => {
    it('keeps every prop and the presence of each callback, but no callback reaches the reviewer', () => {
        const onCardTap = vi.fn();
        const onCardSwipe = vi.fn();
        const props = { side: 'question', onCardTap, onCardSwipe, onAnswerAnchor: undefined, playAudioSignal: 3 };
        const silenced = silencedCallbacks(props);
        expect(silenced.side).toBe('question');
        expect(silenced.playAudioSignal).toBe(3);
        expect(silenced.onAnswerAnchor).toBeUndefined();
        expect(typeof silenced.onCardTap).toBe('function');
        silenced.onCardTap();
        silenced.onCardSwipe();
        expect(onCardTap).not.toHaveBeenCalled();
        expect(onCardSwipe).not.toHaveBeenCalled();
        expect(props.onCardTap).toBe(onCardTap);
    });
});

describe('CarriedSoundGate', () => {
    it('runs at once when nothing is carried over', () => {
        const gate = new CarriedSoundGate();
        const run = vi.fn();
        gate.whenClear(run);
        expect(run).toHaveBeenCalledTimes(1);
        expect(gate.active).toBe(false);
    });

    it('holds the new side’s audio until the carried sound has ended, as Anki queues it', () => {
        const gate = new CarriedSoundGate();
        const sounds = vi.fn();
        const speech = vi.fn();
        gate.begin();
        gate.whenClear(sounds);
        gate.whenClear(speech);
        expect(sounds).not.toHaveBeenCalled();
        expect(gate.active).toBe(true);
        gate.finish();
        expect(sounds).toHaveBeenCalledTimes(1);
        expect(speech).toHaveBeenCalledTimes(1);
        expect(gate.active).toBe(false);
        gate.finish();
        expect(sounds).toHaveBeenCalledTimes(1);
    });

    it('drops held audio when the carried sound is stopped rather than finished', () => {
        const gate = new CarriedSoundGate();
        const held = vi.fn();
        gate.begin();
        gate.whenClear(held);
        gate.stop();
        gate.finish();
        expect(held).not.toHaveBeenCalled();
        expect(gate.active).toBe(false);
    });

    it('forgets a held run whose side was left before the sound ended', () => {
        const gate = new CarriedSoundGate();
        const held = vi.fn();
        gate.begin();
        const cancel = gate.whenClear(held);
        cancel();
        gate.finish();
        expect(held).not.toHaveBeenCalled();
    });

    it('tells the reviewer when carrying starts and ends, so the hidden view can go', () => {
        const gate = new CarriedSoundGate();
        const listener = vi.fn();
        const unsubscribe = gate.subscribe(listener);
        gate.begin();
        gate.begin();
        gate.stop();
        gate.stop();
        gate.begin();
        gate.finish();
        unsubscribe();
        gate.begin();
        expect(listener.mock.calls).toEqual([[true], [false], [true], [false]]);
    });
});
