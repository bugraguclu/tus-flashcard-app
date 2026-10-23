# AI-2 düzeltme ve devir raporu

Tarih: 2026-10-23. Denetim kaynağı: `2499366:docs/AUDIT_ANKI_PARITY_NON_FSRS.md`.
Çalışma dalı: `codex/anki-ai2-scheduling`; başlangıç commit'i: `2648267`.
Ana checkout'taki mevcut değişikliklere dokunulmadı. Push ve PR yapılmadı.
`lib/fsrs*.ts` değiştirilmedi; günlük yeni kart sınırı geri getirilmedi.

## Tamamlanan maddeler

| ID | Sonuç ve kanıt |
| --- | --- |
| P0-6 | Geri al yalnızca işlemin değiştirdiği alanları birleştirir; sonraki alan/etiket/deste/bayrak düzenlemelerini korur, silinmiş satırı diriltmez. Cevap geri alma zamanlama alanlarıyla sınırlıdır. `ai2Safety.test.ts`, `reviewerUndo.test.ts`. |
| P0-8, ARA-6 | Grade Now askı/gömme bayraklarını kaldırıp tam zamanlama durumu yazar. Gün numarasıyla kayıtlı öğrenme vadesi geçmiş olsa da queue 3'e döner. `ai2Safety.test.ts`. |
| P0-7, ZAM-1, ZAM-2 | Klasik erken tekrar yalnızca filtre bağlamında çalışır; geçen gün due/interval üzerinden bulunur. Sıfır gün geçmiş 1 günlük Good aralığı 1 gün kalır. Etiket ve kayıt aynı deterministik fuzz/balancer yolunu kullanır. `ai2Scheduling.test.ts`, scheduler/repository testleri. |
| FLT-1, FLT-2, FLT-3, FLT-5, FLT-6, FLT-8 | Create/Rebuild sırasında sıralı üyelik kaydedilir; yeniden sorgulama, cevap, eşleşmenin değişmesi ve gün dönümü üyeliği doldurmaz/değiştirmez. Ana kuyruk ve ikinci filtreli deste rezervasyonları dışlar. İkinci arama, ilk aramanın aldığı kartları limitten önce dışlar. `ai2Filtered.test.ts`. |
| P0-14 çalışma/boşaltma kısmı, ZAM-7 | İçe aktarılmış fiziksel filtreli kartın `odue` vadesi ve ana deste ön ayarı kullanılır. Öğrenme `odue` değerini günceller; mezuniyet/Empty/Rebuild kartı ana desteye döndürür, askı/gömme korunur. Undo, daha sonraki taşıma işlemini ezmez. İçe aktarma birim dönüşümü aşağıda ayrı sınırdır. `ai2Filtered.test.ts`, `ai2Safety.test.ts`. |
| KUY-1, KUY-2, KUY-3, KUY-10 | Yeni kartlar günlük sınırsız kalır; 200 kartlık yenilenen SQL penceresi ve not türü başına önbellek kullanılır. Karıştırmada 1:1 tekrar/yeni ritmi korunur. Deste toplama ebeveyn ve alfabetik alt desteler sırasındadır; şablon sıralaması çalışma penceresinde uygulanır. `ai2Queue.test.ts`. |
| KUY-4, KUY-5 kuyruk kısmı | Gün-öğrenme global/hiyerarşik tekrar limitini tüketir, cevap sonrası tüketim kalıcıdır; undo tüketimi kaldırır. Gün içi öğrenme sayısı şimdi + ileriye öğrenme aralığıyla sınırlıdır. Deste deposu/ağaç ekranı için AI-1 notu aşağıdadır. `ai2Queue.test.ts`. |
| KUY-6, KUY-8 | Kuyruk okuması kardeşleri yalnızca bellekte atlar ve limitten önce eler; slot kaybı olmaz. Tekrar sırası tüm vadeli kartların hafif zamanlama anahtarlarından hesaplanır, sonra seçilen kartların alanları yüklenir. `ai2Queue.test.ts`. |
| ZAM-4 | Cevapta gömme önceliği gün içi → gün-öğrenme → tekrar → yenidir; sonraki kategori önceki kategorideki kardeşi gömmez. `ai2Queue.test.ts`, repository answer/undo testleri. |
| FLT-10 | Ana destenin vade sayacından yalnızca o sayaca dahil edilmiş rezervasyon düşülür. Kart kimliğinin zaman damgasına benzemesi sabit üyeliği değiştirmez. `ai2Filtered.test.ts`. |
| CAL-1, CAL-2, CAL-3, CAL-7 | Soru/cevap için açık ses listesi; elle cevap tekrarında soru→cevap, soruyu atla seçeneğinde yalnız cevap; otomatik cevapta FrontSide sesi dışarıda. Kartın kendi ön ayarı ve global ses anahtarı uygulanır. Menü/diyalog, rota odağı, arka plan ve beyaz tahta otomatik ilerlemeyi duraklatır; aynı yüzdeki birikmiş süre korunur. `reviewerAudio.test.ts`, `reviewerTimers.test.ts`, `reviewerDwellTimer.test.ts`. |
| Trial gizli riski | Mevcut deneme katalog kartlarının öğrenme durumu ve öğrenci etiket/bayrak değişiklikleri yazılabilir. İçerik, kimlik, sahiplik ve yeni katalog kartı üretme engelleri korunur. `ai2CatalogStudy.test.ts`, katalog koruma/kurulum testleri. |

