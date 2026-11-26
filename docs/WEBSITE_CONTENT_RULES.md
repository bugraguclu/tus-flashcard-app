# TusAnkiM Web Sitesi — İçerik Şeması, Yazım Dili ve Arka Plan Kanıt Sözleşmesi

> **Kapsam:** `website/src/data/rehber/` altındaki tüm **TUS Yazıları** (`/rehber/`) ve sitenin içerik sayfaları için bağlayıcı editöryal sözleşme. Bu belgedeki bakım listesi, doğrulama kayıtları, bilinen yanlışlar ve iç etiketler **arka plan bilgisidir**; okura görünen sayfalara yazılmaz.
>
> Yeni yazı eklemeden ya da bir yazıyı değiştirmeden önce bu belgenin tamamını oku. Bir olguyu değiştiriyorsan §4'teki kanıt kaydını da aynı değişiklikte güncelle.

---

## 1. Görünür metin ile arka plan ayrımı

Okura görünen metinde editöryal not, yapılacak iş veya iç strateji etiketi bulunmaz.

- **Yasak:**
  - *"2027 kılavuzu çıkınca bu sayfa güncellenecek"*, *"henüz yayımlanmadı"*, *"yeniden kontrol edilip güncellenecek"* gibi bakım vaatleri.
  - `[DOĞRULA: ...]` gibi taslak işaretleri.
  - `Markalı`, `Yumuşak`, `Markasız` etiketleri. Veri dosyasında `tone` alanında kalabilir, arayüzde basılmaz.
  - *"siz"* dili (*"Ne yapabilirsiniz?"*, *"yapabilirsiniz"*).
- **Doğru kullanım:**
  - Her resmî kuralın yanına dönemini doğal biçimde yaz: *"2026-TUS 2. dönem kılavuzuna göre..."*
  - `boundaryNote` kalıcı bir sınır cümlesidir: *"Kesin tarih ve kurallar için ilgili dönemin ÖSYM kılavuzu esas alınmalıdır."*
  - Bekleyen güncellemeler yalnızca bu belgenin §5.1 listesinde durur.

---

## 2. Yazı şeması ve arama/yapay zekâ yapısı

Her yazı aynı sırada ilerler. Yeni ve revize yazılarda (sıra ≥ 9) ana gövde **600–900 kelime** olur (tablo dâhil, SSS hariç).

1. **Soru başlığı (`questionH1`):** Adayın arama kutusuna yazdığı doğal soru. Cümle düzeni (yalnız ilk harf ve özel adlar büyük), ≤ 75 karakter.
2. **Doğrudan cevap (`directAnswer`):** İlk 2–3 kısa cümle soruyu bağlamsız yanıtlar. Evet/hayır sorusunda ilk sözcük **Evet** ya da **Hayır** olur. Sayfada `#hizli-cevap` olarak basılır ve `SpeakableSpecification` ile işaretlenir.
3. **Neden böyle sanılıyor? (`whyMisconceived`):** 2–3 kısa paragraf; adaylar arasındaki yanlış inanışlar kendi cümlelerimizle.
4. **Doğrusu (`truthParagraphs` + `table`):** 3–4 paragraf ve bir tablo. Her olgusal iddianın yanında dönemi, ilk geçtiği yerde satır içi kaynak bağlantısı olur. Tabloda metinde dayanağı olmayan sayı bulunmaz.
5. **Ne yapmalısın? (`actionSteps`):** 3–5 somut, bugün uygulanabilir adım, sen diliyle. Başlığı şablon basar.
   - **SSS (`faq`, isteğe bağlı):** 3–5 gerçek arama sorusu; her yanıt 1–3 cümle, ilk cümle cevabın kendisi. `<details>` akordeonu ve `FAQPage` JSON-LD olarak basılır.
