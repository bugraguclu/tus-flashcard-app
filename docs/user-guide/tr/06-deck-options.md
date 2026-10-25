---
id: deck-options
title: Deste seçenekleri
summary: Tekrar limiti, öğrenme adımları, unutulan kartlar, kartların sırası, gömme, ses, zamanlayıcılar ve ayar grupları.
order: 6
web_path: /yardim/deste-secenekleri
app_help: help?article=deck-options
app_screens:
  - "Deste seçenekleri — app/deck-options.tsx"
  - "Ayar rehberi sayfaları (kartlardaki ? düğmeleri) — components/deck-options/SettingControls.tsx, components/deck-options/deckOptionsCopy.ts"
  - "Ayar grubu seçici, ad penceresi ve ••• menüsü — components/deck-options/PresetModals.tsx"
verified_against: master c6108e6 (2026-10-25)
---

# Deste seçenekleri

Deste seçenekleri bir destenin nasıl çalışılacağını belirler: günde en fazla kaç tekrar kartı
geleceğini, yeni kartları hangi aralıklarla öğreneceğinizi, unuttuğunuz kartlara ne olacağını ve
kartların hangi sırayla geleceğini. FSRS ayarları da bu ekrandadır; onlar ayrı bir sayfada
anlatılır: [FSRS](07-fsrs.md).

<a id="open-deck-options"></a>
## Deste seçeneklerini açmak

- **Desteler** sekmesinde destenin satırındaki **•••** düğmesine, sonra **Deste seçenekleri**'ne
  dokunun.
- Destenin genel bakış ekranında sağ üstteki **•••** düğmesine veya sayfadaki **Deste
  seçenekleri** düğmesine dokunun.
- Çalışırken üst çubuktaki dişli simgesine veya **⋮** menüsündeki **Deste seçenekleri**'ne
  dokunun. Bu yol ekrandaki kartın destesini açar; bir üst desteyi çalışıyorsanız bu, kartın
  bulunduğu alt deste olabilir.
- Günün tekrar limiti dolduğunda çalışma ekranında çıkan **Tekrar limitini artır** düğmesi ekranı
  tekrar limiti alanı seçili olarak açar.

Başlığın altında destenin tam adı yazar. Üstteki **Deste** kutusundan ekrandan çıkmadan başka bir
desteye geçebilirsiniz. Filtrelenmiş destelerde bu ekran yoktur; onların **Filtre seçenekleri**
vardır. Bkz. [Filtrelenmiş deste ve özel çalışma](11-filtered-decks.md).

Her ayar kartının başlığındaki **?** düğmesi kısa bir **AYAR REHBERİ** açar. **Anladım**'a dokunarak
veya sayfayı aşağı çekerek kapatırsınız. Geniş ekranlarda (iPad, web) kartlar iki sütunda dizilir.

