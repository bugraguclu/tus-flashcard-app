# Kartlarım ve Kart bilgisi — uygulama içi metinler

Makale: `tr/10-browser-and-search.md`, `en/10-browser-and-search.md` (id `browser`).
Platform: iPhone ve web aynı ekranı kullanır. Kenar çubuğundaki **Kartlarım** girişi yalnızca
pencere genişliği ≥768 px olduğunda (web, geniş pencere) vardır; iPhone'da yoktur.

## Kartlarım (`app/browser.tsx`)

### help.browser.sheet — Kartlarım bilgi sayfası (yeni)
- **Yer:** Kartlarım başlığının sağı. Bugün orada boş bir yer tutucu var
  (`<View style={styles.headerSpacer} />`, `app/browser.tsx:893`); yerine ⓘ düğmesi gelir.
  Erişilebilirlik etiketi: "Kartlarım hakkında" / "About the Card Browser".
- **Tetikleyici:** ⓘ'ye dokunma
- **Bileşen:** bilgi sayfası (`HelpSheet`, `SwipeDismissSheet` üzerinde: eyebrow, title, summary, points[], note, more)
- **Daha fazla bilgi:** `tr/10-browser-and-search.md#browser-layout`
- **Durum:** Yeni

**TR**
- Üst başlık: KARTLARIM
- Başlık: Kartları bulun ve toplu değiştirin
- Özet: Liste, üstteki destede ve filtrelerde arama kutusunun bulduğu kartları gösterir. Sayaç bu kartların sayısıdır.
- Maddeler: (1) Bir satıra dokunun: cevap ve zamanlama açılır. Basılı tutun: seçim başlar, alttaki çubuktan taşıma, askı, bayrak ve diğer işlemleri yaparsınız. (2) Filtreler, sıralama ve Kartlar/Notlar görünümü ⋮ menüsündedir. (3) Düz kelimeler kartın alanlarında aranır; etiket ve deste için `tag:` ve `deck:` yazın. Terimler için arama kutusundaki ?'e dokunun.
- Not: Notlar görünümünde yaptığınız işlemler notun bütün kartlarına uygulanır.

**EN**
- Eyebrow: CARD BROWSER
- Title: Find cards and change them in bulk
- Summary: The list shows the cards the search box finds in the deck and filters above. The count is how many there are.
- Points: (1) Tap a row to see its answer and scheduling. Touch and hold to start selecting, then move, suspend, flag and more from the bar at the bottom. (2) Filters, sorting and the Cards/Notes view are in the ⋮ menu. (3) Plain words search the card's fields; type `tag:` and `deck:` for tags and decks. Tap ? in the search box for the terms.
- Note: In the Notes view, every action applies to all cards of the note.

### help.browser.searchHelp — Arama nasıl çalışır? (Mevcut — güncelle)
- **Yer:** Arama kutusundaki **?** (`app/browser.tsx:978-986`) → `SearchHelpModal`
  (`components/browser/BrowserDialogs.tsx:362-409`); terim grupları `app/browser.tsx:443-491`.
- **Tetikleyici:** ?'e dokunma
- **Bileşen:** mevcut ortalanmış pencere; satıra dokunmak terimi aramaya ekler (korunur).
- **Daha fazla bilgi:** `tr/10-browser-and-search.md#search-syntax` — yeni bağlantı, **Kapat**
  düğmesinin üstünde (`BrowserDialogs.tsx:402`).
- **Durum:** Mevcut — güncelle. Başlık **Arama nasıl çalışır? / How search works** (`:376`) korunur.
  Açıklama yanlış (`:379-380`): eski metin "Kelime yazınca kart metni, etiketler ve deste adı
  taranır. Aşağıdaki terimlerden birine dokunarak aramanıza ekleyebilirsiniz." / "Plain words search
  the card text, its tags and its deck name. Tap any term below to add it to your search."
  Düz kelimeler yalnızca alan metninde aranır.

**TR (açıklama)**
Kelimeler kartın alanlarındaki metinde aranır; etiket ve deste adı aranmaz, onlar için `tag:` ve `deck:` kullanın. ç, ğ, ö, ş, ü harflerini karttaki gibi yazın ya da kelimenin başına `nc:` ekleyin. Bir terime dokunarak aramanıza ekleyebilirsiniz.

