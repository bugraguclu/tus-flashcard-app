import { FILTERED_SEARCH_ORDER } from './filteredDeckOptions';
import type { ReviewerOpName } from './reviewerUndo';
import type { AppLanguage } from './types';

export type SupportedLocale = 'tr' | 'en';
export type TranslationParams = Record<string, string | number>;

const tr = {
    'common.ok': 'Tamam',
    'common.cancel': 'İptal',
    'common.close': 'Kapat',
    'common.save': 'Kaydet',
    'common.saved': 'Kaydedildi',
    'common.delete': 'Sil',
    'common.add': 'Ekle',
    'common.create': 'Oluştur',
    'common.retry': 'Tekrar dene',
    'common.error': 'Hata',
    'common.genericError': 'İşlem tamamlanamadı. Lütfen tekrar deneyin.',
    'common.completed': 'Tamamlandı',
    'common.loading': 'Yükleniyor…',
    'common.search': 'Ara',
    'common.all': 'Tümü',
    'common.decks': 'Desteler',
    'common.deck': 'Deste',
    'common.settings': 'Ayarlar',
    'common.statistics': 'İstatistikler',
    'common.study': 'Çalış',

    'permissions.title': 'İzin Gerekli',
    'permissions.openSettings': 'Ayarları Aç',
    'permissions.webSiteSettings': 'Tarayıcı bu izni vermedi. Adres çubuğunun yanındaki site ayarlarından bu siteye izin verip tekrar deneyin.',

    'anki.again': 'Tekrar',
    'anki.hard': 'Zor',
    'anki.good': 'İyi',
    'anki.easy': 'Kolay',
    'anki.new': 'Yeni',
    'anki.learn': 'Öğrenme',
    'anki.review': 'Tekrar',
    'anki.relearn': 'Yeniden öğrenme',
    'anki.suspend': 'Askıya al',
    'anki.showAnswer': 'Cevabı göster',
    'anki.emptyFront': 'Bu kartın ön yüzü boş.',
    'anki.missingCloze': 'Kartta {{number}} numaralı boşluk bulunamadı. Bir boşluk ekleyin ya da Boş kartlar aracını kullanın.',
    'anki.customStudy': 'Özel çalışma',
    'anki.filteredDeck': 'Filtrelenmiş deste',
    'anki.invalidSearchTitle': 'Geçersiz arama',
    'anki.invalidSearchMessage': 'Bu arama okunamadı. Terimleri, tırnakları ve parantezleri kontrol edin.\n\n{{search}}',

    'backup.notRestorableTitle': 'Önce onarın',
    'backup.notRestorableMessage': 'Koleksiyonda hasarlı satırlar olduğu için geri yüklenebilir bir güvenlik yedeği alınamadı; hiçbir şey değiştirilmedi. Önce Ayarlar’daki “Onar ve optimize et” ile onarın. Okunamayan notlar kalırsa daha eski bir yedeği geri yükleyin.',
    'backup.recoveryCopySaved': 'Koleksiyonda hasarlı satırlar olduğu için bir kurtarma kopyası kaydedildi. Paylaş ile dışa aktarılabilir ama doğrudan geri yüklenemez. Ayarlar’daki “Onar ve optimize et” ile onarın.',

    'root.errorTitle': 'Beklenmeyen Bir Hata Oluştu',
    'root.errorDescription': 'Uygulama çalışırken beklenmeyen bir durumla karşılaşıldı. Verileriniz güvende ve korunuyor.',
    'root.databaseError': 'Veritabanı başlatılamadı',
    'root.storageReadError': 'Kayıtlı koleksiyonunuz tarayıcı depolamasından okunamadı. Hiçbir şey silinmedi; sayfayı yeniden yükleyip tekrar deneyin. Sorun sürerse tarayıcının bu site için veri saklamaya izin verdiğini kontrol edin.',
    'root.startupErrorMessage': 'Uygulama başlatılamadı. Uygulamayı kapatıp yeniden açın; sorun sürerse destek ekibiyle iletişime geçin.',
    'root.returnHome': 'Ana Ekrana Dön',
    'root.technicalDetails': 'Teknik Detaylar',
    'root.copyError': 'Hata Bilgisini Kopyala',
    'root.errorCopied': 'Hata bilgisi panoya kopyalandı',
    'root.secondaryTab': '⚠️ Uygulama başka bir sekmede açık — değişiklikler bu sekmede kaydedilmez.',
    'root.readOnlyTabAction': 'Uygulama başka bir sekmede açık ve bu sekmedeki değişiklikler kaydedilmiyor, bu yüzden bu işlem burada yapılamaz. Diğer sekmeyi kapatıp bu sayfayı yeniden yükleyin.',
    'root.editCard': 'Kartı düzenle',
    'root.cardInfo': 'Kart bilgisi',
    'root.import': 'Deste içe aktar',
    'root.noteTypes': 'Not türleri',
    'root.editNoteType': 'Not türünü düzenle',
    'noteTypes.changeNeedsConfirmation': 'Not türünü değiştirmek {{count}} kartı silecek; önce bunu onaylamanız gerekiyor.',
    'decks.nameExists': '“{{name}}” adında bir deste zaten var.',
    'decks.filteredNameExists': '“{{name}}” bir filtreli deste; kartlar oraya taşınamaz.',

    'settings.title': '⚙️ Ayarlar',
    'settings.learnAheadOn': 'Süresinin dolmasına {{minutes}} dakikadan az kalan öğrenme kartları, sırada başka kart kalmadığında gösterilir.',

    'tabs.study': 'Çalış',
    'tabs.decks': 'Desteler',
    'tabs.statistics': 'İstatistik',
    'tabs.settings': 'Ayarlar',
    'tabs.openMenu': 'Menüyü aç',
    'tabs.closeMenu': 'Menüyü kapat',
    'tabs.backToDecks': 'Deste listesine dön',
    'sidebar.spacedRepetition': 'Aralıklı tekrar',
    'sidebar.allCourses': 'Tüm dersler',
    'sidebar.hideTopics': 'Konuları gizle',
    'sidebar.showTopics': 'Konuları göster',
    'sidebar.myCards': 'Kartlarım',
} as const;

