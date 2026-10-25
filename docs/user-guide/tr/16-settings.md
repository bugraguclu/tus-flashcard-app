---
id: settings
title: Ayarlar
summary: Dil ve tema, çalışma ekranının görünümü, günün başlangıcı, hatırlatmalar, dokunma ve klavye kontrolleri, erişilebilirlik.
order: 16
web_path: /yardim/ayarlar
app_help: help?article=settings
app_screens:
  - "Ayarlar — app/settings.tsx"
  - "Ayarlar › Kontroller › Klavye — components/settings/KeyboardSettingsSection.tsx"
verified_against: master c6108e6 (2026-10-25)
---

# Ayarlar

**Ayarlar**, uygulamanın görünümünü ve çalışma ekranının nasıl davrandığını belirler. Günlük
limitler, öğrenme adımları ve zamanlayıcı gibi deste kuralları burada değil,
[Deste seçenekleri](06-deck-options.md) ekranındadır.

<a id="open-settings"></a>
## Ayarları açma

- **Desteler** ekranının altındaki **Ayarlar** düğmesine dokunun.
- Çalışırken şu an gösterilecek kart kalmadıysa (**Şimdilik hepsi bu kadar!**) çıkan
  **Bekleme ayarları** düğmesi de Ayarlar'ı açar.

Ayarlar sekiz kategoriden oluşur. Bir kategoriye dokunduğunuzda sayfası açılır; sol üstteki geri
oku sizi kategori listesine döndürür.

| Kategori | İçinde ne var? |
| --- | --- |
| **Genel** | Dil, tema, kart ekleme tercihleri |
| **Yeni çalışma ekranı** | Çalışma ekranının görünümü, araç çubuğu, cevap düğmeleri |
| **İnceleme** | Günün başlangıcı, önceden öğrenme, zaman kutusu, ses |
| **Bildirimler** | Günlük çalışma hatırlatması |
| **Kontroller** | Dokunma bölgeleri, kaydırma hareketleri, Araçlar düğmesi, klavye |
| **Erişilebilirlik** | Yakınlaştırma, düğme boyutu, dokunma süreleri |
| **Veri yönetimi** | Yedekler, içe ve dışa aktarma, bakım |
| **Hakkında** | Sürüm, yardım, gizlilik politikası, destek |

> **Web sürümünde:** Geniş bir pencerede, çalışma ekranının yanındaki kenar çubuğunda da
> **Ayarlar** düğmesi vardır.

<a id="search-settings"></a>
## Ayar arama

Kategori listesinin üstündeki **Ara…** kutusu, kategori adlarında ve altlarındaki kısa açıklamada
arar. "tema", "klavye" veya "hatırlatma" yazmak ilgili kategoriyi bulur. Tek bir satırın adı
(örneğin "zaman kutusu") sonuç vermezse, ayarın bulunduğu kategorinin adıyla arayın; bu sayfadaki
başlıklar hangi ayarın nerede olduğunu gösterir.

<a id="saving"></a>
## Değişiklikleri kaydetme

Ayarlar'da yaptığınız değişiklik hemen önizlenir: tema veya dil değiştirdiğinizde ekran anında
değişir. Ama değişiklik **Kaydet**'e dokunana kadar saklanmaz.

1. Ayarları değiştirin.
2. Sağ üstteki **Kaydet** düğmesine dokunun. Düğme kısa bir süre **✓ Kaydedildi** olarak görünür.

Kaydetmeden çıkmak isterseniz **Kaydedilmemiş değişiklikler** sorusu gelir. **Tamam** değişiklikleri
atıp çıkar, **İptal** sayfada kalır.

- iPhone'da ekranın sol kenarından geri kaydırmak Ayarlar'ı tamamen kapatır. Bir kategoriden
  listeye dönmek için sol üstteki geri okunu kullanın.
- **Varsayılan ayarlara dön** ve **Veri yönetimi** komutları **Kaydet** beklemez; onayladığınız
  anda çalışır.
- **Bildirimler** anahtarını açtığınızda izin sorusu hemen gelir; seçiminiz yine **Kaydet** ile
  saklanır.
- Ayarlar cihazdaki koleksiyonla birlikte saklanır ve yedeklere girer. Bir yedeği geri yüklerseniz
  ayarlar da o yedekteki hâline döner.

