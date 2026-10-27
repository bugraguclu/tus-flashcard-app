---
id: concepts
title: Temel kavramlar
summary: Aralıklı tekrar, not, kart, deste, not türü, kart durumları ve cevap düğmeleri kısaca.
order: 2
web_path: /yardim/temel-kavramlar
app_help: help?article=concepts
app_screens:
  - "Yardım merkezi — app/help.tsx (yeni)"
  - "İlk açılış tanıtımı — help.firstRun.* (bkz. in-app/01-decks.md)"
verified_against: master c6108e6 (2026-10-25)
---

# Temel kavramlar

Bu sayfa uygulamanın her yerinde karşınıza çıkacak kelimeleri açıklar. Anki kullandıysanız
kavramların çoğu tanıdık gelecek; farklı olan yerler ayrıca belirtilmiştir.

<a id="spaced-repetition"></a>
## Aralıklı tekrar nasıl işe yarar?

Bir bilgiyi tam unutmak üzereyken hatırlamaya çalışmak, onu her gün yeniden okumaktan çok daha
kalıcıdır. TusAnkiM her kart için bu anı tahmin eder:

1. Kartın sorusunu görürsünüz ve cevabı aklınızdan söylemeye çalışırsınız.
2. **Cevabı göster** ile cevabı açar, ne kadar iyi hatırladığınızı bir düğmeyle bildirirsiniz.
3. İyi hatırladığınız kartların arası her seferinde açılır (birkaç gün, birkaç hafta, birkaç ay).
   Unuttuğunuz kartlar kısa süre içinde yeniden gelir.

Böylece zamanınızın çoğu, gerçekten zorlandığınız kartlara gider. En iyi sonuç için her gün az da
olsa çalışın: birikmiş tekrarlar bir sonraki güne taşınır ve yük artar.

<a id="notes-and-cards"></a>
## Not, alan ve kart

- **Not**, bir bilginin kendisidir. Bilgiyi **alanlara** bölerek yazarsınız; örneğin **Ön** alanına
  soru, **Arka** alanına cevap.
- **Kart**, notun çalışırken gördüğünüz hâlidir. Bir not bir veya daha fazla kart üretebilir:
  - Temel bir not tek kart üretir (ön → arka).
  - "Ters kartlı" bir not iki kart üretir (ön → arka ve arka → ön).
  - Boşluk doldurma (cloze) notu her boşluk numarası için bir kart üretir.
- Aynı nottan çıkan kartlara **kardeş kart** denir. Bir notu düzenlediğinizde bütün kardeşleri
  birlikte güncellenir.

Bu ayrım sayesinde bir bilgiyi bir kez yazar, istediğiniz kadar yönden sorgulayabilirsiniz.

<a id="note-types"></a>
## Not türü

**Not türü**, bir notun hangi alanlardan oluştuğunu ve bu alanlardan hangi kartların, nasıl bir
görünümle üretileceğini belirler. Uygulamayla gelen hazır türlerle başlayabilir, isterseniz kendi
türünüzü oluşturabilirsiniz. Bkz. [Not türleri ve kart şablonları](09-note-types.md).

<a id="decks"></a>
## Deste ve alt deste

- **Deste**, birlikte çalışmak istediğiniz kartların grubudur; örneğin "Farmakoloji".
- Desteler iç içe olabilir. Adında `::` kullanılan deste bir alt destedir:
  `Farmakoloji::Otonom sinir sistemi`, "Farmakoloji" destesinin altında görünür.
- Bir üst desteyi çalıştığınızda alt destelerinin kartları da gelir.
- Her kart tek bir destededir. Aynı notun kardeş kartları farklı destelerde olabilir.

Bkz. [Desteler](04-decks.md).

<a id="collection"></a>
## Koleksiyon

**Koleksiyon**, cihazınızdaki her şeyin toplamıdır: desteler, notlar, kartlar, not türleri, tekrar
geçmişi ve ayarlar. Yedekler ve `.colpkg` dışa aktarımı koleksiyonun tamamını kapsar.

<a id="tags-flags-marks"></a>
## Etiket, bayrak ve işaret

- **Etiket**, notlara verdiğiniz serbest bir etikettir; örneğin `yuksek-verim` veya `deneme-3`.
  Etiketler de `::` ile iç içe olabilir: `farmakoloji::antibiyotik`. Bir kartı başka desteye
  taşımadan gruplamak için etiket kullanın.
- **Bayrak**, tek bir karta koyduğunuz renkli bir işarettir (kırmızı, turuncu, yeşil, mavi…).
  "Sonra bakacağım", "hocaya soracağım" gibi kişisel listeler için uygundur.
- **İşaret** (yıldız), bir notu hızlıca öne çıkarmanın yoludur; arka planda `marked` etiketi
  olarak saklanır.

<a id="card-states"></a>
## Kart durumları

| Durum | Anlamı |
| --- | --- |
| **Yeni** | Henüz hiç görmediğiniz kart. |
| **Öğrenme** | Yeni gördüğünüz ve kısa adımlarla (örneğin 1 dakika, 10 dakika) tekrar edilen kart. |
| **Tekrar** | Öğrenmeyi bitirmiş, günler veya haftalar sonra vadesi gelen kart. |
| **Yeniden öğrenme** | Tekrarda unuttuğunuz ve yeniden kısa adımlarla çalışılan kart. |
| **Askıya alınmış** | Siz geri açana kadar hiç gösterilmeyen kart. |
| **Gömülü** | Yalnızca bugün için kenara konmuş kart; ertesi gün kendiliğinden geri gelir. |