6. **Sınır uyarısı (`boundaryNote`):** 1–2 cümle. Tıbbi tanı, tedavi ya da doz tavsiyesi vermez.
7. **Kaynaklar (`sources`):** En az 2 kaynak. Resmî belge, hakemli makale ya da sitemizin açık veri sayfası. Kendi sayfalarımız **site içi göreli yolla** yazılır (`/referanslar/`), mutlak `tusankim.com` adresiyle değil; şablon JSON-LD `citation` alanında bunları sitenin adresine çevirir.
8. **İlgili yazılar ve araçlar (`relatedLinks`):** 3–4 site içi bağlantı. Şablon sona "Tüm TUS yazıları" bağlantısını kendisi ekler.

### Tarihler
- Her yazı `published` (ilk yayın) ve `updated` (son içerik değişikliği) ISO tarihlerini taşır. `datePublished`, `dateModified`, sayfadaki "Son güncelleme" ve sitemap `lastmod` bu alanlardan gelir.
- Bir yazının metnini, tablosunu, SSS'sini ya da kaynaklarını değiştiren **o yazının** `updated` alanını o güne çeker. Başka yazıların tarihine dokunulmaz.
- Tarih kuralı: `published ≤ updated ≤ bugün`.

### Meta ve görsel
- `seoTitle`: en fazla **58 karakter** (` | TusAnkiM` dâhil), cümle düzeni, ana ifade başta. OG kapağı bu başlıktan `npm run assets:build` ile üretilir.
- `seoDescription`: **90–160 karakter**, ilk cümle cevabın kendisi, en az bir somut sayı.
- `category`: `Sınav ve Takvim`, `Tercih ve Yerleştirme`, `Çalışma Planı`, `Ders ve Soru Analizi`, `FSRS-6 ve Uygulama`.
- Görünüm 25 Kasım 2026 sade görünümüne uyar (`docs/WEBSITE_AI_HANDOFF.md`): hap/çip yok, renkli zeminli kutu yok, tablolar yalnız `border-y`, bölümler ince `border-t` ayraçla ayrılır, bağlantılar `text-link`. `/rehber/` konu başlıklarına bölünür; JavaScript filtre yoktur.
- Erişilebilirlik: WCAG 2.2 AA renk tokenları (`teal #0e7469`, `ink #24292c`, `inkMuted #596166`), 44 px dokunma hedefi (`min-h-[2.75rem]`).

### Örtüşme kuralı
- İki yazı aynı aramayı hedeflemez. Yeni bir yazı mevcut bir yazının sorusunu yanıtlıyorsa ayrı sayfa açma; bilgiyi mevcut yazının gövdesine ya da SSS'sine ekle.
- 26 Kasım 2026'da taslaktaki "2027 TUS ne zaman? Duyurular" yazısı bu yüzden `2027-tus-tarihleri-ve-calisma-plani` SSS'sine katıldı. "Branş branş konu dağılımı" yazısı "Hangi dersten kaç soru çıkar?" ile çakıştığı için kart desteğine odaklanan `tus-ders-ders-kart-destegi` oldu.

---

## 3. Yazım dili (sitenin geri kalanıyla aynı)

- **Hitap:** Her yerde **sen**. Kendimizden **biz** diye söz ederiz. *"Siz"*, *"adaylarımız"*, *"değerli hekimler"* yok.
- **Cümle:** Kısa, cümle başına tek fikir, yeni ve revize yazılarda **≤ 25 kelime**.
- **Ton:** Sakin, somut, veriye dayalı. Ünlem, emoji, espri, slogan, büyük harfli vurgu yok.
- **Yasak sözcük ve kalıplar:**
  - Boş fiiller: *sunar, sağlar, imkân tanır, olanak verir, öne çıkar, gerçekleştirilir*.
  - Dolgu: *kapsamlı, eksiksiz, modern, yenilikçi, güçlü, eşsiz, en iyi, başarıya giden yol, altın öneri, hayalindeki branş*.
  - Kalıplar: *"Bu sayede"*, *"Böylece"*, *"Kısacası"*, *"Unutma ki"*, `&`, kaynaksız net artışı ya da başarı vaadi.