export type TranslationKey = keyof typeof tr;

const en: Record<TranslationKey, string> = {
    'common.ok': 'OK',
    'common.cancel': 'Cancel',
    'common.close': 'Close',
    'common.save': 'Save',
    'common.saved': 'Saved',
    'common.delete': 'Delete',
    'common.add': 'Add',
    'common.create': 'Create',
    'common.retry': 'Try Again',
    'common.error': 'Error',
    'common.genericError': 'The action could not be completed. Please try again.',
    'common.completed': 'Done',
    'common.loading': 'Loading…',
    'common.search': 'Search',
    'common.all': 'All',
    'common.decks': 'Decks',
    'common.deck': 'Deck',
    'common.settings': 'Settings',
    'common.statistics': 'Statistics',
    'common.study': 'Study',

    'permissions.title': 'Permission Required',
    'permissions.openSettings': 'Open Settings',
    'permissions.webSiteSettings': 'The browser did not grant this permission. Allow it for this site in the site settings next to the address bar, then try again.',

    'anki.again': 'Again',
    'anki.hard': 'Hard',
    'anki.good': 'Good',
    'anki.easy': 'Easy',
    'anki.new': 'New',
    'anki.learn': 'Learn',
    'anki.review': 'Review',
    'anki.relearn': 'Relearn',
    'anki.suspend': 'Suspend',
    'anki.showAnswer': 'Show Answer',
    'anki.emptyFront': 'The front of this card is blank.',
    'anki.missingCloze': 'No cloze {{number}} found on card. Please either add a cloze deletion, or use the Empty Cards tool.',
    'anki.customStudy': 'Custom Study',
    'anki.filteredDeck': 'Filtered Deck',
    'anki.invalidSearchTitle': 'Invalid search',
    'anki.invalidSearchMessage': 'This search could not be read. Check the terms, quotes and parentheses.\n\n{{search}}',

    'backup.notRestorableTitle': 'Repair First',
    'backup.notRestorableMessage': 'The collection has damaged rows, so a restorable safety backup could not be made and nothing was changed. Run “Repair and optimize” in Settings first. If unreadable notes remain, restore an earlier backup.',
    'backup.recoveryCopySaved': 'The collection has damaged rows, so a recovery copy was saved. It can be exported with Share but cannot be restored directly. Run “Repair and optimize” in Settings.',

    'root.errorTitle': 'Something went wrong',
    'root.errorDescription': 'An unexpected issue occurred while running the app. Your data is safe and intact.',
    'root.databaseError': 'Could not initialize the database',
    'root.storageReadError': 'Your saved collection could not be read from browser storage. Nothing was deleted; reload the page to try again. If it keeps happening, check that the browser allows this site to store data.',
    'root.startupErrorMessage': 'The app could not start. Close and reopen it; if the issue continues, contact support.',
    'root.returnHome': 'Return to Home',
    'root.technicalDetails': 'Technical Details',
    'root.copyError': 'Copy Error Info',
    'root.errorCopied': 'Error info copied to clipboard',
    'root.secondaryTab': '⚠️ The app is open in another tab — changes in this tab will not be saved.',
    'root.readOnlyTabAction': 'The app is open in another tab and changes in this tab are not saved, so this cannot be done here. Close the other tab and reload this page.',
    'root.editCard': 'Edit Card',
    'root.cardInfo': 'Card Info',
    'root.import': 'Import deck',
    'root.noteTypes': 'Note Types',
    'root.editNoteType': 'Edit Note Type',
    'noteTypes.changeNeedsConfirmation': 'Changing the note type would remove {{count}} card(s), so it needs your confirmation first.',
    'decks.nameExists': 'A deck named “{{name}}” already exists.',
    'decks.filteredNameExists': '“{{name}}” is a filtered deck, so cards cannot be placed in it.',

    'settings.title': '⚙️ Settings',
    'settings.learnAheadOn': 'Learning cards due in less than {{minutes}} minutes are shown when no other cards remain.',

    'tabs.study': 'Study',
    'tabs.decks': 'Decks',
    'tabs.statistics': 'Stats',
    'tabs.settings': 'Settings',
    'tabs.openMenu': 'Open menu',
    'tabs.closeMenu': 'Close menu',
    'tabs.backToDecks': 'Back to deck list',
    'sidebar.spacedRepetition': 'Spaced Repetition',
    'sidebar.allCourses': 'All Subjects',
    'sidebar.hideTopics': 'Hide topics',
    'sidebar.showTopics': 'Show topics',
    'sidebar.myCards': 'Card Browser',
};

