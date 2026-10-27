---
id: filtered-decks
title: Filtrelenmiş deste ve özel çalışma
summary: Bir aramaya uyan kartları geçici bir destede toplamak, sıralama, önizleme modu, yeniden oluşturma ve Özel çalışma seçenekleri.
order: 11
web_path: /yardim/filtrelenmis-deste
app_help: help?article=filtered-decks
app_screens:
  - "Filtrelenmiş deste formu (oluşturma ve Filtre seçenekleri) — app/(tabs)/decks.tsx (renderFilterModal)"
  - "Filtre seçenekleri (Genel bakış'tan) — components/FilteredDeckOptionsModal.tsx"
  - "Genel bakış, filtrelenmiş deste — app/deck-overview.tsx"
  - "Özel çalışma — components/CustomStudyModal.tsx"
verified_against: master c6108e6 (2026-10-25)
---

# Filtrelenmiş deste ve özel çalışma

Filtrelenmiş deste, başka destelerinizden bir aramaya uyan kartları geçici olarak bir araya
toplar; örneğin "son bir haftada unuttuğum kartlar". **Özel çalışma** ise bir deste için en sık
kullanılan filtreleri hazır seçenekler olarak sunar. İkisi de kartlarınızı silmez veya taşımaz.

<a id="what-are-filtered-decks"></a>
## Filtrelenmiş deste nedir?
<!-- Uygulamada: Filtrelenmiş deste formunun ? düğmesi (app/(tabs)/decks.tsx:1720) ve Filtre seçenekleri'nin ? düğmesi (components/FilteredDeckOptionsModal.tsx:220) → açılan yardımın "Daha fazla bilgi" bağlantısı → bu bölüm -->

- **Kartlar yerinden oynamaz.** Her kart kendi destesine bağlı kalır. Filtrelenmiş destede
  durduğu sürece kendi destesinin çalışmasında ve sayılarında görünmez.
- **İçerik sabittir.** Kartlar deste oluşturulurken bir kez toplanır. Çalıştıkça yeni kart
  eklenmez; bitirdiğiniz kartlar desteden çıkıp kendi destelerine döner. Yeniden toplamak için
  **Yeniden oluştur** kullanılır.
- **Günlük limitler uygulanmaz.** Destede ne kadar kart varsa o kadarını çalışabilirsiniz.
- **Bazı kartlar alınamaz:** askıya alınmış, gömülü veya başka bir filtrelenmiş destede duran
  kartlar.

Deste listesinde filtrelenmiş desteler eğik ve mavi yazıyla, **⧉** işaretiyle görünür. Alt deste
olamazlar, altlarına deste alamazlar ve sürüklenemezler.

> **Anki'den farkı:** Anki, filtrelenmiş desteye aldığı kartları geçici olarak o desteye taşır.
> TusAnkiM'de kartlar kendi destelerinde kalır; filtrelenmiş deste yalnızca hangi kartları
> içerdiğinin listesini tutar. Filtrelenmiş desteler dışa aktarılmaz; kartları kendi destelerinde
> dışa aktarılır.

<a id="create-filtered-deck"></a>
## Filtrelenmiş deste oluşturmak

İki yerden başlayabilirsiniz:

- **Desteler › ＋ › Filtrelenmiş deste oluştur**,
- **Kartlarım › ••• › Filtrelenmiş deste oluştur**: Kartlarım'da o an yazılı olan arama forma
  hazır gelir. Bkz. [Kartlarım ve arama](10-browser-and-search.md).

Açılan formda:

1. **Deste adı:** Varsayılan ad "Filtrelenmiş Deste 14:30" gibidir; isterseniz değiştirin. Adın
   içinde `::` olamaz.
2. **1. Filtre:** Deste, arama, kart limiti ve sıralamayı ayarlayın (sonraki bölümler).
3. İsterseniz **2. Filtre**'yi açın.
4. **Çalışma davranışı** altında yeniden zamanlamayı seçin.
5. Sağ üstteki **Oluştur**'a dokunun.

Deste toplanır ve **Genel bakış** açılır; **Şimdi çalış** ile başlarsınız.

Yeni formda arama, en son çalıştığınız destenin vadesi gelmiş kartlarıyla hazır gelir
(`deck:"Patoloji" is:due` gibi). Hiçbir kart eşleşmezse **Eşleşen kart yok** mesajı çıkar;
aramayı değiştirin veya **Boş olsa bile oluştur/güncelle**'yi açın. Arama alanı boşken deste
oluşturulmaz. Aynı adda bir deste varsa yeni destenin adına " (1)" eklenir.