- **Telif, marka, dürüstlük:**
  - ÖSYM soru kökü, şıkları ya da soru metni yazılmaz.
  - Kişi adı yazılmaz; imza `TusAnkiM`. Bağımsız hekim editör onayı tamamlanana kadar `Person` ya da `reviewedBy` şeması eklenmez.
  - Fiyat geçerse ücretsiz beta durumu ve *"ücretli seçenekler ve reklamlar henüz devrede değil"* cümlesi zorunludur.
  - Anki'den söz edilirken bağımsızlık beyanı korunur; Anki kötülenmez.
  - `Doğrudan`, `Dolaylı` ve `Konu Kapsamı` sınıfları karıştırılmaz; bunun yapay zekâ destekli ön değerlendirme olduğu ve hekim editör onayının tamamlanmadığı yazılır.
  - Bilimsel bir genelleme (aralıklı tekrar, aktif hatırlama) yalnızca onu gerçekten gösteren kaynağa bağlanır. FSRS'nin ACM KDD '22 makalesi bir zamanlama optimizasyonu çalışmasıdır; "yeniden okuma işe yaramaz" iddiasının kaynağı değildir.

---

## 4. Doğrulanmış kanıt kayıt defteri

Son doğrulama: **26 Kasım 2026**. Belgeler tam metin okunarak doğrulandı (ÖSYM PDF'leri `curl` ile değil, indirilip PDFKit ile okundu).

### 4.1 Resmî belgeler

| Kısaltma | Belge | Adres | Dayanak |
| --- | --- | --- | --- |
| **[K-2026/2]** | ÖSYM 2026-TUS 2. Dönem Başvuru Kılavuzu (3 Temmuz 2026) | `https://dokuman.osym.gov.tr/web/2026/7/basvuru-kilavuzu-rn15c8-30102957.pdf` | Bkz. §4.2 |
| **[T-2027]** | ÖSYM 2027 Yılı Sınav Takvimi (28 Ekim 2026) | `https://dokuman.osym.gov.tr/web/2026/10/osym-2027-yili-sinav-takvimi-7d09wi-28090734.pdf` | 2027-TUS 1: başvuru 2–10 Şubat, geç 17 Şubat, sınav 27 Mart, sonuç 22 Nisan (planlanan). 2027-TUS 2: başvuru 5–13 Temmuz, geç 22 Temmuz, sınav 22 Ağustos, sonuç 16 Eylül (planlanan) |
| **[RG-2022]** | Tıpta ve Diş Hekimliğinde Uzmanlık Eğitimi Yönetmeliği (3 Eylül 2022, Sayı 31942) | `https://www.resmigazete.gov.tr/eskiler/2022/09/20220903-2.htm` | md. 12/4 dil şartı (kılavuz 1.4 ile aynı); md. 13/3 puan kesintisi |
| **[RG-2024]** | Yönetmelik değişikliği (16 Mayıs 2024, Sayı 32548) | `https://www.resmigazete.gov.tr/eskiler/2024/05/20240516-1.htm` | MADDE 1: md. 13/3'teki "% 2" → "% 5"; yayımı tarihinde yürürlükte |
| **[OSYM-DIL]** | ÖSYM Yabancı Dil Sınavları Eşdeğerlikleri | `https://www.osym.gov.tr/esdegerlikler` | Denk uluslararası belgeler. Sayfalarda sabit eşdeğer puan yazılmaz |
| **[OSYM-ARSIV-1/2]** | ÖSYM TUS çıkmış sorular, 1. ve 2. dönem | `https://www.osym.gov.tr/SinavGrubu/Menu/1889` · `.../1892` | ÖSYM duyuruları "Temel Soru Kitapçıklarının Yayınlanması (% 10)" başlığını taşır: soruların %10'u yayımlanır |
| **[OSYM-YER-26-2]** | 2026-TUS 2. Dönem Yerleştirme En Büyük/En Küçük Puanlar (16 Ekim 2026) | `https://dokuman.osym.gov.tr/web/2026/10/2026-tus-2donem-yerlestirme-sonuclarina-liskin-en-buyuk-ve-en-kucuk-puanlar-genel-yabanci-uyruklu-uzp3a0-16132230.pdf` | 2.941 program, 8.637 kontenjan, 7.625 yerleşen (%88,3), 1.013 boş (satırlar toplanarak doğrulandı) |
| **[OSYM-EK-26-2]** | 2026-TUS 2. Dönem ek yerleştirme duyuruları (20 ve 23 Kasım 2026) | `https://www.osym.gov.tr` (TUS 2. Dönem duyuruları) | Ek tercih 20–26 Kasım 2026. 23 Kasım düzeltmesi: Koç Üniversitesinin yanlışlıkla bildirdiği 14 program (26 kontenjan) çıkarıldı. **Güncel: 774 program, 1.416 kontenjan (1.261 Genel + 155 YU)** |
| **[OSYM-EK-26-1]** | 2026-TUS 1. Dönem Ek Yerleştirme (2 Temmuz 2026) | `https://dokuman.osym.gov.tr/pdfdokuman/2026/TUSDONEM-1/EK/ek_minmax02072026.pdf` | 901 program, 2.450 kontenjan, 603 yerleşen (%24,6) |
| **[OSYM-PORTAL]** | ÖSYM duyuruları ve AİS | `https://www.osym.gov.tr` · `https://ais.osym.gov.tr` | 2026-TUS 2 kronolojisi: sınav 23 Ağustos, sonuç 17 Eylül, tercih 30 Eylül–7 Ekim, yerleştirme 16 Ekim, ek tercih 20–26 Kasım 2026 |

### 4.2 [K-2026/2] kılavuzundan doğrulanmış kurallar

- **Ücret:** Temel Tıp Bilimleri 2.500 TL, Klinik Tıp Bilimleri 2.500 TL (test başına). Geç başvuru gününde %50 artırımlı ve aynı gün ödenir; aynı gün ödemeyenin başvuru bilgileri silinir. Ücret yatırmayanın başvurusu iptal edilir.
- **Başvuru:** 2026/2 başvuru 8–16 Temmuz, geç başvuru 24 Temmuz 2026. AİS (`ais.osym.gov.tr`) ya da ÖSYM Aday İşlemleri Mobil Uygulaması. Geçerli fotoğraf: T.C. kimlik kartı fotoğrafı ya da son 50 ayda başvuru merkezinde çekilmiş fotoğraf. Kılavuz yalnızca "katılmak istenen oturum/oturumlar seçilecektir" der; iki oturum zorunluluğu yazmaz.
- **Sınava giriş şartı (1.4):** Sınav tarihi itibarıyla diplomanın tescil edilmiş olması.
- **Oturumlar (1.3):** Temel 10.15, Klinik 14.45; her biri 100 soru, 135 dakika. Son giriş 10.00 / 14.30. Binada en az 1 saat önce bulunulur. İlk 100 dakika ve son 15 dakika salondan çıkılmaz; çıkan geri alınmaz.
- **Kimlik:** Fotoğraflı nüfus cüzdanı, fotoğraflı T.C. kimlik kartı ya da süresi geçerli pasaport. Soğuk damga şartı **nüfus cüzdanı** içindir. Ehliyet, meslek ve öğrenci kimliği geçmez.
- **Eşya:** Hiçbir eşya emanete alınmaz. Su yalnızca etiketi sökülmüş şeffaf pet şişede. Kurşun kalem, silgi, kalemtıraş ÖSYM'den. Her türlü saat, alyans dışı takı, cüzdan, yiyecek, kutuda ilaç yasak.
- **Giriş belgesi:** Sınavdan yaklaşık 10 gün önce, her oturum için ayrı.
- **İtiraz:** Sorulara 3 iş günü, sonuçlara 10 gün.
- **Puanlama (4.2):** 4 yanlış 1 doğruyu götürür. K = 0,4 Temel + 0,6 Klinik; T = 0,6 Temel + 0,4 Klinik (standart puanlar üzerinden).
- **Tablo 1B:** Temel: Anatomi 13, Fizyoloji 7, Histoloji-Embriyoloji 8, Biyokimya 18, Mikrobiyoloji 18, Patoloji 18, Farmakoloji 18. Klinik: Dahiliye grubu 35, Pediatri 25, Cerrahi grubu 30, Kadın Doğum 10. "Yaklaşık %5 güncel sağlık konuları" yıldızı **yalnızca Klinik teste** aittir. Küçük Stajlar için ayrı satır yoktur.
- **Yabancı dil (1.4, 5.3, 5.6):** İngilizce, Fransızca ya da Almanca; YDS, Sağlık Bakanlığı ya da YÖK'ün yaptığı/yaptırdığı sınav (kılavuz Bakanlık sınavı olarak TÖMER TIPDİL'i anar) veya ÖSYM'nin denk saydığı uluslararası belgeden en az 50. Sonuç dil sınavı tarihinden itibaren 5 yıl geçerli; bitiş hesabında TUS başvurusunun ilk günü esas alınır. Sınava girmek için aranmaz; yerleştirme ve ek yerleştirme için aranır, tercih aşamasında kontrol edilir; şartı sağlamayanın ataması yapılmaz. Uluslararası belge dilekçeyle tercihin son günü 12.00'ye kadar ÖSYM'ye ulaşmalı. Bakanlık sınavı sonucu tercihten önce kurumca ÖSYM'ye bildirilmeli; iki sınavda kullanılan kimlik numarası aynı olmalı.
- **Tercih (5.4, 5.5, 5.8):** En fazla 30 tercih; süre bitene kadar değiştirilebilir. İstenen puan türünde 45 ve üzeri. Eşit puanda programı daha üst tercihinde gösterene öncelik; puan ve tercih sırası aynı olanlar birlikte yerleştirilir.
- **Kayıt:** Sonuç ilanından bir iş günü sonra başlayan 10 iş günü (ek yerleştirmede de aynı).
- **%5 kesinti (1.5, Yönetmelik 13/3):**
  - (i) Uzmanlık eğitimine devam ederken sınava girildiğinde → **girilen her sınavda**.
  - (ii) Eğitimdeyken istifa edenlerde → istifayı takip eden ilk sınavda.
  - (iii) Yerleştirildiği hâlde eğitime başlamayanlarda → takip eden ilk sınavda.
  - "Takip eden ilk sınav", adayın başvuracağı değil **ÖSYM'nin uyguladığı ilk sınavdır** (1.5 DİKKAT).
  - Başvuru süresi bittikten sonra sınava kadar önceki dönemin yerleştirme/ek yerleştirmesiyle yerleşenin puanı beyanına bakılmadan %5 düşer.
  - Yanlış beyan sonradan anlaşılırsa sınavdan kazanılan tüm haklar kaybedilir.
