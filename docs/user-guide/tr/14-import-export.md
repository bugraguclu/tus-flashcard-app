---
id: import-export
title: İçe ve dışa aktarma
summary: Anki paketlerini ve CSV/TSV/TXT dosyalarını içe aktarma, desteleri ve koleksiyonu dışa aktarma, koleksiyonu yeni cihaza taşıma.
order: 14
web_path: /yardim/ice-disa-aktarma
app_help: help?article=import-export
app_screens:
  - "İçe aktar — app/import.tsx"
  - "İçe aktarma günlüğü — components/ImportLogView.tsx"
  - "Dışa aktar — app/export.tsx, components/DeckExportSelector.tsx"
  - "Dosya devri (Paylaş › TusAnkiM) — app/_layout.tsx; web: components/WebAppIntegrations.tsx"
  - "Ayarlar › Veri yönetimi › İçe ve dışa aktar — app/settings.tsx"
verified_against: master c6108e6 (2026-10-25)
---

# İçe ve dışa aktarma

Bu bölüm, başka bir yerde hazırlanmış kartları TusAnkiM'e almayı (içe aktarma) ve kendi
destelerinizi bir dosyaya kaydetmeyi (dışa aktarma) anlatır. TusAnkiM, Anki'nin `.apkg` ve
`.colpkg` paketleriyle ve CSV/TSV/TXT metin dosyalarıyla çalışır. Cihazlar arasında otomatik
eşitleme olmadığı için bir cihazdan diğerine geçerken de bu dosyaları kullanırsınız.

<a id="import"></a>
## İçe aktarma
<!-- Uygulamada: İçe aktar ekranı başlığındaki ⓘ (yeni, app/import.tsx:643-647) → help.import.sheet → "Daha fazla bilgi" → bu bölüm -->

**İçe aktar** ekranı bütün dosya türlerini içe aktarır. Açmak için:

- **Desteler** ekranında sağ üstteki **•••** düğmesi › **İçe aktar**
- **Ayarlar › Veri yönetimi › Deste ve verileri içe aktar**
- Ya da dosyayı başka bir uygulamadan TusAnkiM'e gönderin (bkz. [aşağıda](#open-from-files)).

1. **Dosya seç**'e dokunun ve dosyayı seçin.
2. Uygulama dosyanın türünü uzantısından anlar ve o türün seçeneklerini gösterir. Başka bir
   dosya seçmek için **Değiştir**'e dokunun.
3. Seçenekleri gözden geçirip alttaki **İçe aktar** düğmesine dokunun.
4. İşlem bitince **İçe aktarma günlüğü** açılır. **Tamamlandı** sizi önceki ekrana döndürür.

| Dosya | Ne olur? |
| --- | --- |
| `.apkg` | Deste paketi: desteler, not türleri, medya ve isteğe bağlı çalışma geçmişi koleksiyonunuza **eklenir**. Adı `.zip` olarak değişmiş paketler de böyle açılır. |
| `.colpkg` | Koleksiyon paketi: bütün koleksiyonunuzun **yerine geçer**. |
| `.csv`, `.tsv`, `.txt` | Metin dosyası: her satır bir not olur. |

