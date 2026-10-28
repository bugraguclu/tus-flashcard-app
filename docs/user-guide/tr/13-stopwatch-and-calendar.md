---
id: stopwatch
title: Kronometre ve çalışma takvimi
summary: Kronometre ile ders süresini ölçme, mola, günlük hedef, sınav tarihi, hatırlatmalar ve Çalışma Takvimi'ndeki oturumlar.
order: 13
web_path: /yardim/kronometre
app_help: help?article=stopwatch
app_screens:
  - "Kronometre — app/stopwatch.tsx"
  - "Kronometre sayfaları — components/stopwatch/ (StudyStartSheet, StudyPickers, SessionEditorSheet, RunningNoteSheet, StopwatchSettingsSheet, StopwatchAlertsSheet, SessionActionsMenu)"
  - "Çalışma Takvimi — app/study-calendar.tsx"
verified_against: kronometre-screen-functions (2026-10-28)
---

# Kronometre ve çalışma takvimi

**Kronometre**, kartların dışında yaptığınız çalışmayı (ders okuma, soru çözme, deneme sınavı) da
ölçer ve günlük hedefinize ekler. **Çalışma Takvimi** kart çalışmalarınızı ve Kronometre
oturumlarınızı gün gün listeler. Kronometre'yi **Desteler** ekranının alt çubuğundaki
**Kronometre** düğmesiyle veya **İstatistikler** ekranındaki **Çalışma serisi** kartına dokunarak
açarsınız; Çalışma Takvimi'ni Kronometre başlığındaki takvim düğmesi açar.

> **Anki'den farkı:** Kronometre ve Çalışma Takvimi TusAnkiM'e özgüdür; Anki'de karşılıkları
> yoktur. Kronometre oturumları `.apkg` paketlerine girmez, TusAnkiM yedeklerinde saklanır.

> **Web sürümünde:** Geniş bir tarayıcı penceresinde, çalışma ekranının yanındaki kenar çubuğunda
> **⏱️ Kronometre** ve **Çalışma Takvimi** düğmeleri de bulunur.

<a id="stopwatch"></a>
## Kronometre ekranı
<!-- Uygulamada: Kronometre başlığındaki ⓘ (yeni, app/stopwatch.tsx:324-341) bilgi sayfasının "Daha fazla bilgi" bağlantısı → bu bölüm -->

- **Halka:** Bugünkü toplam çalışma sürenizi gösterir ve günlük hedefe doğru dolar. Yanında
  **Günlük Hedef** ve **Başla** düğmesi vardır.
- **Kronometre çalışırken** üst bölüm değişir: **Bugün** ve **Hedef** süreleri ile günlük hedefe
  doğru dolan bir çubuk, dersin adı, bu oturumun çalışma süresi büyük bir saat olarak ve
  **Sonlandır** ile **Mola Ver** düğmeleri.
- **Son Çalışmalarınız:** Bugün ve dün; her günün en yeni oturumu en üstte. Daha önceki günler
  listenin altındaki **Çalışma Takvimi** kartından açılır.
- Başlıkta zil (hatırlatmalar), takvim (Çalışma Takvimi) ve dişli (Kronometre ayarları)
  düğmeleri, sağ altta turuncu çalışma araçları düğmesi vardır.

Kronometre oturumları İstatistikler'deki grafiklere ve **Bugün** kartındaki **Çalışma süresi**'ne
girmez; **Çalışma serisi**'ni ise etkiler. Bkz. [Çalışma serisi](12-statistics.md#streak).

<a id="start-and-break"></a>
## Başlatmak ve mola vermek

1. **Başla**'ya dokunun.
2. **Çalışmaya Başla** sayfasında **Ders seçin**'e dokunun, dersi ızgaradan seçip **Kapat**'a
   dokunun. Izgarada **Karışık** ve TUS dersleri, ayrıca daha önce kullandığınız başka dersler
   vardır. Listede olmayan bir ders için adını ızgaranın altındaki kutuya yazıp **Seç**'e dokunun.
3. **Tür Seçin**'e dokunup türü seçin: **1. Tekrar**–**8. Tekrar**, **Çıkmış TUS Soruları**,
   **Soru Çözümü**, **Dershane**, **Video Ders** veya **Deneme Sınavı**. Üstteki **Ara** kutusu
   listeyi süzer.
4. **Başla**'ya dokunun; kronometre hemen başlar.

Sayfa en son başlattığınız ders ve türle açılır (ilk seferde **Karışık** ve **1. Tekrar**). Bir
ders seçtiğinizde tekrar sayısı o dersin son "N. Tekrar" oturumundan devam eder.

