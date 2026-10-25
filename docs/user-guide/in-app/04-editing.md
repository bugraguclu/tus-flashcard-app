# Kart ekleme, medya ve not türleri — uygulama içi metinler

Kapsam: Not ekle / Kartı düzenle ekranı, ••• menüsü, biçimlendirme araç çubuğu ve pencereleri, Ek ekle
sayfaları, Ses kaydet, Fotoğrafı düzenle / Çizim, Etiketler, Not türü seçici, Not türleri ve Not
türünü düzenle. Satır numaraları master c6108e6'ya göredir. Bütün ekranlar iPhone ve web'de aynıdır;
fark varsa belirtilmiştir. Bilgi sayfaları `SwipeDismissSheet` üzerindeki genel `HelpSheet` kalıbını
(eyebrow, title, summary, points[], note, noteLabel "NOT"/"NOTE", dismissLabel "Anladım"/"Got it",
more) kullanır.

## Bilgi sayfaları

### help.editor.sheet — Kart ekleme ekranı bilgi sayfası (yeni)
- **Yer:** Not ekle / Kartı düzenle › sağ üstteki **•••** menüsü › son satır **Yardım** / **Help** (yeni), `components/editor/EditorOverflowMenu.tsx:111` sonrasına, ayırıcı çizgiyle. Başlık çubuğunda zaten dört düğme olduğu için ⓘ başlığa değil menüye konur.
- **Tetikleyici:** **Yardım** satırına dokunma (menü kapanır, sayfa düzenleyicinin üstünde açılır)
- **Bileşen:** bilgi sayfası
- **Daha fazla bilgi:** `tr/08-adding-and-editing.md#open-editor` (`help?article=editing&section=open-editor`)
- **Durum:** Yeni

**TR**
- Eyebrow: EKRAN REHBERİ
- Başlık: Not nasıl eklenir?
- Özet: Bir not yazarsınız; uygulama seçtiğiniz türe göre ondan bir veya daha fazla kart üretir.
- Maddeler: (1) **Tür:** kartların nasıl üretileceğini, **Deste:** nereye gideceklerini belirler. (2) 📌 bir alanın içeriğini bir sonraki not için korur; 📎 resim, ses, çizim veya dosya ekler. (3) Göz düğmesi notun ilk kartını önizler; onay işareti kaydeder. (4) Kaydettikten sonra **Yeni not ekle** ile aynı deste, tür ve etiketlerle devam edebilirsiniz.
- Not: Düzenlerken desteyi değiştirirseniz yalnızca açtığınız kart taşınır.

**EN**
- Eyebrow: SCREEN GUIDE
- Title: How to add a note
- Summary: You write a note, and the app makes one or more cards from it depending on the type you choose.
- Points: (1) **Type:** decides how cards are made, **Deck:** where they go. (2) 📌 keeps a field's content for the next note; 📎 adds an image, audio, a drawing or a file. (3) The eye button previews the note's first card; the check mark saves. (4) After saving, **Add another** continues with the same deck, type and tags.
- Note: While editing, changing the deck moves only the card you opened.

### help.editor.clozeSheet — Boşluk doldurma bilgi sayfası (yeni)
- **Yer:** Not ekle ekranı, tür **Boşluklu** (boşluk doldurma) iken boşluk alanının (stokta **Metin**) başlık satırında, 📌'ün soluna küçük ⓘ (yeni), `app/editor.tsx:1213-1234` (`fieldLabelRow`, yalnızca `clozeFieldIndex(selectedNoteType) === index`). Erişilebilirlik etiketi: "Boşluk doldurma nasıl yapılır" / "How cloze deletions work"
- **Tetikleyici:** ⓘ'ye dokunma
- **Bileşen:** bilgi sayfası
- **Daha fazla bilgi:** `tr/08-adding-and-editing.md#cloze`
- **Durum:** Yeni

