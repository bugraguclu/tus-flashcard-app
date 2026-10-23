/**
 * One playback order for a side's sound files and its text-to-speech.
 *
 * Anki plays a side's audio tags — `[sound:]` files and `{{tts}}` regions alike — one after the
 * other in the order they appear. Here the files play inside the card's web view and speech runs
 * natively, so the two used to start together and talk over each other (CAL-8). The reviewer now
 * starts whichever kind comes first on the side and holds the other until it has finished. The
 * two kinds are ordered as groups (all files, then all speech, or the reverse); interleaving
 * single tags of both kinds is not attempted.
 */

export type AvKind = 'sound' | 'tts';

const SOUND_TAG = /<(audio|video)\b/i;
const TTS_TAG = /<tts\b[^>]*\bservice\s*=\s*["']?(anki|android)\b/i;

/**
 * The kinds a rendered side plays, in the order its first tag of each kind appears. Whole-card
 * reading (no explicit TTS on the side) follows the side's sound files.
 */
export function avPlaybackOrder(html: string, wholeCardReading: boolean): AvKind[] {
    const sound = html.search(SOUND_TAG);
    const tts = html.search(TTS_TAG);
    if (sound < 0) return tts >= 0 || wholeCardReading ? ['tts'] : [];
    if (tts < 0) return wholeCardReading ? ['sound', 'tts'] : ['sound'];
    return sound < tts ? ['sound', 'tts'] : ['tts', 'sound'];
}

export interface AvTimers {
    set: (run: () => void, ms: number) => unknown;
    clear: (handle: unknown) => void;
}

const defaultTimers: AvTimers = {
    set: (run, ms) => setTimeout(run, ms),
    clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/**
 * Holds the second kind until the first has played. If the first never reports that it started
 * (a missing file, a voice that cannot load), the second runs after `startTimeoutMs` instead of
 * staying silent.
 */
export class AvSequencer {
    private waitingFor: AvKind | null = null;
    private next: (() => void) | null = null;
    private started = false;
    private fallback: unknown = null;

    constructor(private readonly timers: AvTimers = defaultTimers, private readonly startTimeoutMs = 4000) {}

    after(first: AvKind, next: () => void): void {
        this.cancel();
        this.waitingFor = first;
        this.next = next;
        this.fallback = this.timers.set(() => {
            this.fallback = null;
            if (!this.started) this.flush();
        }, this.startTimeoutMs);
    }

    /** Playback of `kind` started (true) or fell silent (false). */
    report(kind: AvKind, active: boolean): void {
        if (kind !== this.waitingFor) return;
        if (active) {
            this.started = true;
            return;
        }
        if (this.started) this.flush();
    }

    cancel(): void {
        if (this.fallback !== null) this.timers.clear(this.fallback);
        this.fallback = null;
        this.waitingFor = null;
        this.next = null;
        this.started = false;
    }

    private flush(): void {
        const run = this.next;
        this.cancel();
        run?.();
    }
}
