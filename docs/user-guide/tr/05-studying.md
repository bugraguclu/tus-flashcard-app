---
id: studying
title: Çalışma ekranı
summary: Kart çalışma, cevap düğmeleri, sayılar, geri alma, kart menüsü, yazı tahtası, kısayollar, zaman kutusu ve bitiş ekranı.
order: 5
web_path: /yardim/calisma-ekrani
app_help: help?article=studying
app_screens:
  - "Çalışma ekranı, klasik ve yeni düzen — app/(tabs)/index.tsx"
  - "Durum göstergeleri — components/reviewer/ReviewerStatusItems.tsx"
  - "Kart ve not seçenekleri menüsü (⋮) — components/CardOptionsMenu.tsx"
  - "Bayrak rengi menüsü — components/ReviewerFlagMenu.tsx"
  - "Deste seç penceresi — components/DeckPickerModal.tsx"
  - "Yazı tahtası — components/WhiteboardOverlay.tsx"
  - "Kart görünümü: yazarak cevap, ses, bağlantılar — components/CardWebView.tsx"
verified_against: master c6108e6 (2026-10-25)
---

# Çalışma ekranı

Çalışma ekranında kartlarınızı tek tek görür, cevabı açar ve ne kadar iyi hatırladığınızı
bildirirsiniz. Uygulama her cevaba göre kartın ne zaman yeniden geleceğini hesaplar. Ekranı açmak
için **Desteler** listesinde bir destenin adına dokunun.

<a id="open-study"></a>
## Çalışmaya başlama
<!-- Uygulamada: Çalışma ekranı › ⋮ menüsü › "Çalışma ekranı hakkında" (yeni) bilgi sayfasının "Daha fazla bilgi" bağlantısı → bu makale -->

- **Desteler** listesinde destenin adına dokunun; çalışma doğrudan o destede başlar. Bir üst
  desteyi seçerseniz alt destelerinin kartları da gelir.
- Destenin **•••** menüsündeki **Genel bakış** ekranında **Şimdi çalış** da aynı yere götürür.
- Deste menüsündeki **Kısayol oluştur** ile yaptığınız kısayol desteyi doğrudan açar.
  Bkz. [Kısayollar ve otomasyon](18-shortcuts-and-automation.md).

Çalışmadan çıkmak için sol üstteki **‹** düğmesine dokunun veya ekranın sol kenarından sağa
kaydırın. Çalışmaya nereden başlamış olursanız olun, ikisi de sizi **Desteler** listesine götürür.

> **Web sürümünde:** Pencere en az 768 piksel genişse çalışma ekranının solunda bir kenar çubuğu
> görünür; oradan dersler, konular ve desteler arasında geçebilirsiniz. iPhone'da bu çubuk yoktur.

<a id="change-deck"></a>
### Başka desteye geçme

Üst çubukta destenin adına (▾ işaretli alan) dokunun; **Deste seç** penceresi açılır.

- Bir desteye dokunursanız çalışma o desteyle sürer; ekran kapanmaz, yalnızca kartlar değişir.
- **Tüm desteler** bütün destelerinizi birlikte çalıştırır; başlıkta **Bugünün kartları** yazar.
- 🔍 ile desteleri süzebilir, **＋** ile yeni bir deste oluşturabilirsiniz; yeni deste hemen seçilir.

Deste değiştirdiğinizde ekrandaki kart, geri alma geçmişi ve yazı tahtasındaki çizim sıfırlanır.

<a id="screen-layouts"></a>
## Klasik ve yeni çalışma ekranı

Ekran yukarıdan aşağıya şöyledir: üst çubuk (**‹**, deste adı, durum göstergeleri, **↶** geri al,
**⚑** bayrak, **⚙** deste ayarları, **⋮** kart menüsü), kartın dersi ve konusu, kartın kendisi,
en altta **Cevabı göster** ve cevap düğmeleri.

