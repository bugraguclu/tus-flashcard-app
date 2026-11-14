---
id: statistics
title: İstatistikler
summary: Deste ve dönem seçimi, Bugün kartı, Çalışma serisi ve İstatistikler ekranındaki her grafiğin ne gösterdiği.
order: 12
web_path: /yardim/istatistikler
app_help: help?article=statistics
app_screens:
  - "İstatistikler — app/stats.tsx"
  - "İstatistikler hakkında (Bilgi sayfası) — components/stats/StatsHelpSheet.tsx"
  - "Bölümler ve grafikler — components/stats/"
  - "Çalışma serisi hafta şeridi — components/WeekStreakStrip.tsx"
verified_against: claude/zen-tu-bbdc99 (2026-11-08)
---

# İstatistikler

**İstatistikler** ekranı ne kadar çalıştığınızı, önümüzdeki günlerde kaç tekrarın beklediğini ve
kartlarınızın şu anki durumunu gösterir. Açmak için **Desteler** ekranının alt çubuğundaki
**İstatistik** düğmesine ya da bir destenin genel bakışındaki **Deste istatistikleri** düğmesine
dokunun. Sağ üstteki **ⓘ** düğmesi (**İstatistikler hakkında**) grafiklerin kısa açıklamalarını
açar.

> **Web sürümünde:** Geniş bir tarayıcı penceresinde, çalışma ekranının yanındaki kenar çubuğunda
> da **İstatistik** düğmesi bulunur; ekran o an çalıştığınız desteyle açılır.