- **Ek yerleştirme (7):** Şartlar: o döneme girmiş olmak, o dönem sonucuyla hiçbir programa yerleşmemiş olmak, puan 45 ve üzeri (dil şartı 5.3 gereği). Ek yerleştirme için tercih ücreti ödenir; ödemeyenin tercihleri geçersiz. Boş kontenjan kaynağı: tercih edilmeyen kadrolar, atanmaya uygun olmayan adaylar, süresinde başvurmayanlar. ÖSYM duyurusuna göre ek yerleştirmede başvuru kılavuzunun ilke ve kuralları uygulanır.

### 4.3 TusAnkiM açık verileri ve bilimsel kaynaklar

- **Katalog (`website/src/data/generated/catalog.json`, 2026-10-26):** 9.575 kart · 7.721 not · 12 ders · 106 konu alt destesi (Temel 3.957, Klinik 4.812, Deneme ve Soru 806). Ders kartları: Pediatri 1.506, Dahiliye 1.183, Farmakoloji 827, Kadın Doğum 755, Genel Cerrahi 742, Mikrobiyoloji 730, Patoloji 724, Küçük Stajlar 626, Biyokimya 602, FHE 597, Anatomi 477.
- **Referanslar (`website/src/data/generated/references-summary.json`):** Son 6 TUS (2024/1–2026/2, 1.195 soru): çözüm desteği 521/1.195 (%43,6 = 333 Doğrudan + 188 Dolaylı), konu kapsamı 1.108/1.195 (%92,7), 87 kart yok. Ders soru sayıları: Pediatri 148, Dahiliye 143, Küçük Stajlar 126, Genel Cerrahi 120, Biyokimya 109, Mikrobiyoloji 108, Patoloji 107, Farmakoloji 106, FHE 90, Anatomi 78, Kadın Doğum 60. `2026/2` sınav öncesi `git a78ae1f`: 76/200; güncel 82/200; konu kapsamı 192/200.
- **FSRS-6 simülasyonu (`fsrs-curves.json`, %90 hedef):** 9.575 kart günde 40 yeni kartla 240, 60 ile 160, 80 ile 120 günde biter. 800 kartlık ders günde 40 yeni kartla 20 günde biter.
- **Bilimsel kaynaklar:**
  - Aralıklı tekrar: Cepeda ve ark. (2006), *Psychological Bulletin* 132(3), `https://doi.org/10.1037/0033-2909.132.3.354`.
  - Kendini sınama (test etkisi): Roediger ve Karpicke (2006), *Psychological Science* 17(3), `https://doi.org/10.1111/j.1467-9280.2006.01693.x`.
  - FSRS: ACM KDD '22 (`https://dl.acm.org/doi/10.1145/3534678.3539081`) yalnızca FSRS'nin ne olduğu ve zamanlama yöntemi için; FSRS-6 şartnamesi (`https://github.com/open-spaced-repetition/awesome-fsrs/wiki/The-Algorithm`).
  - Anki Manual (`https://docs.ankiweb.net/background.html` aktif hatırlama ve aralıklı tekrar; `studying.html`, `deck-options.html`), AnkiMobile Manual (`https://docs.ankimobile.net/`).

