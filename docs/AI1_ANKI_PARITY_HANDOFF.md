# AI-1 Anki uyumluluk düzeltmeleri — devir notu

Tarih: 23 Ekim 2026. Başlangıç: `2648267`. Dal: `codex/anki-ai1-data-safety`.
Çalışma kopyası: `/Users/bugra/.codex/worktrees/anki-ai1-data-safety/tus-flashcard-app`.
Ana çalışma alanının mevcut değişiklikleri korunmuştur. Push/PR yapılmamıştır.

## Tamamlanan kapsam

| ID | Sonuç ve kanıt |
| --- | --- |
| P0-1 | Sahip olunan silme yolları revlog'u korur; kart silme SQL'i `noteDeletion.deleteCardRows` altında toplandı. Not/deste silme tek kullanımlık, çakışmada veri ezmeyen geri alma sonucu döndürür; editör ve Desteler bunu gösterir. Tarayıcı/çalışma ekranı geri alma UI bağlantısı diğer ajanlara aittir. `noteDeletion.test.ts` |
| P0-2 | Düzenleme yalnızca eksik kartları ekler; boşalan cloze/ters kartın kimliği, zamanlaması, destesi ve geçmişi korunur. `noteCardGeneration.safety.test.ts`, düzeltilmiş `noteManager.newTypes.test.ts`, `catalogEditing.test.ts` |
| P0-3 | Alan eşleme önce tam ada, sonra henüz kullanılmamış alana göre yapılır; şablonlar ada göre eşlenir. Boş ama eşlenmiş kartlar korunur. Toplam eşlenmeyen kart sayısı yazmadan önce hesaplanır ve açık onay bayrağı olmadan dönüşüm engellenir. Tarayıcı onay/eşleme/geri alma UI'si tamamlanmadı; aşağıdaki AI-3 notuna bakın. |
| P0-4 | Güvenli editör görünümü kaynak HTML'den ayrıldı. `[sound:]`, linkler, uzak resim referansları, SVG/MathML/style ve temizlenen öznitelikler yanlarındaki metin düzenlendiğinde korunur. Desteklenmeyen aktif öğeler görünümde inert yer tutucudur; kaynak editöründe düzenlenebilir. 2 MB kesmesi kaldırıldı. Sunucu/istemci derlemelerinde sabit script ve CSP karması test edildi. |
| P0-5 | Boş Kartlar'da Notları Koru varsayılan açık; tüm kartlar boşsa ilk sıradaki kart kalır. Kartsız okunabilir notu onarım silmez, kurtarma destesinde kart 1 üretir. `orphanNotesRecovered` sayacı eklendi, eski silme sayacı sıfır kalır. |
| P0-9, DST-2 | Ad parçaları kırpılır/NFC yapılır, boş parça `blank` olur, harf varyantları mevcut desteye çözülür. Silme/yeniden adlandırma/gömmeyi açma sorguları eski harf çakışmalı ağaçları `instr` ile tam öneke göre ayırır. Diğer ajanların sorgularında kalan yerler aşağıdadır. |
| SAB-1 | Alan yeniden adlandırma/silme, her iki yüzdeki alan/filtre/koşul referanslarını günceller. |
| SAB-2, SAB-3 | Üretim sabit şablon metnine değil, görüntüleme filtrelerinden önceki dolu alanlara bakar; Tags desteklenir. Editörün boş div/br sarmalları boş sayılır; boşluklu koşul belirteçleri okunur. |
| SAB-4, SAB-5 | Arka şablonda ayrı type belirteci yoksa FrontSide'da karşılaştırma görünür. `type:cloze` yalnız giriş kutusu sağlar, cloze cümlesini ikinci kez çizmez. |
| SAB-6, SAB-8 | Çok alanlı cloze ordinal birleşimi; cloze'suz notta uyarı ve kullanıcı devam ederse güvenlik kartı 1. Boş Kartlar aynı ordinal kaynağını kullanır. |
| SAB-7 | Başlangıç commit'inde zaten düzeltilmişti; farklı destelerdeki kardeşleri koruyan regresyonlar geçirildi. |
| EDT-1 | HTML'den arındırılmış, NFC ilk alanın SHA1 ilk dört baytı kullanılır. İçe aktarılmış SHA1 ve eski yerel FNV satırları mükerrer kontrolünde bulunur; okuma sırasında koleksiyon göçü yapılmaz. Tam HTML5 adlandırılmış entity tablosu henüz yoktur. |
| EDT-2 | Başarılı Ekle'den sonra deste başına son not türü, sonra koleksiyon geneli tür hatırlanır. Başarısız dayanıklı kayıtta tercih değişikliği geri alınır. |
| DST-1 | Öğrenme/yeniden öğrenme adımı değişince veya başka ön ayar atanınca geçen son gecikmeye göre kalan adım eşlenir. Askı/gömme ve filtreli destede ana ön ayar dikkate alınır; due/queue birimleri değişmez. Ön ayar ve sayaç yazıları aynı savepoint içindedir. |
| DST-3, DST-4 | Desteler'de `::` hiyerarşik ad kabul edilir. Deste 1'in içeriği silinse de kimliği kalır; adı Default'a döner. Geri alma eski ad/ağacı geri getirir. |
| SAB-11, SAB-15 | Gerçek alanlar aynı adlı özel alanların önüne geçer. Yeni stok yazmalı cevap şablonunun arkası Front kullanır; kayıtlı/içe aktarılmış şablonlara toplu göç yapılmaz. |
| BAK-9 | Sabit etiket metninin arkasındaki boş alan Boş Kartlar'da bulunur. |

## AI-2'ye notlar

