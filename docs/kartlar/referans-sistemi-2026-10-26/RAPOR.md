# TusAnkiM referans sistemi — çıkmış TUS analizi

**26 Ekim 2026 · rea arşivi (54 sınav, 11.604 soru) · BKA TUS kataloğu (7.721 not / 9.575 kart) · Referans.pdf (Tusworld)**

## Kısa sonuç

- **Son 6 TUS'un 1.195 sorusunun 521'inde (%43,6) kartlarımız soruyu çözdürüyor:** 333 Doğrudan + 188 Dolaylı
  (tek adım). 587 soruda (%49,1) konu kartı var ama şıkları ayıran bilgi yok; yalnız 87 soruda (%7,3) ilgili kart yok.
  Sonuçlar 11 ders ajanının kart metnini okuyarak verdiği kararlara dayanıyor.
- **Açığın ana nedeni kart yokluğu değil.** Kartlar konuya değiyor, ama tanıdan sonraki adımı (tedavi, ilk tetkik),
  klinik tablodan tanıya giden yönü ve şıkları ayıran karşılaştırmaları vermiyor. Bu, hedefli kart yazımıyla
  kapanabilecek bir açık. Temel bilimler %48,3, klinik bilimler %38,9. En iyi dersler Farmakoloji, Biyokimya ve
  Mikrobiyoloji (%56); en zayıf dersler Anatomi (%28), Küçük Stajlar (%30) ve Genel Cerrahi (%32).
- **2026/2 (23 Ağustos 2026): 82/200 destek (51 Doğrudan + 31 Dolaylı).** Bu 82 sorunun 76'sında çözdüren bilgi,
  sınavdan 2 gün önceki katalogda da vardı (git a78ae1f). 4 soruda kısmen vardı, 2 soruda bilgi sonradan eklenmiş.
  **"Sınavdan önce kartımızda vardı" diyebileceğimiz rakam 76/200 (%38).** 22 Ekim çalışması 53/200 bulmuştu.
  İki çalışma 52 soruda birlikte destek buluyor. Yalnız bu çalışmanın desteklediği 30 sorunun 23'ü "Dolaylı" (iki
  kartın birleşimi ya da terim köprüsü). Ayrışan 33 soruda hakem 31 kez ders ajanıyla aynı kararı verdi.
- **Referans.pdf (Tusworld):** kapakta 196/200 yazıyor. Kitapçığın kendi içeriğine göre sayı 195/200, sayfa
  numarası verilen soru 193/200. Tusworld konu kitabında sayfa gösteriyor, biz ve Ankitus kartın soruyu
  çözdürmesini ölçüyoruz. Oranlar aynı şeyi ölçmez. Tusworld gibi "konu kartı var mı?" diye ölçersek 2026/2'de
  192/200 (%96) çıkıyor; Tusworld'ün referans bulamadığı 5 sorunun 5'inde de bizde konu kartı var.
- **Masaüstündeki önceki çalışma kullanılmamalı.** 2024/1–2026/1 için "destekli" denen 769 sorunun yalnız 362'si
  doğrulamada destekli çıktı (%47); aynı kanıt kartıyla doğrulanan yalnız 124. "822/1195 (%68,8)" ve "Yıl Yıl"
  sayfasındaki tahminler yanlış. Doğru ölçüm 521/1195 (%43,6).
- **Referans sistemi için öneri:** referans, "sınav + soru no ↔ katalog not GUID'i + rozet + doğrulama kaydı"
  olarak tutulmalı. Kurallar: sınav öncesi dondurulmuş katalog sürümü, hekim/editör onayı, Doğrudan ile Dolaylı'nın
  ayrı raporlanması. Soru metni uygulamaya girmemeli. Başlangıç verisi repoda hazır (bölüm 6).

## 1. Ne yapıldı, dosyalar nerede

**Excel — `TusAnkiM_Referans_Sistemi_2026-10-26.xlsx`** (masaüstündeki "Tus ankim belgeler ve yönetim" klasöründe; soru kökü ve şıkları içerdiği için repoda yok). Repodaki yapısal veri: [`referanslar.json`](referanslar.json). Ankitus'un referans sayfasındaki alanlara denk
bir cetvel; ayrıca sınav öncesi sürüm ve editör onayı sütunları var.

| Sayfa | İçerik |
|---|---|
| Özet | Doğrulanmış set, ders ve sınav bazında sonuç, 2026/2'de dört yöntemin yan yana okunuşu, otomatik eşleşmenin isabeti |
| Sınav x Ders | 54 sınav × 11 ders soru sayısı ve destek oranı (son 6 sınav ölçüm, öncekiler "~" ile tahmin) |
| Referans Şablonu | Yeni sınav dönemleri için boş şablon: açılır listeli rozet, güven, bayrak ve editör onayı |
| 1 Anatomi … 11 Küçük Stajlar | Her ders için arşivin tüm soruları (2026/2 → 2000/1), 35 sütun: soru, cevap, rozet, ölçülen bilgi, kanıt kartı (not/kart ID, deste, ön/arka yüz), eksik adım, zaman ilişkisi, bayrak, editör onayı |
| Tusworld Kontrolü | Referans.pdf'in 200 sorusu: referans türü, kitap/sayfa, önceki Excel ile karşılaştırma, Ankitus ve TusAnkiM rozetleri |
| Önceki Çalışma Bulguları | Masaüstündeki eski Excel + HTML için 11 bulgu, kanıt ve öneriyle |
| Ders Analizleri | 11 ders ajanının raporları |
| Yöntem | Kaynaklar, ölçütler, hakem adımı, sınırlar |