---

## 5. Bakım listesi, doğrulanmamış maddeler ve bilinen yanlışlar

> Yalnız editörler ve yapay zekâ ajanları içindir. Açık maddeler kesinleşene kadar görünür sayfalara tahmini sayı ya da "çıkınca güncellenecek" notu yazılmaz.

### 5.1 2027 kılavuzları ve duyuruları çıktığında güncellenecekler
1. **Başvuru ücreti:** `tus-basvurusu-nasil-yapilir` şimdilik 2026/2 ücretini (test başına 2.500 TL) referans verir.
2. **2027 tercih ve ek yerleştirme tarihleri:** `tus-tercihi-nasil-yapilir`, `tus-ek-yerlestirme-nedir` ve `2027-tus-tarihleri-ve-calisma-plani` (SSS).
3. **Oturum saatleri ve 135 dakika:** değişirse `tus-sinav-gunu-ne-goturulur`, `tus-sinavinda-sure-yonetimi`, `tus-son-hafta-ve-son-3-gun`, `tusa-2-ay-kala-ne-yapmali`.
4. **2026/2 ek yerleştirme sonuçları:** sonuç PDF'i çıkınca `tus-ek-yerlestirme-nedir` (yerleşen sayısı ve doluluk).
5. Yukarıdakilerden birini güncelleyen, o yazının `updated` alanını da çeker.

