import { beforeEach, describe, expect, it, vi } from 'vitest';

const settings = new Map<string, string>();

vi.mock('./storage', () => ({
    getDbSetting: (key: string) => settings.get(key) ?? null,
    setDbSetting: (key: string, value: string) => {
        settings.set(key, value);
    },
}));

import {
    loadNoteTypeStickyFields,
    loadStickyEditorFields,
    saveNoteTypeStickyFields,
    saveStickyEditorFields,
    stripMediaFromStickyText,
    type StickyEditorFields,
} from './editorStickyFields';

describe('editorStickyFields', () => {
    beforeEach(() => {
        settings.clear();
    });

    it('strips sound markers from sticky text', () => {
        const withSound = 'Kardiyoloji Notu [sound:1788193581_audio.m4a]';
        expect(stripMediaFromStickyText(withSound)).toBe('Kardiyoloji Notu');
    });

    it('strips img and video tags from sticky text', () => {
        const withImg = 'Anatomi Başlığı <img src="123_schema.png">';
        expect(stripMediaFromStickyText(withImg)).toBe('Anatomi Başlığı');

        const withVideo = 'Farmakoloji <video src="123_clip.mp4"></video>';
        expect(stripMediaFromStickyText(withVideo)).toBe('Farmakoloji');
    });

    it('preserves clean text and formatting', () => {
        const cleanText = '<b>Patoloji</b> - Bölüm 1';
        expect(stripMediaFromStickyText(cleanText)).toBe(cleanText);
    });

    it('persists and loads sticky fields without saving media attachments', () => {
        const fields: StickyEditorFields = {
            question: { pinned: true, value: 'Dahiliye [sound:voice.m4a]' },
            answer: { pinned: false, value: 'Cevap' },
        };

        saveStickyEditorFields(fields);
        const loaded = loadStickyEditorFields();

        expect(loaded.question?.pinned).toBe(true);
        expect(loaded.question?.value).toBe('Dahiliye');
        expect(loaded.question?.value).not.toContain('sound:');
        expect(loaded.answer).toBeUndefined();
    });

    it('cleans up legacy sticky data containing media on load', () => {
        const legacyData = JSON.stringify({
            question: { pinned: true, value: 'Ön Metin <img src="foto.jpg">' },
        });
        settings.set('tus_editor_sticky_fields_v1', legacyData);

        const loaded = loadStickyEditorFields();
        expect(loaded.question?.value).toBe('Ön Metin');
        expect(loaded.question?.value).not.toContain('<img');
    });

    it('persists and loads note-type sticky fields verbatim, media and links included (EDT-5)', () => {
        const kept = '<img src="diagram.png"> Kalp <a href="https://example.test">link</a>';
        saveNoteTypeStickyFields(100, {
            0: { pinned: true, value: kept },
            1: { pinned: false, value: 'Anlam' },
            2: { pinned: true, value: 'Örnek Cümle [sound:ex.mp3]' },
        });

        const loaded = loadNoteTypeStickyFields(100);
        expect(loaded[0]).toEqual({ pinned: true, value: kept });
        expect(loaded[1]).toBeUndefined();
        expect(loaded[2]).toEqual({ pinned: true, value: 'Örnek Cümle [sound:ex.mp3]' });
    });

    it("pins the fields the note type marks sticky, as Anki's Add screen does", () => {
        const type = { id: 101, fields: [{ name: 'A', ord: 0, sticky: true, rtl: false }, { name: 'B', ord: 1, sticky: false, rtl: false }] } as any;
        expect(loadNoteTypeStickyFields(101, type)).toEqual({ 0: { pinned: true, value: '' } });
    });
});
