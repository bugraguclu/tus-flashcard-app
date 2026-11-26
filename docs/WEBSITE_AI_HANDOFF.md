# TusAnkiM Web Sitesi — AI Ajanları İçin Teknik Devir ve Mimari Rehberi

> **Amaç:** Bu doküman, `website/` dizinindeki TusAnkiM tanıtım ve ürün web sitesinde **neyin, neden ve nasıl** yapıldığını başka yapay zekâ ajanlarının (Claude, Codex, Gemini, Antigravity vb.) ve geliştiricilerin tek seferde anlayıp kırmadan geliştirebilmesi için hazırlanmıştır.
>
> **Kısa sözleşme:** `website/AGENTS.md` · **Kök uygulama sözleşmesi:** `AGENTS.md`

## 25 Kasım 2026 — Sade görünüm (tüm sayfalar)

- Sahibinin uygulamada ve diğer projelerinde verdiği "yapay görünmesin" kararları siteye
  uygulandı. Yeni bölümlerde de geçerli kurallar: bölüm üstü etiket düz küçük yazıdır
  (nokta, büyük harf ve harf aralığı yok); gradyan, parlama ve kart gölgesi yok; düğmeler
  `.button-primary` / `.button-secondary` köşesindedir (hap biçimi yok); renkli zeminli
  rozet yerine düz renkli yazı; süs tiki yok; başlık sonunda nokta yok; kaydırınca belirme,
  çubuk büyümesi ve üzerine gelince yükselme animasyonu yok.
- Ana sayfa: tek renk hero başlığı, düz hero ve son çağrı zemini, kutusuz "Neden TusAnkiM"
  sütunları, çizgili plan bağlantıları, çerçevesiz Erişim metni, siyah KPI sayıları.
- Uygulama ekranını taklit eden `components/demo/` ve içerik menüsündeki bölüm
  bağlantıları bilerek değiştirilmedi.

## 24 Kasım 2026 — Kısa ana sayfa, kategorili menü, yeni alt sayfalar

- Ana sayfa 11 bölümden 6'ya indi (masaüstü ~8.400 px → ~4.700 px): Hero, canlı kart
  denemesi (`#demo-bolumu`), Neden TusAnkiM (`HomeWhy`), kartların çıkmış sorulara
  karşılığı (`HomeEvidence`: 4 KPI + tıklanabilir 11 branş satırı, tam tablo
  `/referanslar/` üzerinde), plan yönlendirmesi (`HomePlan`) ve erişim + 3 soru + son
  çağrı (`HomeClose`). 76/200 – 82/200 – `a78ae1f` ayrımı KPI'da korunur.
- Canlı deneme bölümü, tek kartlık `LiveCardDemo` yerine yeniden tablet çerçeveli
  `TabletDemo`'yu gösterir (deste listesi + çalışma ekranı, kartlar
  `/data/demo-decks.json`'dan). Ana sayfa HTML bütçesi bunun için 72 KB'tan 80 KB'a
  çıktı (~77 KB). `LiveCardDemo.astro` ve `demo-cards.json` şimdilik kullanılmıyor.
- Ayrıntı kendi sayfasına taşındı: `/ozellikler/` (Kısaca tanım listesi + Kronometre,
  FSRS-6, Anki aktarımı, puan hesaplayıcı; `components/features/`) ve `/fiyatlar/`
  (3 segment + kulüp programı; `components/pricing/PricingTiers.astro`). Kullanım
  rehberleri bölümü kaldırıldı (`/yardim/` karşılıyor); kurucu yazısı `/hakkimizda/`'da.
- Menü tek kaynaktan: `pages.ts` `NAV_GROUPS` (Ürün · TUS Hazırlık · Destek) +
  `NAV_LINK_IDS` (Hakkımızda). Masaüstünde açılır paneller (Escape, dış tıklama ve odak
  çıkışı kapatır), mobilde gruplu `<details>` çekmece, footer'da 4 sütun.
- URL: yalnız `/kurucu/` → `/hakkimizda/` (kök `vercel.json`, 301). Dün yayına giren
  anahtar kelime slug'larına ve `/rehber/`'e dokunulmadı; `/rehber/` görünür adı
  "TUS Yazıları" oldu ki Çalışma Rehberi ve Yardım Merkezi'yle karışmasın.
