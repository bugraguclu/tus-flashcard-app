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
    'common.edit': 'Düzenle',
    'common.add': 'Ekle',
    'common.create': 'Oluştur',
    'common.retry': 'Tekrar dene',
    'common.error': 'Hata',
    'common.genericError': 'İşlem tamamlanamadı. Lütfen tekrar deneyin.',
    'common.completed': 'Tamamlandı',
    'common.loading': 'Yükleniyor…',
    'common.search': 'Ara',
    'common.all': 'Tümü',
    'common.cards': 'Kartlar',
    'common.card': 'Kart',
    'common.notes': 'Notlar',
    'common.note': 'Not',
    'common.decks': 'Desteler',
    'common.deck': 'Deste',
    'common.settings': 'Ayarlar',
    'common.statistics': 'İstatistikler',
    'common.study': 'Çalış',
    'common.today': 'Bugün',
    'common.system': 'Sistem',
    'common.turkish': 'Türkçe',
    'common.english': 'English',

    'anki.again': 'Tekrar',
    'anki.hard': 'Zor',
    'anki.good': 'İyi',
    'anki.easy': 'Kolay',
    'anki.new': 'Yeni',
    'anki.learn': 'Öğrenme',
    'anki.review': 'Tekrar',
    'anki.relearn': 'Yeniden öğrenme',
    'anki.bury': 'Göm',
    'anki.suspend': 'Askıya al',
    'anki.mark': 'İşaretle',
    'anki.showAnswer': 'Cevabı göster',
    'anki.customStudy': 'Özel çalışma',
    'anki.filteredDeck': 'Filtrelenmiş deste',

    'root.errorTitle': 'Bir hata oluştu',
    'root.databaseError': 'Veritabanı başlatılamadı',
    'root.startupErrorMessage': 'Uygulama başlatılamadı. Uygulamayı kapatıp yeniden açın; sorun sürerse destek ekibiyle iletişime geçin.',
    'root.secondaryTab': '⚠️ Uygulama başka bir sekmede açık — değişiklikler bu sekmede kaydedilmez.',
    'root.editCard': 'Kartı düzenle',
    'root.cardInfo': 'Kart bilgisi',
    'root.import': 'İçe aktar',
    'root.backups': 'Yedekler',
    'root.noteTypes': 'Not türleri',
    'root.editNoteType': 'Not türünü düzenle',

    'settings.title': '⚙️ Ayarlar',
    'settings.appearance': '🎨 Görünüm ve dil',
    'settings.language': 'Uygulama dili',
    'settings.languageDescription': 'Sistem seçiliyken uygulama cihaz dilini otomatik olarak takip eder.',
    'settings.languageSystem': 'Sistem',
    'settings.languageSystemValue': 'Cihaz dili: {{language}}',
    'settings.theme': 'Tema',
    'settings.followSystem': 'Sistem',
    'settings.light': 'Açık',
    'settings.dark': 'Koyu',
    'settings.preferences': '🧑‍💻 Kullanıcı tercihleri',
    'settings.dayStart': 'Yeni gün başlangıcı',
    'settings.dayStartDescription': 'Günlük istatistikler ve kart limitleri bu saatte yenilenir (varsayılan: 04.00).',
    'settings.learnAhead': 'Öğrenme kartlarını erken göster (dk.)',
    'settings.learnAheadOn': 'Süresinin dolmasına {{minutes}} dakikadan az kalan öğrenme kartları, sırada başka kart kalmadığında gösterilir.',
    'settings.learnAheadOff': 'Kapalı: öğrenme kartları yalnızca süreleri dolduğunda veya “Beklemeden Çalış” seçildiğinde gösterilir.',
    'settings.keyBindings': 'Klavye kısayolları',
    'settings.keyBindingsDescription': 'Değiştir’i seçin, ardından atamak istediğiniz tuşa basın.',
    'settings.keyReplayAudio': 'Sesi yeniden oynat',
    'settings.keyBuryCard': 'Kartı göm',
    'settings.keySuspendCard': 'Kartı askıya al',
    'settings.keyMarkNote': 'Notu işaretle',
    'settings.pressAKey': 'Bir tuşa basın…',
    'settings.cancelEscape': 'İptal (Esc)',
    'settings.change': 'Değiştir',
    'settings.resetKeyBindings': 'Klavye kısayollarını sıfırla',
    'settings.resetDefaults': 'Varsayılan ayarlara dön',
    'settings.resetDefaultsMessage': 'Görünüm, tercihler ve zamanlayıcı ayarları varsayılan değerlerine döner. Kartlarınız ve çalışma ilerlemeniz korunur.',
    'settings.defaultsRestored': 'Ayarlar varsayılan değerlerine döndürüldü.',
    'settings.scheduler': '🧠 Zamanlayıcı',
    'settings.schedulerDescription': 'Anki V3 zamanlama davranışı kullanılır. Tekrar, Zor, İyi ve Kolay yanıtları cihazınızda kalıcı olarak saklanır.',
    'settings.schedulerFlow': 'Öğrenme + yeniden öğrenme + tekrar akışı',
    'settings.studyOptions': '📋 Çalışma ayarları',
    'settings.dailyNewLimit': 'Günlük yeni kart limiti',
    'settings.dailyReviewLimit': 'Günlük tekrar limiti',
    'settings.newPlacement': 'Yeni kart yerleşimi',
    'settings.mix': 'Karıştır',
    'settings.newFirst': 'Önce yeni',
    'settings.newLast': 'Sonra yeni',
    'settings.newOrder': 'Yeni kart sırası',
    'settings.sequential': 'Sıralı',
    'settings.random': 'Rastgele',
    'settings.learningSteps': 'Öğrenme adımları (dakika)',
    'settings.relearningSteps': 'Yeniden öğrenme adımları (dakika)',
    'settings.graduatingInterval': 'Mezuniyet aralığı (gün)',
    'settings.easyInterval': 'Kolay aralığı (gün)',
    'settings.newIntervalAfterLapse': 'Unutma sonrası yeni aralık (%)',
    'settings.dataManagement': '💾 Veri yönetimi',
    'settings.exportData': '📤 Verileri dışa aktar',
    'settings.importData': '📥 Verileri içe aktar',
    'settings.checkDatabase': '🩺 Veritabanını denetle',
    'settings.resetProgress': '🗑️ İlerlemeyi sıfırla',
    'settings.about': 'ℹ️ Uygulama hakkında',
    'settings.aboutDescription': 'Sürüm {{version}} · Kartlarınız ve çalışma geçmişiniz cihazınızda tutulur.',
    'settings.privacy': 'Gizlilik politikası',
    'settings.openPrivacy': 'Gizlilik politikasını aç',
    'settings.support': 'Destek ve iletişim',
    'settings.openSupport': 'Destek sayfasını aç',
    'settings.exportTitle': 'Dışa Aktarma',
    'settings.exportCreated': 'Yedek dosyası oluşturuldu: {{fileName}}',
    'settings.exportFailed': 'Veriler dışa aktarılamadı.',
    'settings.importTitle': 'Verileri içe aktar',
    'settings.importWarning': 'Seçilen dosya mevcut koleksiyonun yerini alacak. Bu işlem geri alınamaz.',
    'settings.imported': 'Veriler içe aktarıldı.',
    'settings.invalidBackup': 'Dosya içe aktarılamadı. Geçerli bir yedek dosyası seçin.',
    'settings.fileReadFailed': 'Dosya okunamadı.',
    'settings.databaseCheck': 'Veritabanı denetimi',
    'settings.integrityOk': '✓ Dosya bütünlüğü: sorun yok',
    'settings.integrityIssue': '⚠️ Dosya bütünlüğü: {{result}}',
    'settings.noOrphanCards': '✓ Sahipsiz kart yok',
    'settings.orphanCards': '⚠️ {{count}} sahipsiz kart bulundu',
    'settings.noOrphanNotes': '✓ Kartsız not yok',
    'settings.orphanNotes': '⚠️ {{count}} kartsız not bulundu',
    'settings.searchRebuilt': '✓ Arama dizini yeniden oluşturuldu ({{count}} kart)',
    'settings.databaseCheckFailed': 'Veritabanı denetlenemedi.',
    'settings.resetProgressTitle': 'İlerlemeyi sıfırla',
    'settings.resetProgressWarning': 'Tüm çalışma ilerlemeniz silinecek. Bu işlem geri alınamaz.',
    'settings.resetDone': 'Sıfırlandı',
    'settings.progressCleared': 'Tüm çalışma ilerlemesi temizlendi.',

    'tabs.study': 'Çalış',
    'tabs.decks': 'Desteler',
    'tabs.cards': 'Kartlar',
    'tabs.statistics': 'İstatistik',
    'tabs.settings': 'Ayarlar',
    'tabs.loadingApp': 'TusAnkiM yükleniyor…',
    'tabs.openMenu': 'Menüyü aç',
    'tabs.closeMenu': 'Menüyü kapat',
    'tabs.backToDecks': 'Deste listesine dön',
    'tabs.nativeOnly': 'Lütfen uygulamayı iPhone’unuzda kullanın.',
    'sidebar.spacedRepetition': 'Aralıklı tekrar',
    'sidebar.allCourses': 'Tüm dersler',
    'sidebar.hideTopics': 'Konuları gizle',
    'sidebar.showTopics': 'Konuları göster',
    'sidebar.addCard': 'Kart ekle',
    'sidebar.myCards': 'Kartlarım',
    'sidebar.import': 'İçe aktar',
    'sidebar.noteTypes': 'Not türleri',
} as const;

