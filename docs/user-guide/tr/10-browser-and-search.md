---
id: browser
title: Kartlarım ve arama
summary: Kartlarım ekranında kartları bulma, filtreleme ve toplu düzenleme; arama terimleri ve Kart bilgisi ekranı.
order: 10
web_path: /yardim/kartlarim-ve-arama
app_help: help?article=browser
app_screens:
  - "Kartlarım — app/browser.tsx (parçaları components/browser/)"
  - "Kart bilgisi — app/card-info.tsx (çalışma ekranının ⋮ menüsünden)"
verified_against: master c6108e6 (2026-10-25)
---

# Kartlarım ve arama

**Kartlarım**, koleksiyonunuzdaki kartları listelediğiniz, aradığınız ve toplu olarak
değiştirdiğiniz ekrandır. Kartları başka desteye taşıyabilir, etiketleyebilir, bayraklayabilir,
askıya alabilir veya silebilirsiniz. Uygulama İngilizceyken ekranın adı **Card Browser**'dır.

<a id="open-browser"></a>
## Kartlarım'ı açma

- **Desteler** sekmesinin alt çubuğunda **Kartlarım**: bütün koleksiyon açılır.
- Deste satırındaki **•••** › **Kartlara göz at**: o deste ve alt desteleri açılır.
- **İstatistikler**'deki **Eklenenler** grafiğinde bir sütuna dokunmak: o günlerde eklenen kartlar,
  arama kutusu doldurulmuş olarak açılır.
- Bir kısayol `tusankim://x-callback-url/search?query=…` bağlantısıyla Kartlarım'ı bir aramayla
  açabilir. Bkz. [Kısayollar ve otomasyon](18-shortcuts-and-automation.md).

Çıkmak için sol üstteki geri düğmesine dokunun veya ekranın sol kenarından sağa kaydırın.

> **Web sürümünde:** Pencere genişse (en az 768 piksel) çalışma ekranının solunda kenar çubuğu
> görünür; altındaki **Kartlarım** düğmesi ekranı çalıştığınız destede açar. iPhone'da bu kenar
> çubuğu yoktur.

<a id="browser-layout"></a>
## Ekranın düzeni
<!-- Uygulamada: Kartlarım başlığının sağındaki ⓘ (yeni, app/browser.tsx:893) → help.browser.sheet → "Daha fazla bilgi" bu bölüm -->

1. **Deste seçici ve sayaç:** Hangi destenin kartlarını gördüğünüzü (**Tüm koleksiyon** veya deste
   adı) ve listede kaç kart olduğunu gösterir. Yanında **＋ Yeni kart** ve **⋮** düğmeleri vardır.
2. **Arama kutusu:** Yazdıkça liste süzülür. **✕** aramayı temizler, **?** arama terimlerini açar.
3. **Filtre çipleri:** **Tümü**, **İşaretli** ve o an açık olan filtreler.
4. **Liste:** Her satırda kartın sorusu, destesi ve durum etiketi (**Öğrenme** veya **Tekrar**; yeni
   kartlarda etiket yoktur) görünür. Yıldız notun işaretli olduğunu, renkli bayrak kartın
   bayrağını, duraklatma simgesi kartın askıda olduğunu gösterir. Askıdaki ve gömülü kartların
   satırları farklı bir zemin rengiyle ayrılır.

- Bir satıra dokunduğunuzda açılır: cevap, **Aralık**, **Kolaylık**, **Sonraki gösterim** ve
  **Askıya al** düğmesi görünür.