**TR**
- Eyebrow: BOŞLUK DOLDURMA
- Başlık: Boşluk nasıl eklenir?
- Özet: Metnin bir kısmını seçip **[…]** düğmesine dokunduğunuzda o kısım çalışırken gizlenir.
- Maddeler: (1) Her dokunuş yeni bir numara verir (`c1`, `c2`…); her numara ayrı bir kart olur. (2) Aynı numarayı kullanmak için **[…]** düğmesine basılı tutun; aynı numaralı boşluklar aynı kartta birlikte gizlenir. (3) İpucu eklemek için elle yazın: `{{c1::cevap::ipucu}}`. (4) **Arka Ek** alanı cevap yüzünde gösterilir.
- Not: **[…]** düğmesi araç çubuğu açıkken **Giriş** sekmesindedir. Araç çubuğunu gizlediyseniz boşluğu `{{c1::…}}` biçiminde yazabilirsiniz.

**EN**
- Eyebrow: CLOZE
- Title: How to add a cloze deletion
- Summary: Select part of the text and tap **[…]**; that part is hidden while you study.
- Points: (1) Each tap gives a new number (`c1`, `c2`…); each number becomes its own card. (2) Press and hold **[…]** to reuse the same number; deletions with the same number are hidden together on one card. (3) To add a hint, type it yourself: `{{c1::answer::hint}}`. (4) The **Back Extra** field is shown on the answer side.
- Note: **[…]** is on the **Home** tab while the toolbar is shown. If you hid the toolbar, type the deletion as `{{c1::…}}`.

### help.photoEditor.sheet — Fotoğraf ve çizim düzenleyici bilgi sayfası (yeni)
- **Yer:** Fotoğrafı düzenle / Çizim tam ekran düzenleyicisi, başlığın (`headerCenter`) sağında küçük ⓘ (yeni), `components/PhotoEditorModal.tsx:1185-1188`. Erişilebilirlik etiketi: "Düzenleyici hakkında" / "About the editor"
- **Tetikleyici:** ⓘ'ye dokunma
- **Bileşen:** bilgi sayfası (düzenleyicinin tam ekran modalının içinde açılır)
- **Daha fazla bilgi:** `tr/08-adding-and-editing.md#photo-editor`
- **Durum:** Yeni

**TR**
- Eyebrow: DÜZENLEYİCİ REHBERİ
- Başlık: Resmi düzenlemek
- Özet: Çizdiğiniz, yazdığınız ve kırptığınız her şey **Tamamlandı**'ya dokununca tek bir resim olarak alana eklenir.
- Maddeler: (1) Metin veya resmi seçip sürükleyerek taşıyın, köşeden büyütün, düğmeyle çevirin; iki parmakla da büyütüp döndürebilirsiniz. (2) Taşıdığınız bir nesneyi alttaki çöp alanına bırakırsanız silinir. (3) **Ört** dolu bir kutu çizer; kutu resme kalıcı olarak işlenir, çalışırken açılmaz. (4) **Kısmi** silgi yalnızca kalem izlerini dokunduğunuz yerden siler; şekilleri ve metinleri bütün olarak kaldırır.
- Not: ↶ ↷ son 30 adımı geri alır ve yineler. **İptal** değişiklikleri atmadan önce sorar.

**EN**
- Eyebrow: EDITOR GUIDE
- Title: Editing the image
- Summary: Everything you draw, write and crop is added to the field as one image when you tap **Done**.
- Points: (1) Select a label or picture and drag it to move it, pull a corner to resize it, turn it by the knob; two fingers resize and turn it too. (2) Drop an object you are moving on the bin at the bottom to delete it. (3) **Cover** draws a solid box; the box is burned into the image and does not open while you study. (4) The **Partial** eraser rubs out pen strokes only where you touch, and removes shapes and labels whole.
- Note: ↶ ↷ undo and redo the last 30 steps. **Cancel** asks before discarding changes.

