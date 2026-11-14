import { useEffect, useRef } from 'react';
import type { AvKind, AvSequencer } from './reviewerAvSequence';
import type { CarriedSoundGate } from './reviewerCarriedSound';

export interface ReviewerAutoplayInput {
    /** The card on screen, or undefined while there is none. */
    cardId: number | undefined;
    /** The answer side is shown. */
    answerSide: boolean;
    /** The reviewer is the screen in front. */
    focused: boolean;
    /** The app is in the foreground. */
    foregrounded: boolean;
    /** The card's preset (and the global sound switch) plays a side's audio by itself. */
    autoPlayAudio: boolean;
    /** Whole-card text to speech is on. */
    wholeCardReading: boolean;
    /** Anki's "Interrupt current audio when answering". */
    interruptAudioOnAnswer: boolean;
    /** The side shown has a `{{tts}}` region of its own. */
    sideHasExplicitTts: boolean;
    /** Either side has a sound file or a `{{tts}}` region. */
    cardHasAudio: boolean;
    /** The answer's own content (FrontSide left out) has audio. */
    answerSideHasAudio: boolean;
    /** The side's sound files and speech in the order they play. */
    order: readonly AvKind[];
    /** Speaks the side. */
    speak: (answerSide: boolean) => void;
    stopSpeech: () => void;
    /** Tells the card view to play the side's sound files. */
    playSounds: (answerSide: boolean) => void;
    /** A sound carried over from the side before; the new side's audio waits for it. */
    gate: CarriedSoundGate;
    sequencer: AvSequencer;
}

/** `cardId:side`, the unit autoplay runs once for. */
export function autoplaySideKey(cardId: number | undefined, answerSide: boolean): string | null {
    return cardId === undefined ? null : `${cardId}:${answerSide ? 'answer' : 'question'}`;
}

/**
 * The audio a side plays by itself when it is shown: its sound files (when the card's preset plays
 * audio automatically) and its speech (`{{tts}}` regions, or the whole card while text to speech is
 * on), one kind after the other in the side's own order (`avPlaybackOrder`).
 *
 * Anki starts this once, when it shows the side. Here it used to start over from the beginning
 * whenever the screen rebuilt the card on show: a flag, a mark or a tag edit invalidates the
 * collection, which hands the reviewer fresh callbacks, and coming back from Card Info, Deck Options
 * or the editor refocuses it. So it runs once per card and side, its effects depend on plain values
 * only, and the callbacks are read when they are called. Coming back from the background does not
 * start it again either (owner decision): the learner replays the side with R or ••• › Replay audio.
 * A side whose audio had not started yet when the app left the foreground still plays on return.
 */
export function useReviewerAutoplay(input: ReviewerAutoplayInput): void {
    const {
        cardId, answerSide, focused, foregrounded, autoPlayAudio, wholeCardReading, interruptAudioOnAnswer,
        sideHasExplicitTts, cardHasAudio, answerSideHasAudio, gate, sequencer,
    } = input;
    const sideKey = autoplaySideKey(cardId, answerSide);
    const orderKey = input.order.join(',');
    // The latest callbacks. Their identity changes with every rebuild of the card, so they are kept
    // out of the effects below, which would otherwise start the side over.
    const actionsRef = useRef(input);
    actionsRef.current = input;
    /** The side whose autoplay has started; the effects below do not start it twice. */
    const startedRef = useRef<string | null>(null);

    // Switching whole-card reading on asks for the side to be read now, as it always has.
    const readingRef = useRef(wholeCardReading);
    useEffect(() => {
        if (wholeCardReading && !readingRef.current) startedRef.current = null;
        readingRef.current = wholeCardReading;
    }, [wholeCardReading]);

    // One automatic speech owner covers both whole-card reading and explicit Anki template tags.
    // The short delay lets React discard superseded side/card effects before native speech is
    // enqueued; the generation-safe queue then serializes stop -> speak across the native bridge.
    useEffect(() => {
        if (sideKey === null || !focused || !foregrounded) return;
        if (!wholeCardReading && !(autoPlayAudio && sideHasExplicitTts)) return;
        if (startedRef.current === sideKey) return;
        const order = orderKey.split(',');
        const speak = () => actionsRef.current.speak(answerSide);
        // "Interrupt current audio when answering" off lets speech run on into the next side.
        const cleanup = () => { if (interruptAudioOnAnswer) actionsRef.current.stopSpeech(); };
        if (autoPlayAudio && order[0] === 'sound' && order.includes('tts')) {
            // The side's sound files come first (and start the side); speech follows once they have played.
            const release = gate.whenClear(() => sequencer.after('sound', speak));
            return () => {
                release();
                sequencer.cancel();
                cleanup();
            };
        }
        let timer: ReturnType<typeof setTimeout> | undefined;
        // Speech follows a sound carried over from the side before, as Anki's audio queue does.
        const release = gate.whenClear(() => {
            timer = setTimeout(() => {
                startedRef.current = sideKey;
                speak();
            }, wholeCardReading ? 120 : 450);
        });
        return () => {
            release();
            clearTimeout(timer);
            cleanup();
        };
    }, [sideKey, answerSide, focused, foregrounded, autoPlayAudio, wholeCardReading, interruptAudioOnAnswer, sideHasExplicitTts, orderKey, gate, sequencer]);

    useEffect(() => {
        if (sideKey === null || !focused || !foregrounded || !autoPlayAudio || !cardHasAudio) return;
        // Anki: flipping to the answer auto-plays only the answer side's own sounds.
        if (answerSide && !answerSideHasAudio) return;
        if (startedRef.current === sideKey) return;
        const order = orderKey.split(',');
        const playSounds = () => actionsRef.current.playSounds(answerSide);
        if (order[0] === 'tts' && order.includes('sound')) {
            // Speech leads on this side (and starts it); the sound files wait until it has finished.
            const release = gate.whenClear(() => sequencer.after('tts', playSounds));
            return () => {
                release();
                sequencer.cancel();
            };
        }
        // Give the side's media a moment to resolve (web swaps blob URLs in asynchronously). A
        // sound carried over from the side before finishes first.
        let timer: ReturnType<typeof setTimeout> | undefined;
        const release = gate.whenClear(() => {
            timer = setTimeout(() => {
                startedRef.current = sideKey;
                playSounds();
            }, 450);
        });
        return () => {
            release();
            clearTimeout(timer);
        };
    }, [sideKey, answerSide, focused, foregrounded, autoPlayAudio, cardHasAudio, answerSideHasAudio, orderKey, gate, sequencer]);
}
