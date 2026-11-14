// Behaviour reference: https://docs.ankiweb.net/deck-options.html#audio (sound plays when a side is
// shown) and https://docs.ankiweb.net/studying.html#editing-and-more (an edit redraws the card).
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AvSequencer, type AvKind } from './reviewerAvSequence';
import { CarriedSoundGate } from './reviewerCarriedSound';
import { useReviewerAutoplay, type ReviewerAutoplayInput } from './reviewerAutoplay';

beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

type Props = Partial<Omit<ReviewerAutoplayInput, 'speak' | 'stopSpeech' | 'playSounds' | 'gate' | 'sequencer'>>;

function setup(initial: Props) {
    const speak = vi.fn();
    const stopSpeech = vi.fn();
    const playSounds = vi.fn();
    const gate = new CarriedSoundGate();
    const sequencer = new AvSequencer();
    let props: Props = initial;
    // Every render hands the hook fresh callbacks and a fresh order array, as the reviewer does
    // whenever a collection change rebuilds the card it shows (a flag, a mark, a tag edit).
    function Harness(current: Props) {
        useReviewerAutoplay({
            cardId: 1,
            answerSide: false,
            focused: true,
            foregrounded: true,
            autoPlayAudio: true,
            wholeCardReading: false,
            interruptAudioOnAnswer: true,
            sideHasExplicitTts: false,
            cardHasAudio: true,
            answerSideHasAudio: true,
            ...current,
            order: [...(current.order ?? ['sound'])] as AvKind[],
            speak: (answer) => speak(answer),
            stopSpeech: () => stopSpeech(),
            playSounds: (answer) => playSounds(answer),
            gate,
            sequencer,
        });
        return null;
    }
    let renderer: TestRenderer.ReactTestRenderer;
    act(() => { renderer = TestRenderer.create(React.createElement(Harness, props)); });
    const rerender = (next: Props = {}) => {
        props = { ...props, ...next };
        act(() => renderer.update(React.createElement(Harness, props)));
    };
    const wait = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });
    return { speak, stopSpeech, playSounds, sequencer, rerender, wait, unmount: () => act(() => renderer.unmount()) };
}

describe('reviewer autoplay runs once per card and side', () => {
    it('does not restart the sound when a flag or a tag edit redraws the card', () => {
        const run = setup({ order: ['sound'] });
        run.wait(450);
        expect(run.playSounds).toHaveBeenCalledTimes(1);
        run.rerender();
        run.rerender();
        run.wait(2000);
        expect(run.playSounds).toHaveBeenCalledTimes(1);
        run.unmount();
    });

    it('does not cut off or re-read whole-card speech when the card is redrawn', () => {
        const run = setup({ order: ['tts'], wholeCardReading: true, cardHasAudio: false, answerSideHasAudio: false });
        run.wait(120);
        expect(run.speak).toHaveBeenCalledTimes(1);
        run.rerender();
        run.wait(2000);
        expect(run.speak).toHaveBeenCalledTimes(1);
        expect(run.stopSpeech).not.toHaveBeenCalled();
        run.unmount();
    });

    it('keeps speech queued behind the sound across a redraw', () => {
        const run = setup({ order: ['sound', 'tts'], wholeCardReading: true });
        run.wait(450);
        expect(run.playSounds).toHaveBeenCalledTimes(1);
        act(() => run.sequencer.report('sound', true));
        run.rerender();
        run.wait(450);
        act(() => run.sequencer.report('sound', false));
        expect(run.playSounds).toHaveBeenCalledTimes(1);
        expect(run.speak).toHaveBeenCalledTimes(1);
        run.unmount();
    });

    it('does not start the side again when the learner comes back from another screen', () => {
        const run = setup({ order: ['sound', 'tts'], wholeCardReading: true });
        run.wait(450);
        act(() => run.sequencer.report('sound', true));
        act(() => run.sequencer.report('sound', false));
        expect(run.speak).toHaveBeenCalledTimes(1);
        run.rerender({ focused: false });
        run.rerender({ focused: true });
        run.wait(5000);
        expect(run.playSounds).toHaveBeenCalledTimes(1);
        expect(run.speak).toHaveBeenCalledTimes(1);
        run.unmount();
    });

    it('does not play the side again when the app comes back from the background', () => {
        const run = setup({ order: ['sound'] });
        run.wait(450);
        run.rerender({ foregrounded: false });
        run.rerender({ foregrounded: true });
        run.wait(5000);
        expect(run.playSounds).toHaveBeenCalledTimes(1);
        run.unmount();
    });

    it('does not read the side again when the app comes back from the background', () => {
        const run = setup({ order: ['tts'], wholeCardReading: true, cardHasAudio: false });
        run.wait(120);
        expect(run.speak).toHaveBeenCalledTimes(1);
        run.rerender({ foregrounded: false });
        run.rerender({ foregrounded: true });
        run.wait(5000);
        expect(run.speak).toHaveBeenCalledTimes(1);
        run.unmount();
    });

    it('still plays a side whose audio had not started when the app left the foreground', () => {
        const run = setup({ order: ['sound'] });
        run.wait(100);
        run.rerender({ foregrounded: false });
        run.wait(1000);
        expect(run.playSounds).not.toHaveBeenCalled();
        run.rerender({ foregrounded: true });
        run.wait(450);
        expect(run.playSounds).toHaveBeenCalledTimes(1);
        run.unmount();
    });

    it('plays each new side and each new card', () => {
        const run = setup({ order: ['sound'] });
        run.wait(450);
        run.rerender({ answerSide: true });
        run.wait(450);
        expect(run.playSounds).toHaveBeenLastCalledWith(true);
        run.rerender({ cardId: 2, answerSide: false });
        run.wait(450);
        expect(run.playSounds).toHaveBeenCalledTimes(3);
        expect(run.playSounds).toHaveBeenLastCalledWith(false);
        // The same card dealt again (after Again) starts on its question, which plays.
        run.rerender({ answerSide: true });
        run.wait(450);
        run.rerender({ answerSide: false });
        run.wait(450);
        expect(run.playSounds).toHaveBeenCalledTimes(5);
        run.unmount();
    });

    it('reads the side when whole-card reading is switched on', () => {
        const run = setup({ order: ['tts'], cardHasAudio: false, answerSideHasAudio: false });
        run.rerender({ wholeCardReading: true });
        run.wait(120);
        expect(run.speak).toHaveBeenCalledTimes(1);
        run.rerender({ wholeCardReading: false });
        run.rerender({ wholeCardReading: true });
        run.wait(120);
        expect(run.speak).toHaveBeenCalledTimes(2);
        run.unmount();
    });

    it('a side whose audio never started before the learner left still plays on return', () => {
        const run = setup({ order: ['sound'] });
        run.wait(200);
        run.rerender({ focused: false });
        run.rerender({ focused: true });
        run.wait(450);
        expect(run.playSounds).toHaveBeenCalledTimes(1);
        run.unmount();
    });
});
