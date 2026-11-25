# Patoloji editoryal düzenlemesi — 17 Ekim 2026

**609 not / 724 mevcut kart**, özgün `a08dd99` paketiyle karşılaştırıldı.
Kabul edilen sekiz tercihle **124 not / 133 alan** düzenlendi:
**85 ana metin**, **48 Ek bilgi**. Gruplar örtüşür.

- Özgün boş alanlara eklenen **25 açıklamanın tamamı** kaldırıldı.
- Sekiz başka arka yüzde yeni klinik özet, önem etiketi veya düzeltme gerekçesi
  çıkarıldı. Toplam **33 arka yüz boşaldı**, **15 arka yüz kısaltıldı**.
- Ana metindeki yeni örnekler, liste üyeleri, açıklayıcı parantezler ve kaynak
  dili temizlendi. BRCA listesine eklenen over kanseri, medulloblastoma eklenen
  Grup 3/4 ve stromelizin substrat listesi çıkarıldı.
- Gerekli cevap düzeltmeleri kısa ifadede kaldı. Prostat diyet kartı kanıtlanmış
  koruyuculuk iddiası taşımıyor. Papiller/rabdoid derece gruplaması eski
  histolojik sınıflama kapsamında soruluyor. Amiloidozların ortak başlığı senil
  formu kalıtsal göstermiyor. Lambl kabarıntıları tümörün yaşlılık formuyla
  eşitlenmiyor. Bu ayrımlar için uzun arka yüz açıklaması eklenmedi.
- Özgün kısa bilgiler, cloze görevleri ve medya korundu. Kaynaklar yalnız bu
  denetim kaydındadır; kartlara yazılmadı.

Sekiz kural: kart içine kaynak yazmama; sonradan eklenen arka yüzleri kaldırma;
ana metindeki isteğe bağlı ekleri çıkarma; yeni ilaç/örnek/liste üyesi eklememe;
kılavuz/klinik özet eklememe; uzun karşılaştırma ve gerekçe taşımama; düzeltmeyi
doğrudan kısa ifadede yapma; mevcut ezber kodlarını koruma.

[Beş dersin tek önce → sonra listesi — 442 not / 496 alan](../../outputs/kart-duzeltme/BKA_TUS_Tum_Dersler_Editoryal_Once_Sonra.md).
Bu liste sekiz tercih uygulanmadan hemen önceki alanlarla son alanları karşılaştırır.
Ham desteden beri yapılan bütün yazım değişikliklerini kapsamaz.

[Tam alan kaydı](patoloji-editorial.json), önceki not satırlarını ve değişiklik
sınırlarını içerir. [Asıl ders yamasının](patoloji.patch.json) `after` alanları
güncel paketle eşleşir. Önceki gerekçeler tarihsel kayıttır.
[Mevcut Patoloji kitabında](../../outputs/patoloji-denetimi-2026-10-08/BKA_TUS_Patoloji_Kart_Duzeltmeleri_Once_Sonra.xlsx)
güncel HTML ve okunur metin alanları eşitlendi; özgün alanlar, kullanıcı kararları,
bağımsız denetim hücreleri, stiller ve diğer yerel Excel parçaları korundu.

Dar doğruluk ayrımlarının dayanakları:

- [NCI diyet takviyeleri özeti](https://www.cancer.gov/about-cancer/treatment/cam/hp/prostate-supplements-pdq).
- [ACC wild-type ve herediter ATTR ayrımı](https://www.acc.org/Latest-in-Cardiology/Articles/2024/04/01/00/42/Feature-Cardiac-Amyloidosis-and-How-to-Stop-Missing-the-Diagnosis).
- [EANO menenjiom sınıflaması](https://pmc.ncbi.nlm.nih.gov/articles/PMC8563316/).
- [SCA Lambl kabarıntıları ve papiller fibroelastom ayrımı](https://scahq.org/wp-content/uploads/2026/02/SCA-Newsletter_FEB-2026-final.pdf).

Doğrulama: `npm run quality` geçti (**162 dosya / 1.693 test**, TypeScript,
iOS yapılandırması ve Anki kaynak sicili). APKG, açılan `.tuspack` ve manifest
eşleşir. 609 notun GUID'leri, 724 kartın ordinals ve gerçek cloze çıktıları
korundu. Kartlar, çalışma geçmişi, koleksiyon metaverisi, medya ve diğer dersler
bu tur sınırında değişmedi. Sonraki Anatomi turu yalnız kendi kapsamını değiştirir;
tarihsel hash testleri onun kayıtlı önceki satırlarını geri okuyarak karşılaştırır.
Eski hash'ler yeniden yazılmadı. Bu tur bütün tıbbi önermelere toplu onay vermez;
fiziksel iPhone smoke testi yapılmadı.

İki ders tamamlandıktan sonraki paket SHA-256:
`7428ba681ef026f805ac73796798054f2da82150a7b12c8b51017b2bfd7865a9`.

Tek listeyi yeniden üretmek için `python3 scripts/build-catalog-editorial-report.py`.
Uygulayıcı `scripts/apply-catalog-editorial.py` varsayılan olarak salt okunur
doğrular; `--apply` tam önce/sonra, kapsam ve değişiklik sınırı eşleşmesi ister.
Sonraki ders turu eski bir turun sınır doğrulamasını durdurabilir; eski alanları
zorla pakete yazmaz.
