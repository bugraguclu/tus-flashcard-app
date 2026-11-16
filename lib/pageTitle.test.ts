import { describe, expect, it } from 'vitest';
import { SETTINGS_SECTION_IDS } from '../components/settings/settingsCategories';
import { pageTitle } from './pageTitle';

describe('pageTitle', () => {
    it('names a screen before the app', () => {
        expect(pageTitle('/stats', 'tr')).toBe('İstatistikler · TusAnkiM');
        expect(pageTitle('/stats', 'en')).toBe('Statistics · TusAnkiM');
        expect(pageTitle('/decks/', 'tr')).toBe('Desteler · TusAnkiM');
    });

    it('keeps the bare app name on the front page and on an unknown address', () => {
        expect(pageTitle('/', 'tr')).toBe('TusAnkiM');
        expect(pageTitle('/olmayan-sayfa', 'tr')).toBe('TusAnkiM');
    });

    it('names every Settings category by its own title', () => {
        const titles = SETTINGS_SECTION_IDS.map((id) => pageTitle(`/settings/${id}`, 'tr'));
        expect(new Set(titles).size).toBe(SETTINGS_SECTION_IDS.length);
        expect(titles).not.toContain('Ayarlar · TusAnkiM');
        expect(pageTitle('/settings/data', 'en')).toBe('Data Management · TusAnkiM');
    });

    it('names a page inside a stack after the stack', () => {
        expect(pageTitle('/study-plan-wizard/courses', 'tr')).toBe('Detaylı Plan · TusAnkiM');
        expect(pageTitle('/settings/olmayan', 'tr')).toBe('Ayarlar · TusAnkiM');
    });
});