### help.noteTypes.sheet — Not türleri bilgi sayfası (yeni)
- **Yer:** **Not türleri** ekranı, yerel başlık çubuğunun sağında ⓘ (yeni), `app/_layout.tsx:765-776` (`headerRight`). iPhone'da form sayfası (tutamaçlı); web'de modal. Erişilebilirlik etiketi: "Not türleri hakkında" / "About note types"
- **Tetikleyici:** ⓘ'ye dokunma
- **Bileşen:** bilgi sayfası
- **Daha fazla bilgi:** `tr/09-note-types.md#note-types-list`
- **Durum:** Yeni

**TR**
- Eyebrow: EKRAN REHBERİ
- Başlık: Not türü nedir?
- Özet: Not türü, bir notun hangi alanlardan oluştuğunu ve bu alanlardan hangi kartların, nasıl bir görünümle üretileceğini belirler.
- Maddeler: (1) **Temel** tek kart, **Temel (ve ters kart)** iki kart, **Boşluklu** her boşluk numarası için bir kart üretir. (2) Bir türü değiştirmek, o türü kullanan bütün notları etkiler. (3) **+ Yeni not türü**, **Temel**'in bir kopyasıyla başlar.
- Not: Bir notun türünü değiştirmek için **Kartlarım**'da notu seçip **Diğer › Not türünü değiştir**'i kullanın.

**EN**
- Eyebrow: SCREEN GUIDE
- Title: What is a note type?
- Summary: A note type decides which fields a note has and which cards are made from those fields, and how they look.
- Points: (1) **Basic** makes one card, **Basic (and reversed card)** two cards, **Cloze** one card per cloze number. (2) Changing a type affects every note that uses it. (3) **+ New Note Type** starts as a copy of **Basic**.
- Note: To change a note's type, select the note in the **Card Browser** and use **More › Change note type**.

### help.noteType.sheet — Not türünü düzenle bilgi sayfası (yeni)
- **Yer:** **Not türünü düzenle** ekranı, yerel başlık çubuğunun sağında ⓘ (yeni), `app/_layout.tsx:777-785` (`headerRight`). Erişilebilirlik etiketi: "Not türü düzenleme hakkında" / "About editing a note type"
- **Tetikleyici:** ⓘ'ye dokunma
- **Bileşen:** bilgi sayfası
- **Daha fazla bilgi:** `tr/09-note-types.md#templates`
- **Durum:** Yeni

**TR**
- Eyebrow: EKRAN REHBERİ
- Başlık: Şablonlar ve alanlar
- Özet: Şablonlar kartın soru ve cevap yüzünü, alanlar notun içeriğini tanımlar.
- Maddeler: (1) `{{Front}}` gibi bir yer tutucu alanın içeriğini karta yerleştirir; şablonlarda alanın bu ekranda görünen gerçek adı kullanılır. (2) `{{FrontSide}}` soruyu cevabın üstünde gösterir, `{{#Alan}}…{{/Alan}}` yalnızca alan doluysa görünür. (3) Ad, şablon ve stil değişiklikleri **Kaydet** ile saklanır; sorun varsa kaydetmeden önce gösterilir.
- Not: Alan ekleme, taşıma ve silme hemen bütün notlara uygulanır ve geri alınamaz.

**EN**
- Eyebrow: SCREEN GUIDE
- Title: Templates and fields
- Summary: Templates define a card's question and answer sides; fields hold the note's content.
- Points: (1) A placeholder such as `{{Front}}` puts the field's content on the card; templates use the field's real name as shown on this screen. (2) `{{FrontSide}}` shows the question above the answer, and `{{#Field}}…{{/Field}}` appears only when the field is filled in. (3) Name, template and styling changes are stored with **Save**; problems are shown before saving.
- Note: Adding, moving and deleting fields applies to every note at once and cannot be undone.

## Kısa metinler

