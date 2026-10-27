---
id: backups
title: Yedekler ve bakım
summary: Otomatik ve elle yedekler, geri yükleme, medya denetimi, veritabanı onarımı, boş kartlar ve koleksiyonu sıfırlama.
order: 15
web_path: /yardim/yedekler
app_help: help?article=backups
app_screens:
  - "Yedekler — app/backups.tsx"
  - "Yedekler › Medyayı denetle — components/backups/MediaCheckSection.tsx"
  - "Yedeği dışa aktar — app/export.tsx (?backup=…)"
  - "Ayarlar › Veri yönetimi (Yedekleme, Bakım) — app/settings.tsx"
  - "Boş kartlar — app/empty-cards.tsx"
verified_against: master c6108e6 (2026-10-25)
---

# Yedekler ve bakım

TusAnkiM koleksiyonunuzun yedeğini bu cihazda kendiliğinden alır. **Yedekler** ekranında yedekleri
görür, elle yedek alır, geri yükler veya bir yedeği dosya olarak dışa aktarırsınız. Bakım araçları
koleksiyondaki tutarsızlıkları bulur ve onarır.

**Yedekler** ekranını açmak için **Desteler** ekranında sağ üstteki **•••** › **Yedek oluştur** ya
da **Yedekten geri yükle**'ye dokunun (ikisi de aynı ekranı açar) veya **Ayarlar › Veri yönetimi ›
Yedekleri yönet** yolunu izleyin.

<a id="automatic-backups"></a>
## Otomatik yedekler
<!-- Uygulamada: Yedekler ekranı başlığındaki ⓘ (yeni, app/backups.tsx:208-212) ve Ayarlar › Veri yönetimi › Yedekleme grubunun ? düğmesi (yeni, app/settings.tsx:1544) → help.backups.sheet → bu bölüm -->

- Koleksiyonda bir değişiklik olduysa uygulama **30 dakikada bir** yedek alır. Uygulamayı açtığınızda
  veya ona geri döndüğünüzde de, son yedeğin üzerinden 30 dakika geçtiyse bir yedek alınır.
- Siz kart çalışırken yedek alınmaz; yedek, çalışma ekranından çıktığınızda veya uygulamayı arka
  plana aldığınızda alınır.
- Bugün ve dün alınan yedeklerden en yeni 24'ü saklanır. Daha eskilerden, yedek bulunan son 12
  günün her birinden, son 10 haftanın her birinden ve son 9 ayın her birinden birer yedek kalır;
  diğerleri kendiliğinden silinir.
- Otomatik yedeği kapatmak için **Ayarlar › Veri yönetimi › Otomatik yedekleme** anahtarını kapatın
  ve sağ üstteki **Kaydet**'e dokunun. Elle aldığınız yedekler ve riskli işlemlerden önceki
  güvenlik yedekleri yine alınır.

| Yedekte olanlar | Yedekte olmayanlar |
| --- | --- |
| Desteler, notlar, kartlar, not türleri, ayar grupları | Resim ve ses gibi medya dosyaları |
| Çalışma ilerlemesi ve tekrar geçmişi | TUS Kartları paketinin kendisi |
| Uygulama ayarları ve Kronometre kayıtları | |
| TUS Kartları paketindeki kartlarda ilerlemeniz ve etiketleriniz | |

