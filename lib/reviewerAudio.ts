import { extractAnkiTtsSegments } from './ankiTts';

/** Independently derived from Anki's documented automatic/replay audio rules. */
export type ReviewerPlaybackScope = 'question' | 'answer' | 'both';

export function reviewerPlaybackScope(answer: boolean, skipQuestion: boolean, automatic: boolean): ReviewerPlaybackScope {
    return !answer ? 'question' : automatic || skipQuestion ? 'answer' : 'both';
}

/** Input is already rendered/sanitized HTML. FrontSide is omitted from ownAnswerHtml. */
export function reviewerMediaHtml(questionHtml: string, ownAnswerHtml: string, scope: ReviewerPlaybackScope): string {
    const media = (html: string) => html.match(/<(audio|video)\b[^>]*>[\s\S]*?<\/\1\s*>/gi)?.join('') ?? '';
    return (scope !== 'answer' ? media(questionHtml) : '') + (scope !== 'question' ? media(ownAnswerHtml) : '');
}

/**
 * Whether Replay Audio has something to play: the card's sound files or `{{tts}}` regions, or the
 * side's own text while whole-card reading is on (replay reads it again). `sideHtml` is the side
 * as whole-card reading speaks it (the answer without FrontSide).
 */
export function canReplayCardAudio(input: { cardHasAudio: boolean; wholeCardReading: boolean; sideHtml: string }): boolean {
    return input.cardHasAudio || (input.wholeCardReading && extractAnkiTtsSegments(input.sideHtml).length > 0);
}
