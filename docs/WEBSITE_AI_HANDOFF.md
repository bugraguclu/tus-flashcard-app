# TusAnkiM Web Sitesi — AI Ajanları İçin Teknik Devir ve Mimari Rehberi

> **Amaç:** Bu doküman, `website/` dizinindeki TusAnkiM tanıtım ve ürün web sitesinde **neyin, neden ve nasıl** yapıldığını başka yapay zekâ ajanlarının (Claude, Codex, Gemini, Antigravity vb.) ve geliştiricilerin tek seferde anlayıp kırmadan geliştirebilmesi için hazırlanmıştır.
>
> **Kısa sözleşme:** `website/AGENTS.md` · **Kök uygulama sözleşmesi:** `AGENTS.md`

---

## 1. Özet: Ne Yaptık?

Ana Expo / React Native uygulamasından tamamen izole, sıfır çalışma zamanı çatısı (no React/SPA runtime bloat) içeren, **Astro 7 + Tailwind CSS 3** tabanlı statik bir web sitesi (`website/`, **31 statik HTML sayfası**) inşa edildi.

### Oluşturulan Sayfalar ve Özellikler
| Rota | Dosya | İşlev |
| --- | --- | --- |
| `/` | `website/src/pages/index.astro` | Ana sayfa: Hero, 4'lü doğrulanmış kanıt şeridi (Belif `.stat-row`), 2027 TUS canlı geri sayım, 11 derslik kayıt gerektirmeyen canlı kart demosu (`#demo`), sınav/ders bazlı referans çubukları (`#referans-ozet`), gerçek `FSRS-6` günlük çalışma dozu simülatörü (`#calisma-dozu`), TUS ekosistemi, `StoryBands` (FSRS-6 / Kronometre / Anki uyumu), Fotoğraf Düzenleyici & Görsel Gizleme `BeforeAfter` kaydırıcı, Kurucu özeti, `PRICING_MODE` kontrollü fiyatlandırma & karşılaştırma tablosu, okul/kulüp ücretsiz hesap çağrısı, Instagram kullanım rayı, `SHOW_SPONSORS` kontrollü sponsorluk bandı, 7/24 WhatsApp bandı + kayan düğme, sekmeli SSS. |
| `/referanslar/` | `website/src/pages/referanslar.astro` | Son 6 TUS (`2024/1–2026/2`, **1.195 soru**) için JSON destekli (`public/data/references.json`) canlı referans gezgini. Sınav, 11 ders, rozet (`Doğrudan`/`Dolaylı`/`Yalnız Konu`/`Yok`), sınav öncesi `git a78ae1f` süzgeci, serbest metin arama, URL query senkronu ve sınav sonrası güncellenen 6 sorunun şeffaf açıklaması. |
| `/puan-hesapla/` | `website/src/pages/puan-hesapla.astro` | İnteraktif TUS Puan & Hedef Net Hesaplayıcı (Temel 100 + Klinik 100, 4 yanlış 1 doğru, güncel yönetmelik **`%5 Puan Kesintisi Uygula`** anahtarı, Temel `%70/%30` ve Klinik `%50/%50` ağırlık, 45 baraj kontrolü, tersine hedef puan net planlayıcı + 4 adımlı TUS tercih rehberi). |
| `/kurucu/` | `website/src/pages/kurucu.astro` | Kurucumuzun yazısı, 4 editöryal kalite standardı ve veri kaynağı `website/src/data/founder.json`. |
| `/sss/` | `website/src/pages/sss.astro` | Kategorili, sekmeli ve anlık aramalı tam SSS sayfası (`website/src/data/faqs.json`). |
| `/yardim/` & `/yardim/[slug]/` | `website/src/pages/yardim/` | Kök depodaki `docs/user-guide/tr/*.md` (**21 Türkçe kılavuz**) dosyalarını derleme anında otomatik HTML'e dönüştüren yardım merkezi (`website/src/lib/helpDocs.ts`). Markdown içi görece `.md` linkleri otomatik `/yardim/<slug>/` rotalarına çevrilir. |
| `/gizlilik/`, `/kullanim-kosullari/`, `/destek/` | `website/src/pages/{gizlilik,kullanim-kosullari,destek}.astro` | KVKK / gizlilik, kullanım koşulları ve 7/24 WhatsApp + e-posta destek sayfaları. |
| `/arama-index.json`, `/sitemap.xml`, `/robots.txt`, `/404.html` | `website/src/pages/`, `website/public/` | 57 kayıtlık site içi arama indeksi (`SearchModal.astro`), özel Astro 7 uyumlu sitemap (30 URL, `/404` hariç), robots ve 404 sayfası. |

