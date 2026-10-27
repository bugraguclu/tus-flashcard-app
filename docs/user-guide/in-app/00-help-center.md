# Yardım merkezi ekranı (yeni)

Bu dosya, makalelerin (`tr/`, `en/`) uygulamanın içinde nasıl gösterileceğini tarif eder. Ekran
henüz yok; aşağıdaki yerleşim ve metinler onu kuracak geliştirme için hazırlandı.

## Ekran

- **Rota:** `app/help.tsx` (yeni). Parametreler: `article` (makalenin `id` değeri, örneğin
  `deck-options`) ve `section` (bölüm çapası, örneğin `daily-limits`). Örnek:
  `router.push({ pathname: '/help', params: { article: 'deck-options', section: 'daily-limits' } })`.
- **Görünüm:** Gözat, İçe aktar ve Dışa aktar gibi tam ekran bir yardımcı ekran:
  `components/ScreenHeader.tsx` başlığı, yerel geri hareketi (back swipe) açık. Bir sayfa (sheet)
  değildir; uzun metin okunacağı için tam ekran açılır.
- **Makaleler arası geçiş:** Ekranın içinde yerel durumla yapılır, her makale için yeni rota
  açılmaz. Başlıktaki geri düğmesi makaleden listeye, listeden çıkışa götürür; geri kaydırma
  hareketi ekranı doğrudan kapatır.
- **İçerik kaynağı:** Uygulamaya gömülü gelir, internet gerektirmez. `docs/user-guide/{tr,en}/*.md`
  dosyalarından üretilen bir modül okunur (bkz. README › Uygulamaya ekleme). Dil, uygulama dilini
  izler (`useI18n().locale`).
- **Web sürümünde:** Aynı rota `tusankim.vercel.app/help` adresinde de çalışır.

## Nereden açılır? (giriş noktaları)

| Giriş | Tam yer | Etiket TR / EN | Açılan |
| --- | --- | --- | --- |
| Ayarlar › Hakkında | `app/settings.tsx` `renderAbout()` (≈1597), **Gizlilik politikası** satırının üstüne, ilk satır | **Yardım ve kullanım kılavuzu** / **Help and user guide** | `/help` (liste) |
| Desteler ⋮ menüsü (iPhone'da ana giriş) | `app/(tabs)/decks.tsx` (≈2287–2295), **Yedekten geri yükle** satırından sonra son satır; `openOverflowRoute` ile açılır, simge `InfoCircleGlyph` (bkz. `in-app/01-decks.md`) | **Yardım** / **Help** | `/help` (liste) |
| Kenar çubuğu (yalnızca ≥768 px: web/iPad; iPhone'da yok) | `components/Sidebar.tsx` (≈324), **Ayarlar** düğmesinin altı, "Powered by" satırının üstü | **Yardım** / **Help** | `/help` (liste) |
| Ekran bilgi sayfaları | Her ⓘ / ? sayfasının en altı (bkz. `in-app/01…09`) | **Daha fazla bilgi** / **Learn more** | `/help?article=…&section=…` |
| İlk açılış kartı | Deste listesi ilk kullanım kartı (bkz. `in-app/01-decks.md`) | **Kılavuzu aç** / **Open the guide** | `/help?article=quick-start` |
| Hata ve uyarı mesajları | İlgili mesajın ikincil düğmesi (bkz. `in-app/07-import-export-backups.md`, `in-app/08-settings.md`) | **Nasıl çözülür?** / **How to fix this** | `/help?article=faq&section=…` |

## Liste düzeni

Ekranın üstünde, Ayarlar'daki arama kutusu gibi bir filtre kutusu: başlıkları, özetleri ve bölüm
başlıklarını süzer.

| Grup TR / EN | Makaleler (`id`, sırayla) |
| --- | --- |
| Başlarken / Getting started | `welcome`, `concepts`, `quick-start` |
| Çalışma / Studying | `decks`, `studying`, `deck-options`, `fsrs`, `filtered-decks` |
| Kartlar / Cards | `editing`, `note-types`, `browser` |
| İlerleme / Progress | `statistics`, `stopwatch` |
| Veriler / Your data | `import-export`, `backups`, `anki` |
| Uygulama / The app | `settings`, `automation`, `tus-cards` |
| Yardım / Help | `faq`, `glossary` |

Her satırda makalenin `title` ve `summary` değeri gösterilir.

## Ekran metinleri

| ID | Yer | Tür | TR | EN | Durum |
| --- | --- | --- | --- | --- | --- |
| help.center.title | Başlık | başlık | Yardım | Help | Yeni |
| help.center.search | Filtre kutusu | yer tutucu | Kılavuzda ara | Search the guide | Yeni |
| help.center.noResults | Filtre sonucu boşsa | boş durum | Bu aramayla eşleşen bölüm yok. Daha kısa bir kelime deneyin. | No section matches this search. Try a shorter word. | Yeni |
| help.center.offline | Liste altı | dipnot | Bu kılavuz uygulamayla birlikte gelir; internet olmadan açılır. | This guide ships with the app and opens without an internet connection. | Yeni |
| help.center.contact | Liste altı, dipnotun altında | bağlantı | Aradığınızı bulamadınız mı? Destek | Can't find what you need? Support | Yeni |
| help.center.back | Başlık geri düğmesi, makale açıkken | erişilebilirlik etiketi | Yardım listesine dön | Back to help topics | Yeni |
| help.center.backExit | Başlık geri düğmesi, liste açıkken | erişilebilirlik etiketi | Yardımı kapat | Close help | Yeni |
| help.center.missing | `article` veya `section` bulunamazsa | uyarı (satır içi) | Bu bölüm bulunamadı; yardım listesi açıldı. | That section could not be found, so the help topics are shown. | Yeni |
| help.sheet.more | Her bilgi sayfasının alt bağlantısı | bağlantı | Daha fazla bilgi | Learn more | Yeni |

**Destek** bağlantısı `app/settings.tsx` içindeki `SUPPORT_URL` adresini sistem tarayıcısında açar.

## Makale görüntüleme kuralları

- `##` ve `###` başlıkları `accessibilityRole="header"` ile gösterilir; Dynamic Type'a uyar.
- `<a id="…"></a>` satırları görünmez; `section` parametresi bu çapalara kaydırır.
- `<!-- … -->` yorumları (yerleşim notları) hiç gösterilmez.
- `> **Anki'den farkı:**`, `> **Web sürümünde:**` ve `> **Dikkat …**` ile başlayan alıntılar renkli
  bilgi kutusu olarak gösterilir.
- Tablolar telefonda satır başına bir kart olarak gösterilir (başlık: değer).
- Makaleler arası bağlantılar (`05-studying.md#…`) yardım ekranının içinde açılır; `https://`
  bağlantıları sistem tarayıcısında açılır.
- Satır içi kod (`deck:Farmakoloji`) eş aralıklı yazıyla ve kopyalanabilir gösterilir; arama
  örnekleri için önemlidir.