İki düzen vardır. **Klasik** düzen varsayılandır; yeni düzeni
**Ayarlar › Yeni çalışma ekranı › Yeni çalışma ekranını kullan** ile açarsınız. Kartlar, düğmeler ve
menüler ikisinde aynıdır. Farklar:

| Özellik | Klasik (varsayılan) | Yeni |
| --- | --- | --- |
| Üst çubuk | Her zaman üstte, büyük deste adıyla | **Araç çubuğu konumu** ile üstte veya altta |
| Kalan kart sayıları | Düğmelerin altında ortada: `yeni + öğrenme + tekrar` | Üst çubukta, deste adının altında |
| Günlük seri (🔥) | Deste adının yanında | Kartın üstündeki ders satırında |
| **Tekrar**'a basınca | Kısa titreşim | Titreşim ve sol altta kırmızı **×** |

**Ayarlar › Yeni çalışma ekranı** bölümündeki öteki seçenekler (çerçeve stili, sayılar, deste
başlığı, kalan süre, araç çubuğunu gizleme, cevap düğmeleri, otomatik ilerleme) iki düzende de
geçerlidir. **Araç çubuğunu göster** kapalıyken **‹**, **↶**, **⚑**, **⚙** ve **⋮** düğmeleri de
gizlenir; menülere o zaman **Yüzen Araçlar düğmesi** veya bir kaydırma hareketiyle ulaşırsınız.
Bkz. [Ayarlar](16-settings.md).

<a id="show-answer"></a>
## Soruyu görme ve cevabı açma

1. Soruyu okuyun ve cevabı aklınızdan söylemeye çalışın.
2. **Cevabı göster**'e dokunun. Karta dokunmak veya boşluk tuşuna basmak da cevabı açar.
3. Kart ekrandan uzunsa ekran cevabın başladığı çizgiye kayar.
4. Ne kadar iyi hatırladığınızı bir cevap düğmesiyle bildirin.

- Cevap açıldıktan hemen sonraki kısa süre içinde (varsayılan 200 ms) gelen dokunmalar sayılmaz;
  böylece çift dokunma kartı yanlışlıkla puanlamaz. Süre:
  **Ayarlar › Erişilebilirlik › Çift dokunma aralığı**.
- **Cevabı göster basılı tutma süresi** 0'dan büyükse düğme dokunmayla değil, basılı tutunca çalışır.
- Kartın içindeki bir bağlantıya dokunursanız önce **Dış bağlantı açılsın mı?** diye sorulur.
  İpucu alanları dokununca açılır.

> **Web sürümünde:** Cevap açılınca ekran cevaba kendiliğinden kaymaz.

<a id="answer-buttons"></a>
## Cevap düğmeleri

