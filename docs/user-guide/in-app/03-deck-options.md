# Deste seçenekleri — uygulama içi metinler

Kapsam: **Deste seçenekleri** ekranı (`app/deck-options.tsx`), kartlardaki **?** ayar rehberleri
(`components/deck-options/SettingControls.tsx:23-122`, içerik `components/deck-options/deckOptionsCopy.ts`),
ayar grubu seçici / ad penceresi / **•••** menüsü (`components/deck-options/PresetModals.tsx`).
Kaynak: master c6108e6. Makaleler: `tr/06-deck-options.md` (`help?article=deck-options`),
`tr/07-fsrs.md` (`help?article=fsrs`). Ekran iPhone'da ve web'de aynıdır; 900 px ve üstü
genişlikte kartlar iki sütundur. Kenar çubuğunda bu ekrana giriş yoktur.

## ? yerleşimi

- Mevcut 11 ayar rehberi korunur. Her rehberin altına, **Anladım** düğmesinin üstüne
  **Daha fazla bilgi** / **Learn more** bağlantısı eklenir (`help.sheet.more`,
  `SettingControls.tsx:109-115` öncesi). Bunun için `OptionHelp` türüne (`components/deck-options/types.ts:5-13`)
  `more: { article, section }` alanı eklenir. Bağlantı rehberi kapatır ve Yardım merkezini açar.
- Yeni tek bilgi sayfası: **Ayar grubu** satırı için (aşağıda `help.deckOptions.presets`).
- Yeni ⓘ eklenmez; seçim pencerelerine (`SelectSetting`), ••• menüsüne ve iOS uyarılarına tutamaçlı
  sayfa eklenmez.

---

## A. Mevcut ayar rehberleri (? düğmeleri)

Rehberin kendisi `OptionCard` başlığının sağındaki **?** rozetidir (`SettingControls.tsx:38-51`);
her kart rehberini aşağıdaki satırdaki `help={optionHelp.…}` ile alır.

| ID | Kart TR / EN | ? düğmesi | İçerik | Daha fazla bilgi | Durum |
| --- | --- | --- | --- | --- | --- |
| help.deckOptions.dailyLimits | Günlük limitler / Daily Limits | `app/deck-options.tsx:1146` | `deckOptionsCopy.ts:105-118` | `help?article=deck-options&section=daily-limits` (`tr/06-deck-options.md#daily-limits`) | Mevcut — koru |
| help.deckOptions.newCards | Yeni kartlar / New Cards | `app/deck-options.tsx:1168` | `deckOptionsCopy.ts:119-129` | `help?article=deck-options&section=new-cards` (`tr/06-deck-options.md#new-cards`) | Mevcut — güncelle (madde 3, aşağıda) |
| help.deckOptions.lapses | Unutmalar / Lapses | `app/deck-options.tsx:1199` | `deckOptionsCopy.ts:130-140` | `help?article=deck-options&section=lapses` (`tr/06-deck-options.md#lapses`) | Mevcut — koru |
| help.deckOptions.fsrs | FSRS | `app/deck-options.tsx:1236` | `deckOptionsCopy.ts:87-104` | `help?article=fsrs&section=what-is-fsrs` (`tr/07-fsrs.md#what-is-fsrs`) | Mevcut — güncelle (madde 4, aşağıda) |
| help.deckOptions.displayOrder | Görüntüleme sırası / Display Order | `app/deck-options.tsx:1356` | `deckOptionsCopy.ts:141-151` | `help?article=deck-options&section=display-order` (`tr/06-deck-options.md#display-order`) | Mevcut — koru |
| help.deckOptions.burying | Gömme / Burying | `app/deck-options.tsx:1425` | `deckOptionsCopy.ts:152-162` | `help?article=deck-options&section=burying` (`tr/06-deck-options.md#burying`) | Mevcut — koru |
| help.deckOptions.audio | Ses / Audio | `app/deck-options.tsx:1435` | `deckOptionsCopy.ts:163-173` | `help?article=deck-options&section=audio` (`tr/06-deck-options.md#audio`) | Mevcut — koru |
| help.deckOptions.timers | Zamanlayıcılar / Timers | `app/deck-options.tsx:1459` | `deckOptionsCopy.ts:174-184` | `help?article=deck-options&section=timers` (`tr/06-deck-options.md#timers`) | Mevcut — koru |
| help.deckOptions.autoAdvance | Otomatik ilerleme / Auto Advance | `app/deck-options.tsx:1470` | `deckOptionsCopy.ts:185-195` | `help?article=deck-options&section=auto-advance` (`tr/06-deck-options.md#auto-advance`) | Mevcut — güncelle (not, aşağıda) |
| help.deckOptions.easyDays | Kolay günler / Easy Days | `app/deck-options.tsx:1523` | `deckOptionsCopy.ts:196-206` | `help?article=deck-options&section=easy-days` (`tr/06-deck-options.md#easy-days`) | Mevcut — koru |
| help.deckOptions.advanced | Gelişmiş / Advanced | `app/deck-options.tsx:1549` | `deckOptionsCopy.ts:207-220` | `help?article=deck-options&section=advanced` (`tr/06-deck-options.md#advanced`) | Mevcut — koru |

