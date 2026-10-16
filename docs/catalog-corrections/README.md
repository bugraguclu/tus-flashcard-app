# BKA TUS kart düzeltmeleri

Bu dizin, paketle gelen BKA TUS kataloğunun (`assets/catalog/bka-tus-complete.apkg`) ders ders
önerilen kart düzeltmelerini tutar. Dosyalar `scripts/apply-all-catalog-patches.py` ile özgün pakete
(`package.sha256`) uygulanır; ardından `.tuspack` ve `bka-manifest.json` yeniden üretilir.

Yöntem, Farmakoloji için hazırlanan "BKA TUS · Farmakoloji — kart düzeltmeleri (önce / sonra)"
çalışma kitabının birebir aynısıdır: AI Rehberi'nin değişmez kuralları, öncelik sırası, dört
kritiklik düzeyi, kural kodları (YP1–BÇ1), Kısaltma Sözlüğü ve Yazım Birliği tablosu. Farmakoloji
o çalışma kitabında olduğu için burada yer almaz.

## Dosyalar

Her ders kendi dosyasındadır: `<ders>.patch.json` (`kadin-dogum`, `kucuk-stajlar`,
`genel-cerrahi`, `pediatri`, `dahiliye`, `patoloji`, `mikrobiyoloji`, `biyokimya`, `fhe`,
`anatomi`, `deneme-ve-soru`). Dersler katalog sırasının sonundan başlanarak hazırlanır ve
hazırlandıkça eklenir.

## Durum

9 Ekim son takipte **12 dersin tamamı** ön yüz sızıntıları ve soru–açıklama
çelişkileri için tarandı; **141 not / 328 mevcut kart** düzeltildi. APKG,
`.tuspack`, manifest ve her dersin güncel `after` alanları eşleşiyor.
[Tüm dersler takip raporu](all-course-front-followup.md) ve
[alan bazlı kayıt](all-course-front-followup.json) bu turun kapsamını kaydeder.
Aşağıdaki önceki denetim sayıları güncel kalan hata sayısı değildir; bu takip
önceki açık kaynak incelemelerinin tamamına onay vermez.

<!-- status:start -->
| Ders | Dosya | Not | Durum | Açık soru (`Doğrulama gerekli`) |
| --- | --- | ---: | --- | ---: |
| Kadın Doğum | `kadin-dogum.patch.json` | 524 | Tamam | 17 |
| Küçük Stajlar | `kucuk-stajlar.patch.json` | 484 | Tamam | 14 |
| Genel Cerrahi | `genel-cerrahi.patch.json` | 564 | Tamam | 27 |
| Pediatri | `pediatri.patch.json` | 1169 | Tamam | 40 |
| Dahiliye | `dahiliye.patch.json` | 995 | Düzenleme tamam; Kritik/Yüksek kalemlerin bağımsız kontrolü yapılmadı | 20 |
| Patoloji | `patoloji.patch.json` | 609 | Takip düzeltmeleri uygulandı; kaynak kapsam kontrolü bekliyor | Bkz. takip raporu |
| Biyokimya | `biyokimya.patch.json` | 484 | Takip düzeltmeleri uygulandı; kaynak kapsam kontrolü bekliyor | Bkz. takip raporu |
| Mikrobiyoloji | `mikrobiyoloji.patch.json` | 587 | Tamam | — |
| Deneme ve Soru | `deneme-ve-soru.patch.json` | 745 | Tamam | — |
| FHE | `fhe.patch.json` | 510 | Tamam | — |
| Anatomi | `anatomi.patch.json` | 381 | Tamam | — |
<!-- status:end -->

`reviewStage` alanı dosyanın aşamasını söyler:

- `complete`: düzenleme, bağımsız tıbbi kontrol, yazım birliği ve son okuma tamam. `Doğrulama
  gerekli` kalemleri editör kararı bekler; bu kalemlerin kart içeriği değiştirilmedi.
- `content-corrections-applied-source-review-pending`: takipteki somut kart düzeltmeleri pakete
  uygulanmıştır; kaynağı hatalı denetim kararlarının tüm tıbbi iddialara göre yeniden kapanması
  beklenir. Uygulanmış düzeltmeler geri alınmış değildir.
- `redo-in-progress`: ikinci tur kısmen tamamlandığında kullanılan geçici aşama. Bu yayındaki
  tüm derslerin ikinci turu tamamlandı.


## Dosya biçimi (`tusankim.catalog-corrections/v1`)

