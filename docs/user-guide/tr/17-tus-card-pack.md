---
id: tus-cards
title: TUS Kartları paketi
summary: Hazır 9.575 kartlık TUS paketini ücretsiz kurma, çalışma, düzenleme, güncellemeler, yedekler ve yeni cihaza geçiş.
order: 17
web_path: /yardim/tus-kartlari
app_help: help?article=tus-cards
app_screens:
  - "Desteler sekmesi, kilitli TUS Kartları satırı — app/(tabs)/decks.tsx (renderLockedCatalogCard)"
  - "TUS Kartları ekranı — app/catalog.tsx"
  - "Paket destelerinin ••• menüsü — app/(tabs)/decks.tsx (renderMenuModal)"
  - "Not düzenleme, paket notu — app/editor.tsx"
verified_against: master c6108e6 (2026-10-25)
---

# TUS Kartları paketi

**TUS Kartları**, uygulamayla birlikte gelen hazır bir kart paketidir: 12 temel ve klinik bilim
dersinde 9.575 kart. Paket isteğe bağlıdır ve ücretsizdir. Kurmak için **Desteler** sekmesinin en
üstündeki **TUS Kartları** satırına dokunun.

<a id="what-is-included"></a>
## Pakette neler var?

<!-- Uygulamada: TUS Kartları ekranı › "Paket içeriği" bölümü (app/catalog.tsx:208) ve ⓘ bilgi sayfası (help.tusCards.sheet) "Daha fazla bilgi" → bu bölüm -->

Paket 12 ders destesinden ve bunların altındaki 106 alt desteden oluşur. Bütün kartlar
**TUS Kartları** adlı tek bir üst destenin altında durur.

| Ders | Kart | Alt deste |
| --- | ---: | ---: |
| Deneme ve Soru | 806 | 4 |
| Anatomi | 477 | 8 |
| FHE | 597 | 10 |
| Biyokimya | 602 | 5 |
| Mikrobiyoloji | 730 | 6 |
| Patoloji | 724 | 10 |
| Farmakoloji | 827 | 9 |
| Dahiliye | 1.183 | 8 |
| Pediatri | 1.506 | 15 |
| Genel Cerrahi | 742 | 9 |
| Küçük Stajlar | 626 | 15 |
| Kadın Doğum | 755 | 7 |
| **Toplam** | **9.575** | **106** |

- **Alt desteler nasıl oluşur?** Paketi hazırlayan kişi kartların bir kısmını konu etiketiyle
  işaretlemiştir; bu kartlar etiketlerinin alt destesine girer. Etiketsiz kartlar, metinlerindeki
  konu terimlerine göre bir alt desteye yerleştirilir. Anatomi, FHE, Patoloji ve Farmakoloji'nin
  alt destelerinin hepsi bu ikinci yolla oluşur.
- **Hiçbir konuya yerleşmeyen kartlar** (toplam 2.612 kart) doğrudan ders destesinde kalır.
  **TUS Kartları** ekranında bir dersi açtığınızda bunlar **Konu etiketi olmayan kartlar** satırında
  sayılır. Dersin destesini çalıştığınızda bu kartlar da gelir.
- Alt destelerin adlarını ve kart sayılarını kurmadan önce görebilirsiniz: **TUS Kartları**
  ekranında bir derse dokunun.
- Kartlar boşluk doldurma (cloze) ve cevabı yazılan temel kartlardır; bazılarında resim vardır.

> Kartlar yalnızca sınava hazırlık ve eğitim içindir; tıbbi tavsiye veya klinik karar desteği
> değildir.

<a id="install"></a>
## Paketi kurma

<!-- Uygulamada: Desteler › kilitli "TUS Kartları" satırı (app/(tabs)/decks.tsx:1383) → TUS Kartları ekranı (app/catalog.tsx) -->

1. **Desteler** sekmesini açın. Listenin en üstünde kilit simgeli **TUS Kartları** satırını ve
   yanında **Ücretsiz aç** yazısını görürsünüz.
