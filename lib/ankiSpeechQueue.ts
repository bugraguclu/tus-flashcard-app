import {
    selectAnkiTtsVoice,
    splitAnkiTtsText,
    type AnkiTtsPlatform,
    type AnkiTtsSegment,
    type AnkiTtsVoice,
} from './ankiTts';

export interface SpeechQueueOptions {
    language: string;
    rate: number;
    voice?: string;
    onDone: () => void;
    onStopped: () => void;
    onError: () => void;
}

export interface SpeechQueueEngine {
    stop: () => Promise<void>;
    speak: (text: string, options: SpeechQueueOptions) => void;
    getAvailableVoices: () => Promise<AnkiTtsVoice[]>;
    maximumInputLength: number;
}

type QueuedUtterance = {
    text: string;
    language: string;
    rate: number;
    voice?: string;
};

/**
 * Single-owner speech queue for the reviewer. Every new request invalidates the previous run and
 * waits for the native stop operation before enqueueing text, preventing React effect replays and
 * rapid card flips from leaving two AVSpeechSynthesizer utterances alive at once.
 */
export class AnkiSpeechQueue {
    private run = 0;
    private active = false;
    private voicesPromise: Promise<AnkiTtsVoice[]> | null = null;

    constructor(
        private readonly engine: SpeechQueueEngine,
        private readonly onActiveChange: (active: boolean) => void,
    ) {}

    async play(segments: AnkiTtsSegment[], defaultLanguage: string, platform: AnkiTtsPlatform): Promise<void> {
        const run = ++this.run;
        this.setActive(false);
        await this.stopEngine();
        if (run !== this.run) return;

        const voices = await this.availableVoices();
        if (run !== this.run) return;

        const maximumLength = this.engine.maximumInputLength;
        const utterances: QueuedUtterance[] = segments.flatMap((segment) => {
            const language = (segment.language || defaultLanguage).replace(/_/g, '-');
            const voice = selectAnkiTtsVoice(voices, language, segment.voices, platform);
            return splitAnkiTtsText(segment.text, maximumLength).map((text) => ({
                text,
                language,
                rate: Math.max(0.1, Math.min(2, segment.rate)),
                voice,
            }));
        });
        if (utterances.length === 0 || run !== this.run) return;

        this.setActive(true);
        this.speakAt(run, utterances, 0);
    }

    async stop(): Promise<void> {
        this.run += 1;
        this.setActive(false);
        await this.stopEngine();
    }

    private speakAt(run: number, utterances: QueuedUtterance[], index: number): void {
        if (run !== this.run) return;
        if (index >= utterances.length) {
            this.setActive(false);
            return;
        }

        const utterance = utterances[index];
        const advance = () => this.speakAt(run, utterances, index + 1);
        try {
            this.engine.speak(utterance.text, {
                language: utterance.language,
                rate: utterance.rate,
                voice: utterance.voice,
                onDone: advance,
                onStopped: () => {
                    if (run === this.run) this.setActive(false);
                },
                onError: advance,
            });
        } catch {
            advance();
        }
    }

    private async availableVoices(): Promise<AnkiTtsVoice[]> {
        if (!this.voicesPromise) {
            this.voicesPromise = this.engine.getAvailableVoices().catch(() => []);
        }
        return this.voicesPromise;
    }

    private async stopEngine(): Promise<void> {
        try {
            await this.engine.stop();
        } catch {
            // A failed native stop must not make local review unusable. The generation guard still
            // prevents stale callbacks from advancing a superseded queue.
        }
    }

    private setActive(active: boolean): void {
        if (this.active === active) return;
        this.active = active;
        this.onActiveChange(active);
    }
}
