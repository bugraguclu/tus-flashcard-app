---
id: fsrs
title: FSRS
summary: FSRS zamanlayıcısını açma, hedeflenen hatırlama oranı, parametreleri optimize etme ve kartları yeniden zamanlama.
order: 7
web_path: /yardim/fsrs
app_help: help?article=fsrs
app_screens:
  - "Deste seçenekleri › FSRS kartı — app/deck-options.tsx (FSRS kartı, satır 1236-1354)"
  - "FSRS ayar rehberi (FSRS kartının ? düğmesi) — components/deck-options/deckOptionsCopy.ts"
  - "Kart bilgisi (hafıza değerleri) — app/card-info.tsx"
verified_against: master c6108e6 (2026-10-25)
---

# FSRS

FSRS, kartlarınızın ne zaman yeniden geleceğini hesaplayan ikinci zamanlayıcıdır. Her kartı ne
kadar iyi hatırladığınızı tekrar geçmişinizden tahmin eder ve aralığı, seçtiğiniz hatırlama oranına
göre belirler. Ayarları **Deste seçenekleri** ekranındaki **FSRS** kartındadır.
Bkz. [Deste seçenekleri](06-deck-options.md#fsrs).

<a id="what-is-fsrs"></a>
## FSRS nedir?
<!-- Uygulamada: Deste seçenekleri › FSRS kartının ? düğmesi (app/deck-options.tsx:1236; düğme components/deck-options/SettingControls.tsx:38-51) açılan rehberin "Daha fazla bilgi" bağlantısı → bu bölüm -->

Klasik zamanlayıcıda her kartın bir kolaylık çarpanı vardır; başarılı her tekrarda aralık bu
çarpanla büyür. FSRS ise her kart için iki sayı tutar:

- **Hafıza gücü (stability):** Kartı hatırlama olasılığınızın %90'a düşmesi için geçmesi gereken
  gün sayısı. Kartı başarıyla hatırladıkça büyür.
- **Zorluk:** Kartın sizin için ne kadar zor olduğu (1–10). Sık unuttuğunuz kartlarda yükselir.

Bu iki sayıdan, kartı şu an hatırlama olasılığınız (**Hatırlanabilirlik**) hesaplanır. FSRS bir
sonraki tekrarı, bu olasılık **Hedeflenen hatırlama oranı**'na düştüğü güne koyar. Bir kartın
değerlerini **Kart bilgisi** ekranında görürsünüz; bkz.
[Kartlarım ve arama](10-browser-and-search.md#card-info).

Öğrenme ve yeniden öğrenme adımları FSRS açıkken de aynen çalışır; FSRS yalnızca gün ölçeğindeki
aralıkları seçer.

<a id="turn-on-fsrs"></a>
## FSRS'i açmak ve kapatmak

1. Herhangi bir destenin **Deste seçenekleri** ekranını açın.
2. **FSRS** kartında **FSRS zamanlayıcısını kullan** anahtarını açın.
3. **Kaydet**'e dokunun.

Anahtar **bütün koleksiyon** için geçerlidir: bir destede açtığınızda bütün destelerde açılır.
Hedeflenen hatırlama oranı ve parametreler ise ayar grubuna aittir; her grup kendi değerlerini
kullanır.

Kaydettiğinizde her kartın hafıza durumu tekrar geçmişinden hesaplanır. Kartların vadesi değişmez;
yeni değerler bir sonraki cevabınızdan itibaren kullanılır. Mevcut vadeleri de yeniden hesaplatmak
isterseniz bkz. [Kartları yeniden zamanlamak](#reschedule).

FSRS açıkken **Mezuniyet aralığı**, **Kolay aralığı**, **En az aralık** ve **Gelişmiş** kartındaki
kolaylık çarpanları gizlenir; kayıtlı değerleri silinmez. Öğrenme adımlarınızı bir günden kısa
tutun: bir gün veya daha uzun adımlar için uygulama bir uyarı gösterir, çünkü günlük aralığı seçmek
FSRS'in işidir.

**Kapatmak** için aynı anahtarı kapatıp **Kaydet**'e basın. Kartlar klasik zamanlayıcıya döner,
vadeleri yerinde kalır ve kartların FSRS hafıza bilgisi silinir. Yeniden açarsanız bilgi tekrar
geçmişinden yeniden hesaplanır. **Tekrar sıralaması** hatırlanabilirliğe göreyse FSRS kapanınca
**Göreli gecikmişlik** olur.

> **Dikkat:** Anahtarı açmak veya kapatmak bütün koleksiyonun kartlarını etkiler. Büyük bir
> değişiklikten önce isterseniz bir yedek alın. Bkz. [Yedekler ve bakım](15-backups-and-maintenance.md).

<a id="desired-retention"></a>
## Hedeflenen hatırlama oranı

**Hedeflenen hatırlama oranı** (varsayılan **0,90**), bir kart tekrar karşınıza geldiğinde onu
hatırlıyor olma olasılığınızın hedefidir. 0,70 ile 0,99 arasında bir değer yazabilirsiniz.

- **Yüksek değer** kartları daha sık getirir: daha az unutursunuz ama günlük tekrar sayısı hızla
  artar. 0,95'in üstündeki değerlerde uygulama uyarır.
- **Düşük değer** daha az tekrar demektir, ama belirgin biçimde daha çok unutma da demektir.
  0,80'in altında uyarı çıkar.

Alanın üstünde iki sekme vardır: **Ayar grubu** grubun ortak değeridir; **Bu deste** yalnızca bu
deste için ayrı bir değer verir. **Bu deste** boşsa grubun değeri geçerlidir. Bu alanın **Yalnızca
bugün** sekmesi yoktur.

Değeri değiştirip kaydettiğinizde, etkilenen destelerin kartlarındaki hedef güncellenir. Yeni
aralıklar bir sonraki cevaptan itibaren bu hedefe göre hesaplanır.

**Örnek:** Sınava kısa süre kala bir destenin hedefini 0,90'dan 0,95'e çıkarmayı düşünüyorsanız,
günlük tekrarlarınızın belirgin biçimde artacağını hesaba katın. Önce tek bir destede **Bu deste**
sekmesiyle deneyebilirsiniz.

<a id="optimize"></a>
## Parametreleri optimize etmek
<!-- Uygulamada: Deste seçenekleri › FSRS › "Parametreleri optimize et" düğmesi (app/deck-options.tsx:1304-1321) ve "FSRS parametreleri" alanı (app/deck-options.tsx:1323-1332) -->

FSRS, hafızanın nasıl çalıştığını 21 sayılık bir **parametre** listesiyle tarif eder. Başlangıçta
çok sayıda kullanıcıya göre ayarlanmış varsayılan değerler kullanılır. **Parametreleri optimize et**
bu sayıları sizin tekrar geçmişinize göre yeniden hesaplar.

1. **FSRS** kartında **Parametreleri optimize et**'e dokunun. Hesaplanırken düğmede ilerleme yazar
   (**Hesaplanıyor… %40 (durdur)**). Durdurmak için düğmeye yeniden dokunun.
2. Sonuç bir pencerede görünür:
   - **Parametreler güncellendi:** Yeni parametreler, geçmişinizi eskilerinden daha iyi tahmin
     ediyor. Pencerede tahmin hatasının (log loss) eski ve yeni değeri yazar; küçük olan daha iyidir.
   - **Parametreler zaten uygun:** Mevcut parametreler daha iyi; hiçbir şey değişmedi.
   - **Eğitilecek tekrar yok:** Bu gruptaki kartlarda henüz kullanılabilecek tekrar yok.
3. Sonucu uygulamak için **Kaydet**'e basın. Kaydetmeden çıkarsanız yeni parametreler kullanılmaz.

Optimizasyon bu ayar grubunu kullanan bütün destelerin, askıya alınmamış kartlarının geçmişini
kullanır. Geçmiş çok azsa sonuç varsayılan parametrelere yakın kalır; tekrarlarınız biriktikçe
yeniden çalıştırın. Son optimizasyonun tarihi **FSRS parametreleri** alanının altında yazar ve
aradan bir ay geçince uygulama yeniden optimize etmenizi önerir.

**FSRS parametreleri** alanına başka bir yerden kopyaladığınız 17, 19 veya 21 sayıyı virgül veya
boşlukla ayırarak yapıştırabilirsiniz. Alanı boşaltırsanız varsayılanlara dönülür. İzin verilen
sınırların dışındaki sayılar kaydedilirken sınıra çekilir.

<a id="reschedule"></a>
## Kartları yeniden zamanlamak

**Değişiklikte kartları yeniden zamanla** anahtarı, bir sonraki **Kaydet**'in mevcut vadeleri de
yeniden hesaplamasını sağlar. Ekran her açıldığında kapalı başlar ve yalnızca o kayıt için geçerlidir.

- **Kapalıyken** yeni ayarlar yalnızca bundan sonraki cevaplarınızı etkiler.
- **Açıkken** kaydettiğinizde, bu kayıtta parametreleri veya hedeflenen hatırlama oranı (açıksa
  kolay günleri de) değişen destelerdeki tekrar kartlarının vadesi yeniden hesaplanır. Yeni vade,
  kartın son tekrarından itibaren sayılır ve günlere dengeli dağıtılır; kolay günler dikkate alınır.
- Askıya alınmış kartlar, yeni kartlar ve öğrenmedeki kartlar yeniden zamanlanmaz.
- Hiçbir şeyi değiştirmeden yalnızca anahtarı açıp kaydederseniz bir şey olmaz.

Her yeniden zamanlanan kartın **Kart bilgisi** ekranındaki çalışma geçmişine **El ile** türünde bir
satır eklenir. Bu işlem kendiliğinden geri alınamaz; çok sayıda kartı etkileyecek bir değişiklikten
önce bir yedek almanız iyi olur.

<a id="memory-state"></a>
## Hafıza durumu nasıl hesaplanır?

- FSRS'i açtığınızda, parametreleri veya hedefi değiştirip kaydettiğinizde, kartların hafıza durumu
  tekrar geçmişinden yeniden hesaplanır. Çalışırken her cevaptan sonra güncellenir.
- Yeni kartların hafıza durumu ilk cevabınızla başlar.
- Tekrar geçmişi eksik olan eski kartların (örneğin geçmişi olmadan içe aktarılmış kartlar) durumu,
  aralıklarından ve kolaylık çarpanlarından tahmin edilir. **Geçmiş hatırlama oranı** (varsayılan
  0,90; 0,50–1,00) bu tahminde geçmişte ne kadar hatırladığınızın varsayımıdır.
- **Şu tarihten önceki tekrarları yok say** (YYYY-AA-GG, varsayılan boş): Bu tarihten önceki
  tekrarlar hesaba katılmaz. Örneğin kartları uzun bir aradan sonra baştan çalışmaya başladıysanız
  işe yarar. Bugünden sonraki bir tarih bugüne çekilir; boş bırakırsanız bütün geçmiş kullanılır.
- Bu iki alanı tek başına değiştirmek kartların durumunu hemen yeniden hesaplamaz; optimizasyon
  bunları hemen kullanır, kartlar ise bir sonraki yeniden hesaplamada etkilenir.
- Bir kartı başka bir desteye taşıdığınızda, FSRS açıksa hafıza durumu hedef destenin ayarlarıyla
  yeniden hesaplanır.

<a id="when-to-use"></a>
## FSRS'i ne zaman kullanmalı?

İki zamanlayıcı da kartlarınızı aralıklı tekrarla çalıştırır; hangisini seçeceğiniz size kalmıştır.

- FSRS, iş yükünüzü tek bir sayıyla (**Hedeflenen hatırlama oranı**) yönetmek istiyorsanız
  kullanışlıdır.
- Tekrar geçmişiniz biriktikçe optimizasyon parametreleri size göre ayarlar. Yeni başlıyorsanız
  varsayılan parametrelerle başlayabilir, birkaç hafta sonra optimize edebilirsiniz.
- Klasik zamanlayıcıyla memnunsanız değiştirmek zorunda değilsiniz. FSRS'i deneyip
  kapatabilirsiniz; vadeleriniz yerinde kalır.
- Anahtar bütün koleksiyonu etkiler; bir desteyi FSRS ile, başka bir desteyi klasik zamanlayıcıyla
  çalıştıramazsınız. Destelere farklı hedefler vermek için **Bu deste** sekmesini kullanın.

<a id="differences"></a>
## Anki'den farklı olanlar

> **Anki'den farkı:**
> - Hedef hatırlama oranını seçmenize yardım eden bir simülatör ve İstatistikler'de FSRS'e özel
>   hatırlama grafikleri yoktur.
> - Ayar gruplarını tek tek optimize edersiniz; hepsini birden optimize eden bir komut yoktur.
> - FSRS, yeni kartların günlük sınırını değiştirmez: TusAnkiM'de yeni kartlar için günlük sınır
>   yoktur. Bkz. [Deste seçenekleri](06-deck-options.md#daily-limits).
> - Hesaplamalar Anki'nin belirli bir sürümüyle karşılaştırılarak test edilir; yine de çok küçük
>   sayısal farklar olabilir.

Anki'den aktardığınız destelerde parametreler, hedeflenen ve geçmiş hatırlama oranı ve **Şu
tarihten önceki tekrarları yok say** tarihi korunur; eski FSRS sürümlerinin 17 veya 19 sayılık
parametreleri uygulamada 21 sayıya çevrilir. Bkz. [Anki ile birlikte kullanma](19-using-with-anki.md).

## İlgili konular

- [Deste seçenekleri](06-deck-options.md)
- [Temel kavramlar](02-key-concepts.md#scheduler)
- [Kartlarım ve arama](10-browser-and-search.md)
- [Yedekler ve bakım](15-backups-and-maintenance.md)
- [Anki ile birlikte kullanma](19-using-with-anki.md)