### 5.2 Doğrulanmamış ya da yazılmayacak maddeler
- **Sınav formatının değiştiği yıl:** 100 soru / 135 dakika 2023/2'den beri doğrulandı; değişikliğin başladığı dönem doğrulanmadı. "2023'ten beri" ya da "eski 240 soruluk" yazılmaz.
- **Alt konu bazlı soru sayısı:** Elimizde 11 ders düzeyinde sayım var; "nöroanatomiden kaç soru" gibi sayılar yazılmaz.
- **Dil eşdeğer puanları:** e-YDS, TOEFL, IELTS karşılıkları yazılmaz; `https://www.osym.gov.tr/esdegerlikler` bağlantısı verilir.
- **Kılavuz dışı yorumlar:** "Küçük Stajlar dahili ve cerrahi grupların içinde sayılır" gibi ifadeler kılavuzun sözü değil, Tablo 1B'de ayrı satır olmamasından çıkan yorumdur; öyle yazılır.

### 5.3 Bilinen yanlışlar (yeniden yazılmayacak)

26 Kasım 2026 incelemesinde taslaklarda bulunup düzeltilen hatalar. `verify-rehber-content.mjs` içindeki `KNOWN_WRONG` listesi bunların bir kısmını her derlemede arar.

| Yanlış | Doğrusu |
| --- | --- |
| %5 kesinti üç durumda da "yalnızca takip eden ilk TUS'ta" | Eğitim sürerken girilen **her** sınavda; istifa ve başlamamada ÖSYM'nin yaptığı takip eden ilk sınavda |
| Kesinti "10 iş günlük sürede kayıt yaptırmamak" | Yönetmeliğin sözü "eğitime başlamayanlar" |
| 2026/2 ek: 788 program, 1.442 kontenjan | 23 Kasım düzeltmesiyle 774 program, 1.416 kontenjan |
| "Soruların %5'i güncel sağlık konularından" | Yalnızca Klinik testin yaklaşık %5'i |
| "Kılavuzun andığı YÖKDİL" | Kılavuz YDS, Bakanlık/YÖK sınavı ve TÖMER TIPDİL der; YÖKDİL adı geçmez |
| "Tıp mezunlarının iki oturuma katılması gerekir" (kural gibi) | Kılavuz oturum seçtirir; iki puan türü iki testten hesaplandığı için iki oturum seçilir |
| Soğuk damga kimlik kartında da aranır | Yalnızca nüfus cüzdanında |
| "Emanet olmayabilir" | Hiçbir eşya emanete alınmaz |
| İntörn TUS'a girer | Sınav tarihi itibarıyla diploma tescili gerekir |
| ACM KDD '22 "pasif okumanın katkısı sınırlı" der | Bu iddianın kaynağı Roediger ve Karpicke (2006) |
| Kendi sayfalarımıza `https://tusankim.com/...` kaynak bağlantısı | Göreli yol (`/referanslar/`); alan adı 26 Kasım 2026'da DNS'te çözülmüyordu |

