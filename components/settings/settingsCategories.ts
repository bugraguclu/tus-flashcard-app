import type { SettingsSearchCategory } from '../../lib/settingsSearch';

export type SettingsSectionId =
    | 'general'
    | 'newStudy'
    | 'reviewing'
    | 'notifications'
    | 'controls'
    | 'accessibility'
    | 'data'
    | 'about';

/**
 * The Settings categories in list order. `summary` lists only the headings found on each page, so
 * it stays a plain table of contents: no live values, no descriptive copy. Keep it in step with the
 * page's Group titles, and `settings` in step with the row labels, which is what a search for one
 * setting matches.
 */
export function settingsCategories(
    l: (turkish: string, english: string) => string,
): SettingsSearchCategory<SettingsSectionId>[] {
    return [
        {
            id: 'general', title: l('Genel', 'General'), summary: l('Dil • Tema • Yazı boyutu • Düzenleme', 'Language • Theme • Text size • Editing'),
            settings: [
                l('Uygulama metinleri', 'App text'),
                l('Yeni kartların destesi', 'Deck for new cards'),
                l('Pano görsellerini PNG olarak yapıştır', 'Paste clipboard images as PNG'),
                l('Yazarak cevap alanlarını devre dışı bırak', 'Never type answers'),
                l('Cevabı kartın içine yaz', 'Type answer into the card'),
                l('Yazarak cevap alanına odaklan', 'Focus type-in-answer'),
                l('Dosya adlarını göster', 'Show filenames'),
                l('Varsayılan ayarlara dön', 'Restore default settings'),
            ],
        },
        {
            id: 'newStudy', title: l('Yeni çalışma ekranı', 'New study screen'), summary: l('Ekran • Araç çubuğu • Yanıt düğmeleri', 'Screen • Toolbar • Answer buttons'),
            settings: [
                l('Yeni çalışma ekranını kullan', 'Use new study screen'),
                l('Çerçeve stili', 'Frame style'),
                l('Kalan kart sayısını göster', 'Show remaining card count'),
                l('Sesli kartlarda oynatma düğmelerini göster', 'Show play buttons on cards with audio'),
                l('Yanıt geri bildirimini göster', 'Show answer feedback'),
                l('Ortaya hizala', 'Center align'),
                l('Deste başlığını göster', 'Show deck title'),
                l('Kalan süreyi göster', 'Show remaining time'),
                l('Araç çubuğunu göster', 'Show toolbar'),
                l('Araç çubuğu konumu', 'Toolbar position'),
                l('Yanıt düğmelerini göster', 'Show answer buttons'),
                l('Sonraki inceleme süresini göster', 'Show next review time above answer buttons'),
                l('Zor ve Kolay düğmelerini gizle', 'Hide Hard and Easy buttons'),
                l('Otomatik ilerleme', 'Auto advance'),
            ],
        },
        {
            id: 'reviewing', title: l('İnceleme', 'Reviewing'), summary: l('Zamanlama • Gelişmiş', 'Scheduling • Advanced'),
            settings: [
                l('Sonraki günün başlangıcı', 'Start of next day'),
                l('Önceden öğrenme sınırı', 'Learn ahead limit'),
                l('Zaman kutusu sınırı', 'Timebox time limit'),
                l('Ekranı açık tut', 'Keep screen on'),
                l('Sesi otomatik oynat', 'Automatically play audio'),
                l('Ses oynatma hızı', 'Audio playback speed'),
                l('Yanıtlarken sesi kes', 'Interrupt audio when answering'),
            ],
        },
        {
            id: 'notifications', title: l('Bildirimler', 'Notifications'), summary: l('Hatırlatma saati', 'Reminder time'),
            settings: [l('Şu durumda bildir', 'Notify when'), l('Hatırlatma saati', 'Reminder time')],
        },
        {
            id: 'controls', title: l('Kontroller', 'Controls'), summary: l('Dokunma ve kaydırma • Ekran kontrolü • Klavye', 'Taps and swipes • On-screen control • Keyboard'),
            settings: [
                l('9 noktalı dokunma', '9-point touch'),
                l('Kaydırma hareketlerini etkinleştir', 'Enable swipe gestures'),
                l('Hazır düzenler', 'Presets'),
                l('Kaydırma hassasiyeti', 'Swipe sensitivity'),
                l('Yüzen Araçlar düğmesini göster', 'Show the floating Tools button'),
                l('Düğme konumu', 'Button position'),
                l('Klavye kısayolları', 'Keyboard shortcuts'),
            ],
        },
        {
            id: 'accessibility', title: l('Erişilebilirlik', 'Accessibility'), summary: l('Kart • Yanıt düğmeleri • Kart tarayıcısı', 'Card • Answer buttons • Card browser'),
            settings: [
                l('Kart yakınlaştırma', 'Card zoom'),
                l('Görsel yakınlaştırma', 'Image zoom'),
                l('Yanıt düğmesi boyutu', 'Answer button size'),
                l('Büyük yanıt düğmelerini iki satırda göster', 'Show large answer buttons in two rows'),
                l('Cevabı göster basılı tutma süresi', 'Show answer long-press time'),
                l('Çift dokunma aralığı', 'Double tap time interval'),
                l('Yazı ölçeği', 'Font scaling'),
            ],
        },
        {
            id: 'data', title: l('Veri yönetimi', 'Data Management'), summary: l('Yedekleme • İçe ve dışa aktar • Bakım', 'Backup • Import and export • Maintenance'),
            settings: [
                l('Otomatik yedekleme', 'Automatic backup'),
                l('Yedekleri yönet', 'Manage backups'),
                l('Verileri dışa aktar', 'Export data'),
                l('Deste ve verileri içe aktar', 'Import decks and data'),
                l('Veritabanını kontrol et', 'Check database'),
                l('Onar ve optimize et', 'Repair and optimize'),
                l('İlerlemeyi sıfırla', 'Reset progress'),
            ],
        },
        {
            id: 'about', title: l('Hakkında', 'About'), summary: l('Gizlilik politikası • Destek', 'Privacy Policy • Support'),
            settings: [l('Sürüm', 'Version')],
        },
    ];
}
