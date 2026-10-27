# Desteler, Genel bakış, filtrelenmiş deste ve Özel çalışma — uygulama içi metinler

Kapsam: Desteler sekmesi (`app/(tabs)/decks.tsx`), satır ve sütunlar
(`components/decks/DeckListTable.tsx`), **＋** ve **⋮** menüleri, deste **•••** menüsü ve
iletişim kutuları, Genel bakış (`app/deck-overview.tsx`), deste seçici
(`components/DeckPickerModal.tsx`), filtrelenmiş deste formları (`decks.tsx` `renderFilterModal`,
`components/FilteredDeckOptionsModal.tsx`) ve Özel çalışma (`components/CustomStudyModal.tsx`).
Satır numaraları master c6108e6'ya göredir. Platform belirtilmeyen her öğe iPhone ve web için
geçerlidir.

Durum: **Yeni** · **Mevcut — koru** · **Mevcut — genişlet** · **Mevcut — güncelle (eski metin: …)**

---

## 0. Yardım merkezine iPhone girişi

Kenar çubuğu iPhone'da hiç görünmez: yalnızca pencere en az 768 pt genişken ve çalışma ekranı
açıkken çizilir (`app/(tabs)/_layout.tsx:66, 371-396`). Uygulama yalnızca dikey ve yalnızca iPhone
(`app.json:10, 14` — `supportsTablet: false`) olduğundan bu genişliğe hiç ulaşılmaz. Hamburger
başlığı da yalnızca deste listesi ve çalışma ekranı dışında çizilir (`_layout.tsx:349`) ve bu
yığında hiç görünmez. `in-app/00-help-center.md` içindeki kenar çubuğu girişi bu yüzden yalnızca
geniş web penceresinde işe yarar. iPhone için ana giriş aşağıdaki satırdır; Ayarlar › Hakkında
girişi ikinci yol olarak kalır.

### help.decks.more.help — Desteler ⋮ menüsünde "Yardım" satırı (yeni)
- **Yer:** Desteler › sağ üstteki **⋮** (erişilebilirlik adı **Diğer seçenekler**) menüsü,
  **en alttaki satır**: **Yedekten geri yükle** satırının (`app/(tabs)/decks.tsx:2287-2295`) hemen
  altına, menü kartını kapatan `</View>`'den (`decks.tsx:2296`) önce. Üstüne ince bir ayraç
  (`StyleSheet.hairlineWidth`, `colors.borderLight`) konur; böylece veri işlemlerinden ayrı durur.
- **Tetikleyici:** dokunma → `openOverflowRoute('/help')` (`decks.tsx:404-414`). iOS'ta menü önce
  kapanır, rota `handleOverflowDismiss` içinde açılır (`decks.tsx:416-423`). Bu, açık bir Modal
  üzerinde ikinci sunumu UIKit'in reddetmesini önler.
- **Simge:** `components/InfoCircleGlyph.tsx` (mevcut, `size={20}`, `color={colors.textSecondary}`),
  diğer satırlarla aynı `styles.overflowIcon` kabında. İsterseniz
  `components/DeckOverflowGlyph.tsx:4` `Kind` türüne `'help'` eklenir.
- **Satır:** `styles.overflowRow`, `accessibilityRole="button"`.
- **Durum:** Yeni. Ayrıca `in-app/00-help-center.md` › "Nereden açılır?" tablosuna ilk satır
  olarak eklenmeli: "Desteler › ⋮ menüsü, son satır — **Yardım** / **Help** — `/help` (liste)".

| ID | Yer | Tür | TR | EN | Durum |
| --- | --- | --- | --- | --- | --- |
| help.decks.more.help | ⋮ menüsü son satırı, `decks.tsx:2295` sonrası | menü etiketi | Yardım | Help | Yeni |
| help.decks.more.helpA11y | aynı satır | erişilebilirlik etiketi | Yardım ve kullanım kılavuzu | Help and user guide | Yeni |

---

## 1. İlk açılış

**Yeni kullanıcının ilk gördüğü:** Desteler başlığı (**↻**, **⋮**); **DESTE / Yeni / Öğrenme /
Tekrar** sütun başlıkları; listenin en üstünde kesik çizgili kilitli **TUS Kartları** satırı
("9.575 kart · 12 ders · 106 alt deste", **Ücretsiz aç**; `decks.tsx:1383-1415`). Altında tek bir
deste, **Varsayılan**, 0/0/0 sayılarla (`lib/models.ts:469-471`). Sağ altta **＋**, altta
**Kartlarım / İstatistik / Ayarlar**. Paket erişimi yoksa hiçbir şey kendiliğinden kurulmaz
(`contexts/AppContext.tsx:172-186`). **Varsayılan** her zaman var olduğu için mevcut boş durum
(`decks.tsx:2199-2211`) yeni kurulumda **hiç görünmez**. Yeni kullanıcıya ne yapacağını söyleyen
bir metin bugün yoktur.