- Kalem simgesi kartı düzenleyicide açar. Bkz. [Kart ekleme ve düzenleme](08-adding-and-editing.md).
- Bir satırı basılı tutmak seçimi başlatır. Bkz. [Kart seçme](#selecting).
- Listeyi aşağı çekerek yenilersiniz; kaydırdıkça sonraki kartlar yüklenir.

<a id="deck-and-filters"></a>
## Deste seçimi ve filtreler

Deste seçiciye dokunup bir deste seçin; liste yerinde güncellenir, arama ve filtreler korunur. Alt
desteler her zaman dahildir. **Tüm koleksiyon** bütün kartları gösterir; **＋** ile buradan yeni
deste de oluşturabilirsiniz. Sayaç, deste, filtreler ve aramanın birlikte bulduğu kart sayısıdır.

Filtreler **⋮** menüsündedir:

| Menü öğesi | Ne gösterir? |
| --- | --- |
| **İşaretlileri filtrele** | İşaretli (yıldızlı) notların kartları. **İşaretli** çipi de aynı işi yapar. |
| **Askıdakileri filtrele** | Askıya alınmış kartlar. |
| **Etikete göre filtrele** | Seçtiğiniz etiketlerden **herhangi birini** taşıyan notlar; alt etiketler dahildir. Yalnızca seçili destedeki etiketler listelenir. |
| **Bayrağa göre filtrele** | Açılan listeden seçtiğiniz bayraklardan herhangi biri olan kartlar. **Bayrak yok** da bir seçenektir; hiçbirini seçmezseniz liste boş kalır. |

Açık her filtre arama kutusunun altında bir çip olur; çipteki **×** o filtreyi kaldırır. **Tümü**
bütün filtreleri kaldırır ama aramayı ve deste seçimini değiştirmez.

> **Dikkat:** Deste seçici ile aramaya yazdığınız `deck:` terimi birlikte uygulanır. Bir deste
> seçiliyken başka bir desteyi `deck:` ile ararsanız sonuç çıkmaz; önce **Tüm koleksiyon**'u seçin.

<a id="cards-and-notes"></a>
## Kart ve not görünümü

**⋮ › Seçenekler › Görünüm** bölümünden **Kartlar** veya **Notlar**'ı seçin.

- **Kartlar:** Her kart ayrı satırdır; ters kartlı bir not iki satır olur.
- **Notlar:** Her not tek satırdır. Satırda notun ilk kartı ve not türü görünür, sayaç not sayar.
  Bu görünümde yaptığınız her işlem notun **bütün kartlarına** uygulanır. Bayrak ve askı işaretleri
  satırda gösterilmez.

Aynı pencerede **Yanıt önizlemesini göster** her satıra cevabın kısa bir parçasını ekler,
**Zamanlama ayrıntıları** "Son: … · Sonraki: …" satırını açıp kapatır. Seçimleriniz hatırlanır.
Satırların yazı boyutunu **Ayarlar**'daki **Kart tarayıcısı › Yazı ölçeği** değiştirir.

<a id="sorting-and-columns"></a>
## Sıralama ve sütunlar

**⋮ › Görüntüleme sırasını değiştir**'e dokunun; **Artan** veya **Azalan** yönü ve bir ölçüt seçin.
Seçim hatırlanır.

| Ölçüt | Neye göre sıralar? |
| --- | --- |
| **Sıralama alanı** | Notun sıralama alanı (çoğu not türünde ilk alan), alfabetik |
| **Kart türü** | Notun kaçıncı kartı olduğu (Kart 1, Kart 2…); Notlar görünümünde **Kart sayısı** |
| **Vade** | Önce yeni kartlar (konumlarına göre), sonra öğrenme, sonra tekrar kartları (vade gününe göre); Notlar görünümünde **En yakın vade** |
| **Deste** | Deste adı |
| **Oluşturulma** / **Değiştirilme** | Notun eklendiği zaman / kartın son değiştiği zaman |
| **Aralık**, **Kolaylık**, **Unutma sayısı**, **Tekrar sayısı** | Kartın bu değeri; Notlar görünümünde ortalama veya toplam |

Satırların düzeni sabittir; sütun eklenip çıkarılamaz. Satıra yalnızca **Seçenekler**'deki iki
isteğe bağlı bilgi eklenebilir.

<a id="selecting"></a>
## Kart seçme ve toplu işlemler
<!-- Uygulamada: seçim çubuğundaki "Diğer" sayfasının altındaki "Daha fazla bilgi" (yeni, components/browser/BrowserMenus.tsx:224) → bu bölüm -->

1. Bir satırı basılı tutun; seçim başlar ve satır seçilir.
2. Eklemek veya çıkarmak istediğiniz satırlara dokunun. Hepsi için **⋮ › Tümünü seç**.
3. Alttaki çubuktan bir işlem seçin: **Deste**, **Askı**, **Bayrak** veya **Diğer**.
4. Bitince çubuğun solundaki **×** ile seçimi kapatın.

Liste kaydırdıkça yüklendiği için uzun listelerde menüde **Yüklenenleri seç (N)** yazar: yalnızca
yüklenmiş satırlar seçilir. Hepsini seçmek için önce listenin sonuna kaydırın.

**Diğer** menüsünde **Askıya al / askıdan çıkar**, **Göm / gömmeden çıkar**, **Not türünü
değiştir**, **Desteyi değiştir**, **Yeniden konumlandır**, **Vade tarihini ayarla**, **Etiketleri
düzenle**, **Şimdi derecelendir**, **Kartları sıfırla…**, **Önizle**, **Kartları dışa aktar** ve
**Notları sil** bulunur; her biri aşağıda anlatılır.

- Açıp kapatan işlemler (askı, gömme, bayrak) **en son dokunduğunuz kartın** durumuna bakar: o kart
  askıdaysa bütün seçim askıdan çıkar, değilse hepsi askıya alınır.
- Hazır TUS kart paketindeki kartlar başka desteye taşınamaz, not türleri değiştirilemez,
  dışa aktarılamaz ve silinemez; uygulama bunu **Katalog Korumalı** mesajıyla bildirir.
  Bkz. [TUS Kartları paketi](17-tus-card-pack.md).

<a id="undo"></a>
### Geri alma

| İşlem | Nasıl geri alınır? |
| --- | --- |
| **Notları sil** | Silmeden sonraki mesajda **Geri al** |
| **Not türünü değiştir** | Değişiklikten sonraki mesajda **Geri al** |
| **Desteyi değiştir** | Ekrandan çıkmadan **⋮ › Geri al: Deste güncelleme** (son taşıma) |
| **Yeniden konumlandır** | Pencereyi yeniden açınca **Geri al** (son konumlandırma) |

Askı, gömme, bayrak ve etiket değişikliklerini aynı işlemi tersine yaparak düzeltirsiniz. **Vade
tarihini ayarla**, **Kartları sıfırla** ve **Şimdi derecelendir** geri alınamaz.

> **Anki'den farkı:** Kartlarım'da genel bir geri alma komutu yoktur; yalnızca yukarıdaki işlemler
> geri alınır. Masaüstü Anki'deki sütun seçimi, bul ve değiştir, kopyaları bulma ve kayıtlı
> aramalar bulunmaz. Kart bilgisini çalışma ekranından açarsınız.

<a id="change-deck"></a>
## Desteyi değiştirme

1. Kartları seçin ve çubukta **Deste**'ye (veya **Diğer › Desteyi değiştir**'e) dokunun.
2. **Seçili Kartların Destesi** listesinden hedefi seçin. Üstteki kutuyla desteleri süzebilir,
   **＋** ile yeni deste oluşturup hemen seçebilirsiniz.

