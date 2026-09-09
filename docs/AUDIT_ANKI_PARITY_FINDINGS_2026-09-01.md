# Anki uyumluluk ve istek denetimi

**Tarih:** 1 Eylül 2026  
**Kapsam:** Mevcut çalışma ağacı; kod değişikliği yapılmadan statik inceleme, deterministik testler ve resmi Anki kaynaklarıyla davranış karşılaştırması.  
**Bu denetimin çıktısı:** Bu dosya. Uygulama kaynak kodunda satır değişikliği yapılmadı.

## Kısa sonuç

`npm run quality` başarılıdır: TypeScript kontrolü, **110 test dosyasında 946 test** ve iOS/uyumluluk kayıt doğrulaması geçti. Bu, mevcut kodun iç tutarlılığı için iyi bir kanıttır; iPhone üzerindeki WKWebView geçişinin ve medya izinlerinin görsel/gerçek cihaz davranışının kanıtı değildir.

Uygulama için **“Anki ile birebir aynı”** sonucu şu aşamada verilemez. En önemli engeller şunlardır:

1. Filtreli deste için kullanıcıda belirtilen önizleme gecikmeleri (`preview_delay`, Again/Hard/Good) veri modelinde, formda ve kuyrukta yoktur.
2. Araç çubuğu AnkiMobile araç çubuğuyla işlevsel olarak tam eşleşmez; özellikle yerel `TextInput` henüz WebView'a devredilmemişken seçimsiz kalın yazı gibi “sonraki yazıyı biçimlendir” davranışı korunmaz.
3. Anki'nin boş kart üretip daha sonra **Empty Cards** ile temizlenebilen not akışı, yeni not ekranındaki “ön alan boş olamaz” kontrolü nedeniyle yerelde başlatılamaz.
4. Sıçramasız WebView devri ve önizleme/çalışma ekranı ölçümleri için gerçek iPhone ekran kaydı veya görüntü karşılaştırma testi yoktur.

Uyumluluk matrisi de ürünü doğru biçimde “Implemented subset” olarak tanımlar; bu rapor onu “tam uyumlu” diye yeniden sınıflandırmaz.

## Kaynaklar ve denetim yöntemi

