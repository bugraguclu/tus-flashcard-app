# Son 24 saat doğrulama denetimi

**Tarih:** 2 Eylül 2026
**Kapsam:** `docs/SON_24_SAAT_IMPLEMENTATION_PLANLARI_VE_OZETLERI.md` içindeki her iddianın kod, git geçmişi ve upstream Anki kaynaklarıyla karşılaştırılması.
**Yöntem:** Statik inceleme + `npm run quality` + upstream `ankitects/anki` proto/rslib ve resmi manual. Canlı cihaz testi yapılmadı.
**Bu denetimde uygulama kaynak kodu değiştirilmedi.**

## Kısa sonuç

Son 24 saatin işi tek bir commit'te duruyor: `4d301fc`. Commit mesajı yalnızca istatistik ekranındaki bir kaydırma düzeltmesini anlatıyor, fakat commit **62 dosya, +8797/−2176 satır** ve dokümandaki 2.1–2.7 bölümlerinin tamamını içeriyor. Mesaj commit'i ciddi biçimde eksik tanımlıyor.

`npm run quality` temiz geçiyor: tip kontrolü, **111 dosyada 972 test**, iOS/uyumluluk kaydı doğrulaması. (Doküman 966 diyor; çalışma ağacındaki commit'lenmemiş testlerle sayı 972'ye çıkmış.)

Buna karşılık **doküman gerçekle birebir örtüşmüyor**. Bir bölüm tamamen uydurma, iki bölüm var olmayan dosya adları veriyor, bir bölüm ise kodun kendisiyle çelişen sayılar veriyor. Ayrıca üç somut hata bulundu; ikisi doğrudan Anki uyumluluğunu bozuyor.

## Düzeltilmesi gereken somut hatalar

| Öncelik | Hata | Kanıt | Olması gereken |
| --- | --- | --- | --- |
| P0 | **`.apkg` import'unda önizleme gecikmesi proto alanları karışmış.** Upstream `decks.proto` şöyle: `preview_hard_secs = 5`, `preview_good_secs = 6`, `preview_again_secs = 7`. Kod 5'i Again, 6'yı Hard, 7'yi Good sanıyor — hem alan numaraları hem varsayılanlar yanlış eşleşiyor. Varsayılan ayarlı gerçek bir Anki destesi (again=60 alan 7'de, hard=600 alan 5'te, good yok) **again=600, hard=600, good=60** olarak içe aktarılıyor. | `lib/importApkg.ts:297-300` | `previewHardSecs = protoNumber(kind, 5, 600)`, `previewGoodSecs = protoNumber(kind, 6, 0)`, `previewAgainSecs = protoNumber(kind, 7, 60)`. `lib/ankiPackageRoundtrip.test.ts:217-233` aynı yanlış varsayımı kodladığı için test paketi hatayı yakalamıyor — fixture da düzeltilmeli. |
| P0 | **Fotoğraf editöründe "çöpe sürükleyip sil" hiç çalışmıyor.** Kırmızı bölge çiziliyor, vurgulanıyor, "Silmek için bırakın" yazıyor; ama bırakınca silmiyor. Neden: `PanResponder.create` `useRef` içinde bir kez kuruluyor, `trashHovered` ise ref aynası olmayan düz `useState`. Kapanış (closure) sonsuza dek ilk render'ın `false` değerini görüyor. | `components/PhotoEditorModal.tsx:1112` (okuma), `:546` (state), `:777` (`useRef(PanResponder.create(...))`) | Dosyadaki diğer state'ler gibi (`toolRef`, `cropBoxRef`, `annotationsRef`, `selectedTextIdRef`) bir `trashHoveredRef` aynası eklenip `:1112`'de `trashHoveredRef.current` okunmalı. |
| P1 | **`replaceDeckNameInSearch` arama sorgusunu bozabiliyor.** Fonksiyon tokenizer yerine regex kullanıyor. Dört somut kırılma: (1) sekme/yeni satır ayracı yutuluyor — `'is:due\tdeck:Anatomi'` → `'is:duedeck:Yeni'`; (2) deste adındaki tırnaklar sessizce siliniyor, var olmayan desteye işaret eden sorgu üretiliyor; (3) parantezli `deck:` terimi hem çifte terim üretiyor hem de temizlenemiyor — `extract` ile `replace` aynı metinde çelişiyor; (4) Anki joker karakterleri (`*`, `_`) kaçırılmıyor. | `lib/filteredDeckOptions.ts:131-160` | `extractDeckNameFromSearch` gibi `tokenizeSearch` üzerinden yeniden yazılmalı; tırnak ve joker kaçışı eklenmeli. `lib/filteredDeckOptions.test.ts:203-243` bu dört durumun hiçbirini kapsamıyor. |