Kartlar onay sorulmadan taşınır; vade ve aralıkları değişmez. Filtrelenmiş desteler ve TUS kart
paketinin desteleri hedef olarak listelenmez. FSRS kullanıyorsanız taşınan kartların hafıza bilgisi
yeni destenin ayarlarıyla yeniden hesaplanır.

<a id="change-note-type"></a>
## Not türünü değiştirme

Kartları seçin, **Diğer › Not türünü değiştir**'e dokunun ve yeni not türünü seçin. Alanlar ve
kartlar önce adına, sonra sırasına göre eşleştirilir; karşılığı olmayan kartlar silinecekse uygulama
önce sorar, sonra **Geri al** sunar. Ayrıntılar: [Not türleri ve kart şablonları](09-note-types.md#change-note-type).

<a id="tags"></a>
## Etiketleri düzenleme

1. Kartları seçin ve **Diğer › Etiketleri düzenle**'ye dokunun.
2. **Seçili notların etiketleri** penceresinde işaretli görünenler, seçili notların **hepsinde**
   ortak olan etiketlerdir.
3. İşaretlediğiniz etiket bütün seçili notlara eklenir, işaretini kaldırdığınız etiket hepsinden
   çıkarılır. Yalnızca bazı notlarda olan etiketler işaretsiz görünür ve değişmez.
4. Yeni etiket için **＋**'ya dokunun (birden fazla etiketi boşlukla ayırın), sonra **Onayla**.

Etiket nota aittir: bir kartın etiketini değiştirmek aynı notun bütün kartlarını etkiler.

<a id="flags-and-marks"></a>
## Bayraklar ve işaret

Kartları seçin, çubukta **Bayrak**'a dokunun ve bir renk seçin; **Bayrak yok** bayrağı kaldırır. En
son dokunduğunuz kartta zaten olan bayrağı seçerseniz bayrak bütün seçimden kalkar. Bayrak adları
değiştirilemez.

| Arama | Bayrak | Arama | Bayrak |
| --- | --- | --- | --- |
| `flag:0` | Bayrak yok | `flag:4` | Mavi bayrak |
| `flag:1` | Kırmızı bayrak | `flag:5` | Pembe bayrak |
| `flag:2` | Turuncu bayrak | `flag:6` | Turkuaz bayrak |
| `flag:3` | Yeşil bayrak | `flag:7` | Mor bayrak |

**İşaret** (yıldız) notun `marked` etiketidir. Kartlarım'da işaret düğmesi yoktur: notu çalışma
ekranında **⋮ › Notu işaretle** ile işaretleyin veya **Etiketleri düzenle** ile `marked` etiketini
ekleyin. İşaretli notları **İşaretli** çipiyle veya `tag:marked` aramasıyla bulursunuz.

<a id="suspend-and-bury"></a>
## Askıya alma ve gömme

- **Askıya almak:** Çubukta **Askı**, **Diğer › Askıya al / askıdan çıkar** veya açılmış satırdaki
  **Askıya al** düğmesi. Askıdaki kart, siz **Askıdan Çıkar**'a dokunana kadar çalışmaya gelmez.
- **Gömmek:** **Diğer › Göm / gömmeden çıkar**. Gömülü kart yalnızca o gün kenara konur ve sonraki
  çalışma günü kendiliğinden döner. Askıdaki kartlar gömülmez.

<a id="reposition"></a>
## Yeni kartların sırasını değiştirme

Her yeni kartın bir **konum** numarası vardır. Deste seçeneklerinin **Görüntüleme sırası** kartında
konuma göre bir sıra seçiliyse (ör. **Artan konum**) yeni kartlar bu numaralarla gelir.
Bkz. [Deste seçenekleri](06-deck-options.md).

1. Yeni kartları seçin ve **Diğer › Yeniden konumlandır**'a dokunun.
2. **Başlangıç konumu** ve **Adım**'ı yazın: ilk not başlangıç numarasını, sonraki her not bir adım
   fazlasını alır. İsterseniz **Sırayı rastgele yap**'ı işaretleyin.
3. **Mevcut kartların konumunu kaydır** işaretliyse, başlangıçta ve sonrasındaki diğer yeni kartlar
   seçtiğiniz kart sayısı × adım kadar geriye itilir; numaralar çakışmaz. Pencere her açıldığında
   bu kutu işaretli gelir; kaydırma istemiyorsanız işareti kaldırın.
4. **Uygula**'ya dokunun.

- Yalnızca yeni kartlar etkilenir; seçimde yeni kart yoksa **Yeni kart yok** mesajı çıkar. Aynı
  notun kartları aynı konumu alır.
- Kartlar listedeki sıralarıyla numaralanır; tek tek seçtiyseniz en son dokunduğunuz kart başa
  alınır. Belirli bir sıra için önce listeyi sıralayın, sonra **⋮ › Tümünü seç** ile seçin.
- **Başlangıç konumu** ve **Adım** her seferinde 1'den başlar; **Sırayı rastgele yap** hatırlanır.

<a id="set-due-date"></a>
## Vade tarihini ayarlama

1. Kartları seçin ve **Diğer › Vade tarihini ayarla**'ya dokunun.
2. Gün sayısını yazıp **Uygula**'ya dokunun:
   - `0` bugün, `1` yarın, `5` beş gün sonra demektir.
   - `3-7` her karta 3 ile 7 gün arasında rastgele bir gün verir; yük günlere yayılır.
   - Sona `!` eklerseniz (`7!`) kartın aralığı da bu gün sayısına ayarlanır. FSRS açıkken `!`
     etkisizdir; aralık, karta son baktığınız günden yeni vadeye kadar geçecek süreye göre belirlenir.

Eksi sayı ve boşluk kabul edilmez; hatalı yazarsanız **Geçersiz vade** mesajı çıkar. Kartlar o gün
vadesi gelen **tekrar kartı** olur, yeni kartlar da. Yeni kartın eski konumu saklanır; sıfırlarsanız
oraya dönebilir. İşlem tekrar geçmişine **El ile** satırı olarak yazılır ve geri alınamaz.

<a id="forget-and-reset"></a>
## Kartları sıfırlama

**Diğer › Kartları sıfırla…** seçili kartları yeniden **Yeni** yapar (Anki'de "Reset Card", eski
adıyla "Forget").

- **Mümkünse ilk sırasına geri koy** (varsayılan açık): kart, ilk çalışılmadan önceki konumuna döner;
  bilinmiyorsa yeni kartların sonuna eklenir.
- **Tekrar ve unutma sayılarını sıfırla** (varsayılan kapalı): sayaçları da sıfırlar.

**Sıfırla**'ya dokunduğunuzda aralık, kolaylık ve FSRS hafıza bilgisi silinir; filtrelenmiş destedeki
kartlar kendi destelerine döner. Tekrar geçmişi korunur. Seçimleriniz bir dahaki sefere hatırlanır.
İşlem geri alınamaz.

<a id="grade-now"></a>
## Şimdi derecelendirme

**Diğer › Şimdi derecelendir**, seçili kartları çalışma ekranında cevaplamışsınız gibi işler:
**Tekrar**, **Zor**, **İyi** veya **Kolay**'a dokunduğunuz anda her kart zamanlanır. Bu cevaplar
istatistiklerde gerçek tekrar sayılır ve geri alınamaz.

<a id="preview-and-export"></a>
## Önizleme ve dışa aktarma

- **Diğer › Önizle**, kartları çalışırken göründükleri gibi gösterir. **Cevap** / **Soru** ile yüz
  değiştirir, **Önceki** / **Sonraki** ile gezersiniz; aşağı kaydırarak kapatırsınız.
- **Diğer › Kartları dışa aktar** (Notlar görünümünde **Notları dışa aktar**) seçimi **Dışa aktar**
  ekranında açar. Bkz. [İçe ve dışa aktarma](14-import-export.md).

<a id="delete-notes"></a>
## Notları silme

1. Kartları seçin ve **Diğer › Notları sil**'e dokunun.
2. Onay penceresinde **Notları sil**'e dokunun.

Silme **not** düzeyindedir: seçtiğiniz kartın notu ve o notun seçmediğiniz kardeş kartları da
silinir. Hemen sonra çıkan **Silindi** mesajındaki **Geri al** her şeyi geri getirir; **Bitti** ile
kapattıktan sonra geri alma yoktur. Tekrar geçmişi silinmez.

<a id="create-filtered-deck"></a>
## Aramadan filtrelenmiş deste oluşturma

**⋮ › Filtrelenmiş deste oluştur**, ekrandaki deste seçimini, filtreleri ve aramayı tek bir aramada
birleştirir; **Desteler** sekmesine geçip filtrelenmiş deste ekranını bu aramayla açar.
Bkz. [Filtrelenmiş deste ve özel çalışma](11-filtered-decks.md).

<a id="search-basics"></a>
## Arama: temel kullanım

- Düz kelimeler notun **alanlarındaki metinde** aranır (soru, cevap ve diğer alanlar). Kelimenin
  parçası da eşleşir: `kalp`, "kalpte"yi de bulur. Büyük/küçük harf fark etmez.
- Etiketler, deste adları ve konu düz kelimeyle aranmaz; bunlar için `tag:` ve `deck:` kullanın.
- Birden fazla kelime yazarsanız kartta hepsi bulunmalıdır. Kelimeleri yan yana aramak için tırnak
  kullanın: `"beta bloker"`.
- Arama eksikse (örneğin `is:` yazıp devamını getirmediyseniz) kutunun altında **Arama henüz geçerli
  değil; son geçerli sonuçlar gösteriliyor.** yazar ve liste değişmez.
- **?** sık kullanılan terimleri açar; bir terime dokunduğunuzda aramanıza eklenir. `deck:` gibi değer
  isteyen terimlerde kutuya dokunup değeri yazın.
- Bir kelimenin ortasından biçimlendirme geçiyorsa (yalnızca birkaç harfi kalın gibi) kelime yalnızca
  notun sıralama alanında bulunur.

<a id="search-syntax"></a>
## Arama terimleri
<!-- Uygulamada: Kartlarım › arama kutusundaki ? (app/browser.tsx:978-986) → "Arama nasıl çalışır?" (components/browser/BrowserDialogs.tsx:376) → "Daha fazla bilgi" (yeni) bu bölüm -->

| Terim | Anlamı | Örnek |
| --- | --- | --- |
| `deck:ad` | Deste ve alt desteleri; boşluklu adı tırnağa alın, alt desteyi `::` ile yazın | `deck:"Farmakoloji::Otonom"` |
| `deck:current` | Deste seçicide seçili deste | `deck:current is:due` |
| `deck:filtered` | Bir filtrelenmiş destede bulunan kartlar | `-deck:filtered` |
| `tag:ad` | Etiket ve alt etiketleri | `tag:farmakoloji` |
| `tag:none` | Etiketi olmayan notlar | `tag:none` |
| `note:ad` | Not türü (kayıtlı adıyla, bkz. aşağısı) | `note:Basic` |
| `card:n` | Notun kaçıncı kartı | `card:2` |
| `preset:ad` | Destenin ayar grubu | `preset:"TUS Kartları"` |
| `is:new` / `is:learn` / `is:review` | Yeni / öğrenme (yeniden öğrenme dahil) / tekrar kartları | `is:learn` |
| `is:due` | Bugün vadesi gelmiş veya gecikmiş kartlar | `is:due` |
| `is:suspended` / `is:buried` | Askıdaki / gömülü kartlar | `-is:suspended` |
| `flag:n` | Bayrak numarası (0 bayraksız, 1–7) | `flag:1` |
| `added:n` | Son n günde eklenen kartlar | `added:7` |
| `edited:n` | Son n günde düzenlenen notlar | `edited:3` |
| `rated:n` | Son n günde cevaplanan kartlar | `rated:1` |
| `rated:n:d` | d düğmesiyle cevaplanan (1 **Tekrar**, 2 **Zor**, 3 **İyi**, 4 **Kolay**) | `rated:7:1` |
| `introduced:n` | İlk kez son n günde çalışılan kartlar | `introduced:7` |
| `resched:n` | Vadesi son n günde elle değiştirilen kartlar | `resched:1` |
| `prop:ivl` | Aralık (gün) | `prop:ivl>=21` |
| `prop:due` | Vadeye kalan gün (0 bugün, eksi gecikmiş) | `prop:due<=3` |
| `prop:reps` / `prop:lapses` | Tekrar / unutma sayısı | `prop:lapses>=5` |
| `prop:ease` | Kolaylık (2.5 = %250; yeni kartlar 0 sayılır) | `prop:ease<2` |
| `prop:pos` | Yeni kartın konumu | `prop:pos<=100` |
| `prop:s` / `prop:d` / `prop:r` | FSRS hafıza gücü (gün) / zorluk (0–1) / hatırlanabilirlik (0–1) | `prop:r<0.8` |
| `nc:kelime` | Türkçe harf ve aksan farkını yok sayar | `nc:bobrek` |
| `w:kelime` | Yalnızca tam kelime | `w:kas` |
| `*` / `_` | Herhangi bir dizi / tek karakter | `hipo*emi` |
| `alan:metin` | Alanın tamamı; parçası için `*` ekleyin | `front:*kalp*` |
| `alan:` | Boş alan | `back:` |
| `re:ifade` | Düzenli ifade (boşluk içeriyorsa tırnakla) | `"re:\d+ mg"` |
| `nid:` / `cid:` | Not / kart numarası (Kart bilgisinde yazar) | `cid:1712345678901` |

- `prop:` terimleri `=`, `!=`, `<`, `<=`, `>`, `>=` ile yazılır. Ondalık için nokta kullanın:
  `prop:d>0.7`, `0,7` değil.
- Günler çalışma gününe göre sayılır: `rated:1` bugün demektir. Bkz.
  [Temel kavramlar](02-key-concepts.md#study-day).
- Kart bilgisindeki yüzdeler FSRS terimlerine 0–1 olarak yazılır: **Zorluk** %70 → `prop:d>0.7`.
- `is:relearn`, `is:buried-manually`, `is:buried-sibling` ve `sc:` (boşluk doldurma işaretlerini
  okuyarak arar) da çalışır. `mid:`, `did:`, `dupe:`, `has-cd:` gibi ileri terimler uygulamada
  gösterilmeyen numaralar istediği için çoğu kullanıcıya gerekmez.

<a id="search-combining"></a>
## Terimleri birleştirme

| Yazım | Anlamı | Örnek |
| --- | --- | --- |
| boşluk | Hepsi birden | `deck:Farmakoloji is:due` |
| `or` | Herhangi biri | `tag:antibiyotik or tag:antiviral` |
| `-` | Hariç tut | `-is:suspended` |
| `( )` | Gruplama | `deck:Farmakoloji (flag:1 or flag:2)` |
| `"…"` | Boşluklu değer veya ifade | `"deck:TUS Kartları"` |
| `\` | Sonraki karakteri düz metin yapar | `2\:1` |

Metindeki iki nokta üst üste bir alan araması başlatır: `2:1` yazarsanız "2" adlı bir alan aranır,
tırnak da bunu değiştirmez; oranları `2\:1` diye yazın. Yanlış yazılmış bir terim adı (`dekc:`) de
alan adı sayılır ve uyarı vermeden sonuçsuz kalır.

<a id="search-turkish"></a>
## Türkçe harfler
<!-- Uygulamada: Kartlarım boş sonuç ipucu help.browser.noResultsTip (yeni, app/browser.tsx:1050-1053) → bu bölüm -->

- Büyük/küçük harf fark etmez ve dört i biçimi (I, ı, İ, i) aynı sayılır: `isi`, "Isı" ve "İSİ"yi
  bulur.
- **ç, ğ, ö, ş, ü** karttaki gibi yazılmalıdır: `cografya`, "Coğrafya"yı bulmaz. Harf farkını yok
  saymak için kelimenin başına `nc:` ekleyin: `nc:cografya`. Alan aramasında: `front:nc:*cografya*`.
- Deste seçicideki **Desteleri filtrele** kutusu farklı çalışır: bu harfleri kendiliğinden yok sayar
  ve kelime başlarıyla eşleşir.

<a id="search-stored-names"></a>
## Not türü, alan ve kart adları

Türkçe arayüz hazır not türlerinin adlarını çevirir; arama ise kayıtlı (İngilizce) adları kullanır:

| Ekranda | Aramada |
| --- | --- |
| Temel | `note:Basic` |
| Temel (ve ters kart) | `note:"Basic (and reversed card)"` |
| Boşluklu | `note:Cloze` |
| **Ön** / **Arka** alanı | `front:` / `back:` |
| **Metin** alanı | `text:` |
| Kart 1, Kart 2 | `card:1`, `card:2` |

Kendi oluşturduğunuz not türleri ve alanlar düzenleyicide gördüğünüz adla aranır. Kartlarım'daki
konu adı (ör. "Genel") aranamaz.

<a id="search-differences"></a>
## Aramanın Anki'den farkları

> **Anki'den farkı:**
> - Büyük/küçük harf her terimde bütün alfabelerde yok sayılır ve dört i biçimi aynı sayılır; Anki
>   düz metinde yalnızca Latin harflerini katlar.
> - "Aramada aksanları yok say" ayarı yoktur; `nc:` kullanın.
> - `nc:` yalnızca aksan işaretlerini kaldırır; `ß` gibi harfler `ss` sayılmaz.
> - Düzenli ifadeler JavaScript söz dizimini izler; satır içi bayraklardan yalnızca baştaki `(?-i)`
>   (büyük/küçük harfe duyarlı) kabul edilir.
> - `dupe:` ilk alanı biçimlendirmesiz hâliyle tam olarak karşılaştırır.
> - `deck:current` Kartlarım'da deste seçicideki desteyi, başka yerlerde bütün koleksiyonu anlatır.
> - Türkçe arayüzde gördüğünüz not türü ve alan adları aranmaz; kayıtlı adları kullanın.

<a id="card-info"></a>
## Kart bilgisi
<!-- Uygulamada: Çalışma ekranı › ⋮ (Kart ve not seçenekleri) veya Araçlar › Kart bilgisi (components/CardOptionsMenu.tsx:360-362); ekranın ⓘ'si (yeni, app/card-info.tsx:207) → help.cardInfo.sheet → bu bölüm -->

Kart bilgisi, çalışırken ekrandaki kartın bütün ayrıntılarını gösterir. Çalışma ekranında üstteki
**⋮** düğmesine (ayarlarınıza göre dişli **Araçlar** düğmesine) dokunun ve **Kart bilgisi**'ni seçin.
Kartlarım'dan açılmaz. Kapatmak için aşağı kaydırın veya **Geri**'ye dokunun.

| Bölüm | Gösterdikleri |
| --- | --- |
| **Genel bilgi** | **Deste**, **Not türü**, **Oluşturulma** (notun eklendiği gün), **Değiştirilme** (kartın son değiştiği gün), **Kart ID** ve **Not ID** (aramada `cid:`, `nid:`) |
| **Etiketler ve bayrak** | Notun etiketleri ve kartın bayrağı (**Bayrak yok**) |
| **Zamanlama** | **Kart durumu** (Yeni, Öğrenme, Tekrar, Yeniden öğrenme), **Sıra** (şu an nerede beklediği: askıda, gömülü veya durumuyla aynı), **Sonraki gösterim**, **Aralık**, **Kolaylık** (yalnızca FSRS kapalıyken), **Tekrar sayısı**, **Unutma sayısı** |
| **FSRS hafıza durumu** | Aşağıya bakın |
| **Teknik bilgi** | **İlk çalışma**, **Son çalışma**, **Ortalama süre** ve **Toplam süre** (yalnızca gerçek cevaplar), **Kart şablonu** (#2 = notun ikinci kartı) |
| **Çalışma geçmişi** | Eskiden yeniye her kayıt: **Tarih**, **Yanıt**, **Aralık**, **Kolaylık**, **Süre**, **Tür** |

**FSRS hafıza durumu** kartın kayıtlı FSRS bilgisi varsa, ya da FSRS açıkken kart yeni değilse
görünür. Kayıtlı bilgi yoksa değerler tekrar geçmişinden hesaplanır; ekranı açmak kartı değiştirmez.

- **Hafıza gücü (stability):** Hatırlama olasılığınızın %90'a düşmesi için geçecek tahmini gün.
- **Zorluk:** %0–100; yüksek değer kartın sizin için zor olduğunu gösterir.
- **Hatırlanabilirlik:** Kartı şu anda hatırlama olasılığınız.
- **Hedeflenen hatırlama:** Kart için hedeflenen hatırlama oranı (0.90 = %90); karta kayıtlıysa görünür.

**Çalışma geçmişi**nde **Tür** sütunu **Öğrenme**, **Tekrar**, **Yeniden öğrenme**, **Filtrelenmiş**
veya **El ile** olur. **El ile** satırları vade ayarlama ve sıfırlama kayıtlarıdır; **Yanıt**
sütununda `0` görünür ve cevap sayılmaz. FSRS ile verilen cevaplarda **Kolaylık** sütunu kartın o
anki zorluğuna bağlı bir değer gösterir. Başlıktaki sayı bu kayıtların hepsini sayar.

Not **Sürekli Unutulan Kart** olarak etiketlendiyse en üstte **Sürekli Unutulan Kart nedir?**
kutusu çıkar. Bkz. [Temel kavramlar](02-key-concepts.md#leeches-and-siblings) ve [FSRS](07-fsrs.md).

## İlgili konular

- [Kart ekleme ve düzenleme](08-adding-and-editing.md)
- [Not türleri ve kart şablonları](09-note-types.md)
- [Filtrelenmiş deste ve özel çalışma](11-filtered-decks.md)
- [Çalışma ekranı](05-studying.md)
- [FSRS](07-fsrs.md)
