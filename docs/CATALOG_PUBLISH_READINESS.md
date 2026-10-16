# Kart kataloğu yayın hazırlığı — 9 Ekim 2026

**Son güncelleme: 12 dersin tamamı tarandı; bu turda 141 not / 328 mevcut kart
düzeltildi.** Tüm 9.575 kart ön yüzü otomatik kontrol edildi; şüpheli cevap
görünürlüğü ve soru–açıklama çelişkileri ders gruplarıyla incelendi. Düzeltilen
alanlar, kimlikler, medya ve gerçek gösterici çıktıları doğrulandı.
Ayrıntı: [tüm dersler takip raporu](catalog-corrections/all-course-front-followup.md).
Önceki [13 not / 21 kart düzeltmesi](catalog-corrections/publish-front-followup.md)
de korunuyor.
Güncel paket SHA-256: `7030ad699f7fd19b9f97ca666321133833bf3dfb47d8c1527bbae8b0e6fa0bd3`.
Son `npm run quality`: **156 test dosyası / 1.659 test** geçti.

**Genel yayın kararı: önceki ders raporlarındaki açık yüksek riskli kaynak kapsamı
kapanmadan kataloğun tamamına son tıbbi onay verilmez.** Bu raporda seçilen 11
engelin güncel pakette sürdüğü hükmü artık geçerli değildir. Aşağıdaki bölümler
ilk hazırlık kontrolünün tarihsel kanıtıdır; son uygulama durumu yukarıdaki
düzeltme raporundadır. Fiziksel iPhone smoke testi bu turda yapılmadı.

## İlk kontrol sonucu — düzeltme öncesi

**İlk karar: mevcut kart içeriği son yayına hazır değildi.** Paket tutarlılığı ve otomatik
testler geçiyor; önceki denetimlerde bulunan bazı içerik/öğretim sorunları güncel
dağıtım varlığında hâlâ duruyor. Bu karar yalnız kart kataloğu içindir; uygulamanın
App Store yayın onayı veya bütün kartların tıbbi doğruluk sertifikası değildir.

## En küçük yararlı kontrol kapsamı

1. Son ChatGPT denetim kaydı ve ders raporlarının sonuçlarından açık riskler çıkarıldı.
2. Dağıtılan `.tuspack` açıldı; APKG/manifest/yama eşleşmesi otomatik doğrulandı.
3. Dört dersten 11 açık risk notu, altı son düzeltme ve iki ilişkili karşılaştırma
   notu seçildi: **19 not / 28 gerçek kart ordinali**. Güncel veriden uygulamanın
   `renderCardHtml` ve `renderClozeQuestion` çıktıları üretildi.
4. İrinotekan ve FEF25–75 iddiaları birincil/resmi kaynak metinleriyle yeniden
   karşılaştırıldı. Diferansiyasyon sendromunda ELN'nin erişilebilir indeksindeki
   öneriler kontrol edildi; doğrudan PMC/ASH tam metin erişimi başarısız oldu.
5. `npm run quality` yeniden çalıştırıldı.

Bilinen engeller güncel pakette doğrulandığından düşük riskli bütün kartlar
yeniden okunmadı. Bu seçim hata sıklığını ölçen rastgele örneklem değildir;
yayın kararını verecek açık riskleri ve son düzeltmeleri sınar. Bütün tıbbi
önermelere toplu kaynak onayı verilmedi.

## Geçen teknik kontroller

| Kontrol | Sonuç |
| --- | --- |
| Dağıtılan `.tuspack` → APKG | Açılan baytlar aynı SHA-256 |
| Manifest | Paket hash'i, not/kart/medya toplamları aynı |
| Koleksiyon | 7.721 not / 9.575 kart / 12 ders / 49 medya |
| ZIP / SQLite | CRC kontrolü geçti / `integrity_check = ok` |
| Medya envanteri | Manifestteki 49 dosya pakette mevcut |
| 12 dersin mevcut düzeltme kayıtları | GUID ve kayıtlı güncel alanlar paketle birebir eşleşti |
| Seçili gösterici çıktıları | Boş soru/cevap, kalan cloze sözdizimi veya ordinal farkı bulunmadı |
| Son altı düzeltme | HIV/oral sızıntı düzeltmeleri, iki UMP hesabı, oksidaz adı ve keton kapsamı yerinde |
| `npm run quality` | TypeScript, 156 test dosyası / 1.647 test, iOS yapılandırma ve Anki kaynak sicili geçti |