### help.decks.firstRun.card — İlk açılış kartı (yeni)
- **Yer:** Desteler listesinin başlığı (`FlatList` `ListHeaderComponent`, `decks.tsx:2195-2198`,
  2362). `deckListHeader` kilitli TUS satırını ve **hemen altında** bu kartı döndürür. Paket
  kuruluysa kart listenin en üstünde durur. Genişlik ve kenar boşlukları kilitli satırla aynıdır
  (`styles.lockedDeckCard`).
- **Gösterim koşulu:** Koleksiyonda paket dışında hiç kart yoksa (deste listesi anlık görüntüsünde,
  katalog desteleri hariç toplam kart 0) **ve** kart kapatılmadıysa. Kapatma cihazda saklanır
  (öneri: `settings` tablosunda `help_first_run_dismissed_v1`). İlk kendi kartınız eklenince kart
  kendiliğinden kaybolur.
- **Bileşen:** kart: başlık, 2 cümle, en çok üç eylem satırı (simge + etiket, en az 44 pt
  yükseklik), altta bir bağlantı, sağ üstte **×**.
- **Eylemler:**
  1. **TUS paketini aç** → `router.push('/catalog')` (yalnızca tam paket kurulu değilse; kilitli
     satırla aynı hedef, `decks.tsx:1386`)
  2. **Kart ekle** → `router.push('/editor')` (`openAddCard` ile aynı, `decks.tsx:471-474`)
  3. **İçe aktar** → `router.push(DATA_IMPORT_ROUTE)` (kanonik `/import`, AGENTS.md kuralı)
  - Bağlantı **Kılavuzu aç** → `/help?article=quick-start`
  - **×** → kartı kalıcı olarak gizler
- **Daha fazla bilgi:** `tr/03-quick-start.md#first-screen`
- **Durum:** Yeni

**TR**
- Başlık: Hoş geldiniz
- Metin: Çalışmaya başlamak için kart gerekir. Hazır TUS paketini ücretsiz açabilir, kendi
  kartınızı yazabilir veya Anki'den bir deste getirebilirsiniz.
- Eylemler: **TUS paketini aç** — 9.575 hazır kart, ücretsiz · **Kart ekle** — kendi kartınızı
  yazın · **İçe aktar** — .apkg, .colpkg veya metin dosyası
- Bağlantı: Kılavuzu aç
- × erişilebilirlik etiketi: Hoş geldiniz kartını kapat

**EN**
- Title: Welcome
- Text: You need cards to start studying. Unlock the ready-made TUS pack for free, write your own
  card, or bring in a deck from Anki.
- Actions: **Unlock the TUS pack** — 9,575 ready-made cards, free · **Add note** — write your own
  card · **Import** — .apkg, .colpkg or text file
- Link: Open the guide
- × accessibility label: Close the welcome card

| ID | Yer (kontrol, dosya:satır) | Tür | TR | EN | Durum |
| --- | --- | --- | --- | --- | --- |
| help.decks.empty.title | Liste boş durumu, `decks.tsx:2206` | boş durum başlığı | İlk destenizi oluşturun | Create your first deck | Mevcut — koru |
| help.decks.empty.text | aynı, `decks.tsx:2207` | boş durum metni | Sağ alttaki ＋ ile bir deste oluşturun veya ⋮ › Deste içe aktar ile Anki'den bir deste getirin. | Create a deck with ＋ at the bottom right, or bring one in from Anki with ⋮ › Import deck. | Mevcut — güncelle (eski metin: "Kartlarınızı ders ve konuya göre düzenlemeye buradan başlayın." / "Start organizing your cards by subject and topic.") |
| help.decks.loadError | Aynı yer; deste listesi yüklenemezse (bugün `decks.tsx:262-266` yalnızca konsola yazar ve boş durumu gösterir) | hata durumu | Desteler yüklenemedi. ↻ ile yeniden deneyin. | Your decks could not be loaded. Tap ↻ to try again. | Yeni |
| help.decks.locked.a11y | Kilitli TUS satırı, `decks.tsx:1388-1391` | erişilebilirlik etiketi | TUS Kartları kart paketi, 9575 kart, ücretsiz açmak için dokun | TUS Kartları card pack, 9575 cards, tap to unlock for free | Mevcut — koru |
| help.decks.locked.meta | Kilitli TUS satırı alt satırı, `decks.tsx:1403-1406` | satır içi | {kart} kart · {ders} ders · {konu} alt deste | {cards} cards · {courses} courses · {topics} subdecks | Mevcut — koru |
| help.decks.locked.installing | aynı, kurulum sırasında, `decks.tsx:1402` | durum | Kartlar kuruluyor… | Installing cards… | Mevcut — koru |
| help.decks.varsayilanHint | **Varsayılan** satırında, yalnızca ilk açılış kartı görünürken; satırın altında küçük metin (`renderDeckRow`, `decks.tsx:1312-1322`, deste kimliği 1) | ipucu | Deste seçmeden eklediğiniz kartlar buraya gelir. | Cards you add without choosing a deck go here. | Yeni |

---

## 2. Desteler ekranı

### help.decks.sheet — "Desteler nasıl okunur?" bilgi sayfası (yeni)
- **Yer (1):** Desteler › sütun başlık satırı, **DESTE** etiketinin hemen sağında küçük **ⓘ**
  (yeni) — `components/decks/DeckListTable.tsx:22`. `InfoCircleGlyph` 15 pt, dokunma alanı
  `hitSlop` ile 44 pt.
