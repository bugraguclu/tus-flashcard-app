// Behavior reference: https://docs.ankiweb.net/deck-options.html#audio
import { describe, expect, it } from 'vitest';
import { canReplayCardAudio, reviewerPlaybackScope, reviewerMediaHtml } from './reviewerAudio';
import { renderCardHtml } from './templates';
import { BUILTIN_NOTE_TYPES, type Note } from './models';
const type = { ...BUILTIN_NOTE_TYPES[0], templates: [{ name: 'Card 1', ord: 0, qfmt: '{{Front}}', afmt: '{{FrontSide}}<hr id=answer>{{Back}}' }] };
const note: Note = { id: 1, guid: 'audio', noteTypeId: type.id, mod: 0, usn: -1, tags: [], fields: ['[sound:q.mp3]', '[sound:a.mp3]'], sfld: '', csum: 0, flags: 0 };
const question = renderCardHtml(type, note, 0, 'question');
const ownAnswer = renderCardHtml(type, note, 0, 'answer', { omitFrontSide: true });
describe('reviewer audio playlists', () => {
    it('manual replay on the answer plays question then own answer', () => {
        const html = reviewerMediaHtml(question, ownAnswer, reviewerPlaybackScope(true, false, false));
        expect([...html.matchAll(/src="([^"]+)"/g)].map((match) => match[1])).toEqual(['q.mp3', 'a.mp3']);
    });
    it('skip-question and automatic answer both play only the answer sound', () => {
        for (const [skip, auto] of [[true, false], [false, true]]) {
            const html = reviewerMediaHtml(question, ownAnswer, reviewerPlaybackScope(true, skip, auto));
            expect(html).toContain('a.mp3');
            expect(html).not.toContain('q.mp3');
        }
    });
    it('question side plays only question audio', () => {
        expect(reviewerMediaHtml(question, ownAnswer, reviewerPlaybackScope(false, false, false))).not.toContain('a.mp3');
    });
    it('manual answer replay still plays the question when answer has no sound', () => {
        expect(reviewerMediaHtml(question, '', reviewerPlaybackScope(true, false, false))).toContain('q.mp3');
    });
});

// Anki's Replay Audio replays the side's audio tags; whole-card reading replays the side's text.
describe('Replay audio availability', () => {
    const textOnly = { ...note, guid: 'text', fields: ['Kalbin kaç odacığı vardır?', 'Dört'] };
    const pictureOnly = { ...note, guid: 'picture', fields: ['<img src="kalp.png">', ''] };
    const textQuestion = renderCardHtml(type, textOnly, 0, 'question');
    const pictureQuestion = renderCardHtml(type, pictureOnly, 0, 'question');

    it('offers replay while whole-card reading would read the side', () => {
        expect(canReplayCardAudio({ cardHasAudio: false, wholeCardReading: true, sideHtml: textQuestion })).toBe(true);
    });
    it('stays off when there is nothing to play or read', () => {
        expect(canReplayCardAudio({ cardHasAudio: false, wholeCardReading: false, sideHtml: textQuestion })).toBe(false);
        expect(canReplayCardAudio({ cardHasAudio: false, wholeCardReading: true, sideHtml: pictureQuestion })).toBe(false);
    });
    it('offers replay for a card with sound files or tts regions', () => {
        expect(canReplayCardAudio({ cardHasAudio: true, wholeCardReading: false, sideHtml: question })).toBe(true);
    });
});
