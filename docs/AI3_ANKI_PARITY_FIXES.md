# AI-3 Anki uyumluluk düzeltmeleri

Tarih: 2026-10-23. Denetim: `2499366:docs/AUDIT_ANKI_PARITY_NON_FSRS.md`.
Dal: `codex/anki-parity-ai3`; başlangıç: `26482671d6ab8da2590f264733b1c176822ee646`.
Çalışma alanı: `/Users/bugra/.codex/worktrees/anki-parity-ai3/tus-flashcard-app`.
Ana çalışma alanındaki başka değişiklikler bu dala alınmadı. Push ve PR yapılmadı.

## Düzeltilen maddeler

| ID | Sonuç ve kanıt |
| --- | --- |
| P0-10 | Değişmeyen eşleşmiş notun eksik kartı, COMMIT öncesinde güvenle indekslenir. Şeması çakışan notun kartları atlanır; yeniden içe aktarma eksik medyayı da tamamlar. `ankiTransferSafety.test.ts`. |
| P0-11 | CSV güncellemesi eşlenmemiş alanları korur. Etiket sütunu yoksa mevcut etiketler korunur; açıkça eşlenmiş boş sütun alanı/etiketleri temizler. Önizleme ve yazma aynı kararı kullanır. `ankiTransferSafety.test.ts`, `importNotes.test.ts`. |
| P0-12 | `#` içeren alanlar dışa aktarımda tırnaklanır; GUID veya ilk alan yorum satırı olarak kaybolmaz. `ankiTransferSafety.test.ts`. |
| P0-13 | Negatif vade korunur. Etkin/askıdaki/gömülü öğrenme kartlarında gün ve saniye/milisaniye dönüşümleri ile orijinal vade ayrı ele alınır. `ankiTransferSafety.test.ts`. |
| BAK-1 | Varsayılan aralık 30 dakika; seçilmiş aralıklar korunur. Eski zorunlu haftalık politika yeni varsayılanlara taşınır. Kapanışta yeni bir yedekleme yaşam döngüsü eklenmedi. `backupSafety.test.ts`. |
| BAK-2 | Bugün/dünün tüm otomatik kopyaları ve 12 günlük, 10 haftalık, 9 aylık kovalar tutulur. Adlandırılmış elle alınan kopyalar korunur; işlem öncesi kopyalar ayrı üç kopyalık grupta döner. `backupSafety.test.ts`, `backup.test.ts`. |
| BAK-3 | Bozuk ham satırlar eksiksiz, `recoveryOnly` işaretli JSON güvenlik kopyasına alınır; tek bozuk satır işlem öncesi yedeği engellemez. Bu dosya doğrudan geri yüklenmez; dışa aktarma ekranından kurtarma dosyası olarak paylaşılır. `backupSafety.test.ts`. |
| BAK-5 | DB okuma hatası boş ve geçerli görünen bir yedek üretmez; işlem hata ile durur. `backupSafety.test.ts`. |
| BAK-6 | Korunan katalog alanları hariç kalırken öğrenci etiketleri, opak kart verisi ve tekrar geçmişi korunur. İçerik yeniden kurulana kadar kalan veriler bekletilir; ilerleme/ek veriler geri yükleme işlemiyle atomik kaydedilir. `backupSafety.test.ts`. |
| AKT-1 | Not türü sabit kimlikle bulunur; alan/şablon kimlikleri zararsız yeniden adlandırmaları ayırt eder. `originalId` kopyası tekrar kullanılır; şema çakışmaları ayrıca raporlanır. `ankiTransferSafety.test.ts`. |
| AKT-2 | Davranışça eşdeğer ön ayarlar tekrar kullanılır. İlgili içe aktarma seçeneklerinde yerel ön ayar, limitler ve sıralama korunur. `ankiTransferSafety.test.ts`. |
| AKT-3 | CSV başlık varsayılanları açık ekran seçimlerini ezmez. `ankiTransferSafety.test.ts`, `importNotes.test.ts`. |
| AKT-4 | SVG/XML/JS/HTML dahil başvurulan medya baytları uzantı nedeniyle atılmaz; mevcut WebView güvenlik sınırları korunur. `ankiTransferSafety.test.ts` ve mevcut güvenlik testleri. |
| AKT-5 | Açık başlık/kullanıcı seçimi yoksa önizleme satırlarında HTML algılanır. `ankiTransferSafety.test.ts`. |
| AKT-6 | Pozitif ve sıfır deste limit geçersiz kılmaları paket gidiş-dönüşünde korunur; günlük sınırsız yeni kart ürün politikası değiştirilmedi. `ankiTransferSafety.test.ts`. |
| ARA-1–ARA-5 | Tarayıcı ve filtreli SQL aynı koleksiyon değerlendiricisini kullanır. Düz metin tüm kayıtlı alanlarda alt dize arar; JSON meta verisi, etiket ve deste adıyla yanlış eşleşmez. Türkçe/Unicode etiketler ICU gerektirmez. Geçersiz sorgu hata verir; eski sonuçlar/seçim temizlenir. Tamamlanmamış seçici taslağı yazılırken tokenizer çalışmaya devam eder. `searchParitySafety.test.ts`, `cardSearchMatch.test.ts`, `searchQuery.test.ts`. |
| AKT-9 | İlerlemesiz içe aktarma kaynak yeni-kart vade sırasını ve kardeşlerin ortak konumunu korur; opak FSRS zamanlama anahtarlarını temizler. `ankiTransferSafety.test.ts`. |
| AKT-10 | İlerleme/ön ayar seçenekleri uygulanmış bir içe aktarma sonradan bayt bayt kaynak paket dışa aktarımına dönmez. `ankiTransferSafety.test.ts`. |
| AKT-11 | Deste kapsamındaki bir not dışa aktarılırken başka destelerdeki kardeşleri de pakete girer. `ankiTransferSafety.test.ts`, `ankiPackageRoundtrip.test.ts`. |
| ARA-9 | `introduced:` elle tarih atama satırını ilk gerçek cevap saymaz. `searchParitySafety.test.ts`. |
| ARA-11 | SQL yolu da ortak Unicode ve hiyerarşik etiket/deste eşlemesini kullanır; ayrı ASCII SQLite eşlemesi kaldırıldı. `searchParitySafety.test.ts`, `cardSearchMatch.test.ts`. |
| ARA-12 | Tamamı tırnaklı nitelikli arama terimleri ortak parser tarafından doğru yorumlanır. `searchParitySafety.test.ts`, `cardSearchMatch.test.ts`. |
| ZAM-5, ZAM-6 | Son Tarihi Ayarla yeni kartın eski konumunu saklar; aralıkta her kart için bağımsız rastgele gün seçer. `browserSelection.test.ts`. |
| BAK-7 | Korumalı içerik nedeniyle reddedilen geri yükleme canlı koleksiyonu tekrar içe aktarmaz. Başarısız kanonik geri yükleme canlı anlık görüntüyü ikinci kez yazmaz; güvenlik kopyası korunur. `backupSafety.test.ts`. |
| BAK-8 | Şema 9 ve öncesinin filtreli deste sıralama değeri güncel DB'ye yazılmadan dönüştürülür. `backupSafety.test.ts`. |
| IST-1–IST-6 | Cevap Butonları uygun tekrar türlerini sayar; Gelecek Vadeler gün içi/orijinal vadeyi ve üst sınır gününü içerir. Günlük yük tam sayıdır; birikmiş tekrarlar bir yılla kesilmez. Aralıklar etkin olmayan tekrar/yeniden öğrenme kartlarını da içerir. Kart Sayıları yedi kategori gösterir; eski boş ekran anlık görüntü API'si geçerlidir. `statsAuditSafety.test.ts`, `ankiStats.test.ts`. |
| P3, medya yeniden adlandırması | Dosya çakışmasını giderirken notun yazar değişiklik damgası artırılmaz; sonraki yazar güncellemesi engellenmez. `ankiTransferSafety.test.ts`. |

