import { describe, expect, it } from 'vitest';
import { exportFileStem } from './exportFileName';

describe('exportFileStem', () => {
    it('writes Turkish deck names in plain letters, the dotless ı included', () => {
        expect(exportFileStem('Çocuk Sağlığı')).toBe('Cocuk-Sagligi');
        expect(exportFileStem('TUS::Dolaşım Sistemi')).toBe('Dolasim-Sistemi');
        expect(exportFileStem('İç Hastalıkları')).toBe('Ic-Hastaliklari');
        expect(exportFileStem('IŞIK')).toBe('ISIK');
    });

    it('never yields an empty or path-like name', () => {
        expect(exportFileStem('a/b\\c: d')).toBe('a-b-c-d');
        expect(exportFileStem('???')).toBe('koleksiyon');
        expect(exportFileStem(undefined)).toBe('koleksiyon');
    });
});
