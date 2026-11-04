/**
 * Anki's "Interrupt current audio when answering", switched off.
 *
 * Anki's audio player clears its queue when the answer is shown or the next card appears, and
 * stops the file that is playing only while that preference is on. Off, the file plays to its
 * end and the new side's sounds and speech follow it.
 * https://github.com/ankitects/anki/blob/main/qt/aqt/sound.py (`clear_queue_and_maybe_interrupt`)
 *
 * Here a card's sound files play inside the card's web view, which is rewritten for every side.
 * So the reviewer keeps the old view mounted, out of sight, until its sound has ended; this gate
 * holds back the new side's audio meanwhile.
 */

/** Whether the sound playing on the side being left goes on into the next side or card. */
export function shouldCarrySound(interruptAudioOnAnswer: boolean, soundPlaying: boolean): boolean {
    return !interruptAudioOnAnswer && soundPlaying;
}

/** Whether any of a document's audio/video elements is playing (or waiting to, after play()). */
export function anyMediaPlaying(media: ArrayLike<{ paused: boolean; ended: boolean }>): boolean {
    for (let index = 0; index < media.length; index += 1) {
        if (!media[index].paused && !media[index].ended) return true;
    }
    return false;
}

const MEDIA_EVENTS = ['play', 'playing', 'pause', 'ended', 'error', 'emptied'];

/**
 * Reports whether any audio/video element of `doc` is playing, from the media events themselves,
 * so a sound the learner started from the player counts as well as autoplay. Called with each
 * change only. Media events do not bubble; they are caught on the way down.
 */
export function reportMediaPlayback(doc: Pick<Document, 'addEventListener' | 'querySelectorAll'>, report: (playing: boolean) => void): void {
    let last: boolean | null = null;
    const check = () => {
        const playing = anyMediaPlaying(doc.querySelectorAll<HTMLMediaElement>('audio, video'));
        if (playing === last) return;
        last = playing;
        report(playing);
    };
    for (const type of MEDIA_EVENTS) doc.addEventListener(type, check, true);
}

/** `reportMediaPlayback` for the native card view, posting `MEDIA:1` / `MEDIA:0`. */
export const MEDIA_PLAYBACK_REPORTER = `(function(){
    var last = null;
    function check(){
        var media = document.querySelectorAll('audio,video');
        var playing = false;
        for (var i = 0; i < media.length; i++) { if (!media[i].paused && !media[i].ended) { playing = true; break; } }
        if (playing === last) return;
        last = playing;
        if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage('MEDIA:' + (playing ? 1 : 0));
    }
    ${JSON.stringify(MEDIA_EVENTS)}.forEach(function(type){ document.addEventListener(type, check, true); });
})();`;

/**
 * The props of the view that carries the sound. Its document must stay byte for byte as it was,
 * so every callback that shapes the markup or the injected script stays present, but none of
 * them reaches the reviewer any more: the view is hidden and belongs to a side already left.
 */
export function silencedCallbacks<T extends object>(props: T): T {
    const silenced = { ...props } as Record<string, unknown>;
    for (const [name, value] of Object.entries(silenced)) {
        if (typeof value === 'function' && /^on[A-Z]/.test(name)) silenced[name] = noop;
    }
    return silenced as T;
}

function noop(): void {}

/**
 * Holds the new side's audio while a carried sound plays. `finish` (the sound reached its end)
 * releases what was held; `stop` (replay, leaving the reviewer, interrupt switched back on)
 * drops it, because the learner asked for something else.
 */
export class CarriedSoundGate {
    private carrying = false;
    private readonly waiting = new Set<() => void>();
    private readonly listeners = new Set<(carrying: boolean) => void>();

    get active(): boolean {
        return this.carrying;
    }

    begin(): void {
        if (this.carrying) return;
        this.carrying = true;
        this.emit();
    }

    finish(): void {
        if (!this.carrying) return;
        this.carrying = false;
        const held = [...this.waiting];
        this.waiting.clear();
        this.emit();
        for (const run of held) run();
    }

    stop(): void {
        this.waiting.clear();
        if (!this.carrying) return;
        this.carrying = false;
        this.emit();
    }

    /** Runs `run` now, or once the carried sound has ended. Returns a cancel for a held run. */
    whenClear(run: () => void): () => void {
        if (!this.carrying) {
            run();
            return noop;
        }
        this.waiting.add(run);
        return () => { this.waiting.delete(run); };
    }

    subscribe(listener: (carrying: boolean) => void): () => void {
        this.listeners.add(listener);
        return () => { this.listeners.delete(listener); };
    }

    private emit(): void {
        for (const listener of [...this.listeners]) listener(this.carrying);
    }
}
