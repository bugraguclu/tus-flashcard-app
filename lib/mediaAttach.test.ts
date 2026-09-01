import { describe, expect, it } from 'vitest';
import { FIELD_MEDIA_RE } from './mediaAttachment';

describe('FIELD_MEDIA_RE', () => {
    it('detects image tags', () => {
        expect(FIELD_MEDIA_RE.test('<img src="photo.jpg">')).toBe(true);
        expect(FIELD_MEDIA_RE.test('Text before <img class="card-img" src="photo.jpg" /> text after')).toBe(true);
    });

    it('detects sound markers', () => {
        expect(FIELD_MEDIA_RE.test('[sound:recording.m4a]')).toBe(true);
        expect(FIELD_MEDIA_RE.test('Voice note [sound:1234_audio.mp3] in body')).toBe(true);
    });

    it('detects video tags', () => {
        expect(FIELD_MEDIA_RE.test('<video controls src="video.mp4"></video>')).toBe(true);
    });

    it('detects audio tags', () => {
        expect(FIELD_MEDIA_RE.test('<audio controls src="audio.mp3"></audio>')).toBe(true);
    });

    it('detects file attachment links', () => {
        expect(FIELD_MEDIA_RE.test('<a href="doc.pdf">Document</a>')).toBe(true);
    });

    it('returns false for plain text or formatting without media', () => {
        expect(FIELD_MEDIA_RE.test('')).toBe(false);
        expect(FIELD_MEDIA_RE.test('Hello world')).toBe(false);
        expect(FIELD_MEDIA_RE.test('<b>Bold</b> <i>Italic</i> <u>Underline</u>')).toBe(false);
        expect(FIELD_MEDIA_RE.test('<p>A standard paragraph without attachments</p>')).toBe(false);
    });
});