- `verify-search-output.mjs` artık kısa ana sayfa sözleşmesini (6 bölüm kimliği, alt
  sayfa bağlantıları, en fazla 8 `<section>`) ve yeni sayfaların içeriğini denetler;
  `verify-site.mjs` 60 HTML / 59 sitemap URL'si bekler.

## 23 Kasım 2026 — SEO/GEO sayfaları ve 3 segmentli erişim canlı sitede

- `tusbud_landing_page` (`d510c840`) dalındaki içerik, sahibinin onayıyla güncel siteye
  taşındı (eski site sürümü yerine konmadı): `/tus-cikmis-sorular-ve-analiz/`,
  `/tus-icin-ankimobile-alternatifi/`, `/tus-spot-bilgiler/`,
  `/tus-taban-puanlari-ve-kontenjan/` (`src/data/osymPlacement.ts`), 8 yazılık `/rehber/`
  (`src/data/rehber/`) ve 11 branş sayfası `/referanslar/<branş>/` (`src/data/branches.ts`).
  Ders ders net girişli `/puan-hesapla/`, canlıdaki iPhone klavye araç çubuğunu
  (`lib/scoreKeyboard.ts`, yalnız görünen alanlar) korur.
- Fiyat bölümü `src/data/offer.json` üç segmentini gösterir (₺0 ara ara reklam, ₺2.000 tüm
  kartlar, ₺50 reklam kaldırma). Güncel betada ücretli seçenekler ve reklamlar devrede
  değildir; bu cümle `offer.json`, `config.ts` `ACCESS`, SSS ve `llms*.txt` içinde korunur.
  Uygulama içi Yardım (`docs/user-guide/`) bu modele göre değiştirilmedi: uygulamada henüz
  ₺2.000 satın alma veya reklam yok.
- Yeni sayfalarda imza “Hazırlayan: TusAnkiM”dır; adı geçen bir hekimin incelediği iddiası
  ve `Person` yazar şeması bilerek taşınmadı (`founder.json`: hekim editör onayı sürüyor).
- Her sayfanın kendi sosyal kapağı vardır: `npm run assets:build` yeni sayfaları,
  branşları ve rehber yazılarını da üretir. `verify-site.mjs` 58 HTML / 57 sitemap URL'si
  bekler; kimlik kontrolü artık `data-*-id` özniteliklerini kimlik saymaz.
- Ham arama talebi araştırması (`research/tus-search-demand/`) yorumcu adları içerdiği için
  herkese açık repoya alınmadı; repo dışında, temizlenmiş kopyasıyla paket olarak saklanır.

## 21 Kasım 2026 — Alt sayfaların okuma düzeni

- Referans kayıtları ince ayraçlı satırlara dönüştü. Filtreler ayrı bir alanda;
  eşleşme türü, açıklama ve katalog kimliği aynı hiyerarşide gösterilir. Tam veri
  yüklenemezse 24 statik örnek ve seçili filtreler kalır. HTTP/veri kontrolü ve
  zaman aşımı sonrası “Yeniden dene” aynı filtrelerle çalışır; klavye odağı korunur.
- 21 rehber `website/src/data/help-intros.ts` üzerinden kısa açıklama, üç başlangıç
  adımı, gerekli veri uyarısı ve üç ilgili rehber alır. Kaynak Markdown içerikleri
  korunur; ayrıntılar 2–5 konu grubunda yerel `details` ile açılır. Mobilde yazıdan
  önce 27 başlık sıralanmaz; her sayfada tüm rehberlerin tekrarı kaldırıldı.
  Eski bölüm bağlantıları doğru grubu açar. Yazılmış sabit kimlikler ile otomatik
  başlık kimliklerinin çakışması önlendi. Çalışma rehberinde depodaki gerçek iPhone
  görüntüsü isteğe bağlı açılır; önceki sürüme ait olduğu açıkça yazılır.
- Ürün SSS’si `/sss/`, teknik sorun giderme `/yardim/sss/` olarak ayrılır.
  Gereksiz sekme/arama popover’ı yerine kategorili soru listesi ve yerinde arama
  kullanılır. FSRS–SM-2 karşılaştırması doğrudan yanıtlandı. SSS, gizlilik ve
  koşullarda sen dili kullanılır. Yedi günlük iade vaadi site metinlerinden ve
  pazarlama taslaklarından kaldırıldı. Koşullardaki beta ve planlanan ₺50/ay bilgisi
  `ACCESS` kaynağından okunur; ücretli erişim başlamış gibi sunulmaz.