Deste listesindeki sayılar bu durumlara göre ayrılır: bugün çalışabileceğiniz yeni, öğrenme ve
tekrar kartları.

> **Dikkat — "Tekrar" iki anlamda kullanılır:** Kart durumu olarak **Tekrar**, vadesi gelmiş ve daha
> önce öğrenilmiş kart demektir. Cevap düğmesi olarak **Tekrar** ise "hatırlayamadım" demektir.
> Kılavuzda karışmaması için düğmeden söz ederken "**Tekrar** düğmesi" diye yazılır.

<a id="answer-buttons"></a>
## Cevap düğmeleri

Cevabı gördükten sonra dört düğmeden birine basarsınız. Her düğmenin üstünde, o seçimle kartın ne
zaman yeniden geleceği yazar (örneğin 10dk, 3 gün, 1.5 ay).

| Düğme | Ne zaman basılır? |
| --- | --- |
| **Tekrar** | Hatırlayamadınız veya yanlış hatırladınız. Kart kısa süre içinde yeniden gelir. |
| **Zor** | Hatırladınız ama çok zorlandınız. Aralık az artar. |
| **İyi** | Biraz düşünerek doğru hatırladınız. Çoğu zaman basacağınız düğme budur. |
| **Kolay** | Hiç zorlanmadınız. Aralık daha çok açılır. |

Dürüst olun: emin olmadığınız bir kartı **İyi** saymak onu çok geç getirir. **Zor** düğmesi
"unuttum" anlamına gelmez; unuttuysanız **Tekrar**'a basın.

<a id="scheduler"></a>
## Zamanlayıcı: klasik ve FSRS

Kartın ne zaman yeniden geleceğini **zamanlayıcı** hesaplar. Uygulamada iki seçenek vardır:

- **Klasik zamanlayıcı:** Her kartın bir kolaylık çarpanı vardır; aralık her başarılı tekrarda bu
  çarpanla büyür.
- **FSRS:** Her kartın ne kadar zor olduğunu ve hafızanızda ne kadar kalıcı olduğunu tekrar
  geçmişinizden tahmin eder; hedeflediğiniz hatırlama oranına göre aralık seçer.

Seçim deste ayarlarından yapılır. Bkz. [Deste seçenekleri](06-deck-options.md) ve [FSRS](07-fsrs.md).

<a id="presets"></a>
## Ayar grubu

Günlük limitler, öğrenme adımları ve zamanlayıcı seçenekleri desteye tek tek değil, bir **ayar
grubu** üzerinden verilir. Aynı ayar grubunu kullanan bütün desteler aynı kurallarla çalışır; bir
desteye farklı kurallar istiyorsanız ona yeni bir ayar grubu atarsınız. Bkz.
[Deste seçenekleri](06-deck-options.md#presets).

<a id="study-day"></a>
## Çalışma günü

Uygulamada gün gece yarısı değil, **Sonraki günün başlangıcı** saatinde (varsayılan **04:00**)
değişir. Gece 01:00'de çalışırsanız bu hâlâ "bugün" sayılır. Günlük limitler, gömülen kartların
geri gelmesi ve istatistiklerdeki "bugün" bu saate göre hesaplanır. Saati
**Ayarlar › İnceleme** bölümünden değiştirebilirsiniz.

<a id="leeches-and-siblings"></a>
## Sürekli unutulan kartlar ve kardeş gömme

- Bir kartı defalarca unutursanız uygulama onu **Sürekli Unutulan Kart** olarak işaretler (Anki'de
  "leech"). Bu, kartın büyük olasılıkla yeniden yazılması gerektiğini gösterir.
  Bkz. [Deste seçenekleri](06-deck-options.md#lapses).
- Aynı nottan çıkan kardeş kartlar aynı gün art arda gelirse biri diğerinin cevabını ele verebilir.
  Bu yüzden ayarlarınıza göre bir kardeş gösterildiğinde diğerleri ertesi güne **gömülebilir**.

<a id="filtered-decks"></a>
## Filtrelenmiş deste

**Filtrelenmiş deste**, bir aramaya uyan kartları geçici olarak bir araya toplayan özel bir
destedir; örneğin "son 7 günde unuttuklarım" veya "farmakoloji etiketli ve bayraklı kartlar".
Kartlar çalışma bitince veya deste boşaltılınca kendi destelerine döner.
Bkz. [Filtrelenmiş deste ve özel çalışma](11-filtered-decks.md).

> **Anki'den farkı:** TusAnkiM'de yeni kartlar için günlük sınır yoktur; çalışmak istediğiniz kadar
> yeni kart açabilirsiniz. Tekrar kartlarının günlük sınırı ise Anki'deki gibi çalışır.
> Bkz. [Deste seçenekleri](06-deck-options.md#daily-limits).

## İlgili konular

- [Hızlı başlangıç](03-quick-start.md)
- [Çalışma ekranı](05-studying.md)
- [Sözlük](21-glossary.md)