- `deleteNote(id)` ve `deleteTusCardByCardId(id)` artık `{ cardCount, undo() }` döndürür. Çalışma ekranındaki silme eylemi bu sonucu kullanabilir. Editör ve deste listesi bağlantısı hazır; koleksiyon geneli geri alma yığını eklenmedi. Sonuç yalnız çağıran bellekte tuttuğu sürece yaşar, uygulama yeniden açıldıktan sonra yaşamaz.
- P0-6 için arada düzenleme/silme yapıldığında eski cevap/işlem anlık görüntüsünün yazılmasını engelleyen kendi değişikliğin hâlâ gerekli.
- `deckStore.ts` içindeki filtreli deste silmede `returnFilteredCardsHome` korunmuştur. P0-14'teki askı/gömme ve odue anlamlarını kendi filtreli deste çözümünle birleştir.
- P0-9'un `studyCardRows.ts`, `reviewLogger.ts` ve ilgili kuyruk sorgularındaki LIKE öneklerini de tam, literal alt ağaç eşlemesine çevir. `getDeckByName` artık normalleştirilmiş harf-duyarsız geri dönüş içerir; eski çakışmada tam yazılan isim önceliklidir.
- `deckPresetSteps.ts` yalnız kalan öğrenme sayacı, mod/usn ve JSON'u yazar. Kartın due/queue/FSRS değerlerini değiştirmez. Ön ayar kaydı/ataması içinde çağrılır; aynı kartı ikinci kez eşleme.
- Sınırsız yeni kart ürün politikası değiştirilmedi; FSRS modüllerine dokunulmadı.

## AI-3'e notlar

- `components/browser/BrowserDialogs.tsx` not türü satırı hâlâ `runSelectionAction(() => changeNotesType(...))` çağırıyor. `getNoteTypeChangeDeletionCount(ids, targetId)` doğrudan `lib/noteTypeStore.ts` üzerinden salt okunur kullanılabilir. Sayı > 0 ise kaç kartın silineceğini açıkça göster; ancak kullanıcı onayladıktan sonra `changeNotesType(ids, targetId, { allowCardDeletion: true })` çağır. Normal iki argümanlı çağrı veri silmeden `NoteTypeChangeConfirmationRequired` fırlatır; hata `cardCount` içerir. Alan/şablon eşleme UI'si ve dönüşümün geri alınması hâlâ açık kapıdır.
- Tarayıcı not silmesinin geri alma UI'si için yukarıdaki `DeletionUndo` sonucunu koru. Sahip olduğun silme yollarında revlog silme ekleme.
- Ayarlar onarım özetine `repair.orphanNotesRecovered` için “N kartsız notun ilk kartı yeniden oluşturuldu” satırı eklenmeli. `orphanNotesDeleted` artık hep 0; eski API kaldırılmadı. `app/settings.tsx` sahiplik dışında olduğundan düzenlenmedi.
- P0-9 için `browserRepository.ts`, `studySearchSql.ts`, `ankiStats.ts` ve `exportNotes.ts` alt ağaç kapsamları hâlâ sizin düzeltmenizi gerektirir. Yanlış ASCII LIKE eşleşmesine güvenmeyin; literal karakterleri ve Unicode'u gözetin.
- `checksumField` artık SHA1 uyumlu. Metin içe aktarımının mevcut checksum bazlı eşlemesi bundan yararlanır, ancak eski yerel FNV satırları için import tarafında gerekirse ayrı uyum yolu gerekir. Okuma amaçlı editör duplicate kontrolü fallback içerir. Tam HTML entity desteği henüz eklenmedi.
- BAK-3: onarımın güvenlik yedeği kartsız/bozuk satırlarda hâlâ engellenebilir; bu dal yedek doğrulamasını değiştirmedi. Güvenlik yedeği ve açık onay zorunluluğu korunmuştur.

## İsteğe bağlı alanda kalanlar

SAB-9, SAB-10, SAB-12, SAB-13, SAB-14; EDT-3..EDT-9; DST-5..DST-11 ve bu alanların P3 listesi tamamlanmadı. Bu dal tam Anki eşdeğerliği iddia etmez. P0-1/P0-3/P0-9'un sahiplik dışı UI/sorgu bağlantıları yukarıda açıkça ayrıldı.

## Doğrulama

- `npm run quality`: **170 dosya, 1744 test geçti**; TypeScript, iOS yapılandırması ve Anki kaynak kaydı geçti. App Store yasal kimlik/adres/iletişim yer tutucuları için mevcut yayın öncesi uyarı sürer.
- `npm run build:web`: üretim web export'u başarılı.
- Chrome **155.0.8059.85**, yalıtılmış headless bağlam: dokuz HTML/media fikstüründe yakındaki metin düzenlemesi kaynak içeriğini aynen korudu; script/onerror çalışmadı.
- Üretim export'u uzantısız `/editor` route'unda gerçek CSP altında açıldı: iki zengin metin iframe'i hazır/çalışır; pageerror ve console error yok.
- `richTextEditorBuild.test.ts`: ES2018 ve ES2022 çıktılarına rağmen editör scripti ve CSP karması aynı.
- 100 düzeyli deste ağacı regresyonu, zaman aşımını yükseltmeden geçirildi.
- Fiziksel iPhone testi yapılmadı. Yayın öncesi Media/editor, Typed-answer reviewer, Empty Cards ve Database check/repair duman testleri; silme Geri Al, cloze uyarısı ve not türü hatırlama kontrolleri gerekir. Kontrol listesi yeni yazmalı cloze sözleşmesine güncellendi.

Her mantıklı birim ayrı commit'tedir; değişen yeteneklerin matris/not/kaynak kayıtları birlikte güncellendi. Birleştirme sonrası AI-2/AI-3 belgeleriyle çatışmaları içerik bazında çözün ve `npm run quality` tekrar çalıştırın.
