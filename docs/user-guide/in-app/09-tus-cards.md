# TUS Kartları — uygulama içi metinler

Kaynak makale: `tr/17-tus-card-pack.md`, `en/17-tus-card-pack.md` (id `tus-cards`).
Bu sürümde ödeme kapalıdır; aşağıdaki metinlerin hiçbiri fiyat, satın alma veya deneme anlatmaz.
Ödeme açıkken görünen metinler (`app/catalog.tsx:198-205`, `297-304`, `331-332`, `338-348`,
`368-399`) bu dosyanın kapsamı dışındadır ve değiştirilmez.

---

## 1. Bilgi sayfası

### help.tusCards.sheet — TUS Kartları bilgi sayfası (yeni)
- **Yer:** TUS Kartları ekranı, üst çubuk, **Kilitli/Açık** çipinin solunda yeni ⓘ düğmesi, `app/catalog.tsx:130` (statusChip'ten önce). Yalnızca iPhone ve web; ekran tam ekran modal.
- **Tetikleyici:** ⓘ'ye dokunma. Erişilebilirlik etiketi: "TUS Kartları hakkında" / "About TUS Kartları".
- **Bileşen:** bilgi sayfası (`HelpSheet`, `SwipeDismissSheet` üzerinde; eyebrow, title, summary, points[], note, more)
- **Daha fazla bilgi:** `tr/17-tus-card-pack.md#what-is-included` (`help?article=tus-cards&section=what-is-included`)
- **Durum:** Yeni

**TR**
- Üst başlık: HAZIR KART PAKETİ
- Başlık: TUS Kartları nasıl çalışır?
- Özet: Paket ücretsizdir, cihazınıza kurulur ve kendi destelerinizin yanında ayrı bir deste olarak durur.
- Maddeler: (1) Bütün kartlar yeni kart olarak gelir; günde kaç yeni kart açacağınızı siz seçersiniz. (2) Kartların metnini, etiketlerini ve bayraklarını değiştirebilirsiniz; paket destelerini yeniden adlandırmak, silmek, taşımak ve dışa aktarmak kapalıdır. (3) Yedekler çalışma durumunuzu ve etiketlerinizi saklar, kart metnini saklamaz; `.colpkg` dosyası paketi hiç içermez. (4) Düzeltmeler uygulama güncellemesiyle gelir; çalışma durumunuz korunur.
- Not: Paket tek başına kaldırılamaz; yalnızca Ayarlar › Veri yönetimi › İlerlemeyi sıfırla bütün koleksiyonla birlikte kaldırır.

**EN**
- Eyebrow: READY-MADE CARD PACK
- Title: How TUS Kartları works
- Summary: The pack is free, installs on your device and sits as a separate deck next to your own decks.
- Points: (1) Every card arrives as a new card; you choose how many new cards to open each day. (2) You can change the cards' text, tags and flags; renaming, deleting, moving and exporting the pack decks is turned off. (3) Backups keep your study state and tags, not the card text; a `.colpkg` file does not contain the pack at all. (4) Corrections arrive with app updates; your study state is kept.
- Note: The pack cannot be removed on its own; only Settings › Data Management › Reset progress removes it, together with the whole collection.

---

## 2. TUS Kartları ekranı (`app/catalog.tsx`)

| ID | Yer (kontrol, dosya:satır) | Tür | TR | EN | Durum |
| --- | --- | --- | --- | --- | --- |
| help.tusCards.badgeUnlocked | Hero rozeti, paket açıldıktan sonra, `app/catalog.tsx:169` | rozet | AÇIK | UNLOCKED | Mevcut — güncelle (eski metin: "SATIN ALINDI" / "PURCHASED"; ödeme kapalıyken yanlış) |
| help.tusCards.badgeLocked | Hero rozeti, paket kilitliyken, `app/catalog.tsx:169` | rozet | HAZIR KART PAKETİ | READY-MADE CARD PACK | Mevcut — güncelle (eski metin: "PREMIUM KART PAKETİ" / "PREMIUM CARD PACK"; ücretli izlenimi veriyor) |
| help.tusCards.subdeckHint | "Paket içeriği" ipucunun ikinci cümlesi, `app/catalog.tsx:221-224` | ipucu | Alt desteler, paketi hazırlayanın konu etiketlerinden ve etiketsiz kartlarda kart metnindeki konu terimlerinden oluşur. Hiçbir konuya yerleşmeyen kartlar dersin kendi destesinde kalır ve ders çalışılırken gelir. | Subdecks come from the pack author's topic tags and, for untagged cards, from the subject terms in the card text. Cards that fit no topic stay in the course deck itself and come up when you study the course. | Mevcut — güncelle (eski metin: "Alt desteler, paketi hazırlayanın kendi etiketlerinden gelir; etiketsiz kartlar dersin kendi destesinde kalır." — eksik: Anatomi, FHE, Patoloji, Farmakoloji alt destelerinin hepsi metinden oluşur, `lib/bkaTaxonomy.ts:1-17`) |
| help.tusCards.hintFree | "Paket içeriği" ipucunun ilk cümlesi (kilitli), `app/catalog.tsx:214/217` | ipucu | "Kartları ücretsiz aç düğmesine dokunduğunuzda tüm kartlar deste listenize eklenir." | "Tap Unlock cards for free to add every card to your deck list." | Mevcut — koru |
| help.tusCards.hintOwned | "Paket içeriği" ipucu (açık), `app/catalog.tsx:211` | ipucu | "Desteler koleksiyonuna eklendi." | "These decks are in your collection." | Mevcut — koru |
| help.tusCards.ungroupedRow | Ders açıldığında "Konu etiketi olmayan kartlar" satırı, `app/catalog.tsx:280` | satır etiketi | Konuya ayrılmamış kartlar | Cards not sorted into a topic | Mevcut — güncelle (eski metin: "Konu etiketi olmayan kartlar" / "Cards without a topic tag"; etiketsiz kartların çoğu metinden bir konuya yerleşir, bu satırdakiler hiçbir konuya yerleşmeyenlerdir) |
| help.tusCards.infoRules | Bilgi kartı, "Kendi kartların ayrı kalır" satırından sonra yeni ✓ satırı, `app/catalog.tsx:305-308` sonrası | bilgi satırı (başlık + metin) | Başlık: Metni düzenlenebilir · Metin: Kartların metnini, etiketlerini ve bayraklarını değiştirebilirsiniz. Paket destelerini yeniden adlandırmak, silmek ve dışa aktarmak kapalıdır. | Title: Text you can edit · Text: You can change the cards' text, tags and flags. Renaming, deleting and exporting the pack decks is turned off. | Yeni |
| help.tusCards.infoBackups | Bilgi kartı, yeni satırdan sonra ikinci yeni ✓ satırı | bilgi satırı | Başlık: İlerlemeniz yedeklenir · Metin: Yedekler her kartın çalışma durumunu ve etiketlerinizi saklar. Kart metni uygulamayla gelir; yedeğe ve dışa aktarılan dosyalara girmez. | Title: Your progress is backed up · Text: Backups keep each card's study state and your tags. The card text comes with the app and is not part of backups or exported files. | Yeni |
| help.tusCards.ownCardsTitle | Bilgi kartı satır başlığı, `app/catalog.tsx:306` | başlık | Kendi kartlarınız ayrı kalır | Your own cards stay separate | Mevcut — güncelle (eski metin: "Kendi kartların ayrı kalır"; "sen" hitabı, metnin geri kalanı "siz") |
| help.tusCards.installing | Kurulum penceresi, `app/catalog.tsx:406-410` | ilerleme | "Kartlar kuruluyor" + "TUS Kartları deste listeniz için hazırlanıyor. Bu işlem birkaç saniye sürebilir." | "Installing cards" + "Preparing TUS Cards for your deck list. This can take a few seconds." | Mevcut — koru |
| help.tusCards.unlocked | Başarı uyarısı, `app/catalog.tsx:68-74` | uyarı | "Paket açıldı" + "9.575 kartın tamamı deste listenize eklendi." | "Package unlocked" + "All 9,575 cards were added to your deck list." | Mevcut — koru |
| help.tusCards.installFailed | Hata uyarısı (ödeme kapalı), `app/catalog.tsx:77-81` | uyarı | Kartlar açılamadı · Kartlar kurulamadı. Koleksiyonunuz değiştirilmedi. Uygulamayı kapatıp yeniden açın; kurulum kendiliğinden yeniden denenir. | Cards could not be unlocked · The cards could not be installed. Your collection was not changed. Close and reopen the app; the installation is tried again automatically. | Mevcut — güncelle (eski metin: "Kartlar kurulamadı. Lütfen uygulamayı yeniden başlatıp tekrar deneyin." — yeniden açılışta kurulum zaten kendiliğinden başlar, `contexts/AppContext.tsx:224-228`) |
| help.tusCards.legalFree | Yasal satır, `app/catalog.tsx:327-328` | dipnot | "Kartlar yalnızca sınava hazırlık ve eğitim amaçlıdır; …Bu erişim için ücret alınmaz." | "The cards are for exam preparation and education only; … There is no charge for this access." | Mevcut — koru |

## 3. Desteler sekmesi (`app/(tabs)/decks.tsx`)

| ID | Yer (kontrol, dosya:satır) | Tür | TR | EN | Durum |
| --- | --- | --- | --- | --- | --- |
| help.tusCards.lockedRow | Kilitli TUS Kartları satırı, alt satır ve hap, `decks.tsx:1399-1413` | satır | "9.575 kart · 12 ders · 106 alt deste" + **Ücretsiz aç** | "9,575 cards · 12 courses · 106 subdecks" + **Unlock free** | Mevcut — koru |
| help.tusCards.lockedRowA11y | Kilitli satırın erişilebilirlik etiketi, `decks.tsx:1388-1391` | erişilebilirlik etiketi | TUS Kartları hazır kart paketi, 9.575 kart. Ücretsiz kurmak için dokunun. | TUS Kartları ready-made card pack, 9,575 cards. Tap to install it for free. | Mevcut — güncelle (eski metin: "…kart paketi, 9575 kart, ücretsiz açmak için dokun" — "sen" hitabı, sayı biçimsiz) |
| help.tusCards.menuFooter | Paket destesinin ••• menüsü, son öğenin altı (yalnızca `isCatalog`), `decks.tsx:1494-1495` | dipnot (dokunulmaz) | Hazır paket destesi: yeniden adlandırma, silme, alt deste, açıklama ve dışa aktarma kapalıdır. İstemediğiniz bir dersi kapalı tutabilir veya Kartlarım'da askıya alabilirsiniz. | Ready-made pack deck: renaming, deleting, subdecks, description and export are turned off. You can keep a course you don't want folded, or suspend it in the Card Browser. | Yeni |
| help.tusCards.dragHandleA11y | Paket destesi satırındaki soluk taşıma tutamağı, `decks.tsx:1344-1352` | erişilebilirlik etiketi | Hazır paket desteleri taşınamaz | Ready-made pack decks cannot be moved | Mevcut — güncelle (eski metin: "Filtrelenmiş desteler alt deste olarak taşınamaz" — paket destelerinde de bu okunuyor; `isCatalogDeck` için ayrı etiket) |

## 4. Not düzenleme ekranı, paket notu (`app/editor.tsx`)

| ID | Yer (kontrol, dosya:satır) | Tür | TR | EN | Durum |
| --- | --- | --- | --- | --- | --- |
| help.tusCards.editorHint | **Tür:/Deste:** satırlarının altı, ilk alan etiketinin üstü; yalnızca `isCatalog && !isContentReadOnly`, `editor.tsx:1197` sonrası | bilgi satırı + **Daha fazla bilgi** (`help?article=tus-cards&section=editing`) | TUS Kartları notu. Metin değişiklikleriniz içerik güncellemelerinde korunur ama yedeklere ve dışa aktarılan dosyalara girmez. | TUS Kartları note. Your text changes are kept through content updates but are not part of backups or exported files. | Yeni |
| help.tusCards.addRedirect | Paket destesinin ••• › **Ekle** ile açılan ekleme ekranı, **Deste:** satırının altı; yalnızca istenen deste paket destesiyse, `decks.tsx:1449` → `editor.tsx:1177-1197` (yeni `fromCatalogDeck` parametresi gerekir) | ipucu | Hazır paket destelerine not eklenemez. Bu not yukarıdaki desteye eklenecek. | Notes cannot be added to ready-made pack decks. This note will go to the deck above. | Yeni |
| help.tusCards.typeLocked | **Tür:** satırına dokunma, `editor.tsx:1151-1153` | uyarı | "Korumalı Kart" + "Dahili TUS kartlarının not türü değiştirilemez." | "Protected Card" + "Note type of built-in TUS cards cannot be changed." | Mevcut — koru |
| help.tusCards.deckLocked | **Deste:** satırına dokunma, `editor.tsx:1180-1182` | uyarı | "Korumalı Kart" + "Dahili TUS kartları başka bir desteye taşınamaz." | "Protected Card" + "Built-in TUS cards cannot be moved to another deck." | Mevcut — koru |

## 5. Yedekler, dışa aktarma, ayarlar

| ID | Yer (kontrol, dosya:satır) | Tür | TR | EN | Durum |
| --- | --- | --- | --- | --- | --- |
| help.tusCards.backupHint | Yedekler ekranı, **Şimdi yedekle** düğmesinin altı, `app/backups.tsx:234` sonrası | ipucu + **Daha fazla bilgi** (`help?article=tus-cards&section=backups-and-export`) | Yedekler TUS Kartları'ndaki çalışma durumunuzu ve etiketlerinizi saklar; kart metnini saklamaz. Yedekler bu cihazda kalır. | Backups keep your study state and tags in TUS Kartları, not the card text. Backups stay on this device. | Yeni |
| help.tusCards.exportHint | Dışa aktar ekranı, .colpkg seçiliyken ipucu, `app/export.tsx:300` | ipucu | .colpkg, TUS Kartları dışındaki bütün koleksiyonu çalışma programıyla birlikte içerir. | .colpkg contains the whole collection with scheduling, except TUS Kartları. | Mevcut — güncelle (eski metin: ".colpkg tüm koleksiyonu çalışma programıyla birlikte içerir." — paket dosyaya girmez, `lib/exportAnkiPackage.ts:110-115`) |
| help.tusCards.resetConfirm | Ayarlar › Veri yönetimi › **İlerlemeyi sıfırla** onayı, `app/settings.tsx:979` | onay metni | Bütün desteleriniz, kartlarınız, çalışma geçmişiniz ve TUS Kartları paketi silinecek. Önce geri yüklenebilir bir güvenlik yedeği oluşturulacak. Paketi daha sonra yeniden ücretsiz kurabilirsiniz. | All your decks, cards, review history and the TUS Kartları pack will be deleted after a restorable safety backup is created. You can install the pack again for free later. | Mevcut — güncelle (eski metin: "Kartlar, çalışma geçmişi ve ilerleme silinecek. Önce geri yüklenebilir bir güvenlik yedeği oluşturulacak." — paketi ve açılış işaretini de sildiği söylenmiyor) |
| help.tusCards.repairLine | Ayarlar › Veritabanını kontrol et sonucu, `app/settings.tsx:834-839` | sonuç satırı | {n} TUS Kartları satırına dokunulmadı; paket uygulamanın bir sonraki açılışında kendiliğinden onarılır. | {n} TUS Kartları rows were left alone; the pack repairs itself the next time the app opens. | Mevcut — güncelle (eski metin: "…katalog satırına dokunulmadı; ücretli içerik yeniden kurularak onarılır." — "ücretli" yanlış; kullanıcıya yeniden kurma düğmesi yok) — **Ekip notu:** "kendiliğinden onarılır" ancak eksik kart yeniden kurulumu tetikliyorsa doğrudur (`lib/bkaCatalog.ts:894-906`); doğrulanmadan yazılmamalı |
| help.tusCards.presetHint | Deste seçenekleri, **Ayar grubu** satırı; açık deste paket destesiyse altında ipucu, `app/deck-options.tsx:1113-1119` | ipucu + **Daha fazla bilgi** (`help?article=tus-cards&section=presets`) | Bu, TUS Kartları paketinin ayar grubudur. İçerik güncellemesinden sonra paket desteleri bu grubun ilk değerlerine döner. | This is the TUS Kartları pack's preset. After a content update, the pack decks return to this preset's original values. | Yeni |
| help.tusCards.emptyDeckLink | Çalışma ekranı "Bu Deste Henüz Boş" durumu, **Kart Ekle** düğmesinin altında ikincil bağlantı; TUS Kartları kurulu değilse, `app/(tabs)/index.tsx:3244` sonrası → `/catalog` | ikincil düğme | Hazır 9.575 TUS kartını ücretsiz ekleyin | Add 9,575 ready-made TUS cards for free | Yeni |

## 6. Yanlış veya yalnız Türkçe mesajlar (iki dilli yeniden yazım)

| ID | Yer (kontrol, dosya:satır) | Tür | TR | EN | Durum |
| --- | --- | --- | --- | --- | --- |
| help.tusCards.browserDelete | Kartlarım › seçim › **Diğer › Notları sil**, paket kartı seçiliyken, `components/browser/BrowserMenus.tsx:187-192` | uyarı | Katalog Korumalı · TUS Kartları paketindeki notlar silinemez. Çalışmak istemediğiniz kartları askıya alabilirsiniz. | Catalog Protected · Notes in the TUS Kartları pack cannot be deleted. You can suspend cards you don't want to study. | Mevcut — güncelle (eski metin: "…Kataloğu kaldırmak için Ayarlar ekranını kullanabilirsiniz." / "Use Settings to remove the catalog." — Ayarlar'da böyle bir seçenek yok) |
| help.tusCards.importRejected | İçe aktarma hatası, paket notu içeren dosya; "Hata"/"Error" başlığıyla, `lib/catalogProtection.ts:38` → `app/import.tsx:435-438` | uyarı | Bu dosya TUS Kartları paketinden kartlar içeriyor ve içe aktarılamaz. Paketi Desteler'deki TUS Kartları satırından ücretsiz kurabilirsiniz. | This file contains cards from the TUS Kartları pack and cannot be imported. You can install the pack for free from the TUS Kartları row in Decks. | Mevcut — güncelle (eski metin: "Bu dosyada ücretli BKA kartları bulundu. Katalog yalnızca uygulama içi satın alma ile etkinleştirilebilir." — yalnız Türkçe, ödeme kapalıyken yanlış) |
| help.tusCards.deckNotDeletable | Veri katmanı hatası, `lib/catalogProtection.ts:150` | hata | TUS Kartları desteleri silinemez. | TUS Kartları decks cannot be deleted. | Mevcut — güncelle (eski metin: "Katalog desteleri silinemez. Kataloğu Ayarlar ekranından kaldırabilirsiniz." — yalnız Türkçe; Ayarlar iddiası yanlış) |
| help.tusCards.noteNotDeletable | Veri katmanı hatası, `lib/catalogProtection.ts:162` | hata | TUS Kartları notları silinemez. Çalışmak istemediğiniz kartları askıya alabilirsiniz. | TUS Kartları notes cannot be deleted. You can suspend cards you don't want to study. | Mevcut — güncelle (eski metin: "Katalog kartları tek tek silinemez. Kataloğu Ayarlar ekranından kaldırabilirsiniz." — yalnız Türkçe; Ayarlar iddiası yanlış) |
| help.tusCards.otherDataErrors | Diğer veri katmanı hataları, `lib/catalogProtection.ts:156-196`, `lib/deckStore.ts:535`, `lib/noteStore.ts:283`, `lib/export*.ts` | hata | (her biri için mevcut Türkçe metin korunur, "ücretli" kelimesi "TUS Kartları" ile değiştirilir) | (English counterpart added for each) | Mevcut — güncelle (yalnız Türkçe; arayüz çoğunu önceden engellediği için nadiren görünür) |

Mevcut — koru (koruma uyarıları, iki dilli ve doğru): `decks.tsx:607-608`, `616-617`, `656-657`,
`862-863`; `app/export.tsx:149-150`; `components/browser/BrowserMenus.tsx:116-117`, `132-133`,
`172-173`; `components/browser/BrowserBars.tsx:195-196`; `app/browser.tsx:759-760`, `767-768`.