**EN (summary)**
Words are searched in the text of the card's fields; tags and deck names are not, so use `tag:` and `deck:` for them. Type ç, ğ, ö, ş, ü as they appear in the card, or put `nc:` before the word. Tap a term to add it to your search.

**Terim listesi değişiklikleri** (`app/browser.tsx:443-491`; diğer satırlar Mevcut — koru)

| Grup | Terim | TR | EN | Durum |
| --- | --- | --- | --- | --- |
| Kart özellikleri | `prop:ivl>=21` | Aralığı 21 gün veya daha uzun | Interval of 21 days or more | Mevcut — güncelle (eski TR: "Aralığı 21 günden uzun") |
| Kart durumu | `flag:1` | Kırmızı bayrak (0 bayraksız, 1 kırmızı, 2 turuncu, 3 yeşil, 4 mavi, 5 pembe, 6 turkuaz, 7 mor) | Red flag (0 none, 1 red, 2 orange, 3 green, 4 blue, 5 pink, 6 turquoise, 7 purple) | Mevcut — güncelle (eski: "Bayrağa göre (0–7)" / "By flag colour (0–7)") |
| Metin (yeni grup: "Metin" / "Text") | `nc:` | Türkçe harf farkını yok say | Ignore Turkish letters and accents | Yeni |
| Metin | `"…"` | Kelimeleri yan yana ara | Words side by side | Yeni |
| Metin | `front:*…*` | Tek bir alanda ara (Ön alanı = front) | Search one field | Yeni |
| Metin | `w:` | Yalnızca tam kelime | Whole word only | Yeni |
| Kapsam | `deck:current` | Seçili destedeki kartlar | Cards in the selected deck | Yeni |
| Kart özellikleri | `prop:r<0.9` | FSRS: hatırlanabilirlik %90'ın altında | FSRS: retrievability under 90% | Yeni |

### Kısa metinler

