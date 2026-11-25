# Biyokimya editoryal düzenlemesi — 17 Ekim 2026

Kapsam: **484 not / mevcut 602 kart**. Kullanıcının Farmakoloji'de kabul ettiği
sekiz tercih, özgün `a08dd99` paketi ile güncel kartlar karşılaştırılarak uygulandı.

## Uygulanan tercihler

1. Kart içine kaynak adı, URL, sayfa veya kaynak amacıyla kurum/yıl atfı yazılmaz.
2. Sonradan eklenen Ek bilgi / arka yüz açıklamaları kaldırılır.
3. Ana metindeki isteğe bağlı açıklamalar ve parantezler kaldırılır.
4. Yeni ilaç, örnek veya liste üyeleri eklenmez.
5. Ek kılavuz ve klinik uygulama özeti yazılmaz.
6. Uzun karşılaştırmalar ve düzeltme gerekçeleri karta taşınmaz.
7. Gerekli düzeltme doğrudan ilgili ifadede, kısa yapılır. Açıklama silinirken
   ön yüzde eski veya yanlış bir karşılık bırakılmaz; gerekli kapsam koşulu korunur.
8. Özgün ezber kodları ve kısa özgün arka yüz bilgileri korunur.

## Sonuç

- **29 not** güncellendi.
- **23 Ek bilgi alanı** değişti: 18'i özgün boş alana eklenen açıklamalardı;
  biri kişisel önem notunun yerine eklenmiş bir gerekçeydi. Bu **19 alan boşaltıldı**.
  Diğer **4 alan**, özgün kısa bilgiye indirildi.
- **18 Metin alanı** düzenlendi. Gruplar örtüşür; not sayısına eklenmez.
- 46 nottaki özgün kısa arka yüz metni ve bir notun yalnız görsel içeren arka
  yüzü korundu. `VaLİ FaTiH MuTLu`, `FİT Trp`, `VİM Thr`, `PEST` kodları kaldı.
- Sonradan eklenen sitokrom c1 üyesi, çinko parmaklardaki ek His parantezi,
  Pribnow konumu, HbF zincir/konum açıklaması ve izopeptid adlandırma eki çıkarıldı.
- LDH'nin çinko listesindeki yeri, Apo D/CETP özdeşliği, bakteriyel translokasyon
  faktörü, sikloheksimid mekanizması ve ER taşıyıcı adı, uzun arka yüz karşılaştırması
  yerine doğrudan ilgili ifadede düzeltildi. Ordinal kümeleri korundu.

## Güncel kayıtlar

- [`biyokimya-editorial.json`](biyokimya-editorial.json): 29 notun alan bazında
  önce/sonrası, işlem gerekçesi, tüm kapsam kimlikleri ve değişiklik sınırı hash'leri.
- [`biyokimya.patch.json`](biyokimya.patch.json): güncel `after` alanları ve
  `editorialHistory`. Önceki `changes` / `aiNote` metinleri tarihsel denetim kanıtıdır.
- [Biyokimya çalışma kitabı](../../outputs/biyokimya-denetimi-2026-10-08/BKA_TUS_Biyokimya_Bagimsiz_Denetim.xlsx):
  Değişiklikler H/J ve Son Revize G/H alanları güncel pakettir. Etkilenen öneriler
  de aynı alanlarla eşitlendi. Kaynaklar ve eski gerekçeler denetim sütunlarında kalır.

`outputs/kart-duzeltme/` altındaki eski Biyokimya taslak yaması ilk öneri kaydıdır;
güncel kart alanları için yukarıdaki asıl ders yaması ve çalışma kitabı esas alınır.

## Kısa düzeltmelerin dayanakları

Bu kaynaklar kart içine eklenmedi; yalnız ilgili dar düzeltmenin denetim kaydıdır.
Bu tur bütün tıbbi önermelere bağımsız son onay vermez.

- [EF-G'nin bakteriyel translokasyondaki rolü](https://pubmed.ncbi.nlm.nih.gov/27313204/).
- [Sikloheksimidin 60S üzerinde translokasyon blokajı](https://pmc.ncbi.nlm.nih.gov/articles/PMC2831214/).
- [Glukoz 6-fosfat translokazı ve sitozol → ER taşınması](https://medlineplus.gov/genetics/gene/slc37a4/).
- [Apo D ile CETP'nin ayrılması](https://pubmed.ncbi.nlm.nih.gov/6783110/).
- [Biyotinin yapısı](https://pubchem.ncbi.nlm.nih.gov/compound/171548).
- [İnsan LDHA'nın NAD bağımlı reaksiyonu ve bağlanma bölgeleri](https://www.uniprot.org/uniprotkb/P00338/entry).
  Önceki yamanın LDH/Zn düzeltmesi listeye işlendi; insan LDH kaydı bakteriyel
  veya arkeal D-laktat enzimlerinin tümüne genellenmedi.

## Doğrulama

- `npm run quality`: TypeScript, **160 test dosyası / 1.680 test**, iOS yapılandırması
  ve Anki kaynak sicili kontrolü geçti. `git diff --check` geçti.
- Dağıtılan `.tuspack` açıldığında APKG baytlarıyla, manifest hash'i de APKG ile eşleşir.
- 484 not/GUID ve 602 kart/ordinal, gerçek cloze göstericisiyle kontrol edildi.
- Asıl yamanın 483 notu; Excel'in 484 güncel notu ve Son Revize'nin 82 mevcut
  kayıt alanı tam HTML olarak paketle eşleşti: sıfır alan ve medya farkı.
- ZIP CRC ve SQLite bütünlüğü geçti. Uygulama betiği ikinci çalışmada sıfır
  değişiklik bildirdi; daha önce uygulanmış alanları yeniden yazmadı.
- Kart satırları, çalışma geçmişi, koleksiyon metaverisi, medya ve diğer 11 ders,
  bu tur öncesindeki durumuyla aynıdır. Farmakoloji'nin tamamlanan düzenlemesi korundu.
- Önceki Farmakoloji sınır testi, sonraki Biyokimya turunun kayıtlı önceki
  satırlarını geri yerleştirerek kendi tarihsel sınırını doğrular. Biyokimya testi
  bugünkü diğer 11 dersi ayrıca doğrular.
- Excel'de değişen 211 hücre dışında hücre değerleri, stiller, açıklamalar,
  filtreler ve diğer yerel ZIP parçaları korundu. Değişen örnekler görsel kontrol edildi.
- iPhone canlı smoke testi yapılmadı; import, sahiplik ve native akış değişmedi.

Güncel APKG SHA-256:
`4f7eb96154df8eb89f37e102151bc720b307ed6909c3200e5132d1d397172210`.

Tekrar uygulama önce salt okunur doğrulanır:

```bash
python3 scripts/apply-catalog-editorial.py --patch docs/catalog-corrections/biyokimya-editorial.json
```

`--apply` yalnız tam önce/sonra alan eşleşmesi ve o turun diğer ders sınırları
sağlanınca atomik uygular. Daha sonraki ders turları varsa tarihsel yamayı
doğrudan güncel pakete uygulamak sınır kontrolünde durabilir; eski alanlar zorla yazılmaz.