## Kısmi düzeltmeler ve kalanlar

- **BAK-4 kısmi:** 50 MiB tavan 512 MiB oldu ve eski sınırın üzerinde bir kopya test edildi. Büyük koleksiyon hâlâ bellekte, eşzamanlı JSON'a çevrilir. Akışla/ham SQLite yedekleme, büyük cihaz yükü profili ve 512 MiB üstü destek yapılmadı.
- **ARA-8 kısmi:** Seçilmiş kardeşler not başına aynı konumu alır; kaydırma da not sayısını kullanır. Rastgele seçeneği, kaydırma tercihinin kalıcılığı, işlem bütünlüğü ve geri alma bu değişiklikte eklenmedi.
- **AKT-7, AKT-8:** CSV sütun/etiket tahmini, ek başlıklar ve ayraç tahmini genişletilmedi.
- **AKT-12:** Koleksiyon paketindeki filtreli desteler, etiket kayıt defteri ve koleksiyon yapılandırması tamamlanmadı. Yerel not sağlama algoritması AI-1 kapsamındadır.
- **AKT-13, AKT-14:** Saklanan kaynak paketlerinin yaşam döngüsü ve büyük paket/bellek limitleri değiştirilmedi.
- **ARA-7, ARA-10, ARA-13:** Tarayıcı vade sıralaması, kaynak oluşturma/düzenleme zamanı ve kalan Anki arama dilinin tamamı uygulanmadı. Ortak değerlendiriciye geçiş tam arama dili eşitliği iddiası değildir.
- **BAK-10:** Kullanıcıya açık medya denetimi ve kullanılmayan dosya temizliği eklenmedi.
- Yukarıda sayılan medya damgası dışında P3 maddeleri ele alınmadı. Başka ajanların sahipliğindeki üretim dosyaları değiştirilmedi.

