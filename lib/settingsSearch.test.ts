import { describe, expect, it } from 'vitest';
import { searchSettingsCategories, type SettingsSearchCategory } from './settingsSearch';

const categories: SettingsSearchCategory<string>[] = [
    { id: 'general', title: 'Genel', summary: 'Dil • Tema • Düzenleme', settings: ['Yeni kartların destesi', 'Dosya adlarını göster'] },
    { id: 'reviewing', title: 'İnceleme', summary: 'Zamanlama • Gelişmiş', settings: ['Zaman kutusu sınırı', 'Ses oynatma hızı', 'Sesi otomatik oynat'] },
    { id: 'newStudy', title: 'Yeni çalışma ekranı', summary: 'Ekran • Araç çubuğu', settings: ['Sesli kartlarda oynatma düğmelerini göster'] },
    { id: 'data', title: 'Veri yönetimi', summary: 'Yedekleme • İçe ve dışa aktar • Bakım', settings: ['Otomatik yedekleme'] },
];

const ids = (query: string) => searchSettingsCategories(categories, query).map((result) => result.category.id);

describe('searching Settings', () => {
    it('lists every category, with no setting singled out, while the box is empty', () => {
        expect(searchSettingsCategories(categories, '  ')).toEqual(
            categories.map((category) => ({ category, matchedSettings: [] })),
        );
    });

    it('finds a single setting by its name and says which one matched', () => {
        expect(searchSettingsCategories(categories, 'zaman kutusu')).toEqual([
            { category: categories[1], matchedSettings: ['Zaman kutusu sınırı'] },
        ]);
    });

    it('folds Turkish capitals and letters the way the other searches do', () => {
        expect(ids('inceleme')).toEqual(['reviewing']);
        expect(ids('İNCELEME')).toEqual(['reviewing']);
        expect(ids('ice aktar')).toEqual(['data']);
        expect(ids('hizi')).toEqual(['reviewing']);
    });

    it('matches the start of a word, so a fragment inside another word finds nothing', () => {
        expect(ids('art')).toEqual([]);
        expect(ids('ses')).toEqual(['reviewing', 'newStudy']);
    });

    it('lists no settings when the category’s own title or headings match', () => {
        expect(searchSettingsCategories(categories, 'tema')).toEqual([
            { category: categories[0], matchedSettings: [] },
        ]);
    });
});
