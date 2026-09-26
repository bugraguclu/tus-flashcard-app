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

## Bilinen sınır

**Satır aralığı geri alınamıyor.** `line-height` için bir `execCommand` fiili yok; blok stili
doğrudan yazılıyor ve WebKit bunu yığınına almıyor, dolayısıyla Geri Al bir önceki düzenlemeye
atlıyor. Blokları `insertHTML` ile yeniden kurmak WebKit'e kaydettirirdi ama karetı ve bloktaki
bütün satır içi biçimleri düşürürdü; bir adım atlayan geri alma bundan iyi bir takas.
Gerekçe kodda da yazılı (`applyBlockStyle`).

## Eklenen koruma

Köprü betiği bir şablon dizesi içinde üretiliyor. Yorum içindeki tek bir ters tırnak betiği
sessizce bölüyor ve editör çalışma anında bütün biçimlendirmesini kaybediyor — bu geçişte iki
kez oldu. `lib/richTextCommands.test.ts` → "parses as JavaScript with every interpolation
resolved" artık üretilen betiği `new Function` ile ayrıştırıyor ve çözülmemiş `${}` arıyor.

## Çalıştırılan doğrulama

```
npx tsc --noEmit    → temiz
npx vitest run      → 130 dosya, 1359 test, tamamı geçti
npm run verify:ios  → geçti
```

## Doğrulanmayan

Gerçek cihazda uçtan uca tur. Bütün doğrulama deterministik birim testleriyle yapıldı; WebKit'in
`insertText` ve seçim davranışı ancak iPhone'da onaylanabilir.