### Not ekle / Kartı düzenle (`app/editor.tsx`)

| ID | Yer (kontrol, dosya:satır) | Tür | TR | EN | Durum |
| --- | --- | --- | --- | --- | --- |
| help.editor.menuHelpRow | ••• menüsü son satırı, `components/editor/EditorOverflowMenu.tsx:111` sonrası | menü satırı | Yardım | Help | Yeni |
| help.editor.typeA11y | **Tür:** satırı erişilebilirlik etiketi, `app/editor.tsx:1169` | erişilebilirlik etiketi | Not türü: {ad} | Note type: {name} | Mevcut — güncelle (eski metin: "Kart türü: {ad}") |
| help.editor.typeFixed | **Tür:** satırına düzenlerken dokunma, uyarı metni, `app/editor.tsx:1157-1161` | uyarı | Var olan bir notun türü bu ekrandan değiştirilemez. Türü değiştirmek için Kartlarım'da notu seçip Diğer › Not türünü değiştir'i kullanın. | An existing note keeps its note type on this screen. To change it, select the note in the Card Browser and use More › Change note type. | Mevcut — güncelle (eski metin: "Var olan bir notun türü bu ekrandan değiştirilemez. Yeni bir not eklerken tür seçebilirsiniz." / "An existing note keeps the note type it was created with. Choose a type when you add a new note.") |
| help.editor.deckEditHint | **Deste:** satırının altı, yalnızca düzenlerken ve notun birden fazla kartı varken, `app/editor.tsx:1196` sonrası | satır altı ipucu | Yalnızca bu kart taşınır; notun diğer kartları kendi destelerinde kalır. | Only this card moves; the note's other cards stay in their decks. | Yeni |
| help.editor.pinHint | 📌 düğmesi erişilebilirlik ipucu, `app/editor.tsx:1217-1226` | erişilebilirlik ipucu | Sabitlenen alanın içeriği bir sonraki not için korunur. Yalnızca not eklerken kullanılır. | A pinned field keeps its content for the next note. Available only when adding notes. | Yeni |
| help.editor.addReversePlaceholder | **Temel (seçimli ters kart)** türünde **Tersini Ekle** alanının yer tutucusu, `app/editor.tsx:1209` | yer tutucu | Ters kart da istiyorsanız herhangi bir şey yazın… | Type anything to also make the reverse card… | Mevcut — güncelle (eski metin: "Tersini Ekle yazın…" / "Enter Add Reverse…") |
| help.editor.typeAnswerPlaceholder | **Temel (yanıtı yazarak)** türünde **Arka** alanının yer tutucusu, `app/editor.tsx:1209` | yer tutucu | Çalışırken yazacağınız cevap… | The answer you will type when studying… | Mevcut — güncelle (eski metin: "Arka yazın…" / "Enter Back…") |
| help.editor.clozePlaceholder | Boşluklu türde ilk alanın yer tutucusu, `app/editor.tsx:1206` | yer tutucu | Metni yazın, sonra gizlenecek bölümü seçip […] düğmesine dokunun… | Enter text, then select the part to hide and tap […]… | Mevcut — koru |
| help.editor.noCloze | Boşluksuz kaydetme onayı, `app/editor.tsx:921-923` | onay | Başlık: Boşluk bulunamadı. Metin: Bu notta boşluk yok. Metin ve ilk kartı yine de kaydedilsin mi? Boşluk eklemek için metni seçip […] düğmesine dokunun veya {{c1::…}} yazın. | Title: No Cloze Deletion. Text: This note has no cloze deletion. Save its text and first card anyway? To add one, select text and tap […], or type {{c1::…}}. | Mevcut — güncelle (eski metin: "Kapama bulunamadı" / "Bu notta kapama yok. … […] düğmesine dokunabilirsiniz.") |
| help.editor.duplicate | İlk alan altındaki uyarı, `app/editor.tsx:1293-1305` | uyarı rozeti | — | — | Mevcut — koru |
| help.editor.readOnlyBanner | Seçici satırlarının altı, alanların üstü, yalnızca deneme kurulumundaki TUS Kartları notlarında (`isContentReadOnly`), `app/editor.tsx:1197` sonrası | satır içi bilgi şeridi | TUS Kartları notlarının içeriği değiştirilemez; etiketlerini düzenleyip kaydedebilirsiniz. | The content of TUS card pack notes cannot be changed; you can edit and save their tags. | Yeni |
| help.editor.clearFieldsConfirm | ••• › **Alanları temizle** onayı, `app/editor.tsx:788` | onay | Sabitlenenler dahil bütün alanlar temizlensin mi? Bu işlem geri alınamaz. | Clear every field, pinned ones included? This cannot be undone. | Mevcut — güncelle (eski metin: "Tüm alanlardaki içerik temizlensin mi?" / "Clear the contents of all fields?") |
| help.editor.deleted | **Notu sil** sonrasındaki pencere, `app/editor.tsx:1050` | sonuç penceresi | {n} kart silindi. Geri almak için şimdi Geri al'a dokunun; bu pencere kapanınca geri alınamaz. | {n} cards deleted. Tap Undo now to restore them; once this window closes, it cannot be undone. | Mevcut — güncelle (eski metin: "{n} kart silindi." / "{n} cards deleted.") |
| help.editor.cardsRowHint | **Kartlar:** satırı erişilebilirlik ipucu, `app/editor.tsx:1335` | erişilebilirlik ipucu | Seçili not türünün şablonlarını açar. Değişiklikler bu türdeki bütün notları etkiler. | Opens the templates of the selected note type. Changes affect every note of this type. | Mevcut — güncelle (eski metin: "Seçili not türünün kart ve alan şablonlarını açar" / "Opens the card and field templates for the selected note type") |
| help.editor.unsaved | Çıkarken onay, `app/editor.tsx:500-503` | onay | — | — | Mevcut — koru |
| help.editor.saved | Kaydetme sonucu, `app/editor.tsx:983-1005` | sonuç penceresi | — | — | Mevcut — koru |

