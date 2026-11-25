# Farmakoloji editoryal düzenlemesi — 17 Ekim 2026

Kapsam: 669 not / mevcut 827 kart. Kullanıcının sekiz tercihi özgün kartlar,
güncel paket ve Farmakoloji çalışma kitabı karşılaştırılarak uygulandı.
Özgün içerik referansı `a08dd99` sürümündeki pakettir.

## Uygulanan kurallar

1. Kart yüzlerinde kaynak adı, URL, sayfa numarası ve kaynak amacıyla eklenen
   kurum/yıl atıfları yer almaz. Dayanaklar denetim kaydında tutulur.
2. Özgün kartta bulunmayan arka yüz açıklamaları kaldırılır.
3. Ana metindeki isteğe bağlı yan bilgiler ve açıklama parantezleri kaldırılır.
4. Sonradan eklenen ilaçlar ve liste üyeleri çıkarılır; liste sayısı düzeltilir.
5. Ek kılavuz ve klinik uygulama özetleri kaldırılır.
6. Uzun karşılaştırmalar ve düzeltme gerekçesi karta eklenmez.
7. Gerekli düzeltme doğrudan ilgili ifadede ve kısa tutulur. Açıklama kaldırılırken
   yanlış genelleme oluşmaması için zorunlu koşullar korunur. Çekilmiş/deneysel
   kullanım durumu kısa niteleyiciyle belirtilir; tarih ve uzun gerekçe eklenmez.
8. Özgün ezber kodları korunur. `ViSiBL`, `ARİF - O`, `PEN`, `Sadece Fab` ve
   `İlk geçiş etkisi sebebiyle` gibi mevcut kısa bilgiler yerinde bırakılır.

## Sonuç

- 122 not güncellendi.
- 97 Ek bilgi alanı değişti: 80'i boşaltıldı, 17'si özgün kısa içeriğine indirildi.
- 47 Metin alanı kısaltıldı veya gerekli kısa koşulla düzeltildi.
- 72 notta özgün içerikten gelen kısa Ek bilgi kaldı.
- Not/GUID, kart/ordinal, çalışma planı, tekrar geçmişi, medya ve diğer dersler korundu.

Alan bazında önce/sonra ve değişiklik gerekçesi
[`farmakoloji-editorial.json`](farmakoloji-editorial.json) içindedir.
Farmakoloji'nin asıl yamasının güncel `fields` değerleri de bu sonuçlarla eşittir.
Eski `items` ve `ainote` kayıtları önceki düzeltmelerin tarihsel gerekçeleridir;
son editoryal kayıt bu alanların güncel karşılığını belirtir.

## Doğrulama

- `npm run quality`: TypeScript, 159 test dosyası / 1.675 test ve iOS/kaynak sicili
  kontrolü geçti.
- Dağıtılan `.tuspack` açıldığında APKG baytlarıyla, manifest hash'i de APKG ile eşleşir.
- `lib/catalogPharmacologyEditorial.test.ts`: tüm 669 not / 827 ordinal üzerinde
  kimlik, gösterici çıktısı, kaynak temizliği, özgün kodlamalar ve değişiklik sınırları.
- Kartlar, revlog, graves, koleksiyon metaverisi, not kimlikleri ve diğer 11 ders
  önceki satır hash'leriyle aynıdır.
- Excel'in 667 güncel Sonra hücresi ve Sorulacaklar sayfasındaki 37 Farmakoloji
  hücresi paketle normalize metin olarak eşleşir; asıl yamanın 668 notu tam alan
  eşleşmesiyle doğrulandı.
- Excel'in ilgisiz hücreleri, zengin metinleri ve diğer ZIP parçaları korundu;
  değişen örnekler görüntü olarak kontrol edildi. ZIP CRC ve SQLite bütünlüğü geçti.
- Fiziksel iPhone smoke testi yapılmadı; bu tur import, sahiplik veya native
  çalışma akışını değiştirmez.

Güncel APKG SHA-256:
`187d3abde6967ff56eba3c92199ab36bce4b8cecbb6a3451d4b89e47f3c2917f`.

Tekrar uygulama önce salt okunur doğrulanır:

```bash
python3 scripts/apply-catalog-editorial.py --patch docs/catalog-corrections/farmakoloji-editorial.json
```

`--apply` yalnız tam önce/sonra eşleşmesi olan alanları atomik olarak uygular.
Ardından `.tuspack` ve manifest mevcut üretim betikleriyle yeniden oluşturulur.