---

## 2. Neden Bu Mimariyi Seçtik? (Kritik Tasarım ve Mühendislik Kararları)

### 2.1. Neden İzole `website/` Klasörü + Astro 7 + Tailwind 3?
- Kök depo Expo SDK 57 / React Native 0.86 / Expo Router static web (`tusankim.vercel.app`) üzerine kuruludur. Pazarlama ve SEO sitesini React Native Web içine gömmek hem dev JS paket yükü (LCP/INP kaybı) hem de mevcut App Store / CI derlemesinde kırılma riski doğururdu.
- Belif canlı web sitesi (`/Users/bugra/Projeler/Pureko/Website-canli`, Astro 7.3 + Tailwind 3.4) sıfır JS yükü, yüksek SEO/Lighthouse performansı, katı CSP başlıkları ve Safari 16–17 `backdrop-filter` uyumu (`vite.build.cssMinify: 'esbuild'`) ile kendini kanıtlamış bir mimaridir.
- **Kök depo izolasyonu (bozulmamalı):**
  - Kök `tsconfig.json`: `"exclude": ["website"]` eklendi (`npm run typecheck` temiz kalır).
  - Kök `metro.config.js`: `WEBSITE` regex'i `config.resolver.blockList` listesine eklendi (Metro `website/node_modules` izlemez).
  - Kök `.gitignore`: `website/node_modules/`, `website/dist/`, `website/.astro/` hariç tutuldu.
  - Kök `docs/{index,privacy,support,terms}.html` ve `docs/app-store/metadata-tr.md` dosyalarına **dokunulmadı**; çünkü `scripts/verify-ios-readiness.mjs` ve GitHub Pages bunları kontrol eder.

### 2.2. Belif Bileşenleri Nasıl Kullanıldı ve Neler Bilerek Değiştirildi?
| Belif Kaynağı | TusAnkiM Karşılığı | Neden Değiştirildi / Ne Düzeltildi? |
| --- | --- | --- |
| `astro.config.mjs`, `postcss.config.mjs`, `tailwind.css`, `schema.ts`, `sitemap.xml.ts`, `vercel.json` | Doğrudan `website/` içine taşındı | Astro 7 `@astrojs/tailwind` kullanmadığı için `postcss.config.mjs` + `tailwind.css` sırası korundu; `sitemap.xml.ts` Astro 7 yerleşik sitemap hatasına karşı korundu; LG/Beymen/Facebook meta etiketleri temizlendi. |
| `Sansa Pro` fontları | **ALINMADI** → `@fontsource/plus-jakarta-sans` | **Lisans sınırı:** `Sansa Pro` LG/belif'in ticari lisanslı fontudur; kesinlikle kopyalanamaz. `@fontsource/plus-jakarta-sans` (latin + latin-ext) yerel paketlenerek hem Türkçe `İ/ı/ğ/ş/ö/ü/ç` tam desteği hem sıfır dış font çağrısı (katı CSP) sağlandı. |
| `FaqTabs.astro` | Sıfırdan WAI-ARIA `tablist`/`tab`/`tabpanel` olarak yeniden yazıldı | Belif'in radyo-girdi yaklaşımında `global.css:596` klavye odağında tüm sekme etiketlerini aynı anda çerçeveliyordu. Yeni sürümde `hidden="until-found"` + `beforematch` + ok/Home/End tuşları var. |
| `CatalogFilters.astro` | Yalnızca UX deseni alındı → `referanslar.astro` | Belif sürümü 21 kozmetik DOM kartını gizliyordu; 1.195 TUS sorusunu ilk HTML'e gömmek yerine SSR'da 24 örnek kart basılıp tam veri `/data/references.json` üzerinden çekiliyor. |
| `BeforeAfter.astro`, `StoryBands.astro`, `Scroller.astro`, `Header.astro`, `Footer.astro` | Prop tabanlı temiz uyarlama | Kozmetik metinleri ve sabit `#01aef0` / `text-ink/45` (`3.19:1`, AA ihlali) kaldırıldı; `Header` ve `SearchModal` yerel `<dialog>` (`showModal()` + `closedby="any"`) standardına geçirildi. |
| `src/config.ts` | `website/src/config.ts` | Belif'in gerçek boolean anahtar deseni (`PUBLIC`, `LEGAL_PAGES`) üzerine TusAnkiM anahtarları (`SHOW_SPONSORS`, `SHOW_PRICING_PROMO`, `PRICING_MODE`) kuruldu. |