| ID | Yer (kontrol, dosya:satır) | Tür | TR | EN | Durum |
| --- | --- | --- | --- | --- | --- |
| help.browser.searchPlaceholder | Arama kutusu, `app/browser.tsx:953-961` | yer tutucu | Ara veya deck:tag:is:… | Search or deck:tag:is:… | Mevcut — koru |
| help.browser.searchDraftHint | Arama kutusunun altı, geçersiz taslakta, `app/browser.tsx:988-992` | ipucu | Arama henüz geçerli değil; son geçerli sonuçlar gösteriliyor. Tırnak ve parantezleri kapatın, `deck:` gibi terimlerin değerini yazın. | Search is not valid yet; showing the last valid results. Close quotes and brackets, and give terms such as `deck:` a value. | Mevcut — güncelle (eski: yalnızca ilk cümle) |
| help.browser.invalidSearch | Boş liste, geçersiz arama bağlantıyla geldiğinde, `app/browser.tsx:376` | hata | Geçersiz arama. Terimleri, tırnakları ve parantezleri kontrol edin. | Invalid search. Check the terms, quotes and parentheses. | Mevcut — koru |
| help.browser.noResultsTip | Boş liste, arama açıkken, gövde metninin altı, `app/browser.tsx:1050-1053` | ipucu + bağlantı (`#search-turkish`) | İpucu: ç, ğ, ö, ş, ü harflerini karttaki gibi yazın ya da aramanın başına nc: ekleyin. | Tip: type ç, ğ, ö, ş, ü as they appear in the card, or start the search with nc:. | Yeni |
| help.browser.emptyFilteredDeck | Boş liste, kapsam filtrelenmiş desteyken (yeni dal), `app/browser.tsx:1054-1057` | boş durum | Bu filtrelenmiş destede şu anda kart yok. | This filtered deck has no cards right now. | Mevcut — güncelle (eski: "Bu destede henüz kart yok. İlk kartınızı eklemek için Yeni kart düğmesini kullanın." — düğme burada gizli, `:912`) |
| help.browser.deckSelectorHint | Deste seçici, `app/browser.tsx:898-907` | erişilebilirlik ipucu | Alt desteler dahildir. Arama bu destenin içinde yapılır. | Subdecks are included. The search runs inside this deck. | Yeni |
| help.browser.rowHint | Liste satırı, `components/browser/BrowserCardRow.tsx:110-124` | erişilebilirlik ipucu | Ayrıntılar için dokunun, seçmek için basılı tutun. | Tap for details, touch and hold to select. | Yeni |
| help.browser.chipsAll | **Tümü** çipi, `components/browser/BrowserBars.tsx:64-69` | erişilebilirlik ipucu | Bütün filtreleri kaldırır; arama ve deste değişmez. | Removes all filters; the search and deck stay. | Yeni |
| help.browser.flagFilterFooter | ⋮ › Bayrağa göre filtrele paneli, "N seçenek seçili" satırının altı, `components/browser/BrowserMenus.tsx:394-398` | ipucu | Seçtiğiniz bayraklardan herhangi biri olan kartlar gösterilir. | Cards with any of the ticked flags are shown. | Yeni |
| help.browser.tagFilterCaption | **Etikete göre filtrele** penceresi başlığının altı (TagPickerModal'a açıklama alanı gerekir), `app/browser.tsx:1182-1193` | ipucu | Seçtiğiniz etiketlerden herhangi birini taşıyan notlar gösterilir; alt etiketler dahildir. | Notes with any of the chosen tags are shown; child tags are included. | Yeni |
| help.browser.selectLoadedHint | ⋮ › **Yüklenenleri seç (N)**, `components/browser/BrowserMenus.tsx:410-421` | erişilebilirlik ipucu | Yalnızca yüklenmiş satırları seçer. Hepsi için listenin sonuna kaydırın. | Selects only rows loaded so far. Scroll to the end for all of them. | Yeni |
| help.browser.optionsTitle | Seçenekler penceresi başlığı, `components/browser/BrowserMenus.tsx:584` | başlık | Kartlarım seçenekleri | Card Browser Options | Mevcut — güncelle (eski TR: "Kart tarayıcısı seçenekleri"; ekranın adı Kartlarım) |
| help.browser.viewCaption | Seçenekler › Görünüm açıklaması, `components/browser/BrowserMenus.tsx:586` | açıklama | Listede kartları veya her notu tek satır olarak göster. Not görünümünde işlemler notun bütün kartlarına uygulanır. | Show cards, or show each note as a single row. In the Notes view, actions apply to all cards of the note. | Mevcut — genişlet |
| help.browser.sortCaption | Görüntüleme sırası penceresi başlığının altı (yeni), `components/browser/BrowserMenus.tsx:471` | açıklama | Vade: önce yeni, sonra öğrenme, sonra tekrar kartları. Sıralama alanı çoğu not türünde ilk alandır. | Due: new, then learning, then review cards. The sort field is the first field for most note types. | Yeni |
| help.browser.moreSheetLink | Seçim çubuğu › **Diğer** sayfasının sonu (`ScrollView` altı), `components/browser/BrowserMenus.tsx:224` | bağlantı → `tr/10-browser-and-search.md#selecting` | Daha fazla bilgi | Learn more | Yeni |
| help.browser.catalogMove | Taşıma uyarısı, `app/browser.tsx:758-760`, `BrowserBars.tsx:194-197`, `BrowserMenus.tsx:131-134` | uyarı | Seçilen kartlar arasında dahili TUS kartları bulunuyor. Dahili TUS kartlarının destesi değiştirilemez. | The selection contains built-in TUS cards. Built-in catalog cards cannot be moved to another deck. | Mevcut — koru |
| help.browser.decksA11y | Desteler sekmesi alt çubuğu **Kartlarım**, `app/(tabs)/decks.tsx:2507` | erişilebilirlik etiketi | Kartlarımı aç | Open Card Browser | Mevcut — güncelle (eski EN: "Open Browse") |

## Kartlarım iletişim kutuları (`components/browser/`)

Ortalanmış pencereler; tutamaçlı sayfa eklenmez. Mevcut açıklama satırları genişletilir.

| ID | Yer (kontrol, dosya:satır) | Tür | TR | EN | Durum |
| --- | --- | --- | --- | --- | --- |
| help.browser.repositionCaption | **Yeniden Konumlandır** açıklaması, `components/browser/RepositionModal.tsx:89` | açıklama | Yalnızca seçili yeni kartlar etkilenir. Aynı notun kartları aynı konumu alır; kaydırma, diğer yeni kartları seçtiğiniz kart sayısı × adım kadar geriye iter. | Only selected new cards are affected. Cards of the same note share one position; shifting moves the other new cards back by the number of selected cards × the step. | Mevcut — genişlet (eski: ilk cümle) |
| help.browser.dueDateCaption | **Vade tarihini ayarla** açıklaması, `components/browser/BrowserDialogs.tsx:204` | açıklama | 0 bugün, 1 yarındır. 3-7 her karta bu aralıkta rastgele bir gün verir. Sondaki ! aralığı da değiştirir (FSRS açıkken etkisizdir). Kartlar tekrar kartı olur. | 0 is today, 1 tomorrow. 3-7 gives each card a random day in that range. A trailing ! also changes the interval (no effect with FSRS). The cards become review cards. | Mevcut — güncelle (eski: "Örnek: 5, 3-7 veya aralığı da değiştirmek için 3-7!" / "Examples: 5, 3-7, or 3-7! to also change the interval.") |
| help.browser.dueDateInvalid | Geçersiz giriş uyarısı, `BrowserDialogs.tsx:213` | uyarı | Tek bir gün veya 3-7 biçiminde bir aralık girin. | Enter one day or a range such as 3-7. | Mevcut — koru |
| help.browser.resetCaption | **Kartları sıfırla** açıklaması, `BrowserDialogs.tsx:140-143` | açıklama | N kart Yeni durumuna döner. Aralık, kolaylık ve FSRS hafıza bilgisi silinir; tekrar geçmişi korunur. Bu işlem geri alınamaz. | N cards go back to New. Interval, ease and FSRS memory state are cleared; the review history is kept. This cannot be undone. | Mevcut — genişlet (eski: "N kart Yeni durumuna döner. Tekrar geçmişi korunur.") |
| help.browser.gradeNowCaption | **Şimdi derecelendir** açıklaması, `BrowserDialogs.tsx:255` | açıklama | Seçili kartlar normal zamanlayıcı ve inceleme geçmişi kullanılarak derecelendirilir. Seçtiğiniz düğme hemen uygulanır ve geri alınamaz. | Selected cards are graded through the normal scheduler and review history. The button you tap applies at once and cannot be undone. | Mevcut — genişlet |
| help.browser.editTagsCaption | **Seçili notların etiketleri** başlığının altı (TagPickerModal'a açıklama alanı gerekir), `app/browser.tsx:1195-1209` | açıklama | İşaretli etiketler seçili notların hepsinde ortaktır. İşaretlediğiniz etiket hepsine eklenir, kaldırdığınız hepsinden çıkar; diğerleri değişmez. | Ticked tags are shared by all selected notes. A tag you tick is added to all, one you untick is removed from all; others stay. | Yeni |
| help.browser.changeNoteTypeCaption | **Not türünü değiştir** açıklaması, `BrowserDialogs.tsx:62` | açıklama | (mevcut metin) | (existing text) | Mevcut — koru |
| help.browser.deleteConfirm | **Notları sil** onayı, `components/browser/BrowserMenus.tsx:196-197` | onay | (mevcut metin) | (existing text) | Mevcut — koru |
| help.browser.deckMoveDone | Taşımadan sonra kısa bildirim (yeni), `app/browser.tsx:774-782` | bildirim | N kart taşındı. Geri almak için ⋮ › Geri al: Deste güncelleme. | N cards moved. To undo, use ⋮ › Undo Update Deck. | Yeni (öneri: taşımadan sonra bugün hiçbir geri bildirim yok) |

## Kart bilgisi (`app/card-info.tsx`)

Giriş: çalışma ekranı › **⋮** (Kart ve not seçenekleri) veya dişli **Araçlar** › **Kart bilgisi**
(`components/CardOptionsMenu.tsx:360-362`) — Mevcut — koru. Ekran aşağı kaydırılarak kapanan bir
sayfadır (`app/_layout.tsx:714-722`).

### help.cardInfo.sheet — Kart bilgisi bilgi sayfası (yeni)
- **Yer:** Kart bilgisi başlığının sağı; bugünkü boş alan (`<View style={{ width: 60 }} />`,
  `app/card-info.tsx:207`) yerine ⓘ. Erişilebilirlik etiketi: "Kart bilgisi hakkında" / "About Card Info".
- **Tetikleyici:** ⓘ'ye dokunma
- **Bileşen:** bilgi sayfası (`HelpSheet`)
- **Daha fazla bilgi:** `tr/10-browser-and-search.md#card-info`
- **Durum:** Yeni

**TR**
- Üst başlık: KART BİLGİSİ
- Başlık: Bu kartın geçmişi ve durumu
- Özet: Kartın destesi, zamanlaması, FSRS değerleri ve bütün tekrar kayıtları. Ekranı açmak kartı değiştirmez.
- Maddeler: (1) **Kart durumu** kartın aşamasıdır; **Sıra** şu an nerede beklediğini (askıda, gömülü) gösterir. (2) **Hafıza gücü** hatırlamanızın %90'a düşmesine kalan tahmini gündür; **Hatırlanabilirlik** kartı şu an hatırlama olasılığınızdır. (3) Geçmişteki **El ile** satırları vade ayarlama veya sıfırlama kayıtlarıdır; cevap sayılmaz.
- Not: **Kart ID** ve **Not ID**'yi Kartlarım'da `cid:` ve `nid:` ile arayabilirsiniz.

**EN**
- Eyebrow: CARD INFO
- Title: This card's history and state
- Summary: The card's deck, scheduling, FSRS values and every review entry. Opening this screen does not change the card.
- Points: (1) **Card state** is the card's stage; **Queue** shows where it waits now (suspended, buried). (2) **Stability** is about how many days until your recall drops to 90%; **Retrievability** is your chance of recalling it right now. (3) **Manual** rows in the history record due-date changes or resets; they are not answers.
- Note: You can search for the **Card ID** and **Note ID** in the Card Browser with `cid:` and `nid:`.

| ID | Yer (kontrol, dosya:satır) | Tür | TR | EN | Durum |
| --- | --- | --- | --- | --- | --- |
| help.cardInfo.fsrsDerived | **FSRS hafıza durumu** başlığının altı, yalnızca karta kayıtlı durum yokken (`storedMemory` boş), `app/card-info.tsx:258` | açıklama | Bu değerler tekrar geçmişinden hesaplandı; karta kaydedilmedi. | These values were calculated from the review history and were not saved to the card. | Yeni |
| help.cardInfo.historyNote | **Çalışma geçmişi** başlığının altı, `app/card-info.tsx:304` | açıklama | El ile satırları vade ayarlama ve sıfırlama kayıtlarıdır. FSRS ile verilen cevaplarda Kolaylık sütunu kartın o anki zorluğunu yansıtır. | Manual rows record due-date changes and resets. For answers given with FSRS, the Ease column reflects the card's difficulty at that moment. | Yeni |
| help.cardInfo.leech | **Sürekli Unutulan Kart nedir?** kutusu, `app/card-info.tsx:211`, `components/LeechExplainer.tsx` | bilgi kutusu | (mevcut metin) | (existing text) | Mevcut — koru |
| help.cardInfo.notFound | Kart yoksa, `app/card-info.tsx:77` | boş durum | Kart bulunamadı. | Card not found. | Mevcut — koru |
| help.cardInfo.noTags | Etiket yoksa, `app/card-info.tsx:234` | boş durum | Bu notta etiket yok. | This note has no tags. | Mevcut — koru |
| help.cardInfo.noReviews | Geçmiş boşsa, `app/card-info.tsx:307` | boş durum | Bu kart henüz hiç çalışılmadı. | This card has not been reviewed yet. | Mevcut — koru |
