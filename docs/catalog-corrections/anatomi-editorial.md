# Anatomi editoryal düzenlemesi — 17 Ekim 2026

**381 not / 477 mevcut kart**, özgün `a08dd99` paketiyle karşılaştırıldı.
Kabul edilen sekiz tercihle **97 not / 103 alan** düzenlendi:
**70 ana metin**, **33 Ek bilgi**. Gruplar örtüşür.

- Özgün boş alanlara eklenen **18 açıklamanın tamamı** kaldırıldı.
- **15 arka yüz** özgün kısa içeriğe indirildi. Örneğin fleksor carpi ulnaris
  kartında pisiforme bilgisi kaldı; eklenen diğer kas bilgisi çıkarıldı.
- Yeni klinik örnekler, sinir kökü sayıları, eş anlamlı adlar, parantezler ve
  liste üyeleri temizlendi. Ayak tabanı listesine eklenen flexor hallucis brevis
  çıkarılırken soru örneklerle sınırlandı. Kapalı kinetik zincir koşulu korundu.
- Chopart kartındaki uzun parantez yerine doğrudan kısa `talonavicularis`
  cevabı kullanıldı. [Anatomik çalışma](https://pmc.ncbi.nlm.nih.gov/articles/PMC11026982/)
  bu eklem kapsamını destekler. Kaynak kart içine yazılmadı.
- `SELaM`, `THORA3 X2`, `TOP`, `ODTÜ`, `EGO`, `LFT`, `LAFF`, `BABV`, `ABV`,
  `VAB`, `VAP` ve `AVN` gibi mevcut kodlar korundu. Görseller ve diğer alanlar
  değiştirilmedi. Özgün boş HTML biçimleri içerik eklenmeden korunabilir.

Sekiz kural: kart içine kaynak yazmama; sonradan eklenen arka yüzleri kaldırma;
ana metindeki isteğe bağlı ekleri çıkarma; yeni ilaç/örnek/liste üyesi eklememe;
kılavuz/klinik özet eklememe; uzun karşılaştırma ve gerekçe taşımama; düzeltmeyi
doğrudan kısa ifadede yapma; mevcut ezber kodlarını koruma.

[Beş dersin tek önce → sonra listesi — 442 not / 496 alan](../../outputs/kart-duzeltme/BKA_TUS_Tum_Dersler_Editoryal_Once_Sonra.md).
Liste sekiz tercih öncesi ile sonrası arasındadır; ham desteden beri yapılan
bütün geçmiş yazım değişikliklerinin listesi değildir.

[Tam alan kaydı](anatomi-editorial.json), önceki not satırlarını ve değişiklik
sınırlarını içerir. [Asıl ders yamasının](anatomi.patch.json) `after` alanları
güncel paketle eşleşir. Önceki gerekçeler tarihsel kayıttır.
[Mevcut Anatomi kitabında](../../outputs/anatomi-denetimi-2026-10-08/BKA_TUS_Anatomi_Bagimsiz_Denetim.xlsx)
güncel Text/Extra alanları eşitlendi. Özgün alanlar, bağımsız karar alanları,
öneriler, stiller ve diğer yerel Excel parçaları korundu; eski öneriler tarihsel
olarak etiketlendi.

Doğrulama: `npm run quality` geçti (**162 dosya / 1.693 test**, TypeScript,
iOS yapılandırması ve Anki kaynak sicili). APKG, açılan `.tuspack` ve manifest
eşleşir. 381 not/GUID, 477 kart/ordinal ve gerçek cloze çıktıları doğrulandı.
Kartlar, çalışma geçmişi, koleksiyon metaverisi, medya ve diğer 11 ders bu turun
öncesiyle aynıdır. Tamamlanan Farmakoloji, Biyokimya, Mikrobiyoloji ve Patoloji
düzenlemeleri korunur. Bu editoryal tur bütün tıbbi önermelere toplu onay vermez;
fiziksel iPhone smoke testi yapılmadı.

Güncel paket SHA-256:
`7428ba681ef026f805ac73796798054f2da82150a7b12c8b51017b2bfd7865a9`.

Tek listeyi yeniden üretmek için `python3 scripts/build-catalog-editorial-report.py`.
Uygulayıcı `scripts/apply-catalog-editorial.py` varsayılan olarak salt okunur
doğrular; `--apply` tam önce/sonra ve değişiklik sınırı eşleşmesi ister.
