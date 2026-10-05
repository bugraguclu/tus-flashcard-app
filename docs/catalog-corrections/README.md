# BKA TUS kart düzeltmeleri

Bu dizin, paketle gelen BKA TUS kataloğunun (`assets/catalog/bka-tus-complete.apkg`) ders ders
önerilen kart düzeltmelerini tutar. Düzeltmeler **henüz pakete uygulanmadı**. Editör her notu
inceleyip karar verir; yalnızca kabul edilen notlar pakete uygulanır.

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

<!-- status:start -->
| Ders | Dosya | İncelenen not | Düzeltilen not | Kritik | Yüksek | Orta | Düşük | Doğrulama gerekli kalemi |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Kadın Doğum | `kadin-dogum.patch.json` | 524 | 522 | 17 | 141 | 295 | 69 | 17 |
| Küçük Stajlar | `kucuk-stajlar.patch.json` | 484 | 481 | 16 | 125 | 282 | 58 | 14 |
| Genel Cerrahi | `genel-cerrahi.patch.json` | 564 | 563 | 25 | 169 | 318 | 51 | 27 |
| Pediatri | `pediatri.patch.json` | 1169 | 1167 | 43 | 377 | 650 | 97 | 40 |
| Dahiliye | `dahiliye.patch.json` | 995 | 995 | 30 | 287 | 607 | 71 | 20 |
| Patoloji | `patoloji.patch.json` | 609 | 609 | 5 | 2 | 340 | 262 | 0 |
| Mikrobiyoloji | `mikrobiyoloji.patch.json` | 587 | 587 | 1 | 2 | 150 | 434 | 0 |
| Biyokimya | `biyokimya.patch.json` | 484 | 484 | 4 | 22 | 458 | 0 | 0 |
| Deneme ve Soru | `deneme-ve-soru.patch.json` | 745 | 745 | 11 | 86 | 629 | 19 | 0 |
| FHE | `fhe.patch.json` | 510 | 510 | 2 | 8 | 132 | 368 | 0 |
| Anatomi | `anatomi.patch.json` | 381 | 381 | 2 | 3 | 130 | 246 | 0 |
<!-- status:end -->

`reviewStage` alanı dosyanın hangi aşamada olduğunu söyler: `complete` (düzenleme, bağımsız tıbbi doğrulama, yazım birliği ve son okuma tamam); Kadın Doğum, Küçük Stajlar, Genel Cerrahi, Patoloji, Mikrobiyoloji, Biyokimya, Deneme ve Soru, FHE ve Anatomi tamamlandı; Pediatri'de yazım birliği adımı, Dahiliye'de bağımsız tıbbi doğrulama ve yazım birliği adımları henüz yapılmadı. Tüm ders dosyaları tamamlandı.


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
- Cloze numaraları hiçbir notta eklenmedi, silinmedi veya birleştirilmedi (YP1); kart kimlikleri
  ve çalışma geçmişi korunur. Görseller, renkler ve kodlama harfleri korunmuştur (YP3).
- `Doğrulama gerekli` kategorisindeki kalemlerde içerik değiştirilmedi; şüphe gerekçede yazılıdır
  ve editörün kararını bekler.

## Doğrulama

Her ders dosyası teslimden önce makineyle denetlendi: her notun tam bir kez yer alması, cloze
numara kümesinin aynen kalması, HTML'in dengeli olması, görsel ve ses referanslarının
değişmemesi, `-->` oklarının ve yapıştırma artıklarının kalmaması, kritiklik–kategori uyumu
(AI Rehberi §5), Kritik ve Yüksek kalemlerde gerekçe ve her notta Ne / Neden / Nasıl biçiminde
AI notu. Kritik ve Yüksek düzeyli düzeltmeler ayrıca düzenleyiciden bağımsız ikinci bir okumayla
kaynaklara karşı denetlendi.
