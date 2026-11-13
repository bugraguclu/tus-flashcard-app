import { describe, expect, it } from 'vitest';
import { TUS_STUDY_SUBJECTS } from './stopwatch';
import { subjectArtName } from './subjectArt';

describe('subjectArtName', () => {
    it('gives every built-in TUS subject a picture of its own', () => {
        const names = TUS_STUDY_SUBJECTS.map(subjectArtName);
        expect(names).not.toContain(null);
        expect(new Set(names).size).toBe(TUS_STUDY_SUBJECTS.length);
    });

    it('matches a course however it is written', () => {
        expect(subjectArtName('KARIŞIK')).toBe('mixed');
        expect(subjectArtName('  fizyoloji ')).toBe('physiology');
        expect(subjectArtName('Kadın Doğum')).toBe('obstetrics');
        expect(subjectArtName('Kadın Hastalıkları ve Doğum')).toBe('obstetrics');
        expect(subjectArtName('İç Hastalıkları')).toBe('internal');
    });

    it('finds the course in a deck name', () => {
        expect(subjectArtName('BKA Mikrobiyoloji')).toBe('microbiology');
        expect(subjectArtName('TUS Patoloji Notları')).toBe('pathology');
    });

    it('tells microbiology from medical biology', () => {
        expect(subjectArtName('Mikrobiyoloji')).toBe('microbiology');
        expect(subjectArtName('Tıbbi Biyoloji ve Genetik')).toBe('genetics');
        expect(subjectArtName('Histoloji ve Embriyoloji')).toBe('histology');
    });

    it('has no picture for a subject of the learner\'s own', () => {
        expect(subjectArtName('Radyoloji Tekrarı')).toBeNull();
        expect(subjectArtName('')).toBeNull();
    });
});