export type TranslationKey = keyof typeof tr;

const en: Record<TranslationKey, string> = {
    'common.ok': 'OK',
    'common.cancel': 'Cancel',
    'common.close': 'Close',
    'common.save': 'Save',
    'common.saved': 'Saved',
    'common.delete': 'Delete',
    'common.edit': 'Edit',
    'common.add': 'Add',
    'common.create': 'Create',
    'common.retry': 'Try Again',
    'common.error': 'Error',
    'common.genericError': 'The action could not be completed. Please try again.',
    'common.completed': 'Done',
    'common.loading': 'Loading…',
    'common.search': 'Search',
    'common.all': 'All',
    'common.cards': 'Cards',
    'common.card': 'Card',
    'common.notes': 'Notes',
    'common.note': 'Note',
    'common.decks': 'Decks',
    'common.deck': 'Deck',
    'common.settings': 'Settings',
    'common.statistics': 'Statistics',
    'common.study': 'Study',
    'common.today': 'Today',
    'common.system': 'System',
    'common.turkish': 'Türkçe',
    'common.english': 'English',

    'anki.again': 'Again',
    'anki.hard': 'Hard',
    'anki.good': 'Good',
    'anki.easy': 'Easy',
    'anki.new': 'New',
    'anki.learn': 'Learn',
    'anki.review': 'Review',
    'anki.relearn': 'Relearn',
    'anki.bury': 'Bury',
    'anki.suspend': 'Suspend',
    'anki.mark': 'Mark',
    'anki.showAnswer': 'Show Answer',
    'anki.customStudy': 'Custom Study',
    'anki.filteredDeck': 'Filtered Deck',

    'root.errorTitle': 'Something went wrong',
    'root.databaseError': 'Could not initialize the database',
    'root.startupErrorMessage': 'The app could not start. Close and reopen it; if the issue continues, contact support.',
    'root.secondaryTab': '⚠️ The app is open in another tab — changes in this tab will not be saved.',
    'root.editCard': 'Edit Card',
    'root.cardInfo': 'Card Info',
    'root.import': 'Import',
    'root.backups': 'Backups',
    'root.noteTypes': 'Note Types',
    'root.editNoteType': 'Edit Note Type',

    'settings.title': '⚙️ Settings',
    'settings.appearance': '🎨 Appearance & Language',
    'settings.language': 'App Language',
    'settings.languageDescription': 'When System is selected, the app automatically follows your device language.',
    'settings.languageSystem': 'System',
    'settings.languageSystemValue': 'Device language: {{language}}',
    'settings.theme': 'Theme',
    'settings.followSystem': 'System',
    'settings.light': 'Light',
    'settings.dark': 'Dark',
    'settings.preferences': '🧑‍💻 Preferences',
    'settings.dayStart': 'Next Day Starts At',
    'settings.dayStartDescription': 'Daily statistics and card limits refresh at this time (default: 4:00 AM).',
    'settings.learnAhead': 'Learn Ahead Limit (minutes)',
    'settings.learnAheadOn': 'Learning cards due in less than {{minutes}} minutes are shown when no other cards remain.',
    'settings.learnAheadOff': 'Off: learning cards appear only when due or when “Study Now” is selected.',
    'settings.keyBindings': 'Keyboard Shortcuts',
    'settings.keyBindingsDescription': 'Select Change, then press the key you want to assign.',
    'settings.keyReplayAudio': 'Replay Audio',
    'settings.keyBuryCard': 'Bury Card',
    'settings.keySuspendCard': 'Suspend Card',
    'settings.keyMarkNote': 'Mark Note',
    'settings.pressAKey': 'Press a key…',
    'settings.cancelEscape': 'Cancel (Esc)',
    'settings.change': 'Change',
    'settings.resetKeyBindings': 'Reset Keyboard Shortcuts',
    'settings.resetDefaults': 'Restore Default Settings',
    'settings.resetDefaultsMessage': 'Appearance, preferences, and scheduler settings will return to their defaults. Your cards and study progress will be preserved.',
    'settings.defaultsRestored': 'Settings were restored to their defaults.',
    'settings.scheduler': '🧠 Scheduler',
    'settings.schedulerDescription': 'The app uses Anki V3 scheduling behavior. Again, Hard, Good, and Easy answers are stored permanently on your device.',
    'settings.schedulerFlow': 'Learning + relearning + review flow',
    'settings.studyOptions': '📋 Study Options',
    'settings.dailyNewLimit': 'Daily New Card Limit',
    'settings.dailyReviewLimit': 'Maximum Reviews/Day',
    'settings.newPlacement': 'New/Review Order',
    'settings.mix': 'Mix with Reviews',
    'settings.newFirst': 'Show Before Reviews',
    'settings.newLast': 'Show After Reviews',
    'settings.newOrder': 'New Card Sort Order',
    'settings.sequential': 'Sequential',
    'settings.random': 'Random',
    'settings.learningSteps': 'Learning Steps (minutes)',
    'settings.relearningSteps': 'Relearning Steps (minutes)',
    'settings.graduatingInterval': 'Graduating Interval (days)',
    'settings.easyInterval': 'Easy Interval (days)',
    'settings.newIntervalAfterLapse': 'New Interval After Lapse (%)',
    'settings.dataManagement': '💾 Data Management',
    'settings.exportData': '📤 Export Data',
    'settings.importData': '📥 Import Data',
    'settings.checkDatabase': '🩺 Check Database',
    'settings.resetProgress': '🗑️ Reset Progress',
    'settings.about': 'ℹ️ About',
    'settings.aboutDescription': 'Version {{version}} · Your cards and study history stay on this device.',
    'settings.privacy': 'Privacy Policy',
    'settings.openPrivacy': 'Open privacy policy',
    'settings.support': 'Support & Contact',
    'settings.openSupport': 'Open support page',
    'settings.exportTitle': 'Export',
    'settings.exportCreated': 'Backup file created: {{fileName}}',
    'settings.exportFailed': 'Could not export your data.',
    'settings.importTitle': 'Import Data',
    'settings.importWarning': 'The selected file will replace your current collection. This cannot be undone.',
    'settings.imported': 'Data imported successfully.',
    'settings.invalidBackup': 'Could not import the file. Select a valid backup file.',
    'settings.fileReadFailed': 'Could not read the file.',
    'settings.databaseCheck': 'Check Database',
    'settings.integrityOk': '✓ File integrity: OK',
    'settings.integrityIssue': '⚠️ File integrity: {{result}}',
    'settings.noOrphanCards': '✓ No orphaned cards',
    'settings.orphanCards': '⚠️ Found {{count}} orphaned cards',
    'settings.noOrphanNotes': '✓ No notes without cards',
    'settings.orphanNotes': '⚠️ Found {{count}} notes without cards',
    'settings.searchRebuilt': '✓ Search index rebuilt ({{count}} cards)',
    'settings.databaseCheckFailed': 'Could not check the database.',
    'settings.resetProgressTitle': 'Reset Progress',
    'settings.resetProgressWarning': 'All study progress will be deleted. This cannot be undone.',
    'settings.resetDone': 'Reset Complete',
    'settings.progressCleared': 'All study progress was cleared.',

    'tabs.study': 'Study',
    'tabs.decks': 'Decks',
    'tabs.cards': 'Cards',
    'tabs.statistics': 'Stats',
    'tabs.settings': 'Settings',
    'tabs.loadingApp': 'Loading TusAnkiM…',
    'tabs.openMenu': 'Open menu',
    'tabs.closeMenu': 'Close menu',
    'tabs.backToDecks': 'Back to deck list',
    'tabs.nativeOnly': 'Please use the app on your iPhone.',
    'sidebar.spacedRepetition': 'Spaced Repetition',
    'sidebar.allCourses': 'All Subjects',
    'sidebar.hideTopics': 'Hide topics',
    'sidebar.showTopics': 'Show topics',
    'sidebar.addCard': 'Add Card',
    'sidebar.myCards': 'Card Browser',
    'sidebar.import': 'Import',
    'sidebar.noteTypes': 'Note Types',
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

let activeLocale: SupportedLocale = 'en';

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

/** Display labels for Anki filtered-deck gather order; the stored numeric value never changes. */
export function filteredOrderLabel(locale: SupportedLocale, index: number): string {
    const labels = locale === 'tr'
        ? [
            'Vade sırası',
            'Rastgele',
            'Aralıklar (artan)',
            'Aralıklar (azalan)',
            'Ekleniş sırası',
            'Son eklenen önce',
            'En çok unutulan',
            'En eski görülen önce',
            'Hatırlanabilirlik (artan)',
            'Hatırlanabilirlik (azalan)',
        ]
        : [
            'Order due',
            'Random',
            'Increasing intervals',
            'Decreasing intervals',
            'Order added',
            'Latest added first',
            'Most lapses',
            'Oldest seen first',
            'Ascending retrievability',
            'Descending retrievability',
        ];
    return labels[index] ?? labels[0];
}

export function cardFlagName(locale: SupportedLocale, flag: number): string {
    const labels = locale === 'tr'
        ? ['Bayrak Yok', 'Kırmızı', 'Turuncu', 'Yeşil', 'Mavi', 'Pembe', 'Turkuaz', 'Mor']
        : ['No Flag', 'Red', 'Orange', 'Green', 'Blue', 'Pink', 'Turquoise', 'Purple'];
    return labels[flag] ?? labels[0];
}