- Astro build: 31 sayfa, 0 hata/uyarı/ipucu. Website verify: beş test, tüm HTML,
  bağlantı hedefleri, benzersiz kimlikler, şema/sitemap ve referans verisi başarılı.
  21 rehberin tüm ayrıntıları 320px’de açılarak yatay taşma kontrol edildi; temel
  alt sayfalar 320/390/1280px’de taşmıyor ve olağan yüklemede kaymıyor. Referans
  HTTP 503 → yeniden deneme, filtre birlikteliği, SSS arama/boş sonuç, klavye ile
  açma, bölüm bağlantıları ve mobil menü kontrol edildi. Fiziksel iPhone ve
  VoiceOver kontrolü yapılmadı.
- Kök `npm run quality` mevcut `lib/studyPlanWizardScreen.test.ts` dosyasındaki
  84/95/101/103/105 TS2769 hatalarında durur; bu tur uygulama kodunu değiştirmez.
- Tek dosyalık önce/sonra karşılaştırması:
  `output/website-alt-pages-2026-11-21/once-sonra.html` (26 sayfa, 104 gerçek
  masaüstü/mobil ekran görüntüsü; önce sürümü `52b4c29b`).

## 21 Kasım 2026 — İstenen ürün bölümleri geri eklendi

Kullanıcının içerik düzeltmesiyle ana sayfa genişletildi. Önceki sade tasarım ve
Grup 3 veri/arama iyileştirmeleri korunur; aşağıdaki notlar güncel içerik sırasıdır.

- Ana sayfa: kısa ürün tanıtımı ve çalışan kart örneği, referans özeti, TUS hazırlık
  ve tercih ekosistemi, FSRS-6 / Kronometre / Anki açıklamaları, kuruluş hikâyesi,
  erişim ve cihazlar, kullanım rehberleri ve Instagram bağlantısı.
- Yeni parçalar `components/home/` içinde: `HomeEcosystem`, `HomeStudy`,
  `HomeAccess`, `HomeGuides`. Ekosistem sade bağlantı listesi kullanır. Tercih
  simülasyonu mevcut bir araç gibi sunulmaz; hazırlanmakta olduğu açıkça yazılır.
- Özellik örnekleri statik HTML/CSS’tir; canlı hesap, çalışan kronometre veya
  gerçek oturum verisi gibi gösterilmez. Başarı yüzdeleri, rakip fiyatları,
  unutma süresi iddiaları, yapay Instagram gönderileri ve yeni kaydırıcı yoktur.
- “Bir kere satın al” bölümünün işlevi geri geldi; kullanıcı mevcut beta ve fiyat
  bilgisinin korunmasını seçti. Bu nedenle tek seferlik satın alma veya tüm
  cihazlara otomatik erişim vaadi eklenmez. Güncel ücretsiz beta ve planlanan
  ₺50/ay metni, `ACCESS` ve mevcut uygulama şemasıyla aynı kaynaktan okunur.
  Kişisel destelerin dosyayla taşındığı, otomatik eşitlemenin olmadığı ve hazır
  TUS paketi ilerlemesinin cihazlar arasında aktarılamadığı belirtilir.
- `WhatsAppSupport.astro` geri eklendi. `config.ts` içindeki `WHATSAPP.enabled`
  `false`, URL boştur. Gerçek kanal URL’si ayarlanıp açıkça etkinleştirilmedikçe
  arayüze veya yapılandırılmış veriye WhatsApp bağlantısı çıkmaz.
- SSS yalnızca `/sss/` üzerindedir; üst menüye SSS bağlantısı eklendi. Ana sayfa
  soru listesini veya FAQPage şemasını çoğaltmaz.
- Eklenen içerikle HTML 29.328 bayt / 293 öğe oldu. Statik HTML bütçesi, bu açık
  kapsam değişikliği için 24 KB’den 32 KB’ye güncellendi; DOM sınırı 1.300,
  dış demo verisi ve metadata kontrolleri korunur. Yeni bölümler çalışma zamanı
  JavaScript’i veya ağdan yüklenen sosyal medya bileşeni eklemez.