**Nasıl yapıldı.**

1. rea arşivi (54 sınav, 11.604 soru) ile BKA TUS kataloğu (7.721 not) eşlendi; her soru için Türkçe/Latince
   normalize edilmiş aramayla en iyi 6 aday kart çıkarıldı.
2. Her ders için bir alt ajan, son 6 sınavın bütün sorularını (2024/1–2026/2, 1.195 soru) kart metnini okuyarak
   rozetledi: Doğrudan / Dolaylı (tek adım, eksik adım yazılı) / Konu İlişkili / Referans Yok. Ölçüt Ankitus ve
   22 Ekim çalışmasıyla aynı; konu adının ya da cevap kelimesinin kartta geçmesi destek sayılmadı. Çalışma ortasında
   "Dolaylı" ölçütü sıkılaştırıldı ve ajanlar önceki satırlarını buna göre düzeltti (toplam 41 kayıt).
3. 2026/2'de ders ajanı ile 22 Ekim çalışmasının ayrıştığı 33 soru ayrı bir hakem ajanına gitti. Aynı hakem, kanıt
   kartı sınavdan sonra belirgin değişen destekli sorularda sınav öncesi metni (git a78ae1f, 21 Ağustos 2026)
   okuyup bilginin o tarihte kartta olup olmadığına karar verdi.
4. Referans.pdf satır konumlarıyla ayrıştırıldı, kritik sayfalar görüntü olarak kontrol edildi; masaüstündeki eski
   Excel ve HTML bu kaynaklarla satır satır karşılaştırıldı.
5. 2000–2023 arasındaki sorular için yalnız otomatik aday kart ve doğrulanmış setle eğitilen bir modelin tahmini
   olasılığı verildi; bunlar referans değil, editör iş listesidir.

## 2. Sonuçlar — son 6 sınav (2024/1–2026/2)

**Okuma kılavuzu.** "Destek" = Doğrudan + Dolaylı. "Yalnız konu" hiçbir kapsam oranına katılmadı. Rakamlar
güncel katalogladır (master, fbd7d94); 2026/2 dışında kartların sınav tarihindeki içeriği bilinmiyor (bölüm 7).

Öne çıkanlar:

- **Sınavlar arasında belirgin bir eğilim yok:** 2024/2–2026/1 arası %45–46, 2024/1 %37,9, 2026/2 %41,0. Patoloji
  ve Kadın Doğum'da yeni sınavlarda düşüş var (Patoloji 2024'te %65–68, 2025/2–2026/2'de %28–39). Küçük Stajlar ve
  FHE'de yeni sınavlarda artış var.
- **"Yalnız konu" payı her derste büyük.** En yüksek Anatomi (%64), FHE (%58) ve Küçük Stajlar'da (%56). Kartlar
  konuyu biliyor ama sorulan ilişkiyi vermiyor (bölüm 5).
