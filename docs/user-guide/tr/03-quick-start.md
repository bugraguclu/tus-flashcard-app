---
id: quick-start
title: Hızlı başlangıç
summary: İlk açılıştan ilk çalışmaya: kart paketini kurma, deste ve kart ekleme, Anki destesi getirme, çalışma.
order: 3
web_path: /yardim/hizli-baslangic
app_help: help?article=quick-start
app_screens:
  - "Desteler sekmesi (ilk açılış) — app/(tabs)/decks.tsx"
  - "İlk açılış kartı — help.firstRun.* (bkz. in-app/01-decks.md)"
verified_against: master c6108e6 (2026-10-25)
---

# Hızlı başlangıç

Bu sayfa sizi birkaç dakikada ilk çalışmanıza götürür. Ayrıntılar için her adımın sonundaki
bağlantıya bakın.

<a id="first-screen"></a>
## 1. İlk ekran: Desteler

Uygulama **Desteler** ekranıyla açılır. İlk açılışta orada iki satır görürsünüz:

- **TUS Kartları** — kilit simgeli, "9.575 kart · 12 ders · 106 alt deste" yazan hazır paket.
  Henüz cihazınızda değildir; dokunduğunuzda tanıtım ekranı açılır.
- **Varsayılan** — boş bir deste. Başka deste seçmediğiniz kartlar buraya gider.

Ekranın altında **Kartlarım**, **İstatistik** ve **Ayarlar** düğmeleri, sağ altta yeni deste veya
kart eklemek için **＋** düğmesi, sağ üstte de **⋮** (Diğer seçenekler) menüsü bulunur.

<a id="get-cards"></a>
## 2. Kart edinin

Üç yoldan birini veya hepsini kullanabilirsiniz.

<a id="install-tus-pack"></a>
### Hazır TUS paketini kurun

1. Deste listesinde **TUS Kartları** satırına dokunun.
2. Paketin içeriğine göz atın ve **Kartları ücretsiz aç** düğmesine dokunun.
3. Kurulum birkaç saniye sürer. **Paket açıldı** mesajından sonra **Destelerime git** ile listeye
   dönün; 12 ders destesi ve alt desteleri orada olur.

Paket internet gerektirmez, ödeme veya hesap istemez. Bkz. [TUS Kartları paketi](17-tus-card-pack.md).

<a id="create-own-cards"></a>
### Kendi kartlarınızı yazın

1. **＋ › Deste oluştur** ile bir deste açın, örneğin `Farmakoloji`. Alt deste için adı
   `Farmakoloji::Antibiyotikler` biçiminde yazın.
2. **＋ › Kart ekle** ile düzenleyiciyi açın. Üstteki **Tür** satırından not türünü (örneğin
   **Temel**), **Deste** satırından desteyi seçin.
3. **Ön** alanına soruyu, **Arka** alanına cevabı yazın.
4. Sağ üstteki **✓** düğmesiyle kaydedin. Açılan pencerede **Yeni not ekle** ile bir sonraki karta
   geçin veya **Bitti** ile çıkın.

Bkz. [Kart ekleme ve düzenleme](08-adding-and-editing.md).

<a id="bring-anki-decks"></a>
### Anki destenizi getirin

1. Anki'den dışa aktardığınız `.apkg` dosyasını iPhone'a aktarın (AirDrop, iCloud Drive, Dosyalar).
2. **Dosyalar** uygulamasında dosyaya dokunun ve paylaşım menüsünden TusAnkiM'i seçin. Ya da
   TusAnkiM'de **⋮ › İçe aktar › Dosya seç** yolunu kullanın.
3. Seçenekleri kontrol edip **İçe aktar** düğmesine dokunun.

Anki'deki koleksiyonunuzun tamamını taşımak istiyorsanız önce
[Anki ile birlikte kullanma](19-using-with-anki.md#move-whole-collection) bölümünü okuyun:
koleksiyon paketi mevcut kartlarınızın yerine geçer.

<a id="first-study"></a>
## 3. Çalışın

1. Deste listesinde bir destenin **adına** dokunun. Çalışma ekranı o deste ve alt desteleriyle
   açılır.
2. Soruyu okuyun ve cevabı aklınızdan söyleyin.
3. **Cevabı göster**'e dokunun.
4. Ne kadar iyi hatırladığınıza göre **Tekrar**, **Zor**, **İyi** veya **Kolay**'a dokunun.
   Yanlışlıkla bastıysanız son cevabı geri alabilirsiniz.
5. Bugünlük kartlar bitince **Tebrikler!** ekranı çıkar. **‹ Destelere Dön** ile listeye dönün.

Düğmelerin anlamı için [Temel kavramlar](02-key-concepts.md#answer-buttons), ekranın bütün
araçları için [Çalışma ekranı](05-studying.md) bölümüne bakın.

> **Anki'den farkı:** Deste adına dokunmak doğrudan çalışmayı başlatır. Destenin özetini görmek
> için satırın **•••** menüsünden **Genel bakış**'ı seçin.

<a id="daily-habit"></a>
## 4. Her gün biraz

- Aralıklı tekrar en iyi her gün çalışıldığında işler. Kaçırdığınız günlerin tekrarları
  birikir ve sonraki günlere taşınır.
- Yeni kartlarda günlük sınır yoktur; kaç yeni kart açacağınıza siz karar verirsiniz. Her yeni kart
  sonraki günlerde tekrar olarak geri döneceği için yükünüzü buna göre ayarlayın.
- Günlük hatırlatma için **Ayarlar › Bildirimler** bölümünde **Hatırlatma saati**'ni seçin.
  Bkz. [Ayarlar](16-settings.md#notifications).
- İlerlemenizi **İstatistik** ekranından, ders çalışma sürenizi **Kronometre** ile izleyebilirsiniz.
  Bkz. [İstatistikler](12-statistics.md) ve [Kronometre ve çalışma takvimi](13-stopwatch-and-calendar.md).

<a id="protect-your-data"></a>
## 5. Verilerinizi koruyun

Uygulama, koleksiyonunuzda değişiklik olduğunda cihazda düzenli olarak otomatik yedek alır. Bu
yedekler aynı cihazdadır. Telefonunuzu kaybetmeye veya değiştirmeye karşı ara sıra
**⋮ › Dışa aktar** ile koleksiyonunuzun bir kopyasını **Dosyalar** uygulamasına ya da
bilgisayarınıza kaydedin. Bkz. [Yedekler ve bakım](15-backups-and-maintenance.md).

## İlgili konular

- [Temel kavramlar](02-key-concepts.md)
- [Desteler](04-decks.md)
- [Çalışma ekranı](05-studying.md)
- [Sık sorulanlar ve sorun giderme](20-faq.md)
