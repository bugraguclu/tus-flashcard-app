import { describe, expect, it } from 'vitest';
import { hiddenAudioChromeCss } from './cardAudioChrome';

describe('hiddenAudioChromeCss', () => {
    it('adds nothing while play buttons are shown', () => {
        expect(hiddenAudioChromeCss(true)).toBe('');
    });

    it('hides the speed chip together with the player when play buttons are off', () => {
        const css = hiddenAudioChromeCss(false);
        // The chip lives in the wrapper next to the <audio>; hiding the wrapper hides both.
        expect(css).toContain('.card .tus-audio-wrap');
        // Audio a template placed outside the wrapper (before the frame script ran) stays hidden too.
        expect(css).toContain('.card audio');
        expect(css).toMatch(/\{display:none!important;\}$/);
    });
});