const resources: Record<SupportedLocale, Record<TranslationKey, string>> = { tr, en };

export function resolveAppLocale(
    preference: AppLanguage,
    deviceLanguageCodes: ReadonlyArray<string | null | undefined> = [],
): SupportedLocale {
    if (preference === 'tr' || preference === 'en') return preference;
    const firstLanguage = deviceLanguageCodes.find(Boolean)?.toLowerCase();
    return firstLanguage === 'tr' || firstLanguage?.startsWith('tr-') ? 'tr' : 'en';
}

/** Card and deck counts read as thousands everywhere: 9.583 in Turkish, 9,583 in English. */
export function formatCount(value: number, locale: SupportedLocale): string {
    return value.toLocaleString(localeTag(locale));
}

export function localeTag(locale: SupportedLocale): 'tr-TR' | 'en-US' {
    return locale === 'tr' ? 'tr-TR' : 'en-US';
}

export function translate(locale: SupportedLocale, key: TranslationKey, params?: TranslationParams): string {
    const template = resources[locale][key] ?? resources.en[key] ?? key;
    if (!params) return template;
    return template.replace(/\{\{(\w+)\}\}/g, (token, name: string) => {
        const value = params[name];
        return value === undefined ? token : String(value);
    });
}

let activeLocale: SupportedLocale = 'tr';

export function setActiveLocale(locale: SupportedLocale): void {
    activeLocale = locale;
}

export function translateActive(key: TranslationKey, params?: TranslationParams): string {
    return translate(activeLocale, key, params);
}

/** Localized display names for Anki's built-in note types; custom names pass through unchanged. */
export function localizeNoteTypeName(locale: SupportedLocale, name: string): string {
    if (locale === 'en') return name;
    if (name === 'Basic') return 'Temel';
    if (name === 'Basic (and Reversed Card)' || name === 'Basic (and reversed card)') return 'Temel (ve ters kart)';
    if (name === 'Basic (optional reversed card)') return 'Temel (seçimli ters kart)';
    if (name === 'Basic (type in the answer)') return 'Temel (yanıtı yazarak)';
    if (name === 'Cloze') return 'Boşluklu';
    return name;
}

