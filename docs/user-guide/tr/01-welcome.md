---
id: welcome
title: TusAnkiM nedir?
summary: TusAnkiM'in ne işe yaradığı, verilerinizin nerede durduğu ve kılavuzun nasıl kullanılacağı.
order: 1
web_path: /yardim/tusankim-nedir
app_help: help?article=welcome
app_screens:
  - "Yardım merkezi açılış makalesi — app/help.tsx (yeni)"
  - "Ayarlar › Hakkında — app/settings.tsx (renderAbout)"
verified_against: master c6108e6 (2026-10-25)
---

# TusAnkiM nedir?

TusAnkiM, TUS'a (Tıpta Uzmanlık Sınavı) hazırlananlar için yapılmış bir bilgi kartı uygulamasıdır.
Kartlarınızı aralıklı tekrar yöntemiyle, yani tam unutmak üzereyken karşınıza çıkararak çalıştırır.
Kendi kartlarınızı yazabilir, Anki'de hazırladığınız desteleri içe aktarabilir veya hazır TUS kart
paketini ücretsiz kurabilirsiniz.

<a id="what-you-can-do"></a>
## Neler yapabilirsiniz?

- **Çalışmak:** Kartın sorusunu görür, cevabı açar, ne kadar iyi hatırladığınızı dört düğmeden
  biriyle söylersiniz. Uygulama kartın ne zaman yeniden geleceğini buna göre hesaplar.
  Bkz. [Çalışma ekranı](05-studying.md).
- **Kart yazmak:** Biçimlendirme, resim, ses kaydı, fotoğraf üzerine çizim ve boşluk doldurma
  (cloze) kartları desteklenir. Bkz. [Kart ekleme ve düzenleme](08-adding-and-editing.md).
- **Desteleri düzenlemek:** Kartları ders ve konu destelerine, alt destelere ayırabilir; her
  deste için ayrı çalışma ayarı kullanabilirsiniz. Bkz. [Desteler](04-decks.md) ve
  [Deste seçenekleri](06-deck-options.md).
- **Aramak ve toplu işlem yapmak:** **Kartlarım** ekranında bütün kartlarınızı arayabilir,
  etiketleyebilir, bayraklayabilir, taşıyabilir veya askıya alabilirsiniz.
  Bkz. [Kartlarım ve arama](10-browser-and-search.md).
- **İlerlemenizi izlemek:** İstatistikler, günlük seri, çalışma takvimi ve ders çalışma süresini
  ölçen **Kronometre**. Bkz. [İstatistikler](12-statistics.md) ve
  [Kronometre ve çalışma takvimi](13-stopwatch-and-calendar.md).
- **Anki ile veri alışverişi:** `.apkg` ve `.colpkg` paketlerini, CSV/TSV/TXT dosyalarını içe ve
  dışa aktarabilirsiniz. Bkz. [İçe ve dışa aktarma](14-import-export.md) ve
  [Anki ile birlikte kullanma](19-using-with-anki.md).

<a id="your-data"></a>
## Verileriniz nerede durur?

- Kartlarınız, tekrar geçmişiniz, yedekleriniz ve ayarlarınız **yalnızca cihazınızda** saklanır.
  Hesap açmanız gerekmez; kartlarınız ve çalışma geçmişiniz hiçbir sunucuya gönderilmez. Uygulamada
  reklam, analitik veya takip yoktur.
- Uygulama tamamen **çevrimdışı** çalışır. İnternet bağlantısı çalışmak için gerekmez.
- **Uygulamayı silerseniz cihazdaki bütün verileri de silinir.** Silmeden önce koleksiyonunuzu
  dışa aktarın.
- Cihazlar arasında **otomatik eşitleme yoktur**. Kartlarınızı başka bir cihaza taşımak için
  koleksiyonunuzu dışa aktarıp diğer cihazda içe aktarırsınız.
  Bkz. [İçe ve dışa aktarma](14-import-export.md).
- Uygulama cihazda otomatik yedek alır. Cihazınızı kaybetmeye karşı korunmak için ara sıra
  koleksiyonunuzu **⋮ › Dışa aktar** ile bir `.colpkg` dosyası olarak **Dosyalar** uygulamasına veya
  bilgisayarınıza kaydedin. Bkz. [Yedekler ve bakım](15-backups-and-maintenance.md#share-backup).

> **Web sürümünde:** Uygulamanın tarayıcıda açılan bir önizlemesi de vardır
> (`tusankim.vercel.app`). Orada koleksiyon tarayıcınızın kendi deposunda tutulur ve hiçbir yere
> yüklenmez; tarayıcının site verilerini silerseniz koleksiyon da silinir. Asıl uygulama iPhone
> uygulamasıdır.

<a id="tus-card-pack"></a>
## Hazır TUS kart paketi

Deste listesinde, kendi destelerinizin yanında isteğe bağlı bir hazır paket görürsünüz: 12 temel ve
klinik bilim dersinde 9.575 kart. Paket ücretsiz kurulur ve kendi kartlarınıza dokunmaz.
Bkz. [TUS Kartları paketi](17-tus-card-pack.md).

<a id="important"></a>
## Bilmeniz gerekenler

- **Eğitim amaçlıdır.** TusAnkiM ve içindeki kartlar yalnızca eğitim ve sınava hazırlık içindir;
  tıbbi tavsiye, tanı, tedavi önerisi veya klinik karar desteği değildir. Klinik kararlarda güncel
  resmî kaynaklara ve yetkili sağlık profesyonellerine başvurun.
- **Bağımsız bir projedir.** TusAnkiM, Anki paketleriyle çalışır ama Anki'nin bir parçası
  değildir; Anki veya Ankitects ile bağlantılı değildir ve onlar tarafından onaylanmamıştır.
  Anki'den farklı çalışan yerler bu kılavuzda **Anki'den farkı** notlarıyla belirtilir.
- **Dil:** Uygulama Türkçe ve İngilizce kullanılabilir. Dili **Ayarlar › Genel › Dil** bölümünden
  değiştirirsiniz.

<a id="using-this-guide"></a>
## Bu kılavuzu kullanma

- Uygulamada bir ekranın başlığındaki **ⓘ** veya bir ayar kartındaki **?** düğmesi o ekranın kısa
  açıklamasını açar. Açıklamanın altındaki **Daha fazla bilgi** bağlantısı sizi bu kılavuzun ilgili
  bölümüne getirir.
- Yeni başlıyorsanız sırayla [Temel kavramlar](02-key-concepts.md) ve
  [Hızlı başlangıç](03-quick-start.md) bölümlerini okuyun.
- Bir sorunla karşılaştıysanız [Sık sorulanlar ve sorun giderme](20-faq.md) bölümüne bakın.
  Çözüm bulamazsanız **Ayarlar › Hakkında › Destek** bağlantısından bize yazabilirsiniz. Destek
  kaydına kişisel sağlık verisi veya parola yazmayın.

## İlgili konular

- [Temel kavramlar](02-key-concepts.md)
- [Hızlı başlangıç](03-quick-start.md)
- [Anki ile birlikte kullanma](19-using-with-anki.md)
- [Sözlük](21-glossary.md)
