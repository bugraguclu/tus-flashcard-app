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