Bu kontroller tıbbi doğruluğu veya her kartın iPhone görünümünü kanıtlamaz.
Fiziksel iPhone smoke testi bu kontrolde yapılmadı. Kartlar, yamalar, mevcut
Excel'ler ve dağıtım varlıkları değiştirilmedi.

## İlk kontrol paketinde açık bulunan, bu takipte düzeltilen odak kayıtları

Tablodaki satırlar aynı ağırlıkta 11 kesin tıbbi hata olarak sayılmamalı. Yerel
çelişki/sızıntı kanıtı ile tıbbi kaynak onayı ayrı belirtilmiştir.

| Ders / Not ID | Güncel kanıt | Yayın öncesi işlem |
| --- | --- | --- |
| Farmakoloji / `1624188510902` | İrinotekan G2–M satırında; soru kökünde eski sınıflama kapsamı yok. NCI S fazına özgü sınıflıyor. | Güncel fazı doğru öğret veya korunacak farklı tablonun kaynak/kapsamını açıklaştır. [NCI](https://www.cancer.gov/publications/dictionaries/cancer-drug/def/irinotecan-hydrochloride). |
| FHE / `1604143049764` | FEF25–75 için efora görece bağımsızlık öğretiliyor; ATS/ERS klinik ölçümün efora ve FVC geçerliliğine güçlü bağımlılığını belirtir. | Fizyolojik kavramla klinik ölçümü ayır; kaynağıyla uyumlu soru kur. [ATS/ERS 2019, e82](https://www.aarc.org/wp-content/uploads/2026/06/ers-ats-standardization-of-spirometry.pdf#page=13). |
| Dahiliye / `1622986369091` | Antrasiklin + deksametazon koşulsuz tedavi cevabı olarak duruyor. ELN 1.13 erken deksametazonu; 1.10/1.16 sitoredüksiyonu lökosit/rejim koşullarıyla ayırıyor. | Antrasiklin ekleme koşulunu belirt. Bu tur erişim indeks metniyle sınırlı; önceki odak raporu korunuyor. [ELN 2019](https://pmc.ncbi.nlm.nih.gov/articles/PMC6509567/). |
| Farmakoloji / `1604674576990` | c1'de gizli olmesartan/azilsartan c2 satırında görünür; c2'de de c1 satırından okunur. | Mevcut iki ordinal ve iki öğrenme görevini koruyarak karşılıklı sızıntıyı kapat. |
| Patoloji / `1620369027703` | c1'de gizli diffüz büyük B hücreli lenfoma başka satırda açık. | Aynı tekrarın görünürlüğünü düzelt; bütün lenfoma listesini kaynakla doğrulanmış sayma. |
| Patoloji / `1625238469386` | Etken gizliyken başlıkta sifiliz, satırda sifilitik aortit okunuyor. | Kökü tarafsızlaştır. Treponema adının tamamının aynen sızdığı iddia edilmedi. |
| Farmakoloji / `1604660192048` | Ön tarafta tamoksifen/klopidogrel için ortak CYP2C19 ve kesin etkinlik artışı; Extra'da tamoksifen için başlıca CYP2D6 yazıyor. | İlaç ve klinik kapsamlarını ayır; Extra açıklamasını soru tarafına taşı. Bu tur yeni farmakogenetik kaynak onayı verilmedi. |
| FHE / `1618700546655` | Ön tarafta plasenta bazal membranı tip V; Extra'da ana kollajen tip IV. | Ön/arka yanıtı uyumlu yap. “Klasik bilgi” etiketi tek başına farklı cevabın kaynağı değildir; önceki odak kaynak incelemesini kullan. |
| Dahiliye / `1604850094654` | Mekanizma takipne; ilişkili `1604845306203` ise tidal volüm artışı ve değişmeyen solunum sayısını öğretiyor. | İki kartın aynı mekanizmayı tutarlı anlatmasını sağla. Bu tur iki kartın bütün önermelerine tıbbi onay verilmedi. |
| Dahiliye / `1605009641509` | <30 °C için yöntem belirtmeden aktif ısıtma; Extra dış ısıtmanın kollaps riskini açıklıyor. | Önceki rapordaki çekirdek/periferik ısıtma ayrımını kaynakla kapat; bu tur yeni hipotermi protokolü önerilmedi. |
| FHE / `1604130656359` | A2 (CVLM) eşlemesi kalmış; ilişkili `1604130849876` CVLM barorefleks düzeltmesini taşıyor. | Önceki odak kaynaklarıyla ilişkili kartları birlikte tutarlı hâle getir; bu tur yeni anatomik kaynak incelemesi yapılmadı. |

## Önceki denetimlerin tarihsel kapsamı

İlk kontrol sırasında raporlarda aşağıdaki kapsamlar bulunuyordu. Son takipte
bunların bazıları kart düzeyinde kapatıldı; aşağıdaki sayılar **güncel kalan hata
veya açık kayıt sayısı değildir**. Son uygulanan kimlikler tüm dersler takip
kaydındadır. `reviewStage: complete` veya boş karar hücresi tek başına yayına
hazır/yanlış içerik kanıtı değildir.

- Pediatri: raporda 387 öncelikli açık kapsam satırı var; bunlar 387 kesin yanlış
  kart değildir. Yanlış ön yüz, koşul ve görsel bulguları ayrıca kapanmalıdır.
- Genel Cerrahi: 102 öncelikli notun odak kaynak incelemesi açık; 133 ek kaynak
  kaydı bütün notun yanlışlığı anlamına gelmez.
- Küçük Stajlar: 38 tıbbi/öğretim bulgusu ve 90 açık odak sorusu raporda; 35 taslak
  otomatik uygulanmış yama değildir.
- Patoloji/Biyokimya takip kararlarında sırasıyla 16 ve 4 kaynak doğrulaması
  bekleyen kayıt var. Doğru yayın kimliği bulunması bütün iddiaları kapatmaz.

Ana rapor listesi: [son denetim kaydı](../outputs/son-denetim-2026-10-09-01a11fb0/SON_DENETIM.md).

Bu tablodaki odak kayıtları ve tüm dersler takibindeki doğrudan sızıntılar ile
ön/arka uyuşmazlıkları ders gruplarıyla düzeltildi. Kalan kapanış sırası:
diğer raporlardaki açık
**yüksek riskli odak iddialarını** kaynakla kapat. Her grupta yalnız
değişen ordinal/medya/kimlikleri ve ilişkili kartları yeniden sınayıp güncel paket
eşleşmesini kontrol et. Düşük riskli kartları baştan tek tek denetlemek bu
engelleri kapatmak için gerekli değildir. Son adayda hedefli iPhone kart smoke
testini ayrıca kaydet.

## Tekrarlanabilir kanıt

İlk kontrol paketi SHA-256: `5fadd886944365e6e67b6f1b99fd1d89b13f49e916eb7a63789e87312e9990b7`.

[Teknik sonuçlar](../outputs/yayin-hazirlik-2026-10-09/verification.json),
[güncel alanlar ve ön yüzler](../outputs/yayin-hazirlik-2026-10-09/selected-cards.json),
[salt okunur kontrol betiği](../outputs/yayin-hazirlik-2026-10-09/verify.mjs),
[quality çıktısı](../outputs/yayin-hazirlik-2026-10-09/quality.log).

İlk kontrolün ve önceki 13 notluk uygulamanın çıktıları tarihsel snapshot olarak
korunur. Güncel doğrulama ve alan çıktıları
`outputs/tum-dersler-on-yuz-2026-10-09/` altındadır; depo kökünden
`node outputs/tum-dersler-on-yuz-2026-10-09/verify.mjs` ile yeniden üretilebilir.
Kanıt dizinleri mevcut depo kuralı gereği yerel `outputs/` altında; bu rapor ve
alan bazlı takip kaydı Git kapsamındadır.
