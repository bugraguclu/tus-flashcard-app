# Not editörü araç çubuğu — Microsoft Word eşdeğerlik geçişi

**Tarih:** 7 Eylül 2026
**Dal:** `ui-revize`
**Kapsam:** `lib/editorToolbar.ts`, `lib/editorFormatState.ts`, `lib/richTextCommands.ts`,
`components/RichTextEditor.tsx`, `app/editor.tsx`.

## Bulunan asıl kusur

`lib/editorToolbar.ts` içinde Word denkliği için yazılmış ve testleri geçen **dokuz yardımcı
hiçbir yerden çağrılmıyordu**: `EDITOR_FONT_FAMILIES`, `EDITOR_LINE_SPACINGS`, `EDITOR_ALIGNMENTS`,
`stepFontSize`, `isFontSizeAtLimit`, `fontFamilyStyleValue`, `lineHeightStyleValue`,
`nextCaseMode`, `changeTextCase`.

Kod vardı, testleri yeşildi, ama `EDITOR_TOOLBAR_LAYOUT` bu araçları hiç listelemediği için
kullanıcıya ulaşan tek bir düğme yoktu. Testlerin geçmesi özelliğin var olduğu anlamına gelmiyordu.

## Bağlananlar

| Word özelliği | Araç anahtarı | Sekme | Kısayol |
| --- | --- | --- | --- |
| Font (yazı tipi kutusu) | `fontFamily` | Giriş | — |
| Yazı tipini büyüt / küçült | `growFont`, `shrinkFont` | Giriş | Cmd/Ctrl+Shift+`>` ve `<` |
| Büyük/küçük harf değiştir | `changeCase` | Giriş | **Shift+F3** |
| Satır aralığı | `lineSpacing` | Stiller | — |

- **Yazı tipi listesi kendi yüzüyle çiziliyor**, Word'ün font listesi gibi.
- **Büyüt/küçült merdivenin uçlarında soluyor** (`isFontSizeAtLimit`), sessizce yutulmuyor.
- **Büyük/küçük harf Türkçe'nin iki `i`'sine saygı duyuyor**: dönüşüm WebKit'te değil,
  `changeTextCase` içinde `toLocaleUpperCase(locale)` ile yapılıyor. `İSTANBUL` → `istanbul`.
- **Değiştirilen metin seçili kalıyor**, böylece Shift+F3 Word'deki gibi
  Cümle → küçük → BÜYÜK diye dönmeye devam ediyor.

## Bu geçişte kapatılan iki gerçek hata

1. **Uzun seçimde sessiz veri kaybı.** Köprü, her karet okumasıyla seçili metni de gönderiyor;
   bu okuma 20 000 karakterle sınırlı. Kırpılmış metni geri yazmak seçimin geri kalanını yok
   ederdi. Artık kırpılmış okuma "seçim yok" sayılıyor ve düğme soluyor.
   Test: `lib/editorFormatState.test.ts` → "greys out change case when the reading was capped".
2. **Büyük/küçük harf geri alınamıyordu.** İlk uygulama metin düğümünü elle yazıyordu; WebKit
   geri alma yığınına yalnızca kendi düzenleme komutlarını kaydeder. Artık `insertText` üzerinden
   gidiyor ve seçim sonradan geri genişletiliyor.

## Kapatılan üçüncü hata: satır aralığı geri alınamıyordu

Bu, geçen turda "bilinen sınır" diye bırakılan maddeydi; artık bir sınır değil.

`line-height` için bir `execCommand` fiili yok, dolayısıyla WebKit'in geri alma yığını bu
düzenlemeyi hiç görmüyordu. Sonuç yalnızca "satır aralığı geri alınmıyor" değildi: Geri Al
düğmesi WebKit'e gidiyor, WebKit aralığın üstünden atlayıp bir önceki düzenlemeyi geri alıyor,
köprünün sayaçları ise artık belgeyle örtüşmeyen bir geçmişi anlatıyordu. Bir basış iki şeyi
birden bozuyordu.

