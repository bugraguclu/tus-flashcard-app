# TusAnkiM kullanıcı rehberi — içerik ve yerleşim haritası

Bu klasör, TusAnkiM kullanıcılarına gösterilecek bütün bilgilendirme metinlerinin tek kaynağıdır.
Aynı metinler hem **uygulamanın içinde** (Yardım merkezi, ⓘ bilgi sayfaları, kısa ipuçları) hem
**web sitesinde** (yardım sayfaları) kullanılır. Bu dosya her parçanın **tam olarak nerede**
kullanılacağını ve nasıl yayınlanacağını anlatır.

Anki kılavuzu (`docs.ankiweb.net`) ve AnkiMobile kılavuzu yalnızca davranışın doğru anlatılması
için kaynak olarak okundu. Metinlerin hepsi özgündür; Anki kılavuzundan kopya veya çeviri yoktur.

<!-- YERLEŞİM HARİTASI: aşağıdaki "Uygulamada nerede?" bölümü ekran ekran doldurulur. -->

## İçindekiler

1. [Klasörde ne var?](#klasorde-ne-var)
2. [Üç katman](#uc-katman)
3. [Uygulamada nerede? (ekran ekran)](#uygulamada-nerede)
4. [Web sitesinde nerede?](#web-sitesinde-nerede)
5. [Uygulamaya ekleme](#uygulamaya-ekleme)
6. [Web sitesine ekleme](#web-sitesine-ekleme)
7. [Yazım kuralları](#yazim-kurallari)
8. [Güncel tutma](#guncel-tutma)
9. [Doğrulama ve dal durumu](#dogrulama-ve-dal-durumu)

<a id="klasorde-ne-var"></a>
## 1. Klasörde ne var?

| Yol | İçerik | Nerede kullanılır |
| --- | --- | --- |
| `tr/01-…21-*.md` | 21 Türkçe makale (kullanım kılavuzu) | Uygulama: Yardım merkezi (Türkçe arayüz). Web: `/yardim/…` |
| `en/01-…21-*.md` | Aynı 21 makalenin İngilizcesi; dosya adları ve bölüm çapaları Türkçeyle aynı | Uygulama: Yardım merkezi (İngilizce arayüz). Web: `/en/help/…` |
| `in-app/00-help-center.md` | Yeni Yardım merkezi ekranının tarifi, giriş noktaları, liste düzeni | Uygulama |
| `in-app/01-decks.md` | İlk açılış, Desteler (⋮ › **Yardım** girişi dahil), Genel bakış, Filtrelenmiş deste / Özel çalışma | Uygulama |
| `in-app/02-studying.md` | Çalışma ekranı, bekleme ve **Tebrikler!** ekranları | Uygulama |
| `in-app/03-deck-options.md` | Deste seçenekleri (mevcut **AYAR REHBERİ** sayfaları dahil), FSRS kartı | Uygulama |
| `in-app/04-editing.md` | Kart ekleme/düzenleme, boşluk doldurma, fotoğraf/çizim düzenleyici, Not türleri | Uygulama |
| `in-app/05-browser.md` | Kartlarım, arama yardımı, Kart bilgisi | Uygulama |
| `in-app/06-progress.md` | İstatistikler, Kronometre, Çalışma Takvimi | Uygulama |
| `in-app/07-import-export-backups.md` | İçe/dışa aktarma, İçe aktarma günlüğü, Yedekler, Medyayı kontrol et, Boş kartlar, Bakım | Uygulama |
| `in-app/08-settings.md` | Ayarlar (bütün kategoriler, Hakkında), izin istekleri, başlangıç/hata ekranları, web metinleri, otomasyon bağlantıları | Uygulama |
| `in-app/09-tus-cards.md` | TUS Kartları tanıtım ekranı ve paketle ilgili mesajlar | Uygulama |
| `README.md` | Bu dosya: yerleşim haritası, yayınlama adımları, yazım kuralları | Ekip için |

Makale listesi:

| # | `id` | Dosya | Türkçe başlık · web adresi | İngilizce başlık · web adresi |
| --- | --- | --- | --- | --- |
| 1 | `welcome` | `01-welcome.md` | TusAnkiM nedir? · `/yardim/tusankim-nedir` | What is TusAnkiM? · `/en/help/what-is-tusankim` |
| 2 | `concepts` | `02-key-concepts.md` | Temel kavramlar · `/yardim/temel-kavramlar` | Key concepts · `/en/help/key-concepts` |
| 3 | `quick-start` | `03-quick-start.md` | Hızlı başlangıç · `/yardim/hizli-baslangic` | Quick start · `/en/help/quick-start` |
| 4 | `decks` | `04-decks.md` | Desteler · `/yardim/desteler` | Decks · `/en/help/decks` |
| 5 | `studying` | `05-studying.md` | Çalışma ekranı · `/yardim/calisma-ekrani` | Studying · `/en/help/studying` |
| 6 | `deck-options` | `06-deck-options.md` | Deste seçenekleri · `/yardim/deste-secenekleri` | Deck options · `/en/help/deck-options` |
| 7 | `fsrs` | `07-fsrs.md` | FSRS · `/yardim/fsrs` | FSRS · `/en/help/fsrs` |
| 8 | `editing` | `08-adding-and-editing.md` | Kart ekleme ve düzenleme · `/yardim/kart-ekleme` | Adding and editing cards · `/en/help/adding-and-editing` |
| 9 | `note-types` | `09-note-types.md` | Not türleri ve kart şablonları · `/yardim/not-turleri` | Note types and card templates · `/en/help/note-types` |
| 10 | `browser` | `10-browser-and-search.md` | Kartlarım ve arama · `/yardim/kartlarim-ve-arama` | Card Browser and search · `/en/help/card-browser-and-search` |
| 11 | `filtered-decks` | `11-filtered-decks.md` | Filtrelenmiş deste ve özel çalışma · `/yardim/filtrelenmis-deste` | Filtered decks and Custom Study · `/en/help/filtered-decks` |
| 12 | `statistics` | `12-statistics.md` | İstatistikler · `/yardim/istatistikler` | Statistics · `/en/help/statistics` |
| 13 | `stopwatch` | `13-stopwatch-and-calendar.md` | Kronometre ve çalışma takvimi · `/yardim/kronometre` | Stopwatch and study calendar · `/en/help/stopwatch` |
| 14 | `import-export` | `14-import-export.md` | İçe ve dışa aktarma · `/yardim/ice-disa-aktarma` | Import and export · `/en/help/import-export` |
| 15 | `backups` | `15-backups-and-maintenance.md` | Yedekler ve bakım · `/yardim/yedekler` | Backups and maintenance · `/en/help/backups` |
| 16 | `settings` | `16-settings.md` | Ayarlar · `/yardim/ayarlar` | Settings · `/en/help/settings` |
| 17 | `tus-cards` | `17-tus-card-pack.md` | TUS Kartları paketi · `/yardim/tus-kartlari` | TUS card pack · `/en/help/tus-card-pack` |
| 18 | `automation` | `18-shortcuts-and-automation.md` | Kısayollar ve otomasyon · `/yardim/kisayollar` | Shortcuts and automation · `/en/help/shortcuts` |
| 19 | `anki` | `19-using-with-anki.md` | Anki ile birlikte kullanma · `/yardim/anki-ile-kullanma` | Using TusAnkiM with Anki · `/en/help/using-with-anki` |
| 20 | `faq` | `20-faq.md` | Sık sorulanlar ve sorun giderme · `/yardim/sss` | FAQ and troubleshooting · `/en/help/faq` |
| 21 | `glossary` | `21-glossary.md` | Sözlük · `/yardim/sozluk` | Glossary · `/en/help/glossary` |

Her makalenin başındaki YAML bloğu (`id`, `title`, `summary`, `order`, `web_path`, `app_help`,
`app_screens`, `verified_against`) hem web sayfasının başlığını ve açıklamasını hem de uygulamadaki
Yardım merkezi satırını üretir. Bölümlerin üstündeki `<a id="…"></a>` çapaları iki dilde de aynıdır;
uygulama bir bölüme dil fark etmeksizin bu adla gider. Bölümlerin altındaki
`<!-- Uygulamada: … -->` yorumları o bölümün hangi düğmeden açıldığını kaydeder; yayımlanan sayfada
görünmez.

<a id="uc-katman"></a>
## 2. Üç katman

| Katman | Ne? | Uygulamada | Web'de | Kaynak |
| --- | --- | --- | --- | --- |
| **Makale** | Uzun anlatım: bir ekranın veya özelliğin tamamı | Yardım merkezi (`/help`) | Yardım sayfaları | `tr/`, `en/` |
| **Bilgi sayfası** | Bir ekranın ⓘ veya bir ayar kartının ? düğmesiyle açılan kısa özet: başlık, özet, 2–4 madde, not, **Daha fazla bilgi** bağlantısı | Ekranın üstünde açılan sayfa (`SwipeDismissSheet`) | — (makale bölümü karşılığıdır) | `in-app/02…05` |
| **Kısa metin** | Bir ayarın altındaki açıklama, boş durum, yer tutucu, uyarı, erişilebilirlik ipucu | Kontrolün yanında, satır içi | — | `in-app/01…05` |

Bilgi sayfaları her zaman ilgili makale bölümüne bağlanır; böylece kısa metin ile uzun anlatım
çelişmez. Uygulamada zaten bulunan bilgi sayfaları (Deste seçenekleri'ndeki **AYAR REHBERİ**
sayfaları, İstatistikler'deki **İstatistikler hakkında** sayfası, **Sürekli Unutulan Kart nedir?**
kutusu, Ayarlar › Kontroller yardımı) korunur; `in-app/` dosyalarında "Mevcut — koru" olarak
işaretlidir ve yalnızca **Daha fazla bilgi** bağlantısı eklenir.

<a id="uygulamada-nerede"></a>
## 3. Uygulamada nerede? (ekran ekran)

Her satır bir ekrandır. **Bilgi sayfası** sütunu, ekranda hangi düğmenin hangi sayfayı açtığını
söyler; ayrıntılı metin, dosya:satır ve kısa metinler sağdaki `in-app/` dosyasındadır. Her bilgi
sayfasının altındaki **Daha fazla bilgi** bağlantısı **Makale** sütunundaki makaleyi açar.
"(yeni)" henüz uygulamada olmayan, "(mevcut)" bugün de bulunan ve korunacak/genişletilecek kontroldür.

| Ekran (dosya) | Bilgi sayfası: kontrol → ID | Metin dosyası | Makale |
| --- | --- | --- | --- |
| Desteler — `app/(tabs)/decks.tsx` | ⋮ › **Yardım** (yeni, iPhone'da Yardım merkezinin ana girişi) → `/help`; sütun başlığında **DESTE** yanındaki ⓘ (yeni) → `help.decks.sheet`; liste başında ilk açılış kartı (yeni) → `help.decks.firstRun.card` | `in-app/01-decks.md` | 03, 04 |
| Genel bakış — `app/deck-overview.tsx` | Sayı kartındaki ⓘ (yeni) → `help.decks.sheet`; **Filtre seçenekleri › ?** (mevcut) → `help.filtered.optionsSheet` | `in-app/01-decks.md` | 04, 11 |
| Filtrelenmiş deste formu, Özel çalışma | Form araç çubuğundaki **?** (mevcut) → `help.filtered.sheet`; sıralama seçeneklerinin alt yazıları (yeni) | `in-app/01-decks.md` | 11 |
| Çalışma ekranı — `app/(tabs)/index.tsx` | ⋮ menüsünün son satırı (yeni) → `help.reviewer.sheet`; **Şimdilik hepsi bu kadar!** yanında ⓘ → `help.reviewer.waitingSheet`; **Tebrikler!** yanında ⓘ → `help.reviewer.finishedSheet` | `in-app/02-studying.md` | 05 |
| Deste seçenekleri — `app/deck-options.tsx` | Her bölümün **?** düğmesi (mevcut **AYAR REHBERİ**, 11 sayfa) → `help.deckOptions.*`; **Ayar grubu** satırındaki **?** (yeni) → `help.deckOptions.presets` | `in-app/03-deck-options.md` | 06, 07 |
| Not ekle / Kartı düzenle — `app/editor.tsx` | ••• › **Yardım** (yeni) → `help.editor.sheet`; boşluk alanı başlığında ⓘ (yeni) → `help.editor.clozeSheet` | `in-app/04-editing.md` | 08 |
| Fotoğrafı düzenle / Çizim — `components/PhotoEditorModal.tsx` | Başlığın sağında ⓘ (yeni) → `help.photoEditor.sheet` | `in-app/04-editing.md` | 08 |
| Not türleri, Not türünü düzenle — `app/note-types.tsx`, `app/note-type.tsx` | Başlık çubuğunda ⓘ (yeni) → `help.noteTypes.sheet`, `help.noteType.sheet` | `in-app/04-editing.md` | 09 |
| Kartlarım — `app/browser.tsx` | Başlığın sağında ⓘ (yeni) → `help.browser.sheet`; arama kutusundaki **?** (mevcut, metni düzeltilecek) → `help.browser.searchHelp` | `in-app/05-browser.md` | 10 |
| Kart bilgisi — `app/card-info.tsx` | Başlığın sağında ⓘ (yeni) → `help.cardInfo.sheet` | `in-app/05-browser.md` | 10 |
| İstatistikler — `app/stats.tsx` | Sağ üstteki **Bilgi** (mevcut, genişletilecek) → `help.stats.sheet` | `in-app/06-progress.md` | 12 |
| Kronometre — `app/stopwatch.tsx` | Başlıkta zilin solunda ⓘ (yeni) → `help.stopwatch.sheet` | `in-app/06-progress.md` | 13 |
| Çalışma Takvimi — `app/study-calendar.tsx` | Başlıkta **Çalışma analizleri**'nin solunda ⓘ (yeni) → `help.calendar.sheet` | `in-app/06-progress.md` | 13 |
| Deste içe aktar — `app/import.tsx` | Başlıkta ⓘ (yeni) → `help.import.sheet` | `in-app/07-import-export-backups.md` | 14, 19 |
| Dışa aktar — `app/export.tsx` | Başlıkta ⓘ (yeni) → `help.export.sheet` | `in-app/07-import-export-backups.md` | 14, 19 |
| Yedekler — `app/backups.tsx` | Başlıkta ⓘ ve **Ayarlar › Veri yönetimi › Yedekleme**'deki **?** (yeni) → `help.backups.sheet` | `in-app/07-import-export-backups.md` | 15 |
| Ayarlar › Veri yönetimi › Bakım | Grup başlığındaki **?** (yeni) → `help.settings.maintenanceSheet` | `in-app/07-import-export-backups.md` | 15 |
| Ayarlar — `app/settings.tsx` | **Hakkında** › **Yardım ve kullanım kılavuzu** (yeni, ilk satır) → `/help`; **İnceleme › Zamanlama** **?** (yeni) → `help.settings.scheduling.sheet`; **Bildirimler** **?** (yeni) → `help.settings.notifications.sheet`; **Kontroller › Dokunma ve kaydırma** **?** (mevcut) → `help.settings.controls.sheet` | `in-app/08-settings.md` | 16 |
| Başlangıç ve hata ekranları — `app/(tabs)/_layout.tsx`, `app/_layout.tsx` | Düğme metinleri ve **Nasıl çözülür?** bağlantısı → `help.shell.*` | `in-app/08-settings.md` | 20 |
| `tusankim://` bağlantıları, deste kısayolları | Açılamayan bağlantı uyarısı (yeni) → `help.automation.ignored` | `in-app/08-settings.md` | 18 |
| TUS Kartları — `app/catalog.tsx` | **Kilitli/Açık** çipinin solunda ⓘ (yeni) → `help.tusCards.sheet` | `in-app/09-tus-cards.md` | 17 |
| Yardım merkezi — `app/help.tsx` (yeni) | Liste ve makale görünümü | `in-app/00-help-center.md` | hepsi |

Kenar çubuğu (`components/Sidebar.tsx`) yalnızca 768 px ve daha geniş pencerelerde (web) görünür;
iPhone'da yoktur. Bu yüzden iPhone'daki giriş noktaları Desteler ⋮ › **Yardım**, Ayarlar ›
Hakkında ve bilgi sayfalarındaki **Daha fazla bilgi** bağlantılarıdır.


<a id="web-sitesinde-nerede"></a>
## 4. Web sitesinde nerede?

Web sitesi GitHub Pages'te yayımlanan sitedir: `https://bugraguclu.github.io/tus-flashcard-app/`.
Bugün yalnızca dört yasal sayfa vardır (`docs/index.html`, `privacy.html`, `support.html`,
`terms.html`) ve `.github/workflows/pages.yml` bunları yalnızca yasal kimlik bilgileri
doldurulduğunda yayımlar. Yardım sayfaları da aynı yayınla, aynı koşulla çıkar.

| Web adresi | Kaynak | Not |
| --- | --- | --- |
| `/yardim/` | Makale listesi (Türkçe), Yardım merkezi gruplarıyla aynı sırada | Yeni sayfa |
| `/yardim/<slug>` | `tr/NN-*.md` (adres her makalenin `web_path` değerindedir) | 21 sayfa |
| `/en/help/` | Makale listesi (İngilizce) | Yeni sayfa |
| `/en/help/<slug>` | `en/NN-*.md` | 21 sayfa |
| `/` (`docs/index.html`) | Mevcut sayfaya iki bağlantı eklenir: **Kullanım kılavuzu / User guide** → `/yardim/` ve `/en/help/`; **Sık sorulanlar / FAQ** → `/yardim/sss`, `/en/help/faq` | Değişiklik |
| `/support.html` | İlk paragrafın üstüne: "Destek kaydı açmadan önce [Sık sorulanlar ve sorun giderme](yardim/sss) sayfasına bakın." / "Before opening a support request, check the [FAQ and troubleshooting](en/help/faq) page." | Değişiklik |

Her yardım sayfasında:

- `<html lang="tr">` veya `lang="en"`; `<title>` = makale `title` + " — TusAnkiM Yardım" /
  " — TusAnkiM Help"; `<meta name="description">` = makale `summary`.
- Dil bağlantısı: aynı `id`'li öbür dildeki sayfaya `hreflang` bağlantısı ve sayfanın üstünde
  **English** / **Türkçe** geçişi.
- Üst gezinme: **Yardım ana sayfası**, **Sık sorulanlar**, **Destek**.
- Alt bilgi (her sayfada aynı, değiştirmeden): "TusAnkiM bağımsız bir projedir; Anki veya Ankitects
  ile bağlantılı değildir ve onlar tarafından onaylanmamıştır. Uygulama ve kartlar yalnızca eğitim
  amaçlıdır; tıbbi tavsiye değildir." / "TusAnkiM is an independent project, not affiliated with or
  endorsed by Anki or Ankitects. The app and its cards are for education only and are not medical
  advice." + **Gizlilik**, **Koşullar**, **Destek** bağlantıları.
- Görünüm: mevcut `support.html` stiliyle aynı (sistem yazı tipi, en fazla 720 px genişlik,
  `#1a2b23` metin, `#f4faf7` zemin, `#17634e` bağlantı).

App Store Connect'teki **Destek URL'si** değişmez (`support.html`); yardım sayfalarına oradan
ulaşılır. Web uygulaması (`tusankim.vercel.app`) yardım sayfalarını ayrıca uygulamanın kendi
`/help` ekranından gösterir.

<a id="uygulamaya-ekleme"></a>
## 5. Uygulamaya ekleme

1. **İçerik modülü:** `scripts/build-help-content.mjs` (yeni) `tr/` ve `en/` klasörlerini okur,
   YAML bloğunu ve `<a id>` çapalarını ayrıştırır, HTML yorumlarını atar ve
   `lib/helpContent.generated.ts` dosyasını üretir (`HELP_ARTICLES.tr`, `HELP_ARTICLES.en`).
   `package.json`'a `build:help` betiği eklenir; CI bu dosyanın güncel olduğunu
   `git diff --exit-code` ile denetler. Uygulama içeriği internetten indirmez (çevrimdışı çalışma
   kuralı).
2. **Yardım merkezi:** `app/help.tsx` — tarif `in-app/00-help-center.md` dosyasındadır. Giriş
   noktaları: Ayarlar › Hakkında ilk satırı, kenar çubuğu, bilgi sayfalarının **Daha fazla bilgi**
   bağlantısı, ilk açılış kartı.
3. **Bilgi sayfası bileşeni:** `components/StatsHelpSheet.tsx` kalıbından genel bir
   `components/HelpSheet.tsx` çıkarılır (`SwipeDismissSheet` üzerinde; tutamaç görünür ve
   çalışır). Deste seçenekleri'nin `OptionHelp` biçimiyle aynı alanları alır: `eyebrow`, `title`,
   `summary`, `points[]`, `note`, ve yeni `more: { article, section }`.
4. **ⓘ düğmeleri:** Tam ekran yardımcı ekranlarda `ScreenHeader` bileşeninin `actions` yuvasına,
   sekme ekranlarında başlığın sağına, Ayarlar gruplarında mevcut `Group` bileşeninin
   `onHelpPress` / `helpLabel` özelliğine konur. Her düğmenin erişilebilirlik etiketi
   `in-app/` dosyalarında verilmiştir. Merkezlenmiş iletişim kutularına, açılır menülere ve yan
   panellere tutamaçlı sayfa eklenmez.
5. **Metinler:** `in-app/` dosyalarındaki her öğenin `ID` değeri önerilen i18n anahtarıdır.
   Kısa metinler `lib/i18n.ts` tablosuna veya ekranın kendi `l('Türkçe', 'English')` çağrısına
   konur; iki dil aynı anda eklenir.
6. **Gezinme kuralları (AGENTS.md):** Bilgi sayfaları bulunduğu ekranın üstünde açılır ve
   kapanınca aynı ekrana döner; yalnızca **Daha fazla bilgi** yeni bir ekrana (Yardım merkezi)
   gider. Bir ekranı açmak için Desteler sekmesinden dolaşılmaz.
7. **Doğrulama:** `npm run quality`. Ek olarak, bilgi sayfalarının `more` hedeflerinin
   `HELP_ARTICLES` içinde var olduğunu denetleyen küçük bir test önerilir (kırık çapa olmasın).

<a id="web-sitesine-ekleme"></a>
## 6. Web sitesine ekleme

1. `scripts/build-help-site.mjs` (yeni) aynı Markdown dosyalarından `yardim/` ve `en/help/`
   altında HTML sayfaları üretir (bkz. bölüm 4'teki sayfa kuralları). Makaleler arası
   `NN-*.md#çapa` bağlantıları `/yardim/<slug>#çapa` adresine çevrilir.
2. `.github/workflows/pages.yml`: `paths` listesine `docs/user-guide/**` eklenir; "Prepare legal
   pages" adımından sonra `node scripts/build-help-site.mjs --out legal-pages` çalıştırılır.
   `scripts/prepare-legal-pages.mjs` yasal kimlik denetimi aynen kalır: yasal sayfalar hazır
   değilse yardım sayfaları da yayımlanmaz.
3. `docs/index.html` ve `docs/support.html` bölüm 4'teki bağlantılarla güncellenir.
   `support.html` için ödeme ifadesi yasağı (`scripts/verify-ios-readiness.mjs`) geçerlidir:
   "satın almayı geri yükle", "tek ödeme" gibi ifadeler kullanılmaz.
4. Başka bir site aracına (ör. ayrı bir tanıtım sitesi) taşınırsa Markdown dosyaları olduğu gibi
   kullanılabilir: YAML bloğundaki `title` ve `summary` çoğu araçta doğrudan başlık ve açıklama
   olur.

<a id="yazim-kurallari"></a>
## 7. Yazım kuralları

- **Kimlik:** TusAnkiM bağımsız bir projedir. Anki adı ürünün adı veya kimliği olarak kullanılmaz;
  "Anki paketleriyle çalışır" denir. Her makale ve web sayfası bu ayrımı korur.
- **Uyumluluk iddiası:** "Anki ile tam uyumlu" yazılmaz. Bir davranış "Anki'deki gibi" diye ancak
  `docs/ANKI_COMPATIBILITY.md` onu uygulanmış olarak gösteriyorsa anlatılır. Kullanıcının fark
  edeceği her fark `> **Anki'den farkı:**` kutusuyla yazılır.
- **Tıbbi uyarı:** Uygulama ve kartlar eğitim amaçlıdır; tıbbi tavsiye değildir. Örneklerde TUS
  dersleri yalnızca örnek olarak geçer.
- **Ödeme:** Bu sürümde ödeme kapalıdır (`EXPO_PUBLIC_BKA_CATALOG_PAYMENT_REQUIRED=false`).
  Satın alma, geri yükleme veya makbuz mevcut davranış olarak anlatılmaz.
- **Dil:** Türkçe metinler uygulamanın kendi dili gibi "siz" ile yazılır. Arayüz etiketleri
  uygulamada göründüğü gibi ve kalın yazılır: **Cevabı göster**, **Ayarlar › Genel › Dil**.
  İngilizce dosyalarda İngilizce arayüz etiketleri kullanılır.
- **Platform:** Asıl platform iPhone'dur. Web önizlemesindeki farklar `> **Web sürümünde:**`
  kutusuyla yazılır.
- **Kaynak:** Anki ve AnkiMobile kılavuzları davranışı anlamak için okunur; cümleleri kopyalanmaz,
  yakından yeniden yazılmaz veya çevrilmez.
- **İç terim yok:** Kullanıcı metninde kuyruk, revlog, SQLite, rota, bileşen gibi geliştirici
  terimleri geçmez. Dosya yolları yalnızca HTML yorumlarında ve `in-app/` yerleşim satırlarında
  bulunur.

<a id="guncel-tutma"></a>
## 8. Güncel tutma

- Bir ekranı veya davranışı değiştiren her değişiklik, aynı commit içinde ilgili makale bölümünü
  (iki dilde), `in-app/` öğesini ve gerekiyorsa bu dosyadaki haritayı günceller.
- Bölüm çapaları (`<a id>`) değiştirilmez; uygulama ve web bağlantıları bunlara bağlıdır. Bir bölüm
  kaldırılırsa çapası ona en yakın bölüme taşınır.
- Bir Anki-yüzlü yetenek değişince `docs/ANKI_COMPATIBILITY.md` satırı, `ANKI_COMPATIBILITY_NOTES.md`
  bölümü ve ilgili makaledeki **Anki'den farkı** kutusu birlikte güncellenir.
- Makalenin `verified_against` alanı, metnin en son karşılaştırıldığı commit ile güncellenir.
- Ekran adları veya etiketler değişirse önce `21-glossary.md` (sözlük) güncellenir, sonra makaleler.

<a id="dogrulama-ve-dal-durumu"></a>
## 9. Doğrulama ve dal durumu

**Metinlerin doğrulandığı kod:** `master` c6108e6 (2026-10-25). Her makalenin `verified_against`
alanı bunu gösterir. Etiketler, menü yolları ve dosya:satır referansları bu commit'e göre
yazılmıştır.

**Dosyaların bulunduğu dal:** `next-step`. Bu dal yazıldığı gün `master`'ın 154 commit gerisinde,
4 commit ilerisindeydi (ortak taban 2026-10-16; `next-step`'e özgü olanlar katalog düzeltmeleri,
Kronometre ve klavye odağı birleştirmeleri). Bu yüzden kılavuz `next-step`'in bugünkü kodundan
birkaç noktada **ileridedir**:

| Konu | Kılavuz (master) | `next-step` bugün |
| --- | --- | --- |
| Yeni kart günlük sınırı | Yok (`04f55a0`, 2026-10-21) | Hâlâ var; Deste seçenekleri'nde yeni kart limiti görünür |
| Deste listesi sayıları | Çalışma sırasıyla aynı (`fix(decks): deck list counts match the study queue`) | Eski hesap |
| Öğrenme adımı etiketleri | Önceden öğrenme sınırı içindekiler `<` ile (ör. `<10 dk`) | `<` öneki yok |
| ＋ menüsü etiketleri | Etiketlere de dokunulabilir (`a7d4bc5`) | Yalnızca düğmeler |
| Notu silince **Geri al** | Kartlarım toplu silme ve çalışma ekranında var | Yok |
| Yardım merkezi (`app/help.tsx`), `HelpSheet` | İkisinde de **henüz yok** — bu klasör onların içeriği ve yerleşim planıdır | — |

**Yayına almadan önce:** `next-step`'e `master` birleştirilmeli (veya bu klasör `master`'a
taşınmalı); ardından `verified_against` alanları yeni commit'e güncellenir ve
`node scripts/check-user-guide.mjs` çalıştırılır.

**Denetleyicinin baktıkları:** her makalede front matter alanlarının tamlığı; `tr/` ve `en/`
dosyalarında aynı `<a id>` çapaları; makaleler arası bağlantıların ve `help?article=` derin
bağlantılarının var olan dosya/çapaya gitmesi; yasaklı ifadeler ("tam uyumlu", "Anki uygulaması",
satın alma anlatımı vb.).