<a id="general"></a>
## Genel

<a id="language"></a>
### Dil

**Sistem**, **Türkçe** veya **English**. **Sistem** seçiliyken iPhone'unuzun dili Türkçe ise
uygulama Türkçe, başka bir dil ise İngilizce görünür. Uygulama ilk açılışta Türkçe başlar.
Çalışma hatırlatmalarının dili de bu seçime uyar.

<a id="theme"></a>
### Tema

**Sistem**, **Açık** veya **Koyu** (varsayılan: **Açık**). **Sistem**, iPhone'un açık/koyu görünüm
ayarını izler. Seçtiğiniz tema klavyeye, sistem sayfalarına ve üstteki durum çubuğuna da uygulanır.

<a id="editing-preferences"></a>
### Düzenleme ve kart tarayıcısı

| Ayar | Varsayılan | Ne yapar? |
| --- | --- | --- |
| **Yeni kartların destesi** | **Geçerli deste** | Kart ekleme ekranı bir desteden açılmadığında (örneğin Desteler'deki **+** düğmesinden) hangi desteyle başlayacağını belirler. **Geçerli deste**, en son çalıştığınız destedir; **Varsayılan**, "Varsayılan" adlı destedir. |
| **Pano görsellerini PNG olarak yapıştır** | Kapalı | Düzenleyiciye yapıştırdığınız görseller her zaman karta eklenir; açıkken PNG, kapalıyken JPEG olarak kaydedilir. |
| **Yazarak cevap alanlarını devre dışı bırak** | Kapalı | Cevabı yazmanızı isteyen kartları normal kart gibi gösterir; klavye açılmaz. |
| **Cevabı kartın içine yaz** | Kapalı | Yazma kutusunu kartın şablonundaki yere koyar, böylece kartın kendi stili uygulanır. Yalnızca bir üstteki ayar kapalıyken görünür. |
| **Yazarak cevap alanına odaklan** | Açık | Yazarak cevap kartı açılınca kutuyu seçer ve klavyeyi açar. |
| **Dosya adlarını göster** | Kapalı | **Kartlarım** listesinde soru ve cevap metninde ses dosyalarının adlarını gösterir. Bu satır Genel sayfasının altında, başlıksız bir kartta durur. |

Yazarak cevaplama için bkz. [Çalışma ekranı](05-studying.md).

<a id="new-study-screen"></a>
## Yeni çalışma ekranı

Bu sayfa çalışma ekranının görünümünü ayarlar. En üstteki **Yeni çalışma ekranını kullan**
anahtarı (varsayılan kapalı) yenilenmiş ekranı açar: kalan kart sayılarını, süreyi ve tahmini
bitişi gösteren yeni bir araç çubuğu ve cevaba göre sola (**Tekrar**) veya sağa (diğer düğmeler)
kayan geri bildirim. Sayfadaki diğer seçenekler, **Araç çubuğu konumu** dışında, klasik ekranda da
geçerlidir.

| Ayar | Varsayılan | Ne yapar? |
| --- | --- | --- |
| **Çerçeve stili** | **Kart** | **Kart**, kartı çerçeveli bir yüzeyde gösterir; **Yok**, ekranı kenardan kenara kullanır. |
| **Kalan kart sayısını göster** | Açık | Yeni, öğrenme ve tekrar sayıları görünür. |
| **Sesli kartlarda oynatma düğmelerini göster** | Açık | Kartın içindeki seslerin yanında oynatma düğmesi çıkar. |
| **Yanıt geri bildirimini göster** | Açık | **Tekrar**'da kırmızı çarpı gösterir; her cevapta hafif titreşim verir. |
| **Ortaya hizala** | Kapalı | Kart içeriğini ekranın dikey ortasına yerleştirir. |
| **Deste başlığını göster** | Açık | Çalıştığınız destenin adı üstte görünür. |
| **Kalan süreyi göster** | Kapalı | O anki hızınıza göre bitişe ne kadar kaldığını tahmin eder. |
| **Araç çubuğunu göster** | Açık | Geri düğmesini, deste seçiciyi, sayaçları ve kart işlemlerini gösterir. |
| **Araç çubuğu konumu** | **Üst** | Yeni ekranda araç çubuğunu ekranın altına (**Alt**) alabilirsiniz. |
| **Yanıt düğmelerini göster** | Açık | Kapatırsanız kartları dokunma bölgeleri veya kaydırma ile cevaplarsınız. Kapatmadan önce **Kontroller** bölümünde bunlardan birinin açık olması gerekir. |
| **Sonraki inceleme süresini göster** | Açık | Her düğmenin üstünde kartın ne zaman yeniden geleceği yazar. |
| **Zor ve Kolay düğmelerini gizle** | Kapalı | Yalnızca **Tekrar** ve **İyi** gösterilir. |
| **Otomatik ilerleme** | Kapalı | Aşağıya bakın. |

<a id="auto-advance"></a>
### Otomatik ilerleme

**Otomatik ilerleme** anahtarı, kartların sizin yerinize ilerlemesini sağlar. Ne kadar bekleneceği
ve süre dolunca ne olacağı her deste için **Deste seçenekleri › Otomatik ilerleme** bölümünde
ayarlanır: soruyu ve cevabı gösterme süresi (saniye) ve süre dolunca yapılacak işlem. Bu süreler
0 ise (ilk değer) anahtar açık olsa da hiçbir şey olmaz. Bir menü açıkken, uygulama arka
plandayken veya kartın üstüne çizim yaparken sayaç bekler. Bkz.
[Deste seçenekleri](06-deck-options.md#auto-advance).

<a id="reviewing"></a>
## İnceleme

<a id="next-day-starts"></a>
### Sonraki günün başlangıcı

Uygulamada gün gece yarısı değil bu saatte değişir (varsayılan **04:00**). Bu saatten önce
çalıştığınız kartlar bir önceki güne sayılır. Günlük limitler, gömülen kartların geri gelmesi,
istatistiklerdeki "bugün" ve hatırlatmadaki kart sayısı bu saate göre hesaplanır. Saat olarak
01:00 ile 23:00 arasında bir değer seçin. Gece geç saatte çalışıyorsanız, uyuduğunuz saatten sonraki
bir saat seçin.

<a id="learn-ahead"></a>
### Önceden öğrenme sınırı

Öğrenme kartları kısa adımlarla (örneğin 10 dakika sonra) yeniden gelir. Çalışacak başka kart
kalmadığında, adımının bitmesine bu kadar dakikadan az kalan öğrenme kartları beklemeden gösterilir
(varsayılan **20 dk.**, 0–120 arası, 5'er dakika). **0** önceden göstermeyi kapatır: öğrenme
kartları ancak zamanı gelince çıkar.

Daha uzun bekleyen kartlar varsa çalışma ekranı **Şimdilik hepsi bu kadar!** der ve geri sayım
gösterir. Oradaki **Beklemeden çalış** düğmesi bekleyen öğrenme kartlarını hemen getirir;
**Bekleme ayarları** düğmesi Ayarlar'ı açar, buradan **İnceleme** sayfasına gidin.

<a id="timebox"></a>
### Zaman kutusu sınırı

Çalışmayı dakikalık bloklara böler (varsayılan **0**, yani kapalı). Örneğin 25 yazarsanız, 25
dakika dolduktan sonra cevapladığınız ilk kartta **Zaman kutusu** penceresi açılır ve o blokta kaç
kart çalıştığınızı söyler. **Devam** yeni bir blok başlatır, **Bitir** sizi Desteler'e götürür.
Süre, bloğun başından itibaren saatle ölçülür; başka bir desteye geçmek yeni bir blok başlatır.

<a id="study-audio"></a>
### Ekran ve ses

| Ayar | Varsayılan | Ne yapar? |
| --- | --- | --- |
| **Ekranı açık tut** | Kapalı | Çalışma ekranı açıkken iPhone ekranı kararmaz. |
| **Sesi otomatik oynat** | Açık | Kart açılınca içindeki ses kendiliğinden çalar. Bir destede otomatik sesi kapatmak için o destenin **Deste seçenekleri › Ses** bölümünü kullanın. |
| **Ses oynatma hızı** | 1.0x | 0.75x–2.0x. **Varsayılan** ayar grubunu kullanan destelerde ve kendi hızı olmayan destelerde geçerlidir. Bir ayar grubuna özel hız **Deste seçenekleri › Ses** bölümünden verilir. |
| **Yanıtlarken sesi kes** | Açık | Kartı cevapladığınızda çalan ses veya sesli okuma durur. Kapalıyken bir sonraki karta kadar sürebilir. |

<a id="notifications"></a>
## Bildirimler
<!-- Uygulamada: Ayarlar › Bildirimler grubunun ? düğmesi (yeni, app/settings.tsx:1236) → bilgi sayfasının "Daha fazla bilgi" bağlantısı → bu bölüm -->

TusAnkiM her gün seçtiğiniz saatte, zamanı gelmiş tekrar kartlarınız varsa bir hatırlatma
gönderir: **Çalışma zamanı — 12 tekrar kartı sizi bekliyor.** Bildirime dokunmak Desteler'i açar.

- **Bildirimler:** Hatırlatmayı açar veya kapatır (varsayılan açık).
- **Şu durumda bildir:** **Bekleyen tekrar varsa** (en az bir kart; varsayılan), "10’dan fazla…"
  gibi bir sınır (10, 25, 50, 75, 100, 150, 200 veya 500) ya da **Asla bildirme**. Sınır
  seçeneklerinde sayı aşılmalıdır: "10’dan fazla" en az 11 kart demektir.
- **Hatırlatma saati:** Saati ve dakikayı ayrı ayrı yazın (varsayılan 09:00). Yalnızca bildirimler
  açıkken görünür.

Bilmeniz gerekenler:

- Yalnızca **tekrar** durumundaki kartlar sayılır. Yeni kartlar ve öğrenme adımındaki kartlar
  hatırlatmaya girmez; zamanı gelen tekrarınız yoksa o gün bildirim gelmez.
- Hatırlatmalar birkaç hafta ileriye planlanır ve uygulamayı her açıp kapattığınızda yeniden
  hesaplanır. Böylece bildirimdeki sayı son çalışmanızı yansıtır.
- İlk kurulumda iPhone bu hatırlatmaları sessizce, yalnızca Bildirim Merkezi'ne bırakabilir.
  Afiş ve ses için **iPhone Ayarları › Bildirimler › TusAnkiM** bölümünden izin verin. Ses,
  titreşim, kilit ekranında gösterme ve Odak modları da oradan yönetilir; uygulamanın ayrı bir
  titreşim ayarı yoktur. Uygulama simgesinde sayı rozeti gösterilmez.
- Bildirim izni kapalıyken **Bildirimler** anahtarını açarsanız uygulama sizi **Ayarları Aç**
  düğmesiyle iPhone Ayarları'na yönlendirir.
- [Kronometre](13-stopwatch-and-calendar.md) blok hatırlatmaları da aynı bildirim iznini kullanır.

> **Web sürümünde:** Hatırlatma yalnızca uygulama bir tarayıcı sekmesinde açıkken gelir (sekme
> arka planda olabilir). Tarayıcı izni **Bildirimler** anahtarını açtığınızda istenir; hatırlatma
> gelmiyorsa anahtarı kapatıp yeniden açın ve tarayıcının sorduğu izni verin. Tarayıcınız site
> bildirimlerini desteklemiyorsa **Bildirimler desteklenmiyor** uyarısı çıkar.

<a id="controls"></a>
## Kontroller
<!-- Uygulamada: Ayarlar › Kontroller › Dokunma ve kaydırma grubunun ? düğmesi (app/settings.tsx:1300) açılan "Dokunma ve kaydırmayı özelleştirin" penceresinin "Daha fazla bilgi" bağlantısı (yeni) → bu bölüm -->

Bu sayfa, çalışma ekranında dokunma ve kaydırmanın ne yapacağını belirler. Seçimler yalnızca
çalışma ekranında geçerlidir. **Dokunma ve kaydırma** başlığının yanındaki **?** düğmesi kısa bir
rehber açar.

<a id="tap-zones"></a>
### Dokunma bölgeleri

**9 noktalı dokunma** (varsayılan açık) kart yüzeyini 3×3 bölgeye ayırır. **Kart tarafı**
seçicisiyle **Soru** ve **Yanıt** taraflarını ayrı ayrı ayarlarsınız; bir bölgeye dokunup listeden
bir işlem seçin.

- Varsayılan olarak soru tarafında her bölge cevabı gösterir. Cevap tarafında sol sütun **Tekrar**,
  orta sütun hiçbir şey, sağ sütun **İyi** yapar.
- Seçebileceğiniz işlemler: cevabı göstermek, dört cevap düğmesi, son işlemi geri almak, not
  eklemek, notu düzenlemek, işaretlemek, kartı gömmek veya askıya almak, sesi yeniden oynatmak,
  bayrak seçiciyi ve araçları açmak, destelere dönmek.
- Soru görünürken bir cevap işlemi önce cevabı açar; puan ancak cevap görünürken verilir. Böylece
  görmediğiniz bir cevabı yanlışlıkla puanlamazsınız.
- Kartın içindeki bağlantılar, yazma kutuları ve ses düğmeleri kendi dokunuşlarını almaya devam eder.

<a id="swipes"></a>
### Kaydırma hareketleri

**Kaydırma hareketlerini etkinleştir** (varsayılan kapalı) dört yöne birer işlem atamanızı sağlar.

- **Hazır düzenler:** **iPhone için dengeli** sola kaydırmayla araçları açar, sağa kaydırmayla
  destelere döner. **Hızlı yanıt** sola **Tekrar**, sağa **İyi**, yukarı **Kolay**, aşağı **Zor**
  verir. Düzeni seçtikten sonra yönleri tek tek değiştirebilirsiniz.
- **Yukarı ve aşağı kaydırma, ekranın sol veya sağ kenarından başlattığınızda** çalışır. Kartın
  ortasında dikey kaydırma uzun kartları kaydırmaya devam eder. Sola ve sağa kaydırma kartın her
  yerinde çalışır.
- **Kaydırma hassasiyeti** (%1–%200, varsayılan %100): Yüksek değer kısa hareketleri de algılar,
  düşük değer daha uzun ve belirgin bir kaydırma ister.

**Yanıt düğmelerini göster** kapalıyken dokunma bölgeleri ile kaydırmanın ikisini birden kapatırsanız
cevap düğmeleri kendiliğinden geri gelir; kartları cevaplamanın her zaman bir yolu kalır.

**Ekran kontrolü › Yüzen Araçlar düğmesini göster**, tek elle kullanım için çalışma ekranına sabit
bir **Araçlar** düğmesi ekler. **Düğme konumu** ile sol veya sağ tarafı seçin.

<a id="keyboard"></a>
### Klavye

iPhone'a bağlı bir fiziksel klavyeyle (örneğin Bluetooth klavye) çalışırken kullanılan tuşlar:

| İşlem | Varsayılan tuş |
| --- | --- |
| **Cevabı göster** | Boşluk |
| **Tekrar** / **Zor** / **İyi** / **Kolay** | 1 / 2 / 3 / 4 |
| **Sesi yeniden oynat** | R |
| **Kartı göm** | - |
| **Kartı askıya al** | @ |
| **Notu işaretle** | * |

Bir tuşu değiştirmek için:

1. Satırdaki **Değiştir**'e dokunun; kutuda **Bir tuşa basın** yazar.
2. Klavyede yeni tuşa basın. Vazgeçmek için **İptal**'e dokunun veya Esc'ye basın.
3. **Kaydet**'e dokunun.

Bir tuşu yalnızca bir işleme atayın; aynı tuşu iki işleme verirseniz kısayollar kaydedilirken
varsayılanlarına döner. **Kısayolları sıfırla** düğmesi bütün tuşları ilk hâline getirir.

Değiştirilemeyen tuşlar da vardır: Esc çalışmadan çıkar, Z veya U son işlemi geri alır (bu
harfleri başka bir işleme atamadıysanız), Boşluk cevabı gösterme tuşuyken Enter da aynı işi
yapar. Tam liste: [Çalışma ekranı](05-studying.md#keyboard-shortcuts).

> **Web sürümünde:** Ctrl/Cmd+Z son işlemi geri alır, Ctrl/Cmd+1–7 kartın bayrağını değiştirir.

<a id="accessibility"></a>
## Erişilebilirlik

| Ayar | Varsayılan | Ne yapar? |
| --- | --- | --- |
| **Kart yakınlaştırma** | %100 | Kartın tamamını %50–%200 arasında büyütür veya küçültür. |
| **Görsel yakınlaştırma** | %100 | Kartlardaki görselleri ayrıca %50–%200 arasında ölçekler. |
| **Yanıt düğmesi boyutu** | %100 | Cevap düğmelerini %175'e kadar büyütür. |
| **Büyük yanıt düğmelerini iki satırda göster** | Kapalı | Dört düğmeyi iki satıra dizer; büyük düğmelerde parmakla seçmeyi kolaylaştırır. |
| **Cevabı göster basılı tutma süresi** | 0 ms | 0'dan büyükse **Cevabı göster** düğmesine o kadar basılı tutmanız gerekir; yanlışlıkla açmayı önler. Dokunma bölgelerini etkilemez. |
| **Çift dokunma aralığı** | 200 ms | Bir cevaptan sonra bu süre içinde gelen ikinci dokunuşu yok sayar (0–1000 ms). |
| **Yazı ölçeği** (Kart tarayıcısı) | %100 | **Kartlarım** listesindeki yazıyı %75–%175 arasında ölçekler. |

Uygulamanın kendi yazıları iPhone'un yazı boyutu ayarını da izler; VoiceOver düğmelerin adlarını
okur.

<a id="data-management"></a>
## Veri yönetimi

Bu sayfadaki komutlar **Kaydet** beklemeden çalışır.

- **Otomatik yedekleme** (varsayılan açık): Koleksiyonda değişiklik olduysa uygulama yaklaşık
  yarım saatte bir yedek alır. **Yedekleri yönet** yedekleri gösterir ve geri yükler. Bkz.
  [Yedekler ve bakım](15-backups-and-maintenance.md#automatic-backups).
- **Verileri dışa aktar** ve **Deste ve verileri içe aktar** tam ekran içe/dışa aktarma ekranlarını
  açar. Bkz. [İçe ve dışa aktarma](14-import-export.md).
- **Veritabanını kontrol et** hiçbir şeyi değiştirmeden sorun arar;
  **Onar ve optimize et** önce bulduklarını gösterir, onayınızla yedek alıp onarır. Bkz.
  [Veritabanını kontrol etme](15-backups-and-maintenance.md#check-database) ve
  [Onarma](15-backups-and-maintenance.md#repair).
- **İlerlemeyi sıfırla** kartlarınızı, destelerinizi ve çalışma geçmişinizin tamamını siler; önce
  bir güvenlik yedeği alır. Bkz. [İlerlemeyi sıfırlama](15-backups-and-maintenance.md#reset-progress).

<a id="about"></a>
## Hakkında

- **Yardım ve kullanım kılavuzu** bu kılavuzu açar. Kılavuz uygulamayla gelir, internet gerektirmez.
- **Gizlilik politikası** ve **Destek** tarayıcıda açılır. Destek kaydına kişisel sağlık verisi veya
  parola yazmayın.
- Grubun açıklamasında uygulamanın sürüm numarası yazar; destek isterken bu numarayı belirtin.

TusAnkiM bağımsız bir projedir; Anki paketleriyle çalışır ama Anki veya Ankitects ile bağlantılı
değildir.

<a id="restore-defaults"></a>
## Varsayılan ayarlara dönme

**Genel** sayfasının en altındaki **↺ Varsayılan ayarlara dön** düğmesi, onayınızdan sonra hemen
çalışır (**Kaydet** gerekmez):

- Bütün sayfalardaki ayarlar ilk değerlerine döner: dil **Türkçe**, tema **Açık**, hatırlatma
  09:00, klavye kısayolları varsayılan tuşlar.
- **Varsayılan** ayar grubunu kullanan destelerin günlük limitleri, öğrenme adımları ve aralık
  ayarları da ilk değerlerine döner. Bu ayar grubunu özelleştirdiyseniz sonra
  [Deste seçenekleri](06-deck-options.md#presets) ekranında kontrol edin.
- Kartlarınız, desteleriniz ve çalışma geçmişiniz değişmez.

## İlgili konular

- [Çalışma ekranı](05-studying.md)
- [Deste seçenekleri](06-deck-options.md)
- [Yedekler ve bakım](15-backups-and-maintenance.md)
- [Kısayollar ve otomasyon](18-shortcuts-and-automation.md)