### ••• menüsü ve biçimlendirme (`components/editor/*`)

| ID | Yer (kontrol, dosya:satır) | Tür | TR | EN | Durum |
| --- | --- | --- | --- | --- | --- |
| help.editor.menu.fontSize | ••• › **Yazı boyutu** satırı, `EditorOverflowMenu.tsx:67`, ve açılan pencerenin başlığı, `FormatPickerModals.tsx:36` | menü etiketi | Düzenleyici yazı boyutu | Editor text size | Mevcut — güncelle (eski metin: "Yazı boyutu" / "Font size", araç çubuğundaki metin boyutuyla aynı ad) |
| help.editor.menu.fontSizeCaption | Aynı pencerede başlığın altı, `FormatPickerModals.tsx:36` sonrası | açıklama | Yalnızca bu ekrandaki yazıyı büyütür; kartların görünümünü değiştirmez. | Changes only the text on this screen, not how cards look. | Yeni |
| help.editor.mathCaption | **MathJax ekle** penceresi başlığının altı, `FormatPickerModals.tsx:316` sonrası | açıklama | Formüller TusAnkiM'de henüz işlenmiş hâlde gösterilmez; kartta kaynak metin görünür. Anki'ye aktarınca işlenir. | Formulas are not rendered in TusAnkiM yet; the card shows the source text. Anki renders them after export. | Yeni |
| help.editor.linkCaption | **Bağlantı ekle** penceresi başlığının altı, `FormatPickerModals.tsx:149` sonrası | açıklama | Kartta yalnızca https:// ile başlayan bağlantılar açılır. | On cards, only links starting with https:// open. | Yeni |
| help.editor.htmlSource | **HTML Kaynağını Düzenle** açıklaması, `FormatPickerModals.tsx:437` | açıklama | {alan} alanının HTML kaynağı. Yazdığınız kaynak olduğu gibi saklanır; betikler ve güvenli olmayan öğeler kartta gösterilmez. | HTML source of the {field} field. The source is stored as you write it; scripts and other unsafe parts are not shown on the card. | Mevcut — güncelle (eski metin: "Alanın ham HTML içeriğini doğrudan düzenleyin. Kaydedildiğinde güvenlik doğrulaması uygulanır." / "Edit raw HTML content directly. Sanitization is applied upon saving.") |
| help.editor.inlineSizes | Araç çubuğu **Yazı boyutu** penceresinin seçenekleri, `FormatPickerModals.tsx:210` | seçenek etiketleri | En küçük, Çok küçük, Küçük, Orta, Büyük, Çok büyük, En büyük | Tiny, Extra small, Small, Medium, Large, Extra large, Huge | Mevcut — güncelle (eski metin: `xx-small` … `xx-large`, çevrilmemiş) |
| help.editor.customToolbar | Özel düğme penceresi açıklaması ve **Yardım** sayfası, `CustomToolbarModals.tsx:60-65`, `:182-188` | açıklama | — | — | Mevcut — koru |
| help.editor.previewFirstCard | **Önizleme** penceresinde deste satırının altı, `EditorPreviewModal.tsx:70` sonrası | açıklama | Notun ilk kartı gösterilir. | The note's first card is shown. | Yeni |