- **Yer (2):** Genel bakış › **Yeni / Öğrenme / Tekrar** sayılar kartının sağ üst köşesinde **ⓘ**
  (yeni) — `app/deck-overview.tsx:219-232`.
- **Tetikleyici:** ⓘ'ye dokunma. Erişilebilirlik etiketi: "Sayılar ve satır düğmeleri hakkında" /
  "About the numbers and row controls".
- **Bileşen:** bilgi sayfası (`HelpSheet`, `SwipeDismissSheet` üzerinde; StatsHelpSheet /
  `OptionHelp` kalıbı: eyebrow, title, summary, points[], note, more)
- **Daha fazla bilgi:** `tr/04-decks.md#deck-counts`
- **Durum:** Yeni

**TR**
- Eyebrow: DESTELER
- Başlık: Desteler nasıl okunur?
- Özet: Her satır bir destedir; üç sayı bugün o destede neyin beklediğini gösterir. Üst destenin
  sayıları alt destelerini de kapsar.
- Maddeler:
  (1) **Yeni:** Henüz hiç görmediğiniz kartların tamamı. Yeni kartlarda günlük sınır yoktur.
  (2) **Öğrenme:** Şimdi veya birkaç dakika içinde sırası gelecek öğrenme kartları.
  (3) **Tekrar:** Bugün vadesi gelen tekrarlar, günlük tekrar limitinizden kalan kadar.
  (4) Deste adına dokunmak çalışmayı başlatır. **⠿** ile sürükleyip taşırsınız; **•••** genel
  bakışı, adlandırmayı, silmeyi ve diğer işlemleri açar.
- Not: Askıya alınmış ve gömülü kartlar sayılmaz. Liste açıkken sayıları yenilemek için ↻'ye
  dokunun.

**EN**
- Eyebrow: DECKS
- Title: How to read your decks
- Summary: Each row is a deck; the three numbers show what is waiting in it today. A parent
  deck's numbers include its subdecks.
- Points:
  (1) **New:** all cards you have never seen. New cards have no daily limit.
  (2) **Learn:** learning cards due now or within a few minutes.
  (3) **Review:** reviews due today, up to what is left of your daily review limit.
  (4) Tap a deck name to start studying. Drag **⠿** to move a deck; **•••** opens the overview,
  renaming, deleting and more.
- Note: Suspended and buried cards are not counted. Tap ↻ to refresh the numbers while the list is
  open.

