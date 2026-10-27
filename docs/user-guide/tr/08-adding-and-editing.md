---
id: editing
title: Kart ekleme ve düzenleme
summary: Not ekleme ekranı, alanlar, biçimlendirme, boşluk doldurma, resim, ses, çizim, etiketler ve kaydetme.
order: 8
web_path: /yardim/kart-ekleme
app_help: help?article=editing
app_screens:
  - "Not ekle / Kartı düzenle — app/editor.tsx"
  - "Biçimlendirme araç çubuğu — components/editor/EditorFormattingToolbar.tsx"
  - "••• menüsü — components/editor/EditorOverflowMenu.tsx"
  - "Önizleme — components/editor/EditorPreviewModal.tsx"
  - "Ek ekle — components/MediaAttachButton.tsx"
  - "Ses kaydet — components/AudioRecordModal.tsx"
  - "Fotoğrafı düzenle / Çizim — components/PhotoEditorModal.tsx"
  - "Etiketler — components/TagPickerModal.tsx"
verified_against: master c6108e6 (2026-10-25)
---

# Kart ekleme ve düzenleme

Kartlarınızı **Not ekle** ekranında yazarsınız. Bir not yazarsınız; uygulama seçtiğiniz not türüne
göre ondan bir veya daha fazla kart üretir (bkz. [Temel kavramlar](02-key-concepts.md#notes-and-cards)).
Aynı ekran, var olan bir notu düzenlerken **Kartı düzenle** adıyla açılır.

<a id="open-editor"></a>
## Ekranı açmak
<!-- Uygulamada: ••• menüsü › Yardım satırı (yeni, components/editor/EditorOverflowMenu.tsx:111 sonrası) bilgi sayfasının "Daha fazla bilgi" bağlantısı → bu bölüm -->

Yeni not eklemek için:

- **Desteler** sekmesinde sağ alttaki **＋** düğmesi › **Kart ekle**.
- Bir destenin **•••** düğmesi › **Ekle**: not doğrudan o desteye gider.
- **Kartlarım** ekranında **＋ Yeni not** (veya **＋ Yeni kart**) düğmesi.
- Çalışırken üstteki **⋮** düğmesi veya **Araçlar** › **Not ekle**.

Var olan bir notu düzenlemek için **Kartlarım**'da satırın kalem düğmesine dokunun ya da çalışırken
**⋮** › **Notu düzenle**'yi seçin.

Ekran tam ekran açılır; çıkmak için sol üstteki geri okunu kullanın. Kaydetmediğiniz bir değişiklik
varsa **Değişiklikler atılsın mı?** diye sorulur. Boş bir yeni notta bu soru gelmez.

<a id="note-type-and-deck"></a>
## Not türü ve deste

Ekranın en üstünde iki satır vardır:

- **Tür:** Notun türü (örneğin **Temel** veya **Boşluklu**). Dokunarak değiştirirsiniz. Listenin
  altındaki **Not türlerini yönet…** sizi [Not türleri](09-note-types.md#note-types-list) ekranına
  götürür. Uygulama her deste için en son kullandığınız türü hatırlar.
- **Deste:** Kartların gideceği deste. Dokununca deste ağacı açılır; arayabilir veya **＋** ile
  yeni bir deste oluşturup hemen seçebilirsiniz. Filtrelenmiş desteler ve TUS Kartları desteleri
  listede yoktur.

Ekran hangi desteyle açılır? Bir destenin menüsünden geldiyseniz o deste; değilse
**Ayarlar › Genel › Düzenleme › Yeni kartların destesi** ayarına göre ya çalıştığınız deste
(**Geçerli deste**) ya da `Varsayılan` adlı deste (**Varsayılan**).

Bir notu düzenlerken türü değiştiremezsiniz; bunun için
[Not türünü değiştirme](09-note-types.md#change-note-type) bölümüne bakın. Düzenlerken desteyi
değiştirirseniz **yalnızca açtığınız kart** taşınır; aynı notun diğer kartları kendi destelerinde
kalır.

<a id="fields"></a>
## Alanlar

Not türünün her alanı için bir kutu görürsünüz: **Temel** türde **Ön** ve **Arka**. Kutu yazdıkça
büyür; uzun bir alan belli bir boydan sonra kendi içinde kayar. Sayfayı kaydırmak için alan
başlıklarının veya alanların arasındaki boşluğun üzerinden sürükleyin. Alan adının yanındaki 📌
[sabitleme](#sticky-fields), 📎 de [ek ekleme](#images) düğmesidir.

Kaydetmek için en az bir kart üretecek kadar alan doldurulmalıdır. Hangi alanın hangi kartı
ürettiği türe bağlıdır; örneğin **Temel (seçimli ters kart)** türünde ters kart yalnızca
**Tersini Ekle** alanına bir şey yazarsanız (örneğin `e`) oluşur. Ayrıntı:
[Hazır not türleri](09-note-types.md#stock-types).

> **Anki'den farkı:** Anki ilk alanı boş bir notu kaydetmez. TusAnkiM, şablonlardan herhangi biri
> kart üretiyorsa kaydeder; örneğin ters kartlı bir notta yalnızca **Arka** doluysa yalnız ters
> kart oluşur.

<a id="formatting"></a>
## Biçimlendirme

Alttaki araç çubuğunun üç sekmesi vardır:

- **Giriş:** **Geri al** ve **Yinele**, kalın, italik, altı/üstü çizili, alt ve üst simge, yazı
  tipi ve boyutu, renk, büyük/küçük harf, biçimlendirmeyi temizleme ve hizalama.
- **Stiller:** Normal metin, üç başlık düzeyi, alıntı, kod bloğu, listeler, girinti ve satır
  aralığı.
- **Ekle:** Tablo, bağlantı, bilgi kutusu, yatay çizgi, MathJax, **HTML kaynağı** ve kendi
  düğmeleriniz. **＋** ile seçili metni istediğiniz HTML ile saran bir düğme oluşturursunuz; hazır
  şablonlar ve **Yardım** o pencerededir. Kendi düğmenize basılı tutarak onu düzenler veya
  silersiniz.

Klavye açıkken sekmelerin sağında **Kapat** görünür. Bağlantılardan kartta yalnızca `https://` ile
başlayanlar açılır. **HTML kaynağı** en son dokunduğunuz alanın kaynağını açar; yazdığınız kaynak
olduğu gibi saklanır. Alanda ◈ işareti görürseniz bu, düzenleyicinin gösteremediği ama koruduğu bir
öğedir (örneğin içe aktarılmış bir betik veya SVG).

Donanım klavyesinde Cmd (veya Ctrl) ile: B kalın, I italik, U altı çizili, Z geri al, Shift+Z
yinele, Shift+7 ve Shift+8 listeler, L/E/R/J hizalama, Alt+1…3 başlıklar. Shift+F3 büyük/küçük
harfi değiştirir.

> **Anki'den farkı:** MathJax düğmesi `\( … \)` işaretlerini ekler, ama TusAnkiM formülleri henüz
> işlenmiş hâlde göstermez; kartta kaynak metin görünür (Anki'ye aktarınca işlenir). Görüntü örtme
> (Image Occlusion) notu için Görüntü Örtme türünü seçip resmin üzerine maske çizin; renkler renk
> seçici yerine kısa bir paletten seçilir. Alanlardaki ve şablonlardaki betikler (JavaScript), SVG,
> MathML ve form öğeleri kartta çalıştırılmaz ve gösterilmez. Kısayollar Anki'nin değil, kelime
> işlemcilerin düzenini izler; boşluk ekleme kısayolu yoktur.

<a id="cloze"></a>
## Boşluk doldurma (cloze)
<!-- Uygulamada: Boşluklu türde Metin alanı başlığının yanındaki ⓘ (yeni, app/editor.tsx:1213-1234) bilgi sayfasının "Daha fazla bilgi" bağlantısı → bu bölüm -->

Boşluk doldurma kartında metnin bir parçası gizlenir ve onu hatırlamanız beklenir.

1. **Tür:** satırından **Boşluklu**'yu seçin.
2. **Metin** alanına cümlenizi yazın, gizlenecek kısmı seçin.
3. **Giriş** sekmesinin başındaki **[…]** düğmesine dokunun. Seçim `{{c1::…}}` olur.
4. Bir sonraki dokunuş `c2`, sonra `c3` verir. Her numara ayrı bir kart üretir. Aynı numarayı
   yeniden kullanmak için düğmeye basılı tutun; aynı numaralı boşluklar aynı kartta birlikte
   gizlenir.

İsterseniz boşluğu elle de yazabilirsiniz: `{{c1::atropin::antikolinerjik}}` yazdığınızda soru
yüzünde gizli kısmın yerinde `[antikolinerjik]` ipucu görünür. **Arka Ek** alanı cevap yüzünde
gösterilen ek bilgi içindir. **[…]** düğmesi yalnızca boşluk doldurma türlerinde ve araç çubuğu
açıkken görünür. Hiç boşluk eklemeden kaydederseniz **Kapama bulunamadı** diye sorulur; onaylarsanız
not tek kartla kaydedilir.

<a id="images"></a>
## Resim, video ve dosya ekleme

Alan adının yanındaki 📎 **Ek ekle** sayfasını açar. Ek, o alanda imlecin bulunduğu yere girer.

- **Galeriden fotoğraf seç** / **Fotoğraf çek:** Ardından **Olduğu gibi ekle** (tam çözünürlük) veya
  **Kırp ve düzenle** ([Fotoğrafı düzenleme](#photo-editor)) seçilir.
- **Boş tuvale çiz:** [Çizim sayfası](#drawing-page) açılır.
- **Ses kaydet** ve **Ses klibi ekle:** Bkz. [Ses kaydı](#audio-recording).
- **Video klibi ekle:** iPhone'da **Galeri** veya **Dosyalar**'dan seçilir.
- **Dosya ekle:** Dosya notla saklanır ve dışa aktarılır, ama kartın içinden açılamaz.

Uygulama izin isterse **Ayarları Aç** ile iPhone ayarlarından galeri, kamera veya mikrofon iznini
verin. Panodaki bir resmi alana yapıştırabilirsiniz; resim koleksiyona JPEG olarak, **Ayarlar ›
Genel › Düzenleme › Pano görsellerini PNG olarak yapıştır** açıksa PNG olarak kaydedilir. Bir web
sayfasından metinle birlikte kopyalanan resimler indirilmez ve boş görünür; resmi kaydedip ekleyin.

<a id="audio-recording"></a>
## Ses kaydı

1. 📎 › **Ses kaydet**'e dokunun ve mikrofon simgesine basın.
2. Konuşun; süre ekranda görünür.
3. Durdur düğmesine dokunun. Kayıt hemen alana eklenir.

Kaydı eklemeden önce dinleme veya yeniden kaydetme adımı yoktur. Beğenmezseniz alandaki oynatıcıyı
silip yeniden kaydedin. **İptal** veya pencerenin dışına dokunmak kaydı eklemeden kapatır. Alandaki
oynatıcının yanındaki hız düğmesi yalnızca dinlerken kullanılır, notla kaydedilmez. Çalışırken sesin
nasıl çaldığı: [Çalışma ekranı](05-studying.md#audio-and-tts).

<a id="photo-editor"></a>
## Fotoğrafı düzenleme
<!-- Uygulamada: Fotoğrafı düzenle / Çizim başlığının yanındaki ⓘ (yeni, components/PhotoEditorModal.tsx:1185-1188) bilgi sayfasının "Daha fazla bilgi" bağlantısı → bu bölüm -->

**Kırp ve düzenle** tam ekran düzenleyiciyi açar. Başlığın altındaki satır, seçili aracın nasıl
kullanılacağını söyler.

- **Kalem**, **Vurgula**, **Ok**, **Dikdörtgen**, **Elips:** Parmağınızla çizin.
- **Ört:** Üzerinden sürüklediğiniz alanı kapatan dolu bir kutu çizer. Kutu resme kalıcı olarak
  işlenir; çalışırken açılıp kapanmaz.
- **Metin:** Sayfaya dokunun, yazın, **Tamamlandı**'ya dokunun. Metni sürükleyerek taşır, köşeden
  büyütür, düğmeyle çevirir, çift dokunarak düzenlersiniz. İki parmakla büyütüp döndürebilirsiniz.
- **Silgi:** **Kısmi** yalnızca kalem izlerini dokunduğunuz yerden siler; şekilleri ve metinleri
  bütün olarak kaldırır. **Tümü** dokunduğunuz çizimi tümüyle siler.
- **Kırp:** Köşeleri sürükleyin veya bir oran seçin, sonra **Kırp**'a dokunun. **Döndür** resmi
  saat yönünde çeyrek tur çevirir.

Taşıdığınız bir nesneyi alttaki **Silmek için buraya sürükleyin** alanına bırakırsanız silinir.
↶ ve ↷ geri alır ve yineler; 🗑 tüm düzenlemeleri temizler (bu da geri alınabilir). **Tamamlandı**
resmi alana ekler. **İptal** değişiklikleri atmadan önce sorar.

<a id="drawing-page"></a>
## Boş tuvale çizim

📎 › **Boş tuvale çiz** çizim sayfasını doğrudan, son çiziminizdeki kağıtla açar. Parmağınızla
çizin; alttaki çubukta **Kalem**, yarı saydam **Fosforlu**, dokunduğu yeri silen **Silgi**, **Metin**
ve **Diğer** vardır. Altlarında renkler ve üç boy durur; her araç kendi renk ve boyunu hatırlar.
Sayfanın üstündeki ↶ ve ↷ geri alır ve yineler, 🗑 sayfayı temizler (bu da geri alınabilir).

**Metin** seçiliyken sayfaya dokunun, yazın ve **Ekle**'ye dokunun. Bir metni sürükleyerek taşıyın,
dokunarak değiştirin; seçili metnin rengi ve boyu alttan değişir, köşesindeki 🗑 onu siler.
**Diğer**'de **Ok**, **Dikdörtgen**, **Elips**, bir yeri dolu kutuyla kapatan **Ört** ve galeriden
**Görsel ekle** bulunur. Şekilleri sayfada sürükleyerek çizin. Eklenen görsel sürüklenerek taşınır,
alttaki üç boyla büyütülüp küçültülür ve köşesindeki 🗑 ile silinir; silgi görsellere dokunmaz.

Başlığın altındaki sayfa satırına (ör. **Düz · Beyaz · Yatay**) dokunarak **Kağıt** (Düz, Kareli,
Çizgili, Noktalı), **Zemin** (Beyaz, Krem, Koyu) ve **Biçim** (Yatay, Kare, Dikey) değiştirilebilir;
çizim sayfada kalır, biçim değişince oranı bozulmadan yeni sayfaya sığdırılır. Seçiminiz bir sonraki
çizim için hatırlanır. **Ekle** çizimi PNG olarak alana ekler; boş bir sayfa eklenemez. **Vazgeç**
çizimi atmadan önce sorar. Bir fotoğrafı kırpmak veya döndürmek için onu **Galeriden fotoğraf seç**
ile ekleyip **Kırp ve düzenle**'yi seçin.

<a id="tags"></a>
## Etiketler

**Etiketler:** satırına dokunun. Listeden etiketleri işaretleyin, aramayla süzün veya **＋** ile
yeni etiket yazın; birden fazla etiketi boşlukla ayırın. Alt etiket için `::` kullanın:
`farmakoloji::antibiyotik`, listede **farmakoloji › antibiyotik** olarak görünür. `marked` etiketi
notu yıldızlı (işaretli) yapar. **Onayla** seçiminizi nota uygular; etiketler not kaydedilince
saklanır ve **Yeni not ekle** ile bir sonraki nota da geçer.

<a id="sticky-fields"></a>
## Sabitlenen alanlar

Art arda benzer notlar yazıyorsanız (örneğin hep aynı kaynağı belirttiğiniz bir alan), alanın
yanındaki 📌 düğmesine dokunun. Sabitlenen alan, kaydettikten sonra temizlenmez ve uygulamayı
kapatıp açsanız da son değeriyle gelir; içindeki resim ve sesler de korunur. Sabitleme yalnızca not
eklerken çalışır ve not türünün o alanı için kaydedilir, yani o türü kullanan her yeni notta geçerli
olur. Düzenleme ekranında 📌 soluk ve devre dışıdır.

<a id="duplicates"></a>
## Yinelenen not uyarısı

İlk alana yazdığınız metin aynı türdeki başka bir notun ilk alanıyla aynıysa, alanın altında
**Yinelenen ilk alan bulundu** uyarısı ve diğer notun destesi görünür. Uyarı kaydetmeyi engellemez.
Var olan notu bulmak için metni [Kartlarım](10-browser-and-search.md) ekranında arayın.

<a id="preview"></a>
## Önizleme

Üstteki göz düğmesi notu kartta görüneceği gibi gösterir. **Soru** ve **Cevap** arasında
geçebilirsiniz. Önizleme yalnızca notun ilk kartını gösterir (ters kartı veya `c2` boşluğunu
göstermez) ve yazarak cevap kutusunu içermez.

<a id="save-and-undo"></a>
## Kaydetme ve geri alma

Sağ üstteki onay işaretine dokunun. Yeni bir notta **Not kaydedildi; N kart oluşturuldu.** mesajı
iki seçenek sunar:

- **Yeni not ekle:** Ekran açık kalır. Sabitlenen alanlar, deste, tür ve etiketler korunur, diğer
  alanlar temizlenir.
- **Bitti:** Ekran kapanır.

Bir notu düzenlediğinizde değişiklik notun bütün kartlarına uygulanır ve **Kart güncellendi.**
denir. Yeni doldurduğunuz bir alan yeni bir kart gerektiriyorsa kart eklenir; boşalan alanların
kartları ise silinmez. Onları **Desteler › ••• › Boş kartlar** ile temizlersiniz
(bkz. [Yedekler ve bakım](15-backups-and-maintenance.md#empty-cards)).

Yazarken **Geri al** ve **Yinele** düğmeleri alandaki değişiklikleri geri alır. Kaydedilmiş bir notu
geri almanın yolu yoktur; ama **Notu sil** sonrasında gelen pencerede **Geri al** notu ve kartlarını
geri getirir. Bu fırsat yalnızca o penceredir; **Bitti**'ye dokununca geri alınamaz.

<a id="editor-menu"></a>
## ••• menüsü

- **Alanları temizle:** Sabitlenenler dahil bütün alanları boşaltır. Geri alınamaz.
- **Notu sil:** Yalnızca düzenlerken görünür; notu ve ondan üretilen bütün kartları siler. Tekrar
  geçmişi silinmez.
- **Yazı boyutu:** Yalnızca bu ekrandaki yazının boyutudur; kartların görünümünü değiştirmez. Bazı
  içe aktarılmış not türleri kendi alan boyutunu kullanır.
- **Cümleleri büyük harfle başlat**, **Araç çubuğunu göster**, **Araç çubuğunu kaydır:** Hemen
  kaydedilen tercihlerdir. Araç çubuğunu gizlerseniz **[…]** ve **Geri al** düğmeleri de gizlenir.
  Kaydırma kapalıyken araç çubuğu birkaç satıra yayılır.

<a id="catalog-notes"></a>
## TUS Kartları notları

Hazır TUS Kartları paketindeki notları başka bir desteye taşıyamaz, türlerini değiştiremez ve
silemezsiniz. Paket tam kurulu değilse yalnızca etiketlerini değiştirebilirsiniz; alanlar salt
okunurdur. Ayrıntılar: [TUS Kartları paketi](17-tus-card-pack.md#editing).

## İlgili konular

- [Not türleri ve kart şablonları](09-note-types.md)
- [Kartlarım ve arama](10-browser-and-search.md)
- [Çalışma ekranı](05-studying.md)
- [Temel kavramlar](02-key-concepts.md)