---

## 6. Otomatik kalite kapısı

`website/scripts/verify-rehber-content.mjs`, `cd website && npm run verify` içinde her derlemede çalışır:
- Görünür HTML'de arka plan sızıntısı (`güncellenecek`, `güncelleyeceğiz`, `DOĞRULA`, `Markalı`/`Yumuşak`/`Markasız`, `Ne yapabilirsiniz?`), ham backtick ve ölü ÖSYM bağlantıları (`TR,14991`, `TR,15070`).
- Her yazıda: geçerli kategori, `seoTitle` ≤ 58, `seoDescription` 90–160, 3–5 adım, ≥ 2 kaynak, ≥ 3 iç bağlantı, `published ≤ updated ≤ bugün`, kaynak adresi `https://` ya da site içi göreli, mutlak `tusankim.com` bağlantısı yok, `KNOWN_WRONG` listesi.
- Sıra ≥ 9 yazılarda: 600–900 kelime, ≤ 25 kelimelik cümle, yasak sözcükler, `henüz yayımlanmadı/açıklanmadı`.
- Derlenen sayfada: `#hizli-cevap`, "Ne yapmalısın?" başlığı, `Article` + `SpeakableSpecification`, `datePublished`/`dateModified` = yazının tarihleri, SSS varsa `FAQPage` soru sayısı.
- `/rehber/` dizininde: konu listesi, her konu başlığı, hap (`rounded-full`) yok.