## Bölüm bazında doğrulama

### 2.1 Anki parity ve zamanlama — büyük ölçüde doğru, dokümandaki sayılar yanlış

- **11 toplama sıralaması: DOĞRULANDI.** Upstream `Deck.Filtered.SearchTerm.Order` gerçekten 0–10 ve `RELATIVE_OVERDUENESS = 10`. Doküman iki enum'ı karıştırmamış (deck-options'taki `ReviewCardOrder`'da aynı seçenek 12'dir). Kod ordinalleri birebir tutuyor (`lib/filteredDeckOptions.ts:11-25`), 11 etiket hem tr hem en var (`lib/i18n.ts:385-413`), import/export ordinali koruyor.
  - *Ancak:* `lib/models.ts:276-288` içindeki `FILTERED_ORDERS` ölü kod — yalnızca Türkçe ve hiçbir yerde kullanılmıyor. Ayrıca 8/9/10 sıralamalarının **SQL'i aynı ifadeyi** kullanıyor (`lib/studyRepository.ts:999-1017`): göreceli gecikme oranı (`elapsed / ivl`) değil, mutlak bir "son görülme" yaklaşımı. Liste tam, semantik yaklaşık.
- **Önizleme gecikmeleri: MEKANİZMA DOĞRU, DOKÜMAN YANLIŞ.** Doküman "`[10, 60, 600, 0]` dört değerli vektör" ve "10sn / 1dk / 10dk / —" butonları diyor. Kod üç değerli ve varsayılan `[60, 600, 0]` (`lib/filteredDeckOptions.ts:36`); dördüncü değer bilerek atılıyor; Easy `preview_filter.rs` gibi sabit sıfırla kartı oturumdan çıkarıyor. **Kod doğru olan, doküman yanlış olan.** Varsayılanla butonlar 1dk / 10dk / — / — çıkar.
  - Oturum içi kuyruk gerçekten ref üzerinde (`app/(tabs)/index.tsx:397, 711-720`) ve kart satırı/revlog yazılmıyor (`lib/studyRepository.ts:1751-1759`). "Hiç DB yazımı yok" ifadesi yine de abartılı: gecikme sıfır olduğunda `completeFilteredCard` deste satırını kaydediyor.
  - Anki farkı olarak not edilmeli: gerçek Anki'de önizleme cevabı *kalıcı* yazılır (`queue = PreviewRepeat`, fuzz'lu `due`) ve geri alınabilir; burada bellek içi, fuzz'suz ve geri alınamaz.
- **Editör araç çubuğu eklemeleri: KISMEN DOĞRU.** `strikeThrough`, `removeFormat`, `subscript`, `superscript`, renk seçimi ve ham HTML düzenleme gerçekten var ve bağlı. Fakat `ColorPickerModal` ve `HtmlSourceEditorModal` diye **bileşen yok** — bunlar `app/editor.tsx` içinde satır içi `Modal` blokları.
- **`countCardsForNote(...) === 0` validasyonu: KODDA DOĞRULANDI, ama Anki ile UYUMSUZ.** Anki'nin `note_fields_check`'i kart üretimine değil, yalnızca "ilk alan boş mu"ya bakar ve Basic-and-reversed'da boş ön yüzü Anki de reddeder. Yani bu, kullanıcı lehine bilinçli bir **sapma**; dokümanın ima ettiği gibi bir parity düzeltmesi değil. Böyle belgelenmeli. Not boş `sfld` ile kaydedildiği için Anki'nin ilk-alan tekrar kontrolü de o notta zayıflıyor.

### 2.2 Çalışma ekranı geri tuşu ve Undo — çalışıyor, dört noktada eksik