### Ek ekle ve Ses kaydet (`components/MediaAttachButton.tsx`, `components/AudioRecordModal.tsx`)

| ID | Yer (kontrol, dosya:satır) | Tür | TR | EN | Durum |
| --- | --- | --- | --- | --- | --- |
| help.media.fileCaption | **Ek ekle** sayfasında **Dosya ekle** satırının altı (fotoğraf seçimindeki `optionCaption` kalıbı), `MediaAttachButton.tsx:355` | satır altı açıklama | Dosya notla saklanır ve dışa aktarılır; kartın içinden açılamaz. | The file is stored with the note and exported; it cannot be opened from the card. | Yeni |
| help.media.photoChoice | **Fotoğrafı nasıl ekleyelim?** seçenek açıklamaları, `MediaAttachButton.tsx:437`, `:451` | satır altı açıklama | — | — | Mevcut — koru |
| help.media.permissions | Galeri, kamera, mikrofon izin pencereleri, `MediaAttachButton.tsx:129-170`, `AudioRecordModal.tsx:44-51` | izin uyarısı | — | — | Mevcut — koru |
| help.audio.idle | Ses kaydet penceresinde durum satırı (kayıt başlamadan), `AudioRecordModal.tsx:125` | durum metni | Başlamak için mikrofona dokunun. Durdurduğunuzda kayıt alana eklenir. | Tap the microphone to start. When you stop, the recording is added to the field. | Mevcut — güncelle (eski metin: "Başlamak için mikrofona dokunun" / "Tap the microphone to start") |
| help.audio.cancelHint | **İptal** düğmesi erişilebilirlik ipucu, `AudioRecordModal.tsx:138` | erişilebilirlik ipucu | Kaydı alana eklemeden kapatır | Closes without adding the recording | Yeni |

### Fotoğrafı düzenle / Çizim (`components/PhotoEditorModal.tsx`, `components/photo-editor/*`)