2. Satıra dokunun. **TUS Kartları** ekranı açılır: içerik, ders listesi ve kısa bilgiler.
3. Alttaki **Kartları ücretsiz aç** düğmesine dokunun. Ödeme, hesap veya internet bağlantısı
   gerekmez; paket uygulamanın içinden kurulur.
4. **Kartlar kuruluyor** penceresi birkaç saniye görünür. Bitince **Paket açıldı** mesajı gelir.
5. **Destelerime git** ile deste listesine dönün. **TUS Kartları** artık normal bir deste olarak
   listededir.

Kurulum kendi destelerinize, notlarınıza ve tekrar geçmişinize dokunmaz. Kurulum yarıda kalırsa
koleksiyonunuz olduğu gibi kalır; uygulamayı kapatıp yeniden açtığınızda kurulum kendiliğinden
yeniden denenir.

Zaten **TUS Kartları** adlı kendi desteniz varsa paket **TUS Kartları 2** adıyla kurulur; sizin
desteniz yerinde kalır.

> **Web sürümünde:** Paket kurulurken tarayıcıya indirilir, bu yüzden kurulum sırasında internet
> bağlantısı gerekir.

<a id="studying-the-pack"></a>
## Paketi çalışma

- Kurulumdan sonra **TUS Kartları** ve ders desteleri kapalı (katlanmış) gelir. Satırın solundaki
  oka dokunarak dersleri, bir derse dokunarak alt destelerini açarsınız.
- Bir alt desteyi, bir dersi veya paketin tamamını çalışabilirsiniz. Üst desteyi çalıştığınızda
  altındaki bütün kartlar gelir.