## Birleştirme ve diğer ajanlara notlar

1. **AI-2 / ortak arama dosyası:** Önce bu dalı birleştirin. `studySearchSql.ts` dışa açık fonksiyon imzalarını korur; eşleşen kimlikler `json_each(?)` üzerinden SQL'e verilir. AI-2'nin filtreli deste değişikliklerini eski ayrı metin değerlendiricisini geri getirmeden birleştirin. Bu uygulama koleksiyonu tarar; büyük iPhone koleksiyonlarında performans ölçümü sonraki kapıdır.
2. **AI-2 / zamanlama:** `ankiState.ts`, zamanlayıcı/kuyruk ve `fsrs*.ts` değiştirilmedi. Paket sınırındaki gün/saniye/milisaniye ve orijinal vade dönüşümleri düzeltildi. `browserSelection.ts` mevcut FSRS veri API'sini kullanır; Son Tarihi Ayarla'nın eski çağrıları değişmeden çalışır.
3. **AI-1 / sağlama:** AKT-12'nin FNV/SHA1 kısmı `models.ts` sahipliği nedeniyle bırakıldı. Not/şablon/deste deposu üretim koduna müdahale edilmedi.
4. **Katalog yeniden kurulumu:** Bekleyen öğrenci ek verileri `app/backups.tsx` içinde içerik uzlaştırmasından sonra ve ekran tekrar açılınca uygulanır. İleride başka geri yükleme giriş noktası eklenirse aynı uygulama adımını içerik kurulumu sonrasına bağlayın; bekleyen veriyi kurulumdan önce silmeyin.
5. **Belgeler:** Uyumluluk matrisi, ilgili NOTES bölümleri ve kaynak kayıt defterinde başka ajanların satırlarını koruyarak birleştirin. Ana checkout'taki kaydedilmemiş değişiklikler bu worktree'ye kopyalanmadı.

## Yerel commitler

| Commit | Birim |
| --- | --- |
| `0a1b5fc` | P0 paket/metin veri güvenliği |
| `822d135` | Yedek politikası, kurtarma ve katalog öğrenci verisi |
| `0ddbd8b` | Ortak ve güvenli arama |
| `61573dc` | Paket kimliği, ön ayarlar, limitler ve medya |
| `a371a58` | Eksik tür tanımında tüm kayıtlı alanları arama |
| `71331e6` | Orijinal vade, ilerlemesiz paket ve kardeş dışa aktarımı |
| `6f1360c` | İstatistik hesapları ve yedi kategori |
| `b872aaf` | Eski konumu koruma ve not başına yeniden konumlandırma |
| `46e03e9` | İstatistik başlangıç anlık görüntüsü API uyumu |
| `71edaaa` | Bekleyen katalog verisi ve atomik geri yükleme |
| `b1d7056` | Medya düzeltmesinde yazar değişiklik damgası |
| `d89aeea` | Yazılmakta olan arama taslağı ve katı sorgu ayrımı |
| `70f4553` | Reddedilen kanonik geri yüklemede canlı DB'yi tekrar yazmama |

## Doğrulama

- `npm run quality`: geçti; TypeScript, **164 dosyada 1.761 test**, iOS yapılandırması ve uyumluluk kayıt defteri doğrulaması. Önceden var olan App Store yayıncı/adres/iletişim yer tutucusu uyarısı devam eder.
- `npm run build:web`: geçti; üretim çıktısı `dist/`.
- `git diff --check`: geçti.
- Yeni odaklı regresyon dosyaları: `ankiTransferSafety.test.ts`, `backupSafety.test.ts`, `searchParitySafety.test.ts`, `statsAuditSafety.test.ts`; mevcut ilgili testler de güncellendi.
- Fiziksel iPhone smoke **yapılmadı**. `xcrun devicectl list devices` kayıtlı iPhone 13 ve iPhone 15'i `unavailable` gösterdi. Önceki sandbox denemesinde CoreDevice başlatma zaman aşımı da görüldü. Simülatör sonucu fiziksel cihaz doğrulaması yerine sunulmadı.
- Sürüm öncesi `IOS_RELEASE_CHECKLIST.md` kapsamında iPhone Files içe/dışa aktarma ve paylaşım; aynı paketi güncelleme/eksik SVG medya; bozuk koleksiyonda güvenlik kopyası ve geri yükleme; katalog öğrenci verisinin yeniden kurulumdan sonra dönmesi; geçersiz/Unicode tarayıcı araması; yedi kategori ve grafik etkileşimleri kontrol edilmelidir.

Davranış ve kaynak sınırları `ANKI_COMPATIBILITY.md`, ilgili `ANKI_COMPATIBILITY_NOTES.md` bölümleri ve kanonik `anki-reference-sources.json` içinde kaydedildi. Algoritmalar odaklı testlerle bağımsız uygulandı; GPL uygulama kodu kopyalanmadı.