- Geri ikonu ve Escape var (`app/(tabs)/index.tsx:131-145, 1878, 1988, 1354-1357`). İki uyarı: `handleExitStudy` deste listesine değil `router.back()`'e gidiyor (stats'tan girildiyse stats'a döner), ve native'de Escape yalnızca kart varken yakalanıyor — tebrikler ekranında iOS'ta ölü.
- Undo **gerçek**: `undoAnswer` işlem içinde kart satırını snapshot'tan geri yazıyor ve revlog satırını siliyor (`lib/studyRepository.ts:1713-1725`), filtreli deste üyeliğini geri alıyor, sayaçları revlog'dan yeniden türetiyor. Disabled durumu da gerçek (`lib/reviewerPresentation.ts:28`).
  - **Eksik:** `answerStudyCard` kardeş kartları gömüyor ve leech'te askıya alıp etiketliyor; `undoAnswer` bunların hiçbirini geri almıyor. Anki'nin op-düzeyi undo'su ikisini de geri alır.
- Kısayollar: `Ctrl/Cmd+Z` yalnızca web'de. Native'de sadece `z` ve `u` var, üstelik yalnızca kart görünürken — buna rağmen ipucu metni her platformda "(Ctrl+Z)" yazıyor. `z` AnkiDroid ile aynı, `u` hiçbir Anki kısayoluyla çakışmıyor; ancak ikisi de kullanıcı tanımlı tuş atamalarından **önce** kontrol ediliyor, yani kullanıcı `z`/`u`'yu başka işleve atarsa sessizce gölgeleniyor.
- Tebrikler ekranı: "‹ Destelere Dön" var. "Araç çubuğu butonları görünür kalıyor" kısmen doğru — undo yalnızca yığın doluysa görünüyor, bayrak ve ⋮ gizleniyor (bu ikisi Anki davranışıyla uyumlu).
- `CardOptionsMenu` "Yinele" → devre dışı "Geri al" düzeltmesi: **DOĞRULANDI** (`components/CardOptionsMenu.tsx:155-166`).

### 2.3 Filtrelenmiş deste ve deste seçici — bir dosya yanlış atfedilmiş

- `app/(tabs)/decks.tsx` ve `components/FilteredDeckOptionsModal.tsx`: her iki filtre için `Deste:` satırı ve ortak `DeckPickerModal` **DOĞRULANDI**; Not Ekle ile aynı bileşen kullanılıyor (arama, ağaç, yerinde deste oluşturma).
- `app/deck-options.tsx`: **YANLIŞ.** Buradaki `DeckPickerModal` başlıktaki "hangi desteyi düzenliyorum" seçicisi; Filtre 1/2 satırı yok, dosya arama yardımcılarını hiç import etmiyor.
- `SwipeDismissSheet` sıralama alt sayfası: **DOĞRULANDI** (her iki ekranda).
- İki yönlü arama senkronizasyonu: happy path çalışıyor, fakat yukarıdaki P1 hatası nedeniyle "hatasız okuyan ve güncelleyen" ifadesi doğru değil.

### 2.4 "WordToolbar" — UYDURMA

`components/WordToolbar.tsx` **yok ve hiç var olmamış**: `git log --all --diff-filter=D` silinmiş böyle bir dosya göstermiyor, `git log --all -S"WordToolbar"` hiçbir şey döndürmüyor. Depodaki tek eşleşme dokümanın kendisi.

Gerçekte olan: `app/editor.tsx:835-1010` içinde satır içi kurulmuş, **tek satırlık yatay kaydırmalı** bir araç çubuğu. Dokümanın saydığı özelliklerin durumu:

- **Yok:** 4 sekmeli ribbon, hizalama (`justifyLeft/Center/Right/Full`), girinti, 2x2 ve 3x3 tablo, köprü bağlantısı, bilgi/çağrı kutuları, alıntı ve kod bloğu.
- **Sayı yanlış:** metin rengi 9 değil 5 (+ "Varsayılan"), vurgu 6 değil 5.
- **Var:** B/I/U/S, alt/üst simge, biçim temizleme, yazı boyutu (Word tarzı punto değil, 7 CSS anahtar kelimesi), h1–h5, yatay çizgi, MathJax, özel snippet'ler.
- **Var ama dokümanda hiç anılmamış:** madde/numaralı liste, HTML kaynak düzenleme, cloze.