Cevap açılınca dört düğme görünür: **Tekrar**, **Zor**, **İyi**, **Kolay**. Hangisine ne zaman
basılacağı için bkz. [Temel kavramlar](02-key-concepts.md#answer-buttons).

- Her düğmenin üstünde kartın o seçimle ne zaman geleceği yazar: `1dk`, `10dk`, `1 gün`, `1.5 ay`.
  Önünde `<` olan süre (`<10dk`), kartın o süre dolmadan da gelebileceğini gösterir
  (bkz. [Öğrenme kartlarını beklerken](#learn-ahead)).
- **Sonraki inceleme süresini göster** kapalıysa süreler gizlenir. **Zor ve Kolay düğmelerini gizle**
  yalnızca **Tekrar** ve **İyi**'yi bırakır; zamanlama değişmez.
- Düğmeleri büyütmek için **Ayarlar › Erişilebilirlik › Yanıt düğmesi boyutu** (%100–175) ve
  **Büyük yanıt düğmelerini iki satırda göster**.
- **Yanıt düğmelerini göster** kapalıysa kartları dokunma bölgeleri veya kaydırmayla cevaplarsınız;
  bu seçenek yalnızca ikisinden biri açıkken kapatılabilir.

Önizleme olarak kurulmuş bir filtrelenmiş destede kartın üstünde **ÖNİZLEME** yazar; cevaplarınız
kartın zamanlamasını değiştirmez. Düğmelerde kartın ne kadar sonra yeniden geleceği, **(bitiş)**
yazan düğmede ise kartın önizlemeden çıkacağı gösterilir.
Bkz. [Filtrelenmiş deste ve özel çalışma](11-filtered-decks.md).

<a id="counts"></a>
## Sayılar, süre ve seri

Üç renkli sayı, bu çalışmada kalan kartları gösterir: soldan sağa **yeni**, **öğrenme** ve
**tekrar**. Altı çizili sayı, ekrandaki kartın geldiği gruptur.

- **Yeni:** Seçtiğiniz destedeki henüz görmediğiniz kartların tamamı.
- **Öğrenme:** Bugün öğrenme veya yeniden öğrenme adımında olan kartlar.
- **Tekrar:** Vadesi gelmiş ve destenin günlük tekrar sınırına sığan kartlar.

> **Anki'den farkı:** Yeni kartlar için günlük sınır yoktur; yeni sayısı bu yüzden büyük olabilir.
> Bkz. [Deste seçenekleri](06-deck-options.md#new-cards).

Sayıların yanında şu göstergeler çıkabilir:

- **0:07** gibi bir süre: destede **Ekran zamanlayıcısını göster** açıksa bu kartta geçen süre.
  Bkz. [Deste seçenekleri](06-deck-options.md#timers).
- **~12 dk:** **Kalan süreyi göster** açıkken, son günlerdeki cevap hızınıza göre tahmini kalan süre.
  Yeterli cevap yoksa görünmez.
- **Süre doldu:** Otomatik ilerlemenin uyarısı (bkz. [Otomatik ilerleme](#auto-advance)).
- **🔥 ve bir sayı:** Art arda çalıştığınız gün sayısı. Soluksa bugün henüz çalışmadınız.
  Kronometre'de kaydettiğiniz çalışma da o günü seriye katar.

<a id="undo-redo"></a>
## Geri alma ve yineleme

Yanlış düğmeye bastıysanız üst çubuktaki **↶** düğmesine dokunun. Kart sorusuyla geri gelir;
cevabınız tekrar geçmişinden silinir ve sayılar eski hâline döner.

- Geri alma, çalışırken yaptığınız gömme, askıya alma, işaretleme, bayrak, etiket,
  **Son tarihi ayarla** ve **Kartı sıfırla** işlemlerini de sırayla geri alır. ⋮ menüsünde neyin
  geri alınacağı yazar, örneğin **Geri al: Kartı göm**.
- Geri aldığınızı ⋮ › **Yinele** ile yeniden uygularsınız. Yeni bir işlem yinelemeyi siler.
- En fazla 30 adım geri gidebilirsiniz. Geçmiş; başka desteye geçince, yeni çalışma günü başlayınca
  ve çalışmadan **Desteler**'e dönünce silinir.
- Kart bu arada başka bir yerde (ör. **Kartlarım**'da) yeniden zamanlandıysa **Geri alınamadı**
  uyarısı çıkar ve geçmiş temizlenir.
- Not silmenin geri alması ayrıdır (bkz. [Çalışırken düzenleme](#edit-during-review)).

> **Anki'den farkı:** Geri alma geçmişi yalnızca çalışma ekranına aittir; bütün koleksiyonu kapsamaz.

<a id="card-actions"></a>
## Kart menüsü (⋮)

Üst çubuktaki **⋮** düğmesi sağdan bir menü açar. Boş alana dokununca kapanır.

| Madde | Ne yapar? |
| --- | --- |
| **Geri al: …** / **Yinele: …** | Son işlemi geri alır veya yeniden uygular. |
| **Yazı tahtasını etkinleştir** | Kartın üstüne çizim yapmayı açar ([Yazı tahtası](#whiteboard)). |
| **Notu düzenle**, **Not ekle**, **Etiketleri düzenle** | [Çalışırken düzenleme](#edit-during-review) |
| **Kartı göm**, **Kartı askıya al** | Notun başka kartları varsa **Göm ›** ve **Askıya al ›** alt menüsü açılır ([Gömme ve askıya alma](#bury-and-suspend)). |
| **Notu sil** | Notu bütün kartlarıyla siler. |
| **Notu işaretle** | Notu yıldızla işaretler ([Bayrak ve işaret](#flags-and-marks)). |
| **Yeniden zamanla ›** | **Son tarihi ayarla…** ve **Kartı sıfırla…** |
| **Sesi yeniden oynat**, **Metin okumayı aç** | [Ses ve metin okuma](#audio-and-tts) |
| **Deste seçenekleri** | Ekrandaki kartın kendi destesinin ayarlarını açar; üst desteyi çalışırken bu bir alt deste olabilir. |
| **Kart bilgisi** | Kartın zamanlamasını ve geçmişini gösterir ([Kart bilgisi](10-browser-and-search.md#card-info)). |

**Ayarlar › Kontroller › Ekran kontrolü › Yüzen Araçlar düğmesini göster** açıksa aynı menü
**Cevabı göster**'in yanındaki ⚙ düğmesiyle de açılır.

<a id="flags-and-marks"></a>
## Bayrak ve işaret

- **Bayrak:** Üst çubuktaki **⚑** düğmesi **Bayrak rengi** menüsünü açar: **Kırmızı bayrak**,
  **Turuncu bayrak**, **Yeşil bayrak**, **Mavi bayrak**, **Pembe bayrak**, **Turkuaz bayrak**,
  **Mor bayrak** veya **Bayrak yok**. Bayrak yalnızca bu karta konur; düğme ve kartın üst köşesi
  bayrağın rengini alır.
- **İşaret:** ⋮ › **Notu işaretle** notu yıldızlar (`marked` etiketi); kartın köşesinde ★ görünür.
  **Not işaretini kaldır** ile kaldırırsınız.
- Bayraklı veya işaretli kartları **Kartlarım**'da bulabilirsiniz.
  Bkz. [Kartlarım ve arama](10-browser-and-search.md).

> **Web sürümünde:** `Ctrl+1` … `Ctrl+7` (Mac'te `Cmd`) ilgili bayrağı koyar veya kaldırır.

<a id="bury-and-suspend"></a>
## Gömme ve askıya alma

- **Kartı göm** kartı bugünlük kenara koyar; yeni çalışma günü başlayınca (varsayılan 04:00)
  kendiliğinden geri gelir. **Notu göm** notun bütün kartlarını gömer.
- **Kartı askıya al** kartı siz geri açana kadar çalışmadan çıkarır. **Notu askıya al** notun bütün
  kartlarına uygulanır.
- Gömülen kartları beklemeden geri getirmek için bitiş ekranındaki **gömülü kartı şimdi aç**
  düğmesini kullanın ([Bitiş ekranı](#finished)).
- Askıdaki kartı geri açmak için **Kartlarım**'da `is:suspended` aramasıyla bulup
  **Askıdan Çıkar**'a dokunun.
- Onay sorulmaz; ikisi de **↶** ile geri alınır.

Deste ayarlarınıza göre bir kartı cevapladığınızda aynı notun öteki kartları da ertesi güne
gömülebilir. Bkz. [Deste seçenekleri](06-deck-options.md#burying).

<a id="leeches"></a>
## Sürekli unutulan kartlar

Bir kartı destenin **Sürekli unutulan kart eşiği** kadar unuttuğunuzda (varsayılan 8) notuna
`leech` etiketi eklenir. **Eşiğe ulaşıldığında** ayarı **Etiketle ve askıya al** ise kart ayrıca
askıya alınır ve çalışmadan çıkar. Kart unutulmaya devam ederse bu her yarım eşikte yinelenir
(8 için 12. ve 16. unutmada).

Bu kartları **Kartlarım**'da `tag:leech` ile bulabilirsiniz. **Kart bilgisi** ekranında
**Sürekli Unutulan Kart nedir?** açıklaması ve öneriler görünür. Kartı kısaltmak veya tek bilgiye
bölmek çoğu zaman işe yarar. Ayar için bkz. [Deste seçenekleri](06-deck-options.md#lapses).

> **Anki'den farkı:** Bir kart sürekli unutulan olduğunda çalışma ekranında uyarı çıkmaz.

<a id="edit-during-review"></a>
## Çalışırken düzenleme

- **Notu düzenle:** Notu tam ekran düzenleyicide (**Kartı düzenle**) açar. Kaydedip döndüğünüzde
  kart düzeltilmiş hâliyle görünür; değişiklik notun bütün kartlarını etkiler.
  Bkz. [Kart ekleme ve düzenleme](08-adding-and-editing.md).
- **Not ekle:** Çalışmayı bırakmadan not ekler. Seçtiğiniz deste hazır gelir; filtrelenmiş bir
  destede çalışıyorsanız ekrandaki kartın kendi destesi.
- **Etiketleri düzenle:** Etiketleri boşlukla ayırıp **Kaydet**'e dokunun. Etiketler notun bütün
  kartlarına uygulanır; açık cevap kapanmaz.
- **Son tarihi ayarla…:** Kartın kaç gün sonra geleceğini yazın: `0` bugün, `1` yarın, `3-7` bu
  aralıkta rastgele bir gün. Sona `!` eklerseniz (`3-7!`) kartın aralığı da bu değere ayarlanır.
  Eksi sayı ve boşluk kabul edilmez; geçersiz değerde **Kaydet** soluk kalır.
- **Kartı sıfırla…:** Kartı yeniden **Yeni** yapar; tekrar geçmişi korunur. **Mümkünse ilk sırasına
  geri koy** (varsayılan açık) ve **Tekrar ve unutma sayılarını sıfırla** (varsayılan kapalı)
  seçeneklerinden sonra **Sıfırla**'ya dokunun. Son seçiminiz hatırlanır.
- **Notu sil:** Onay sorulur. Silindikten sonra açılan **Not silindi** penceresinde **Geri al** notu
  geri getirir; **Bitti**'ye dokunduğunuzda silme kalıcı olur. TUS Kartları paketindeki notlarda bu
  madde yoktur.

<a id="audio-and-tts"></a>
## Ses ve metin okuma

- Kartın sesi o yüz açılınca kendiliğinden çalar. Bunun için **Ayarlar › İnceleme › Gelişmiş ›
  Sesi otomatik oynat** ve destenin **Ses** ayarlarındaki **Sesi otomatik oynat** açık olmalıdır
  (ikisi de varsayılan açık). Cevap açılınca yalnızca cevap tarafının sesi çalar.
- **Sesi yeniden oynat** (⋮ menüsü veya `R`): Soru tarafında sorunun sesini çalar. Cevap tarafında
  önce soru, sonra cevap sesini; destede **Cevabı yeniden oynatırken soruyu atla** açıksa yalnızca
  cevabınkini. Bkz. [Deste seçenekleri](06-deck-options.md#audio).
- Karttaki her ses oynatıcısının yanında bir hız düğmesi (`1x`) vardır; dokundukça 0.75x, 1x,
  1.25x, 1.5x ve 2x arasında geçer. Başlangıç hızı destenin **Ses oynatma hızı** ayarından gelir.
- **Yanıtlarken sesi kes** (varsayılan açık) cevabı açınca veya sonraki karta geçince sesi durdurur.
  Çalışma ekranından ayrılınca veya uygulama arka plana geçince ses durur.
- **Metin okumayı aç:** Kartın görünen metnini sesli okur; cevap açılınca yalnızca cevap kısmını
  okur. Seçim bu cihazda hatırlanır. Okuma, uygulamanın dilindeki sesle yapılır. Başka dilde bir
  kart için şablona `{{tts en_US:Front}}` gibi bir okuma etiketi koyun; bu etiketler
  **Metin okumayı aç** kapalıyken de otomatik çalar.

Bir yüzde hem ses dosyası hem metin okuma varsa sırayla çalınır, üst üste binmez.

<a id="typed-answer"></a>
## Yazarak cevaplama

Kart şablonunda yazarak cevap alanı (`{{type:Alan}}`) varsa soru tarafında **Yanıtınızı yazın…**
kutusu görünür. Kutu ve **Cevabı göster** klavyenin hemen üstünde durur.

1. Cevabınızı yazın.
2. Klavyenin **Bitti** tuşuna basın veya **Cevabı göster**'e dokunun.
3. Cevap tarafında yazdığınız, doğru cevapla karşılaştırılır:
   - Tamamı yeşil: doğru yazdınız.
   - Üstte sizin satırınız, `↓`, altta doğru cevap: yeşil eşleşen, kırmızı yanlış veya fazla, gri
     eksik kalan harflerdir. Eksik yerler sizin satırınızda `-` ile gösterilir.
   - Yalnızca doğru cevap: bir şey yazmadınız.
4. Puanı siz verirsiniz: karşılaştırmaya bakıp uygun cevap düğmesine basın.

Büyük-küçük harf ve aksanlı harfler fark eder. Şablonda `{{type:nc:Alan}}` kullanılmışsa aksanlar
yok sayılır. Seçenekler **Ayarlar › Genel › Düzenleme** bölümündedir: **Yazarak cevap alanına
odaklan** klavyeyi kendiliğinden açar, **Cevabı kartın içine yaz** kutuyu kartın içine yerleştirir,
**Yazarak cevap alanlarını devre dışı bırak** kutuyu hiç göstermez.

<a id="whiteboard"></a>
## Yazı tahtası

Kartın üstüne şema çizmek veya not almak için ⋮ › **Yazı tahtasını etkinleştir**'e dokunun.
Kartın üstünde bir araç çubuğu açılır: ✎ **Kalem**, ▱ **Silgi** (dokunduğu çizgiyi bütünüyle
siler), **Renk paleti** (altı renk), **Çizgi kalınlığını değiştir** (ince, orta, kalın), çizimdeki
son adım için **Geri al** ve **Yinele**, × **Yazı tahtasını temizle** (onay sorar, **Geri al** ile
dönülür) ve ✓ **Çizimi bitir**.

- ✓ çizim modunu kapatır; çizim kartın üstünde kalır ve kart yeniden dokunulabilir, kaydırılabilir.
- Çizim o karta aittir. Kartı cevaplayınca silinir. Kart cevaplanmadan geri gelirse (ör. bekleme
  ekranından sonra) çizim de geri gelir.
- Çizim modu açıkken dokunma bölgeleri, kaydırma hareketleri ve otomatik ilerleme çalışmaz.
- Çizim modunda ⋮ menüsüne **Konturu geri al**, **Yazı tahtasını kaydet**, **Kalemle yazmayı aç** ve
  **Yazı tahtasını devre dışı bırak** eklenir. **Yazı tahtasını kaydet** çizimi PNG resmi olarak
  uygulamanın medya klasörüne kaydeder; resim nota eklenmez. **Yazı tahtasını devre dışı bırak**
  bu karttaki çizimi siler.
- Yazı tahtasının açık olup olmadığı ve kalem rengi (açık ve koyu tema için ayrı) her deste için bu
  cihazda hatırlanır.

<a id="tap-zones-and-swipes"></a>
## Dokunma bölgeleri ve kaydırma

**Dokunma bölgeleri** varsayılan olarak açıktır; kart dokuz bölgeye (3×3) ayrılır:

- Soru tarafında kartın herhangi bir yerine dokunmak cevabı açar.
- Cevap tarafında sol sütun **Tekrar**, sağ sütun **İyi** olarak cevaplar; orta sütun bir şey yapmaz.
- Bağlantılar, ses oynatıcıları, yazı kutuları ve seçili metin kendi dokunmalarını alır.

**Kaydırma hareketleri** varsayılan olarak kapalıdır. Açtığınızda sola kaydırma ⋮ menüsünü açar,
sağa kaydırma **Desteler**'e döner; yukarı ve aşağı boştur. Yatay kaydırma kartın her yerinde
çalışır. Yukarı ve aşağı kaydırma ise uzun kartı kaydırabilmeniz için yalnızca ekranın sol veya sağ
kenarından başlayınca sayılır.

Cevap veren bir hareket soru tarafında önce cevabı açar; aynı hareket cevap tarafında puanlar.
Böylece görmediğiniz bir cevap yanlışlıkla puanlanmaz.

Bölgeleri, yönleri ve hassasiyeti **Ayarlar › Kontroller › Dokunma ve kaydırma** bölümünden
değiştirirsiniz; başlıktaki **?** düğmesi ayrıntılı bir yardım açar. Bkz. [Ayarlar](16-settings.md).

<a id="keyboard-shortcuts"></a>
## Klavye kısayolları

iPhone'a bağlı bir klavyeyle ve web sürümünde şu tuşlar çalışır:

| Tuş | İşlev |
| --- | --- |
| Boşluk veya Enter | Cevabı göster; cevap açıkken **İyi** |
| `1` `2` `3` `4` | **Tekrar**, **Zor**, **İyi**, **Kolay** (cevap açıkken; Zor ve Kolay düğmeleri gizliyken de) |
| `R` | Sesi yeniden oynat |
| `-` | Kartı göm |
| `@` | Kartı askıya al |
| `*` | Notu işaretle / işareti kaldır |
| `Z` veya `U` | Geri al |
| Esc | Desteler'e dön |

İlk dokuz tuşu **Ayarlar › Kontroller › Klavye** bölümünden değiştirebilirsiniz. `Z` ve `U`
değiştirilemez; bunlardan birini başka bir işe atarsanız o tuş geri almayı bırakır. Bir menü açıkken
veya yazı kutusuna yazarken kısayollar çalışmaz; basılı tutulan tuş yalnızca bir kez sayılır.

> **Web sürümünde:** Ayrıca `Ctrl+Z` (Mac'te `Cmd+Z`) geri alır, `Ctrl+1` … `Ctrl+7` bayrak koyar.

> **Anki'den farkı:** Anki'deki `E` (notu düzenle), `=` (notu göm), `!` (notu askıya al) ve `O`
> (seçenekler) tuşları bağlı değildir; bunları ⋮ menüsünden yaparsınız. Yinele için tuş yoktur.

<a id="timebox"></a>
## Zaman kutusu

**Ayarlar › İnceleme › Zamanlama › Zaman kutusu sınırı** ile bir süre verin (örneğin 20 dk; 0 kapalı,
varsayılan). Süre dolduktan sonra bir kartı cevapladığınızda **Zaman kutusu** penceresi o sürede
kaç kart cevapladığınızı söyler:

- **Devam** yeni bir süre başlatır.
- **Bitir** sizi **Desteler** listesine götürür.

Süre gerçek saatle ölçülür; uygulama arka planda olsa da işler. Başka desteye geçince veya sınırı
değiştirince süre baştan başlar.

<a id="auto-advance"></a>
## Otomatik ilerleme

Otomatik ilerleme, belirlediğiniz süre dolunca cevabı kendiliğinden açar ve sonra seçtiğiniz işlemi
uygular. İki şey birlikte gerekir:

1. **Ayarlar › Yeni çalışma ekranı › Yanıt düğmeleri › Otomatik ilerleme** açık olmalıdır
   (varsayılan kapalı; iki düzende de geçerlidir).
2. Kartın destesinde **Otomatik ilerleme** ayarlarında **Soruyu gösterme süresi** veya
   **Cevabı gösterme süresi** 0'dan büyük olmalıdır (varsayılan 0, yani kapalı).

Cevap süresi dolunca varsayılan işlem **Kartı göm**'dür; **Tekrar**, **Zor**, **İyi** olarak
yanıtlamayı veya yalnızca **Süre doldu** uyarısını seçebilirsiniz. Otomatik verilen cevaplar normal
cevaptır ve geri alınabilir. Bir menü veya pencere açıkken, başka bir ekrana geçtiğinizde, uygulama
arka plandayken ve yazı tahtası açıkken süre duraklar. Bkz.
[Deste seçenekleri](06-deck-options.md#auto-advance).

<a id="learn-ahead"></a>
## Öğrenme kartlarını beklerken
<!-- Uygulamada: Çalışma ekranı › bekleme durumu › "Şimdilik hepsi bu kadar!" başlığının yanındaki ⓘ (yeni, app/(tabs)/index.tsx:3167) → bilgi sayfası; "Daha fazla bilgi" → bu bölüm -->

Hazır kartlar bitti ama öğrenme adımı süren kartlar varsa **Şimdilik hepsi bu kadar!** ekranı ve
büyük bir geri sayım görünür. Geri sayım bitince sıradaki kart kendiliğinden gelir.

- **Önceden öğrenme sınırı** (**Ayarlar › İnceleme › Zamanlama**, varsayılan 20 dk): Başka kart
  kalmadığında, bu süreden az kalmış öğrenme kartları beklemeden gösterilir. Geri sayım, kartın bu
  pencereye girdiği ana kadar sürer.
- **⚡ Beklemeden çalış:** Bu destede adım süresi dolmamış bütün öğrenme kartlarını hemen getirir.
  Her kart bir kez gelir; cevapladıktan sonra kendi süresine göre döner.
- **Bekleme ayarları** Ayarlar'ı açar; sınır **İnceleme** bölümündedir.

Filtrelenmiş destelerde önceden öğrenme uygulanmaz; öğrenme kartları süresi dolunca gelir.

<a id="finished"></a>
## Bitiş ekranı (Tebrikler)
<!-- Uygulamada: Çalışma ekranı › bitiş durumu › "Tebrikler!" başlığının yanındaki ⓘ (yeni, app/(tabs)/index.tsx:3260) → bilgi sayfası; "Daha fazla bilgi" → bu bölüm -->

Bugün gösterilecek kart kalmayınca **Tebrikler!** ekranı açılır. Yeni kart sınırı olmadığı için bu
ekran, destedeki yeni kartlar da bittiğinde gelir.

- Yarın vadesi gelecek kartlar varsa büyük sayaç, yeni çalışma gününe (varsayılan 04:00) kalan
  süreyi gösterir.
- **Günlük tekrar limiti doldu** yazıyorsa bekleyen tekrar kartları vardır;
  **Tekrar limitini artır** deste ayarlarında ilgili alanı açar
  ([Deste seçenekleri](06-deck-options.md#daily-limits)).
- **🎯 Özel çalışma** ek bir çalışma oturumu kurar ve aynı ekranda başlatır
  ([Özel çalışma](11-filtered-decks.md#custom-study)).
- **💤 … gömülü kartı şimdi aç** bugün gömülen kartları hemen geri getirir.
- Filtrelenmiş bir deste bittiğinde **🔄 Yeniden oluştur** desteyi kayıtlı kurallarıyla yeniden
  toplar. Boşaltılmış bir filtrelenmiş destede **Filtreli deste boş** yazar.
- Destede hiç kart yoksa **Bu Deste Henüz Boş** ve **Kart Ekle** görünür.

Altta **Bugün N kart tekrar edildi** satırı, bugün bütün destelerde verdiğiniz cevap sayısını
gösterir; aynı karta birden çok cevap ayrı sayılır.

## İlgili konular

- [Temel kavramlar](02-key-concepts.md)
- [Desteler](04-decks.md)
- [Deste seçenekleri](06-deck-options.md)
- [Filtrelenmiş deste ve özel çalışma](11-filtered-decks.md)
- [Ayarlar](16-settings.md)
