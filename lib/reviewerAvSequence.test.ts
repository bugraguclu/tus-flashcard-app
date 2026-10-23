// Behaviour reference: https://docs.ankiweb.net/templates/fields.html#text-to-speech
import { describe, expect, it, vi } from 'vitest';
import { AvSequencer, avPlaybackOrder, type AvTimers } from './reviewerAvSequence';

function manualTimers() {
    const pending: Array<{ run: () => void; ms: number } | null> = [];
    const timers: AvTimers = {
        set: (run, ms) => pending.push({ run, ms }) - 1,
        clear: (handle) => { pending[handle as number] = null; },
    };
    return { timers, fire: () => pending.splice(0).forEach((timer) => timer?.run()) };
}

describe('avPlaybackOrder', () => {
    it('orders the two kinds by their first tag on the side', () => {
        expect(avPlaybackOrder('<audio src="a.mp3"></audio> <tts service="anki">x</tts>', false)).toEqual(['sound', 'tts']);
        expect(avPlaybackOrder('<tts service="android" voice="en_US">x</tts><audio src="a"></audio>', false)).toEqual(['tts', 'sound']);
        expect(avPlaybackOrder('<audio src="a"></audio>', false)).toEqual(['sound']);
        expect(avPlaybackOrder('<audio src="a"></audio>', true)).toEqual(['sound', 'tts']);
        expect(avPlaybackOrder('text only', true)).toEqual(['tts']);
        expect(avPlaybackOrder('text only', false)).toEqual([]);
    });
});

describe('AvSequencer', () => {
    it('starts the second kind only after the first has played', () => {
        const { timers } = manualTimers();
        const sequencer = new AvSequencer(timers);
        const speak = vi.fn();
        sequencer.after('sound', speak);
        sequencer.report('sound', false); // a stale "silent" before playback began
        sequencer.report('tts', false);
        expect(speak).not.toHaveBeenCalled();
        sequencer.report('sound', true);
        sequencer.report('sound', false);
        expect(speak).toHaveBeenCalledTimes(1);
        sequencer.report('sound', false);
        expect(speak).toHaveBeenCalledTimes(1);
    });

    it('does not stay silent when the first kind never starts', () => {
        const { timers, fire } = manualTimers();
        const sequencer = new AvSequencer(timers);
        const play = vi.fn();
        sequencer.after('tts', play);
        fire();
        expect(play).toHaveBeenCalledTimes(1);
    });

    it('drops the held kind when the side changes', () => {
        const { timers, fire } = manualTimers();
        const sequencer = new AvSequencer(timers);
        const speak = vi.fn();
        sequencer.after('sound', speak);
        sequencer.report('sound', true);
        sequencer.cancel();
        sequencer.report('sound', false);
        fire();
        expect(speak).not.toHaveBeenCalled();
    });
});
