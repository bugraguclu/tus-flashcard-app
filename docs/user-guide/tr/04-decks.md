---
id: decks
title: Desteler
summary: Deste listesi ve sayıların anlamı; deste ve alt deste oluşturma, taşıma, silme, deste menüsü, genel bakış ve deste kısayolu.
order: 4
web_path: /yardim/desteler
app_help: help?article=decks
app_screens:
  - "Desteler sekmesi — app/(tabs)/decks.tsx"
  - "Deste satırı ve sütunlar — components/decks/DeckListTable.tsx"
  - "Genel bakış — app/deck-overview.tsx"
  - "Deste seçici — components/DeckPickerModal.tsx"
  - "Kenar çubuğu (yalnızca geniş web penceresi) — components/Sidebar.tsx"
verified_against: master c6108e6 (2026-10-25)
---

# Desteler

Uygulama her açılışta **Desteler** ekranıyla başlar. Burada bütün destelerinizi ve bugün
çalışabileceğiniz kart sayılarını görür, bir desteye dokunarak çalışmaya başlarsınız. Deste
oluşturma, adlandırma, taşıma ve silme de bu ekrandan yapılır.

<a id="deck-list"></a>
## Deste listesi
<!-- Uygulamada: Desteler › sütun başlığındaki ⓘ (yeni, components/decks/DeckListTable.tsx:22) → help.decks.sheet "Daha fazla bilgi" → bu bölüm -->

Ekranı yukarıdan aşağıya şöyle okursunuz:

- **Başlık:** **Desteler** yazısı, sayıları yeniden hesaplayan **↻** düğmesi ve sağ üstte
  **⋮** (Diğer seçenekler) düğmesi.