- Astro derleme 31 sayfa, 0 hata/uyarı/ipucu. `npm run verify`: 31 HTML sayfası,
  30 sitemap URL’si, 56 arama girdisi, 1.195 referans kaydı ve içerik tarih testi
  başarılı; istenen bölümler ve gizli WhatsApp koşulu doğrulandı. Kök `npm run quality`, önceden mevcut
  `studyPlanWizardScreen.test.ts` 84/95/101/103/105 TS2769 hatalarında durur.
  Bu oturumda yerel tarayıcı erişimi yoktu; yeni düzenin görsel tarayıcı ve fiziksel
  iPhone / VoiceOver kontrolü yapılmadı.

## 21 Kasım 2026 — Grup 3: hız ve arama görünümü

Bu tur yalnızca raporun Grup 3 kapsamını tamamlar; önceki yerel sadeleştirme korunur.
Başlangıçtaki ana sayfa 31.119 bayt HTML ve 173 öğeydi; eski rapordaki 285,9 KB /
2.236 öğelik sürüm artık çalışma ağacında bulunmuyordu. Son çıktı 20.127 bayt ve
173 öğedir (HTML boyutunda %35,3 azalma). Ağır referans sekmeleri ve çalışma dozu
bölümü önceki sadeleştirmede kaldırılmıştı; yeniden eklenmedi.

- Demo kartlarının tüm verisi `data-cards` HTML özniteliğinden çıkarıldı. Statik
  `/data/demo-cards.json`, yalnızca istemcinin kullandığı 11 kart alanını sunar.
  İlk soru JavaScript olmadan okunabilir; veri isteği başarısız olursa yeniden deneme
  ve referans bağlantısı görünür. Kart açma, ders seçimi, değerlendirme ve klavye korunur.
- Ana sayfa/hesaplayıcı başlıkları zaten kısaydı. Uzun yardım başlıkları 58 karaktere
  sığmıyorsa yalnızca `| TusAnkiM` son eki kullanılır; görünür yazı başlığı değişmez.
  Temel kavramlar ve destek açıklamaları genişletildi, referans açıklaması kısaltıldı.
  Tüm indekslenebilir sayfalar 58 karakter başlık ve 90–160 karakter açıklama kapısından
  geçer; ana sayfa, hesaplayıcı ve temel kavramlar için açıklama hedefi 120–155’tir.
- Ana sayfaya BreadcrumbList ve SoftwareApplication eklendi: yayıncı, özellikler,
  yardım bağlantısı ve depodaki gerçek iPhone çalışma ekranı kaydı kullanılır.
  Ekran görüntüsü yalnızca bağlantı açıldığında indirilir. Ücretsiz beta aktif tekliftir;
  ₺50/ay planı henüz başlamamış lansman açıklamasıdır. Görünür lansman açıklaması ve
  JSON-LD aynı `ACCESS` metnini kullanır; ücretli erişim başlamış gibi gösterilmez.
  Şemadaki ekran görüntüsü, depodaki `docs/app-store/screenshots/02-kart-soru.jpg`
  dosyasının değiştirilmemiş kopyasıdır; ilk yüklemede indirilmez.
- Destek ContactPage; gizlilik ve koşullar WebPage olarak tanımlanır. Dataset,
  2024/2026 kapsamını ve görünür JSON indirme bağlantısını içerir. Hesaplayıcı ile
  21 TechArticle, Organization yazarı/yayıncısı ve içerik geçmişinden tarih alır.
  Kişisel hekim kimliği bu turun kapsamında değildir.
- Tarih alanlarının çalışması için ortak git yardımcısı depo kökünden sorgular;
  bu düzeltme mevcut sitemap tüketicisine de yansır. Yayın tarihi ilk kayıtlı içerik
  revizyonu, güncelleme tarihi son bilinen kaynak değişikliğidir. Gerçek canlıya çıkış
  tarihi veya derleme günü uydurulmaz. Sığ kopyanın belirsiz sınır tarihleri atlanır;
  bu durumda doğrulama tam git geçmişi ister. İç içe çalışma dizini, sığ kopya,
  geçmişin tamamlanması ve geçmişsiz dizin bir geçici git deposuyla test edilir.
- 404 için canonical, Open Graph, Twitter ve tüm JSON-LD kaldırıldı; noindex korunur.
  Ana sayfada uzun SSS tekrarları yoktur; `/sss/` tam soru listesini korur ve ana
  sayfadan “Tüm sorular” bağlantısı alır.
- `verify-search-output.mjs`, boyut/DOM bütçesini, başlık/açıklamaları, JSON-LD’yi,
  fiyat metni uyumunu, SSS’nin tamlığını ve dış demo verisini `npm run verify` içinde denetler.

