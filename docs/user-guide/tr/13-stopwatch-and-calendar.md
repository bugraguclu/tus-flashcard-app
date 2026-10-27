---
id: stopwatch
title: Kronometre ve çalışma takvimi
summary: Kronometre ile ders süresini ölçme, mola, günlük hedef, sınav tarihi, hatırlatmalar ve Çalışma Takvimi'ndeki oturumlar.
order: 13
web_path: /yardim/kronometre
app_help: help?article=stopwatch
app_screens:
  - "Kronometre — app/stopwatch.tsx"
  - "Kronometre sayfaları — components/stopwatch/ (SubjectPickerSheet, SessionEditorSheet, StopwatchSettingsSheet, StopwatchAlertsSheet, SessionActionsMenu)"
  - "Çalışma Takvimi — app/study-calendar.tsx"
verified_against: master c6108e6 (2026-10-25)
---

# Kronometre ve çalışma takvimi

**Kronometre**, kartların dışında yaptığınız çalışmayı (ders okuma, soru çözme, deneme sınavı) da
ölçer ve günlük hedefinize ekler. **Çalışma Takvimi** kart çalışmalarınızı ve Kronometre
oturumlarınızı gün gün listeler. Kronometre'yi açmak için **İstatistikler** ekranındaki
**Çalışma serisi** kartına dokunun; Çalışma Takvimi'ni Kronometre'nin sağ alt köşesindeki takvim
düğmesiyle açarsınız.

> **Anki'den farkı:** Kronometre ve Çalışma Takvimi TusAnkiM'e özgüdür; Anki'de karşılıkları
> yoktur. Kronometre oturumları `.apkg` paketlerine girmez, TusAnkiM yedeklerinde saklanır.

> **Web sürümünde:** Geniş bir tarayıcı penceresinde, çalışma ekranının yanındaki kenar çubuğunda
> **⏱️ Kronometre** ve **Çalışma Takvimi** düğmeleri de bulunur.

<a id="stopwatch"></a>
## Kronometre ekranı
<!-- Uygulamada: Kronometre başlığındaki ⓘ (yeni, app/stopwatch.tsx:324-341) bilgi sayfasının "Daha fazla bilgi" bağlantısı → bu bölüm -->

- **Halka:** Bugünkü toplam çalışma sürenizi gösterir ve günlük hedefe doğru dolar. Kronometre
  çalışırken ortada ders adı ve bu oturumun süresi görünür.
- **Günlük Hedef** ve **Başla** düğmesi halkanın yanındadır.
- **Son Çalışmalarınız:** Bugün ve önceki altı gün; en yeni gün en üstte.
- Başlıkta zil (hatırlatmalar) ve dişli (Kronometre ayarları) düğmeleri, sağ altta Çalışma
  Takvimi düğmesi vardır.

Kronometre oturumları İstatistikler'deki grafiklere ve **Bugün** kartındaki **Çalışma süresi**'ne
girmez; **Çalışma serisi**'ni ise etkiler. Bkz. [Çalışma serisi](12-statistics.md#streak).

<a id="start-and-break"></a>
## Başlatmak ve mola vermek

1. **Başla**'ya dokunun.
2. **Hangi dersi çalışacaksınız?** sayfasında bir ders seçin: **Planınız**, **Son çalışılanlar**
   veya **TUS dersleri** (temel ve klinik bilimler, ayrıca **Soru Çözümü** ve **Deneme Sınavı**).
   Listede olmayan bir ders için adını arama kutusuna yazıp **Yeni ders olarak kullan** satırına
   dokunun.
3. Kronometre hemen başlar.

- **Mola ver:** Çalışma süresi durur, mola süresi işlemeye başlar; halkada **Molada** yazar.
  **Devam et** ile çalışmaya dönersiniz.
- Düğmelerin altındaki satır süreyi bloğun uzunluğuyla karşılaştırır, örneğin
  `Ders bloğu 00:25:00 / 00:50:00`. Süre dolunca "Ders süresi doldu — kısa bir mola
  verebilirsiniz." yazar. Kronometre kendiliğinden durmaz veya molaya geçmez.