**Deste açıklaması** kartında (`app/deck-options.tsx:1572`) rehber yoktur ve eklenmez.

### Rehber içeriği düzeltmeleri

| ID | Yer | TR (yeni) | EN (yeni) | Durum |
| --- | --- | --- | --- | --- |
| help.deckOptions.newCards.point3 | Yeni kartlar rehberi, 3. madde, `deckOptionsCopy.ts:125` | Ekleniş sırası kartların konum numaralarını değiştirmez. **Rastgele** seçiliyken ve yeni kart toplama sırası **Deste** iken yeni kartlar her gün karışık sırayla gelir. Diğer sıralar için **Görüntüleme sırası** bölümünü kullanın. | Insertion order does not change card position numbers. With **Random** and the new card gather order set to **Deck**, new cards come in a shuffled order each day. Use **Display Order** for other orders. | Mevcut — güncelle (eski metin: "Ekleniş sırası kartların konum numaralarını belirler. Günlük çalışma sırasını değiştirmek için “Görüntüleme Sırası” bölümünü kullanın." / "Insertion order assigns card position numbers. Use Display Order to control the daily study sequence.") |
| help.deckOptions.fsrs.point4 | FSRS rehberi, 4. madde, `deckOptionsCopy.ts:97` | “Parametreleri optimize et”, parametreleri kendi tekrar geçmişinizden yeniden hesaplar ve yalnızca daha iyi tahmin ediyorsa yazar. | “Optimize parameters” refits the parameters from your own review history and only writes them when they predict better. | Mevcut — güncelle (eski metin: "“Optimize et”, …" / "“Optimize” refits …"; düğmenin adı **Parametreleri optimize et** / **Optimize parameters**) |
| help.deckOptions.autoAdvance.note | Otomatik ilerleme rehberi, not, `deckOptionsCopy.ts:193` | Bu ayarlar süreleri tanımlar. Çalışması için **Ayarlar › Yeni çalışma ekranı › Yanıt düğmeleri › Otomatik ilerleme** de açık olmalıdır. Otomatik verilen cevaplar tekrar geçmişine normal cevap olarak yazılır. | These options set the timings. For them to run, **Settings › New study screen › Answer buttons › Auto advance** must be on as well. Automatic answers are saved in the review history like normal answers. | Mevcut — güncelle (eski metin: "…Çalışma ekranındaki Otomatik İlerleme anahtarı ayrıca açık olmalıdır…" / "Auto Advance must also be enabled for studying…" — çalışma ekranında böyle bir anahtar yok) |

---

## B. Yeni bilgi sayfası