Doğrulama: `website` build 0 hata/uyarı/ipucu; verify 31 HTML / 30 sitemap URL’si
ve git tarih regresyonu başarılı. Üretim çıktısında yerel Chrome 1440, 390 ve 320px:
yatay taşma ve başlangıç kayması yok; cevap, değerlendirme, ders seçimi, Space tuşu
ve başarısız veri isteğinden yeniden denemeyle dönüş başarılı; JS hatası yok.
Fiziksel iPhone/VoiceOver çalıştırılmadı. Kök testler 3.535 başarılı / 5 atlanan;
`verify:ios` ve `check:budgets` başarılı. Kök `npm run quality`, önceden mevcut
`lib/studyPlanWizardScreen.test.ts` 84/95/101/103/105 TS2769 hatalarında durur.

Şema kaynakları: [SoftwareApplication](https://schema.org/SoftwareApplication),
[Dataset](https://schema.org/Dataset), [TechArticle](https://schema.org/TechArticle).

## 21 Kasım 2026 — Güncel sadeleştirme

Aşağıdaki ilk kurulum kaydı tarihsel bağlamdır. Güncel site, TusAnkiM’in beyaz
kartlarını, açık gri yüzeylerini, ince ayraçlarını ve yeşil eylem rengini kullanır.
Yemek Takibi’nin kısa tanıtımı ve ferah iki sütunlu yerleşimi, Belif’in içerik
hiyerarşisi referans alındı. Ticari font ve marka görseli alınmadı.

- Ana sayfanın statik kart görseli ve ayrı demo bölümü tek çalışan kart örneğinde
  birleştirildi. Ders seçimi yerel `<select>` ile yapılır; 11 kart, cevap açma,
  dört değerlendirme, önceki/sonraki, klavye ve referans bağlantısı korunur.
  Önceden hesaplanan aralıklar canlı FSRS hesabı gibi sunulmaz; deneme yanıtları saklanmaz.
- Ana sayfa ürün tanıtımı, üç kısa özellik, ayrı referans özeti ve beta erişiminden
  oluşur. Güncel ücretsiz beta ve planlanan ücretli lansman açıkça ayrılır.
- Menü ve alt bilgi kısaltıldı. Referanslar / Puan Hesapla / Yardım üst menüdedir;
  diğer sayfalar alt bilgidedir. Mobil menü yerel diyalogla açılır.
- Referans gezgininde kutular ve tekrarlanan rozetler azaltıldı. Doğrudan / Dolaylı /
  Konu Kapsamı, 76/200 sınav öncesi ve 82/200 güncel katalog ayrımı, editör onay durumu,
  filtreler ve URL kapsamı korunur.
- Yardım merkezi sade bağlantı listesi kullanır. Hakkımızda ve SSS metinleri kısaltıldı;
  doğrulanmamış uzmanlık, performans ve başarı vaatleri çıkarıldı. Destek sayfası gerçek
  e-posta ve GitHub kanallarını gösterir; örnek WhatsApp numarası kaldırıldı.
- Puan hesaplayıcısının hesabı ve %5 kesinti kontrolü korunur. Geri sayım, dekoratif
  adımlar, henüz çalışmayan tercih simülasyonu kutusu ve kart çalışma reçeteleri çıkarıldı.
- Kullanılmayan `BeforeAfter`, `StoryBands`, `FsrsDoseCalculator`, `InstagramRail`,
  `SponsorsBand`, `DragScroll`, `CountdownBand`, `ReferenceShowcase`, `Scroller`,
  `SearchModal`, `SocialLinks` ve `FAQ` sarmalayıcısı kaldırıldı. SSS’nin kullandığı
  `FaqTabs` korunur. Sekme maskeleri ve gereksiz açılma animasyonları kaldırıldı.
  Tüketicisi kalmayan tanıtım SVG’leri, teklif/sponsor/Instagram/sınav verileri ve
  FSRS simülatörünün ön hesaplama betiği/verisi kaldırıldı. Paylaşım görseli sadeleştirildi.
- Derleme: 31 sayfa, 0 Astro hata/uyarı. `npm run verify`: 31 HTML sayfası, 30 sitemap
  URL’si, 56 arama girdisi ve 1.195 referans kaydı başarılı.
- Üretim çıktısında masaüstü ve 320px/390px düzen; kart açma, değerlendirme ve ders
  değiştirme; referansların sınav/ders/arama birlikte filtrelenmesi; hesaplayıcı girişleri,
  %5 kesinti ve geçersiz toplam uyarısı; yardım araması ve mobil menü kontrol edildi.
  Ana sayfa ve temel alt sayfalar 320px’de yatay taşmaz, ilk yükleme `scrollY=0`.
  Fiziksel iPhone / VoiceOver kontrolü yapılmadı.
- Kök `npm run quality`, önceden mevcut `lib/studyPlanWizardScreen.test.ts` satır
  84, 95, 101, 103 ve 105 üzerindeki `act` callback / `Promise<VitestUtils>` TS2769
  hataları nedeniyle tip kontrolünde durdu. Site değişiklikleri uygulama koduna dokunmaz.


---

## 1. Özet: Ne Yaptık?

Ana Expo / React Native uygulamasından tamamen izole, sıfır çalışma zamanı çatısı (no React/SPA runtime bloat) içeren, **Astro 7 + Tailwind CSS 3** tabanlı statik bir web sitesi (`website/`, **31 statik HTML sayfası**) inşa edildi.

### Oluşturulan Sayfalar ve Özellikler
| Rota | Dosya | İşlev |
| --- | --- | --- |
| `/` | `website/src/pages/index.astro` | Ana sayfa: Hero, 4'lü doğrulanmış kanıt şeridi (Belif `.stat-row`), 2027 TUS canlı geri sayım, 11 derslik kayıt gerektirmeyen canlı kart demosu (`#demo`), sınav/ders bazlı referans çubukları (`#referans-ozet`), gerçek `FSRS-6` günlük çalışma dozu simülatörü (`#calisma-dozu`), TUS ekosistemi, `StoryBands` (FSRS-6 / Kronometre / Anki uyumu), Fotoğraf Düzenleyici & Görsel Gizleme `BeforeAfter` kaydırıcı, Kurucu özeti, `PRICING_MODE` kontrollü fiyatlandırma & karşılaştırma tablosu, okul/kulüp ücretsiz hesap çağrısı, Instagram kullanım rayı, `SHOW_SPONSORS` kontrollü sponsorluk bandı, 7/24 WhatsApp bandı + kayan düğme, sekmeli SSS. |
| `/referanslar/` | `website/src/pages/referanslar.astro` | Son 6 TUS (`2024/1–2026/2`, **1.195 soru**) için JSON destekli (`public/data/references.json`) canlı referans gezgini. Sınav, 11 ders, rozet (`Doğrudan`/`Dolaylı`/`Yalnız Konu`/`Yok`), sınav öncesi `git a78ae1f` süzgeci, serbest metin arama, URL query senkronu ve sınav sonrası güncellenen 6 sorunun şeffaf açıklaması. |
| `/puan-hesapla/` | `website/src/pages/puan-hesapla.astro` | İnteraktif TUS Puan & Hedef Net Hesaplayıcı (Temel 100 + Klinik 100, 4 yanlış 1 doğru, güncel yönetmelik **`%5 Puan Kesintisi Uygula`** anahtarı, Klinik `%40/%60` ve Temel `%60/%40` ağırlık, 45 baraj kontrolü, tersine hedef puan net planlayıcı + 4 adımlı TUS tercih rehberi). |
| `/hakkimizda/` (eski `/kurucu/`, 301) | `website/src/pages/hakkimizda.astro` | Kurucumuzun yazısı, 4 editöryal kalite standardı ve veri kaynağı `website/src/data/founder.json`. |
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
   - Puan ağırlıkları: **Klinik (K) = `%40 Temel + %60 Klinik`**, **Temel (T) = `%60 Temel + %40 Klinik`** (ÖSYM 2026-TUS 2. Dönem Başvuru Kılavuzu, 4.2).

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

### Vercel yayını

Kök Vercel projesi `master` dalından iki statik siteyi derler. Tanıtım sitesi
`https://tusankim.vercel.app/` adresinde, Expo uygulaması aynı alan adındaki
`/uygulama/` yolunda açılır. Eski uygulama bağlantıları yeni yola yönlenir.
Tarayıcı koleksiyonları aynı origin'deki IndexedDB'de kalır. PWA manifesti ve
service worker güncelleme adresi kökte kalır, çevrimdışı uygulama dosyaları
`/uygulama/` altında önbelleğe alınır. Kök yapılandırmanın `buildCommand`
komutu yerel dağıtım çıktısını da üretir.

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