```jsonc
{
  "schema": "tusankim.catalog-corrections/v1",
  "course": "Kadın Doğum",
  "sourceDeck": "Kadın Doğum BKA",
  "package": { "path": "assets/catalog/bka-tus-complete.apkg", "sha256": "…" }, // düzeltmelerin dayandığı paket
  "noteType": "Cloze-AnKingMaster",
  "fieldNames": { "Text": "Metin", "Extra": "Ek bilgi (arka yüz)" },
  "applied": false,
  "summary": { "reviewedNotes": 524, "changedNotes": 0, "notesBySeverity": {}, "itemsByCategory": {}, "secondReview": {} }, // secondReview: ikinci okumadaki onay/düzelt/geri al sayıları
  "notes": [
    {
      "order": 1,                       // Excel'deki "Sıra": kritikliğe, sonra konuya göre
      "noteId": 1622730134243,          // Anki not kimliği
      "guid": "…",                      // Anki not GUID'i
      "topic": "Obstetri",              // uygulamadaki alt deste
      "severity": "Kritik",             // notun en yüksek kalem düzeyi
      "status": "changed",              // changed | html_only (yalnız görünmez HTML temizliği)
      "changedFields": "Metin",
      "fields": { "Text": { "before": "<ham HTML>", "after": "<ham HTML>" } },
      "changes": [                      // Excel'deki "Değişiklik Kalemleri"
        { "severity": "Kritik", "category": "Tıbbi doğruluk", "text": "\"MCP2\" → \"MCP-1\"", "rationale": "…" }
      ],
      "aiNote": "Ne: …\nNeden: …\nNasıl: [TD1, YP1] …\nKaynak: …",
      "decision": null,                 // editör: "Kabul" | "Ret" | "Düzeltilecek"
      "editorNote": null
    }
  ],
  "checkedUnchanged": [ { "noteId": 0, "topic": "…", "aiNote": "…" } ], // değişmeyen ama şüphesi araştırılan notlar
  "spelling": [ { "yazim": "…", "kural": "…" } ],       // dersin Yazım Birliği tablosu
  "abbreviations": [ { "kisaltma": "…", "acilim": "…" } ] // derste açılan kişisel kısaltmalar
}
```

- `before`, paketteki alanın birebir değeridir. Bir düzeltme yalnız `before` paketteki değerle
  hâlâ aynıysa uygulanmalıdır; değilse not o arada değişmiştir ve yeniden incelenir.
- Cloze numara kümeleri korunur (YP1). Yanlış tıbbi ifadeler kaldırıldığında bunlara bağlı
  bazı cloze parçaları da gerekçesi belirtilerek çıkarılmıştır; kart kimlikleri ve çalışma
  geçmişi korunur. Görseller, renkler ve kodlama harfleri korunmuştur (YP3).
- `Doğrulama gerekli` kategorisindeki kalemlerde içerik değiştirilmedi; şüphe gerekçede yazılıdır
  ve editörün kararını bekler.

## Doğrulama

Her ders dosyası teslimden önce makineyle denetlendi: her notun tam bir kez yer alması, cloze
numara kümesinin aynen kalması, HTML'in dengeli olması, görsel ve ses referanslarının
değişmemesi, `-->` oklarının ve yapıştırma artıklarının kalmaması, kritiklik–kategori uyumu
(AI Rehberi §5), Kritik ve Yüksek kalemlerde gerekçe ve her notta Ne / Neden / Nasıl biçiminde
AI notu. Kritik ve Yüksek düzeyli düzeltmeler ayrıca düzenleyiciden bağımsız ikinci bir okumayla
kaynaklara karşı denetlendi.

Patoloji/Biyokimya takip düzeltmeleri ve kaynak onay sınırı: [9 Ekim 2026 raporu](gemini-followup.md).

Son yayın kontrolündeki 11 odak notu ve iki ilişkili CVLM notu güncel pakette
düzeltildi: [13 not / 21 kart yüzü takip kaydı](publish-front-followup.md).
Alan bazlı önce/sonra, GUID, ordinal ve kaynak kanıtları
[`publish-front-followup.json`](publish-front-followup.json) içindedir. Bu dosya
yeni bir ders yaması değildir; mevcut ders yamalarının güncel `after` alanlarıyla
birlikte son uygulamanın dar kapsamını kaydeder. Açık ders denetimleri ayrıca sürer.

Ardından tüm derslere genişletilen takipte 141 not / 328 kart daha düzeltildi:
[son rapor](all-course-front-followup.md). Farmakoloji çalışma kitabındaki güncel
alanlar ve mevcut takip sekmelerinin ilgili kayıtları eşitlendi; önceki denetim
metinleri tarihsel kanıt olarak korundu. `npm run quality`: 156 dosya / 1.659 test.