> **Anki'den farkı:** İstatistikler, Anki'deki grafiklerin bir bölümünü içerir. Takvim ısı
> haritası, gerçek hatırlama (True Retention) tablosu, kart kolaylığı grafiği ve FSRS'ye özgü
> kararlılık, zorluk ve hatırlanabilirlik grafikleri yoktur. Bir grafikten Kartlarım'a yalnızca
> **Eklenenler** grafiğiyle geçebilirsiniz. **Bugün** kartı, **Çalışma serisi** ve **Desteler**
> satırları ise TusAnkiM'e özgüdür. Hangi günlerde çalıştığınızı görmek için ısı haritası yerine
> [Çalışma Takvimi](13-stopwatch-and-calendar.md#study-calendar)'ni kullanın.

<a id="scope-and-period"></a>
## Deste ve dönem seçimi
<!-- Uygulamada: İstatistikler › Bilgi › "Deste ve dönem" bölümü (components/stats/StatsHelpSheet.tsx:12-15); bilgi sayfasının "Daha fazla bilgi" bağlantısı (yeni) → bu makale -->

Ekranın en üstünde iki seçici vardır:

- **Deste seçici** (**Tüm koleksiyon** veya destenin adı): Bir deste seçtiğinizde bütün ekran o
  desteyi ve alt destelerini gösterir. Filtrelenmiş bir deste seçerseniz o an içinde bulunan
  kartlar sayılır. Deste değiştirmek seçtiğiniz dönemi değiştirmez.
- **Zaman aralığı** (varsayılan **Yıl**): **Hafta**, **Ay**, **3 Ay**, **Yıl** veya **Tümü**.
  Grafiklerin üstünde seçilen dönemin adı yazar (**Son hafta**, **Son ay**, **Son 3 ay**,
  **Son 1 yıl**, **Tüm zamanlar**).

İstatistikler'i bir destenin genel bakışından açarsanız ekran o desteyle, Desteler ekranının alt
çubuğundan açarsanız tüm koleksiyonla başlar.

Dönem her bölümü aynı biçimde etkilemez:

| Bölüm | Deste seçimine uyar mı? | Döneme uyar mı? |
| --- | --- | --- |
| Bugün | Evet | Hayır, her zaman bugün |
| Çalışma serisi | Hayır, her zaman tüm koleksiyon | Hayır |
| Gelecek vadeler | Evet | Dönem kadar ileriye bakar |
| Tekrarlar, Cevap düğmeleri, Saatlik dağılım, Eklenenler | Evet | Evet |
| Tekrar aralıkları | Evet | Yalnızca grafiğin üst sınırı |
| Kart sayıları, Desteler | Evet | Hayır |

Günler gece yarısında değil **Sonraki günün başlangıcı** saatinde değişir (varsayılan 04:00;
**Ayarlar › İnceleme › Zamanlama**). Bkz. [Çalışma günü](02-key-concepts.md#study-day).

<a id="today"></a>
## Bugün
<!-- Uygulamada: İstatistikler › Bilgi › "Bugün" bölümü (yeni) → bu bölüm -->

**Bugün** kartı bu çalışma gününde verdiğiniz cevapları özetler. Deste seçiciye uyar, dönemden
etkilenmez.

- **Cevap:** Bugün verdiğiniz bütün cevaplar: yeni, öğrenme ve tekrar kartları ile
  filtrelenmiş destede verdiğiniz cevaplar. Geri aldığınız bir cevap sayıdan düşer.
- **Doğruluk:** Bugünkü cevaplarınızın yüzde kaçında **Tekrar** dışında bir düğmeye bastığınız.
  Henüz cevap yoksa "—" görünür.
- **Süre:** Bugün cevaplara harcadığınız toplam süre. Bir kartta ne kadar beklerseniz
  bekleyin, her cevap en fazla **En fazla cevap süresi** kadar sayılır (varsayılan 60 saniye;
  **Deste seçenekleri › Zamanlayıcılar**).
- **Yeni kart:** Bugün ilk kez cevapladığınız kart sayısı.

**Kronometre** ile ölçtüğünüz süre bu **Süre**'ye eklenmez. Kart çalışmanızla
Kronometre oturumlarınızın toplamını Kronometre ekranındaki halkada görürsünüz; bkz.
[Günlük hedef ve toplam süre](13-stopwatch-and-calendar.md#daily-goal).

<a id="streak"></a>
## Çalışma serisi
<!-- Uygulamada: İstatistikler › Bilgi › "Çalışma serisi" bölümü (yeni) → bu bölüm -->

**Çalışma serisi** art arda kaç gün çalıştığınızı gösterir. Kartın altında **Tüm koleksiyon**
yazar: seri, deste seçiminden bağımsız olarak bütün koleksiyonunuz için hesaplanır.

- Bir gün, o gün **en az bir kart yanıtladıysanız** veya **Kronometre'de bir oturum
  kaydettiyseniz** seriye sayılır. Bir Kronometre oturumu başladığı güne yazılır.
- Bugün henüz çalışmadıysanız seri dünden geriye sayılır; gün bitene kadar kırılmış görünmez.
- **En uzun:** Şimdiye kadarki en uzun seriniz.
- Hafta şeridinde Pazartesi'den Pazar'a yedi gün vardır. Çalıştığınız günler turuncu dolu,
  henüz çalışmadığınız bugün turuncu çerçeveli görünür. Önceki haftalar için oklara dokunun veya
  şeridi yana kaydırın.
- Kartın başlığına veya gün sayısına dokunmak **Kronometre**'yi açar.

Kronometre'de elle eklediğiniz bir oturum da, geçmiş bir gün için olsa bile, o günü seriye katar.
Çalışmakta olan bir kronometre ise ancak bitirip kaydettiğinizde sayılır. Seri sayınız çalışma
ekranının başlığında küçük bir alevle de görünür; o gün henüz çalışmadıysanız soluktur.

> **Web sürümünde:** Hafta şeridindeki bir günün üzerine fareyle gelince o günün çalışılıp
> çalışılmadığı yazar.

<a id="future-due"></a>
## Gelecek vadeler
<!-- Uygulamada: İstatistikler › Bilgi › "Gelecek vadeler" bölümü (StatsHelpSheet.tsx:16-19) → bu bölüm -->

Önümüzdeki günlerde kaç kartın vadesinin geleceğini gösterir. Hesap, bundan sonra yeni kart
öğrenmeyeceğinizi ve hiçbir kartı unutmayacağınızı varsayar; gerçek sayılar biraz daha yüksek
olur.

- **Bugünden** bugün ve sonrasında vadesi gelen kartları gösterir. **Gecikenlerle**
  (varsayılan) bunlara vadesi geçmiş kartları da ekler; gecikenler kesik çizgili **Bugün**
  işaretinin solunda durur.
- Sütunlar **Genç** ve **Olgun** kartlara bölünür. Bir kartın aralığı, son tekrarıyla bir sonraki
  tekrarı arasındaki gün sayısıdır; aralığı 21 günden kısa olan kart gençtir, 21 gün veya daha
  uzun olan olgundur.
- Hiçbir sütun seçili değilken grafiğin üstünde **Vadesi gelecek** kart sayısı yazar. Bir sütunu
  seçince o sütunun sayısı ile **Birikimli** toplam görünür: o sütuna kadar vadesi gelecek bütün
  kartlar.
- Grafik seçtiğiniz dönem kadar ileriye bakar: **Son hafta** seçiliyken önümüzdeki haftayı,
  **Son 1 yıl** seçiliyken yaklaşık bir yılı gösterir; **Tüm zamanlar** en uzak vadeye kadar
  gider. Uzun dönemlerde her sütun bir hafta, iki hafta veya bir aydır.
- Yeni kartlar ve askıya alınmış kartlar sayılmaz. Vadesi bugün veya daha önce olan gömülü
  kartlar da dışarıda kalır.

| Kutu | Anlamı |
| --- | --- |
| **Günlük yük** | Her gün ortalama kaç tekrar geleceğinin tahmini. Kısa aralıklı kartlar bu sayıyı büyütür. |
| **Yarın** | Yarın vadesi gelen kart sayısı. |
| **Geciken** | Vadesi geçmiş kart sayısı; yalnızca **Gecikenlerle** seçiliyken görünür. |

<a id="reviews"></a>
## Tekrarlar
<!-- Uygulamada: İstatistikler › ⓘ › "Tekrarlar" bölümü (StatsHelpSheet.tsx) → bu bölüm -->

Seçilen dönemde verdiğiniz cevapları gösterir. Üstteki **Cevap** / **Süre** düğmesiyle cevap
sayısı ile cevaplara harcanan süre arasında geçiş yaparsınız.

- Sütunlar **Son hafta** ve **Son ay** için günleri, **Son 3 ay** için haftaları, **Son 1 yıl**
  için ayları gösterir. **Tüm zamanlar** geçmişin uzunluğuna göre gün, hafta, ay veya yıl
  sütunları kullanır.
- Renkler cevabın türüdür: **Olgun** ve **Genç** (tekrar kartları, 21 günlük aralığa göre),
  **Yeniden öğrenme**, **Öğrenme** ve **Filtreli**. **Filtreli**, filtrelenmiş destede veya özel
  çalışmada vadesinden önce tekrarlanan ya da önizlenen (yeniden zamanlanmadan çalışılan)
  kartların cevaplarıdır; orada vadesi gelmiş bir karta verdiğiniz cevap kendi türünde sayılır.
  Bkz. [Filtrelenmiş deste ve özel çalışma](11-filtered-decks.md).
- Bir sütunu seçince grafiğin üstünde o günün veya haftanın değeri ile **Birikimli** toplam yazar.

Grafiğin altındaki kutular:

- **Çalışılan gün:** En az bir cevap verdiğiniz gün sayısı / dönemdeki gün sayısı.
- **Günlük ortalama:** Dönemdeki bütün günlere bölünmüş ortalama.
- **Çalışılan günlerde:** Yalnızca çalıştığınız günlere bölünmüş ortalama. Dönemin her günü
  çalıştıysanız görünmez.
- **Cevap başına:** Bir cevaba ortalama kaç saniye harcadığınız; altında dakikada kaç kart
  yanıtladığınız yazar.

Örnek: **Son ay** (31 gün) içinde 20 gün çalışıp toplam 1.240 cevap verdiyseniz **Çalışılan gün**
`20 / 31` (%65), **Günlük ortalama** 40, **Çalışılan günlerde** 62 görünür.

<a id="answer-buttons"></a>
## Cevap düğmeleri
<!-- Uygulamada: İstatistikler › Bilgi › "Cevap düğmeleri" bölümü (yeni) → bu bölüm -->

Seçilen dönemde **Tekrar**, **Zor**, **İyi** ve **Kolay** düğmelerine kaç kez bastığınızı
gösterir. Her sütun **Öğrenme** (öğrenme, yeniden öğrenme ve filtrelenmiş destedeki cevaplar),
**Genç** ve **Olgun** kartlara bölünür.

- Sütunların altında her düğmenin toplamı yazar.
- En alttaki üç oran (**Öğrenme kartlarında doğru**, **Genç kartlarda doğru**, **Olgun kartlarda
  doğru**) o türdeki cevaplarınızın yüzde kaçının **Tekrar** dışında olduğunu gösterir. Olgun
  kartlardaki oran, uzun aralıklı kartları ne kadar hatırladığınızın kaba bir göstergesidir.
- **Son ay** seçiliyken bu grafik son 30 günü sayar (Anki'deki gibi).

<a id="true-retention"></a>
## Gerçek Hatırlama

Bu tablo, aralığı en az bir gün olan kartlarda bellek sınamalarının kaçını geçtiğinizi gösterir
(Anki 24.11 ve sonrasındaki **True Retention** tablosu). **Tekrar** "kaldı", **Zor**, **İyi** ve
**Kolay** "geçti" sayılır; yeni kartların ilk öğrenme adımları sayılmaz. **Genç** kartların cevap
verildiğindeki aralığı 21 günden kısa, **Olgun** kartlarınki 21 gün ve üzeridir.

- Satırlar **Bugün**, **Dün**, **Geçen hafta**, **Geçen ay**, **Geçen yıl** ve **Tümü**'dür;
  hafta, ay ve yıl bugünle biten 7, 30 ve 365 günü kapsar, bu yüzden bir cevap birden çok satırda
  sayılabilir. Tablo seçili deste kapsamını izler, dönem seçimini izlemez.
- **Basit** görünüm yüzdeleri, **Ayrıntılı** görünüm geçti/kaldı sayılarını da gösterir. Boş hücre
  **—** ile gösterilir.

<a id="hourly"></a>
## Saatlik dağılım
<!-- Uygulamada: İstatistikler › Bilgi › "Saatlik dağılım" bölümü (StatsHelpSheet.tsx:24-27) → bu bölüm -->

Cevaplarınızı günün saatine göre dağıtır (00–23, cihazınızın saati). **Filtreli** cevaplar
(bkz. [Tekrarlar](#reviews)) bu grafiğe girmez. **Son ay** seçiliyken son 30 gün sayılır.

- Altındaki **Doğru cevap oranı** çizgisi, her saatte **Tekrar** dışındaki cevapların payıdır.
  Farklar görünsün diye çizginin ölçeği %0'dan değil, en düşük saatin biraz altından başlar; soldaki
  iki etiket ölçeğin alt ve üst sınırıdır.
- Bir saate dokununca hem sütunda hem çizgide işaretlenir.
- **En yoğun saat** en çok cevap verdiğiniz saattir. **En başarılı saat** doğru oranı en yüksek
  saattir; bir saatin hesaba katılması için o saatte en az 10 cevap ve bütün cevaplarınızın en az
  %3'ü gerekir. Hiçbir saat bu eşiği geçmiyorsa **Yeterli veri yok** yazar.

<a id="intervals"></a>
## Tekrar aralıkları
<!-- Uygulamada: İstatistikler › ⓘ › "Tekrar aralıkları" bölümü (StatsHelpSheet.tsx) → bu bölüm -->

Tekrar ve yeniden öğrenme aşamasındaki kartlarınızın şu anki aralıklarını gösterir. Sütun
etiketleri gün sayısıdır (ör. `5g`, `1–7g`).

- Dönem yalnızca grafiğin üst sınırını belirler: **Son 1 yıl** seçiliyken aralığı 365 günden uzun
  kartlar grafikte görünmez, **Tüm zamanlar** hepsini gösterir. Grafiğin altında daha uzun
  aralıktaki kartların sayısı yazar.
- **Ortalama aralık** ve **En uzun aralık**, dönemden bağımsız olarak bütün tekrar kartlarınızı
  hesaba katar.

Tek bir kartın aralığını ve tekrar geçmişini görmek için **Kart bilgisi** ekranını kullanın; bkz.
[Kartlarım ve arama](10-browser-and-search.md#card-info).

<a id="card-counts"></a>
## Kart sayıları
<!-- Uygulamada: İstatistikler › Bilgi › "Kart sayıları" bölümü (yeni) → bu bölüm -->

Kartlarınızın **şu anki** durumunu gösterir; dönemden etkilenmez.

| Satır | Hangi kartlar? |
| --- | --- |
| **Olgun** | Aralığı 21 gün veya daha uzun tekrar kartları |
| **Genç** | Aralığı 21 günden kısa tekrar kartları |
| **Öğrenme** | İlk öğrenme adımlarındaki kartlar |
| **Yeniden öğrenme** | Unutulup yeniden öğrenilen kartlar |
| **Görülmemiş** | Hiç çalışmadığınız yeni kartlar |
| **Askıda** | Askıya aldığınız kartlar, hangi aşamada olursa olsun |
| **Gömülü** | Gömülmüş kartlar, hangi aşamada olursa olsun |

Askıdaki ve gömülü kartlar yalnızca kendi satırlarında sayılır. En altta **Toplam kart**,
**Toplam not** ve **Not başına kart** yazar. Kart durumları için bkz.
[Kart durumları](02-key-concepts.md#card-states).

<a id="added"></a>
## Eklenenler
<!-- Uygulamada: İstatistikler › Bilgi › "Eklenenler" bölümü (yeni) → bu bölüm -->

Seçilen dönemde kaç kart oluşturulduğunu gösterir. Altındaki kutular **Toplam** ve dönemin
günlerine bölünmüş **Günlük ortalama**dır.

- Bir kartın tarihi, oluşturulduğu gündür. İçe aktarılan kartlar özgün oluşturulma tarihini
  korur: bugün içe aktardığınız hazır bir deste, yazarının kartları eklediği günlere dağılır.
- Grafiğin üstünde **Kartları görmek için bir sütuna dokunun** yazar. Dolu bir sütuna dokunmak
  **Kartlarım**'ı o günlerde eklenen kartlarla açar; arama kutusunda
  `added:` ile başlayan bir arama görürsünüz. Kartlar ortak bir destedeyse Kartlarım o desteyle,
  değilse İstatistikler'de seçili desteyle açılır. Geri döndüğünüzde deste ve dönem korunur.
- Bir sütunu açmadan değerine bakmak için parmağınızı grafiğin üzerinde yana kaydırın.

Arama yazımı için bkz. [Kartlarım ve arama](10-browser-and-search.md).

<a id="deck-progress"></a>
## Desteler
<!-- Uygulamada: İstatistikler › en alttaki "Desteler" / "Alt desteler" başlığının altı, kısa ipucu (yeni; components/stats/DeckProgressSection.tsx:26) → bu bölüm -->

Ekranın en altında, tüm koleksiyon seçiliyken üst desteleriniz (**Desteler**), bir deste
seçiliyken onun alt desteleri (**Alt desteler**) listelenir. Filtrelenmiş desteler listede yer
almaz.

- Destenin adının yanındaki yüzde, kartlarının en az bir kez çalışılmış olanlarının payıdır;
  kartların ne kadar olgunlaştığını değil, ne kadarını açtığınızı gösterir.
- Çubuk **Olgun**, **Genç**, **Öğrenme** ve yeni kartlara bölünür; altında kart sayıları yazar.
- Bir desteye dokunmak bütün ekranı o desteye göre gösterir ve sayfanın başına kaydırır.

<a id="chart-tips"></a>
## Grafikleri kullanma
<!-- Uygulamada: İstatistikler › ⓘ › "Grafikleri kullanma" bölümü (StatsHelpSheet.tsx) → bu bölüm -->

- **Tekrarlar**, **Gelecek vadeler**, **Tekrar aralıkları** ve **Saatlik dağılım:** Bir sütuna
  dokununca grafiğin üstündeki satır o sütunun değerini gösterir; kapatmak için aynı sütuna
  yeniden dokunun.
- **Eklenenler**'de dolu bir sütuna dokunmak değerini göstermez, o kartları açar.
- Bu beş grafikte parmağınızı yana kaydırarak sütundan sütuna geçer, değerleri okursunuz; bu
  sırada sayfa kaymaz ve iPhone her sütunda hafifçe titreşir. Yukarı-aşağı kaydırma sayfayı
  kaydırır.
- **Cevap düğmeleri** sayılarını her zaman gösterir; dokunmak gerekmez.
- **VoiceOver:** Bu grafiklerde yukarı veya aşağı kaydırarak sütunlar arasında ilerlersiniz;
  **Eklenenler**'de seçili sütuna çift dokunmak kartları açar.
- Bir grafik boşsa başka bir deste veya daha uzun bir dönem seçin.

> **Web sürümünde:** Sütunları fareyle tıklayarak seçebilirsiniz.

## İlgili konular

- [Kronometre ve çalışma takvimi](13-stopwatch-and-calendar.md)
- [Temel kavramlar](02-key-concepts.md)
- [Kartlarım ve arama](10-browser-and-search.md)
- [Filtrelenmiş deste ve özel çalışma](11-filtered-decks.md)
- [Deste seçenekleri](06-deck-options.md)