**"Seçim yokken Bold sonraki yazıyı kalın yapsın" isteği (kullanıcının asıl şikâyeti) hâlâ kanıtlanmamış.** Mimari doğru kurulmuş (buton odağı çalmıyor, `savedRange` canlı tutuluyor, `queryCommandState` geri raporlanıyor, değişiklik round-trip'i DOM'u yeniden yazmıyor). Ancak `restoreSelection()` her komutta koşulsuz `removeAllRanges()/addRange()` yapıyor (`components/RichTextEditor.tsx:147-148`); WebKit'te bu, bekleyen yazım stilini düşürür. Yani ilk Bold taşınsa bile **Bold sonra Italic zinciri** bozulur. Editör zaten canlı seçime sahipse seçim sıfırlaması atlanmalı. Bu davranışı kapsayan test yok; kesin sonuç ancak iPhone'da alınır.

### 2.5 Ataç butonu — doğrulandı

- Yeşil aktif stil kaldırılmış (`components/MediaAttachButton.tsx:264, 469-475`); commit diff'i `addBtnHasMedia` ve `hasMedia` prop'unun silindiğini gösteriyor.
- `lib/mediaAttachment.ts` var (iki satır, tek regex); testi **farklı adla** duruyor: `lib/mediaAttach.test.ts` (6 test, geçiyor).
- Kullanıcının "her fonksiyonda çöz" isteği karşılanmış görünüyor: uygulamada tek bir ataç ikonu var, `hasMedia` türü hiçbir kalıcı aktif stil kalmamış, `busy` bayrağı `try/finally` ile sıfırlanıyor ve her akış `closeMenu()` ile başlıyor.
- Küçük not: regex `<a ... href=` içerdiği için düz bir bağlantı da "medya" sayılıyor.

### 2.6 Fotoğraf editörü — biri hariç doğrulandı

- `allowsEditing: false`: **DOĞRULANDI** (tek iki ImagePicker çağrısında da).
- Kırpma: **DOĞRULANDI** — 6 oran hazır ayarı, 4 köşe + 4 kenar tutamağı, 3x3 kılavuz.
- Metne dokunup sürükleme, rozet stilleri (Klasik/Dolu/Buzlu/Çerçeveli), 14–52px dikey font kaydırıcısı: **DOĞRULANDI**.
- Çöpe sürükle-sil: **ÇALIŞMIYOR** — yukarıdaki P0 hatası.

### 2.7 UI ince ayarları — dosya adları yanlış, işlevler doğru

`app/summary.tsx` ve `app/future-dues.tsx` **yok**; her ikisi de `app/stats.tsx` içinde.

- Emojiler: **DOĞRULANDI** — dört `todayIcon` glifi (`✓ ◎ ◷ ＋`) ve stili silinmiş. Doküman "sayfa başlığının sağ üstü" diyor; gerçekte dört istatistik kutusunun sağ üstüydü.
- Gelecek vadeler yenilenme/başa atma: **DOĞRULANDI ve düzeltme gerçekten genel.** `showBacklog` snapshot anahtarından ve bağımlılıklardan çıkarılmış, iki seri önceden hesaplanıp render'da seçiliyor — anahtar değişmediği için yeniden yükleme yok, alt ağaç unmount olmuyor, kaydırma yapısal olarak korunuyor. Ayrıca `hooks/useDeferredScreenSnapshot.ts` sertleştirilmiş (önbellekten tohumlama, yeni anahtar yüklenirken `null` yerine önceki snapshot), bu da aynı sorunu **dört tüketicinin tamamında** çözüyor. Kullanıcının "benzer davranış nerede varsa düzelt" isteği karşılanmış; kalan iki `scrollTo({y:0})` çağrısı bilinçli.
- "İkinci filtreyi etkinleştir" çakışması ve arama çubuğu dikey ortalama: **DOĞRULANDI** (`app/(tabs)/decks.tsx:1836-1851`, `app/browser.tsx:1152`). Küçük asimetri: filtreli deste arama alanı `includeFontPadding:false`/`textAlignVertical` kullanmıyor, tarayıcıdaki kullanıyor.
- Etiket filtresindeki "yeni / süresi gelen" kutucukları: **DOĞRULANDI** — `tagCardState` state'i, chip'i ve handler'ı tamamen silinmiş.
- Ayrıca `4d301fc`, önceki denetimin "belirsiz" bıraktığı isteği de kapatmış: zaman aralığı seçicisindeki "İSTATİSTİKLER" üst başlığı kaldırılmış (`app/stats.tsx` picker header).