- **Sütun başlıkları:** **DESTE**, **Yeni**, **Öğrenme**, **Tekrar**.
- **Deste satırları.** Her satırda soldan sağa:
  - alt destesi olan destelerde açma/kapama oku (alt destesi yoksa küçük bir nokta),
  - destenin adı,
  - üç sayı (bkz. [Sayılar ne anlama gelir?](#deck-counts)),
  - **⠿** taşıma tutamacı,
  - **•••** deste menüsü.
- **＋ düğmesi** sağ altta: deste, filtrelenmiş deste veya kart ekler.
- **Alt çubuk:** **Kartlarım**, **İstatistik**, **Ayarlar**.

Alt destelerin açık veya kapalı durumu hatırlanır; uygulamayı yeniden açtığınızda liste aynı
görünür. Filtrelenmiş desteler eğik ve mavi yazıyla, adlarının solunda **⧉** işaretiyle görünür.

**TUS Kartları paketi** kurulu değilse listenin en üstünde kesik çizgili, kilitli bir satır
görürsünüz: **TUS Kartları**, altında "9.575 kart · 12 ders · 106 alt deste" ve **Ücretsiz aç**.
Satıra dokunduğunuzda paket ekranı açılır. Bkz. [TUS Kartları paketi](17-tus-card-pack.md).

İlk açılışta listede bir de **Varsayılan** destesi bulunur. Kart eklerken deste seçmezseniz kartlar
buraya gider.

<a id="deck-counts"></a>
## Sayılar ne anlama gelir?
<!-- Uygulamada: help.decks.sheet (Desteler sütun başlığı ⓘ ve Genel bakış sayılar kartı ⓘ) "Daha fazla bilgi" → bu bölüm -->

| Sütun | Gösterdiği |
| --- | --- |
| **Yeni** | Destede henüz hiç görmediğiniz kartların **tamamı**. |
| **Öğrenme** | Şu anda veya birkaç dakika içinde sırası gelecek öğrenme ve yeniden öğrenme kartları, ayrıca bugün vadesi gelen ve bir günden uzun adımı olan öğrenme kartları. |
| **Tekrar** | Bugün vadesi gelen veya geciken tekrar kartları; bugünkü tekrar limitinizden geriye kalan kadar. |

- Üst destenin satırı alt destelerinin kartlarını da sayar.
- Askıya alınmış ve gömülü kartlar sayılmaz.
- Bir kart filtrelenmiş bir desteye alındıysa kendi destesinin sayısından düşülür ve filtrelenmiş
  destenin satırında görünür.
- Sayılar ekran her açıldığında yeniden hesaplanır. Liste açıkken bir öğrenme kartının sırası
  gelirse **↻** ile yenileyin.
- "Birkaç dakika", **Ayarlar**'daki **Önceden öğrenme sınırı** kadardır (varsayılan 20 dakika).

> **Anki'den farkı:** TusAnkiM'de yeni kartlar için günlük sınır yoktur. Bu yüzden **Yeni**
> sütunu destedeki yeni kartların hepsini gösterir; TUS Kartları paketinde bu sayı binlerce
> olabilir. **Tekrar** sütunu ise Anki'deki gibi günlük tekrar limitine göre kesilir.
> Bkz. [Deste seçenekleri](06-deck-options.md#daily-limits).

<a id="open-and-study"></a>
## Bir desteyi açmak ve çalışmak

Deste adına dokunun: çalışma ekranı o desteyle açılır. Üst bir desteye dokunursanız alt
destelerinin kartları da gelir. Geri düğmesiyle veya ekranın sol kenarından kaydırarak listeye
dönersiniz; açtığınız alt desteler ve listedeki yeriniz korunur.

Destenin açıklamasını, bugünkü sayılarını ve gömülü kartlarını görmek isterseniz önce
**••• › Genel bakış**'ı açın (bkz. [Genel bakış](#deck-overview)).

> **Anki'den farkı:** Anki masaüstünde desteye tıklamak önce özet ekranını açar. TusAnkiM'de,
> AnkiMobile'da olduğu gibi, dokunduğunuz anda çalışma başlar.

Çalışma ekranının kendisi için bkz. [Çalışma ekranı](05-studying.md).

<a id="create-deck"></a>
## Deste oluşturmak

1. Sağ alttaki **＋** düğmesine dokunun.
2. **Deste oluştur**'u seçin.
3. **Deste adı** alanına adı yazın ve **Oluştur**'a dokunun.

- Adın içine `::` yazarsanız alt deste oluşur: `Farmakoloji::Antibiyotikler`, **Farmakoloji**'nin
  altında açılır. Henüz olmayan üst desteler de birlikte oluşturulur.
- Aynı adda bir deste zaten varsa (büyük/küçük harf farkı gözetilmez) yeni deste açılmaz; mevcut
  deste kullanılır.
- Yeni deste kardeşlerinin en sonuna eklenir ve varsayılan ayar grubuyla başlar. Farklı limit ve
  adımlar için bkz. [Deste seçenekleri](06-deck-options.md#presets).

Kart eklerken, içe aktarırken veya kart taşırken açılan deste seçicilerden de yeni deste
oluşturabilirsiniz (bkz. [Deste seçici](#deck-picker)).

<a id="subdecks"></a>
## Alt desteler

Bir desteyi başka bir destenin altına üç yolla koyarsınız:

- Adına `::` yazarak (oluştururken veya yeniden adlandırırken),
- **••• › Alt deste oluştur** ile,
- **⠿** tutamacıyla sürükleyip bir destenin ortasına bırakarak (bkz. [Taşımak](#rename-and-move)).

Bir üst desteyi çalıştığınızda alt destelerinin kartları da gelir. Yeni bir alt deste, üst
destenin ayar grubunu almaz; varsayılan ayar grubuyla başlar.

Filtrelenmiş desteler alt deste olamaz ve altlarına deste alamaz. TUS Kartları paketinin
destelerinin altına kendi destenizi koyamazsınız.

<a id="add-menu"></a>
## ＋ menüsü

Sağ alttaki **＋** üç seçenek açar. Menüyü kapatmak için ekranın boş bir yerine dokunun.

- **Filtrelenmiş deste oluştur:** Bir aramaya uyan kartları geçici bir destede toplar.
  Bkz. [Filtrelenmiş deste oluşturmak](11-filtered-decks.md#create-filtered-deck).
- **Deste oluştur:** Bkz. [Deste oluşturmak](#create-deck).
- **Kart ekle:** Kart ekleme ekranını açar. Kart, en son çalıştığınız desteye gider; böyle bir
  deste yoksa (veya bu bir TUS Kartları destesiyse) **Varsayılan**'a. Desteyi ekranda
  değiştirebilirsiniz. Bkz. [Kart ekleme ve düzenleme](08-adding-and-editing.md).

<a id="more-menu"></a>
## Diğer seçenekler (⋮)

Sağ üstteki **⋮** düğmesi koleksiyonun tamamıyla ilgili işlemleri açar:

- **Boş kartlar:** Şablonu artık bir şey göstermeyen kartları bulur ve temizler.
  Bkz. [Boş kartlar](15-backups-and-maintenance.md#empty-cards).
- **Deste içe aktar:** `.apkg`, `.colpkg` ve metin dosyalarını getirir.
  Bkz. [İçe ve dışa aktarma](14-import-export.md).
- **Dışa aktar:** Desteleri veya koleksiyonu dosya olarak kaydeder.
- **Yedek oluştur** ve **Yedekten geri yükle:** İkisi de **Yedekler** ekranını açar. Yedeği orada
  adlandırıp alır veya bir yedeği geri yüklersiniz.
  Bkz. [Yedekler ve bakım](15-backups-and-maintenance.md).
- **Yardım:** Bu kılavuzu açar.
  <!-- Önerilen giriş noktası: in-app/01-decks.md › help.decks.more.help. Uygulanmazsa bu maddeyi kaldırın. -->

<a id="deck-menu"></a>
## Deste menüsü (•••)

Her satırın sağındaki **•••** o deste için bir menü açar. Menünün başlığında destenin tam yolu
yazar (örneğin "Farmakoloji › Antibiyotikler"). Hangi maddelerin görüneceği deste türüne bağlıdır:

| Madde | Ne yapar? | Nerede görünür? |
| --- | --- | --- |
| **Genel bakış** | Destenin özet ekranını açar. | Hepsi |
| **Ekle** | Bu desteye kart ekleme ekranını açar. | Filtrelenmiş desteler hariç |
| **Kartlara göz at** | **Kartlarım**'ı bu deste ve alt desteleriyle açar. | Hepsi |
| **Desteyi yeniden adlandır** | Bkz. [Yeniden adlandırmak](#rename-and-move). | TUS Kartları hariç |
| **Alt deste oluştur** | Bu destenin altına deste ekler. | Normal kendi desteleriniz |
| **Deste seçenekleri** | Limitler, adımlar, ayar grubu. Bkz. [Deste seçenekleri](06-deck-options.md). | Filtrelenmiş desteler hariç |
| **Özel çalışma** | Bkz. [Özel çalışma](11-filtered-decks.md#custom-study). | Filtrelenmiş desteler hariç |
| **Desteyi dışa aktar** | Dışa aktarma ekranını bu desteyle açar. | Normal kendi desteleriniz |
| **Filtre seçenekleri**, **Yeniden oluştur**, **Desteyi boşalt** | Bkz. [Filtrelenmiş deste](11-filtered-decks.md#rebuild-and-empty). | Yalnızca filtrelenmiş desteler |
| **Kısayol oluştur** | Bkz. [Deste kısayolu](#deck-shortcut). | Hepsi |
| **Açıklamayı düzenle** | Bkz. [Deste açıklaması](#deck-description). | TUS Kartları hariç |
| **Desteyi sil** | Bkz. [Deste silmek](#delete-deck). | TUS Kartları hariç |

TUS Kartları paketinin desteleri korunur: yeniden adlandırılamaz, taşınamaz, silinemez ve dışa
aktarılamaz.

<a id="rename-and-move"></a>
## Yeniden adlandırmak ve taşımak

**Yeniden adlandırmak:** **••• › Desteyi yeniden adlandır**'ı seçin, **Yeni ad** alanını değiştirin
ve **Yeniden adlandır**'a dokunun. Yalnızca destenin kendi adı değişir; bulunduğu üst deste ve alt
desteleri aynı kalır. Yeni adın içine `::` yazarsanız deste bulunduğu yerde bir düzey daha içeri
girer. Aynı yerde aynı adlı bir deste varsa ad kabul edilmez ve bunu söyleyen bir mesaj çıkar.

**Taşımak:** Bir desteyi başka bir üst desteye veya ana seviyeye götürmek için **⠿** tutamacını
kullanın:

1. Satırın **⠿** tutamacına dokunun ve parmağınızı kaldırmadan sürükleyin.
2. Bırakacağınız yeri seçin:
   - bir satırın **üst kenarı**: o destenin üstüne yerleşir,
   - **alt kenarı**: altına yerleşir,
   - **ortası**: o destenin alt destesi olur.
3. Kapalı bir üst destenin ortasında bir an beklerseniz açılır; daha derindeki desteye
   ulaşabilirsiniz.
4. Bir alt desteyi ana seviyeye çıkarmak için listenin üstünde beliren
   **↑ Ana seviyeye bırak** şeridine bırakın.

Sürüklerken ne olacağı ekranda yazar; örneğin "Anatomi, Patoloji destesinin alt destesi olacak".
Ekranın üst veya alt kenarına yaklaşınca liste kendiliğinden kayar. Taşınan deste alt desteleriyle
birlikte gider. Hedefte aynı adlı bir deste varsa taşınan destenin adına " (1)" eklenir.

Filtrelenmiş desteler ve TUS Kartları desteleri sürüklenemez; tutamaçları soluk görünür. Taşımanın
geri alma düğmesi yoktur: yanlış yere bıraktıysanız desteyi yeniden sürükleyin.

> **Anki'den farkı:** Anki masaüstü desteleri her zaman alfabetik sıralar. TusAnkiM'de aynı
> düzeydeki desteleri sürükleyerek istediğiniz sıraya koyabilirsiniz; yeni desteler en sona
> eklenir.

> **Web sürümünde:** Sürükleme fareyle de çalışır. Tutamacın üzerinde durunca bırakma kuralları
> ipucu olarak görünür.

<a id="delete-deck"></a>
## Deste silmek

1. **••• › Desteyi sil**'i seçin.
2. Uyarıyı okuyun ve **Tamam**'a dokunun.
3. **Deste silindi** penceresinde kaç kartın silindiği yazar. Vazgeçtiyseniz hemen
   **Geri al**'a dokunun; **Bitti** dediğinizde geri alma artık mümkün değildir.

Silinenler: deste, bütün alt desteleri ve içlerindeki kartlar; kartı kalmayan notlar da silinir.
Başka bir destede kardeş kartı olan notlar korunur. Tekrar geçmişiniz silinmez.

- Filtrelenmiş bir desteyi silmek kartlarınızı silmez; kartlar kendi destelerine döner.
  Bkz. [Filtrelenmiş desteyi silmek](11-filtered-decks.md#delete-filtered-deck).
- **Varsayılan** destesi tamamen kaldırılamaz: kartları ve alt desteleri silinir, deste boş olarak
  **Default** adıyla kalır.
- TUS Kartları desteleri silinemez. Paketi kaldırmak için bkz.
  [TUS Kartları paketi](17-tus-card-pack.md).

> **Dikkat:** Silmeden önce otomatik yedek alınmaz. Büyük bir desteyi silmeden önce
> **⋮ › Yedek oluştur** ile bir yedek alın. Bkz. [Yedekler ve bakım](15-backups-and-maintenance.md).

<a id="deck-overview"></a>
## Genel bakış
<!-- Uygulamada: Desteler › ••• › Genel bakış (app/(tabs)/decks.tsx:1443) ve Genel bakış sayılar kartı ⓘ (yeni, app/deck-overview.tsx:219) → bu bölüm -->

**••• › Genel bakış** destenin özet ekranını açar. Filtrelenmiş deste veya Özel çalışma
oturumu oluşturduğunuzda, Çalışma Takvimi ve Kronometre'deki bir oturumdan "Bu desteye git"
dediğinizde de bu ekran açılır.

Yukarıdan aşağıya:

- Destenin adı ve (alt desteyse) tam yolu; varsa **DESTE AÇIKLAMASI**.
- Bugünkü **Yeni**, **Öğrenme** ve **Tekrar** sayıları; destenin kendi limitleriyle hesaplanır.
- Gömülü kart varsa **💤 … gömülü kartı şimdi aç**. Hem elle gömdüğünüz hem kardeşi yüzünden
  gömülen kartlar varsa hangisini açmak istediğiniz sorulur. Gömülü kartlar normalde bir sonraki
  çalışma gününde kendiliğinden geri gelir (bkz. [Temel kavramlar](02-key-concepts.md#study-day)).
- **Şimdi çalış · … kart** (hazır kart yoksa **Çalışma ekranını aç**). Çalışma bitince geri
  düğmesi sizi deste listesine götürür.
- **Özel çalışma**, **Deste seçenekleri** ve **Deste istatistikleri** düğmeleri.

Sağ üstteki **•••** bu ekranda doğrudan **Deste seçenekleri**'ni açar. Filtrelenmiş destelerin
genel bakışında bunların yerine kayıtlı arama ve **Yeniden oluştur**, **Boşalt**, **Filtre
seçenekleri** düğmeleri vardır; bkz.
[Yeniden oluşturmak ve boşaltmak](11-filtered-decks.md#rebuild-and-empty).

<a id="deck-description"></a>
## Deste açıklaması

**••• › Açıklamayı düzenle** ile desteye bir not yazabilirsiniz; örneğin hangi kaynaktan
hazırlandığı. Açıklama **Genel bakış**'ta **DESTE AÇIKLAMASI** kutusunda düz metin olarak görünür.
Alanı boşaltıp kaydederseniz kutu kaybolur.

Anki'den gelen destelerin açıklaması çoğu zaman biçimlidir (HTML). Genel bakış bunu okunur düz
metne çevirir: satır sonları ve madde işaretleri kalır, diğer biçimler gösterilmez. Düzenleme
alanında ise açıklamanın HTML kodlarını görürsünüz.

<a id="deck-shortcut"></a>
## Deste kısayolu
<!-- Uygulamada: Desteler › ••• › Kısayol oluştur (app/(tabs)/decks.tsx:1486) → bu bölüm; 18-shortcuts-and-automation.md buraya bağlanır -->

Sık çalıştığınız bir desteyi tek dokunuşla açmak için:

1. **••• › Kısayol oluştur**'u seçin.
2. iPhone'un kestirme ekleme penceresi destenin adıyla açılır. Pencereyi onaylayın.
3. **Kestirme eklendi** mesajı çıkar. Kestirme artık **Kestirmeler** uygulamasındadır.

Kestirmeyi çalıştırdığınızda TusAnkiM doğrudan o destenin çalışma ekranıyla açılır. Pencereyi
kapatırsanız hiçbir şey değişmez. Kestirmeyi Siri'yle veya ana ekrandan çalıştırmak için bkz.
[Kısayollar ve otomasyon](18-shortcuts-and-automation.md).

> **Web sürümünde:** **Kısayol oluştur** desteyi açan bir bağlantıyı panoya kopyalar. Bağlantıyı
> yer imi olarak kaydedebilirsiniz.

<a id="deck-picker"></a>
## Deste seçici

Bir deste seçmeniz gereken her yerde (çalışma ekranı, kart ekleme, **Kartlarım**, İstatistikler,
içe aktarma, Deste seçenekleri, filtrelenmiş deste) aynı pencere açılır:

- Üzerinde çalıştığınız deste listenin başında ve açık gelir; diğer desteler deste listesindeki
  sırayla durur.
- **Büyüteç** ile arama yaparsınız. Arama kelimelerin başına bakar, büyük/küçük harf ve Türkçe
  karakter farkını önemsemez ve destenin tam yolunda arar: `tus anatomi` yazmak
  "TUS Kartları › Anatomi"yi bulur.
- **＋** ile yeni deste oluşturursunuz. Deste oluşturulur ve seçilir; bulunduğunuz ekrandan
  ayrılmazsınız. Aynı adda bir deste varsa o deste seçilir. Adın içine `::` yazarak alt deste
  oluşturabilirsiniz.
- Bazı yerlerde listenin başında **Tüm desteler** veya **Tüm koleksiyon** satırı bulunur.

<a id="navigation"></a>
## Uygulamada gezinme

- Uygulama her zaman **Desteler** ile açılır. Diğer ekranlardan sol üstteki geri düğmesiyle veya
  ekranın sol kenarından kaydırarak dönersiniz.
- Alt çubuktaki **Kartlarım** bütün koleksiyonu açar. Yalnızca bir desteye bakmak için
  **••• › Kartlara göz at**'ı kullanın. Bkz. [Kartlarım ve arama](10-browser-and-search.md).
- **İstatistik** bütün koleksiyonun istatistiklerini açar; bir destenin istatistikleri için
  **Genel bakış › Deste istatistikleri**. **Kronometre** İstatistikler ekranındaki **Günlük seri**
  kartından, **Çalışma Takvimi** de Kronometre'den açılır. Bkz. [İstatistikler](12-statistics.md) ve
  [Kronometre ve çalışma takvimi](13-stopwatch-and-calendar.md).
- **Not türleri** kart ekleme ekranındaki not türü seçicisinden, **Not türlerini yönet…** ile
  açılır. Bkz. [Not türleri ve kart şablonları](09-note-types.md).

> **Web sürümünde:** Pencere en az 768 piksel genişse çalışma ekranının solunda kalıcı bir kenar
> çubuğu görünür. Üstteki **TusAnkiM** yazısı Desteler'e döner. Ortada çalıştığınız destenin
> ağacı (rozetler toplam kart sayısını gösterir) veya deste seçili değilken **Tüm dersler** ve
> dersler bulunur. Altta **Kartlarım**, **İstatistik**, **Kronometre**, **Çalışma Takvimi**,
> **Desteler** ve **Ayarlar** düğmeleri vardır. iPhone'da bu çubuk yoktur.

## İlgili konular

- [Çalışma ekranı](05-studying.md)
- [Deste seçenekleri](06-deck-options.md)
- [Filtrelenmiş deste ve özel çalışma](11-filtered-decks.md)
- [TUS Kartları paketi](17-tus-card-pack.md)
- [İçe ve dışa aktarma](14-import-export.md)
- [Kısayollar ve otomasyon](18-shortcuts-and-automation.md)
