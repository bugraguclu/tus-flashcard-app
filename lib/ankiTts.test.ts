import { describe, expect, it } from 'vitest';
import { ankiTtsPlainText, extractAnkiTtsSegments } from './ankiTts';
import { renderTemplate } from './templates';

describe('Anki TTS text extraction', () => {
    it('never reads card CSS, scripts, or media metadata as learner text', () => {
        const html = `
            <style>.card { font-size: 18px; line-height: 1.6; color: #222; }</style>
            <script>say('garbage')</script>
            <div class="card">Mitokondri<br><b>enerji</b> üretir.</div>
            <audio src="voice.mp3"></audio>`;
        expect(ankiTtsPlainText(html)).toBe('Mitokondri\nenerji üretir.');
    });

    it('decodes entities and keeps useful block boundaries', () => {
        expect(ankiTtsPlainText('<p>A &amp; B</p><p>5 &lt; 8&nbsp;</p>'))
            .toBe('A & B\n5 < 8');
    });

    it('reads only explicit Anki TTS regions when a template provides them', () => {
        const html = `Ignored
            <tts service="anki" voice="en_US" data-speed="0.8" hidden>Hello <b>world</b></tts>
            <tts service="android" voice="tr_TR">Merhaba</tts>`;
        expect(extractAnkiTtsSegments(html)).toEqual([
            { text: 'Hello world', language: 'en_US', rate: 0.8 },
            { text: 'Merhaba', language: 'tr_TR', rate: 1 },
        ]);
    });

    it('falls back to the visible card when no explicit TTS region exists', () => {
        expect(extractAnkiTtsSegments('<style>.x{font-size:18px}</style><div>Soru</div>'))
            .toEqual([{ text: 'Soru', language: '', rate: 1 }]);
        expect(extractAnkiTtsSegments('<div>Soru</div>', false)).toEqual([]);
    });

    it('turns Anki field and block TTS syntax into hidden, playable queue items', () => {
        const field = renderTemplate('{{tts en_US speed=0.8:Front}}', {
            fields: { Front: '<b>Hello</b>' },
        });
        expect(field).toContain('hidden');
        expect(extractAnkiTtsSegments(field)).toEqual([
            { text: 'Hello', language: 'en_US', rate: 0.8 },
        ]);

        const block = renderTemplate('[anki:tts lang=tr_TR speed=1.2]Soru: {{Front}}[/anki:tts]', {
            fields: { Front: 'Kalp' },
        });
        expect(extractAnkiTtsSegments(block)).toEqual([
            { text: 'Soru: Kalp', language: 'tr_TR', rate: 1.2 },
        ]);
    });
});
