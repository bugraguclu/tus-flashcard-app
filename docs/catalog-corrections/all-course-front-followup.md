# Tüm derslerde ön yüz ve soru–açıklama düzeltmeleri — 9 Ekim 2026

**12 dersin tamamı kapsandı. Bu turda 141 not / 328 mevcut kart düzeltildi.**
Cevabın başka satırdan okunması, soru kökündeki ipuçları ve ön/arka kapsam
çelişkileri giderildi. Değişiklikler APKG, dağıtılan `.tuspack`, manifest ve
12 dersin kalıcı yama kayıtlarına uygulandı. Önceki
[13 not / 21 kart düzeltmesi](publish-front-followup.md) ayrıca korunuyor.

## Kapsam ve seçim

Kataloğun 7.721 notu / 9.575 kartı envantere alındı. Uygulamanın göstericisiyle
9.492 cloze ön yüzü ve 83 Basic ön yüzü otomatik kontrol edildi. Boş soru/cevap,
çözümlenmemiş cloze sözdizimi ve gizlenen cevabın görünür metinde aynı biçimde
tekrarlanması arandı. Bu, her tıbbi önermenin yeniden tek tek okunması değildir.

İlk cloze taraması 141 notta 237 aday ön yüz buldu. Adayların 77 notundaki
doğrudan sızıntılar düzeltildi. Kalan 64 notta eşleşmeler; karşılaştırma seçenekleri,
başka ilişkiye ait ortak terimler veya sorunun gerekli bağlamı olarak değerlendirildi.
Önceki ders raporlarındaki ön/arka çelişkileri de ders gruplarıyla ve odak kaynaklarla
kontrol edildi. Böylece düzeltme sayısı toplam 141 nota ulaştı; bu sayı ilk taramanın
141 aday notuyla aynı kümeyi ifade etmez.

Son literal taramada 67 not / 98 aday yüz kaldı. Bu sayı 98 hata anlamına gelmez:
örneğin farklı damar adlarındaki “thoracica”, farklı etkilerdeki “kasar” veya WHI
karşılaştırmasındaki hastalık adları aynı kelimeyi taşıyabilir. 83 Basic ön yüzde
aynı yöntemle doğrudan cevap eşleşmesi bulunmadı. Sözcük eşleştirmesi, eş anlamlı
veya görsel ipuçlarını tek başına dışlamaz.

## Uygulanan notlar

| Ders | Düzeltilen not |
| --- | ---: |
| Anatomi | 7 |
| Biyokimya | 15 |
| FHE | 13 |
| Farmakoloji | 7 |
| Mikrobiyoloji | 11 |
| Patoloji | 8 |
| Deneme ve Soru | 3 |
| Dahiliye | 24 |
| Pediatri | 15 |
| Kadın Doğum | 11 |
| Genel Cerrahi | 18 |
| Küçük Stajlar | 9 |
| **Toplam** | **141** |

77 not cevap görünürlüğü, 63 not ön/arka kapsam uyumu, bir not her iki başlıkla
işlendi. Aynı notun farklı kartları birlikte kontrol edildi; yeni kart üretilmedi.

Öne çıkan düzeltmeler:

- Karşılıklı tablolar ve tekrar eden cevaplar, mevcut cloze numaraları korunarak
  gizlendi. Başlık ve soru kökündeki cevabı ele veren ifadeler düzeltildi.
- SUNCT, hipotermide veküronyum, HES ve stres ülseri profilaksisi gibi ters veya
  çelişkili yanıtlar ön ve arka yüzde uyumlu hâle getirildi.
- Yenidoğan HIV tedavisi, perioperatif steroid, PID, kontrasepsiyon ve lipid
  hedeflerinde cevabı değiştiren risk grubu, süre ve uygulama koşulları soruya taşındı.
- Parkland ve eski üçlü H gibi tarihsel bilgiler, güncel tedavi önerisi olarak
  okunmayacak kapsamla soruldu; güncel yaklaşım açıklamaya eklendi.

Her notun kimliği, önce/sonra alanları, gerekçesi, kaynak bağlantıları ve ilgili
ön yüz kontrolleri [alan bazlı kayıt](all-course-front-followup.json) içindedir.
Kaynaklar yalnız değiştirilen odak iddialarını destekler; bütün notun bütün
önermelerine toplu onay anlamına gelmez.

## Veri bütünlüğü ve doğrulama

Tur öncesi yedekle son APKG'nin bütün veritabanı satırları karşılaştırıldı.
Yalnız 141 notun `flds`, `sfld`, `csum`, `mod` alanları değişti. Not GUID'leri,
kart kimlikleri ve ordinal değerleri, planlama/geçmiş alanları, model ve deste
verileri aynen kaldı. Veritabanı dışındaki ZIP girdileri ve 49 medya dosyası
bayt düzeyinde aynı. Kullanıcının canlı koleksiyonuna işlem yapılmadı.

| Kontrol | Sonuç |
| --- | --- |
| Toplamlar | 7.721 not / 9.575 kart / 12 ders / 49 medya; aynı |
| ZIP CRC ve SQLite bütünlüğü | Geçti |
| `.tuspack` → APKG ve manifest eşleşmesi | Geçti |
| 12 dersin güncel yama alanları / GUID'leri | Paketle birebir aynı |
| Düzeltilen 141 notun 328 gerçek ön/arka gösterimi | Boş veya çözümlenmemiş cloze yok |
| Denetlenen cevapların ön yüzde bulunmaması | 189 kontrol geçti |
| Katalog içerik regresyonu | 16 test geçti |
| `npm run quality` | TypeScript, 156 test dosyası / 1.659 test, iOS yapılandırma ve kaynak sicili geçti |

Farmakoloji çalışma kitabındaki ilgili alanlar ve mevcut takip sekmelerinin
eşleşen kayıtları da güncellendi: 229 hücre, yedi yeni değişiklik kalemi.
Diğer hücreler, formüller ve çalışma kitabının özgün bileşenleri korundu.

Son APKG SHA-256:
`7030ad699f7fd19b9f97ca666321133833bf3dfb47d8c1527bbae8b0e6fa0bd3`.
Son `.tuspack` SHA-256:
`cb95c69cfcb3baa6984bfe86b6c52394484daa2af42afa278c19922c88cefe6a`.

Test: [catalogContentCorrections.test.ts](../../lib/catalogContentCorrections.test.ts).
Yerel kanıtlar: [paket doğrulaması](../../outputs/tum-dersler-on-yuz-2026-10-09/verification.json),
[yedek karşılaştırması](../../outputs/tum-dersler-on-yuz-2026-10-09/final-integrity.json),
[son tarama](../../outputs/tum-dersler-on-yuz-2026-10-09/final-scan.json),
[quality çıktısı](../../outputs/tum-dersler-on-yuz-2026-10-09/quality.log).
Kanıt dizini mevcut depo kuralıyla yerel `outputs/` altındadır.

## Yayın değerlendirmesi

Bu turda tespit edilip kayda alınan ön yüz sızıntıları ve ön/arka çelişkileri
güncel pakette kapatıldı. Önceki ders denetimlerindeki bütün açık tıbbi iddiaların
kaynak incelemesi bu turla tamamlanmış sayılmaz; eski rapor toplamları güncel
kalan hata sayısı olarak kullanılamaz. Fiziksel iPhone kart smoke testi de
yapılmadı. Kataloğun tamamına koşulsuz son yayın onayı verilmedi.