## Kısmi kalanlar ve bilinçli farklar

- **Filtre modeli sanal kalır:** yerel kartların `did` alanı ana destede durur; üyelik koleksiyon ayarlarında saklanır. Anki'nin fiziksel taşıma modeli tam uygulanmış değildir. İçe aktarılmış fiziksel kartlar ayrıca desteklenir. Matris ve ilgili NOTES bölümü bu farkı açıklar.
- **FLT-4:** boşluklu tümü tırnak içindeki `deck:` terimi, ASCII harf eşlemesi/joker, `note:`, `card:`, `alan:değer`, `nid:`, `introduced:` ve olumsuz biçimleri için filtre SQL düzeltildi. Tam Anki arama dili ve Türkçe/Unicode eşleştirme tamamlanmadı; AI-3'ün ortak arama çalışmasıyla birleştirilmeli.
- **P0-14 içe aktarma sınırı:** bozuk kaydedilmiş `odue` birimleri tahmin edilerek düzeltilmedi. `sourceOriginalDueToLocal` içindeki gün/ms dönüşümleri, preview/queue 4 ve eksik ana deste paketleri AI-3'ün içe aktarma alanındadır.
- **KUY-4/KUY-5:** kuyruk ve cevap muhasebesi düzeltildi. `deckStore.ts`/`deckTree.ts` limit ve öğrenme sayacı uygulamaları bu dalda değiştirilmedi.
- **İsteğe bağlı kalanlar:** ZAM-3; KUY-7/KUY-9; FLT-7/FLT-9; CAL-4/CAL-5/CAL-6/CAL-8/CAL-9/CAL-10/CAL-11 ve bu alanların P3 maddeleri. CAL-8'de TTS ile dosya sesi arasında tek ortak sıra henüz yoktur. CAL-9/CAL-10 hızlı tekrar girdisi korumaları ayrıca ele alınmalıdır.
- Sınırsız yeni kart penceresi ve sabit 1:1 karıştırma, Anki'nin günlük yeni kart kotasına dayanan toplamadan bilinçli ürün farkıdır.

## Diğer ajanlara birleştirme notları

### AI-1

- `getReviewsAnsweredToday` ve hiyerarşik tekrar hesabı gün-öğrenme tüketimini de sayar. Deste listesi/ağaç limitleri bunu aynı anlamda kullanmalı; öğrenme sayaçları `now + learnAhead` aralığıyla sınırlanmalı. Denetimin KUY-4/KUY-5 maddelerinin bu dosyalardaki kısmı açıktır.
- Yeni kart limiti yoktur. Eski günlük 20 sınırı kuyrukta geri getirilmedi; deste ağacındaki etiket/sayı davranışını da aynı ürün kararıyla birleştirin.
- Deneme katalog kartında `saveAnkiCard` artık mevcut satırın öğrenci zamanlama/bayrak alanlarına izin verir. Not içeriği veya kartın destesi/kimliği/şablon sırası için bu izin genişletilmedi.

### AI-3

- `studySearchSql.ts` değişikliği **c1872bc** içinde ayrıdır. Önce ortak arama değişikliğini, ardından bu filtre davranışlarını birleştirin; mevcut dışa aktarılan imzalar korunmuştur. `ai2FilteredSearch.test.ts` regresyonlarını taşıyın.
- `settings` tablosundaki **`filtered_membership_v1:<deckId>`** anahtarı `{ buildAt, signature, ids }` saklar. Yedek/geri yükleme bunu deck ID ve card ID ilişkileriyle korumalıdır. Mevcut `exportAllData()` yalnızca genel AppSettings ve seçilmiş tabloları dışarı çıkardığı için bu anahtarlar yedekte yoktur; bu dal AI-3 dosyalarını değiştirmedi. Bu entegrasyon olmadan restore sonrası filtre üyeliği yeniden seçilebilir.
- **`interday_review_usage:<revlogId>`** anahtarı gün-öğrenme cevabının tekrar kotası tüketimini saklar; undo ilgili anahtarı siler. Yedek geri yüklemesi bunu da korumalı veya revlog'la tutarlı yeniden kurmalıdır. Taşınabilir revlog türleri bu işaret için değiştirilmedi.
- Fiziksel filtreli kartın `odue` değerini import sırasında doğru birime çevirin. Bu dal, var olan hatalı birimi sessizce yeniden yorumlamaz.
- Sanal filtre üyeliğini arama/tarayıcı/dışa aktarma semantiğinde hesaba katın. Yerel kartın `did` alanı ana destesinde kalır; fiziksel Anki filtre desteği diye sunulmamalıdır.

