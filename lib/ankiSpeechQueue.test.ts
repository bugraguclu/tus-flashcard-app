import { describe, expect, it, vi } from 'vitest';
import { AnkiSpeechQueue, type SpeechQueueEngine, type SpeechQueueOptions } from './ankiSpeechQueue';

function segment(text: string) {
    return { text, language: 'tr_TR', rate: 1, voices: [] };
}

describe('Anki reviewer speech queue', () => {
    it('allows only the newest request to speak when effect runs overlap', async () => {
        const stopResolvers: Array<() => void> = [];
        const speak = vi.fn();
        const engine: SpeechQueueEngine = {
            stop: () => new Promise<void>((resolve) => stopResolvers.push(resolve)),
            speak,
            getAvailableVoices: async () => [],
            maximumInputLength: Number.MAX_VALUE,
        };
        const queue = new AnkiSpeechQueue(engine, vi.fn());

        const first = queue.play([segment('İlk çağrı')], 'tr-TR', 'ios');
        const second = queue.play([segment('Güncel çağrı')], 'tr-TR', 'ios');
        stopResolvers.splice(0).forEach((resolve) => resolve());
        await Promise.all([first, second]);

        expect(speak).toHaveBeenCalledTimes(1);
        expect(speak).toHaveBeenCalledWith('Güncel çağrı', expect.any(Object));
    });

    it('stops a pending request before native speech can begin', async () => {
        let resolveInitialStop = () => {};
        let stopCount = 0;
        const speak = vi.fn();
        const engine: SpeechQueueEngine = {
            stop: () => {
                stopCount += 1;
                if (stopCount > 1) return Promise.resolve();
                return new Promise<void>((resolve) => { resolveInitialStop = resolve; });
            },
            speak,
            getAvailableVoices: async () => [],
            maximumInputLength: Number.MAX_VALUE,
        };
        const queue = new AnkiSpeechQueue(engine, vi.fn());

        const pending = queue.play([segment('Artık okunmamalı')], 'tr-TR', 'ios');
        const stopped = queue.stop();
        resolveInitialStop();
        await Promise.all([pending, stopped]);

        expect(speak).not.toHaveBeenCalled();
    });

    it('reads every segment and oversized chunk exactly once in order', async () => {
        const spoken: string[] = [];
        const callbacks: SpeechQueueOptions[] = [];
        const engine: SpeechQueueEngine = {
            stop: async () => {},
            speak: (text, options) => {
                spoken.push(text);
                callbacks.push(options);
            },
            getAvailableVoices: async () => [],
            maximumInputLength: 12,
        };
        const active: boolean[] = [];
        const queue = new AnkiSpeechQueue(engine, (value) => active.push(value));

        await queue.play([segment('Birinci cümle. İkinci.'), segment('Son')], 'tr-TR', 'ios');
        while (callbacks.length > 0) callbacks.shift()?.onDone();

        expect(spoken.join(' ').replace(/\s+/g, ' ')).toBe('Birinci cümle. İkinci. Son');
        expect(active).toEqual([true, false]);
    });

    it('passes the first available Anki voice and its requested speed to the engine', async () => {
        const speak = vi.fn();
        const engine: SpeechQueueEngine = {
            stop: async () => {},
            speak,
            getAvailableVoices: async () => [
                { identifier: 'yelda-id', name: 'Yelda', language: 'tr-TR', quality: 'Enhanced' },
            ],
            maximumInputLength: Number.MAX_VALUE,
        };
        const queue = new AnkiSpeechQueue(engine, vi.fn());

        await queue.play([{ text: 'Merhaba', language: 'tr_TR', rate: 0.8, voices: ['Apple_Yelda'] }], 'en-US', 'ios');

        expect(speak).toHaveBeenCalledWith('Merhaba', expect.objectContaining({
            language: 'tr-TR',
            rate: 0.8,
            voice: 'yelda-id',
        }));
    });
});