| ID | Yer (kontrol, dosya:satır) | Tür | TR | EN | Durum |
| --- | --- | --- | --- | --- | --- |
| help.photoEditor.infoA11y | Başlık yanındaki ⓘ (yeni), `PhotoEditorModal.tsx:1185-1188` | erişilebilirlik etiketi | Düzenleyici hakkında | About the editor | Yeni |
| help.photoEditor.coverSubtitle | **Ört** seçiliyken başlık altındaki ipucu, `PhotoEditorModal.tsx:1168` | durum ipucu | Kapatmak istediğiniz yerin üzerinden sürükleyin | Drag across the area you want to cover | Mevcut — güncelle (eski metin: "Ört seçili" / "Cover selected") |
| help.photoEditor.subtitles | Diğer araçların başlık altı ipuçları, `PhotoEditorModal.tsx:1152-1167` | durum ipucu | — | — | Mevcut — koru |
| help.photoEditor.trash | Sürüklerken çöp alanı, `CanvasOverlays.tsx:320` | ipucu | — | — | Mevcut — koru |
| help.photoEditor.colorNames | Renk düğmelerinin erişilebilirlik etiketleri, `EditorControls.tsx:277`, `EditorSheets.tsx:374` | erişilebilirlik etiketi | Beyaz, Siyah, Kırmızı, Turuncu, Kehribar, Yeşil, Camgöbeği, Gök mavisi, Mor, Pembe (`DRAW_COLORS` sırasıyla) | White, Black, Red, Orange, Amber, Green, Cyan, Sky blue, Violet, Pink | Mevcut — güncelle (eski metin: "Renk #ef4444" gibi onaltılık kod) |

### Etiketler ve Not türü seçici (`components/TagPickerModal.tsx`, `components/NoteTypePickerModal.tsx`)

| ID | Yer (kontrol, dosya:satır) | Tür | TR | EN | Durum |
| --- | --- | --- | --- | --- | --- |
| help.tags.helper | **＋** ile açılan ekleme panelinin altı, `TagPickerModal.tsx:308-310` | açıklama | Birden fazla etiketi boşlukla ayırın. Alt etiket için :: kullanın (ör. farmakoloji::antibiyotik). | Separate several tags with spaces. Use :: for a sub-tag (e.g. pharmacology::antibiotics). | Mevcut — güncelle (eski metin: "Birden fazla etiket eklemek için boşluk kullanın." / "Separate multiple tags with spaces.") |
| help.tags.empty | Boş liste, `TagPickerModal.tsx:345-353` | boş durum | — | — | Mevcut — koru |
| help.noteTypePicker.clozeSubtitle | Boşluk doldurma türü satırının alt yazısı, `NoteTypePickerModal.tsx:141-144` | alt yazı | {n} alan · boşluk başına 1 kart | {n} fields · 1 card per cloze | Mevcut — güncelle (eski metin: "{n} alan · 1 kart" / "{n} fields · 1 cards") |
| help.noteTypePicker.desc.basic | **Temel** satırında alt yazının altı, `NoteTypePickerModal.tsx:168-177` | satır açıklaması | Önden arkaya tek kart. | One card, front to back. | Yeni |
| help.noteTypePicker.desc.reversed | **Temel (ve ters kart)** satırı, aynı yer | satır açıklaması | İki kart: önden arkaya ve arkadan öne. | Two cards: front to back and back to front. | Yeni |
| help.noteTypePicker.desc.optional | **Temel (seçimli ters kart)** satırı, aynı yer | satır açıklaması | Tersini Ekle doluysa ters kart da üretir. | Also makes the reverse card when Add Reverse is filled in. | Yeni |
| help.noteTypePicker.desc.typeIn | **Temel (yanıtı yazarak)** satırı, aynı yer | satır açıklaması | Çalışırken cevabı yazarsınız. | You type the answer while studying. | Yeni |
| help.noteTypePicker.desc.cloze | **Boşluklu** satırı, aynı yer | satır açıklaması | Metindeki her boşluk numarası bir kart olur. | Each cloze number in the text becomes a card. | Yeni |

### Not türleri ve Not türünü düzenle (`app/note-types.tsx`, `app/note-type.tsx`)

