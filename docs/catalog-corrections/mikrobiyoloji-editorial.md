# Mikrobiyoloji editoryal düzenlemesi — 17 Ekim 2026

**587 not / 730 mevcut kart** özgün `a08dd99` paketiyle karşılaştırıldı.
Farmakoloji'de kabul edilen sekiz tercihle **70 not / 75 alan** değişti.

1. Kart içinde kaynak adı, URL, sayfa veya kaynak amacıyla kurum/yıl atfı tutulmaz.
2. Sonradan eklenen Ek bilgi / arka yüz açıklamaları kaldırılır.
3. Ana metindeki isteğe bağlı açıklamalar ve parantezler kaldırılır.
4. Yeni ilaç, örnek veya liste üyeleriyle kapsam genişletilmez.
5. Ek kılavuz ve klinik uygulama özeti yazılmaz.
6. Uzun karşılaştırma ve düzeltme gerekçesi karta taşınmaz.
7. Gerekli düzeltme doğrudan ilgili ifadede kısa yapılır; doğru cevabın gerekli
   hasta/örnek kapsamı korunur.
8. Özgün ezber kodları ve kısa özgün arka yüz bilgileri korunur.

## Sonuç

- **45 Ek bilgi alanı** düzenlendi. 25'i özgün boş alana eklenen açıklamaydı.
  Sekiz başka alandaki yeni özet, kişisel önem etiketi veya kaynak karşılaştırması
  da kaldırıldı. Böylece **33 arka yüz metni** çıkarıldı: **32 alan boşaldı**,
  birinde yalnız özgün görsel kaldı. **12 alan** kısa özgün içeriğe indirildi.
- **30 ana metin** sadeleştirildi. Gruplar örtüşür; toplam 70 nottur.
- `LEKE`, `Bazı Aşklar Zigot Oluşturur`, `H/S/B/C/Para/Peni`, `ÖMGE`, `EGÖM`
  ve diğer özgün kodlar korundu. Görsel/ses referansları değiştirilmedi.
- TLR listesine eklenen TLR-8 çıkarıldı. Özgün parainfluenza öğrenme satırı,
  onun yerine konmuş metapnömovirüs örneğinden geri alındı; yanlış ortak aile
  başlığı kısa tutuldu ve gizli protein cevapları başlıkta verilmedi.
- Yenidoğan HIV kartındaki kurum/tarih ve ek emzirme/izlem özeti kaldırıldı.
  Risk temelli kısa cevaplar ile dolutegravirli rejimin gestasyon/kilo koşulu kaldı.
- Tetanoz arka yüz istisnası kaldırılırken ana soru HIV/ağır immün yetmezliği
  olmayan kişiye daraltıldı. E. dispar ayrımındaki seroloji karşılığı, kısa
  türe özgü antijen testi / PCR yanıtıyla düzeltildi.

## Önce / sonra ve güncel kayıtlar

Kullanıcının istediği **tek Markdown listesi**, üç tamamlanmış dersin tamamını içerir:
[221 not / 260 alanın önce ve sonrası](../../outputs/kart-duzeltme/BKA_TUS_Tum_Dersler_Editoryal_Once_Sonra.md).
Liste bu sekiz tercih öncesi ile sonrası arasındadır; ham desteden beri yapılan
bütün geçmiş yazım değişikliklerinin listesi değildir. Değişen alanlar tam gösterilir.

- [`mikrobiyoloji-editorial.json`](mikrobiyoloji-editorial.json): alan bazında tam
  HTML önce/sonrası, kapsam kimlikleri, değişiklik sınırları, önceki not satırları.
- [`mikrobiyoloji.patch.json`](mikrobiyoloji.patch.json): güncel `after` alanları ve
  `editorialHistory`. Önceki gerekçeler kendi turlarının tarihsel kaydıdır.
- [Mevcut ortak denetim kitabı](../../outputs/kart-duzeltme/BKA_TUS_Farmakoloji_Kart_Duzeltmeleri_Once_Sonra.xlsx):
  `Son Revize Mikrobiyoloji` F sütununun 21 kaydı güncel paketle eşitlendi;
  etkilenen H işlemleri ve tarih/hash özeti güncellendi. Diğer ders sayfaları korundu.

