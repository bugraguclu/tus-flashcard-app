/**
 * The card frame wraps every `<audio>` in `.tus-audio-wrap` together with its playback-speed chip.
 * With Settings › New study screen › "Show play buttons on cards with audio" off, the whole wrapper
 * is hidden: hiding only the `<audio>` element left the speed chip standing alone in the card text.
 * Hidden media elements still play, so autoplay and replay are unaffected.
 */
export function hiddenAudioChromeCss(showAudioPlayButtons: boolean): string {
    return showAudioPlayButtons ? '' : '.card audio,.card .tus-audio-wrap{display:none!important;}';
}