- **Mola Ver:** Çalışma süresi durur, mola süresi işlemeye başlar; büyük saatin altında
  **Mola** süresi görünür. **Devam Et** ile çalışmaya dönersiniz.
- Çalışan oturum **Bugün**'ün en üstünde kendi kartında görünür: **Çalışma** ve **Mola**
  süreleri, **Oturum süreniz** ve ders bloğunun ilerleyişi, örneğin **%60 · 20 dk kaldı**. Blok
  dolunca ne kadar aştığınızı yazar (**15 dk aşıldı**); moladayken aynı satır molanın süresini
  sayar. Kronometre kendiliğinden durmaz veya molaya geçmez.
- **Çalışma notu:** Çalışan oturum kartının solundaki kitap düğmesi oturuma not (en fazla 100
  karakter) ekler. Not, kartta "İyi çalışmalar" yazısının yerinde görünür ve oturum bitince
  onunla kaydedilir.

<a id="finish"></a>
## Bitirmek

**Sonlandır**'a dokunduğunuzda çalışma ve mola toplamını gösteren bir onay gelir; **Tamam** oturumu
kaydeder, **İptal** kronometreyi çalışır bırakır. Kaydedilen oturum **Bugün** altında ve Çalışma
Takvimi'nde görünür, günlük hedefe ve **Çalışma serisi**'ne sayılır.