<a id="search-and-limit"></a>
## Arama ve kart limiti

- **Deste:** Aramayı tek bir desteyle sınırlar. Seçtiğiniz deste aramaya `deck:` terimi olarak
  yazılır; **Tüm desteler** bu terimi kaldırır.
- **Ara:** **Kartlarım**'daki arama diliyle yazılır. Ayrıntılar:
  [Arama söz dizimi](10-browser-and-search.md#search-syntax). Birkaç örnek:

  | Arama | Toplanan kartlar |
  | --- | --- |
  | `deck:"Farmakoloji" is:due` | Farmakoloji'de vadesi gelmiş kartlar |
  | `rated:7:1` | Son 7 günde **Tekrar** düğmesine bastığınız kartlar |
  | `flag:1` | Kırmızı bayraklı kartlar |
  | `tag:yuksek-verim is:new` | Bu etiketi taşıyan yeni kartlar |
  | `prop:lapses>=3` | En az 3 kez unuttuğunuz kartlar |

- **⌕** düğmesi aramanın kaç kartla eşleştiğini ve kullanabileceğiniz terimleri gösterir.
- **Kart limiti:** Desteye alınacak en çok kart (1–99.999). Yeni destede 100, ikinci filtrede
  20'dir. 0 yazarsanız 100 kullanılır. Hangi kartların limite gireceğini sıralama belirler.
- **Dahil edilemeyen kartları göster:** Aramaya uyduğu hâlde desteye alınamayan kartların
  nedenini açıklar.

<a id="order"></a>
## Kartların seçilme sırası

**Kartların seçilme sırası** hem limite hangi kartların gireceğini hem de çalışma sırasını
belirler. Yeni bir destede **Rastgele** seçilidir.

| Seçenek | Önce gelen kartlar |
| --- | --- |
| **En eski görülen önce** | En uzun süredir tekrar etmediğiniz kartlar; hiç görülmemişler en başta |
| **Rastgele** | Karışık |
| **Aralıklar (artan)** | Aralığı en kısa olanlar |
| **Aralıklar (azalan)** | Aralığı en uzun olanlar |
| **En çok unutulan** | En çok unuttuğunuz kartlar |
| **Ekleniş sırası** | En önce eklenen notlar |
| **Vade sırası** | Vadesi en önce gelmiş, yani en çok bekleyen kartlar |
| **Son eklenen önce** | En son eklenen notlar |
| **Hatırlanabilirlik (artan)** | FSRS'e göre hatırlama ihtimali en düşük kartlar |
| **Hatırlanabilirlik (azalan)** | FSRS'e göre hatırlama ihtimali en yüksek kartlar |
| **Göreceli gecikme** | Aralığına oranla en çok gecikmiş kartlar |

İki **Hatırlanabilirlik** sıralaması yalnızca FSRS açıkken anlamlıdır; FSRS kapalıyken kartları
sabit, karışık bir sırayla verir. **Genel bakış › Filtre seçenekleri** bu ikisini yalnızca FSRS
açıkken listeler; FSRS kapalıyken orada kaydettiğiniz bir deste **Rastgele**'ye geçer.
Bkz. [FSRS](07-fsrs.md).

<a id="second-filter"></a>
## İkinci filtre

**İkinci filtreyi etkinleştir**'i açarsanız aynı desteye kendi aramasıyla, limitiyle ve
sıralamasıyla ikinci bir kart grubu eklenir. İkinci grup, birincinin aldığı kartları yeniden
saymaz.

Örnek: vadesi gelmiş Patoloji kartlarına az sayıda yeni kart katmak için

- **1. Filtre:** `deck:"Patoloji" is:due`, limit 100, **Vade sırası**,
- **2. Filtre:** `deck:"Patoloji" is:new`, limit 20, **Ekleniş sırası**.

İkinci filtrenin limiti 20, sıralaması **Vade sırası** ile başlar. Anahtarı kapatıp kaydederseniz
ikinci filtre kaldırılır.

<a id="reschedule"></a>
## Kartları yeniden zamanla (önizleme)

**Kartları yeniden zamanla** açıkken (varsayılan) verdiğiniz cevaplar normal çalışma gibi sayılır
ve kartın bir sonraki tarihi değişir. Cevapladığınız kart öğrenme adımlarını bitirince desteden
çıkar ve yeni tarihiyle kendi destesine döner.

Kapalıyken deste **önizleme** modunda çalışır; Genel bakış'ta **Önizleme** etiketi görünür:

- Cevaplarınız kartın programını değiştirmez.
- **Tekrar** düğmesi kartı 1 dakika, **Zor** 10 dakika sonra yeniden getirir; **İyi** ve **Kolay**
  kartı oturumdan çıkarır.
- Bu süreleri **Genel bakış › Filtre seçenekleri › Önizleme gecikmeleri (saniye)** alanında
  değiştirebilirsiniz: Tekrar, Zor ve İyi için saniye, boşlukla ayrılmış (`60 600 0`). 0, kartı
  oturumdan çıkarır; **Kolay** her zaman çıkarır. Bu alan yalnızca yeniden zamanlama kapalıyken
  görünür.

Önizleme, sınava yakın günlerde kartları programınızı bozmadan gözden geçirmek için uygundur.

<a id="rebuild-and-empty"></a>
## Yeniden oluşturmak ve boşaltmak
<!-- Uygulamada: Desteler › ••• › Yeniden oluştur / Desteyi boşalt (app/(tabs)/decks.tsx:1480-1481), Genel bakış › Yeniden oluştur / Boşalt (app/deck-overview.tsx:283-291) → bu bölüm -->

**Yeniden oluştur**, destedeki kartları kendi destelerine gönderir, aramayı yeniden çalıştırır ve
desteyi güncel eşleşmelerle doldurur. Önceki toplamada hangi kartları bitirdiğiniz unutulur;
cevaplarınız ise kartlarda kalır. Onay istenmez. Hiçbir kart eşleşmezse deste boş kalır.

Bulunduğu yerler:

- **Desteler › ••• › Yeniden oluştur**,
- **Genel bakış › ↻ Yeniden oluştur**,
- çalışma ekranında deste bitince çıkan **Tebrikler!** ekranı (bkz. [Çalışma ekranı](05-studying.md)).

**Desteyi boşalt** (Genel bakış'ta **Boşalt**) onay ister, kartları kendi destelerine gönderir
ve deste ile aramasını saklar. Boş deste Genel bakış'ta **Deste boş — yeniden oluşturun**,
çalışma ekranında **Filtreli deste boş** olarak görünür; ikisinde de **Yeniden oluştur** ile
yeniden doldurursunuz. Genel bakış'taki **Boşalt** yalnızca çalışmaya hazır kart varken
kullanılabilir; her durumda **Desteler › ••• › Desteyi boşalt** çalışır.

**Ayarları değiştirmek:** **Desteler › ••• › Filtre seçenekleri** veya **Genel bakış › Filtre
seçenekleri**. Kaydettiğinizde deste yeni ayarlarla yeniden oluşturulur. Düğmenin adı birincide
**Yeniden oluştur**, ikincide **Kaydet ve yeniden oluştur**'dur. Önizleme gecikmeleri yalnızca
Genel bakış'taki formda bulunur.

<a id="delete-filtered-deck"></a>
## Filtrelenmiş desteyi silmek

**Desteler › ••• › Desteyi sil**'i seçip **Tamam**'a dokunun. Deste kaldırılır, kartlarınız
silinmez ve kendi destelerine döner. Hemen ardından çıkan pencerede **Geri al** desteyi aynı
kartlarla geri getirir.

Yalnızca adını değiştirmek için **••• › Desteyi yeniden adlandır**'ı veya formdaki
**Deste adı** alanını kullanın.

<a id="custom-study"></a>
## Özel çalışma
<!-- Uygulamada: Özel çalışma sayfasının alt notundaki "Daha fazla bilgi" (yeni, components/CustomStudyModal.tsx:647) → bu bölüm -->

**Özel çalışma**, bir deste için hazır filtrelenmiş oturumlar kurar veya bugünkü tekrar limitini
artırır. Açmak için:

- **Desteler › ••• › Özel çalışma**,
- **Genel bakış › Özel çalışma**,
- çalışma ekranında deste bitince **Tebrikler!** › **🎯 Özel çalışma**.

Filtrelenmiş destelerde Özel çalışma yoktur.

1. Seçeneklerden birini işaretleyin.
2. Sayıyı **−** / **+** ile veya yazarak ayarlayın.
3. **Tamam**'a (etiket seçeneğinde **Etiketleri seç**'e) dokunun.

Oturum seçenekleri **Özel Çalışma Oturumu** adlı bir filtrelenmiş deste oluşturur (uygulama
İngilizceyse adı **Custom Study Session** olur). Her yeni Özel çalışma bu destenin içeriğini ve
ayarlarını baştan kurar. Bir oturumu saklamak istiyorsanız önce adını değiştirin.

Oturum kurulunca, Desteler'den veya Genel bakış'tan geldiyseniz oturumun **Genel bakış**'ı
açılır; çalışma ekranından geldiyseniz oturum hemen orada başlar. Hiçbir kart uymazsa
**Verdiğiniz ölçütlere uyan kart bulunamadı.** mesajı çıkar ve pencere açık kalır.

> **Anki'den farkı:** Özel çalışmada "bugünkü yeni kart limitini artır" seçeneği yoktur, çünkü
> TusAnkiM'de yeni kartların günlük sınırı yoktur. Bkz.
> [Deste seçenekleri](06-deck-options.md#daily-limits).

<a id="custom-study-options"></a>
## Özel çalışma seçenekleri

| Seçenek | Sayı | Ne yapar? | Programı değiştirir mi? |
| --- | --- | --- | --- |
| **Bugünkü tekrar kart limitini artır** | kart, −99.999…99.999 | Oturum kurmaz; bu destenin bugünkü tekrar limitine ekler. Eksi değer azaltır. | — |
| **Unutulan kartları tekrarla** | gün, 1–30 | Son N günde **Tekrar** düğmesine bastığınız kartlar, karışık sırayla | Hayır (önizleme) |
| **İleriye çalış** | gün, 1–99.999 | Önümüzdeki N gün içinde vadesi gelecek kartlar, vade sırasıyla | Evet |
| **Yeni kartları önizle** | gün, 1–99.999 | Son N günde eklenen yeni kartlar, ekleniş sırasıyla | Hayır (önizleme) |
| **Kart durumuna veya etikete göre çalış** | kart, 1–99.999 (100) | Aşağıdaki dört türden biri, isterseniz etiketlerle | Türe göre |

**Tekrar limitini artırmak:** **Kullanılabilir tekrar kartı** satırı destede ve alt destelerinde
bugün vadesi gelen tekrar sayısını gösterir. Eklediğiniz miktar yalnızca bugün geçerlidir ve
**Sonraki günün başlangıcı** saatinde sıfırlanır. Üst destelerin limiti yalnızca
**Deste seçenekleri › Limitler en üst desteden başlasın** açıksa birlikte artar. Pencere bir
sonraki açılışta son kullandığınız artışla gelir.

**Kart durumuna veya etikete göre çalış** türleri:

- **Yalnızca yeni kartlar** — ekleniş sırasıyla; programı değiştirir.
- **Yalnızca zamanı gelmiş kartlar** — vade sırasıyla; programı değiştirir.
- **Tüm tekrar kartları rastgele sırayla** — daha önce görülmüş bütün kartlar; programı değiştirir.
- **Tüm kartlar rastgele sırayla (yeniden zamanlanmaz)** — önizleme.

Destede etiket varsa **Etiketleri seç** ile **Seçmeli çalışma** açılır:

- Belirli etiketleri şart koşmak için önce kutuyu işaretleyin, sonra
  **Şu etiketlerden en az biri gerekli:** listesinden seçin. Kutu işaretli değilse bu listedeki
  seçimler kullanılmaz.
- **Hariç tutulacak etiketleri seçin:** listesindeki etiketleri taşıyan kartlar alınmaz.
- En fazla 100 etiket seçilebilir. Seçimleriniz bir sonraki sefer için hatırlanır.

Destede hiç etiket yoksa bu adım atlanır ve oturum hemen kurulur. Destede hiç kart yoksa oturum
seçeneklerinde **Tamam** kullanılamaz.

Örnek: Sınavdan önceki akşam, **Patoloji › ••• › Özel çalışma › İleriye çalış › 3 gün** ile
önümüzdeki üç günün kartlarını bugünden çalışabilirsiniz.

## İlgili konular

- [Desteler](04-decks.md)
- [Çalışma ekranı](05-studying.md)
- [Deste seçenekleri](06-deck-options.md)
- [Kartlarım ve arama](10-browser-and-search.md)
- [Temel kavramlar](02-key-concepts.md#filtered-decks)