/** Localized display names for standard Anki field names; custom names pass through unchanged. */
export function localizeFieldName(locale: SupportedLocale, name: string): string {
    if (locale === 'en') return name;
    if (name === 'Front') return 'Ön';
    if (name === 'Back') return 'Arka';
    if (name === 'Text') return 'Metin';
    if (name === 'Back Extra') return 'Arka Ek';
    if (name === 'Add Reverse') return 'Tersini Ekle';
    return name;
}

/** Localized display names for Anki's stock card template names ("Card 1"); custom names pass through unchanged. */
export function localizeCardTemplateName(locale: SupportedLocale, name: string): string {
    if (locale === 'en') return name;
    const stock = /^Card (\d+)$/.exec(name);
    return stock ? `Kart ${stock[1]}` : name;
}

/**
 * Display name for a card's topic. A note that names no topic is filed under the sentinel
 * 'General' by the study repository and the search index; only that sentinel is translated.
 */
export function localizeTopicName(locale: SupportedLocale, topic: string): string {
    if (locale === 'en') return topic;
    return topic === 'General' ? 'Genel' : topic;
}

/**
 * Display labels for Anki's filtered-deck gather order, indexed by Anki's own ordinal.
 * See lib/filteredDeckOptions.ts for the ordinal table.
 */
export function filteredOrderLabel(locale: SupportedLocale, order: number): string {
    const labels = locale === 'tr'
        ? [
            'En eski görülen önce',
            'Rastgele',
            'Aralıklar (artan)',
            'Aralıklar (azalan)',
            'En çok unutulan',
            'Ekleniş sırası',
            'Vade sırası',
            'Son eklenen önce',
            'Hatırlanabilirlik (artan)',
            'Hatırlanabilirlik (azalan)',
            'Göreceli gecikme',
        ]
        : [
            'Oldest seen first',
            'Random',
            'Increasing intervals',
            'Decreasing intervals',
            'Most lapses',
            'Order added',
            'Order due',
            'Latest added first',
            'Ascending retrievability',
            'Descending retrievability',
            'Relative overdueness',
        ];
    return labels[order] ?? labels[FILTERED_SEARCH_ORDER.due];
}

/**
 * Name of the reviewer operation an undo step would take back.
 *
 * Anki labels its Undo/Redo entries with the operation ("Undo Bury Card"), which is the only
 * thing that tells a learner whether Ctrl+Z is about to unbury a card or un-answer one.
 */
export function reviewerOpName(locale: SupportedLocale, op: ReviewerOpName): string {
    const labels: Record<ReviewerOpName, [tr: string, en: string]> = {
        answer: ['Kartı yanıtla', 'Answer card'],
        buryCard: ['Kartı göm', 'Bury card'],
        buryNote: ['Notu göm', 'Bury note'],
        suspendCard: ['Kartı askıya al', 'Suspend card'],
        unsuspendCard: ['Kartı askıdan çıkar', 'Unsuspend card'],
        suspendNote: ['Notu askıya al', 'Suspend note'],
        forgetCard: ['Kartı sıfırla', 'Reset card'],
        setDueDate: ['Son tarihi ayarla', 'Set due date'],
        markNote: ['Notu işaretle', 'Mark note'],
        unmarkNote: ['Not işaretini kaldır', 'Unmark note'],
        updateTags: ['Etiketleri düzenle', 'Edit tags'],
        setFlag: ['Bayrağı değiştir', 'Set flag'],
    };
    return labels[op][locale === 'tr' ? 0 : 1];
}

export function cardFlagName(locale: SupportedLocale, flag: number): string {
    const labels = locale === 'tr'
        ? ['Bayrak yok', 'Kırmızı bayrak', 'Turuncu bayrak', 'Yeşil bayrak', 'Mavi bayrak', 'Pembe bayrak', 'Turkuaz bayrak', 'Mor bayrak']
        : ['No flag', 'Red flag', 'Orange flag', 'Green flag', 'Blue flag', 'Pink flag', 'Turquoise flag', 'Purple flag'];
    return labels[flag] ?? labels[0];
}