Bir dakikadan kısa çalışmalar kaydedilmez: **Kısa çalışma** uyarısında **Tamam** kronometreyi
kaydetmeden sıfırlar. Daha uzun bir oturumu kaydetmek istemiyorsanız bitirdikten sonra silin
(bkz. [Oturumlar](#sessions)).

<a id="sessions"></a>
## Son Çalışmalarınız ve oturumlar

Zaman çizelgesinde iki tür oturum görünür; ikisi de çizgide ✓ ile işaretlenir:

- **Kart oturumları:** Kart yanıtladığınızda kendiliğinden oluşur; bkz.
  [Kart oturumları nasıl oluşur?](#card-sessions).
- **Kronometre oturumları:** Kronometre ile ölçtükleriniz ve elle eklediğiniz. Hangisi olduğu
  **Oturum ayrıntıları**'nda yazar.

Her oturum kartında ders adı, tür etiketi, **Çalışma** ve **Mola** süreleri (mola sayısıyla),
varsa not ve **Zaman aralığı** bulunur. Kronometre oturumunda etiket seçtiğiniz türdür (ör.
**2. Tekrar**, **Soru Çözümü**); kart oturumunda **N. Tekrar** o gün o dersteki kaçıncı oturum
olduğunu gösterir.

Kartın solundaki **•••** düğmesi:

- Kronometre oturumu: **Düzenle**, **Oturum ayrıntıları**, **Oturumu sil**. Silme kalıcıdır; o
  günün tek çalışmasıysa gün seriden düşer.
- Kart oturumu: **Bu desteye git** (destenin genel bakışını açar) ve **Oturum ayrıntıları**
  (kart ve yanıt sayısı, deste). Kart oturumları cevaplarınızdan geldiği için düzenlenmez ve
  silinmez.

Dün hiç çalışmadıysanız "Hiç çalışmanız yok!" yazar; böylece serideki boşluğu görürsünüz.

<a id="add-session"></a>
## Elle çalışma eklemek

Kronometre'yi açmayı unuttuğunuz bir çalışmayı sonradan ekleyebilirsiniz:

1. **Son Çalışmalarınız** başlığının yanındaki **Çalışma Ekle**'ye dokunun; **Geçmiş Çalışmanızı
   Ekleyin** sayfası açılır.
2. **Ders seçin** ve **Tür Seçin** ile dersi ve türü seçin (başlatırken olduğu gibi).
3. **Çalışma Başlangıcı** ve **Çalışma Bitişi**'ne dokunup tarihi ve saati seçin. Bitiş şimdiye,
   başlangıç bir saat öncesine ayarlı açılır.
4. **Mola Sayısı**'nı ve dakika dakika **Toplam Mola Süresi**'ni girin; isterseniz **Çalışma
   Notu** yazın (en fazla 100 karakter, **Kalan** sayacı gösterir).
5. **Çalışma Ekle**'ye dokunun.

Çalışma süresi, başlangıç ile bitiş arasındaki süreden toplam mola çıkarılarak hesaplanır. Oturum
gelecekte bitemez ve 24 saatten uzun olamaz; molalar bu aralığı aşamaz ve geriye en az 1 dakika
çalışma kalmalıdır. Bir sorun varsa düğmenin altında yazar. Elle eklenen oturum o günü **Çalışma
serisi**'ne katar.

Mevcut bir oturumu **•••** › **Düzenle** ile aynı sayfada (**Çalışmanızı Düzenleyin**)
değiştirirsiniz. Başlangıca, bitişe ve molaya dokunmazsanız ölçülen süreler saniyesine kadar
korunur.

<a id="daily-goal"></a>
## Günlük hedef ve toplam süre

Halkadaki **Toplam Çalışma Süresi** bugün için şunların toplamıdır:

- kart cevaplarına harcadığınız süre (her cevap en fazla **En fazla cevap süresi** kadar),
- kaydettiğiniz Kronometre oturumları,
- bugün başlattığınız ve hâlâ çalışan kronometre.

Kronometre çalışırken yanıtladığınız kartlar iki kez sayılmaz. İstatistikler'deki **Bugün** ›
**Çalışma süresi** yalnızca kart cevaplarını sayar ve seçili desteye uyar, bu yüzden buradaki toplam
genellikle daha yüksektir. Gün, **Sonraki günün başlangıcı** saatinde değişir.

**Günlük Hedef**'i halkanın yanındaki **−** ve **+** ile yarımşar saat değiştirirsiniz (00:30 ile
16:00 arası, varsayılan 08:00). Aynı ayar dişli düğmesindeki **Kronometre ayarları** sayfasında da
vardır. Kronometre çalışırken bugünkü toplam ve hedef üstteki **Bugün** ve **Hedef** yazılarında,
ilerleme de altlarındaki çubukta görünür.

<a id="plan"></a>
## Bugünün planları

**Çalışma Planlama** ile oluşturduğunuz planlardan bugüne düşenler, bugünkü oturumların altında
birer kart olarak görünür:

- Kartta ders, tür ve **Kalan** süre yazar: planlanan süreden o ders için bugün çalıştığınız süre
  (çalışan kronometre dahil) düşülür. Plan dolunca **Tamamlandı ✓** yazar. Kartın altında planın
  saatleri bulunur.
- **▶** düğmesi kronometreyi planın dersi ve türüyle başlatır. Başka bir ders çalışıyorsa **Derse
  geç** onayı çıkar; **Tamam** çalışan oturumu kaydedip planlanan dersi başlatır. Aynı dersi
  çalışırken düğme görünmez.
- Kartın solundaki dişli ve kartın kendisi **Çalışma Planlama**'yı açar.

Hiç planınız yoksa bugünün altında **Çalışma planınız yok!** kartı görünür; **Oluştur** plan
sihirbazını açar. Planlarınız olup hiçbiri bugüne düşmüyorsa kart **Bugün için planınız yok!**
der ve **Planlar** planlarınızı açar.

<a id="exam-date"></a>
## Sınav tarihi

**Bugün** başlığının sağındaki kum saati etiketi sınavınıza kaç gün kaldığını gösterir. Tarih
seçilmemişse **Sınav tarihi ekle** yazar; dokununca **Kronometre ayarları** açılır ve
**Sınav tarihi**'ni seçersiniz. Sonra etikette **45 gün kaldı** veya sınav günü **Sınav bugün**
yazar. Günler takvime göre sayılır. **Kaldır** tarihi siler; sınav tarihi geçince etiket yeniden
**Sınav tarihi ekle** olur.

<a id="reminders"></a>
## Ders ve mola hatırlatmaları
<!-- Uygulamada: Kronometre › başlıktaki zil düğmesi › Hatırlatmalar sayfası (components/stopwatch/StopwatchAlertsSheet.tsx) -->

Bloğun uzunluklarını dişli düğmesindeki **Kronometre ayarları**'nda belirlersiniz:

- **Ders süresi:** Varsayılan 50 dk (5–180 dk). En kısanın altına inince **Kapalı** olur.
- **Mola süresi:** Varsayılan 10 dk (5–60 dk) veya **Kapalı**.

Bu uzunluklar çalışan oturumun kartındaki ilerleme çubuğunu da belirler; **Kapalı** olan için
çubuk görünmez.

Zil düğmesindeki **Hatırlatmalar** sayfasında **Ders ve mola hatırlatmaları** anahtarı (varsayılan
açık) bildirimleri yönetir. Açıkken iPhone, ders bloğu bitince "Ders süresi doldu", mola bitince
"Mola bitti" bildirimini gösterir; bildirime dokunmak Kronometre'yi açar.

- Her blok için tek bildirim gelir; süre, bloğu başlattığınız veya moladan döndüğünüz andan
  sayılır. Bloğun sonunda çalışmayı sürdürürseniz ikinci bildirim gelmez.
- Anahtarı açtığınızda iPhone bildirim izni ister. İzin kapalıysa sayfada bunu söyleyen bir satır
  ve **Ayarları Aç** düğmesi görünür.
- Hatırlatmalar kapalıyken de çalışan oturumun kartı bloğun bittiğini gösterir.

> **Web sürümünde:** Hatırlatmalar yalnızca uygulama bir tarayıcı sekmesinde açıkken gelir; izni
> tarayıcı ister.

<a id="background"></a>
## Uygulamadan çıkınca

Ekrandan çıksanız, telefonu kilitleseniz veya uygulamayı kapatsanız da kronometre çalışmaya devam
eder; süre başlangıç anından hesaplandığı için hiçbir şey kaybolmaz. Moladaysanız mola süresi de
işlemeye devam eder.

- Kronometre ekranı dışında kronometrenin çalıştığını gösteren bir yer yoktur ve kronometre
  kendiliğinden durmaz. Bitirmeyi unuttuysanız oturumu bitirin, sonra **•••** › **Düzenle** ile
  süreyi düzeltin.
- Bir oturum başladığı çalışma gününe yazılır.
- Kaydedilmiş oturumlarınız ve Kronometre ayarlarınız TusAnkiM yedeklerine girer; çalışmakta
  olan kronometre girmez. Bkz. [Yedekler ve bakım](15-backups-and-maintenance.md).

<a id="study-calendar"></a>
## Çalışma Takvimi
<!-- Uygulamada: Çalışma Takvimi başlığındaki ⓘ (yeni, app/study-calendar.tsx:327-334) bilgi sayfasının "Daha fazla bilgi" bağlantısı → bu bölüm -->

Kronometre başlığındaki takvim düğmesiyle veya zaman çizelgesinin altındaki **Çalışma Takvimi**
kartıyla açılır.

- Üstte **Haftalık** / **Aylık** görünüm ve önceki-sonraki oklar vardır. Bir güne dokunmak
  aşağıdaki listeyi o güne kaydırır; soluk görünen komşu ay günlerine dokunmak o aya geçer.
- Her günün altında o günün toplam çalışma süresi `S:DD` biçiminde yazar; bkz.
  [Gün toplamları](#day-totals).
- Takvimin altında görünen ayın veya haftanın oturumları, eski günden yeniye sıralanır.
- **•••** menüsü: kart oturumlarında **Bu oturuma git** (destenin genel bakışını açar); bütün
  oturumlarda **Oturum ayrıntıları** ve **Bu günü haftalık görünümde aç**; Kronometre
  oturumlarında **Düzenle** ve **Oturumu sil**.
- Sağ üstteki grafik simgesi **İstatistikler**'i, sağ alttaki turuncu düğme Kronometre'yi açar.

Çalışmakta olan kronometre, siz bitirince takvime eklenir.

<a id="card-sessions"></a>
## Kart oturumları nasıl oluşur?

Kart oturumları cevaplarınızdan kendiliğinden oluşur:

- Cevaplar güne ve üst desteye göre gruplanır; `Farmakoloji::Otonom` destesindeki bir kart
  "Farmakoloji" oturumuna girer. Filtrelenmiş destede veya özel çalışmada yanıtladığınız kartlar
  kendi destelerinin altında sayılır.
- İki cevap arasında 30 dakikadan fazla geçerse yeni bir oturum başlar.
- **Çalışma**, cevaplara harcanan süredir (her cevap en fazla **En fazla cevap süresi** kadar);
  **Mola**, oturum içinde cevaplar arasında geçen boş süredir.
- Kaydedilmiş bir Kronometre oturumu sırasında verdiğiniz cevaplar o oturumun içinde sayılır, ayrı
  bir kart oturumu olarak görünmez.

Örnek: 09:00 ile 09:40 arasında Farmakoloji destesinden kart yanıtladınız ve cevaplara toplam 25
dakika harcadınız. Oturum **Çalışma 25dk**, **Mola 15dk** gösterir.

<a id="day-totals"></a>
## Gün toplamları

Takvimde her günün altındaki süre, o günkü kart oturumlarının ve Kronometre oturumlarının
**Çalışma** sürelerinin toplamıdır; molalar dahil değildir. İstatistikler'deki
**Tekrarlar › Süre** grafiği ise yalnızca kart cevaplarını sayar. Komşu ayların soluk günlerinde
toplam yazmaz.

## İlgili konular

- [İstatistikler](12-statistics.md)
- [Çalışma ekranı](05-studying.md)
- [Temel kavramlar](02-key-concepts.md#study-day)
- [Yedekler ve bakım](15-backups-and-maintenance.md)
