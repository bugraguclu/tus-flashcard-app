# Çalışma ekranı — uygulama içi metinler

Kapsam: çalışma ekranı (klasik ve yeni düzen), ⋮ kart ve not seçenekleri menüsü, bayrak menüsü,
yazı tahtası, Zaman kutusu penceresi, öğrenme bekleme (geri sayım) durumu ve bitiş (Tebrikler)
durumu. Kaynak: master c6108e6. Makale: `tr/05-studying.md`, `en/05-studying.md`
(`help?article=studying`).

## ⓘ yerleşimi (iki düzen)

- **Üst çubuğa ⓘ eklenmez, iki düzende de.** Telefonda üst çubukta zaten ‹, deste adı, durum
  göstergeleri ve dört simge düğmesi (↶ ⚑ ⚙ ⋮) var (`app/(tabs)/index.tsx:2709-2803` yeni,
  `2881-2961` klasik). Beşinci bir simge deste adını kısaltır ve sık kullanılan bir ekranda yanlışlıkla
  dokunulur.
- **Ana bilgi sayfasının girişi ⋮ menüsünün son satırıdır** (iki düzende aynı bileşen):
  `components/CardOptionsMenu.tsx:362`'deki **Kart bilgisi** satırının altına yeni satır
  (`InfoCircleGlyph` simgesi). Satır her zaman etkin olur (kart olmasa da). Menü kapanır, bilgi sayfası
  çalışma ekranının üstünde açılır (`runAndClose` ile, iOS'ta 180 ms gecikme zaten var).
  Araç çubuğu gizliyken bu menüye **Yüzen Araçlar düğmesi** veya kaydırma hareketiyle ulaşılır.
- **Durum ekranlarında başlığın yanına küçük ⓘ** (yalnızca kart yokken görünen ekranlar, yer var):
  bekleme durumu **Şimdilik hepsi bu kadar!** (`index.tsx:3167`) ve bitiş durumu **Tebrikler!**
  (`index.tsx:3260`). Başlık ile ⓘ aynı satırda, ⓘ başlığın sağında; dokunma alanı en az 44×44.
- Yan panellere (⋮ menüsü, bayrak menüsü), yazı tahtası araç çubuğuna ve iOS uyarılarına (Zaman
  kutusu) ⓘ veya tutamaçlı sayfa eklenmez; oralarda yalnızca kısa metinler önerilir.

---

### help.reviewer.sheet — Çalışma ekranı bilgi sayfası (yeni)
- **Yer:** Çalışma ekranı › ⋮ (**Kart ve not seçenekleri**) menüsü › son satır
  **Çalışma ekranı hakkında** (yeni), `components/CardOptionsMenu.tsx:362` sonrası. iPhone ve web,
  klasik ve yeni düzen.
- **Tetikleyici:** Satıra dokunma
- **Bileşen:** bilgi sayfası (`HelpSheet`, `SwipeDismissSheet` üzerinde; eyebrow, title, summary, points[], note, more)
- **Daha fazla bilgi:** `tr/05-studying.md#show-answer` (`help?article=studying&section=show-answer`)
- **Durum:** Yeni

**TR**
- Eyebrow: ÇALIŞMA EKRANI
- Başlık: Çalışma ekranı nasıl kullanılır?
- Özet: Soruyu düşünün, cevabı açın ve ne kadar iyi hatırladığınızı bir düğmeyle bildirin. Uygulama kartın ne zaman yeniden geleceğini buna göre seçer.
- Maddeler: (1) Düğmelerin üstündeki süre, o seçimle kartın ne zaman yeniden geleceğidir. Unuttuysanız **Tekrar**'a basın. (2) Üç renkli sayı kalan **yeni**, **öğrenme** ve **tekrar** kartlarıdır; altı çizili olan ekrandaki kartın grubudur. (3) Cevap açıkken kartın soluna dokunmak **Tekrar**, sağına dokunmak **İyi** olarak cevaplar. Bunu **Ayarlar › Kontroller**'den değiştirebilirsiniz. (4) Yanlış düğmeye bastıysanız **↶** ile geri alın; gömme, askıya alma, düzenleme ve sıfırlama bu menüdedir, bayrak **⚑** düğmesindedir.
- Not: Klasik düzen varsayılandır. Yeni düzeni **Ayarlar › Yeni çalışma ekranı** bölümünden açabilirsiniz.

**EN**
- Eyebrow: STUDY SCREEN
- Title: How the study screen works
- Summary: Think of the answer, reveal it and say how well you remembered it with a button. The app picks when the card comes back from that.
- Points: (1) The time above each button is when the card comes back with that choice. If you forgot it, press **Again**. (2) The three coloured numbers are the **new**, **learning** and **review** cards left; the underlined one is the group of the card on screen. (3) With the answer showing, tapping the left side of the card answers **Again** and tapping the right side answers **Good**. Change this under **Settings › Controls**. (4) Pressed the wrong button? Undo it with **↶**. Bury, suspend, edit and reset are in this menu; flags are on the **⚑** button.
- Note: The classic layout is the default. Turn on the new one under **Settings › New study screen**.

### help.reviewer.waitingSheet — Öğrenme bekleme bilgi sayfası (yeni)
- **Yer:** Çalışma ekranı › bekleme durumu, **Şimdilik hepsi bu kadar!** başlığının sağında ⓘ (yeni), `app/(tabs)/index.tsx:3167`. iPhone ve web, iki düzen.
- **Tetikleyici:** ⓘ'ye dokunma. ⓘ erişilebilirlik etiketi: "Bekleme ekranı hakkında" / "About this waiting screen"
- **Bileşen:** bilgi sayfası (`HelpSheet`)
- **Daha fazla bilgi:** `tr/05-studying.md#learn-ahead` (`help?article=studying&section=learn-ahead`)
- **Durum:** Yeni

**TR**
- Başlık: Neden bekliyorum?
- Özet: Şu an hazır kart kalmadı. Öğrenme adımındaki kartlar, adım süreleri dolunca yeniden gelir.
- Maddeler: (1) Geri sayım bitince sıradaki kart kendiliğinden gelir; ekranı kapatmanız gerekmez. (2) **Önceden öğrenme sınırı** (varsayılan 20 dk) içinde kalan kartlar, başka kart kalmadığında beklemeden gösterilir. Geri sayım kartın bu pencereye girdiği ana kadar sürer. (3) **⚡ Beklemeden çalış** bu destede bekleyen bütün öğrenme kartlarını hemen getirir; her kart bir kez gelir.
- Not: Sınırı **Ayarlar › İnceleme › Önceden öğrenme sınırı** satırından değiştirebilirsiniz. Filtrelenmiş destelerde önceden öğrenme yapılmaz.

**EN**
- Title: Why am I waiting?
- Summary: No cards are ready right now. Cards in a learning step come back when their step time is up.
- Points: (1) When the countdown ends, the next card comes up by itself; you do not need to leave the screen. (2) Cards within the **Learn ahead limit** (20 mins by default) are shown without waiting once nothing else is left. The countdown runs until the card enters that window. (3) **⚡ Study Now** brings in every waiting learning card in this deck at once; each card comes once.
- Note: Change the limit under **Settings › Reviewing › Learn ahead limit**. Filtered decks do not learn ahead.

### help.reviewer.finishedSheet — Bitiş ekranı bilgi sayfası (yeni)
- **Yer:** Çalışma ekranı › bitiş durumu, **Tebrikler!** başlığının sağında ⓘ (yeni), `app/(tabs)/index.tsx:3260`. iPhone ve web, iki düzen.
- **Tetikleyici:** ⓘ'ye dokunma. ⓘ erişilebilirlik etiketi: "Bitiş ekranı hakkında" / "About this screen"
- **Bileşen:** bilgi sayfası (`HelpSheet`)
- **Daha fazla bilgi:** `tr/05-studying.md#finished` (`help?article=studying&section=finished`)
- **Durum:** Yeni

**TR**
- Başlık: Bugünlük bitti
- Özet: Bu kapsamda bugün gösterilecek kart kalmadı. Yeni kartlarda günlük sınır olmadığından bu ekran, yeni kartlar da bitince gelir.
- Maddeler: (1) Büyük sayaç, yarın vadesi gelecek kartlar için yeni çalışma gününe kalan süredir. (2) **Tekrar limitini artır** görünüyorsa bekleyen tekrar kartları vardır; limit deste seçeneklerindedir. (3) **🎯 Özel çalışma** ek bir oturum kurar; **💤 … gömülü kartı şimdi aç** bugün gömülen kartları geri getirir. (4) Filtrelenmiş destede **🔄 Yeniden oluştur** desteyi kayıtlı kurallarıyla yeniden toplar.
- Not: Yeni çalışma günü **Ayarlar › İnceleme › Sonraki günün başlangıcı** saatinde (varsayılan 04:00) başlar.

**EN**
- Title: Done for today
- Summary: Nothing else is due in this scope today. As new cards have no daily limit, this screen appears once the new cards are done too.
- Points: (1) The large counter is the time until the next study day, for cards due tomorrow. (2) If **Increase Review Limit** is showing, review cards are still waiting; the limit is in the deck options. (3) **🎯 Custom Study** sets up an extra session; **💤 Unbury … now** brings back the cards buried today. (4) In a filtered deck, **🔄 Rebuild** gathers the deck again with its saved rules.
- Note: The next study day starts at **Settings › Reviewing › Start of next day** (4:00 by default).

---

## Kısa metinler — çalışma ekranı

| ID | Yer (kontrol, dosya:satır) | Tür | TR | EN | Durum |
| --- | --- | --- | --- | --- | --- |
| help.reviewer.menuRow | ⋮ menüsü son satır, `components/CardOptionsMenu.tsx:362` sonrası | menü satırı | Çalışma ekranı hakkında | About the study screen | Yeni |
| help.reviewer.tapZonesFirstRun | Cevap ilk kez açıldığında, cevap çubuğunun hemen üstünde kapatılabilir şerit, `app/(tabs)/index.tsx:2820` (answerBar) üstü; yalnızca **9 noktalı dokunma** açık ve cevap bölgeleri varsayılanken, bir kez | ipucu (tek seferlik) | Cevap açıkken kartın soluna dokunmak Tekrar, sağına dokunmak İyi olarak cevaplar. Ayarlar › Kontroller'den değiştirebilirsiniz. | With the answer showing, tapping the left of the card answers Again and the right answers Good. You can change this in Settings › Controls. | Yeni |
| help.reviewer.showAnswerHold | **Cevabı göster** düğme metni, basılı tutma süresi > 0 iken, `index.tsx:2863`; aynı metin erişilebilirlik ipucu olarak | düğme metni | Cevap için basılı tutun | Hold to show answer | Yeni |
| help.reviewer.typeAnswerHint | Yazarak cevap kutusu (**Yanıtınızı yazın…**), `index.tsx:2848` | erişilebilirlik ipucu | Bitti cevabı açar ve yazdığınızı doğru cevapla karşılaştırır. Puanı siz verirsiniz. | Done reveals the answer and compares it with what you typed. You still grade the card. | Yeni |
| help.reviewer.typeAnswerPlaceholder | Aynı kutu, yer tutucu, `index.tsx:2841` ve `components/CardWebView.tsx:268` | yer tutucu | Yanıtınızı yazın… | Type your answer… | Mevcut — koru |
| help.reviewer.streakLabelClassic | Klasik üst çubuktaki 🔥 seri çipi, `index.tsx:2904-2909` (bugün etiketsiz) | erişilebilirlik etiketi | Günlük seri: {n} gün | Daily streak: {n} days | Yeni (yeni düzendeki `index.tsx:3054` metni) |
| help.reviewer.classicTitleHidden | Klasik üst çubuk başlığı, **Deste başlığını göster** kapalıyken, `index.tsx:2901` | başlık | Deste seç | Select deck | Mevcut — güncelle (eski metin: "Bugünün Kartları" / "Cards for Today"; tek deste çalışılırken de bu yazıyor) |
| help.reviewer.countsLabel | Sayılar, `index.tsx:2647-2650` | erişilebilirlik etiketi | {n} yeni, {n} öğrenme, {n} tekrar kartı | {n} new, {n} learning, {n} review cards | Mevcut — koru |
| help.reviewer.undoLabel | ↶ düğmesi, `index.tsx:2760-2762`, `2918-2920` | erişilebilirlik etiketi | Geri al: {işlem} · Geri alınacak işlem yok | Undo: {op} · Nothing to undo | Mevcut — koru |
| help.reviewer.undoConflict | Geri alma reddedilince, `index.tsx:1174-1180`, `1201-1206` | uyarı | Bu kart sonradan başka bir yerde yeniden zamanlandı. Geri alma geçmişi temizlendi. | This card was rescheduled elsewhere afterwards. The undo history was cleared. | Mevcut — koru |
| help.reviewer.leechNotice | Bir cevap kartı sürekli unutulan yaptığında, cevap kaydedildikten sonra (`index.tsx:1016` civarı; işaret `sideEffects.leechTaggedNoteId`, `lib/studyAnswer.ts:425`); ekranın altında kısa bildirim, ikincil eylem **Kart bilgisi** | bildirim (toast) | Bu kart sürekli unutulan kart oldu ve "leech" etiketi aldı. Kartı kısaltmak veya bölmek işe yarayabilir. (Kart askıya alındıysa: "Kart askıya alındı.") | This card became a leech and got the "leech" tag. Shortening or splitting it may help. (If suspended: "The card was suspended.") | Yeni |
| help.reviewer.waitingCaption | Bekleme durumu, geri sayımın altı, `index.tsx:3168` | açıklama | Sıradaki öğrenme kartına kalan süre | Time until the next learning card | Yeni |
| help.reviewer.countdownSeconds | Geri sayım saniye biçimi, `index.tsx:862` | sayaç biçimi | {n}sn | {n}s | Mevcut — güncelle (eski metin: iki dilde de "{n}sn") |
| help.reviewer.learnAheadSettings | **Bekleme ayarları** düğmesi, `index.tsx:3186-3194` | düğme | Bekleme ayarları | Learn-ahead settings | Mevcut — koru (davranış notu: Ayarlar ana sayfasını açıyor; doğrudan **İnceleme** bölümünü açması önerilir) |
| help.reviewer.studyAhead | **⚡ Beklemeden çalış** düğmesi, `index.tsx:3177-3185` | düğme + erişilebilirlik | Beklemeden çalış · Bekleme süresini atla ve hemen çalış | Study Now · Skip the wait and study now | Mevcut — koru |
| help.reviewer.finishedCaption | Bitiş durumu, sayacın altı, `index.tsx:3261-3263` | açıklama | Yeni çalışma gününe kalan süre | Time until the next study day | Yeni |
| help.reviewer.todayCount | Bekleme ve bitiş durumlarının alt satırı, `index.tsx:3196-3198`, `3318-3320` | dipnot | Bugün tüm destelerde {n} cevap verdiniz. | You gave {n} answers today across all decks. | Mevcut — güncelle (eski metin: "Bugün {n} kart tekrar edildi." / "Today {n} cards were reviewed."; sayı cevap sayısıdır, tüm destelerde ve tekrarlar dahil) |
| help.reviewer.reviewLimitInfo | Bitiş durumu, günlük tekrar limiti satırı, `index.tsx:3282-3288` | bilgi | 📋 Günlük tekrar limiti doldu — … | 📋 Today's review limit was reached — … | Mevcut — koru |
| help.reviewer.emptyStates | **Filtreli deste boş** (`index.tsx:3202-3207`), **Bu Deste Henüz Boş** (`3229-3236`) | boş durum | (mevcut metinler) | (existing text) | Mevcut — koru |

## Zaman kutusu penceresi

| ID | Yer | Tür | TR | EN | Durum |
| --- | --- | --- | --- | --- | --- |
| help.reviewer.timeboxMessage | **Zaman kutusu** iOS uyarısı, ileti, `app/(tabs)/index.tsx:1034-1042` (`lib/confirm.ts` `choose`) | uyarı iletisi | {m} dakikada {n} kart çalıştınız. Devam yeni bir süre başlatır; Bitir sizi deste listesine götürür. | You studied {n} cards in {m} minutes. Continue starts a new block; Finish takes you to the deck list. | Mevcut — güncelle (eski metin: yalnızca ilk cümle) |

## Kısa metinler — ⋮ menüsü (`components/CardOptionsMenu.tsx`)

| ID | Yer (kontrol, dosya:satır) | Tür | TR | EN | Durum |
| --- | --- | --- | --- | --- | --- |
| help.reviewer.menu.buryDesc | **Göm** alt sayfasının üstü (mevcut `subDesc` kalıbı), `CardOptionsMenu.tsx:366` | açıklama | Gömülen kartlar yeni çalışma günü başlayınca kendiliğinden geri gelir. | Buried cards come back by themselves when the next study day starts. | Yeni |
| help.reviewer.menu.suspendDesc | **Askıya al** alt sayfasının üstü, `CardOptionsMenu.tsx:373` | açıklama | Askıya alınan kartlar siz Kartlarım'dan geri açana kadar gelmez. | Suspended cards stay out of study until you unsuspend them in the Card Browser. | Yeni |
| help.reviewer.menu.buryHint | **Kartı göm** satırı (kardeşsiz), `CardOptionsMenu.tsx:304` | erişilebilirlik ipucu | Kartı yarına kadar gizler. | Hides the card until tomorrow. | Yeni |
| help.reviewer.menu.suspendHint | **Kartı askıya al** satırı (kardeşsiz), `CardOptionsMenu.tsx:309-316` | erişilebilirlik ipucu | Kartı siz geri açana kadar gizler. | Hides the card until you unsuspend it. | Yeni |
| help.reviewer.menu.deleteConfirm | **Notu sil** onayı, `CardOptionsMenu.tsx:325-330` | onay iletisi | Bu not ve bütün kartları silinecek. Hemen ardından açılan pencerede Geri al ile geri getirebilirsiniz. | This note and all its cards will be deleted. You can bring it back with Undo in the dialog that follows. | Mevcut — güncelle (eski metin: "Bu not ve kartları silinecek. Silme sonrasında geri alabilirsiniz." — geri alma yalnızca hemen açılan pencerede var, ↶ geçmişinde yok) |
| help.reviewer.menu.deletedDialog | **Not silindi** penceresi, `app/(tabs)/index.tsx:1478` | uyarı | {n} kart silindi. · Geri al · Bitti | {n} cards deleted. · Undo · Done | Mevcut — koru |
| help.reviewer.menu.tagsDesc | **Etiketleri düzenle** alt sayfası, `CardOptionsMenu.tsx:404` | açıklama | Etiketleri boşlukla ayırın. Etiketler notun bütün kartlarına uygulanır. | Separate tags with spaces. Tags apply to every card of the note. | Mevcut — güncelle (eski metin: yalnızca ilk cümle) |
| help.reviewer.menu.dueDateText | **Son tarihi ayarla** açıklamaları, `CardOptionsMenu.tsx:451-454` | açıklama | (mevcut iki satır) | (existing two lines) | Mevcut — koru |
| help.reviewer.menu.dueDateInvalid | Aynı sayfa, geçersiz giriş varken giriş kutusunun altında (`CardOptionsMenu.tsx:466` üstü) | hata ipucu | Örneğin 0, 5, 3-7 veya 3-7! yazın; eksi sayı ve boşluk kullanmayın. | Type for example 0, 5, 3-7 or 3-7!, without minus signs or spaces. | Yeni |
| help.reviewer.menu.resetText | **Kartı sıfırla** açıklaması, `CardOptionsMenu.tsx:423` | açıklama | Kart Yeni durumuna döner. Tekrar geçmişi korunur. | The card goes back to New. Its review history is kept. | Mevcut — koru |

## Kısa metinler — bayrak menüsü (`components/ReviewerFlagMenu.tsx`)

| ID | Yer | Tür | TR | EN | Durum |
| --- | --- | --- | --- | --- | --- |
| help.reviewer.flag.subtitle | **Bayrak rengi** başlığının altı, `ReviewerFlagMenu.tsx:53-55` | açıklama | Bayrak yalnızca bu karta konur. Bayraklı kartları Kartlarım'da bulabilirsiniz. | The flag goes on this card only. Find flagged cards in the Card Browser. | Yeni |
| help.reviewer.flag.names | Satırlar, `lib/i18n.ts:498-503` | etiket | Kırmızı bayrak … Mor bayrak, Bayrak yok | Red flag … Purple flag, No flag | Mevcut — koru |

## Kısa metinler — yazı tahtası (`components/WhiteboardOverlay.tsx`)

| ID | Yer | Tür | TR | EN | Durum |
| --- | --- | --- | --- | --- | --- |
| help.reviewer.whiteboard.firstRun | ⋮ › **Yazı tahtasını etkinleştir** ile bir destede ilk açılışta, araç çubuğunun altında kısa bildirim (`app/(tabs)/index.tsx:1805-1809` `toggleWhiteboard`) | bildirim (tek seferlik) | Çizim bu karta aittir ve kartı cevaplayınca silinir. Kartı kaydırmak için ✓ ile çizimi bitirin. | The drawing belongs to this card and is erased when you answer it. Tap ✓ to finish drawing and scroll the card. | Yeni |
| help.reviewer.whiteboard.saved | **Çizim kaydedildi** uyarısı, `WhiteboardOverlay.tsx:346` | uyarı | Medya klasörüne kaydedildi: {dosya}. Çizim nota eklenmez. | Saved to media: {file}. The drawing is not added to the note. | Mevcut — güncelle (eski metin: yalnızca ilk cümle) |
| help.reviewer.whiteboard.clearConfirm | Temizleme onayı, `WhiteboardOverlay.tsx:321-326` | onay | Yazı tahtası temizlensin mi? · Çizim kaldırılacak. İsterseniz işlemi geri alabilirsiniz. | Clear the whiteboard? · The drawing will be removed. You can still undo it. | Mevcut — koru |
| help.reviewer.whiteboard.swatch | Renk düğmeleri, `WhiteboardOverlay.tsx:627` | erişilebilirlik etiketi | Kalem rengi: kırmızı / mavi / yeşil / turuncu / mor / siyah | Pen color: red / blue / green / orange / purple / black | Mevcut — güncelle (eski metin: "Kalem rengi #e0393e" gibi onaltılık kod okunuyor) |

## Mevcut yardım (korunacak)

| ID | Yer | Durum |
| --- | --- | --- |
| help.settings.controlsHelp | **Ayarlar › Kontroller › Dokunma ve kaydırma** başlığındaki **?** (`app/settings.tsx:1294-1303`), açılan **ÇALIŞMA KONTROLLERİ / Dokunma ve kaydırmayı özelleştirin** penceresi (`app/settings.tsx:1702-1836`) | Mevcut — koru. Yalnızca **Anladım** düğmesinin üstüne **Daha fazla bilgi** → `tr/05-studying.md#tap-zones-and-swipes` eklenir. |
| help.cardInfo.leech | **Kart bilgisi** › **Sürekli Unutulan Kart nedir?** kutusu (`app/card-info.tsx:211`, `components/LeechExplainer.tsx`) | Mevcut — koru (Kart bilgisi dosyasının sahibi), `tr/05-studying.md#leeches` ile uyumlu. |

## Başka ekranlarda, çalışma ekranını anlatan metinler (o dosyaların sahipleriyle eşgüdüm)

| ID | Yer | TR | EN | Durum |
| --- | --- | --- | --- | --- |
| help.settings.autoAdvanceSummary | **Ayarlar › Yeni çalışma ekranı › Yanıt düğmeleri › Otomatik ilerleme** özeti, `app/settings.tsx:1201` | Deste seçeneklerinde süre verilmiş destelerde cevabı kendiliğinden açar ve seçilen işlemi uygular. | Reveals the answer by itself and carries out the chosen action in decks that have auto advance times in their deck options. | Mevcut — güncelle (eski metin: "Kart açıldıktan sekiz saniye sonra cevabı gösterir." — sabit 8 saniye yok; süreler deste seçeneklerinden gelir, varsayılan 0) |
| help.deckOptions.autoAdvanceNote | Deste seçenekleri › **Otomatik ilerleme** yardımı, not, `components/deck-options/deckOptionsCopy.ts:193` | Bu ayarlar süreleri tanımlar. Ayrıca Ayarlar › Yeni çalışma ekranı › Yanıt düğmeleri › Otomatik ilerleme açık olmalıdır; otomatik verilen notlar normal inceleme kaydı oluşturur. | These options set the timings. Auto advance must also be on in Settings › New study screen › Answer buttons; automatic grades create normal review-log entries. | Mevcut — güncelle (eski metin: "Çalışma ekranındaki Otomatik İlerleme anahtarı…" — çalışma ekranında böyle bir anahtar yok) |
| help.settings.toolbarSummary | **Ayarlar › Yeni çalışma ekranı › Araç çubuğu › Araç çubuğunu göster** özeti, `app/settings.tsx:1165` | Geri, deste kapsamı, sayaçlar ve kart işlemlerini gösterir. Kapalıyken menülere Yüzen Araçlar düğmesi veya kaydırma hareketiyle ulaşırsınız. | Shows back, deck scope, counts and card actions. When off, reach the menus with the floating Tools button or a swipe. | Mevcut — güncelle (eski metin: yalnızca ilk cümle) |
| help.settings.keyboardUndoNote | **Ayarlar › Kontroller › Klavye** bölümünün altı, `components/settings/KeyboardSettingsSection.tsx:146` üstü | Geri al: Z veya U · Desteler'e dön: Esc (değiştirilemez) | Undo: Z or U · Back to Decks: Esc (fixed) | Yeni |