| ID | Yer (kontrol, dosya:satır) | Tür | TR | EN | Durum |
| --- | --- | --- | --- | --- | --- |
| help.decks.refresh.a11y | Başlık **↻**, `decks.tsx:2222` | erişilebilirlik etiketi | Desteleri yenile | Refresh decks | Mevcut — koru |
| help.decks.refresh.hint | aynı | erişilebilirlik ipucu | Bugünkü sayıları yeniden hesaplar. | Recalculates today's numbers. | Yeni |
| help.decks.name.a11y | Deste adı, `decks.tsx:1309` | erişilebilirlik etiketi | {deste} destesini çalış | Study {deck} deck | Mevcut — koru |
| help.decks.menuButton.a11y | Satır **•••**, `decks.tsx:1358` | erişilebilirlik etiketi | {deste} deste menüsü | {deck} deck menu | Mevcut — güncelle (eski metin: "{deste} deste seçenekleri" / "{deck} deck options"; düğme Deste seçenekleri'ni değil menüyü açar) |
| help.decks.dragHandle.a11y | **⠿**, `decks.tsx:1337-1338` | erişilebilirlik etiketi + ipucu | {deste} destesini taşı · Satırın üstüne veya altına bırakarak sıralayın; ortasına bırakarak alt deste yapın | Move {deck} deck · Drop at a row edge to reorder, or at its center to make a subdeck | Mevcut — koru |
| help.decks.dragHandle.catalogA11y | Soluk **⠿**, TUS Kartları destelerinde, `decks.tsx:1344-1352` | erişilebilirlik etiketi | TUS Kartları desteleri taşınamaz | TUS Kartları decks cannot be moved | Mevcut — güncelle (eski metin: "Filtrelenmiş desteler alt deste olarak taşınamaz"; katalog destesinde de bu okunuyor). Filtrelenmiş destede eski metin kalır. |
| help.decks.drag.* | Sürükleme geri bildirimleri, `decks.tsx:338-357, 2392-2394, 2536` | satır içi | (mevcut dört cümle, ↑ Ana seviyeye bırak, "… taşınıyor") | (same) | Mevcut — koru |
| help.decks.overflow.import | **⋮** › 2. satır, `decks.tsx:2269` (`t('root.import')`) | menü etiketi | İçe aktar | Import | Mevcut — güncelle (eski metin: "Deste içe aktar" / "Import deck"; ekran .colpkg ve metin dosyalarını da alır, "Dışa aktar" ile uyumlu). `root.import` başka yerlerde de kullanılıyorsa yeni anahtar: `decks.overflowImport`. |
| help.decks.overflow.backupHint | **⋮** › **Yedek oluştur**, `decks.tsx:2282` | erişilebilirlik ipucu | Yedekler ekranını açar; yedeği orada adlandırıp alırsınız. | Opens Backups, where you name and create the backup. | Yeni |
| help.decks.bottomBrowser.hint | Alt çubuk **Kartlarım**, `decks.tsx:2508` | erişilebilirlik ipucu | Bütün koleksiyonu açar. Tek bir deste için deste menüsünden Kartlara göz at'ı kullanın. | Opens the whole collection. For one deck, use Browse cards in the deck menu. | Yeni |

---

## 3. ＋ menüsü

Etiketler kısa ve doğru; görünür alt yazı eklenmez, yalnızca erişilebilirlik ipuçları.

| ID | Yer (kontrol, dosya:satır) | Tür | TR | EN | Durum |
| --- | --- | --- | --- | --- | --- |
| help.decks.add.filteredHint | **Filtrelenmiş deste oluştur**, `decks.tsx:2452-2463` | erişilebilirlik ipucu | Bir aramaya uyan kartları geçici bir destede toplar. | Gathers cards matching a search into a temporary deck. | Yeni |
| help.decks.add.noteHint | **Kart ekle** / **Add note**, `decks.tsx:2477-2489` | erişilebilirlik ipucu | En son çalıştığınız desteye kart ekler. | Adds a card to the deck you studied last. | Yeni |

---

## 4. Deste oluştur, Yeniden adlandır, Alt deste oluştur

| ID | Yer (kontrol, dosya:satır) | Tür | TR | EN | Durum |
| --- | --- | --- | --- | --- | --- |
| help.decks.create.hint | **Deste oluştur** kutusu, **Deste adı** alanının altında, `decks.tsx:2314-2325` | ipucu (satır içi) | Alt deste için iki nokta üst üste kullanın: Farmakoloji::Antibiyotikler | For a subdeck, use a double colon: Pharmacology::Antibiotics | Yeni |
| help.decks.create.exists | Aynı kutu, **Oluştur**'dan sonra ad zaten varsa (`createDeck` mevcut desteyi döndürür, `lib/deckStore.ts:438-441`) | bildirim | “{ad}” zaten vardı; yeni deste açılmadı. | “{name}” already existed, so no new deck was created. | Yeni |
| help.decks.create.error | Aynı kutu, hata, `decks.tsx:400` | uyarı | (nedeni göster: `userFacingErrorMessage(e, …)`, Alt deste'deki gibi) Deste oluşturulamadı. | Could not create the deck. | Mevcut — güncelle (eski metin: yalnızca "Deste oluşturulamadı."; neden gizleniyor) |
| help.decks.rename.hint | **Desteyi yeniden adlandır** kutusu, **Yeni ad** alanının altında, `decks.tsx:1510-1521` | ipucu (satır içi) | Yalnızca ad değişir. Başka bir destenin altına taşımak için satırdaki ⠿ tutamacını sürükleyin. | Only the name changes. To move the deck under another deck, drag the ⠿ handle on its row. | Yeni |
| help.decks.subdeck.hint | **Alt deste oluştur** kutusu, **Ad** alanının altında, `decks.tsx:1555-1565` | ipucu (satır içi) | Yeni alt deste varsayılan ayar grubuyla başlar. | The new subdeck starts on the default preset. | Yeni |
| help.decks.description.hint | **DESTE AÇIKLAMASI** sayfası, alanın altında, `decks.tsx:1597-1606` | ipucu (satır içi) | Genel bakış'ta düz metin olarak görünür. | Shown as plain text on the deck overview. | Yeni |
| help.decks.catalog.* | "Korumalı Deste" uyarıları, `decks.tsx:608, 617, 657, 863` | uyarı | (mevcut) | (same) | Mevcut — koru |

---

## 5. Deste menüsü (•••) ve sonuç mesajları

| ID | Yer (kontrol, dosya:satır) | Tür | TR | EN | Durum |
| --- | --- | --- | --- | --- | --- |
| help.decks.menu.add | Menü maddesi **Ekle**, `decks.tsx:1448` | menü etiketi | Kart ekle | Add note | Mevcut — güncelle (eski metin: "Ekle" / "Add"; ＋ menüsündeki etiketle aynı olsun) |
| help.decks.menu.shortcutHint | **Kısayol oluştur**, `decks.tsx:1486` | erişilebilirlik ipucu | Bu desteyi açan bir kestirmeyi Apple Kestirmeler'e ekler. | Adds a shortcut that opens this deck to Apple Shortcuts. | Yeni (iPhone; webde: "Desteyi açan bağlantıyı panoya kopyalar." / "Copies a link that opens this deck.") |
| help.decks.shortcut.failed | iPhone, kestirme sonucu iptal dışında başarısızsa, `decks.tsx:726-732` | uyarı | Kestirme eklenemedi. Lütfen tekrar deneyin. | The shortcut could not be added. Please try again. | Mevcut — güncelle (eski metin: "Bu özellik Expo Go yerine TusAnkiM uygulama yapısında çalışır…"; mağaza sürümünde yanıltıcı, yalnızca `__DEV__` ve `unavailable` için kalsın) |
| help.decks.shortcut.added | `decks.tsx:714-720` | uyarı | (mevcut) | (same) | Mevcut — koru |
| help.decks.delete.confirm | **Desteyi sil** onayı, normal deste, `decks.tsx:841` | onay metni | “{deste}”, tüm alt desteleri ve içindeki kartlarla birlikte silinecek. Başka destelerde kartı olan notlar ve tekrar geçmişiniz korunur. Hemen sonra çıkan pencerede Geri al ile geri getirebilirsiniz. | “{deck}” and all of its subdecks and cards will be deleted. Notes with cards in other decks and your review history are kept. You can bring it back with Undo in the window that follows. | Mevcut — güncelle (eski metin: "… Silme sonrasında geri alabilirsiniz.") |
| help.decks.delete.confirmDefault | Aynı onay, deste kimliği 1 (**Varsayılan**) | onay metni | “{deste}” destesi kaldırılamaz: içindeki kartlar ve alt desteler silinir, deste boş kalır. Hemen sonra Geri al ile geri getirebilirsiniz. | The “{deck}” deck cannot be removed: its cards and subdecks are deleted and the deck stays empty. You can bring them back with Undo right after. | Yeni |
| help.decks.delete.doneFiltered | Silme sonucu, filtrelenmiş deste, `decks.tsx:847` | uyarı metni | Kartlar kendi destelerine döndü. | Its cards are back in their own decks. | Mevcut — güncelle (eski metin: "{n} kart etkilendi." — filtrelenmiş destede genellikle "0 kart" yazar) |
| help.decks.delete.undoExpired | Geri al başarısızsa, `lib/noteDeletion.ts:47` | uyarı | Bu silme artık geri alınamaz. | This deletion can no longer be undone. | Mevcut — güncelle (eski metin yalnızca İngilizce) |
| help.filtered.rebuilt | **Yeniden oluştur** sonucu, `decks.tsx:806` ve `app/deck-overview.tsx:148` | uyarı | Kartlar kayıtlı arama ve sıralama kurallarıyla yeniden toplandı ({n} kart). | Cards were gathered again using the saved search and sort rules ({n} cards). | Mevcut — güncelle (eski metin sayı vermiyor; iki yerde iki farklı cümle var, birleştirin) |
| help.filtered.rebuiltEmpty | Aynı yer, toplanan kart 0 ise | uyarı | Aramaya uyan kart bulunamadı; deste boş. Filtre seçeneklerinden aramayı değiştirebilirsiniz. | No cards match the search, so the deck is empty. You can change the search in the filtered deck options. | Yeni |
| help.decks.empty.confirm | **Desteyi boşalt** onayı, `decks.tsx:873-874` | onay metni | (mevcut) | (same) | Mevcut — koru |

### Kütüphane hata metinleri (yalnızca Türkçe; İngilizce arayüzde de Türkçe görünüyor)
Bu metinler `userFacingErrorMessage` ile olduğu gibi kullanıcıya ulaşır (`lib/userFacingError.ts:36-53`).
`translateActive` anahtarına çevrilmeli.

| ID | Kaynak | TR | EN | Durum |
| --- | --- | --- | --- | --- |
| decks.filteredCannotBeSubdeck | `lib/deckStore.ts:376, 538, 576` | Filtrelenmiş bir deste alt deste olamaz. | A filtered deck cannot be a subdeck. | Mevcut — güncelle |
| decks.cannotMoveIntoOwnSubdeck | `lib/deckStore.ts:379, 541` | Bir deste kendi altındaki bir desteye taşınamaz. | A deck cannot be moved into one of its own subdecks. | Mevcut — güncelle |
| decks.filteredCannotHaveSubdecks | `lib/deckStore.ts:386, 449, 544` | Filtrelenmiş bir destenin alt destesi olamaz. | A filtered deck cannot have subdecks. | Mevcut — güncelle |
| decks.cannotNestUnderCatalog | `lib/deckStore.ts:535` | TUS Kartları destelerinin altına deste taşınamaz. | Decks cannot be moved under TUS Kartları decks. | Mevcut — güncelle (eski metin: "Katalog desteleri altına başka deste taşınamaz.") |
| decks.targetNotFound | `lib/deckStore.ts:543, 590` | Hedef deste bulunamadı. | The target deck could not be found. | Mevcut — güncelle |
| decks.notFound | `lib/deckStore.ts:568, 585` | Deste bulunamadı. | The deck could not be found. | Mevcut — güncelle |
| decks.cannotPlaceBesideOwnSubdeck | `lib/deckStore.ts:571` | Bir deste kendi altındaki bir destenin yanına taşınamaz. | A deck cannot be placed next to one of its own subdecks. | Mevcut — güncelle |
| catalog.deckNotDeletable | `lib/catalogProtection.ts:150` | TUS Kartları desteleri silinemez. Paketi Ayarlar ekranından kaldırabilirsiniz. | TUS Kartları decks cannot be deleted. You can remove the pack in Settings. | Mevcut — güncelle |
| catalog.deckNotRenamable | `lib/catalogProtection.ts:156` | TUS Kartları desteleri yeniden adlandırılamaz. | TUS Kartları decks cannot be renamed. | Mevcut — güncelle |

---

## 6. Genel bakış

Sayılar kartının ⓘ'si `help.decks.sheet` sayfasını açar (bölüm 2). Mevcut düğme alt yazıları
yeterli ve korunur: `deck-overview.tsx:302, 313, 320, 330` (Mevcut — koru); boş/bitmiş notları
`deck-overview.tsx:275-277` (Mevcut — koru).

| ID | Yer (kontrol, dosya:satır) | Tür | TR | EN | Durum |
| --- | --- | --- | --- | --- | --- |
| help.overview.unburyHint | **💤 … gömülü kartı şimdi aç** düğmesinin altında küçük metin, `deck-overview.tsx:252-256` | ipucu (satır içi) | Gömülü kartlar bir sonraki çalışma gününde kendiliğinden geri gelir. | Buried cards come back on their own on the next study day. | Yeni |
| help.overview.modePill | Filtrelenmiş deste **KAYITLI ARAMA** kartındaki **Önizleme / Yeniden zamanla** etiketi, `deck-overview.tsx:238-242` | erişilebilirlik etiketi | Önizleme: cevaplar kartların programını değiştirmez. · Yeniden zamanla: cevaplar kartların programını günceller. | Preview: answers do not change the cards' schedule. · Reschedule: answers update the cards' schedule. | Yeni |
| help.overview.navMore.a11y | Sağ üst **•••**, `deck-overview.tsx:191` | erişilebilirlik etiketi | Deste seçenekleri | Deck options | Mevcut — koru (görsel olarak dişli simgesi önerilir; deste listesindeki ••• menü açar) |
| help.overview.emptyDisabledHint | **Boşalt** devre dışıyken, `deck-overview.tsx:286-292` | erişilebilirlik ipucu | Çalışmaya hazır kart yokken kullanılamaz. Deste menüsündeki Desteyi boşalt her zaman çalışır. | Not available while no cards are ready. Empty deck in the deck menu always works. | Yeni (davranış hizalanırsa gereksiz olur; ekip notuna bakın) |

---

## 7. Filtrelenmiş deste formu (Desteler'den: oluşturma ve Filtre seçenekleri)

### help.filtered.sheet — "Filtrelenmiş desteler" yardımı (mevcut — genişlet)
- **Yer:** Form araç çubuğunun **?** düğmesi (`decks.tsx:1720-1729`, etiket
  "Filtrelenmiş deste yardımı"), açılan kart `decks.tsx:2009-2110`
- **Durum:** Mevcut — genişlet. Giriş, 4 adım ve "Bilmeniz gerekenler" korunur. Eklenecekler:
  - 4. adımın sonuna (TR): "Önizlemede Tekrar kartı 1 dakika, Zor 10 dakika sonra getirir; İyi ve
    Kolay oturumdan çıkarır." · (EN): "In preview, Again brings the card back after 1 minute and
    Hard after 10 minutes; Good and Easy remove it from the session."
  - "Bilmeniz gerekenler"e (TR): "Çalıştıkça yeni kart eklenmez; bitirdiğiniz kartlar kendi
    destelerine döner." · (EN): "No new cards are added while you study; cards you finish go back
    to their own decks."
  - **Anladım**'ın soluna **Daha fazla bilgi** → `tr/11-filtered-decks.md#what-are-filtered-decks`

### help.filtered.optionsSheet — "Filtrelenmiş deste nasıl çalışır?" (mevcut — genişlet)
- **Yer:** Genel bakış › **Filtre seçenekleri** › **?** (`components/FilteredDeckOptionsModal.tsx:220-230`),
  sayfa `FilteredDeckOptionsModal.tsx:544-567`
- **Durum:** Mevcut — genişlet: alt kısma **Daha fazla bilgi** →
  `tr/11-filtered-decks.md#what-are-filtered-decks`; 3. adıma önizleme gecikmeleri cümlesi
  (yukarıdakiyle aynı).

### help.filtered.orders — Sıralama seçeneklerinin alt yazıları (yeni)
- **Yer:** **Kartların seçilme sırası** sayfası, her seçeneğin etiketinin altında tek satır
  (`decks.tsx:2127-2139`; `FilteredDeckOptionsModal.tsx:533-538`)
- **Daha fazla bilgi:** `tr/11-filtered-decks.md#order`
- **Durum:** Yeni

| Sıra | TR | EN |
| --- | --- | --- |
| 0 En eski görülen önce / Oldest seen first | En uzun süredir görmedikleriniz önce | Cards you haven't seen for longest first |
| 1 Rastgele / Random | Karışık sıra | Shuffled |
| 2 Aralıklar (artan) / Increasing intervals | En kısa aralıklı kartlar önce | Shortest intervals first |
| 3 Aralıklar (azalan) / Decreasing intervals | En uzun aralıklı kartlar önce | Longest intervals first |
| 4 En çok unutulan / Most lapses | En çok unuttuklarınız önce | Most-forgotten cards first |
| 5 Ekleniş sırası / Order added | En eski notlar önce | Oldest notes first |
| 6 Vade sırası / Order due | En çok bekleyen kartlar önce | Longest-waiting cards first |
| 7 Son eklenen önce / Latest added first | En yeni notlar önce | Newest notes first |
| 8 Hatırlanabilirlik (artan) / Ascending retrievability | FSRS: hatırlama ihtimali en düşükler önce | FSRS: lowest chance of recall first |
| 9 Hatırlanabilirlik (azalan) / Descending retrievability | FSRS: hatırlama ihtimali en yüksekler önce | FSRS: highest chance of recall first |
| 10 Göreceli gecikme / Relative overdueness | Aralığına göre en çok gecikenler önce | Most overdue for their interval first |

| ID | Yer (kontrol, dosya:satır) | Tür | TR | EN | Durum |
| --- | --- | --- | --- | --- | --- |
| help.filtered.searchHint | **Ara** alanının altında, `decks.tsx:1783-1805`; `FilteredDeckOptionsModal.tsx:278-300` | ipucu (satır içi) | Kartlarım'daki arama diliyle yazın. ⌕ kaç kartın eşleştiğini gösterir. | Uses the Card Browser search language. ⌕ shows how many cards match. | Yeni |
| help.filtered.deckRowHint | **Deste** satırı, `decks.tsx:1762-1779`; `FilteredDeckOptionsModal.tsx:257-274` | erişilebilirlik ipucu | Seçilen deste aramaya deck: terimi olarak yazılır; Tüm desteler bu terimi kaldırır. | The chosen deck is written into the search as a deck: term; All decks removes it. | Yeni |
| help.filtered.limitSublabel | **Kart limiti** alt satırı, `decks.tsx:1813`; `FilteredDeckOptionsModal.tsx:308` | alt yazı | Desteye alınacak en fazla kart sayısı (1–99.999) | Maximum cards to gather into this deck (1–99,999) | Mevcut — güncelle (eski metin aralık vermiyor) |
| help.filtered.searchInfo | **⌕** uyarısı, `decks.tsx:1647-1673` | uyarı | Bu sorguyla {n} uygun kart bulundu.\n\n{arama}\n\nÖrnekler: is:due -is:buried · rated:7:1 · tag:etiket · deck:"Deste" is:new | Found {n} matching cards for this query.\n\n{search}\n\nExamples: is:due -is:buried · rated:7:1 · tag:name · deck:"Deck" is:new | Mevcut — güncelle (eski metin ~500 karakter terim listesi; uzun bir aramayla 600 karakter sınırını aşıp genel hata metnine dönüşür, `lib/userFacingError.ts:3,31`. Terim listesi makaleye ve yardım sayfasına taşınır) |
| help.filtered.excluded | **Dahil edilemeyen kartları göster**, `decks.tsx:1681-1690` | uyarı | {n} kart dahil edilemiyor · Bu kartlar aramayla eşleşiyor ama askıya alınmış veya gömülü oldukları için alınamıyor. | {n} cards are excluded · These cards match the search but cannot be gathered because they are suspended or buried. | Mevcut — güncelle (eski metin sayı vermiyor; Genel bakış formundaki gibi `getFilteredDeckExcludedCount` kullanılsın) |
| help.filtered.excludedOverview | Aynı düğme, Genel bakış formu, `FilteredDeckOptionsModal.tsx:196-197` | uyarı | Bu kartlar sorguyla eşleşiyor ama askıya alınmış veya gömülü oldukları için alınamıyor. | These cards match the query but cannot be gathered because they are suspended or buried. | Mevcut — güncelle (eski metin "başka bir filtrelenmiş destede" diyor; sayım yalnızca askıya alınmış/gömülü kartları içeriyor, `lib/filteredDeckQueue.ts:334-353`) |
| help.filtered.noMatch | **Eşleşen kart yok**, `decks.tsx:555-558` | uyarı | (mevcut TR) | No deck could be built with these filters. Change the search or turn on “Create/update even if empty”. | Mevcut — güncelle (yalnızca EN: eski metin anahtarı “Create/update this deck even if empty” diye anıyor, etiket `decks.tsx:1981` farklı) |
| help.filtered.emptySearch | **Oluştur**'a arama boşken basılınca, `decks.tsx:567-568` (bugün sessizce hiçbir şey olmuyor) | uyarı | Arama boş · Kartları seçmek için bir arama yazın veya Deste satırından bir deste seçin. | Search is empty · Type a search or choose a deck in the Deck row to select cards. | Yeni |
| help.filtered.nameTaken | **Oluştur** sonrası, ad doluysa, `decks.tsx:579` | bildirim | “{ad}” kullanılıyordu; deste “{yeniAd}” adıyla oluşturuldu. | “{name}” was taken, so the deck was created as “{newName}”. | Yeni |
| help.filtered.toggles | Anahtar alt yazıları, `decks.tsx:1853, 1962-1964, 1984`; `FilteredDeckOptionsModal.tsx:344, 449-451, 494` | alt yazı | (mevcut) | (same) | Mevcut — koru |
| help.filtered.previewDelays | Önizleme gecikmeleri açıklaması, `FilteredDeckOptionsModal.tsx:478-483` | alt yazı | (mevcut) | (same) | Mevcut — koru |

---

## 8. Özel çalışma

| ID | Yer (kontrol, dosya:satır) | Tür | TR | EN | Durum |
| --- | --- | --- | --- | --- | --- |
| help.customStudy.caption.reviewLimit | **Bugünkü tekrar kart limitini artır** etiketinin altında, `components/CustomStudyModal.tsx:564-584` | alt yazı | Oturum kurmaz; yalnızca bugünkü limiti değiştirir. | Builds no session; changes today's limit only. | Yeni |
| help.customStudy.caption.forgot | **Unutulan kartları tekrarla** altında | alt yazı | Tekrar dediğiniz kartlar; programları değişmez. | Cards you answered Again; their schedule doesn't change. | Yeni |
| help.customStudy.caption.ahead | **İleriye çalış** altında | alt yazı | Yakında vadesi gelecek kartlar; normal programa işler. | Cards due soon; counts as normal study. | Yeni |
| help.customStudy.caption.preview | **Yeni kartları önizle** altında | alt yazı | Son eklenen yeni kartlar; programları değişmez. | Recently added new cards; their schedule doesn't change. | Yeni |
| help.customStudy.caption.cram | **Kart durumuna veya etikete göre çalış** altında | alt yazı | Yeni, zamanı gelmiş veya bütün kartlar; etiketle daraltılabilir. | New, due or all cards; can be narrowed by tag. | Yeni |
| help.customStudy.limitHint | Sayı satırının altında, yalnızca tekrar limiti seçiliyken, `CustomStudyModal.tsx:590-620` | ipucu (satır içi) | Yalnızca bugün geçerlidir; eksi değer limiti azaltır. Üst desteler, Limitler en üst desteden başlasın açıksa birlikte artar. | Today only; a negative value lowers the limit. Parent decks go up too when Limits start from top is on. | Yeni |
| help.customStudy.note | Alt not, `CustomStudyModal.tsx:647-652` | dipnot | (mevcut) + bağlantı **Daha fazla bilgi** → `help?article=filtered-decks&section=custom-study-options` | (same) + **Learn more** | Mevcut — güncelle: not yalnızca oturum kuran dört seçenekte gösterilsin (tekrar limiti seçeneğinde hiçbir deste yeniden oluşturulmaz) |
| help.customStudy.noCards | **Tamam** devre dışıyken düğmenin üstünde, `CustomStudyModal.tsx:262-263, 667-675` | ipucu (satır içi) | Bu destede çalışılacak kart yok. | This deck has no cards to study. | Yeni |
| help.customStudy.requireHint | **Seçmeli çalışma**, "Şu etiketlerden en az biri gerekli:" satırının altında, `CustomStudyModal.tsx:532-552` | ipucu (satır içi) | Kutuyu işaretlemezseniz bu listedeki seçimler kullanılmaz. | If the box is not ticked, choices in this list are not used. | Yeni |
| help.customStudy.messages | Uyarılar, `CustomStudyModal.tsx:280-296, 319-337, 382-390` | uyarı | (mevcut) | (same) | Mevcut — koru |

---

## 9. Deste seçici

| ID | Yer (kontrol, dosya:satır) | Tür | TR | EN | Durum |
| --- | --- | --- | --- | --- | --- |
| help.deckPicker.noMatch | Arama sonucu boş, her çağrıdaki `emptySearchLabel` (ör. `decks.tsx:2155`, `app/editor.tsx:1576-1585`) | boş durum | Aramanızla eşleşen deste yok. Kelimelerin başını yazın; örneğin “farm”. | No decks match your search. Type the start of a word, for example “pharm”. | Mevcut — güncelle (eski metin yalnızca ilk cümle) |
| help.deckPicker.createDescription | **Yeni deste oluştur** paneli, `components/DeckPickerModal.tsx:273-276` | açıklama | (mevcut cümle) + Alt deste için Üst::Alt yazın. Bu adda bir deste varsa o deste seçilir. | (existing sentence) + For a subdeck, type Parent::Child. If a deck with this name exists, it is selected. | Mevcut — genişlet |

---

## 10. Kenar çubuğu (yalnızca web, pencere ≥768 px)

| ID | Yer (kontrol, dosya:satır) | Tür | TR | EN | Durum |
| --- | --- | --- | --- | --- | --- |
| help.sidebar.deckChevron.a11y | Deste ağacındaki ok, `components/Sidebar.tsx:149` | erişilebilirlik etiketi | Alt desteleri göster / Alt desteleri gizle | Show subdecks / Hide subdecks | Mevcut — güncelle (eski metin: "Konuları göster/gizle" — deste ağacında konu değil alt deste açılır) |
| help.sidebar.deckCount.a11y | Deste rozetleri, `Sidebar.tsx:188-192` | erişilebilirlik etiketi | {n} kart | {n} cards | Yeni (rozet toplam kart sayısıdır, deste listesindeki bugünkü sayılardan farklı) |
