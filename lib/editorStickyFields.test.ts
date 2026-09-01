import { beforeEach, describe, expect, it, vi } from 'vitest';

const settings = new Map<string, string>();

vi.mock('./storage', () => ({
    getDbSetting: (key: string) => settings.get(key) ?? null,
    setDbSetting: (key: string, value: string) => {
        settings.set(key, value);
    },
}));

import {
    loadStickyEditorFields,
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
});