| ID | Yer (kontrol, dosya:satır) | Tür | TR | EN | Durum |
| --- | --- | --- | --- | --- | --- |
| help.noteTypes.infoA11y | **Not türleri** başlığındaki ⓘ (yeni), `app/_layout.tsx:765-776` | erişilebilirlik etiketi | Not türleri hakkında | About note types | Yeni |
| help.noteTypes.intro | Liste üstündeki açıklama, `app/note-types.tsx:31` | açıklama | Not türlerini, alanlarını ve kart şablonlarını düzenleyin. Yeni not türü Temel türün bir kopyası olarak başlar. | Edit note types, their fields and card templates. A new note type starts as a copy of Basic. | Mevcut — güncelle (eski metin: "Not türlerini, alanlarını ve kart şablonlarını düzenleyin." / "Edit note types, fields, and card templates.") |
| help.noteType.infoA11y | **Not türünü düzenle** başlığındaki ⓘ (yeni), `app/_layout.tsx:777-785` | erişilebilirlik etiketi | Not türü düzenleme hakkında | About editing a note type | Yeni |
| help.noteType.fieldsCaption | **ALANLAR** etiketinin altı, `app/note-type.tsx:187` sonrası | açıklama | Alan ekleme, taşıma ve silme hemen bu türdeki bütün notlara uygulanır ve geri alınamaz. Ad değişiklikleri Kaydet ile saklanır. | Adding, moving and deleting fields applies to every note of this type at once and cannot be undone. Name changes are stored with Save. | Yeni |
| help.noteType.fieldButtons | ↑ ↓ ✕ düğmeleri erişilebilirlik etiketleri, `app/note-type.tsx:197-217` | erişilebilirlik etiketi | {alan} alanını yukarı taşı / {alan} alanını aşağı taşı / {alan} alanını sil | Move {field} up / Move {field} down / Delete {field} | Yeni |
| help.noteType.clozeLocked | Boşluk doldurma türünde alan listesinin altı, `app/note-type.tsx:221` (ve aynı metnin uyarısı `:124`) | açıklama | Boşluk doldurma türlerinde alan eklenemez, taşınamaz ve silinemez; alan adlarını değiştirebilirsiniz. | Fields of a cloze type cannot be added, moved or deleted; you can rename them. | Mevcut — güncelle (eski metin: "Kapama (Cloze) türünde alanlar yeniden düzenlenemez." / "Fields cannot be reordered in a Cloze note type.") |
| help.noteType.deleteField | ✕ onayı, `app/note-type.tsx:131` | onay | “{alan}” alanı ve tüm notlardaki değeri silinecek. Bu işlem geri alınamaz. | The “{field}” field and its value in every note will be deleted. This cannot be undone. | Mevcut — güncelle (eski metin: sonundaki "Bu işlem geri alınamaz." / "This cannot be undone." cümlesi yok) |
| help.noteType.syntaxLink | **ÖN YÜZ (SORU)** etiketinin sağı, `app/note-type.tsx:250` | bağlantı → `help?article=note-types&section=field-replacements` | Şablon söz dizimi | Template syntax | Yeni |
| help.noteType.cssCaption | **STİL (CSS)** etiketinin altı, `app/note-type.tsx:272` sonrası | açıklama | Karanlık tema için .nightMode sınıfını kullanın. İnternetten yüklenen dosyalar kaldırılır. | Use the .nightMode class for the dark theme. Files loaded from the internet are removed. | Yeni |
| help.noteType.problems | Kaydet reddi ve satırları, `app/note-type.tsx:159-160`, `components/note-type/noteTypeProblemText.ts:5-46` | uyarı | — | — | Mevcut — koru |
| help.browser.changeNoteType.more | Kartlarım › **Not türünü değiştir** penceresinde açıklamanın altı, `components/browser/BrowserDialogs.tsx:62` sonrası (açıklama metni Mevcut — koru) | bağlantı → `help?article=note-types&section=change-note-type` | Daha fazla bilgi | Learn more | Yeni (Kartlarım taslağıyla eşgüdüm) |