`outputs/kart-duzeltme/` içindeki eski Mikrobiyoloji taslak JSON'u ilk öneri kaydıdır;
güncel kart alanlarında yukarıdaki asıl ders yaması ve editoryal kayıt esas alınır.

## Dar düzeltmelerin kaynakları

Kaynaklar kart alanlarına eklenmedi; yalnız denetim kaydındadır.

- [CDC tetanoz yara yönetimi](https://www.cdc.gov/tetanus/hcp/clinical-guidance/index.html):
  HIV/ağır immün yetmezlikteki TIG istisnası için hasta kapsamı.
- [CDC amebiyaz tanısı](https://www.cdc.gov/dpdx/amebiasis/): E. histolytica / E. dispar
  ayrımında türe özgü antijen ve moleküler testler.
- [NIH perinatal HIV maruziyeti](https://clinicalinfo.hiv.gov/en/guidelines/pediatric-arv/management-infants-utero-intrapartum-breastfeeding-hiv-exposure):
  korunan risk ve gestasyon/kilo koşulları.
- [ICTV Respirovirus](https://ictv.global/report/chapter/paramyxoviridae/paramyxoviridae/respirovirus)
  ve [Pneumoviridae](https://ictv.global/report/chapter/pneumoviridae/pneumoviridae):
  özgün parainfluenza satırının geri alınması ve RSV'yi yanlış aileye sokmayan başlık.

Bu editoryal tur önceki raporlardaki bütün tıbbi önermelere bağımsız toplu onay vermez.

## Doğrulama

- `npm run quality`: TypeScript, **161 dosya / 1.685 test**, iOS yapılandırması ve
  Anki kaynak sicili kontrolleri geçti. `git diff --check` geçti.
- APKG, açılan `.tuspack` baytları ve manifest hash'i eşleşir. Toplamlar sabit:
  7.721 not, 9.575 kart, 12 ders, 106 konu, 49 medya.
- 587 not/GUID, 730 kart/ordinal ve gerçek cloze soru/cevap çıktıları doğrulandı.
- Asıl yamanın 586 kaydı ve tek listedeki 260 son alan güncel paketle eşleşir.
- Kart satırları, çalışma geçmişi, koleksiyon metaverisi, medya ve diğer 11 ders,
  bu tur öncesiyle aynıdır. Tamamlanan Farmakoloji ve Biyokimya turları korunur.
- Önceki ders sınır testleri, sonraki derslerin kayıtlı önceki satırlarını yalnız
  tarihsel hash kontrolü için geri yerleştirir; eski alanlar pakete yazılmaz.
- Ortak Excel'de yalnız 31 hücre değişti; diğer hücre değerleri, stiller,
  filtreler, açıklamalar ve yerel ZIP parçaları korundu. Değişen görünüm kontrol edildi.
- Uygulama betiği son salt okunur çalışmada sıfır değişiklik bildirir. ZIP CRC
  ve SQLite bütünlüğü geçti. Bu tur iPhone canlı smoke testi yapılmadı;
  import, sahiplik veya native akış değişmedi.

Güncel APKG SHA-256:
`79344b1e72cbf5dce93d7f21164d022cc88216a574ca10d9aaa22a9c18dc3e74`.

Tek listeyi güncel denetim kayıtlarından yeniden üretmek için:

```bash
python3 scripts/build-catalog-editorial-report.py
```

Editoryal yamayı önce salt okunur doğrulamak için:

```bash
python3 scripts/apply-catalog-editorial.py --patch docs/catalog-corrections/mikrobiyoloji-editorial.json
```

`--apply` yalnız tam önce/sonra alan eşleşmesi ve o turun değişiklik sınırları
sağlandığında atomik uygular. Sonraki ders turları tarihsel sınır kontrolünde
durabilir; eski alanlar zorla yazılmaz.