Üç dal da uyumluluk matrisi, NOTES ve kaynak kayıt dosyasını değiştiriyor; yalnızca ilgili alanların belge değişiklikleri birleştirilmeli. Sonrasında tüm kalite taraması yeniden çalıştırılmalı.

## Doğrulama

- **PASS:** `npm run quality` — 168 Vitest dosyasında **1730 test**, TypeScript ve `verify:ios` (2026-10-23).
- **PASS:** `npm run build:web` — üretim paketi ve 22 statik rota.
- Odaklı regresyonlar gerçek SQLite/sql.js üzerinde; geri al/silme, erken tekrar, sabit filtre üyeliği, kota/sıra ve trial yazımları için başarısız örnekler önce üretildi. React dwell testi menü/arka plan duraklaması ve yüz/kart değişimini gerçek effect yaşam döngüsüyle çalıştırır.
- `verify:ios`, mevcut App Store yayıncı/adres/iletişim yer tutucularını bildirdi. Bunlar bu değişikliğin kapsamında düzenlenmedi; kontrol başarılıdır, mağaza gönderimi onayı değildir.

### Adlandırılmış iPhone simülatör smoke

Cihaz: ayrı oluşturulmuş **TusAnkiM AI2 QA**, iPhone 17 Pro, iOS 26.4;
UDID `E8E95A75-CC3E-4C23-8DA0-9912189B413F`, build **1**, native Debug kabuğu ve bu dalın Metro paketi.
Kullanıcının mevcut simülatör koleksiyonları kullanılmadı.

| Senaryo | Sonuç |
| --- | --- |
| Klasik reviewer'da yeni kart → Again → geri al; sayaç ve soru yüzüne dönüş | PASS |
| `AI2 Öğrenme`, `is:learn`, limit 1, yeniden planlama açık: kartı mezun etme; bitti ekranı ve yerine başka kart almama | PASS |
| `AI2 Tekrar`, `is:review`, limit 1: erken tekrar, Good, bitti ekranı; geri al sonrası tekrar kartının geri gelmesi | PASS |
| Çalışma ekranını arka plana gönderip uygulama değiştiriciden dönme; filtre kapsamı ve kalan kart sayısı | PASS |

**Çalıştırılmayan yayın kapıları:** fiziksel iPhone'da ses/TTS sırası ve ses kesilmesi, redesigned reviewer, küçük ekran/Dynamic Type/VoiceOver, bağımsız Release build ile tam smoke. Simülatör kontrolü bunların yerine geçmez. Otomatik ilerlemenin duraklama politikası deterministik testle doğrulandı; gerçek cihaz süre/ses kombinasyonu yine kontrol edilmelidir.

## Commit sırası

1. `1fe6fbf` — geri alma ve inaktif kartın geçerli zamanlama durumu.
2. `c1872bc` — filtre SQL terimleri (AI-3 ile tek kod çakışması).
3. `1eb3247` — sabit filtre üyeliği ve fiziksel kart boşaltma.
4. `edf4832` — klasik erken tekrar ve kaydedilen aralıkla aynı etiket.
5. `5a67dd0` — sınırsız yeni kart penceresi, sıra ve kota muhasebesi.
6. `50d1f7e` — ses kapsamları, modal/odak otomatik ilerleme koruması.
7. `3b75956` — trial öğrenci durumunun yazılması.
8. `f0cd74f` — fiziksel filtreli kartın ana vadesinden zamanlama.
9. `80b8b92` — trial genel not kaydetme kısıtını koruma.
10. `daa6de2` — tam hafif tekrar toplama, kardeş eleme sonrası limit.
11. `c503201` — filtreli kartın ekrana taşınan vadesi ve ana deste sayacı.
12. `3dd5735` — cevapta kardeş kategori önceliği.
13. `3c5782c` — fiziksel kartın cevap yan etkilerinde ana ön ayar.
14. `3e989fb` — menü/odak duraklamasında yüz sayacının korunması.