### 2.3. Neden `<iframe>` Yerine Yerel Canlı Kart Demosu (`#demo`)?
- Kök `vercel.json` (`https://tusankim.vercel.app/`) güvenlik gereği `X-Frame-Options: SAMEORIGIN` başlığı gönderir; cross-origin `<iframe>` tarayıcı tarafından engellenir.
- Bu nedenle `#demo` (`LiveCardDemo.astro`) sıfır ağ gecikmeli, kayıt gerektirmeyen yerel HTML/JS kart inceleyicisi olarak yazıldı ve `"Tam Web Uygulamasında Dene"` düğmesi `https://tusankim.vercel.app/` adresini yeni sekmede açar.

### 2.4. Veri Doğruluğu, Telif ve Marka Sınırları (ASLA İHLAL ETME)
1. **Gerçek Katalog Rakamları (`assets/catalog/bka-manifest.json`):**
   - **9.575 kart · 7.721 not · 12 ders · 106 konu alt destesi.**
2. **Gerçek TUS Referans Rakamları (`docs/kartlar/referans-sistemi-2026-10-26/referanslar.json` & `RAPOR.md`):**
   - Son 6 TUS (`2024/1–2026/2`, **1.195 soru**): **521/1.195 (%43,6) çözüm desteği** (`333 Doğrudan` + `188 Dolaylı`) ve **1.108/1.195 (%92,7) konu kapsamı**.
   - `2026/2` Ağustos TUS: güncel katalogda **82/200 (%41,0)** (`51 Doğrudan + 31 Dolaylı`); sınavdan 2 gün önceki `git a78ae1f` (21 Ağustos 2026) sürümünde doğrulanmış **76/200 (%38,0)**; konu kapsamı **192/200 (%96,0)**.
   - **Yasaklar (`RAPOR.md`):**
     - Eski masaüstü Excel rakamları (`822/1195`, `%77,5`) **asla kullanılmaz**.
     - ÖSYM soru metni, şıkları (`A)... E)`), `reaId`/TUSBuddy veya rakip kart metinleri **asla yayımlanmaz**.
     - `Konu İlişkili` kartlar çözüm desteğine katılmaz; ayrı "Konu Kapsamı" etiketiyle gösterilir.
     - Yapay zekâ destekli ön değerlendirme ve bağımsız hekim editör onay durumu şeffafça belirtilir; `2026/2` sınav sonrası güncellenen 6 soru (`T018, K039, K043, K050, K057, K078`) ayrı şeffaflık listesinde gösterilir.
3. **Katalog Paket Güvenliği:**
   - `website/public/` veya `website/dist/` içine **asla** ham `.apkg` / `.tuspack` konmaz.
   - `Cloze-AnKingMaster`, `Basic (type in the answer)-26ee6` not türü adları, `[sound:...]` ve doğrulanmamış ham `<img>` etiketleri `build-data.mjs` tarafından temizlenir ve `verify-site.mjs` tarafından denetlenir.
