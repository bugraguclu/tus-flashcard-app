import { settingsCategories } from '../components/settings/settingsCategories';

export const APP_TITLE = 'TusAnkiM';

type Locale = 'tr' | 'en';

/** The name of the screen at each web address, as its header shows it: [Türkçe, English]. */
const SCREEN_TITLES: Record<string, readonly [string, string]> = {
    '/decks': ['Desteler', 'Decks'],
    '/editor': ['Not ekle', 'Add note'],
    '/browser': ['Kartlarım', 'Card Browser'],
    '/card-info': ['Kart bilgisi', 'Card Info'],
    '/catalog': ['TUS Kartları', 'TUS Cards'],
    '/deck-options': ['Deste seçenekleri', 'Deck Options'],
    '/deck-overview': ['Deste', 'Deck'],
    '/empty-cards': ['Boş kartlar', 'Empty Cards'],
    '/export': ['Dışa aktar', 'Export'],
    '/import': ['İçe aktar', 'Import'],
    '/note-type': ['Not türünü düzenle', 'Edit Note Type'],
    '/note-types': ['Not türleri', 'Note Types'],
    '/stats': ['İstatistikler', 'Statistics'],
    '/stopwatch': ['Kronometre', 'Stopwatch'],
    '/study-analysis': ['Çalışma Analiziniz', 'Your Study Analysis'],
    '/study-calendar': ['Çalışma Takvimi', 'Study Calendar'],
    '/study-clear': ['Çalışmaları Temizle', 'Clear Sessions'],
    '/study-plans': ['Çalışma Planlama', 'Study Planning'],
    '/study-plan-wizard': ['Detaylı Plan', 'Detailed Plan'],
    '/backups': ['Yedekler', 'Backups'],
    '/settings': ['Ayarlar', 'Settings'],
};

function screenTitle(pathname: string, locale: Locale): string | null {
    const path = pathname.replace(/\/+$/, '') || '/';
    const settingsSection = /^\/settings\/([^/]+)$/.exec(path)?.[1];
    if (settingsSection) {
        const l = (turkish: string, english: string) => (locale === 'tr' ? turkish : english);
        const category = settingsCategories(l).find((item) => item.id === settingsSection);
        if (category) return category.title;
    }
    // A page inside a stack (a wizard step, an unknown Settings address) is named after the stack.
    const names = SCREEN_TITLES[path] ?? SCREEN_TITLES[`/${path.split('/')[1]}`];
    return names ? names[locale === 'tr' ? 0 : 1] : null;
}

/**
 * The browser tab title of the page at `pathname`: "İstatistikler · TusAnkiM". Every page used to
 * be titled "TusAnkiM", so tabs, history entries and shared links could not be told apart. The
 * study screen at `/` is the app's front page and keeps the bare name, as does an address no
 * screen answers.
 */
export function pageTitle(pathname: string, locale: Locale): string {
    const screen = screenTitle(pathname, locale);
    return screen ? `${screen} · ${APP_TITLE}` : APP_TITLE;
}