Başka bir dosya seçerseniz **Bilinmeyen dosya biçimi** uyarısı çıkar. Büyük paketlerin içe
aktarılması zaman alabilir; düğmedeki gösterge dönerken uygulamayı açık tutun. Her paket içe
aktarmasından önce otomatik bir güvenlik yedeği alınır
(bkz. [Yedekler ve bakım](15-backups-and-maintenance.md#backup-safety)).

<a id="open-from-files"></a>
## Dosyalar, Mail veya AirDrop'tan açma
<!-- Uygulamada: dosya devri app/_layout.tsx:596-620; iOS belge türleri app.json:25-75; web sürükle-bırak components/WebAppIntegrations.tsx:58-116 -->

iPhone'da bir `.apkg`, `.colpkg`, `.csv`, `.tsv` veya `.txt` dosyasını doğrudan TusAnkiM'e
gönderebilirsiniz: **Dosyalar** uygulamasında dosyaya basılı tutun (Mail'de ekin, AirDrop'ta gelen
dosyanın üzerinde de aynı) ve **Paylaş**'a dokunup listeden **TusAnkiM**'i seçin. **Deste içe
aktar** ekranı dosya seçilmiş olarak açılır. `.zip` uzantılı bir paketi uygulamanın içinden
**Dosya seç** ile açın.

> **Web sürümünde:** Dosyayı tarayıcı penceresinin üzerine sürükleyip bırakın; **İçe aktarmak için
> bırakın** yazısı görünür. Uygulamayı bilgisayarınıza yüklediyseniz desteklenen dosyaları dosya
> yöneticinizin **Birlikte aç** menüsünden de açabilirsiniz.

<a id="import-apkg"></a>
## Deste paketi (.apkg)
<!-- Uygulamada: İçe aktar › İÇE AKTARMA SEÇENEKLERİ (.apkg) app/import.tsx:878-915 -->

Paylaşılan desteler ve Anki'den veya TusAnkiM'den dışa aktarılan desteler bu biçimdedir. Paketin
içeriği koleksiyonunuza eklenir; sizin kartlarınızdan hiçbiri silinmez. Seçenekler:

- **Çalışma ilerlemesini içe aktar** (açık): Kartlar paketteki tarihleri, aralıkları ve tekrar
  geçmişiyle gelir. Kapalıysa kartlar yeni kart olarak gelir ve yeni kartlarınızın sonuna eklenir;
  bayraklar, `marked` ve `leech` etiketleri ve paketin tekrar geçmişi alınmaz. Başkasının
  paylaştığı bir desteyi sıfırdan çalışmak istiyorsanız kapatın.
- **Deste ayarlarını içe aktar** (açık): Paketteki [ayar gruplarını](02-key-concepts.md#presets)
  getirir. Sizde aynı ayarlara sahip bir grup varsa o kullanılır. Kapalıysa yeni desteler
  varsayılan ayar grubuyla açılır; zaten var olan destelerinizin ayarları değişmez.
- **GÜNCELLEMELER › Notları güncelle** ve **Not türlerini güncelle**: Paketteki bir not veya not
  türü sizde de varsa ne olacağını seçer. **Yeniyse** (varsayılan): yalnızca paketteki sürüm
  sizinkinden sonra değiştirilmişse güncellenir. **Her zaman**: her durumda paketteki sürüm yazılır.
  **Asla**: sizdeki sürüm olduğu gibi kalır.

| Paketteki öğe | Ne olur? |
| --- | --- |
| Koleksiyonunuzda olmayan not | Kartlarıyla birlikte paketteki deste yapısına eklenir. Eksik üst desteler oluşturulur. |
| Sizde de olan not | **Notları güncelle** seçimine göre alanları ve etiketleri güncellenir. Var olan kartlarınızın çalışma durumu hiçbir seçimde değişmez; pakette yeni olan kartlar eklenir. |
| Sizde de olan ama not türü değişmiş not | Güncellenmez; günlükte **Not türü değişmiş olanlar** grubunda görünür. |
| Sizdekiyle aynı adlı deste | Kartlar sizin destenize eklenir (büyük/küçük harf fark etmez). |
| Aynı adlı ama yapısı farklı not türü | Paketin türü ayrı bir kopya olarak, adının sonuna `(Imported)` eklenerek gelir. |
| Medya dosyası | Kopyalanır. Aynı adlı ama içeriği farklı bir dosyanız varsa paketinki yeni bir adla eklenir ve notlar o dosyaya bağlanır. |

> **Anki'den farkı:** Not türlerini birleştirme seçeneği yoktur. Alanları veya kart şablonları
> değişmiş bir not türü sizinkiyle birleştirilmez; ayrı bir kopya olarak eklenir ve sizdeki notlar
> değişmeden kalır.

<a id="import-colpkg"></a>
## Koleksiyon paketi (.colpkg)
<!-- Uygulamada: İçe aktar › .colpkg uyarısı app/import.tsx:916-923; Koleksiyon değiştirilsin mi? onayı app/import.tsx:449-458 -->

Koleksiyon paketi, [koleksiyonunuzun](02-key-concepts.md#collection) tamamının yerine geçer:
desteler, notlar, kartlar, not türleri, ayar grupları ve tekrar geçmişi paketteki hâline döner.
Anki'de olduğu gibi koleksiyon kendi **Yeni gün başlangıcı**, ileriden öğrenme sınırı, zaman kutusu,
FSRS anahtarı ve günlük sınır kurallarını da getirir. Bu cihazdaki medya dosyaları, diğer uygulama
ayarlarınız, Kronometre kayıtlarınız ve yedekleriniz olduğu gibi kalır.

1. Dosyayı seçin. Seçenekler yerine bir uyarı görürsünüz.
2. **İçe aktar**'a dokunun; **Koleksiyon değiştirilsin mi?** sorusunu **Tamam** ile onaylayın.
3. Başlamadan önce bir güvenlik yedeği alınır. Vazgeçerseniz o yedeği **Yedekler** ekranından geri
   yükleyebilirsiniz (bkz. [Yedeği geri yükleme](15-backups-and-maintenance.md#restore)).

Koleksiyonunuzda okunamayan satırlar varsa işlem başlamadan durur ve **Önce onarın** uyarısı
çıkar. **Onar ve optimize et**'i çalıştırıp tekrar deneyin
(bkz. [Onar ve optimize et](15-backups-and-maintenance.md#repair)).

<a id="import-text"></a>
## Metin dosyaları (CSV, TSV, TXT)
<!-- Uygulamada: İçe aktar › metin dosyası seçenekleri app/import.tsx:708-876 -->

Metin dosyasında her satır bir not, her sütun bir alandır. Dosyayı Excel, Numbers veya Google
E-Tablolar ile hazırlayabilirsiniz:

- Türkçe karakterlerin doğru görünmesi için dosyayı **UTF-8** olarak kaydedin (Excel'de
  **CSV UTF-8** biçimi).
- İlk satırdaki "Soru, Cevap" gibi sütun başlıkları da not olarak eklenir. O satırı silin ya da
  başına `#` koyun; `#` ile başlayan satırlar not sayılmaz.
- `.tsv` dosyalarında sütunlar sekmeyle ayrılır. `.csv` ve `.txt` dosyalarında ayırıcıyı uygulama
  tahmin eder.

Dosyanın başına `#` ile başlayan satırlar yazarak seçenekleri önceden belirleyebilirsiniz:

| Satır | Ne yapar? |
| --- | --- |
| `#separator:tab` | Ayırıcıyı belirler: `tab`, `comma`, `semicolon`, `pipe`, `colon`, `space` veya karakterin kendisi. |
| `#html:true` | Alanlar HTML olarak okunur (kalın yazı, resim gibi). |
| `#deck:Farmakoloji` | Bu adda bir desteniz varsa **Deste** satırında seçili gelir. |
| `#notetype:Basic` | Bu adda bir not türünüz varsa seçili gelir. **Temel** türünün dosyadaki adı `Basic`'tir. |
| `#tags:deneme-1` | Bütün notlara etiket ekler. |
| `#tags column:3` | Etiketleri 3. sütundan okur. |
| `#deck column:4`, `#notetype column:5` | Her satırın destesini veya not türünü o sütundan okur. Olmayan desteler oluşturulur. |
| `#guid column:1` | Her notun benzersiz kimliğini o sütundan okur; yeniden içe aktarmada aynı not güncellenir. |
| `#columns:…` | Sütunlara ad verir; adı bir alanınkiyle aynı olan sütun o alana eşlenir. |
| `#if matches:keep current`, `#match scope:notetype + deck` | **Mevcut notlar** ve **Eşleşme kapsamı** seçimlerini önceden ayarlar. |

Örnek bir dosya (sütunlar sekmeyle ayrılmıştır):

```
#separator:tab
#html:false
#tags column:3
Atropinin etki mekanizması?	Muskarinik reseptör antagonisti	farmakoloji
```

<a id="import-options"></a>
## Metin içe aktarma seçenekleri
<!-- Uygulamada: İÇE AKTARMA SEÇENEKLERİ app/import.tsx:710-778; ALAN EŞLEMESİ 780-839; ÖNİZLEME 841-874 -->

- **Alanları ayıran:** Uygulama ayırıcıyı tahmin eder ve satırda **(tahmin)** yazar. Önizlemede
  sütunlar yanlış bölünmüşse buradan **Virgül**, **Noktalı virgül**, **Sekme** gibi doğru ayırıcıyı
  seçin. Metninizde iki nokta (`:`) veya noktalı virgül varsa tahmin yanılabilir.
- **Alanlarda HTML'e izin ver:** Kapalıyken metin yazıldığı gibi görünür, satır sonları korunur.
  Açıkken `<b>` gibi etiketler biçimlendirme olarak okunur. Dosyada HTML varsa kendiliğinden açılır.
- **Not türü** ve **Deste:** Notların hangi türle ve hangi desteye ekleneceği. Deste listesinden
  yeni bir deste de oluşturabilirsiniz. Dosya bunları bir sütundan veriyorsa satırda **Dosyadan
  (sütun N)** yazar.
- **Mevcut notlar:** Aynı not türünde ilk alanı aynı olan bir not (dosyada kimlik sütunu varsa aynı
  kimlikli not) sizde zaten varsa: **Güncelle** (varsayılan) dosyadaki içeriği yazar; eşlenmemiş
  alanlar ve etiket sütunu yoksa etiketleriniz korunur. **Koru** satırı atlar. **Kopyala** yine de
  yeni not ekler.
- **Eşleşme kapsamı:** **Not türü** bütün destelerde eşleşme arar; **Not türü ve deste** yalnızca
  seçtiğiniz destede kartı olan notları eşleşmiş sayar.
- **Tüm notları etiketle** ve **Güncellenen notları etiketle:** Etiketleri boşlukla ayırarak yazın.
  İkincisi yalnızca güncellenen notlara eklenir; örneğin `guncellendi-ekim`.
- **ALAN EŞLEMESİ:** Her sütunun hangi alana gideceğini seçin; **Etiketler** sütunu etiket olarak
  okunur, **Yok sayıldı** sütunu alınmaz. İlk alan bir sütuna eşlenmelidir. Bir alan yalnızca bir
  sütundan gelebilir. En fazla 24 sütun gösterilir.
- **ÖNİZLEME:** İlk 5 satırın nasıl bölündüğünü gösterir.

**İçe aktar**'a dokunduğunuzda var olan notlardan bazıları güncellenecekse uygulama önce
**Mevcut notlar güncellensin mi?** sorusuyla kaç notun ekleneceğini, güncelleneceğini ve
atlanacağını gösterir ve onayınızdan sonra bir güvenlik yedeği alır. Yalnızca yeni not ekleyen bir
içe aktarma yedek almaz.

<a id="import-log"></a>
## İçe aktarma günlüğü
<!-- Uygulamada: components/ImportLogView.tsx:84-197; paket satırları app/import.tsx:532-586 -->

İçe aktarma bitince dosyada kaç not bulunduğu, kaçının eklendiği ve kaçının atlandığı yazar. Her
grup başlığına dokunarak açıklamasını ve metin dosyalarında o gruptaki notları (grup başına ilk
200 not) görebilirsiniz.

| Grup | Anlamı |
| --- | --- |
| **Eklenen notlar** | Yeni not olarak eklendi. |
| **Güncellenen notlar** | Var olan bir not dosyadaki içerikle güncellendi. |
| **Zaten mevcut olanlar** | Koleksiyonunuzda zaten vardı; değiştirilmedi. |
| **İlk alanı eşleşenler** | İlk alanı var olan bir notla aynıydı: **Koru** seçiliyken atlandı, **Kopyala** seçiliyken yine de eklendi. |
| **Not türü değişmiş olanlar** | Eşleşen not başka bir not türünde olduğu için güncellenmedi. |
| **Not türü bulunamayanlar** | Satırın istediği not türü koleksiyonunuzda yok; atlandı. |
| **İlk alanı boş olanlar** | İlk alan boş olduğu için kart üretilemedi; atlandı. |

Paketlerde günlük yalnızca sayıları gösterir; tek tek notlar listelenmez. Ek satırlar kaç kartın
ilerlemesiyle geldiğini, kaç tekrar kaydının ve medya dosyasının eklendiğini söyler. Turuncu
satırlar dikkat ister: atlanan medya dosyaları, ya da paketin deste ve not türü bilgisi
okunamadığı için notların basit not türleriyle içe aktarıldığı durum.

<a id="export"></a>
## Dışa aktarma
<!-- Uygulamada: Dışa aktar ekranı başlığındaki ⓘ (yeni, app/export.tsx:228-232) → help.export.sheet → "Daha fazla bilgi" → bu bölüm -->

**Dışa aktar** ekranını açmanın dört yolu vardır:

- **Desteler › ••• › Dışa aktar:** Bütün desteler seçili gelir.
- Bir destenin satırındaki **•••** › **Desteyi dışa aktar:** O deste ve alt desteleri seçili gelir.
- **Ayarlar › Veri yönetimi › Verileri dışa aktar.**
- **Kartlarım** ekranında kartları seçip **Diğer** › **Kartları dışa aktar** (notlar görünümünde
  **Notları dışa aktar**). Seçtiğiniz kartların notlarındaki diğer kartlar da dosyaya eklenir.

1. **Dışa aktarma biçimi**ni seçin (aşağıda).
2. Deste paketi veya metin dosyası için **Dışa aktarılacak desteler** listesinde desteleri
   işaretleyin. Bir üst desteye dokunmak alt destelerini de seçer; **Tümünü seç** ve **Temizle**
   hepsini birden değiştirir. Koleksiyon paketi her zaman koleksiyonun tamamıdır, listesi yoktur.
3. **Dahil et** seçeneklerini belirleyin (aşağıda) ve **Dışa aktar**'a dokunun. iPhone'da paylaşım sayfası açılır: dosyayı **Dosyalar'a Kaydet** ile
   saklayabilir, AirDrop veya Mail ile gönderebilirsiniz. Ekranda kaç not, kart ve medya dosyasının
   dışa aktarıldığı yazar.

TUS Kartları paketi ve filtrelenmiş desteler bu listede yer almaz. Dışa aktarılan dosya
şifrelenmez; yalnızca güvendiğiniz kişilere ve yerlere gönderin.

> **Web sürümünde:** Dosya bilgisayarınıza indirilir. Telefon veya tablet tarayıcısında paylaşım
> sayfası açılabilir.

<a id="export-formats"></a>
## Dışa aktarma biçimleri
<!-- Uygulamada: Dışa aktarma biçimi seçici app/export.tsx:260-264, liste 352-365 -->

| Biçim | İçinde ne var? | Ne zaman kullanılır? |
| --- | --- | --- |
| **Anki Koleksiyon Paketi (.colpkg)** | Bütün koleksiyon; çalışma ilerlemesi, tekrar geçmişi, ayar grupları, koleksiyon ayarları ve bütün medya dosyalarıyla. | Yeni cihaza geçerken. **Kartlarım** ekranından açıldığında yoktur. |
| **Anki Deste Paketi (.apkg)** | Seçtiğiniz desteler veya kartlar, kullandıkları not türleri ve medya. | Bir desteyi paylaşırken veya bir bölümünü taşırken. |
| **Düz Metin Notları (.txt)** | Her not bir satırda, alanlar sekmeyle ayrılmış, başta `#` satırları. | Tabloda düzenleyip geri içe aktarmak için. |
| **Düz Metin Kartları (.txt)** | Her kart bir satırda: soru ve cevap, kartta göründüğü hâliyle. | Okumak veya yazdırmak için; not türü bilgisi taşımaz. |

Dosya adı seçime göre verilir: bütün koleksiyon için `koleksiyon.colpkg`, bir deste için destenin
adı, **Kartlarım** seçimi için `secili-kartlar.apkg`; metin dosyalarında adın sonuna `-notlar` veya
`-kartlar` eklenir.

<a id="export-options"></a>
## Dahil edilecekler
<!-- Uygulamada: Dahil et: app/export.tsx:266-326 -->

Paketlerde:

- **Medyayı dahil et** (açık): Kartlarınızın kullandığı ve bu cihazda bulunan resim ve ses
  dosyaları pakete eklenir.
- **Çalışma programını dahil et** (yalnızca .apkg; açık, ekran tek bir desteden açıldığında
  kapalı): Açıkken kartlar ilerlemeleri, tekrar
  geçmişleri ve bayraklarıyla gider. Kapalıyken kartlar yeni kart olarak gider; geçmiş, bayraklar,
  `marked` ve `leech` etiketleri çıkarılır. Kendi ilerlemenizi taşırken açın, desteyi başkasıyla
  paylaşırken kapalı bırakın.
- **Deste ayarlarını dahil et** (yalnızca .apkg, kapalı): Destelerin ayar grupları da pakete girer.
- **Eski Anki sürümlerini destekle** (kapalı): Paketi, 2.1.50'den eski Anki sürümlerinin de
  açabileceği biçimde yazar.
- **.colpkg** her zaman ilerleme, ayar grupları ve koleksiyon ayarlarıyla birlikte dışa aktarılır.

Metin dosyalarında:

- **HTML ve medya referanslarını dahil et** (açık): Kapalıyken alanlar düz metne çevrilir; resim
  ve ses referansları çıkarılır.
- **Düz Metin Notları** için ayrıca **Etiketleri dahil et** (açık), **Deste adını dahil et**, **Not
  türü adını dahil et** ve **Benzersiz kimliği dahil et** (kapalı). Benzersiz kimlik açıkken dosyayı
  sonradan geri içe aktardığınızda aynı notlar güncellenir, kopyaları oluşmaz.

Dışa aktarılan dosyalar Anki'nin yazdığı gibi yazılır; bir dosya TusAnkiM ile Anki arasında
istediğiniz kadar gidip gelse de içindeki hiçbir şey değişmez.

<a id="move-to-new-device"></a>
## Koleksiyonu yeni bir cihaza taşıma
<!-- Uygulamada: Dışa aktar (colpkg) app/export.tsx; İçe aktar (colpkg) app/import.tsx:449-458 -->

TusAnkiM cihazlar arasında eşitleme yapmaz; koleksiyonu bir dosyayla taşırsınız.

1. Eski cihazda **Desteler › ••• › Dışa aktar**'ı açın. Bütün desteler seçili kalsın, biçim
   **Anki Koleksiyon Paketi (.colpkg)** ve **Medyayı dahil et** açık olsun.
2. **Dışa aktar**'a dokunun. Paylaşım sayfasında AirDrop ile yeni cihaza gönderin ya da
   **Dosyalar'a Kaydet** ile iCloud Drive'a kaydedin.
3. Yeni cihazda TusAnkiM'i kurun, dosyayı **Paylaş › TusAnkiM** ile açın, **İçe aktar**'a
   dokunun ve **Koleksiyon değiştirilsin mi?** sorusunu onaylayın.
4. Destelerinizi ve birkaç kartı kontrol edin. Eski cihazdaki koleksiyonu ancak bundan sonra silin.

Taşınanlar: desteler, notlar, kartlar, not türleri, ayar grupları, medya, çalışma ilerlemeniz ve
tekrar geçmişiniz. Taşınmayanlar: uygulama ayarları (dil, tema, bildirimler), Kronometre kayıtları,
yedekler ve TUS Kartları paketi. Paketi yeni cihazda yeniden kurarsınız; paketteki kartların
çalışma durumu bu yolla taşınmaz.

Yeni cihazda daha önce kart eklediyseniz onlar silinir. Önce o desteleri **.apkg** olarak dışa
aktarın, taşımadan sonra geri içe aktarın. Eski cihazdaki bir yedeği taşımak için de aynı yolu
kullanırsınız (bkz. [Yedeği paylaşma](15-backups-and-maintenance.md#share-backup)). Anki'den
geçiyorsanız [Anki ile birlikte kullanma](19-using-with-anki.md) bölümüne bakın.

> **Anki'den farkı:** AnkiWeb hesabıyla eşitleme yoktur. Taşıma her zaman bir dosyayla yapılır ve
> hedef cihazdaki koleksiyonun yerine geçer.

<a id="share-with-others"></a>
## Bir desteyi başkasıyla paylaşma

1. Destenin satırındaki **•••** › **Desteyi dışa aktar**'a dokunun. Biçim **Anki Deste Paketi
   (.apkg)** olarak gelir.
2. **Çalışma programını dahil et** kapalı kalsın; alıcı desteyi sıfırdan çalışır. **Medyayı dahil
   et** açık olsun.
3. **Dışa aktar**'a dokunun ve dosyayı gönderin.

Alıcı dosyayı TusAnkiM'de **İçe aktar** ile açabilir; Anki de bu paketleri açar. Kişisel not
veya etiket içeren desteleri paylaşmadan önce gözden geçirin. TUS Kartları paketindeki desteler
paylaşılamaz.

<a id="limits"></a>
## Sınırlar
<!-- Uygulamada: boyut uyarısı app/import.tsx:268-278; sınırlar lib/importApkg.ts:43-58, lib/importApkgMedia.ts:19-25, lib/archiveSecurity.ts:7-10, app/import.tsx:59-66 -->

| Ne? | Sınır |
| --- | --- |
| Deste veya koleksiyon paketi | En fazla 400 MB |
| Paketteki tek bir medya dosyası | En fazla 100 MB; daha büyükler atlanır ve günlükte belirtilir |
| Paketteki bütün dosyalar | Açıldığında toplam 2 GB ve 200.000 dosya |
| Paketteki kayıtlar | 1 milyon not, 2 milyon kart, 5 milyon tekrar kaydı |
| Metin dosyası | En fazla 50 MB |
| Önizleme ve alan eşlemesi | İlk 5 satır; en fazla 24 sütun |

Sınırı aşan bir dosya için **Dosya güvenli boyut sınırını aşıyor.** uyarısı çıkar ve
koleksiyonunuz değişmez. TUS Kartları paketinden kart içeren bir dosya içe aktarılamaz; paket
yalnızca uygulamanın içinden kurulur (bkz. [TUS Kartları paketi](17-tus-card-pack.md)). **Yedekler**
ekranındaki yedekler bu ekrandan değil, kendi ekranlarından geri yüklenir.

## İlgili konular

- [Yedekler ve bakım](15-backups-and-maintenance.md)
- [Anki ile birlikte kullanma](19-using-with-anki.md)
- [Desteler](04-decks.md)
- [Not türleri ve kart şablonları](09-note-types.md)
- [Kartlarım ve arama](10-browser-and-search.md)