4. **Anki Marka & Ürün Gerçeği (`AGENTS.md` Kural #5):**
   - Her sayfanın alt bilgisinde *"TusAnkiM bağımsız bir projedir; Anki veya Ankitects ile bağlantılı değildir."* beyanı zorunludur.
   - Uygulama bugün **iPhone + Web tarayıcı (Mac, Windows, iPad, Android tarayıcı)** üzerinde aktiftir; `.apkg`/`.colpkg` taşınabilirliği **kişisel desteler** içindir (`docs/user-guide/tr/17-tus-card-pack.md` gereği BKA paketi ilerlemesi dışa aktarılmaz). **Otomatik Bulut Eşitleme, Yerel Android Uygulaması ve TUS Tercih Simülasyonu** dürüstçe *"Yakında"* rozetiyle işaretlenmiştir.
5. **Güncel TUS Mevzuatı (`/puan-hesapla/`):**
   - Tıpta ve Diş Hekimliğinde Uzmanlık Eğitimi Yönetmeliği uyarınca puan kesintisi **`%5`** (eski `%2` değil) olarak uygulanır ve hesaplayıcıda etkileşimli `#puan-kesinti` (`× 0,95`) anahtarı vardır.
   - Puan ağırlıkları: **Temel (T) = `%70 Temel + %30 Klinik`**, **Klinik (K) = `%50 Temel + %50 Klinik`**.

### 2.5. WCAG 2.2 AA Renk Token Sistemi
Kök uygulamanın `constants/theme.ts` değerleri (ör. `#14998a`, `#d9661a`, `#858d92`) web'de metin/düğme üzerinde WCAG 2.2 AA (`4.5:1`) sınırının altında kaldığı için web'de görsel kimliği koruyan doğrulanmış AA karşılıkları tanımlandı (`website/tailwind.config.mjs`):

| Rol | Token | Hex | Doğrulanmış Kontrast |
| --- | --- | --- | --- |
| Ana CTA dolgusu (`#fff` metin) & vurgu linki | `teal` / `tealDark` | `#0e7469` / `#0b5e55` | `5.64:1` (`#fff`), `5.16:1` (`#f3f5f6`), `4.97:1` (`#e4f4f1`) |
| Yalnız grafik/kenarlık/ikon (metin dışı ≥3:1) | `tealGraphic` | `#14998a` | `3.53:1` (`#fff`) — **asla küçük metin/düğme dolgusu yapma** |
| Sıcak Kronometre/rozet metni | `warm` | `#a3430a` | `5.37:1` (`#fdf0e4` `warmTint`), `5.98:1` (`#fff`) |
| Ana & ikincil metin | `ink` / `inkMuted` | `#24292c` / `#596166` | `14.70:1` / `6.31:1` (`#858d92` yasak) |
| Demo derece düğmeleri (`Again / Hard / Good / Easy`) | `grade*` | `#b02c25` / `#8c4c07` / `#156d3e` / `#205b94` | Tümü kendi pastel zeminlerinde `>= 4.65:1` (`Easy`: `6.16:1`) |

---

## 3. Nasıl Yaptık? (Veri Boru Hattı ve Dosya Haritası)

### 3.1. Veri Üretim ve Doğrulama Boru Hattı
1. **`website/scripts/build-data.mjs`** (`npm run data:build`):
   - Kaynaklar: `../assets/catalog/bka-manifest.json`, `../assets/catalog/bka-tus-complete.apkg`, `../docs/kartlar/referans-sistemi-2026-10-26/referanslar.json`.
   - Çıktılar:
     - `website/src/data/generated/catalog.json` (12 ders, 106 alt deste özeti)
     - `website/src/data/generated/references-summary.json` (genel + sınav + ders istatistikleri + 24 SSR örnek kart)
     - `website/src/data/generated/demo-cards.json` (11 branşın tamamından `2026/2` sınav öncesi `a78ae1f` birebir `DOGRUDAN` eşleşen 11 Cloze kartı)
     - `website/public/data/references.json` (1.195 temizlenmiş referans kaydı, ~370 KB)
   - Güvenlik kapısı: Çıktıda `Cloze-AnKingMaster`, `<img>`, `<script>`, `reaId` veya ÖSYM şık deseni görürse derlemeyi anında durdurur.
2. **`website/scripts/precompute-fsrs.mjs`** (`npm run data:fsrs`):
   - Kök depodaki gerçek `../lib/fsrsSimulator.ts` (Anki 26.09.3 eşdeğeri `FSRS-6`, %90 hedef hatırlama) ile 5 kapsam (`all=9.575`, `temel=3.957`, `klinik=4.812`, `single=800`, `mega=27.341`) × 4 süre (`120/180/270/365` gün) × 6 günlük hız (`20/40/60/80/100/140`) matrisini önceden hesaplar ve `website/src/data/generated/fsrs-curves.json` dosyasına yazar.
   - **Önemli dal notu (`Havuz`):** `fsrs-curves.json` zaten önceden hesaplanıp repoya commit edilmiştir. `Havuz` dalında henüz `lib/fsrsSimulator.ts` bulunmadığı için `npm run build` ve `npm run verify` doğrudan bu hazır JSON'u kullanır; `npm run data:fsrs` yalnızca `lib/fsrsSimulator.ts` bulunan dalda (`master` / `tusbud_landing_page`) çalıştırılır.
3. **`website/scripts/verify-site.mjs`** (`npm run verify`):
   - `website/dist/` çıktısını 8 kategoride otomatik denetler: yasaklı `.apkg`/`.tuspack`, 31 HTML sayfası, CSS `-webkit-backdrop-filter` korunumu, yasaklı font/renk (`Sansa Pro`, `#858d92`, `#b85010`, `text-ink/45`), tek `<h1>` ve atlanmayan başlık sırası, `<summary>` içinde başlık yasağı, yerel `<dialog>` ARIA temizliği, tüm `<img>` etiketlerinde `alt`/`width`/`height`, kırık iç link/ham `.md` link yasağı, 30 URL'li `sitemap.xml`, 1.195 kayıtlık `references.json` bütünlüğü ve 2. tur regresyon kontrolleri.

### 3.2. Canlı Chromium Denetiminde Yakalanıp Çözülen Tuzaklar (Tekrar Bozmayın!)
1. **Hero'yu atlayan otomatik kaydırma:** `LiveCardDemo.astro` ilk açılışta `btn.scrollIntoView()` çağırınca tarayıcı Hero'yu geçip `#demo`'ya atlıyordu. **Çözüm:** İlk render'da kaydırma yok; sekme değişiminde yalnızca yatay `.tablist-scroll` kapsayıcısının `scrollLeft` değeri güncelleniyor (`scrollY === 0` korunur).
2. **Açılmış demo kartında `Kolay` kontrast düşüşü:** `opacity-90` ile `#2b6eab` zemin üzerinde `3.89:1`'e düşüyordu. **Çözüm:** `gradeEasy: '#205b94'` (`6.16:1`) ve derece metinlerinde `opacity-*` yasağı.
3. **`warm` rozet kontrastı:** `#b85010` rengi `#fdf0e4` (`warmTint`) üzerinde `4.47:1` ile AA'yı 0.03 puanla kaçırıyordu. **Çözüm:** `#a3430a` (`5.37:1`).
4. **Demo kartı ↔ `Ölçülen TUS bilgisi` birebir uyumu:** İlk sürümde 5 branşta aynı sorunun yan kartı seçilmişti. 2. turda 5 branş da birebir aynı bilgiyi ölçen sınav öncesi `DOGRUDAN` kartlarla değiştirildi (`T050`, `T067/1604579032901`, `T094`, `K075`, `K083`).
5. **`LiveCardDemo` `Space` çakışması & odak aktarımı:** `Space` tuşu artık yalnızca kart alanı odaktayken cevabı açar (`Önceki`/`Sonraki`/sekme düğmelerini gasp etmez); cevap açıldığında odak `İyi` düğmesine, puanlama sonrası `Cevabı Göster`'e aktarılır.
6. **`CountdownBand` 60sn `aria-live` spam'i:** Dakikada bir güncellenen sayılar `aria-live` dışına alındı; yalnızca kullanıcı sınav sekmesini değiştirdiğinde duyuru yapan `data-cd-announce` eklendi ve `role="tablist"` yerine `role="group"` + `aria-pressed` kullanıldı.
7. **Tablet `768px` FSRS `<select>` kırpılması & mobil `44px` hedefler:** Kontroller `sm:grid-cols-2 xl:grid-cols-3`, hız düğmeleri `grid-cols-3 sm:grid-cols-6` yapıldı; `/yardim/[slug]/` içindekiler/rehber listesi, `#target-score` kaydırıcısı ve alt bilgi bağlantıları mobilde `>= 44px` dokunma yüksekliğine çıkarıldı.
8. **SSR ↔ Hidrasyon `aria-live` sessizliği:** `FsrsDoseCalculator.astro` ve `puan-hesapla.astro` başlangıç metinleri/SVG eğrileri SSR'da birebir hesaplanır; ilk yüklemede `aria-live="polite"` tetiklenmez.

---

## 4. Başka AI Ajanları İçin Çalışma ve Güncelleme Rehberi

### Günlük Komutlar
```bash
# 1. Bağımlılık kurulumu (ilk seferde)
cd website && npm ci

# 2. Geliştirme sunucusu
cd website && npm run dev

# 3. Üretim derlemesi + tam otomatik doğrulama
cd website && npm run build && npm run verify

# 4. Katalog veya referanslar.json değiştiyse verileri yenile
cd website && npm run data:build
# (FSRS simülatörü olan master/tusbud dalındaysan:)
cd website && npm run data:fsrs

# 5. Kök depo regresyon kontrolü (zorunlu)
npm run quality
```

### Tek Dosyadan Yönetilen İş/Pazarlama Ayarları
| Değişiklik | Dosya |
| --- | --- |
| WhatsApp numarası, App Store URL, e-posta, domain, `PUBLIC`, `SHOW_SPONSORS`, `SHOW_PRICING_PROMO`, `PRICING_MODE` (`'launch-promo'` / `'free-beta'`) | `website/src/config.ts` |
| Fiyat kartları, karşılaştırma tablosu, `freeBeta` modu, okul/kulüp programı | `website/src/data/offer.json` |
| Kurucu adı, TUS derecesi, fotoğrafı, mektubu ve 4 editöryal ilke | `website/src/data/founder.json` |
| 2027/2028 TUS tarihleri ve başvuru/sonuç takvimi | `website/src/data/exams.json` |
| Sponsor/iş birliği kayıtları (`SHOW_SPONSORS = true` ile açılır) | `website/src/data/sponsors.json` |
| SSS soruları ve kategorileri | `website/src/data/faqs.json` |
| Instagram kullanım kartları | `website/src/data/instagram.json` |

### Yayına Almadan Önce Kalan İçerik/Altyapı Adımları
1. `website/src/config.ts`: `905000000000` yer tutucu numarasını canlı WhatsApp Business hattıyla, `appStoreUrl` alanını canlı App Store linkiyle değiştirin.
2. `website/src/data/founder.json`: Kurucu hekimin gerçek adı, TUS derecesi ve portre görselini ekleyin.
3. `tusankim.com` DNS bağlandığında Vercel'de **Root Directory = `website`** olacak şekilde ayrı bir statik proje olarak yayınlayın (`website/vercel.json` güvenlik başlıklarını otomatik uygular).
4. Gerçek iPhone Safari + VoiceOver üzerinde kısa bir `BeforeAfter` kaydırma ve klavye/ekran okuyucu smoke testi yapın.

---

## 5. Doğrulama Kaydı (Son Durum)
- `cd website && npm run build && npm run verify`: `astro check` **0 hata / 0 uyarı / 0 ipucu**, **31 sayfa**, tüm WCAG/MWG/CSP/bütünlük kontrolleri yeşil.
- Canlı headless Chromium denetimi (`1440px`, `1024px`, `768px`, `375px`, `320px`): **0 JS hatası, 0 HTTP 4xx/5xx hatası, 0 yatay taşma, ilk yüklemede `scrollY === 0`, 0 WCAG AA kontrast ihlali (açılmış demo kartı dâhil), 0 mobil küçük dokunma hedefi.**
- Kök depo `npm run quality`: `tsc --noEmit` temiz, **3.374 Vitest testi geçti**, `verify:ios` geçti.