### 2.8 Test ve kalite kapısı — doğrulandı

`npm run quality` çıkış kodu 0. 111 test dosyası / 972 test. `verify-ios-readiness` geçiyor; App Store hukuki kimlik alanlarının placeholder olduğu uyarısı sürüyor (yayın engeli, işlevsellikten bağımsız).

## Genel değerlendirme

Kodun kendisi çoğu yerde iyi: önizleme gecikmesi motoru, undo'nun gerçek DB geri alması, snapshot/kaydırma düzeltmesi ve deste seçici birleştirmesi sağlam ve doğru yerden çözülmüş işler. Önceki denetimin P0 maddelerinden ikisi (önizleme gecikmeleri, sıralama enum'u) gerçekten kapanmış.

Sorun **dokümanın güvenilirliğinde**: 2.4 tamamen uydurma, 2.1'in sayıları kodla çelişiyor, 2.3 ve 2.7 var olmayan dosyaları gösteriyor. Bu haliyle özet, yapılan işin kanıtı olarak kullanılamaz.

"Anki ile birebir aynı" sonucu hâlâ verilemez. Engeller: yukarıdaki üç hata, undo'nun kardeş gömme/leech'i geri almaması, 8/9/10 sıralamalarının yaklaşık semantiği, ve editör handoff'unun cihazda kanıtlanmamış olması.

## Önerilen sıra

1. `lib/importApkg.ts:297-300` proto alan eşlemesini düzelt, `lib/ankiPackageRoundtrip.test.ts` fixture'ını gerçek alan numaralarıyla yeniden yaz.
2. `trashHoveredRef` aynasını ekle; çöpe sürükle-sil için bir regresyon testi yaz.
3. `replaceDeckNameInSearch`'ü tokenizer üzerinden yeniden yaz; dört kırılma senaryosunu teste ekle.
4. `undoAnswer`'a kardeş gömme ve leech askı/etiket geri alımını ekle.
5. `restoreSelection()`'ı canlı seçim varken atlayacak biçimde koşullandır; ardından iPhone'da seçimsiz Bold → Italic zincirini kaydederek doğrula.
6. `SON_24_SAAT_...md`'yi gerçekle eşitle: 2.4'ü mevcut araç çubuğunu anlatacak şekilde baştan yaz, önizleme vektörünü `[60, 600, 0]` olarak düzelt, `app/summary.tsx` / `app/future-dues.tsx` / `WordToolbar.tsx` / `ColorPickerModal` / `HtmlSourceEditorModal` referanslarını gerçek konumlarıyla değiştir.
7. `4d301fc` ölçeğindeki commit'leri bölmeyi alışkanlık haline getir; mesaj commit'i temsil etmeli.

## Kaynaklar

- [decks.proto](https://raw.githubusercontent.com/ankitects/anki/main/proto/anki/decks.proto), [deck_config.proto](https://raw.githubusercontent.com/ankitects/anki/main/proto/anki/deck_config.proto), [preview.rs](https://raw.githubusercontent.com/ankitects/anki/main/rslib/src/scheduler/answering/preview.rs), [decks/filtered.rs](https://raw.githubusercontent.com/ankitects/anki/main/rslib/src/decks/filtered.rs), [notes/mod.rs](https://raw.githubusercontent.com/ankitects/anki/main/rslib/src/notes/mod.rs)
- [Anki manual — Studying](https://docs.ankiweb.net/studying.html), [Filtered decks](https://docs.ankiweb.net/filtered-decks.html), [AnkiDroid kısayolları](https://krmanik.github.io/ankidroiddocs/keyboard-shortcuts.html)