Yedekler uygulamanın içinde, yalnızca bu cihazda durur; **Dosyalar** uygulamasında görünmez.
Uygulamayı silerseniz yedekler de silinir (bkz. [aşağıda](#delete-app-warning)).

> **Anki'den farkı:** Yedekler medya dosyalarını içermez ve doğrudan dosya olarak alınamaz. Bir
> yedeği cihaz dışına çıkarmak için **Paylaş** ile onu bir pakete çevirirsiniz
> (bkz. [Yedeği paylaşma](#share-backup)).

> **Web sürümünde:** Yedekler tarayıcının kendi deposunda tutulur. Uygulama birkaç sekmede açıksa
> otomatik yedeği yalnızca değişiklikleri kaydeden sekme alır. Tarayıcının site verilerini
> silerseniz yedekler de silinir.

<a id="back-up-now"></a>
## Elle yedek alma
<!-- Uygulamada: Yedekler › YEDEK ADI ve Şimdi yedekle app/backups.tsx:214-235 -->

1. **Yedekler** ekranında **YEDEK ADI** kutusuna bakın. Kutuda tarih ve saatten oluşan bir ad
   önerilir, örneğin `tus-backup-2026-10-25-143012345.json`.
2. İsterseniz adı değiştirin, örneğin `deneme-sinavi-oncesi`. Sonuna `.json` yazmanız gerekmez.
3. **Şimdi yedekle**'ye dokunun. **Güncel veriler yerel bir yedek olarak kaydedildi.** mesajı çıkar.

Önerilen adla alınan yedekler otomatik yedekler gibi zamanla yenileriyle değiştirilir. **Adını
değiştirdiğiniz yedekler siz silene kadar saklanır.** Büyük bir içe aktarmadan veya sıfırlamadan
önce kalıcı bir yedek istiyorsanız adını değiştirerek alın.

Listede her yedeğin türü, tarihi ve boyutu görünür: **Koleksiyon yedeği** veya **Geri yükleme
öncesi kopya**. Bir yedeği silmek için **Sil**'e dokunun; silinen yedek geri getirilemez.

<a id="restore"></a>
## Yedeği geri yükleme
<!-- Uygulamada: Yedekler › Geri yükle app/backups.tsx:130-183, 268-274 -->

1. **Yedekler** ekranında yedeğin altındaki **Geri yükle**'ye dokunun.
2. **Yedeği geri yükle** sorusunu **Tamam** ile onaylayın.
3. **Yedek geri yüklendi.** mesajını gördüğünüzde koleksiyonunuz yedekteki hâlindedir.

Geri yükleme bütün koleksiyonu değiştirir: desteler, notlar, kartlar, tekrar geçmişi ve uygulama
ayarları (dil ve tema dahil) yedekteki hâline döner. Medya dosyalarına dokunulmaz.

Geri yüklemeden hemen önce o anki durumun bir kopyası listeye **Geri yükleme öncesi kopya** olarak
eklenir. Yanlış yedeği seçtiyseniz o kopyayı geri yükleyerek eski hâle dönersiniz. Bu kopyalardan
en yeni üçü saklanır.

Bir yedek geri yüklenemiyorsa **Yedek geri yüklenemedi.** mesajı çıkar ve koleksiyonunuz değişmez.
Bu, yedek uygulamanın daha yeni bir sürümüyle alındığında veya dosya bozulduğunda olabilir.

<a id="share-backup"></a>
## Yedeği paylaşma ve cihaz dışına alma
<!-- Uygulamada: Yedekler › Paylaş app/backups.tsx:200-204, 275-281 → Yedeği dışa aktar app/export.tsx:229, 235-248 -->

**Paylaş**, seçtiğiniz yedekten bir dosya hazırlayan **Yedeği dışa aktar** ekranını açar. Ekran
**Dışa aktar** ekranıyla aynı seçenekleri sunar (bkz. [Dışa aktarma](14-import-export.md#export));
ancak dosya, yedeğin alındığı andaki koleksiyondan üretilir ve şu anki koleksiyonunuz değişmez.

- Bütün koleksiyonu saklamak veya başka cihaza taşımak için **Anki Koleksiyon Paketi (.colpkg)**
  seçin. Bu biçimde **Çalışma programını dahil et** ve ilerleme hep dahildir.
- Yedekler medya dosyası saklamadığı için **Medyayı dahil et** açıkken yalnızca bu cihazda hâlâ
  bulunan dosyalar eklenir.
- Oluşan dosya şifrelenmez; yalnızca güvendiğiniz yerlere gönderin.

Yedek dosyasının kendisi uygulamaya geri aktarılamaz. Bir yedeği başka bir cihazda kullanmak için
onu **.colpkg** olarak dışa aktarıp o cihazda içe aktarırsınız; bu, oradaki koleksiyonun yerine
geçer (bkz. [Koleksiyonu yeni bir cihaza taşıma](14-import-export.md#move-to-new-device)).

<a id="backup-safety"></a>
## Riskli işlemlerden önce alınan yedekler
<!-- Uygulamada: lib/packageImportWorkflow.ts:18-25, app/import.tsx:412, lib/maintenanceWorkflow.ts:47-68, lib/resetWorkflow.ts:29-46, components/backups/MediaCheckSection.tsx:49, lib/backup.ts:555-589 -->

Koleksiyonu değiştiren bazı işlemler başlamadan önce kendiliğinden bir yedek alır:

| İşlem | Önce yedek alınır mı? |
| --- | --- |
| Deste paketi (.apkg) içe aktarma | Her zaman |
| Koleksiyon paketi (.colpkg) içe aktarma | Her zaman |
| Metin dosyası içe aktarma | Yalnızca var olan notları güncelleyecekse |
| Yedeği geri yükleme | Evet, **Geri yükleme öncesi kopya** olarak |
| **Onar ve optimize et** | Her zaman |
| **İlerlemeyi sıfırla** | Her zaman |
| Kullanılmayan medyayı çöp kutusuna taşıma | Her zaman (koleksiyon yedeği) |
| Boş kartları silme | Hayır |

Bu yedekler listede **Koleksiyon yedeği** olarak, işlemin saatiyle görünür ve otomatik yedekler gibi
zamanla yenileriyle değiştirilir.

Koleksiyonda okunamayan satırlar varsa uygulama geri yüklenebilir bir yedek alamaz. Bu durumda
koleksiyon paketi içe aktarma ve **İlerlemeyi sıfırla** başlamadan durur ve **Önce onarın** uyarısı
çıkar; **Şimdi yedekle** ise yalnızca bir **kurtarma kopyası** kaydeder. Kurtarma kopyası
**Paylaş** ile ham dosya olarak dışa aktarılabilir ama geri yüklenemez. Önce
[Onar ve optimize et](#repair)'i çalıştırın.

<a id="check-media"></a>
## Medyayı denetle
<!-- Uygulamada: Yedekler › MEDYA › Medyayı denetle components/backups/MediaCheckSection.tsx:77-116 -->

**Yedekler** ekranının altındaki **MEDYA** bölümünde **Medyayı denetle**'ye dokunun. Uygulama
kayıtlı medya dosyalarını notlarınızla ve not türlerinizle karşılaştırır:

- **Kullanılmayan:** Hiçbir notun veya kart şablonunun kullanmadığı dosyalar.
- **Eksik (notlar başvuruyor, dosya yok):** Notlarınızda adı geçen ama bu cihazda bulunmayan
  dosyalar.

Listelerde ilk 20 dosya adı görünür. Adı `_` ile başlayan dosyalar şablonlar tarafından
kullanılabileceği için hiçbir zaman kullanılmayan sayılmaz. Adı `tusanki-source-` ile başlayan
`.apkg` dosyaları, uygulamanın önceki sürümlerinin içe aktarılan paketlerden sakladığı kopyalardır;
artık hiçbir şey onları kullanmaz.

**Kullanılmayanları çöpe taşı (N)** önce bir koleksiyon yedeği alır, sonra dosyaları bir çöp kutusu
klasörüne taşır. **Çöptekileri geri getir** çöp kutusundaki bütün dosyaları geri koyar; o sırada aynı
adlı bir dosya varsa onu çöp kutusunda bırakır. Çöp kutusundaki dosyalar cihazda yer kaplamaya
devam eder.

Eksik dosyaları geri getirmek için onları içeren paketi yeniden içe aktarın; notlar kopyalanmaz ama
eksik medya yerine konur. Ya da resmi kart düzenleyicisinde yeniden ekleyin.

> **Anki'den farkı:** Kullanılmayan dosyaları kalıcı silme, çöp kutusunu boşaltma ve eksik dosyası
> olan notları etiketleme seçenekleri yoktur.

> **Web sürümünde:** Denetim yalnızca rapor verir; dosyalar çöp kutusuna taşınamaz.

<a id="check-database"></a>
## Veritabanını kontrol et
<!-- Uygulamada: Ayarlar › Veri yönetimi › Bakım › Veritabanını kontrol et app/settings.tsx:1568-1576, sonuç penceresi 714-747; Bakım grubunun ? düğmesi (yeni, 1567) → help.settings.maintenanceSheet → bu bölüm -->

**Ayarlar › Veri yönetimi › Veritabanını kontrol et** yalnızca okur, hiçbir şeyi değiştirmez.
Açılan pencerede önce **Bütünlük** satırı, sonra her sorun türü için bir sayı görünür:

| Satırlar | Anlamı |
| --- | --- |
| **Bütünlük** | Koleksiyon dosyasının kendisinin sağlam olup olmadığı. |
| **Sahipsiz kart**, **Kartsız not**, **Destesi kayıp kart** | Notu olmayan kartlar, hiç kartı kalmamış notlar ve destesi silinmiş kartlar. |
| **Geçersiz aralıklı kart**, **Geçersiz tarihli kart**, **Sırası taşmış yeni kart**, **Geçersiz şablon sıralı kart**, **Filtre artığı kalan kart**, **Artık ön-filtre tarihi taşıyan kart**, **Son tekrar zamanı hatalı kart** | Çalışma bilgileri geçerli aralığın dışına çıkmış kartlar. |
| **Okunamayan not** | Metni okunamayan notlar. Bunlar onarılamaz; metinleri yalnızca bir yedekten geri gelir. |

Sayılardan biri sıfırdan büyükse [Onar ve optimize et](#repair)'i çalıştırın. **Bütünlük sorunu
algılandı** yazıyorsa da önce onarmayı deneyin; sorun sürerse yakın tarihli bir yedeği geri
yükleyin.

> **Anki'den farkı:** Denetim ve onarım ayrı düğmelerdir. **Veritabanını kontrol et** yalnızca rapor
> verir; onarım için **Onar ve optimize et** önce bulduklarını gösterip onayınızı ister.

<a id="repair"></a>
## Onar ve optimize et
<!-- Uygulamada: Ayarlar › Veri yönetimi › Bakım › Onar ve optimize et app/settings.tsx:1577-1584; onay 878-920; sonuç 762-871 -->

1. **Ayarlar › Veri yönetimi › Onar ve optimize et**'e dokunun.
2. Uygulama koleksiyonu denetler ve **Veritabanını onar ve optimize et** penceresinde bulduklarını
   ve ne yapacağını gösterir. **Tamam** ile onaylayın.
3. Bir güvenlik yedeği alınır, sonra onarım yapılır. Sonuç penceresi neyin düzeltildiğini ve
   yedeğin adını söyler.

Onarım şunları yapar: notu olmayan kartları siler; kartı kalmamış notlara ilk kartlarını geri
verir; destesi silinmiş kartları kendi destelerine, bulunamazsa **Kurtarılan Kartlar** adlı bir
desteye taşır; geçersiz tarih, aralık ve sıra değerlerini düzeltir. Not metni silinmez. Ardından
koleksiyon dosyası sıkıştırılır ve arama dizini yenilenir.

Onarımdan sonra **Kurtarılan Kartlar** destesi oluştuysa içindeki kartları **Kartlarım** ekranından
doğru destelere taşıyabilirsiniz. TUS Kartları paketinin kartları silinmez veya taşınmaz. Sonuç
**Kısmen tamamlandı** diyorsa tamamlanamayan adımlar listelenir; işlemi daha sonra yeniden
çalıştırabilirsiniz.

<a id="empty-cards"></a>
## Boş kartlar
<!-- Uygulamada: Desteler › ••• › Boş kartlar (app/(tabs)/decks.tsx:2257-2263) → app/empty-cards.tsx -->

**Boş kart**, ön yüzü artık üretilemeyen karttır: ön yüzü oluşturan alan boşaltılmıştır, kartın
şablonu not türünden kaldırılmıştır veya boşluk doldurma notunda o numaralı boşluk metinden
silinmiştir. **Desteler › ••• › Boş kartlar** ekranı bu kartları nedenleriyle listeler.

- Tek bir kartı silmek için satırdaki **✕**'e, hepsini silmek için **Tümünü sil (N)**'e dokunun.
- **Geçerli kartı olmayan notları koru** (açık): Bir notun bütün kartları boşsa ilk kartı silinmez,
  böylece not kartsız kalmaz. Kapalıyken bütün kartlar silinir ama notun metni kartsız olarak
  durur; **Veritabanını kontrol et** bu notları **Kartsız not** olarak gösterir ve
  **Onar ve optimize et** onlara yeniden bir kart verir.
- Tekrar geçmişi korunur. Silme geri alınamaz ve öncesinde yedek alınmaz; önce
  [elle bir yedek](#back-up-now) alın.

> **Anki'den farkı:** **Geçerli kartı olmayan notları koru** kapalıyken notlar silinmez; yalnızca
> kartları silinir.

<a id="reset-progress"></a>
## İlerlemeyi sıfırla: koleksiyonu baştan başlatma
<!-- Uygulamada: Ayarlar › Veri yönetimi › Bakım › İlerlemeyi sıfırla app/settings.tsx:1585-1591; onay 979; sonuç 991-1007 -->

**İlerlemeyi sıfırla yalnızca çalışma ilerlemesini değil, bütün koleksiyonu siler.**

| Silinir | Kalır |
| --- | --- |
| Bütün desteler, notlar, kartlar ve not türleri | Medya dosyaları |
| Ayar grupları, çalışma ilerlemesi, tekrar geçmişi ve istatistikler | Yedekler |
| Kronometre kayıtları | |
| Uygulama ayarları (dil Türkçeye, tema açığa döner) | |

Sıfırlamadan sonra uygulama tek bir boş **Varsayılan** destesiyle, ilk kurulduğu gibi açılır. Dili
yeniden değiştirmek için **Ayarlar › Genel › Dil** bölümüne gidin.

Kullanmadan önce:

1. **Yedekler › Şimdi yedekle** ile adını değiştirerek kalıcı bir yedek alın.
2. Koleksiyonu **.colpkg** olarak dışa aktarıp cihaz dışına kaydedin
   (bkz. [Koleksiyonu yeni bir cihaza taşıma](14-import-export.md#move-to-new-device)).

Sonra **Ayarlar › Veri yönetimi › İlerlemeyi sıfırla**'ya dokunun ve soruyu **Tamam** ile onaylayın.
Uygulama önce geri yüklenebilir bir güvenlik yedeği alır; **İlerleme sıfırlandı** mesajı bu
yedeğin adını söyler. Fikrinizi değiştirirseniz o yedeği **Yedekler** ekranından geri yükleyin.

Yalnızca bazı kartları yeni kart hâline döndürmek istiyorsanız bu komutu kullanmayın: **Kartlarım**
ekranında kartları seçip **Diğer** › **Kartları sıfırla…** komutunu kullanın
(bkz. [Kartlarım ve arama](10-browser-and-search.md)).

> **Anki'den farkı:** Anki'deki kart sıfırlama yalnızca seçtiğiniz kartları yeni kart yapar.
> **İlerlemeyi sıfırla** ise bütün koleksiyonu siler.

<a id="delete-app-warning"></a>
## Uygulamayı silmeden önce

Yedekler uygulamanın içinde saklandığı için **uygulamayı silerseniz koleksiyonunuz ve bütün
yedekleriniz birlikte silinir.** Uygulamayı silmeden veya telefonunuzu değiştirmeden önce
koleksiyonunuzu **.colpkg** olarak dışa aktarın ve dosyayı iCloud Drive'a, bilgisayarınıza veya
başka güvenli bir yere kaydedin. Dosyayı daha sonra **Deste içe aktar** ile geri yüklersiniz.

> **Web sürümünde:** Tarayıcının site verilerini silmek koleksiyonu ve yedekleri de siler. Önemli
> bir değişiklikten önce koleksiyonu dışa aktarıp indirin.

## İlgili konular

- [İçe ve dışa aktarma](14-import-export.md)
- [Kartlarım ve arama](10-browser-and-search.md)
- [Ayarlar](16-settings.md)
- [Sık sorulanlar ve sorun giderme](20-faq.md)
