import { describe, it, expect } from 'vitest';
import { mediaFilenameForPickedAsset, sanitizeMediaFilename } from './mediaFilename';

describe('sanitizeMediaFilename', () => {
    it('keeps a normal filename', () => {
        expect(sanitizeMediaFilename('heart.jpg')).toBe('heart.jpg');
    });

    it('drops directory components (both slash styles)', () => {
        expect(sanitizeMediaFilename('sub/dir/img.png')).toBe('img.png');
        expect(sanitizeMediaFilename('a\\b\\c.png')).toBe('c.png');
    });

    it('blocks path traversal', () => {
        expect(sanitizeMediaFilename('../../etc/passwd')).toBe('passwd');
        expect(sanitizeMediaFilename('..')).toBe('media');
    });

    it('removes control characters', () => {
        const withControls = `evil${String.fromCharCode(0)}${String.fromCharCode(31)}.png`;
        expect(sanitizeMediaFilename(withControls)).toBe('evil.png');
    });

    it('falls back for empty or dot-only names', () => {
        expect(sanitizeMediaFilename('')).toBe('media');
        expect(sanitizeMediaFilename('...')).toBe('media');
    });
});

describe('mediaFilenameForPickedAsset', () => {
    it('names an iOS photo after the file that is actually copied, not the library entry', () => {
        // expo-image-picker hands over a transcoded JPEG while still reporting the HEIC original.
        expect(mediaFilenameForPickedAsset({
            uri: 'file:///var/mobile/Containers/Data/Application/AB/tmp/12-34.jpg',
            name: 'IMG_0042.HEIC',
            fallbackExtension: 'jpg',
        })).toBe('IMG_0042.jpg');
    });

    it('keeps a picked name that already agrees with its file', () => {
        expect(mediaFilenameForPickedAsset({
            uri: 'file:///tmp/anatomi.png',
            name: 'anatomi.png',
            fallbackExtension: 'jpg',
        })).toBe('anatomi.png');
    });

    it('normalises a shouted extension so the media entry is matched case-insensitively', () => {
        expect(mediaFilenameForPickedAsset({
            uri: 'file:///tmp/clip.MP4',
            name: 'Ders Kaydı.MOV',
            fallbackExtension: 'mp4',
        })).toBe('Ders Kaydı.mp4');
    });

    it('reads through the query string a content URI can carry', () => {
        expect(mediaFilenameForPickedAsset({
            uri: 'file:///tmp/asset.m4a?width=0&height=0#top',
            name: 'ses',
            fallbackExtension: 'mp3',
        })).toBe('ses.m4a');
    });

    it('falls back to the picker name, then to the caller default', () => {
        expect(mediaFilenameForPickedAsset({
            uri: 'content://media/external/audio/9182',
            name: 'kayit.wav',
            fallbackExtension: 'm4a',
        })).toBe('kayit.wav');
        expect(mediaFilenameForPickedAsset({
            uri: 'content://media/external/images/1',
            name: '',
            fallbackExtension: 'jpg',
        })).toBe('1.jpg');
    });

    it('leaves an unknown file kind without an invented extension', () => {
        expect(mediaFilenameForPickedAsset({
            uri: 'content://com.example/doc/7',
            name: 'notlar',
        })).toBe('notlar');
    });

    it('never lets a picked name reach outside the media folder', () => {
        const name = mediaFilenameForPickedAsset({
            uri: 'file:///tmp/x.png',
            name: '../../etc/passwd',
        });
        expect(name).toBe('passwd.png');
        expect(sanitizeMediaFilename(name)).toBe(name);
    });
});