<a id="presets"></a>
## Ayar grupları
<!-- Uygulamada: Deste seçenekleri › Ayar grubu satırının yanındaki yeni ? düğmesi (app/deck-options.tsx:1103-1120) açılan bilgi sayfasının "Daha fazla bilgi" bağlantısı → bu bölüm. Temel kavramlar (02-key-concepts.md#presets) buraya bağlanır. -->

Ayarlar desteye tek tek değil, adı olan bir **ayar grubuna** kaydedilir. **Ayar grubu** satırı
grubun adını ve onu kaç destenin kullandığını gösterir (örneğin **12 deste**). Kaydettiğiniz bir
değişiklik o grubu kullanan bütün destelere uygulanır.

Bazı değerler gruba değil desteye aittir: **Bu deste** ve **Yalnızca bugün** tekrar limitleri,
destenin kendi hedeflenen hatırlama oranı ve **Deste açıklaması**. **Limitler en üst desteden
başlasın** ve FSRS anahtarı ise bütün koleksiyon için geçerlidir.

Desteyi başka bir gruba geçirmek için **Ayar grubu** satırına dokunun ve listeden bir grup seçin.
Ekran yeni grubun değerlerini gösterir; deste **Kaydet**'e bastığınızda bu gruba geçer.

**•••** menüsündeki komutlar:

| Komut | Ne yapar? | Ne zaman uygulanır? |
| --- | --- | --- |
| **Ayar grubu ekle** | Varsayılan değerlerle yeni bir grup açar; adını siz verirsiniz. Bu deste yeni gruba geçer. | Hemen |
| **Bu deste için ayrı ayar grubu oluştur** | Seçili grubun kayıtlı hâlini "‹deste adı› ayarları" adıyla kopyalar ve yalnızca bu desteye verir. | Hemen |
| **Ayar grubunu yeniden adlandır** | Grubun adını değiştirir. | Hemen |
| **Varsayılana dön** | Gruptaki çalışma ayarlarını, FSRS değerleri dahil, varsayılana döndürür. Grubu kullanan bütün desteleri etkiler; grubun adı, destelerin kendi limitleri ve açıklamaları korunur. | Onayladığınızda |
| **Sil** | Grubu siler; onu kullanan desteler varsayılan gruba döner. Kaydetmeden çıkarsanız grup kalır. | **Kaydet**'e bastığınızda |
| **Kaydet ve tüm alt destelere uygula** | Kaydeder, sonra bütün alt desteleri bu gruba geçirir (aşağıya bakın). | Hemen |

Kaydedilmemiş değişiklikleriniz varsa **Ayar grubu ekle** ve **Bu deste için ayrı ayar grubu
oluştur** önce onay ister; onaylarsanız bu değişiklikler bırakılır. Varsayılan ayar grubu (yeni bir
koleksiyonda adı **TUS Kartları**) silinemez. Yeni oluşturduğunuz desteler, üst destenin grubunu
değil bu grubu kullanır.

**Kaydet ve tüm alt destelere uygula** onay sormadan kaydeder. Ardından destenin her düzeydeki alt
destesi bu gruba geçer ve tekrar limiti için seçili sekme onlara da uygulanır: **Bu deste** veya
**Yalnızca bugün** sekmesindeyseniz bu destenin değerleri kopyalanır, **Ayar grubu** sekmesindeyseniz
alt destelerin kendi limitleri kaldırılır. Filtrelenmiş desteler etkilenmez. Sonunda kaç alt
destenin gruba geçtiği gösterilir.

**Örnek:** Farmakoloji ve Patoloji aynı grubu kullanıyor. Patoloji'nin öğrenme adımlarını
değiştirmek, Farmakoloji'yi olduğu gibi bırakmak istiyorsanız Patoloji'nin seçeneklerinde
**••• › Bu deste için ayrı ayar grubu oluştur**'a dokunun, adımları değiştirin ve **Kaydet**'e basın.

<a id="daily-limits"></a>
## Günlük limitler
<!-- Uygulamada: Deste seçenekleri › Günlük limitler kartının ? düğmesi (app/deck-options.tsx:1146; düğme components/deck-options/SettingControls.tsx:38-51) açılan rehberin "Daha fazla bilgi" bağlantısı → bu bölüm. Çalışma ekranındaki "Tekrar limitini artır" düğmesi (app/(tabs)/index.tsx:3297-3306) bu ekranı açar. -->

> **Anki'den farkı:** TusAnkiM'de yeni kartlar için günlük sınır yoktur; bu bilinçli bir ürün
> kararıdır. Çalışmak istediğiniz kadar yeni kart açabilirsiniz. Anki'den gelen bir destedeki yeni
> kart limiti uygulanmaz, yalnızca dışa aktarırken korunur. Tekrar kartlarının günlük limiti ise
> Anki'deki gibi çalışır.

**Günlük en fazla tekrar** (varsayılan 200), bir çalışma gününde gösterilecek en fazla tekrar
kartını belirler. Adımı ertesi güne kalan öğrenme kartları da bu limitten sayılır. Limit dolunca
kalan kartlar silinmez, ertesi gün gelir. Çalışma ekranı kaç tekrarın beklediğini yazar ve **Tekrar
limitini artır** düğmesini gösterir.

Limitin üç sekmesi vardır:

- **Ayar grubu:** Grubu kullanan bütün destelerin ortak değeri.
- **Bu deste:** Yalnızca bu destenin kalıcı değeri. Boş bırakırsanız grubun değeri geçerli olur.
- **Yalnızca bugün:** Yalnızca bugüne ait değer. Bir sonraki çalışma gününde, yani **Sonraki günün
  başlangıcı** saatinde kendiliğinden kalkar. Bkz. [Temel kavramlar](02-key-concepts.md#study-day).

Kaydederken hangi sekmede olduğunuz önemlidir: **Ayar grubu** sekmesinde kaydederseniz bu destenin
kendi ve bugünlük değerleri kaldırılır; **Bu deste** sekmesinde kaydederseniz bugünlük değer
kaldırılır. Ekran o an geçerli olan sekmede açılır; çalışma ekranından açtığınızda **Bu deste**
sekmesinde açılır.

**Örnek:** Patoloji'de bugün 320 tekrar birikti ve hepsini bitirmek istiyorsunuz. **Yalnızca bugün**
sekmesinde 320 yazıp **Kaydet**'e basın; yarın grubun değeri yeniden geçerli olur. Aynı işi
**Özel çalışma › Bugünkü tekrar kart limitini artır** ile de yapabilirsiniz.

<a id="limits-from-top"></a>
### Alt desteler ve "Limitler en üst desteden başlasın"

Bir kart, kendi destesinin ve çalıştığınız üst destelerin limitinden sayılır. Bir üst desteyi
çalıştığınızda onun limiti bütün alt destelerin toplamını sınırlar; her alt destenin kendi limiti
de ayrıca geçerlidir.

**Limitler en üst desteden başlasın** (varsayılan kapalı, bütün ayar grupları için geçerli):

- **Kapalıyken** bir alt desteyi doğrudan açtığınızda yalnızca o alt destenin ve onun alt
  destelerinin limitleri uygulanır.
- **Açıkken** üst destelerin limitleri de uygulanır; deste listesindeki sayılar da buna göre
  gösterilir.

**Örnek:** Farmakoloji'nin limiti 100, Farmakoloji::Antibiyotikler'in limiti 80 ve bugün
Farmakoloji'nin başka alt destelerinde 50 tekrar yaptınız. Anahtar kapalıyken Antibiyotikler'i
doğrudan açarsanız 80 tekrar gelebilir; açıkken en fazla 50 gelir.

<a id="new-cards"></a>
## Yeni kartlar
<!-- Uygulamada: Deste seçenekleri › Yeni kartlar kartının ? düğmesi (app/deck-options.tsx:1168) "Daha fazla bilgi" → bu bölüm -->

- **Öğrenme adımları** (varsayılan `1m 10m`): Yeni kart mezun olmadan önce hangi aralıklarla
  gösterilsin. Adımları boşlukla yazın; birimler `s` (saniye), `m` (dakika), `h` (saat), `d` (gün),
  birimsiz sayı dakikadır: `1m 10m`, `10m 1h`, `30s 5m 1d`. Boş bırakırsanız öğrenme adımı olmaz.
- Çalışırken **Tekrar** düğmesi kartı ilk adıma döndürür, **İyi** bir sonraki adıma geçirir. Son
  adımda **İyi** kartı mezun eder; **Kolay** kalan adımları atlar.
- **Mezuniyet aralığı (gün)** (varsayılan 1): Son adımda **İyi**'ye bastığınızda kartın ilk
  tekrar aralığı.
- **Kolay aralığı (gün)** (varsayılan 4): Öğrenmedeki bir kartta **Kolay**'a bastığınızda verilen
  aralık. Mezuniyet aralığından uzun tutun.
- **Ekleniş sırası:** **Sıralı** (varsayılan) veya **Rastgele**.

Adımları değiştirdiğinizde öğrenmedeki kartlar baştan başlamaz; geçtikleri adıma karşılık gelen
yerden devam eder. FSRS açıkken iki aralık alanı gizlenir; ilk aralığı FSRS seçer.

> **Anki'den farkı:** Anki'de **Ekleniş sırası** yeni kartların konum numaralarını değiştirir.
> TusAnkiM konum numaralarına dokunmaz. **Rastgele** seçiliyse ve **Yeni kart toplama sırası**
> **Deste** ise yeni kartlar her gün karışık bir sırayla gelir; sıra gün içinde aynı kalır.

<a id="lapses"></a>
## Unutmalar
<!-- Uygulamada: Deste seçenekleri › Unutmalar kartının ? düğmesi (app/deck-options.tsx:1199) "Daha fazla bilgi" → bu bölüm. Temel kavramlar (02-key-concepts.md#leeches-and-siblings) buraya bağlanır. -->

Daha önce öğrendiğiniz bir kartta **Tekrar** düğmesine basmak **unutma** sayılır.

- **Yeniden öğrenme adımları** (varsayılan `10m`): Unutulan kart kısa aralıklarla yeniden
  gösterilir. Boş bırakırsanız kart yeniden öğrenmeye girmez, hemen yeni aralığını alır.
- **En az aralık (gün)** (varsayılan 1): Yeniden öğrenme bitince kartın alabileceği en kısa aralık.
  Yeni aralığın eski aralığın ne kadarı olacağı **Gelişmiş** kartındadır. FSRS açıkken gizlenir.
- **Sürekli unutulan kart eşiği** (varsayılan 8): Kart bu sayıda unutulunca **Sürekli Unutulan
  Kart** olarak işaretlenir, sonra eşiğin yarısı kadar unutmada bir yeniden (8 için 12., 16. …).
  Notuna `leech` etiketi eklenir.
- **Eşiğe ulaşıldığında:** **Yalnızca etiketle** (varsayılan) veya **Etiketle ve askıya al**.
  Askıya alınan kart, siz geri açana kadar çalışmada gelmez.

Bu kartları **Kartlarım**'da `tag:leech` aramasıyla bulabilirsiniz. Böyle bir kartı daha sık görmek
yerine kısaltmak, ikiye bölmek veya yeniden yazmak çoğu zaman daha çok işe yarar. Bkz.
[Kartlarım ve arama](10-browser-and-search.md).

<a id="fsrs"></a>
## FSRS
<!-- Uygulamada: Deste seçenekleri › FSRS kartı (app/deck-options.tsx:1236). Kartın ? rehberindeki "Daha fazla bilgi" FSRS makalesine gider: help?article=fsrs&section=what-is-fsrs -->

**FSRS** kartındaki **FSRS zamanlayıcısını kullan** anahtarı, aralıkları klasik zamanlayıcı yerine
FSRS'in hesaplamasını sağlar. Anahtar bütün koleksiyon için geçerlidir; altındaki değerler bu ayar
grubuna aittir. FSRS açıkken **Mezuniyet aralığı**, **Kolay aralığı**, **En az aralık** ve
**Gelişmiş** kartındaki çarpanlar gizlenir; kayıtlı değerleri korunur. Ayrıntılar:
[FSRS](07-fsrs.md).

<a id="display-order"></a>
## Görüntüleme sırası
<!-- Uygulamada: Deste seçenekleri › Görüntüleme sırası kartının ? düğmesi (app/deck-options.tsx:1356) "Daha fazla bilgi" → bu bölüm -->

Uygulama önce bugün hangi yeni kartların geleceğini **toplar**, sonra kartları **sıralar**. Bu
seçenekler kartların vadesini değiştirmez; yalnızca bugün hangi sırayla geleceklerini belirler.

- **Yeni kart toplama sırası:** **Deste** (varsayılan; deste listesindeki sırayla, alt deste alt
  deste), **Deste, sonra rastgele notlar**, **Artan konum** (önce eklenen önce), **Azalan konum**
  (son eklenen önce), **Rastgele notlar**, **Rastgele kartlar**. Rastgele seçenekler gün içinde
  aynı karışımı korur.
- **Yeni kart sıralaması:** Toplanan kartların sırası. Varsayılan **Kart türü, sonra toplanma
  sırası**: örneğin ön → arka kartlar, ters kartlardan önce gelir.
- **Yeni / tekrar sırası:** **Tekrarlarla karıştır** (varsayılan), **Tekrarlardan önce göster**
  veya **Tekrarlardan sonra göster**.
- **Gün aşan öğrenme / tekrar sırası:** Aynı üç seçenek, adımı ertesi güne kalan öğrenme kartları
  için.
- **Tekrar sıralaması:** Vadesi gelmiş tekrarlardan hangisinin önce geleceği. Varsayılan **Zamanı
  gelen, sonra rastgele**. FSRS açıkken kolaylık sıralarının yerinde zorluk sıraları ve
  **Hatırlanabilirlik artan / azalan** seçenekleri görünür. FSRS'i kapatırsanız hatırlanabilirlik
  sırası **Göreli gecikmişlik** olur.

Bir üst desteyi çalıştığınızda bütün alt destelerin kartları üst destenin ayar grubundaki sırayla
gelir.

> **Anki'den farkı:** Yeni kartların günlük sınırı olmadığı için iki seçenek farklı çalışır.
> **Tekrarlarla karıştır** bir tekrar, bir yeni kart sırasıyla ilerler. **Tekrarlardan önce göster**
> seçiliyken her çalışma gününün ilk 200 yeni kartı tekrarlardan önce gelir; sonra tekrarlar,
> ardından kalan yeni kartlar gelir. Böylece tekrarlara her gün sıra gelir.

<a id="burying"></a>
## Gömme
<!-- Uygulamada: Deste seçenekleri › Gömme kartının ? düğmesi (app/deck-options.tsx:1425) "Daha fazla bilgi" → bu bölüm -->

Aynı nottan çıkan kartlara **kardeş** denir (bkz. [Temel kavramlar](02-key-concepts.md#notes-and-cards)).
Gömme açıkken bir kardeş gösterildiğinde, seçtiğiniz türdeki diğer kardeşler ertesi çalışma gününe
kadar gizlenir; böylece biri diğerinin cevabını ele vermez.

- **Yeni kardeş kartları göm**, **Tekrar kardeş kartları göm** ve **Gün aşan öğrenme kardeşlerini
  göm** birbirinden bağımsızdır; üçü de varsayılan olarak kapalıdır.
- Öğrenmedeki bir kart, yeni veya tekrar kardeşi yüzünden gömülmez.
- Gömülen kart silinmez, askıya da alınmaz; ertesi gün kendiliğinden gelir. Hemen geri getirmek
  için destenin genel bakış ekranındaki **💤 N gömülü kartı şimdi aç** düğmesini kullanın. Bkz.
  [Desteler](04-decks.md).

<a id="audio"></a>
## Ses
<!-- Uygulamada: Deste seçenekleri › Ses kartının ? düğmesi (app/deck-options.tsx:1435) "Daha fazla bilgi" → bu bölüm -->

- **Sesi otomatik oynat** (varsayılan açık): Kartın bir yüzü açılınca o yüzdeki ses başlar. Bunun
  için **Ayarlar › İnceleme › Gelişmiş › Sesi otomatik oynat** da açık olmalıdır.
- **Ses oynatma hızı** (varsayılan **1.0x**): Bu gruptaki kartların seslerinin hızı, **0.75x** ile
  **2.0x** arası.
- **Cevabı yeniden oynatırken soruyu atla** (varsayılan kapalı): Cevap tarafında sesi yeniden
  oynattığınızda soru yüzünün sesleri çalmaz. Otomatik oynatmayı etkilemez.

Ses, zamanlayıcı ve otomatik ilerleme ayarları kartın bulunduğu destenin ayar grubundan okunur.

<a id="timers"></a>
## Zamanlayıcılar
<!-- Uygulamada: Deste seçenekleri › Zamanlayıcılar kartının ? düğmesi (app/deck-options.tsx:1459) "Daha fazla bilgi" → bu bölüm -->

- **En fazla cevap süresi** (varsayılan 60 sn): Bir cevap için istatistiklere en fazla bu kadar
  süre yazılır; ekran zamanlayıcısı da burada durur. On dakikanın üzerindeki değerlerde, ara
  verdiğiniz süre de çalışma süresi sayılabilir.
- **Ekran zamanlayıcısını göster** (varsayılan kapalı): Çalışırken kartta geçen süreyi gösterir.
- **Cevap gösterilince ekran zamanlayıcısını durdur** (varsayılan kapalı): Yalnızca görünen sayacı
  dondurur; istatistiğe yazılan süre cevap düğmesine basana kadar sayılır.

<a id="auto-advance"></a>
## Otomatik ilerleme
<!-- Uygulamada: Deste seçenekleri › Otomatik ilerleme kartının ? düğmesi (app/deck-options.tsx:1470) "Daha fazla bilgi" → bu bölüm -->

Otomatik ilerleme, belirlediğiniz süre dolunca cevabı açar ve sonra seçtiğiniz işlemi yapar.
Yalnızca **Ayarlar › Yeni çalışma ekranı › Yanıt düğmeleri › Otomatik ilerleme** açıkken çalışır;
süreler bu karttan gelir. İki süre de 0 ise hiçbir şey olmaz.

- **Soruyu gösterme süresi** ve **Cevabı gösterme süresi** (saniye, varsayılan 0): `0` o aşamayı
  kapatır; `2,5` gibi ondalık yazabilirsiniz.
- **Soru süresi dolunca:** **Cevabı göster** (varsayılan) veya **Yalnızca süre uyarısı göster**.
- **Cevap süresi dolunca:** **Kartı göm** (varsayılan), **Tekrar olarak yanıtla**, **Zor olarak
  yanıtla**, **İyi olarak yanıtla** veya **Yalnızca süre uyarısı göster**.
- **Sesin bitmesini bekle** (varsayılan açık): O yüzdeki ses bitmeden işlem yapılmaz.

Bir menü veya çizim alanı açıkken ya da uygulama arka plandayken süre durur. Otomatik verilen
cevaplar normal bir cevap gibi tekrar geçmişine yazılır.

**Örnek:** Soruyu 8, cevabı 5 saniye gösterip iki işlemde de **Yalnızca süre uyarısı göster**'i
seçerseniz uygulama sizin yerinize cevap vermez; yalnızca sürenin dolduğunu hatırlatır.

<a id="easy-days"></a>
## Kolay günler
<!-- Uygulamada: Deste seçenekleri › Kolay günler kartının ? düğmesi (app/deck-options.tsx:1523) "Daha fazla bilgi" → bu bölüm -->

Haftanın her günü için bir düğme vardır (**Pzt** … **Paz**). Dokundukça **Normal** → **Azaltılmış**
→ **Yok** arasında değişir. Azaltılmış ve Yok günlerde, yeni hesaplanan aralıkların vadesi yakın
günlere biraz kaydırılır. Klasik zamanlayıcıda da FSRS'te de çalışır.

- Mevcut vadeler yerinde kalır; değişiklik bundan sonra hesaplanan aralıklara uygulanır. FSRS
  açıkken **Değişiklikte kartları yeniden zamanla** ile mevcut vadeleri de taşıyabilirsiniz.
- En az bir gün **Normal** kalmalıdır.
- Bütün günleri aynı seviyeye indirmek toplam yükü azaltmaz; yalnızca dağılımı değiştirir.

**Örnek:** Cumartesileri deneme sınavına giriyorsanız **Cmt**'yi **Azaltılmış** yapın; o güne
düşecek tekrarların bir bölümü komşu günlere kayar.

<a id="advanced"></a>
## Gelişmiş
<!-- Uygulamada: Deste seçenekleri › Gelişmiş kartının ? düğmesi (app/deck-options.tsx:1549) "Daha fazla bilgi" → bu bölüm -->

- **En fazla aralık (gün)** (varsayılan 36500): Hiçbir tekrar aralığı bundan uzun olmaz. 180
  günün altındaki değerler iyi bildiğiniz kartları da sık getirir.

Aşağıdakiler yalnızca FSRS kapalıyken görünür; FSRS açıkken yerlerinde kısa bir açıklama durur:

| Ayar | Varsayılan | Aralık | Ne yapar? |
| --- | --- | --- | --- |
| **Başlangıç kolaylığı** | 2,50 | 1,31–5,00 | Mezun olan kartın ilk kolaylık çarpanı. |
| **Kolay bonusu** | 1,30 | 1,00–5,00 | **Kolay** cevabının aralığa eklediği ek çarpan. |
| **Zor aralık çarpanı** | 1,20 | 0,50–1,30 | **Zor** cevabından sonraki aralığın çarpanı. |
| **Aralık düzenleyici** | 1,00 | 0,50–2,00 | Bütün tekrar aralıklarına uygulanan genel çarpan. |
| **Yeni aralık (%) — unutma sonrası** | 0 | 0–100 | Unutulan kartın eski aralığından korunan pay; 0'da kart en az aralıktan başlar. |

Anki'den aktardığınız bir destede bu aralıkların dışında bir değer varsa, siz değiştirmedikçe olduğu
gibi kalır. Ne yaptığınızdan emin değilseniz varsayılanları koruyun.

<a id="deck-description"></a>
## Deste açıklaması

Bu alan desteye aittir. Yazdığınız not destenin genel bakış ekranında **DESTE AÇIKLAMASI**
başlığıyla, çalışma ekranında da kart yokken iki satır olarak görünür. **Kaydet** ile kaydedilir.
Aynı metni **Desteler** sekmesindeki **••• › Açıklamayı düzenle** ile de değiştirebilirsiniz.

<a id="saving"></a>
## Kaydetme

- Değişiklikler **Kaydet**'e basınca uygulanır. Düğme üstte, **Deste** kutusunun yanındadır; **•••**
  menüsünün ilk satırı da aynı işi yapar. Kaydedilecek bir şey yoksa düğmede **Kaydedildi** yazar.
- **Ayar grubu** satırının altındaki durum satırı ne olduğunu söyler: **Kaydedilmemiş değişiklikler
  var.**, **N alanı düzeltmeniz gerekiyor.** veya kaydın sonucu.
- Geçersiz bir değer (örneğin izin verilen aralığın dışında) alanın altında kırmızıyla yazılır ve
  düzeltilene kadar kaydedilmez. Uyarı kutuları ise kaydetmeyi engellemez (aşağıya bakın).
- Kaydetmeden çıkmak, başka desteye veya gruba geçmek isterseniz uygulama sorar. **Tamam**
  değişiklikleri bırakır, **İptal** ekranda kalır.
- Kaydettiğiniz ayarlar deste listesinde ve çalışma ekranında hemen geçerli olur. FSRS açıkken bazı
  kayıtlar kartların hafıza durumunu yeniden hesapladığı için biraz sürebilir.

Ayar grubu komutlarının bazıları **Kaydet** beklemeden uygulanır; bkz. [Ayar grupları](#presets).

<a id="warnings"></a>
## Uyarı kutuları

Bazı alanların altında renkli bir kutu çıkar. Bunlar öneridir, kaydetmeyi engellemez:

| Uyarı | Ne zaman çıkar? |
| --- | --- |
| Son öğrenme adımı mezuniyet aralığından uzun | Klasik zamanlayıcıda son adım, mezuniyet aralığından uzunsa. |
| Kolay aralığı mezuniyet aralığından kısa | **Kolay**, kartı **İyi**'den daha erken getirecekse. |
| FSRS açıkken bir gün veya daha uzun adımlar önerilmez | FSRS açıkken son öğrenme veya yeniden öğrenme adımı 1 gün ya da daha uzunsa. |
| Son yeniden öğrenme adımı en az aralıktan uzun | Klasik zamanlayıcıda **En az aralık** bu kartlar için bir şey değiştirmeyecekse. |
| Rastgele ekleme | **Ekleniş sırası** **Rastgele** seçildiğinde (bilgi). |
| Düşük / yüksek hedef | Hedeflenen hatırlama oranı 0,80'in altında veya 0,95'in üstündeyse. |
| Parametreler bir aydan uzun süredir optimize edilmedi | Son optimizasyondan 30 gün geçtiyse (bilgi). |
| On dakikanın üzerindeki süreler | **En fazla cevap süresi** 600 saniyeden uzunsa. |
| En az bir gün Normal kalmalı | Kolay günlerde hiç **Normal** gün kalmadıysa. |
| Değişiklik yalnızca bundan sonra hesaplanan aralıkları etkiler | Kolay günleri değiştirdiğinizde (bilgi). |
| En fazla aralık kısa | **En fazla aralık** 180 günden kısaysa; 50'nin altında kırmızı. |

## İlgili konular

- [Temel kavramlar](02-key-concepts.md)
- [Desteler](04-decks.md)
- [Çalışma ekranı](05-studying.md)
- [FSRS](07-fsrs.md)
- [Kartlarım ve arama](10-browser-and-search.md)
- [Filtrelenmiş deste ve özel çalışma](11-filtered-decks.md)
- [Ayarlar](16-settings.md)