- Davranış semantiği için [resmi Anki manuali](https://docs.ankiweb.net/intro.html), özellikle [editing](https://docs.ankiweb.net/editing.html) ve [filtered decks](https://docs.ankiweb.net/filtered-decks.html).
- iPhone etkileşimi için [AnkiMobile editing manuali](https://docs.ankimobile.net/editing.html).
- Zor planlayıcı karşılaştırmaları için [Anki kaynak kodu](https://github.com/ankitects/anki); Android'e özgü davranışlar için [AnkiDroid](https://github.com/ankidroid/Anki-Android). Kullanıcının gönderdiği iki GitHub bağlantısı sondaki `-` nedeniyle bulunamadı; burada kanonik adresler kullanıldı.
- Repo içi kaynak kayıtları, uyumluluk matrisi, iOS yayın kontrol listesi, ilgili uygulama/iş mantığı ve mevcut testler incelendi.
- `npm run quality` çalıştırıldı ve geçti.

Anki/AnkiDroid GPL ailesindendir. Buradaki öneri, kaynak kod taşımak değil; gözlenebilir davranışı bağımsız testlerle eşlemektir.

## Öncelikli bulgular

| Öncelik | Bulgu | Kanıt | Nasıl olmalıydı |
| --- | --- | --- | --- |
| P0 | Filtreli deste önizleme gecikmeleri yok | `previewDelay`, `preview_delay` ve Again/Hard/Good için gecikme alanı bulunmadı. `FilteredDeckOptionsModal` yalnızca yeniden zamanlamayı yönetiyor; gözden geçirme önizleme modunda Again kartı anında yeniden kuyruğa alıyor. | Filtreli deste verisine açık bir gecikme sözleşmesi eklenmeli; tekrar planlamayı kapatan oturumda kartın kalıcı zamanlaması/review log'u değiştirilmeden geçici kuyrukta Again/Hard/Good için doğru süre bekletilmeli, Easy kartı oturumdan çıkarmalıdır. Kullanıcının verdiği `10 / 60 sn / 600 sn / 0` vektörü deterministik test olmalıdır. Birim, entegrasyon, yeniden açma ve `.apkg` koruma testleri eklenmeden bu özellik tamamlanmış sayılmamalı. |
| P0 | Araç çubuğu tam AnkiMobile eşdeğeri değil | AnkiMobile; kalın/italik/altı çizili, biçim temizleme, renk, alt/üst simge, medya, çizim, matematik, önizleme ve HTML düzenlemeyi belgeliyor. Yerel araç çubuğunda bunların bir bölümü var; temel `Fx` biçim temizleme, boya fırçası, doğrudan alt/üst simge ve kaynak HTML düzenleme yok. | Önce hedef platform (AnkiMobile) araç çubuğu için işlev matrisi yazılmalı. Her işlev, seçili metin ve boş imleç durumunda ayrı test edilmeli; erişilebilir adlar ve odak geri dönüşü de test edilmelidir. Özel HTML düğmeleri yalnızca izinli, sanitizeli şablonlar olarak kalmalıdır. |
| P0 | Handoff penceresinde “sonraki metni kalın yaz” garantisi yok | `RichTextEditor` WebView hazır olana dek doğru olarak yerel `TextInput`u üstte tutuyor. Bu sırada araç çubuğu komutu WebView için bekleyen komut olarak saklanıyor; yerel `TextInput`un yazım durumu değişmiyor. | Yerel yazım modunu (`bold`, `italic`, vb.) ayrı bir geçici durum olarak modellemek veya komut verildiğinde kayıpsız ve atomik devretmek gerekir. Odak, imleç konumu, metin ve sıradaki karakterin biçimi iPhone'da test edilmelidir. Sadece `execCommand('bold')` çağrısına güvenmek yeterli değildir. |
| P1 | Boş kart senaryosu yalnızca bakım tarafında kısmen var | `/empty-cards` geçersiz şablon/ön yüz üreten kartları bulup kartı, not ve geçerli kardeşleri koruyarak silebiliyor. Buna yönelik yönetici ve işlem testleri mevcut. Fakat `app/editor.tsx` yeni notta ön alan boşken kaydı reddediyor. Anki manuali, boş kart üreten yeni notun sonradan tamamlanabileceğini veya Empty Cards ile silinebileceğini açıklıyor. | “Boş kart”ın tanımı ayrı test edilmelidir: boş ön alan, koşullu şablon, cloze ve sonradan şablon değişimi. Ürün boş ön alanı yasaklamayı bilinçli seçerse bunu Anki farkı olarak belgelesin; Anki uyumu amaçlanıyorsa notu kaydetme/uyarma/Empty Cards akışı manueldeki davranışla eşlenmelidir. |
| P1 | Filtreli deste sıralama sözleşmesi çelişkili | Kodda 0–9 arası on sıralama seçeneği için UI dizisi var, `relativeOverdueness` modelde 10 olarak bulunuyor fakat yerel UI'ya dahil değil. Resmi manualde Relative Overdueness listeleniyor. Uyumluluk matrisi de FSRS'e bağlı sıralamaların yerelde sunulmadığını söylerken UI dizisi retrievability seçeneklerini içeriyor. | Tek bir sürümlenmiş sıralama matrisi olmalı: Anki sürümü, destek koşulu (ör. FSRS), UI görünürlüğü, iç ordinal, import/export koruması ve test vektörü aynı kayıt altında tutulmalı. Desteklenmeyen tercih korunabilir, ama kullanıcıya işlevsel seçenek gibi gösterilmemelidir. |
| P1 | Görsel olarak “sıçramasız” sonucu testle kanıtlı değil | Kaynak, hedeflenen tasarımı uyguluyor: `fallbackInput`, WebView `ready` mesajına kadar görünür; `lineHeight` `Math.round(fontSize * 1.45)`; iki tarafta 8 dikey/2 yatay padding ve `textMuted` placeholder kullanılıyor. Önizleme de sabit gövde yüksekliğiyle açılıyor. Ancak bunların hiçbiri WKWebView ilk çizimi, düşük bellek veya modal animasyonu üzerinde görsel testle doğrulanmıyor. | Aşağıdaki canlı iPhone senaryosu yayın engelleyici kabul edilmeli: soğuk açılışta modal giriş, WebView hazır olmadan hemen yazma, imleç/odak korunması, klavye açıkken önizleme, farklı Dynamic Type ve koyu mod. Başlangıç/ilk WebView çizimi/son durum için kısa ekran kaydı veya görüntü farkı eşiği saklanmalıdır. |

## İstek bazında ayrıntılı durum

### Zengin metin editörü, çıkış uyarısı ve önizleme

**Zero-flash devri:** Kod tasarımı hedefe yakındır. `InteractionManager.runAfterInteractions` ve gecikmeli mount korunmuş; WebView mount edilmiş olsa dahi `ready` mesajına dek fallback üstte kalır. `fallbackFocusedRef` de erken yazıda metin/odak kaybını önlemeyi amaçlar. Tipografi/padding/placeholder eşleşmesi istenen değerlerle görünür şekilde yazılmıştır. Bu nedenle burada statik bir gerileme bulunmadı.

**Eksik kanıt:** Bu bir yerel WebView çizim problemi olduğundan TypeScript veya birim test “gözle görünmez geçiş”i ispatlayamaz. Yukarıdaki P1 cihaz testi yapılmadan “tamamen pürüzsüz” denmemelidir.

**Değişiklik yokken çıkış:** Taslak anahtarı başlangıç alanları, deste, tür ve etiketleri normalize edip karşılaştırır. `useUnsavedChangesGuard` sadece gerçekten kirliyse `beforeRemove` olayını engeller. Bu, istenen “değişiklik yoksa direkt çık” davranışının kod düzeyinde doğru tasarımıdır. Buna rağmen boş açılış, deste başlangıçta geç çözülürken çıkış ve native swipe-back için ekran düzeyi otomasyon yoktur; bunlar elle doğrulanmalıdır.

**Önizleme ve çalışma ekranı:** Editör önizlemesi WebView ölçümünden sonra modalı yeniden boyutmamak için sabit gövde yüksekliği seçiyor; tarayıcı önizlemesi de contained WebView kullanıyor. Bu yaklaşım büyüyüp küçülme sorununa yöneliktir. Çalışma tarafında intrinsik WebView yüksekliği sonradan raporlanabilir; dolayısıyla gerçek kart uzunluklarında gözle görülür yeniden boyutlanma olasılığı ancak cihaz testiyle kapatılabilir.

### Medya, fotoğraf, ses ve boş tuval

**Fotoğrafı olduğu gibi ekleme:** Galeri/kamera seçiminde `allowsEditing: false`; ardından kullanıcıya “olduğu gibi ekle” veya “kırp ve düzenle” seçeneği veriliyor. Olduğu gibi yol, kaynak baytlarını koruyarak medya deposuna yazmayı hedefliyor. Bu istek kodda karşılanmış görünüyor. Yine de HEIC, şeffaf PNG, büyük fotoğraf, iptal, izin reddi ve uygulamayı öldürüp yeniden açma için iPhone akışı test edilmemiş.

**Fotoğraf düzenleme ve silgi:** `PhotoEditorModal`da taşınabilir/yazısı düzenlenebilir metin, ölçek/döndürme, katman seçimi, kırpma, kalem/vurgulayıcı/şekiller, kısmi-tam silgi ve undo/redo bulunuyor. Geometri testleri kısmi silgi ve metin vuruşlarını kapsıyor. Bunlar AnkiMobile'ın belgelenen basit çizim ekinden daha geniş, ürün-özel bir yetenektir; bu yüzden “Anki ile birebir” değil, “Anki medya iş akışını aşan” bir tasarım olarak değerlendirilmelidir. Çoklu dokunma, seçili metni sürükleme, çöp bölgesi ve dışa aktarılan PNG için cihaz testi gereklidir.

**Boş tuval:** Kuralı/düz kâğıtla açılan ayrı bir sayfa, şekiller, metin ve silgi için mantık/test mevcut. AnkiMobile manualindeki çizim eklentisi iPad odaklıdır; iPhone'da daha geniş bir araç seti sunmak uyumluluk ihlali değildir, fakat Anki'nin “birebir” arayüz kopyası da değildir.

**Ses kaydı:** Kayıt tamamlanınca ad üretilip medya deposuna yazılması ve `[sound:...]` eklenmesi kodda mevcut. Hata metninin dosya adı gibi görünmesi raporda yeniden üretilemedi: `AudioRecordModal` için doğrudan test yok. İzin reddi, ilk kayıt, durdurma, hata durumunda kullanıcı metni, eklenmiş sesin kartta görünmesi/çalması ve relaunch offline akışı iPhone'da test edilmelidir.

**Ataç kalıcılığı:** Yapışkan alanlar kaydedilirken ses, görsel ve video işaretleri temizleniyor; bunun birim testi var. Böylece medyanın sonraki karta sızmasını engelleyen koruma mevcuttur. Kaydetmeden geri çıkma, farklı alanın sabitlenmesi ve gerçek ataç simgesi için görsel test yine eksiktir.

### Güvenlik sınırı

Statik incelemede açık bir doğrudan içerik çalıştırma yolu bulunmadı. Kart HTML'i için CSP/sanitizasyon, araç çubuğu HTML'i için izinli yapı ve event/script/iframe temizliği, WebView mesaj boyutu/nonce sınırı, yerel belge/navigasyon kısıtı ve buna yönelik testler mevcut. Bu iyi bir taban sağlar.

Bu durum **“hacklenemez” güvenlik garantisi değildir**. Yayından önce iPhone kontrol listesinde zaten yer alan zararsız `<script>`/`onerror` içeriği, `javascript:`, `data:`, `file:`, dış URL, bozuk medya adı, büyük mesaj ve WebView köprü mesajı denemeleri gerçek cihazda çalıştırılmalıdır. Başarılı ölçüt: kod çalışmaması, navigasyon olmaması, yerel medya dışına erişim olmaması, notun bozulmaması ve uygulamanın kontrollü hata vermesidir. Özel araç çubuğu HTML'i ancak bu sınırı aşmadan çalışmalıdır.

### Deste hiyerarşisi, tarayıcı ve özel çalışma

**Deste seçici:** İlk açılış genişletme mantığı kökleri (ve seçili destenin atalarını) açıyor; tüm alt desteleri açmıyor. `deckPickerExpansion` testleri bunu doğruluyor. Seçicinin içinde yeni deste oluşturup seçme akışı da aynı bağlamda kalıyor. Bu, istenen başlangıç derinliğiyle uyumlu görünüyor.

**Sürükle-bırakla alt deste:** Deck ekranı, kart başka bir destenin orta bölgesine bırakıldığında “X, Y destesinin alt destesi olacak” geri bildirimini üretip `moveDeckUnder` çağrısına yöneliyor. Kod mevcuttur; merkez/eşik bölgeleri, otomatik kaydırma ve gerçek dokunma için UI testi yoktur. Ana deste, kardeş öncesi/sonrası ve döngü yaratmaya çalışma ayrı senaryolar olmalıdır.

**Tarayıcı hizalaması ve bilgi alanı:** Arama alanı 44pt yükseklik, `alignItems: center`, sıfır dikey padding ve `textAlignVertical: center` kullanıyor. Bu, “Kart ara veya deck” yazısının aşağı kayması için kod düzeyindeki düzeltmedir. Etikete göre filtre satırında `new`/`due` hızlı kutucukları görünür filtre olarak bulunmadı. Ancak farklı iOS font metrikleri bunu değiştirebildiği için sonuç yalnızca cihaz ekran görüntüsüyle onaylanabilir. Kart/not bilgi alanlarının semantik doğruluğu için de otomatik görsel test yoktur.

**İstatistiklerde zaman alanı:** Tekrarlar grafiğinde Anki tarzı Kart sayısı/Süre anahtarı ve “Toplam süre” ölçümleri bilinçli olarak hâlâ yer alıyor. Kullanıcının “zaman kısmındaki yukarıdaki istatistikler yazısı” ifadesi hangi etiketi hedeflediğini tekil olarak belirlemeye yetmiyor; bu nedenle denetim bu metni silinmiş kabul etmez. Metin/hedef kesinleştirildiğinde, sayı hesapları veya erişilebilir grafik özeti bozulmadan sadece başlık/yardım metni seviyesinde ele alınmalı ve küçük iPhone ekranında görüntüyle doğrulanmalıdır.

**Filtreli deste ve özel çalışma:** Altı Custom Study seçeneği, arama/sınır/etiket sözleşmeleri ve boş sonuç/ad çakışması için iyi odaklı saf mantık testleri var. Aynı tam ekran filtreli deste formu farklı giriş noktalarından açılıyor. Bu, önemli bir olumlu bulgudur; P0 gecikme boşluğu kapatılmadan yine de tam Anki uyumu değildir.

## Yapılması gereken doğrulama sırası

1. **Önce P0 planlayıcı sözleşmesi:** Resmi Anki sürümü ve kaynak vektörü belirlenmeden önizleme gecikmesini tahmin ederek eklemeyin. Birim testleri, geçici kuyruk, uygulamayı kapat/aç, yeniden oluştur/boşalt ve import/export sınırları birlikte tamamlanmalı.
2. **Araç çubuğu durum makinesi:** Araç işlev matrisi hazırlanmalı; seçili metin, boş imleç, WebView hazır, fallback odakta ve handoff anı satırları için beklenti yazılmalı. iOS simülatör tap-through tek başına yeterli değildir.
3. **Gerçek iPhone medya/WebView turu:** `docs/IOS_RELEASE_CHECKLIST.md` içindeki Media/editor, Empty Cards, Filtered deck options ve Browser satırları tek tek yürütülmeli. Her bulgu için cihaz modeli/iOS sürümü, karanlık/açık mod, Dynamic Type ve kısa ekran kaydı kaydedilmeli.
4. **Uyumluluk kaydı tekleştirilmeli:** Sıralama enumları, UI seçenekleri ve `docs/ANKI_COMPATIBILITY.md` aynı upstream Anki sürümüne göre düzeltilmeli. “subset” durumu tam uyum testi gelmeden kaldırılmamalı.
5. **Güvenlik regresyon seti:** Zararsız saldırı örnekleri CI'da kalan saf fonksiyon testlerine ek olarak, WKWebView üzerinde iPhone yayım öncesi test listesine eklenmeli. Sanitizer'ı gevşeterek biçimlendirme desteği sağlanmamalı.

## Test ve çalışma ağacı notları

- Çalıştırılan kalite komutu başarılı: tip kontrolü, 946 test ve iOS/uyumluluk kayıt doğrulaması.
- Yayın doğrulayıcısı, App Store hukuki kimlik/iletişim alanlarında placeholder bulunduğu uyarısını veriyor. Bu, bu özelliklerin işlevselliğinden bağımsız bir yayın hazırlığı engelidir.
- Denetim başlangıcında çalışma ağacı zaten çok sayıda değiştirilmiş ve izlenmeyen dosya içeriyordu. Bu rapor bu değişiklikleri değiştirmedi veya geri almadı.
- `git diff --check`, önceden değiştirilmiş `lib/photoEditor.ts` sonunda tek bir gereksiz boş satır bildiriyor. Bu denetim kapsamında düzeltilmedi.

## Son karar

Mevcut değişiklikler, sıçramayı azaltan editör geçişi, yerel medyanın bir sonraki karta sızmasını engelleme, fotoğraf için kırpma tercihi, boş tuval, alt deste seçicisi ve Custom Study'nin önemli bir bölümü için somut ilerleme gösteriyor. Ancak önizleme gecikmesi, araç çubuğu/handoff davranışı ve gerçek iPhone kanıtı tamamlanmadan ürünü Anki ile birebir eşdeğer diye sunmak doğru olmaz. Öncelik, yeni görsel özellik eklemek değil, yukarıdaki P0 davranış sözleşmelerini ve gerçek cihaz kanıtını kapatmaktır.