### help.deckOptions.presets — Ayar grubu bilgi sayfası (yeni)
- **Yer:** Deste seçenekleri › **Ayar grubu** satırının sağ ucu, ⌄ işaretinin yanında ayrı bir **?**
  düğmesi (satırın kendi dokunma alanının dışında), `app/deck-options.tsx:1103-1120`. Erişilebilirlik
  etiketi: "Ayar grubu nedir?" / "What is a preset?". iPhone ve web.
- **Tetikleyici:** ?'ye dokunma
- **Bileşen:** bilgi sayfası (`OptionCard` rehberiyle aynı kalıp: eyebrow **AYAR REHBERİ**, title, summary, points[], note, more)
- **Daha fazla bilgi:** `tr/06-deck-options.md#presets` (`help?article=deck-options&section=presets`)
- **Durum:** Yeni

**TR**
- Başlık: Ayar grubu nedir?
- Özet: Bu ekrandaki ayarlar desteye değil, ayar grubuna kaydedilir. Aynı grubu kullanan bütün desteler aynı ayarlarla çalışır.
- Maddeler: (1) Satırdaki sayı grubu kaç destenin kullandığını gösterir; kaydettiğiniz değişiklik hepsine uygulanır. (2) Yalnızca bu desteyi değiştirmek için **••• › Bu deste için ayrı ayar grubu oluştur**'u kullanın; **Ayar grubu ekle** varsayılan değerlerle yeni bir grup açar. (3) Grup eklemek, kopyalamak, yeniden adlandırmak ve **Varsayılana dön** hemen uygulanır; grup seçmek ve **Sil** ise **Kaydet** ile. (4) **Kaydet ve tüm alt destelere uygula** alt destelerin hepsini bu gruba geçirir ve seçili sekmedeki tekrar limitini onlara da uygular.
- Not: **Bu deste** ve **Yalnızca bugün** limitleri, destenin kendi hedeflenen hatırlama oranı ve açıklaması gruba değil desteye aittir.

**EN**
- Title: What is a preset?
- Summary: The settings on this screen are saved in a preset, not on the deck. Every deck that uses the same preset studies with the same settings.
- Points: (1) The number in the row shows how many decks use the preset; a change you save applies to all of them. (2) To change only this deck, use **••• › Create a Separate Preset for This Deck**; **Add Preset** starts a new preset with the default values. (3) Adding, copying, renaming a preset and **Restore Defaults** take effect immediately; choosing a preset and **Delete** take effect with **Save**. (4) **Save and Apply to All Subdecks** moves every subdeck to this preset and applies the selected review-limit tab to them as well.
- Note: The **This deck** and **Today only** limits, the deck's own desired retention and its description belong to the deck, not to the preset.

---

## C. Kısa metinler — Deste seçenekleri ekranı

