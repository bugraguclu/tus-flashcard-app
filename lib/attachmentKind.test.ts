import { describe, expect, it } from 'vitest';
import { attachmentDisplayName, attachmentKindFor, canPreviewAttachment } from './attachmentKind';

describe('attachmentKindFor', () => {
    it('embeds a picture, a sound and a video picked as a plain file', () => {
        // "Dosya ekle" used to turn every pick into a link, so a PNG chosen from Files showed up
        // as the word "Sema.png" instead of the picture.
        expect(attachmentKindFor('Sema.png')).toBe('image');
        expect(attachmentKindFor('IMG_0042.HEIC')).toBe('image');
        expect(attachmentKindFor('Mitral telaffuz.m4a')).toBe('audio');
        expect(attachmentKindFor('ders.MP3')).toBe('audio');
        expect(attachmentKindFor('EKG cekimi.mp4')).toBe('video');
        expect(attachmentKindFor('ameliyat.MOV')).toBe('video');
    });

    it('keeps documents and unknown files as links', () => {
        expect(attachmentKindFor('Kardiyoloji notları.pdf')).toBe('file');
        expect(attachmentKindFor('tablo.xlsx')).toBe('file');
        expect(attachmentKindFor('arsiv.zip')).toBe('file');
        expect(attachmentKindFor('README')).toBe('file');
    });

    it('lets the picker type settle a container that holds either sound or picture', () => {
        expect(attachmentKindFor('kayit.webm', 'audio/webm')).toBe('audio');
        expect(attachmentKindFor('klip.webm', 'video/webm')).toBe('video');
        expect(attachmentKindFor('ses.mp4', 'audio/mp4')).toBe('audio');
        expect(attachmentKindFor('klip.webm')).toBe('video');
    });

    it('does not let a picker type override an extension it knows', () => {
        expect(attachmentKindFor('Sema.png', 'application/octet-stream')).toBe('image');
        expect(attachmentKindFor('ders.mp3', 'video/mp4')).toBe('audio');
    });

    it('takes the system type for an extension it does not list', () => {
        // iOS and browsers derive the type from the extension and know more formats than the
        // lists above: a RAW photo or a Windows audio file is still a picture or a sound.
        expect(attachmentKindFor('tarama.dng', 'image/x-adobe-dng')).toBe('image');
        expect(attachmentKindFor('ders.wma', 'audio/x-ms-wma')).toBe('audio');
        expect(attachmentKindFor('notlar.pdf', 'application/pdf')).toBe('file');
        expect(attachmentKindFor('fotograf', 'image/jpeg')).toBe('image');
        expect(attachmentKindFor('dosya', null)).toBe('file');
    });
});

describe('attachmentDisplayName', () => {
    it('drops the timestamp an attachment is stored under', () => {
        expect(attachmentDisplayName('1793193341059_Kardiyoloji notları.pdf')).toBe('Kardiyoloji notları.pdf');
    });

    it('leaves a name that was not stored that way alone', () => {
        expect(attachmentDisplayName('notlar.pdf')).toBe('notlar.pdf');
        expect(attachmentDisplayName('2024_rapor.pdf')).toBe('2024_rapor.pdf');
        expect(attachmentDisplayName('1793193341059_')).toBe('1793193341059_');
    });
});

describe('canPreviewAttachment', () => {
    it('previews documents and pictures iOS can draw', () => {
        ['a.pdf', 'a.PDF', 'a.docx', 'a.xlsx', 'a.pptx', 'a.pages', 'a.txt', 'a.jpg', 'a.heic', 'a.mp4'].forEach((name) => {
            expect(canPreviewAttachment(name)).toBe(true);
        });
    });

    it('only offers to share markup and files it cannot draw', () => {
        ['a.html', 'a.htm', 'a.svg', 'a.xml', 'a.zip', 'a.apkg', 'a', 'a.exe'].forEach((name) => {
            expect(canPreviewAttachment(name)).toBe(false);
        });
    });
});