- **2026/2'de dört ölçüm yan yana:** bu çalışma 82/200, sınav öncesi sürüm 76/200, 22 Ekim çalışması 53/200,
  Ankitus beyanı 181/200. İki TusAnkiM çalışması 52 soruda birlikte destek buluyor; yalnız bu çalışmanın
  desteklediği 30 sorunun 23'ü Dolaylı, yalnız 22 Ekim'in desteklediği soru 1 (K002). Fark büyük ölçüde iki kartın
  birleşimiyle ya da eş anlamlı terimle kurulan tek adımdan geliyor (ör. "faktör III = doku faktörü"; "sertralin
  SSRI'dır" + "OKB'de ilk seçenek SSRI"). Yazılı ölçüt bunlara izin veriyor, 22 Ekim çalışması daha katı okumuş. 22 Ekim çalışması ayrıca farklı bir
  katalog sürümüyle yapıldı (582 not farklı). Bu sınırı hekim/editör belirlemeli. Yalnız Doğrudan sayılırsa 2026/2
  51/200 (%25,5) olur.

Hakemin sınav öncesi sürümde "kısmen" ya da "yoktu" dediği 6 soru: K039 (yalnız anne sütü sarılığı risk listesi),
K043 (VZIG'nin 10 günlük süresi), K057 (Legius sendromu), K078 (Bouveret'de duodenal fistül yolu) kısmen; K050
(Roma IV alt tipleri) ve T018 (melanositin bazal tabakada olması) yoktu. Bu sorularda kartlar sınavdan sonra
düzeltildi. Kart düzeltmek doğru bir iş, ama sınav öncesi iddiasına katılmamalı.

**Otomatik eşleşme referans yöntemi olamaz.** Kelime eşleşmesine dayalı etiketin isabeti düşük: "aday yok" etiketli
805 sorunun 321'i aslında destekli, "güçlü aday"ların ise %21'i destekli değil. Doğrulanmış setle eğitilen modelin
ayırt gücü zayıf (AUC 0,69). Masaüstündeki eski Excel'in 995 otomatik satırı da bu yüzden tutmadı.

### Genel (son 6 sınav, 2024/1–2026/2)

|  | Soru | Doğrudan | Dolaylı | Destek | Oran | Yalnız konu | Yok |
|---|---:|---:|---:|---:|---:|---:|---:|
| Toplam | 1195 | 333 | 188 | **521** | **%43,6** | 587 | 87 |

### Ders bazında

| Ders | Soru | Doğrudan | Dolaylı | Destek | Oran | Yalnız konu | Yok |
|---|---:|---:|---:|---:|---:|---:|---:|
| Anatomi | 78 | 9 | 13 | **22** | **%28,2** | 50 | 6 |
| Fizyoloji-Histoloji-Embriyoloji | 90 | 17 | 18 | **35** | **%38,9** | 52 | 3 |
| Biyokimya | 109 | 38 | 23 | **61** | **%56,0** | 40 | 8 |
| Mikrobiyoloji | 108 | 41 | 19 | **60** | **%55,6** | 45 | 3 |
| Patoloji | 107 | 34 | 17 | **51** | **%47,7** | 49 | 7 |
| Farmakoloji | 106 | 37 | 23 | **60** | **%56,6** | 43 | 3 |
| Dahiliye | 143 | 39 | 19 | **58** | **%40,6** | 72 | 13 |
| Pediatri | 148 | 49 | 28 | **77** | **%52,0** | 62 | 9 |
| Genel Cerrahi | 120 | 28 | 10 | **38** | **%31,7** | 66 | 16 |
| Kadın Doğum | 60 | 14 | 7 | **21** | **%35,0** | 37 | 2 |
| Küçük Stajlar | 126 | 27 | 11 | **38** | **%30,2** | 71 | 17 |

### Sınav bazında

| Sınav | Soru | Doğrudan | Dolaylı | Destek | Oran | Yalnız konu | Yok |
|---|---:|---:|---:|---:|---:|---:|---:|
| 2026/2 | 200 | 51 | 31 | **82** | **%41,0** | 110 | 8 |
| 2026/1 | 200 | 61 | 29 | **90** | **%45,0** | 99 | 11 |
| 2025/2 | 198 | 58 | 33 | **91** | **%46,0** | 89 | 18 |
| 2025/1 | 200 | 57 | 34 | **91** | **%45,5** | 91 | 18 |
| 2024/2 | 199 | 59 | 33 | **92** | **%46,2** | 89 | 18 |
| 2024/1 | 198 | 47 | 28 | **75** | **%37,9** | 109 | 14 |

### 2026/2 hakem ve sınav öncesi sürüm

- Hakem kararı verilen soru: 33; hakem 31'inde ders ajanının, 2'sinde 22 Ekim çalışmasının destek kararını onayladı; rozeti değişen 4 (Doğrudan→Dolaylı 2, Dolaylı→Konu 1, Konu→Dolaylı 1)
- Güncel katalogla destekli: 82; sınav öncesi sürümde (a78ae1f) aynı bilgi: 76, kısmen: 4, yoktu: 2. Karar yolları: kanıt kartı sınavdan sonra değişmemiş ya da yalnız yazımı değişmiş 32 soru metin karşılaştırmasıyla, 49 soru hakemce, 1 soru (K007) koordinatör kontrolüyle.

### Otomatik ön eşleşmenin isabeti (doğrulanmış sete göre)

| Otomatik etiket | Doğrulanmış sette | Gerçekten destekli | Oran |
|---|---:|---:|---:|
| Güçlü aday | 52 | 41 | %78,8 |
| Olası aday | 239 | 123 | %51,5 |
| Konu adayı | 99 | 36 | %36,4 |
| Aday yok | 805 | 321 | %39,9 |

Model çapraz doğrulama AUC 0,69; doğrulanmamış 10.409 soru için beklenen destek ≈ 4.746 (%45,6). Bu bir tahmindir, tek tek soru için referans değildir.

## 3. Referans.pdf (Tusworld) — ne iddia ediyor, içeriği ne gösteriyor?

Referans.pdf, Tusworld'ün 23 Ağustos 2026 TUS'u için hazırladığı 83 sayfalık kitapçık (InDesign, 1 Eylül 2026).
Her soru için kısa bir "hatırlama yolu ile soru", cevap ve "REFERANS: <kitap>, SAYFA: <n>" satırı veriyor;
sayfaların çoğunda ilgili kitap sayfasının görüntüsü var.

| Ölçüm | Sonuç |
|---|---|
| Kapaktaki beyan | **196/200** (Temel 98, Klinik 98) |
| Kitapçığın kendi içeriği | **195/200** — 5 soruda "referans bulunamamıştır" yazıyor: T44 (manganez), T88 (remimazolam), K10 (striktür), K16 (NTRK/larotrektinib), K71 (CDC73) |
| Sayfa numarası verilen | **193/200** — T6 ve K50 yalnız "derste anlatılmıştır" diyor |
| İki kaynak gösterilen soru | 5 (T16, K42, K46, K53, K73) |
| Kaynak kitaplar | Tusworld "Efsane" konu kitapları (temel bilimler) ve Ahmet Erkek "Nirvana" konu kitapları (klinik); bir soruda "İmparator" soru kitabı, bir soruda "Son Hafta Kampı" notu |

Kitapçıkta düzeltilmesi gereken hatalar da var: K16'nın CEVAP alanında cevap yerine soru metni tekrar edilmiş;
K71'de "bulunamamıştır" yerine "BULUNANMIŞTIR" yazılmış (kırmızı "yok" kutusunda); T76 "SAYFA: 144, 23" ve T78
"SAYFA: 174, 220, 61" eksik rakam izlenimi veriyor; "Sertalin", "Pulpus paradoksus", "Wemicke", "IlI ve lV" gibi
yazım hataları var. Bu yüzden Tusworld rakamı kapaktan değil içerikten sayılmalı: **195/200, sayfa numaralı 193/200.**

**Yöntem farkı.** Tusworld konu kitabında ilgili sayfayı gösteriyor; bu, "kitapta bu konu anlatılıyor" demektir.
Ankitus ve biz ise "kart doğru şıkkı ayırıyor mu?" sorusunu ölçüyoruz. Binlerce sayfalık bir konu kitabının neredeyse
her soruya bir sayfa göstermesi beklenir; bu yüzden %97,5 ile kart tabanlı oranlar aynı şeyi ölçmez ve yan yana
"başarı" olarak sunulmamalıdır.

**Tusworld gibi ölçersek.** Tusworld'ün ölçüsü "konu kaynakta anlatılıyor mu?". Bizde buna karşılık gelen sayı,
"Referans Yok" dışındaki bütün rozetler (Doğrudan + Dolaylı + Konu İlişkili):

| Sınav | Konu kartı var (Tusworld gibi) | Soruyu çözdüren kart |
|---|---:|---:|
| 2026/2 | 192/200 (%96,0) | 82/200 (%41,0) |
| 2026/1 | 189/200 (%94,5) | 90/200 (%45,0) |
| 2025/2 | 180/198 (%90,9) | 91/198 (%46,0) |
| 2025/1 | 182/200 (%91,0) | 91/200 (%45,5) |
| 2024/2 | 181/199 (%91,0) | 92/199 (%46,2) |
| 2024/1 | 184/198 (%92,9) | 75/198 (%37,9) |
| **Son 6 sınav** | **1.108/1.195 (%92,7)** | **521/1.195 (%43,6)** |

2026/2'de bu ölçüyle Tusworld'e çok yakınız: Tusworld içerik 195/200, sayfa numaralı 193/200, TusAnkiM 192/200.
Tusworld'ün referans bulamadığı 5 sorunun (T44 manganez, T88 remimazolam, K10 Zenker, K16 NTRK, K71 CDC73) 5'inde
de bizde konu kartı var, ama hiçbiri soruyu çözdürmüyor. Bizde kart olmayan 8 soruda ise Tusworld sayfa gösteriyor:
T004 (SA düğümün yeri), T070 (kedi tırmığı lenfadeniti), K005 (platipne), K023 (fototerapi endikasyonları), K042
(toksik sinovit), K044 (TB'de kortikosteroid), K056 (serebellar bulgular), K059 (ayrılık anksiyetesi).

Bu ölçü bizim lehimize cömerttir: "Konu İlişkili" rozeti kartta cevabın olmadığını kesin söyler. Tusworld'ün
gösterdiği kitap sayfasında cevabın olup olmadığı ise kontrol edilmedi; muhtemelen çoğunda var. Dışarıya iki rakam
birlikte verilmeli: konu kapsamı %96, soruyu çözdüren kart %41 (sınav öncesi sürümle %38). Tablo Excel'in Özet
sayfasında 6. bölümde.

**Ankitus ile çakışma.** Tusworld'ün referans bulamadığı 5 sorunun 4'ünde (T88, K10, K16, K71) Ankitus "Doğrudan"
rozeti veriyor; T44'te ikisinde de referans yok. Bu sorular yeni ya da ayrıntılı bilgiler (remimazolam, NTRK
füzyonunda larotrektinib, HPT-JT'de CDC73). Ankitus'un kartlarının sınavdan önce destede bulunduğu dışarıdan
doğrulanamıyor; kart kimliği ya da tarih göstermiyorlar. Bu, kendi referans sistemimizde "sınav öncesi sürüm"
kanıtını neden zorunlu tutmamız gerektiğinin en somut örneği.

## 4. Önceki referans çalışmamızın (masaüstündeki Excel + HTML) kontrolü

Doğru olanlar: 2026/2 TusAnkiM rozetleri 22 Ekim çalışmasıyla 200/200 aynı; Ankitus rozetleri yayımlanan
161/20/19 ile uyumlu; Tusworld sayfa referansları 193 soruda PDF ile birebir; "Rea Çıkmış Sınavlar Kataloğu"
54/54 sınavda arşivle uyumlu; 2026/2 cevap anahtarı rea ile 200/200 aynı; bütün not/kart kimlikleri güncel
katalogda var. Excel'in "195" sayısı içerik açısından doğru (K71'i de yakalamış), yalnız etiketi yanlış.

Düzeltilmesi gerekenler (ayrıntı ve kanıtlar Excel'deki "Önceki Çalışma Bulguları" sayfasında):

1. **Kritik — 2024/1–2026/1'deki 995 satır otomatik ve güvenilmez.** Rozetler kelime eşleşmesiyle üretilmiş;
   gerekçeler 18 hazır kalıptan ibaret (327 + 325 satır iki kalıbı tekrar ediyor). Örnek: septum nasi
   antero-inferior kanama sorusu, yalnız "superior" kelimesi ortak diye karın ön duvarı damarları kartıyla
   "Doğrudan" sayılmış. Sonuç 769/995 (%77) ve Özet'teki **"822/1195 (%68,8)"** rakamı kullanılmamalı.
   Bu çalışmada aynı 995 soru tek tek doğrulandı: "destekli" denen 769 sorunun 362'si gerçekten destekli
   (%47), 407'si değil; aynı kanıt kartıyla doğrulanan 124. Eski dosyanın "yok" dediği 226 sorunun 77'si ise
   aslında destekli. Bu 995 sorudaki doğru oran 439/995 (%44,1).
2. **Kritik — "Yıl Yıl TUS Analizi" sayfası ölçüm değil.** 2026/2 için "~155 soru (%77,5)" yazıyor; aynı
   dosyada ölçülen değer 53/200 (%26,5). Yedi sınava aynı %74,2 verilmiş.
3. **Yüksek — "TUSWORLD BEYANI 195/200" etiketi.** Beyan 196; 195 içerikten çıkan sayı; sayfa numaralı 193.
4. **Yüksek — Sınav öncesi sürüm yok.** 2026/2 değerlendirmeleri güncel katalogla yapıldı; Ekim 2026
   düzeltmeleri 7.721 notun 7.709'unu değiştirdi. "Sınavdan önce kartımızda vardı" demek için 21 Ağustos 2026
   sürümü (git a78ae1f) esas alınmalı.
5. **Yüksek — Dil ve telif.** HTML'de rakip için "Pazarlama Odaklı Rozet", "Pazarlama İddiaları" ifadeleri var;
   Ankitus'un 200 kart metni ve tam sınav soruları kopyalanmış. İç kullanımda kalabilir, dışarıya verilemez.
6. **Orta — "Ankitus çelişkisi 3 soru" aslında 4** (K10 striktür atlanmış; HTML'de 4 blok var, filtre 3 diyor).
7. **Orta — "Son 5 Sınav Doğrulama" "rastgele seçilmiş" değil**; ÖSYM'nin yayımladığı %10. İptal edilen
   2025/2 TTBT22 "Referans Yok" sayılmış (hesap dışı olmalı).
8. **Düşük —** iki kaynak gösterilen 5 soruda ikinci referans aktarılmamış; "4.000 sayfalık" ifadesinin kaynağı yok.

Ayrıca katalog sürümü dalda dala değişiyor: 22 Ekim çalışması `yedek/kartlar-wip-2026-10-25` dalındaki sürümle
(582 not master'dan farklı), bu çalışma master'daki sürümle (fbd7d94), sürüm adayı `release/2026-10-16` ise
master'dan 160 notla ayrılıyor. Referanslar katalog sürümüne bağlı veridir; her kart düzeltmesinden sonra yeniden
doğrulanmalıdır.

## 5. Ders bazında boşluklar ve kart yazım öncelikleri

Ajanların raporlarından derlendi (tam metinler Excel'deki "Ders Analizleri" sayfasında; her öneri soru numarasıyla
bağlı). Ortak tablo şu: **kart çoğu soruda konuya değiyor, ama soruyu çözdüren ayırt edici ilişkiyi vermiyor.**
"Referans yok" yalnız %7; asıl açık "yalnız konu" (%49).

| Ders | Destek | En büyük boşluklar (birden çok soruda tekrar eden) | Güçlü alanlar |
|---|---:|---|---|
| Farmakoloji | %56,6 | Katalogda **hiç olmayan** konular: bisfosfonatlar, ektoparazitikler (permetrin), nazal dekonjestanlar, ilaç geliştirme fazları; BZD farmakokinetiği; sınıflar arası mekanizma/endikasyon karşılaştırmaları | Biyolojikler, "mekanizma → ilaç", CYP etkileşimleri |
| Biyokimya | %56,0 | Preanalitik laboratuvar hataları (EDTA, NaF, tüp renkleri, ışık; 5 soru), fosforilasyonla enzim düzenlenmesi, karaciğer/pankreas/böbrek laboratuvarı | Nükleotid yolları, üre döngüsü, kalıtsal metabolik hastalık → enzim |
| Mikrobiyoloji | %55,6 | Genel mikrobiyoloji 3/13: kan kültürü kuralları (4 soru), eküvyon seçimi, besiyeri sınıflaması, biyogüvenlik düzeyleri, FMT; "özellik → etken" tanımlama ipuçları | Parazitoloji 10/12, mikoloji 9/13, viroloji |
| Pediatri | %52,0 | Çocuk psikiyatrisi/DEHB (6 soru, kart yok), genetik sendromlar (7 sorunun hiçbiri destekli değil), adölesan jinekolojisi, romatoloji %25, pediatrik DKA | Kardiyoloji %88, yenidoğan %80, nefroloji %79 |
| Patoloji | %47,7 | Genel patoloji 1/14 (hücre hasarı, onarım, mediatörler); "ayırt edici histoloji → tanı" kartları (FNH, aktinik keratoz, kedi tırmığı, ARVC…). 2024'te %65–68 iken 2025/2–2026/2'de %28–39 | Testis germ hücreli tümörleri, glomerül hastalıkları, lenfoma translokasyonları |
| Dahiliye | %40,6 | Kardiyolojide akut yönetim (STEMI, sağ ventrikül enfarktüsü, Mİ komplikasyonları), miyelom/MPN prognoz ve hedefe yönelik tedavi, **tanıdan sonraki adım** (tedavi, ilk tetkik) | Romatoloji otoantikorları, endokrin dinamik testler, hepatoloji skorları |
| FHE | %38,9 | Starling kuvvetleri/ödem, böbrek medullası ve GFR, otonom etki tablosu, elektrofizyoloji, epitel/bez ve GİS histolojisi; üriner 0/5 | Göz/retina, deri ve bağ dokusu, gametogenez |
| Kadın Doğum | %35,0 | Kontrasepsiyon (5 soru, hepsi yalnız konu), doğum eylemi komplikasyonları (operatif doğum, TOLAC, rüptür, atoni cerrahisi), HPV tipleri/aşı | Prenatal tarama, hormon profilleri, servikal preinvaziv lezyon |
| Genel Cerrahi | %31,7 | Abdominal kompartman sendromu (kart yok), travmaya metabolik yanıt (5 soru), splenektomi ayrıntıları (6 soru), safra taşı ileusu, SIRS eşikleri, meme küçük konuları (8 soru) | Sınıflama/şema kartları, tiroid cerrahisi, fıtık |
| Küçük Stajlar | %30,2 | **Klinik tablodan tanıya** giden ilişki: kafa travması hematomları, demans/parkinson-plus, MS, psikiyatri tanı ölçütleri, ortopedide isimli tablolar, dermatoloji klinik tanımları, böbrek sintigrafisi | Epidemiyoloji araştırma tipleri, anestezi farmakolojisi, "en sık" bilgileri |
| Anatomi | %28,2 | GİS 0/11 (bursa omentalis, omentumlar, vertebra seviyeleri/düzlemler), ürogenital 0/5, periferik sinir hasar tabloları, perine boşlukları | Geçen yapılar ve sınır listeleri, alt ekstremite, beyin sapı arterleri |

### Dersler arası ortak örüntüler (kart yazım kuralına dönüşebilir)

1. **Tanıdan sonraki adım eksik.** Kart tanıyı veriyor; soru tedaviyi, ilk tetkiki ya da en sık mutasyonu soruyor
   (Dahiliye, Pediatri, Küçük Stajlar). Öneri: tanı kartlarına "ilk tetkik / ilk tedavi / kontrendike olan" satırı.
2. **Klinik tablo → tanı/yapı yönü eksik.** Kartlar "X hastalığında Y bulgusu" yönünde; soru tersini soruyor
   (Anatomi sinir hasarları, Küçük Stajlar, Patoloji histolojisi). Öneri: yüksek getirili konularda ters yön kartı.
3. **Karşılaştırma ve istisna kartları az.** "Hangisi değildir", sınıflar arası fark, eşik değerler (SIRS, BI-RADS,
   abdominal kompartman basıncı). Öneri: şıkları ayıran tablo kartları.
4. **Hiç kartı olmayan konular** (en ucuz kazanım): bisfosfonatlar, ektoparazitikler, nazal dekonjestanlar, ilaç faz
   çalışmaları, DEHB/çocuk psikiyatrisi, abdominal kompartman sendromu, kan kültürü kuralları, biyogüvenlik düzeyleri,
   preanalitik hatalar.

Her önerilen kart özü soru numarasıyla birlikte Excel'de duruyor; yeni kartlar yazılırken o sorular ikinci bir
doğrulamayla "Doğrudan" seviyesine çıkıp çıkmadığına bakılmalı.

### Düzeltilmesi ya da kaynakla denetlenmesi gereken kartlar

| Kart (not ID) | Ders | Durum | Öneri |
|---|---|---|---|
| n1611993722654 | Mikrobiyoloji | B. cereus enterotoksinini eksojen süperantijen sayıyor; 2025/2-T062 anahtarı yalnız S. aureus'u kabul ediyor | Kaynakla denetle |
| n1607527342367 | Pediatri | "BWS → mikrosefali olur" başlığı aşırı büyüme sendromu sorusunda (2025/1-K057) yanlış şıkka itiyor | Başlığı düzelt |
| n1605682895124 | Küçük Stajlar | Boşluk cevabı eski terim "anne ölüm hızı"; anahtar "anne ölüm oranı" | "anne ölüm oranı (eski adıyla hızı)" yap |
| n1605359144441 | Genel Cerrahi | Travmada glukagonu "bifazik" veriyor; anahtar "artar" | "Erken artar" diye netleştir |
| n1605548560026 | Genel Cerrahi | İnguinal kanal ön duvarına internal oblik liflerini yazmıyor | Tamamla |
| n1605635301948 | Küçük Stajlar | "Sinüzitin en sık komplikasyonu preseptal selülit" orbital evre sorusunda yanıltıyor | Evre bilgisini ekle |

Şüpheli anahtar olarak işaretlenen iki soru (ÖSYM anahtarı tartışmalı, kart yazmadan önce kaynakla bakılmalı):
2025/2-K039 (PPHN'de "en az uygun" PGE1) ve 2026/2-K009 (SSc'de "en az olası" GİS bulgusu hiatal herni). Görsele
dayanan üç soru (2024/1-T016, 2026/2-T049, 2024/2-K094) görsel incelenmeden değerlendirildi.

## 6. Uygulamaya eklenecek referans sistemi — önerilen tasarım

**İlke:** Referans = (sınav, test, soru no) ↔ (katalog not GUID'i) bağı + rozet + doğrulama kaydı. Soru metni
uygulamaya girmez.

**Veri modeli**
- Katalog notlarına Anki uyumlu hiyerarşik etiket: `TUS::Ref::2026-2::T001::Dogrudan`. Etiketler dışa/içe
  aktarmada korunur, tarayıcıda `tag:TUS::Ref::2026-2::*` ile aranır, filtreli destede kullanılır; şema
  değişikliği gerektirmez. (Kurulum `lib/bkaCatalog.ts` not kimliğini ve GUID'i koruduğu için bağ kalıcıdır.)
- Ayrıntı için katalogla birlikte paketlenen yan dosya (ör. `assets/catalog/tus-referanslari.json`):
  `{sınav, tarih, test, no, rozet, notGuid, eksikAdım, ölçülenBilgi (kendi cümlemiz), doğrulayan, doğrulamaTarihi,
  katalogSha, sınavÖncesiSürümde: evet/hayır/bilinmiyor}`.
- Çevrimdışı çalışır; ağdan güncelleme eklenirse kapalı başarısız olmalı (AGENTS.md).

**Başlangıç verisi.** Bu çalışmanın soru metni içermeyen çıktısı repoda:
`docs/kartlar/referans-sistemi-2026-10-26/referanslar.json`. 1.195 kayıt: sınav, test, soru no, ders, rozet,
kanıt not kimlikleri ve GUID'leri, kendi cümlemizle ölçülen bilgi, eksik adım, güven, bayrak, hakem notu ve
2026/2 için `sinavOncesiSurumde` (evet / kismen / hayir). Katalog SHA-256'sı da kayıtlı. Editör onayından sonra
uygulamadaki etiket ya da yan dosya bu veriden üretilebilir.

**Arayüz (iPhone)**
- Kart arka yüzünde küçük rozet: "TUS 2026/2 · T1 · Doğrudan". Dokununca form-sheet: sınav, soru no, ölçülen
  bilgi, rozet tanımı, Dolaylı ise eksik adım, doğrulama tarihi ve "sınav öncesi sürümde vardı" bilgisi.
- Tarayıcı: `ref:2026-2`, `ref:any`, `rozet:dogrudan` filtreleri — mevcut görünümde yerinde filtre (AGENTS.md
  etkileşim kuralı; yeni rota açılmaz).
- "Çıkmış soru kartları" özel çalışma/filtreli deste seçeneği.
- Deste genel bakışı / istatistik: destedeki referanslı not sayısı ve sınav bazında doğrulanmış kapsam.
- Ankitus'un sayfasına benzer bir "Referanslar" ekranı: sınav → ders → soru no, rozet, kanıt kartımız (açılabilir),
  eksik adım. Soru kökü yerine kendi kısa "ölçülen bilgi" etiketimiz.

**Güvenilirlik kuralları**
1. Sınavdan önce katalog sürümü dondurulur: git etiketi + SHA-256 + (isteğe bağlı) zaman damgası herkese açık
   yayımlanır. Sınav sonrası referans yalnız o sürümde aynı bilgiyi taşıyan kart için "sınav öncesi" sayılır.
2. Doğrudan ve Dolaylı ayrı raporlanır; "Konu İlişkili" hiçbir kapsam oranına katılmaz.
3. AI ön sınıflama → hekim/editör onayı (Excel'deki "Editör onayı" sütunu) → yayın. Onaysız kayıt yayımlanmaz.
4. Kart düzenlendiğinde o karta bağlı referanslar "yeniden doğrula" durumuna düşer.
5. Dışarıya verilen karşılaştırmalar ölçülebilir ve tarafsız olur; rakip metni kopyalanmaz, bağlantı verilir.

**Hukuki sınır.** rea arşivindeki soru metinleri ÖSYM sorularıdır ve TUSBuddy derlemesinden alınmıştır; uygulamaya,
siteye ya da pazarlamaya konmamalıdır. Uygulamada yalnız referans bilgisi (sınav/soru no), kendi özet cümlemiz ve
ÖSYM'nin yayımladığı açık içeriğe bağlantı kullanılmalıdır.

**AGENTS.md'ye göre uygulama notları:** katalog sahipliği bir veri güvenliği sınırı olduğu için etiket/yan dosya
kurulumuna odaklı testler eklenmeli ve `npm run quality` çalıştırılmalı; ekran parçaları `components/<feature>/`
altına konmalı; referanslar Anki'ye dönük bir özellik olarak sunulmayacaksa uyumluluk matrisine yalnız etiketlerin
dışa aktarım davranışı not edilmeli.

## 7. Sınırlar

- Rozetler AI destekli ön değerlendirmedir: 11 ders ajanı kart metnine dayanarak karar verdi; 2026/2'de ayrışan
  kararlar ayrı bir hakem ajanına gitti. Bağımsız bir TUS uzmanı ya da hekim editör henüz onaylamadı. Excel'deki
  "Editör onayı" sütunu bunun için var; onaysız kayıt uygulamada yayımlanmamalı.
- "Referans yok" mutlak yokluk değildir; ajan aday listesinin dışında hedefli arama yapsa da gözden kaçan kart
  olabilir. Tersine, "Dolaylı" kararlarında güveni "Düşük" olan sınır durumlar var (Excel'de "Güven" sütunu).
- Görselli sorularda görsel incelenmedi. rea cevap anahtarları resmi kitapçıkla tek tek karşılaştırılmadı; iki
  şüpheli anahtar işaretlendi.
- Ölçüm güncel katalogla (master, 7.721 not) yapıldı. Yalnız 2026/2 için sınav öncesi sürüm (a78ae1f) karşılaştırıldı;
  diğer sınavlarda kartın o tarihteki içeriği bilinmiyor (notların hepsi 2020–2021'de oluşturulmuş, Ekim 2026'da
  çoğu düzenlenmiş). Bu yüzden 2024/1–2026/1 sonuçları "bugünkü katalog bu soruları ne kadar karşılıyor" demektir,
  "o sınavdan önce kartımızda vardı" değil.
- 2000–2023 arasındaki 10.409 soru doğrulanmadı; yalnız otomatik aday kart ve tahmini olasılık var (model zayıf,
  AUC 0,69). Bu sütunlar referans iddiası olarak kullanılmamalı.
- Excel soru köklerini ve şıkları içerir (rea arşivi, ÖSYM soruları). İç çalışma dosyasıdır; uygulamaya, siteye ya da
  pazarlamaya konmamalı. Repodaki kopya soru metni içermez.

## 8. Önerilen sıradaki adımlar

1. **Editör onayı.** Önce 2026/2'nin 82 destekli kaydı (özellikle 31 Dolaylı), sonra "Güven: Düşük" satırlar. Excel'de
   her ders sayfasında "Editör onayı" açılır listesi var (Onaylandı / Düzeltilmeli / Reddedildi).
2. **Kart işleri.** Bölüm 5'teki 6 kart düzeltmesi ve hiç kartı olmayan konular için yeni kartlar. Kartlar
   eklendikten sonra ilgili sorular yeniden rozetlenmeli; Excel'deki öneriler soru numarasıyla bağlı.
3. **Sınav öncesi sürüm kuralı.** Bir sonraki TUS'tan önce katalog dondurulmalı: git etiketi + SHA-256 (+ isteğe
   bağlı zaman damgası) yayımlanmalı. Sınav sonrası referanslar yalnız bu sürüme göre "sınav öncesi" sayılmalı.
4. **Uygulamaya ekleme.** Bölüm 6'daki tasarım, onaylı kayıtlarla ayrı bir değişiklik olarak yapılmalı (katalog
   sahipliği testleri ve `npm run quality` ile).
5. **Arşivin geri kalanı (2000–2023, 10.409 soru).** İstenirse aynı ajan yöntemiyle genişletilebilir. Ancak bu
   çalışmanın yaklaşık 9 katı iş; bu çalışmada aylık kullanım limiti iki kez doldu. Önce editör iş listesi olarak
   "güçlü aday" etiketli 711 soru doğrulanabilir.