**Yapılan.** Köprünün geçmişi iki sayaçtan tek bir sıralı yığına çevrildi
(`historySteps` / `redoSteps`). Yığındaki her adım iki türden biri:

| Tür | Tersini kim biliyor | Adımın taşıdığı |
| --- | --- | --- |
| `native` | WebKit — kendi düzenleme komutu | yalnızca sıradaki yeri |
| `blockStyle` | Köprünün kendisi | değişen bloklar ve iki yandaki değerler |

Geri Al yığının tepesini alır: adım `native` ise WebKit'e sorar, `blockStyle` ise bildirimleri
kendisi geri yazar. Sırayı korumak işin bütünü — karışık bir düzenleme dizisi artık yapıldığı
sırayla geri geliyor. Karet ve bloktaki bütün satır içi biçimler yerinde kalıyor; blokları
`insertHTML` ile yeniden kurma seçeneği ikisini de düşürürdü, o yüzden seçilmedi.

Aynı geçişte Word'ün davranışına üç incelik daha eklendi:

- **Zaten yazılı olan değeri seçmek düzenleme sayılmıyor.** 1,5'i iki kez seçmek geri alınacak
  tek şey bırakır.
- **Geri Al, geri aldığı şeyi gösteriyor.** Karet o paragrafın dışına çıkmışsa içine
  toplanıyor; zaten içindeyse dokunulmuyor — seçimi yeniden atamak WebKit'in bekleyen yazım
  biçimini siler.
- **Silinmiş paragraf adımı tıkamıyor.** Sonraki bir geri alma, adımın kaydettiği elemanı
  değiştirmiş olabilir; böyle bir adım tüketilip bir alttaki düzenlemeye geçiliyor, "hiçbir şey
  yapmayan Geri Al" yerine.

Yığın `MAX_HISTORY_STEPS` (200) ile sınırlı: bir `blockStyle` adımı eleman tuttuğu için sınırsız
bir yığın, alan açık kaldığı sürece kopmuş düğümleri canlı tutardı.

Testler: `lib/richTextCommands.test.ts` → "paragraph styles and undo" (dokuz test). Dokuzu da
mutasyonla doğrulandı — ilgili koruma tek tek bozulduğunda her biri kırmızıya düşüyor.

## Eklenen koruma

Köprü betiği bir şablon dizesi içinde üretiliyor. Yorum içindeki tek bir ters tırnak betiği
sessizce bölüyor ve editör çalışma anında bütün biçimlendirmesini kaybediyor — bu geçişte iki
kez oldu. `lib/richTextCommands.test.ts` → "parses as JavaScript with every interpolation
resolved" artık üretilen betiği `new Function` ile ayrıştırıyor ve çözülmemiş `${}` arıyor.

## Çalıştırılan doğrulama

```
npx tsc --noEmit    → temiz
npx vitest run      → 131 dosya, 1396 test, tamamı geçti
npm run verify:ios  → geçti
```

## Doğrulanmayan

Gerçek cihazda uçtan uca tur. Bütün doğrulama deterministik birim testleriyle yapıldı; WebKit'in
`insertText` ve seçim davranışı ancak iPhone'da onaylanabilir.

Geçmiş yığını için bunun somut karşılığı şu: köprü, bir yazım dizisini `TYPING_RUN_COALESCE_MS`
(900 ms) ile tek adıma topluyor, WebKit ise kendi kuralıyla topluyor. İkisi ayrışırsa bir Geri Al
basışı belgeyi köprünün saydığından farklı kadar geri alır. Bu, bu turda getirilen bir şey değil —
sayaçlı sürümde de vardı — ama `blockStyle` adımları artık aynı yığında sıralandığı için cihazda
bakılacak yer burası: uzun bir yazım dizisinin ardından verilen satır aralığı, tek basışta ve
yalnız başına geri gelmeli.