- Bütün kartlar **yeni** kart olarak gelir. Bu yüzden **Yeni** sütunu ilk gün büyük bir sayı
  gösterir. TusAnkiM'de yeni kartlar için günlük sınır yoktur; günde kaç yeni kart açacağınıza
  siz karar verirsiniz. Bkz. [Deste seçenekleri](06-deck-options.md#daily-limits).
- Pratik bir yol: bir seferde tek bir ders veya alt deste seçin, günlük hedefinize ulaşınca
  çalışmayı bırakın. Ertesi gün tekrarlar öncelikli gelir.
- Paket kartları kendi kartlarınız gibi çalışılır: cevap düğmeleri, bayraklar, askıya alma,
  gömme, **Özel çalışma** ve filtrelenmiş desteler aynı şekilde kullanılır. Tekrarlarınız
  istatistiklerde görünür.
- İstemediğiniz bir dersi silemezsiniz, ama kapalı tutabilir veya kartlarını askıya
  alabilirsiniz: **Kartlarım** ekranında `deck:"TUS Kartları::Anatomi"` gibi arayın,
  **Tümünü seç**, sonra **Diğer › Askıya al / askıdan çıkar**.
  Bkz. [Kartlarım ve arama](10-browser-and-search.md).

<a id="editing"></a>
## Kartları düzenleme

<!-- Uygulamada: Not düzenleme ekranı, paket notu açıkken bilgi satırı (help.tusCards.editorHint, app/editor.tsx:1140 yakını) "Daha fazla bilgi" → bu bölüm -->

Paket kartlarını kendi notlarınız gibi düzenleyebilirsiniz. Çalışma ekranında kartın menüsünden
**Notu düzenle** ile veya **Kartlarım** ekranından notu açın.

- Bütün alanların metnini değiştirebilir, biçimlendirme, resim ve ses ekleyebilir, boşluk
  doldurma numarası ekleyip çıkarabilirsiniz.
- Etiket ekleyip çıkarabilir, notu işaretleyebilir, kartlara bayrak koyabilirsiniz.
- Düzenleme kartların çalışma durumunu ve tekrar geçmişini değiştirmez. Bir boşluk numarasını
  sildiğinizde o kart boş kalır; **Boş kartlar** ile temizleyebilirsiniz.

> **Dikkat:** Paket kartlarında yaptığınız metin değişiklikleri yedeklere ve dışa aktarılan
> dosyalara girmez. Ayrıntı: [Yedekler ve dışa aktarma](#backups-and-export).

<a id="what-you-cannot-change"></a>
## Değiştirilemeyenler

Paketin yapısı korunur. Aşağıdakiler paket kartlarında ve destelerinde kullanılamaz; ilgili
seçenek ya menüde görünmez ya da dokunduğunuzda kısa bir açıklama çıkar.

| İşlem | Ne olur? |
| --- | --- |
| Paket destesini yeniden adlandırma, silme, açıklamasını düzenleme, alt deste ekleme | Deste ••• menüsünde bu seçenekler yoktur. |
| Paket destesini sürükleyip taşıma | Satırdaki taşıma tutamağı soluk görünür ve çalışmaz. |
| Paket kartını başka desteye taşıma | **Deste:** satırına veya **Desteyi değiştir**'e dokunduğunuzda açıklama çıkar. |
| Kendi kartlarınızı paket destesine taşıma veya yeni not ekleme | Paket desteleri hedef listesinde görünmez. Paket destesinin menüsündeki **Ekle**, notu kendi destelerinizden birine ekler; hangi deste olduğunu düzenleme ekranındaki **Deste:** satırında görürsünüz. |
| Not türünü değiştirme | **Tür:** satırına dokunduğunuzda açıklama çıkar. |
| Notu silme | **Notu sil** paket kartlarında görünmez. |
| Dışa aktarma | Paket desteleri dışa aktarma listesinde yoktur. |

<a id="updates"></a>
## İçerik güncellemeleri

Kartlardaki düzeltmeler uygulama güncellemesiyle gelir. Güncellemeden sonra uygulamayı ilk
açtığınızda paket kendiliğinden yenilenir; bunun için bir şey yapmanız gerekmez.

**Korunanlar:**

- Her kartın çalışma durumu: aralıklar, vadeler, bayraklar, askıya alınmış ve gömülmüş kartlar.
- Tekrar geçmişiniz ve istatistikleriniz.
- Metnini değiştirdiğiniz notlar: alanları, etiketleri ve kartlarıyla sizin hâlinizde kalır.
  Bu notlara o güncellemedeki düzeltme uygulanmaz.

**Paketteki hâline dönenler:**

- Metnini değiştirmediğiniz notlar. Bu notlara eklediğiniz etiketler ve işaretler de paketteki
  hâline döner.
- Paket destelerinin ayarları ve katlanma durumu. Bkz. [Ayar grupları](#presets).

Yeni paket yüklenemezse eski paket yerinde kalır ve bir sonraki açılışta yeniden denenir.

<a id="backups-and-export"></a>
## Yedekler ve dışa aktarma

<!-- Uygulamada: Yedekler ekranı, "Şimdi yedekle" altındaki ipucu (help.tusCards.backupHint, app/backups.tsx:234) ve Dışa aktar ekranı ipucu (help.tusCards.exportHint, app/export.tsx:300) → bu bölüm -->

Paketin kartları uygulamanın içinde gelir; bu yüzden yedeklere ve dışa aktarılan dosyalara kart
metni olarak girmez. Çalışmanızın ne kadarının korunduğu kullandığınız yola bağlıdır:

| Yol | Paket için ne saklanır? |
| --- | --- |
| **Yedekler** (otomatik veya **Şimdi yedekle**) | Her kartın çalışma durumu, bayraklar, etiketler ve tekrar geçmişi. Paket kartlarında yaptığınız metin değişiklikleri saklanmaz. |
| **Dışa aktar › Anki Koleksiyon Paketi (.colpkg)** | Paket kartları ve çalışma durumları dosyaya **girmez**. Dosya yalnızca kendi destelerinizi içerir. |
| **.apkg** ve düz metin dışa aktarma | Paket desteleri ve kartları seçilemez. |

- Aynı cihazda bir yedeği geri yüklediğinizde paket yeniden kurulur ve yedekteki çalışma durumu
  kartlara uygulanır.
- Paket kartlarını içeren bir dosya (`.apkg`, `.colpkg` veya metin) içe aktarılamaz.
- Bir `.colpkg` dosyasını içe aktarıp koleksiyonu değiştirirseniz paket baştan kurulur ve
  kartları yeni olarak başlar. İçe aktarmadan önce alınan güvenlik yedeğini geri yükleyerek eski
  durumunuza dönebilirsiniz.

Bkz. [Yedekler ve bakım](15-backups-and-maintenance.md) ve
[İçe ve dışa aktarma](14-import-export.md).

<a id="new-device"></a>
## Yeni bir cihaza geçerken

Uygulamanın yedekleri cihazın içinde durur. **Yedekler › Paylaş** ile bir yedeği dosya olarak
gönderdiğinizde dosya Anki paketine çevrilir; bu dosyada da paket kartları ve çalışma durumları
yoktur. Uygulamanın içinden, paketteki ilerlemenizi bir dosyayla başka cihaza taşımanın yolu
yoktur.

Yeni cihazda:

1. Kendi destelerinizi `.colpkg` dosyasıyla içe aktarın. Bkz.
   [İçe ve dışa aktarma](14-import-export.md).
2. **Desteler › TUS Kartları › Kartları ücretsiz aç** ile paketi yeniden kurun.
3. Paket kartları yeni kart olarak başlar. Daha önce iyi bildiğiniz dersleri hızlıca geçmek için
   **Kolay** düğmesini kullanabilirsiniz.

<a id="remove-the-pack"></a>
## Paketi kaldırma

Paketi tek başına kaldırmanın bir yolu yoktur; desteleri ve kartları silinemez. Çalışmak
istemediğiniz bölümleri kapalı tutabilir veya askıya alabilirsiniz
(bkz. [Paketi çalışma](#studying-the-pack)).

Paket yalnızca **Ayarlar › Veri yönetimi › İlerlemeyi sıfırla** ile kalkar. Bu komut paketle
birlikte **koleksiyonunuzun tamamını** siler: kendi destelerinizi, kartlarınızı ve tekrar
geçmişinizi. Silmeden önce geri yüklenebilir bir güvenlik yedeği alınır. Sıfırlamadan sonra
**TUS Kartları** yeniden kilitli görünür; isterseniz **Kartları ücretsiz aç** ile tekrar
kurabilirsiniz. Ayrıntılar: [Yedekler ve bakım](15-backups-and-maintenance.md#reset-progress).

<a id="presets"></a>
## Ayar grupları

<!-- Uygulamada: Deste seçenekleri › "Ayar grubu" satırı (app/deck-options.tsx:1113) için ipucu help.tusCards.presetHint → bu bölüm -->

Paket kendi **ayar grubuyla** gelir; adı **TUS Kartları**'dır. Uygulamanın kendi destelerinize
verdiği varsayılan ayar grubunun adı da **TUS Kartları**'dır. **Deste seçenekleri**'nin üstündeki
**Ayar grubu** satırı adın yanında kaç destenin bu grubu kullandığını gösterir (**N deste**);
iki grubu buradan ayırt edersiniz.

- Karışmaması için kendi ayar grubunuzu yeniden adlandırabilirsiniz: **Ayar grubu işlemleri › Ayar
  grubunu yeniden adlandır**. Bu ad güncellemelerden etkilenmez.
- Paketin ayar grubundaki değerleri değiştirebilir veya paket destelerine başka bir ayar grubu
  verebilirsiniz. Bir içerik güncellemesinden sonra paket desteleri yeniden paketin kendi ayar
  grubuna ve onun ilk değerlerine döner; güncellemeden sonra ayarlarınızı kontrol edin.

Bkz. [Deste seçenekleri](06-deck-options.md#presets).

## İlgili konular

- [Desteler](04-decks.md)
- [Kart ekleme ve düzenleme](08-adding-and-editing.md)
- [Yedekler ve bakım](15-backups-and-maintenance.md)
- [İçe ve dışa aktarma](14-import-export.md)
- [Sık sorulanlar ve sorun giderme](20-faq.md)