| ID | Yer (kontrol, dosya:satır) | Tür | TR | EN | Durum |
| --- | --- | --- | --- | --- | --- |
| help.deckOptions.newCardsUnlimited | **Günlük limitler** kartının ilk satırı, `app/deck-options.tsx:1147-1149` | açıklama | Yeni kartlar için günlük sınır yoktur. | New cards have no daily limit. | Mevcut — koru |
| help.deckOptions.reviewLimitHint.preset | **Günlük en fazla tekrar** alanının altı, **Ayar grubu** sekmesi seçiliyken, `app/deck-options.tsx:1151-1158` (`Field` `hint`) | ipucu | Bu grubu kullanan bütün destelerin ortak değeri. Bu sekmede kaydederseniz bu destenin kendi limitleri kaldırılır. | Shared by every deck that uses this preset. Saving on this tab removes this deck's own limits. | Yeni |
| help.deckOptions.reviewLimitHint.deck | Aynı alan, **Bu deste** sekmesi seçiliyken | ipucu | Yalnızca bu deste için, kalıcı. Boş bırakırsanız ayar grubunun değeri geçerli olur. | For this deck only, permanently. Leave it empty to use the preset's value. | Yeni |
| help.deckOptions.reviewLimitHint.today | Aynı alan, **Yalnızca bugün** sekmesi seçiliyken | ipucu | Yalnızca bugün için; sonraki çalışma gününde kendiliğinden kalkar. | For today only; it is removed at the next study day. | Yeni |
| help.deckOptions.limitsFromTopHint | **Limitler en üst desteden başlasın** anahtarının altı, `app/deck-options.tsx:1164` | ipucu | Açıkken bir alt desteyi tek başına çalışsanız da üst destelerin tekrar limitleri uygulanır. Tüm ayar grupları için geçerlidir. | When on, parent decks' review limits also apply when you study a subdeck on its own. Applies to all presets. | Mevcut — güncelle (eski metin: "Tüm ayar grupları için geçerlidir." / "Applies to all presets.") |
| help.deckOptions.learningStepsHint | **Öğrenme adımları** alanının altı, `app/deck-options.tsx:1174` | ipucu | Boşlukla ayırın: 1m 10m · birimler: s, m, h, d · birimsiz sayı dakikadır | Separate with spaces: 1m 10m · units: s, m, h, d · a bare number is minutes | Mevcut — güncelle (eski metin: "Boşlukla ayırın: 1m 10m · birimler: s, m, h, d") |
| help.deckOptions.graduatingIvlHint | **Mezuniyet aralığı (gün)** alanının altı, `app/deck-options.tsx:1182` | ipucu | Son adımda İyi'ye bastığınızda kartın ilk tekrar aralığı. | The first review interval when you press Good on the last step. | Yeni |
| help.deckOptions.easyIvlHint | **Kolay aralığı (gün)** alanının altı, `app/deck-options.tsx:1183` | ipucu | Öğrenmedeki bir kartta Kolay'a bastığınızda verilen aralık. | The interval given when you press Easy on a learning card. | Yeni |
| help.deckOptions.minIvlHint | **En az aralık (gün)** alanının altı, `app/deck-options.tsx:1210` | ipucu | Unutulan kartın yeniden öğrenmeden sonra alabileceği en kısa aralık. | The shortest interval a forgotten card can get after relearning. | Yeni |
| help.deckOptions.leechThresholdHint | **Sürekli unutulan kart eşiği** alanının altı, `app/deck-options.tsx:1217-1220` | ipucu | Kart bu sayıda unutulunca “Sürekli Unutulan Kart” olarak işaretlenir, sonra her yarım eşikte yeniden. Varsayılan: 8. | The card is marked as a Leech at this many lapses, then again every half of this number. Default: 8. | Mevcut — güncelle (eski metin: "Kart bu sayıda unutulduğunda işaretlenir. Varsayılan: 8." / "The card is marked when it reaches this many lapses. Default: 8.") |
| help.deckOptions.leechActionHint | **Eşiğe ulaşıldığında** seçiminin altı, `app/deck-options.tsx:1222-1233` (`SelectSetting`'e `hint` özelliği eklenmeli) | ipucu | Askıya alınan kart siz geri açana kadar gelmez. Bu kartları Kartlarım'da `tag:leech` ile bulabilirsiniz. | A suspended card stays out of study until you unsuspend it. Find these cards in the Card Browser with `tag:leech`. | Yeni |
| help.deckOptions.audioAutoplayHint | **Sesi otomatik oynat** anahtarının altı, `app/deck-options.tsx:1436` | ipucu | Ayarlar › İnceleme › Gelişmiş › Sesi otomatik oynat da açık olmalıdır. | Settings › Reviewing › Advanced › Automatically play audio must also be on. | Yeni |
| help.deckOptions.audioSpeedHint | **Ses oynatma hızı** seçiminin altı, `app/deck-options.tsx:1437-1451` (`SelectSetting`'e `hint` eklenmeli) | ipucu | Bu ayar grubundaki kartların ses çalma hızı. | Playback speed of card audio in this preset. | Yeni |
| help.deckOptions.autoAdvanceMaster | **Otomatik ilerleme** kartının ilk satırı (yeni `Text`, `fieldHint` stili), `app/deck-options.tsx:1470-1471` arası | açıklama | Yalnızca Ayarlar › Yeni çalışma ekranı › Yanıt düğmeleri › Otomatik ilerleme açıkken çalışır. İki süre de 0 ise hiçbir şey olmaz. | Runs only while Settings › New study screen › Answer buttons › Auto advance is on. Nothing happens while both times are 0. | Yeni |
| settings.autoAdvance.summary | Ayarlar › Yeni çalışma ekranı › Yanıt düğmeleri › **Otomatik ilerleme** satırının özeti, `app/settings.tsx:1201` (Ayarlar taslağıyla eşleştirin) | özet | Süreleri Deste seçenekleri › Otomatik ilerleme'den alır; süreler 0 ise bir şey olmaz. | Uses the times set in Deck Options › Auto Advance; nothing happens while they are 0. | Mevcut — güncelle (eski metin: "Kart açıldıktan sekiz saniye sonra cevabı gösterir." / "Reveals the answer eight seconds after a card opens.") |
| help.deckOptions.maxIvlHint | **En fazla aralık (gün)** alanının altı, `app/deck-options.tsx:1550` | ipucu | Hiçbir tekrar aralığı bundan uzun olmaz. Varsayılan: 36500. | No review interval is longer than this. Default: 36500. | Yeni |
| help.deckOptions.newIvlPercentHint | **Yeni aralık (%) — unutma sonrası** alanının altı, `app/deck-options.tsx:1560` | ipucu | 0 = en az aralıktan yeniden başlar | 0 = restart from the minimum interval | Mevcut — güncelle (eski metin: "0 = baştan başla" / "0 = start over") |
| help.deckOptions.descriptionPlaceholder | **Deste açıklaması** alanının yer tutucusu, `app/deck-options.tsx:1577` | yer tutucu | Bu deste hakkında not (genel bakışta ve çalışma ekranında görünür) | Notes about this deck (shown on the overview and the study screen) | Mevcut — güncelle (eski metin: "Bu deste hakkında not (çalışma ekranında görünür)" / "Notes about this deck (shown on the study screen)") |
| help.deckOptions.insertionOrderWarning | **Ekleniş sırası** altındaki bilgi kutusu, `deckOptionsCopy.ts:31-35` | uyarı (bilgi) | Rastgele seçiliyken, yeni kart toplama sırası Deste ise yeni kartlar her gün karışık sırayla gelir. Kartların konum numaraları değişmez. | With Random, new cards come in a shuffled order each day when the new card gather order is Deck. Card position numbers do not change. | Mevcut — güncelle (eski metin: "Rastgele ekleme kartların konum numaralarını karıştırır. Günlük çalışma sırası yine Görüntüleme sırasından gelir." / "Random insertion shuffles the position numbers of new cards. The daily study order still comes from Display Order.") |
| help.deckOptions.applySubdecksConfirm | **••• › Kaydet ve tüm alt destelere uygula** dokunulduğunda, `handleApplyToSubdecks` başında `app/deck-options.tsx:955` (yeni onay; `confirm`, `destructive`) | onay | Başlık: Tüm alt destelere uygulansın mı? · Metin: Ayarlar kaydedilecek. Bu destenin bütün alt desteleri “{preset}” ayar grubuna geçecek ve alt destelerin kendi tekrar limitleri bu destedeki seçime göre değiştirilecek veya kaldırılacak. | Title: Apply to all subdecks? · Message: The settings will be saved. Every subdeck of this deck will move to the “{preset}” preset, and the subdecks' own review limits will be changed or removed to match this deck's choice. | Yeni |
| help.deckOptions.backA11y | Başlıktaki geri düğmesinin erişilebilirlik etiketi, `app/deck-options.tsx:1055` | erişilebilirlik etiketi | Geri | Back | Mevcut — güncelle (eski metin: "Deste genel bakışına dön" / "Back to deck overview"; ekran çalışma ekranından ve deste listesinden de açılır) |
| help.deckOptions.renameMenuLabel | **•••** menüsü, yeniden adlandırma satırı, `app/deck-options.tsx:1594` | menü etiketi | Ayar grubunu yeniden adlandır | Rename Preset | Mevcut — güncelle (yalnızca EN; eski metin: "Rename preset", pencere başlığı `PresetModals.tsx:126` "Rename Preset") |

## D. Kısa metinler — FSRS kartı

| ID | Yer (kontrol, dosya:satır) | Tür | TR | EN | Durum |
| --- | --- | --- | --- | --- | --- |
| help.deckOptions.fsrsSwitchHint | **FSRS zamanlayıcısını kullan** anahtarının altındaki metin, `app/deck-options.tsx:1254-1259` | açıklama | FSRS her kart için hafıza gücünü (stability) ve zorluğunu izler; aralıkları kolaylık çarpanı yerine bu iki sayıdan hesaplar. Anahtar tüm koleksiyon için, aşağıdaki değerler bu ayar grubu içindir. Kaydettiğinizde kartların hafıza durumu tekrar geçmişinden hesaplanır; kapatırsanız silinir. | FSRS tracks each card’s memory strength and difficulty, and derives intervals from those instead of an ease multiplier. The switch is collection-wide; the values below belong to this preset. When you save, the cards' memory states are calculated from the review history; turning FSRS off removes them. | Mevcut — güncelle (eski metin: "…Anahtar tüm koleksiyon için, aşağıdaki değerler bu ön ayar içindir." — "ön ayar" yerine ekranın terimi "ayar grubu"; son cümle yeni) |
| help.deckOptions.rescheduleHint | **Değişiklikte kartları yeniden zamanla** altındaki metin, `app/deck-options.tsx:1297-1302` | açıklama | (mevcut metnin sonuna) Yalnızca bu kayıtta parametreleri, hedeflenen hatırlama oranı veya kolay günleri değişen destelerin tekrar kartları yeniden zamanlanır. | (append) Only review cards in decks whose parameters, desired retention or Easy Days change in this save are rescheduled. | Mevcut — genişlet |
| help.deckOptions.optimizeHint | **Parametreleri optimize et** altındaki metin, `app/deck-options.tsx:1316-1321` | açıklama | (mevcut metnin sonuna) Durdurmak için düğmeye yeniden dokunun. Sonucu uygulamak için Kaydet'e basın. | (append) Tap the button again to stop. Press Save to apply the result. | Mevcut — genişlet |
| help.deckOptions.historicalRetentionHint | **Geçmiş hatırlama oranı** alanının altı, `app/deck-options.tsx:1339-1342` | ipucu | 0,50–1,00. Tekrar kaydı olmayan eski kartların hafıza durumu bu orana göre tahmin edilir. | 0.50–1.00. Used to estimate the memory state of older cards that have no review log. | Mevcut — genişlet (aralık eklendi) |
| help.deckOptions.ignoreBeforeHint | **Şu tarihten önceki tekrarları yok say** alanının altı, `app/deck-options.tsx:1350` | ipucu | YYYY-AA-GG. Boş bırakılırsa tüm geçmiş kullanılır; bugünden sonraki tarih bugüne çekilir. | YYYY-MM-DD. Leave empty to use the whole history; a later date is changed to today. | Mevcut — genişlet |
| help.deckOptions.desiredRetentionHint | **Hedeflenen hatırlama oranı** alanının altı, `app/deck-options.tsx:1277-1285` | ipucu | (iki sekme metni) | (both tab texts) | Mevcut — koru |
| help.deckOptions.paramsHint | **FSRS parametreleri** alanının altı, `app/deck-options.tsx:1000-1004` | ipucu | 17, 19 veya 21 sayı. Boş bırakmak varsayılanlara döner. (+ Son optimizasyon: tarih) | 17, 19 or 21 numbers. Leaving it empty restores the defaults. (+ Last optimized: date) | Mevcut — koru |
| help.deckOptions.advancedFsrsNote | **Gelişmiş** kartında FSRS açıkken çarpanların yerindeki metin, `app/deck-options.tsx:1563-1568` | açıklama | — | — | Mevcut — koru |
