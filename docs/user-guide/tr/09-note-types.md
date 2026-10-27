---
id: note-types
title: Not türleri ve kart şablonları
summary: Hazır not türleri, alanlar, kart şablonları, şablon söz dizimi, stil ve bir notun türünü değiştirme.
order: 9
web_path: /yardim/not-turleri
app_help: help?article=note-types
app_screens:
  - "Not türleri — app/note-types.tsx"
  - "Not türünü düzenle — app/note-type.tsx"
  - "Not türü seçici — components/NoteTypePickerModal.tsx"
  - "Not türünü değiştir (Kartlarım) — components/browser/BrowserDialogs.tsx"
verified_against: master c6108e6 (2026-10-25)
---

# Not türleri ve kart şablonları

Bir **not türü**, notun hangi alanlardan oluştuğunu ve bu alanlardan hangi kartların, nasıl bir
görünümle üretileceğini belirler (bkz. [Temel kavramlar](02-key-concepts.md#note-types)). Not
türlerini **Not türleri** ekranında yönetirsiniz.

<a id="note-types-list"></a>
## Not türleri ekranı
<!-- Uygulamada: Not türleri başlığının sağındaki ⓘ (yeni, app/_layout.tsx:765-776 headerRight) bilgi sayfasının "Daha fazla bilgi" bağlantısı → bu bölüm -->

Ekranı açmak için kart ekleme ekranında **Tür:** satırına dokunun ve **Not türlerini yönet…**'i
seçin. Seçili türün kendi düzenleyicisine doğrudan gitmek için aynı ekrandaki **Kartlar:** satırına
dokunun.

Her satırda türün adı, alan sayısı, şablon sayısı ve türü (standart veya boşluk doldurma) yazar.
Bir satıra dokunarak **Not türünü düzenle** ekranını açarsınız. **+ Yeni not türü**, **Temel**
türün bir kopyasını **Yeni not türü** adıyla oluşturur ve hemen düzenlemeye açar. iPhone'da ekranı
aşağı kaydırarak kapatırsınız.

<a id="stock-types"></a>
## Hazır not türleri

| Tür | Alanlar | Ürettiği kartlar |
| --- | --- | --- |
| **Temel** | Ön, Arka | 1 kart: ön → arka |
| **Temel (ve ters kart)** | Ön, Arka | 2 kart: ön → arka ve arka → ön |
| **Temel (seçimli ters kart)** | Ön, Arka, Tersini Ekle | Ön → arka; **Tersini Ekle** doluysa ters kart da |
| **Temel (yanıtı yazarak)** | Ön, Arka | 1 kart; çalışırken **Arka**'yı yazarak cevaplarsınız |
| **Boşluklu** | Metin, Arka Ek | Her boşluk numarası (`c1`, `c2`…) için 1 kart |

Türkçe arayüzde alan adları çevrilmiş görünür (**Ön**, **Arka**, **Metin**). Şablonlarda ise
alanların gerçek adları kullanılır: `Front`, `Back`, `Text`, `Back Extra`, `Add Reverse`. Not türü
düzenleyicisi bu gerçek adları gösterir.

<a id="fields"></a>
## Alanlar

**ALANLAR** bölümünde her alanın adı, ↑ ↓ ile sırası ve ✕ ile silme düğmesi vardır.

- **Ad değiştirmek:** Adı yazın ve kutudan çıkın veya Return'e dokunun. Şablonlardaki bütün
  başvurular yeni ada çevrilir. Değişiklik **Kaydet** ile saklanır.
- **Eklemek, taşımak, silmek:** **+ Alan ekle**, ↑ ↓ ve ✕ **hemen** uygulanır: bu türdeki bütün
  notlar o anda güncellenir. **Kapat** bunu geri almaz ve geri alma yoktur. Silinen alanın her
  nottaki içeriği de silinir; önce onay istenir.
- **Kurallar:** Ad `#`, `^` veya `/` ile başlayamaz; `:`, `{`, `}` veya `"` içeremez. İki alan
  (büyük/küçük harf farkı gözetilmeden) aynı adı taşıyamaz. Her türde en az bir alan bulunur.
- **Boşluklu türler:** Alan eklenemez, taşınamaz, silinemez; adları değiştirilebilir.

Bir alanın her yeni notta son değerini korumasını istiyorsanız kart ekleme ekranındaki 📌 düğmesini
kullanın (bkz. [Sabitlenen alanlar](08-adding-and-editing.md#sticky-fields)).

<a id="card-types"></a>
## Kart türleri

Bir türün her **kart türü** (şablonu) nottan ayrı bir kart üretir. Birden fazla şablon varsa
**KART TÜRLERİ** başlığının altında `1: Card 1`, `2: Card 2` gibi düğmeler görünür; düzenlemek
istediğinizi seçin. Bir şablon, ön yüzünde en az bir dolu alan gösterdiğinde kart üretir.
Boşluk doldurma türlerinde tek şablon vardır; kart sayısını metindeki boşluk numaraları belirler.

<a id="templates"></a>
## Ön yüz ve arka yüz şablonları
<!-- Uygulamada: Not türünü düzenle başlığının sağındaki ⓘ (yeni, app/_layout.tsx:777-785 headerRight) bilgi sayfasının "Daha fazla bilgi" bağlantısı → bu bölüm -->

**ÖN YÜZ (SORU)** kartın soru tarafını, **ARKA YÜZ (CEVAP)** cevap tarafını tanımlar. İkisi de HTML
ve süslü parantezli yer tutuculardan oluşur. **ÖNİZLEME** yaptığınız değişikliği örnek metinle
hemen gösterir. **Temel** türün şablonları şöyledir:

```
Ön yüz:   {{Front}}
Arka yüz: {{FrontSide}}
          <hr id=answer>
          {{Back}}
```

`{{FrontSide}}` soru tarafını cevabın üstünde yeniden gösterir. `<hr id=answer>` iki tarafı ayıran
çizgidir; cevap açılınca sayfa bu çizgiye kaydırılır. Şablon değişiklikleri bu türdeki **bütün
notları** etkiler ve **Kaydet** ile saklanır.

<a id="field-replacements"></a>
## Alan yerleştirme
<!-- Uygulamada: ÖN YÜZ (SORU) etiketinin altındaki "Şablon söz dizimi" bağlantısı (yeni, app/note-type.tsx:250) → bu bölüm -->

`{{Alan adı}}` alanın içeriğini yerleştirir. Uygulamanın kendi doldurduğu özel alanlar da vardır:

| Yazım | Gösterdiği |
| --- | --- |
| `{{Tags}}` | Notun etiketleri |
| `{{Deck}}`, `{{Subdeck}}` | Destenin tam adı, en alttaki deste adı |
| `{{Type}}`, `{{Card}}` | Not türünün adı, kart türünün adı |
| `{{CardFlag}}` | Kartın bayrağı (`flag0`…`flag7`); stil için kullanılır |
| `{{CardID}}` | Kartın numarası |

Alanın önüne bir süzgeç yazabilirsiniz:

- `{{text:Front}}` HTML biçimini atar, düz metni gösterir.
- `{{hint:Back}}` alanı bir bağlantının arkasına saklar; dokununca açılır.
- `{{furigana:Front}}`, `{{kana:Front}}`, `{{kanji:Front}}` `kelime[okunuş]` yazımını işler.
- `{{nc:Front}}` aksan işaretlerini kaldırır.

Tanınmayan bir süzgeç (örneğin bir Anki eklentisine ait olan) yok sayılır ve alan olduğu gibi
gösterilir.

<a id="conditionals"></a>
## Koşullu bölümler

- `{{#Alan}} … {{/Alan}}` arasındaki kısım yalnızca alan doluysa gösterilir.
- `{{^Alan}} … {{/Alan}}` yalnızca alan boşsa gösterilir.

Yalnızca boşluk ve satır sonu içeren alan boş sayılır. **Temel (seçimli ters kart)** türünün ikinci
şablonu bu yolla çalışır: `{{#Add Reverse}}{{Back}}{{/Add Reverse}}`. Ön yüzde hiçbir dolu alan
kalmadığı için **Tersini Ekle** boşken ters kart üretilmez. Boşluk doldurma türlerinde
`{{#c1}} … {{/c1}}` yalnızca 1 numaralı boşluğun kartında gösterilir.

<a id="cloze-templates"></a>
## Boşluk doldurma şablonları

Boşluklu türün şablonları `{{cloze:Text}}` (ön yüz) ve `{{cloze:Text}}<br>{{Back Extra}}` (arka
yüz) biçimindedir. `cloze:` süzgeci, o kartın numarasındaki boşluğu soru yüzünde `[...]` (veya
ipucu) olarak gizler, cevap yüzünde gösterir. `{{cloze-only:Text}}` yalnızca gizlenen kısımları
gösterir. Bir türde birden fazla alan `cloze:` ile kullanılabilir; kartlar bütün bu alanlardaki
numaralardan üretilir. Gizlenen kısmın görünümünü stilde `.cloze` sınıfıyla değiştirirsiniz.

<a id="typed-answer"></a>
## Yazarak cevap

Ön yüze `{{type:Back}}` eklerseniz çalışırken bir yazı kutusu çıkar; arka yüzde aynı
`{{type:Back}}` yazdığınızla doğru cevabın karşılaştırmasını gösterir. **Temel (yanıtı yazarak)**
türü buna örnektir. Diğer biçimler:

- `{{type:cloze:Text}}`: boşluk doldurma kartında gizlenen kısmı yazdırır.
- `{{type:nc:Back}}`: karşılaştırmada aksan işaretlerini dikkate almaz.

Bir kartta tek yazı kutusu olur. Çalışırken nasıl göründüğü ve ilgili ayarlar:
[Çalışma ekranı](05-studying.md#typed-answer).

<a id="tts"></a>
## Sesli okuma (TTS)

`{{tts tr_TR:Front}}` alanı karta yazmadan sesli okutur. Dil kodu `tr_TR`, `en_US` gibi yazılır;
`{{tts en_US speed=1.2:Back}}` hızı ayarlar, `voices=` tercih ettiğiniz sesleri sıralar.
Birden fazla alanı ve sabit metni birlikte okutmak için
`[anki:tts lang=tr_TR]{{Front}} — {{Back}}[/anki:tts]` yazabilirsiniz. Okuma, iPhone'unuzda yüklü
seslerle yapılır. Çalışırken nasıl çalıştığı: [Çalışma ekranı](05-studying.md#audio-and-tts).

<a id="styling"></a>
## Stil (CSS)

**STİL (CSS)** kutusu bu türün bütün kartlarına uygulanır. Kullanışlı sınıflar:

- `.card`: kartın tamamı; yazı tipi, boyut, renk ve zemin buraya yazılır.
- `.card1`, `.card2`: yalnızca o kart türü.
- `.nightMode`: uygulama karanlık temadayken. Örnek: `.nightMode .cloze { color: lightblue; }`
- `.iphone`: kart iPhone'da gösterilirken.

Şablonun içine `<style>` bloğu da yazabilirsiniz. Güvenlik için internetten yüklenen dosyalar
(`@import`, uzak `url(...)`) kaldırılır; arka plan resmi gibi dosyalar koleksiyondaki medyadan
gelmelidir.

<a id="validation"></a>
## Kaydederken yapılan denetimler

**Kaydet**, sorun varsa türü kaydetmez ve **Not türü kaydedilemedi** başlığıyla her sorunu bir satırda
gösterir. Örneğin:

- **“Back” adı birden fazla alanda kullanılıyor.**
- Bir şablonun, türde olmayan bir alanı kullanması.
- `{{#Alan}}` veya `{{^Alan}}` açılıp `{{/Alan}}` ile kapatılmaması ya da açılmamış bir `{{/Alan}}`.
- Ön yüzün hiçbir alan kullanmaması (bu şablondan kart üretilemez).
- Boşluk doldurma türünde ön yüzde `{{cloze:...}}` olmaması.

Yazım hatasını düzeltip yeniden **Kaydet**'e dokunun. Kaydetmeden çıkarsanız
**Değişiklikler atılsın mı?** diye sorulur.

<a id="change-note-type"></a>
## Bir notun türünü değiştirme

Var olan bir notun türü kart ekleme ekranından değiştirilmez. Bunu **Kartlarım** ekranında
yaparsınız (seçim için bkz. [Kartlarım ve arama](10-browser-and-search.md)):

1. Bir satıra basılı tutarak seçim yapın ve değiştirmek istediğiniz notları seçin.
2. Alttaki **Diğer** düğmesine, sonra **Not türünü değiştir**'e dokunun.
3. Yeni türü seçin.

Alanlar önce adlarına, sonra sıralarına göre eşleştirilir; şablonlar da öyle. Yeni türde karşılığı
olan kartlar çalışma geçmişini ve zamanlamasını korur. Karşılığı olmayan kartlar varsa
**Kartlar silinsin mi?** diye kaç kartın silineceği sorulur; bu kartların tekrar geçmişi saklanır.
Boşluk doldurma türüne geçerken bütün kartlar korunur. Bitince gelen pencerede
**Geri al** değişikliği bir kez geri alır. TUS Kartları paketindeki notların türü değiştirilemez.

<a id="not-supported"></a>
## Bu sürümde olmayanlar

- Bir türe kart türü (şablon) eklemek, silmek veya adını değiştirmek.
- Bir not türünü silmek veya istediğiniz bir türü kopyalamak; yeni tür her zaman **Temel**'den
  başlar, bu yüzden yeni bir boşluk doldurma türü oluşturulamaz.
- Sıralama alanını ve alan seçeneklerini (yazı tipi, boyut, sağdan sola, açıklama) değiştirmek.
  İçe aktarılan türlerin yazı tipi, boyut ve sağdan sola ayarı kart ekleme ekranında kullanılır.
- Şablona tanımlanmış farklı deste (deste geçersiz kılma): yeni kartlar seçtiğiniz desteye gider.

> **Anki'den farkı:** Şablonlardaki betikler (JavaScript) güvenlik için çalıştırılmaz; bu tür
> kartlar sade görünebilir. MathJax formülleri işlenmiş hâlde gösterilmez; kaynak metin görünür.
> Görüntü örtme (Image Occlusion) maskeleri döndürülemez, rengi değiştirilemez. Eklentilere ait süzgeçler yok sayılır.

## İlgili konular

- [Kart ekleme ve düzenleme](08-adding-and-editing.md)
- [Kartlarım ve arama](10-browser-and-search.md)
- [Çalışma ekranı](05-studying.md)
- [Anki ile birlikte kullanma](19-using-with-anki.md)