- **Tekrar sayısı:** **Başla** ile açtığınız bir ders, o dersin son oturumundaki tekrar
  sayısıyla devam eder (ilk kez çalışıyorsanız 1). Değiştirmek için
  [Bugünün planı](#plan)'nı veya oturumu düzenlemeyi kullanın.

<a id="finish"></a>
## Bitirmek

**Bitir**'e dokunduğunuzda çalışma ve mola toplamını gösteren bir onay gelir; **Tamam** oturumu
kaydeder, **İptal** kronometreyi çalışır bırakır. Kaydedilen oturum **Bugün** altında ve Çalışma
Takvimi'nde görünür, günlük hedefe ve **Çalışma serisi**'ne sayılır.

Bir dakikadan kısa çalışmalar kaydedilmez: **Kısa çalışma** uyarısında **Tamam** kronometreyi
kaydetmeden sıfırlar. Daha uzun bir oturumu kaydetmek istemiyorsanız bitirdikten sonra silin
(bkz. [Oturumlar](#sessions)).

<a id="sessions"></a>
## Son Çalışmalarınız ve oturumlar

Zaman çizelgesinde iki tür oturum görünür:

- **Kart oturumları (✓):** Kart yanıtladığınızda kendiliğinden oluşur; bkz.
  [Kart oturumları nasıl oluşur?](#card-sessions).
- **Kronometre oturumları:** Kronometre ile ölçtükleriniz (kronometre simgesi) ve elle
  eklediğiniz (✎).

Her oturum kartında ders adı, **Çalışma** ve **Mola** süreleri, **Zaman aralığı** ve bir
**N. Tekrar** etiketi bulunur. Bu etiket Kronometre oturumunda dersi kaçıncı kez çalıştığınızı,
kart oturumunda ise o gün o dersteki kaçıncı oturum olduğunu gösterir.

Kartın solundaki **•••** düğmesi:

- Kronometre oturumu: **Düzenle**, **Oturum ayrıntıları**, **Oturumu sil**. Silme kalıcıdır; o
  günün tek çalışmasıysa gün seriden düşer.
- Kart oturumu: **Bu desteye git** (destenin genel bakışını açar) ve **Oturum ayrıntıları**
  (kart ve yanıt sayısı, deste). Kart oturumları cevaplarınızdan geldiği için düzenlenmez ve
  silinmez.

Hiç çalışmadığınız bir gün için "Hiç çalışmanız yok!" yazar; böylece seride boşluk olan günleri
görürsünüz.

<a id="add-session"></a>
## Elle çalışma eklemek

Kronometre'yi açmayı unuttuğunuz bir çalışmayı sonradan ekleyebilirsiniz:

1. **Son Çalışmalarınız** başlığının yanındaki **Çalışma Ekle**'ye dokunun.
2. **Ders seçin**'e dokunup dersi seçin, gerekirse **Tekrar** sayısını değiştirin.
3. **Tarih** ve **Başlangıç saati**'ni seçin. **Çalışma süresi**'ni saat ve 5 dakikalık adımlarla,
   **Mola**'yı da oturum içindeki toplam mola olarak girin.
4. **Kaydet**'e dokunun.

Oturum en az 1 dakika olmalı ve gelecekte bitmemelidir; tarih bugün veya daha önce olabilir. Elle
eklenen oturum o günü **Çalışma serisi**'ne katar. Mevcut bir oturumu **•••** › **Düzenle** ile
aynı sayfada (**Çalışmayı düzenle**) değiştirirsiniz.

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
vardır.

<a id="plan"></a>
## Bugünün planı

Bugünkü oturumların altındaki satır, bugün çalışmayı planladığınız dersi gösterir:

- **Kalan:** Günlük hedefe ulaşmak için kalan süre. Hedefe ulaştığınızda **Hedef tamamlandı ✓**
  yazar.
- **Başlat:** Planlanan dersi tek dokunuşla başlatır. Başka bir ders çalışıyorsa **Derse geç**
  onayı çıkar; **Tamam** çalışan oturumu kaydedip planlanan dersi başlatır.

Planı seçmek veya değiştirmek için satırdaki dişliye ya da "Bugün hangi dersi çalışacaksınız?"
kartına dokunun. **Bugünün planı** sayfasında önce **Tekrar** sayısını (1–20), sonra dersi seçin.
**Planı kaldır** planı siler; planınız yokken başlattığınız ilk ders otomatik olarak plan olur.

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

Zil düğmesindeki **Hatırlatmalar** sayfasında **Ders ve mola hatırlatmaları** anahtarı (varsayılan
açık) bildirimleri yönetir. Açıkken iPhone, ders bloğu bitince "Ders süresi doldu", mola bitince
"Mola bitti" bildirimini gösterir; bildirime dokunmak Kronometre'yi açar.

- Her blok için tek bildirim gelir; süre, bloğu başlattığınız veya moladan döndüğünüz andan
  sayılır. Bloğun sonunda çalışmayı sürdürürseniz ikinci bildirim gelmez.
- Anahtarı açtığınızda iPhone bildirim izni ister. İzin kapalıysa sayfada bunu söyleyen bir satır
  ve **Ayarları Aç** düğmesi görünür.
- Hatırlatmalar kapalıyken de düğmelerin altındaki satır bloğun bittiğini gösterir.

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

Kronometre'nin sağ altındaki takvim düğmesiyle veya zaman çizelgesinin altındaki
"Tüm çalışmalarınız Çalışma Takvimi’nde ›" bağlantısıyla açılır.

- Üstte **Haftalık** / **Aylık** görünüm ve önceki-sonraki oklar vardır. Bir güne dokunmak
  aşağıdaki listeyi o güne kaydırır; soluk görünen komşu ay günlerine dokunmak o aya geçer.
- Her günün altında o günün toplam çalışma süresi `S:DD` biçiminde yazar; bkz.
  [Gün toplamları](#day-totals).
- Takvimin altında görünen ayın veya haftanın oturumları, eski günden yeniye sıralanır.
- **•••** menüsü: kart oturumlarında **Bu oturuma git** (destenin genel bakışını açar); bütün
  oturumlarda **Oturum ayrıntıları** ve **Bu günü haftalık görünümde aç**; Kronometre
  oturumlarında **Oturumu sil**. Düzenleme yalnızca Kronometre ekranında, son yedi gün için
  yapılır.
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
