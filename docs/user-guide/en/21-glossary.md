---
id: glossary
title: Glossary
summary: The app's terms in English and in the Turkish interface, how they relate to Anki's terms, with short explanations.
order: 21
web_path: /en/help/glossary
app_help: help?article=glossary
app_screens:
  - "Help center — app/help.tsx (new)"
verified_against: master c6108e6 (2026-10-25)
---

# Glossary

This page explains the terms you see in the app, together with the names the Turkish interface
uses. The English names are mostly the same as Anki's terms, so you can also use them to find what
you are looking for in Anki resources.

<a id="basics"></a>
## Basic terms

| English | Turkish | Description |
| --- | --- | --- |
| Note | Not | The piece of information itself; made up of fields. See [Key concepts](02-key-concepts.md#notes-and-cards). |
| Field | Alan | A part of a note, for example **Front** and **Back**. |
| Card | Kart | What you see of a note while studying. One note can produce more than one card. |
| Sibling | Kardeş kart | Cards produced from the same note. |
| Note type | Not türü | Sets a note's fields and which cards are produced. See [Note types](09-note-types.md). |
| Card type, template | Kart türü, şablon | A note type's pattern for producing a card; how the front and back look. |
| Deck | Deste | A group of cards. |
| Subdeck | Alt deste | A deck inside another deck; its name contains `::`. |
| Collection | Koleksiyon | All the decks, notes, cards and history on your device. |
| Tag | Etiket | A free-form label you give to notes; can be nested with `::`. |
| Flag | Bayrak | A colored marker you put on a card (Red, Orange, Green, Blue, Pink, Turquoise, Purple). |
| Mark, Mark note | İşaret, Notu işaretle | Highlights a note; stored as the `marked` tag. |
| Preset | Ayar grubu | A group that gives several decks the same study settings. See [Deck options](06-deck-options.md#presets). |
| Scheduler | Zamanlayıcı | The method that works out when a card comes back: classic or FSRS. |
| Default (deck) | Varsayılan | The deck that comes with the app. It is named "Varsayılan" in the English interface too. |

<a id="card-states"></a>
## Card states

| English | Turkish | Description |
| --- | --- | --- |
| New | Yeni | A card never seen. In the statistics it also appears as **Unseen** (Görülmemiş). |
| Learning, Learn | Öğrenme | A card being learned in short steps. |
| Review | Tekrar (kart) | A learned card that is due. In Turkish the **Again** button is also called "Tekrar"; do not mix the two up. |
| Relearning | Yeniden öğrenme | A card forgotten during review and studied again in short steps. |
| Young / Mature | Genç / Olgun | A review card with an interval shorter than 21 days / of at least 21 days. |
| Suspended | Askıya alınmış, Askıda | A card that is not shown until you turn it back on. |
| Buried | Gömülü | A card set aside for today only. |
| Lapse | Unutma | Tapping **Again** on a review card. |
| Leech | Sürekli Unutulan Kart | A card forgotten many times. See [Deck options](06-deck-options.md#lapses). |

<a id="studying"></a>
## Studying

| English | Turkish | Description |
| --- | --- | --- |
| Study, study screen | Çalış, çalışma ekranı | The screen where you answer cards. See [Studying](05-studying.md). |
| Classic / New study screen | Klasik / Yeni çalışma ekranı | The two layouts of the study screen. |
| Show Answer | Cevabı göster | Reveals the answer side of the card. |
| Again / Hard / Good / Easy | Tekrar / Zor / İyi / Kolay | The answer buttons. See [Key concepts](02-key-concepts.md#answer-buttons). |
| Undo / Redo | Geri al / Yinele | Undoes / reapplies the last answer or action. |
| Bury | Göm | Sets the card aside for today. |
| Suspend / Unsuspend | Askıya al / Askıdan çıkar | Takes the card out of study / brings it back. |
| Tools | Araçlar | The card and note menu on the study screen. |
| Card Info | Kart bilgisi | The card's history and scheduling details. See [Card Browser and search](10-browser-and-search.md#card-info). |
| Timebox | Zaman kutusu | A study block that suggests a break after a set time. |
| Auto Advance | Otomatik ilerleme | Reveals the answer and carries out the chosen action when the time runs out. |
| Learn ahead limit | Önceden öğrenme sınırı | How far ahead learning cards that are almost due are shown early, once no other cards are left. |
| Study Now | Beklemeden çalış | Opens a waiting learning card before its time. |
| Whiteboard | Yazı tahtası | An area for drawing on top of the card. |
| Text to speech | Metin okuma | Reads the card text aloud. |
| Cards for Today | Bugünün kartları | The name shown in the title when you study from all decks. |
| Congratulations! | Tebrikler! | The screen you see when today's cards are done. |
| Start of next day | Sonraki günün başlangıcı | The hour when the study day changes (04:00 by default). |
| Study streak | Çalışma serisi | The number of days in a row you studied. See [Statistics](12-statistics.md). |

<a id="deck-options-terms"></a>
## Deck options

| English | Turkish | Description |
| --- | --- | --- |
| Deck Options | Deste seçenekleri | The screen where you edit a deck's preset. See [Deck options](06-deck-options.md). |
| This deck / Today only | Bu deste / Yalnızca bugün | Changes the review limit for this deck only, permanently / for today only. |
| Maximum reviews/day | Günlük en fazla tekrar | The limit on review cards shown in one day. |
| Limits start from top | Limitler en üst desteden başlasın | Applies the parent decks' limits too when you study a subdeck. |
| Learning steps | Öğrenme adımları | The short gaps at which a new card is shown again while you learn it, for example `1m 10m`. |
| Graduating interval / Easy interval | Mezuniyet aralığı / Kolay aralığı | The first interval in days for a card that finishes learning with **Good** / **Easy**. |
| Relearning steps | Yeniden öğrenme adımları | The short steps for a forgotten card. |
| Minimum interval | En az aralık | The shortest interval in days a forgotten card can get. |
| Leech threshold | Sürekli unutulan kart eşiği | After how many lapses a card is marked. |
| Display Order | Görüntüleme sırası | The order in which cards are gathered and shown. |
| New/review order | Yeni / tekrar sırası | Whether new cards are mixed with reviews, come first or come after. |
| Burying | Gömme | Keeping sibling cards from being shown on the same day. |
| Easy Days | Kolay günler | Lightens the review load on the days you choose (Normal / Reduced / None). |
| Maximum interval | En fazla aralık | The longest interval a card can get. |
| Starting ease, Easy bonus, Hard interval multiplier, Interval modifier | Başlangıç kolaylığı, Kolay bonusu, Zor aralık çarpanı, Aralık düzenleyici | The classic scheduler's multipliers. |
| Desired retention | Hedeflenen hatırlama oranı | The recall probability FSRS aims for, for example 0.90. See [FSRS](07-fsrs.md). |
| Stability, Difficulty, Retrievability | Hafıza gücü, Zorluk, Hatırlanabilirlik | The values FSRS keeps for each card. |
| Optimize parameters | Parametreleri optimize et | Tunes FSRS to your own review history. |

<a id="cards-terms"></a>
## Cards and editing

| English | Turkish | Description |
| --- | --- | --- |
| Add note / Edit Card | Not ekle / Kartı düzenle | The card editor. See [Adding and editing cards](08-adding-and-editing.md). |
| Basic | Temel | A note type with front and back fields that produces one card. |
| Basic (and reversed card) | Temel (ve ters kart) | Produces two cards, one in each direction. |
| Basic (optional reversed card) | Temel (seçimli ters kart) | The reverse card is produced only if the **Add Reverse** field is filled in. |
| Basic (type in the answer) | Temel (yanıtı yazarak) | A card where you type the answer on the keyboard. |
| Cloze | Boşluklu, boşluk doldurma | A note type that produces cards from blanks in the text. |
| Pin (sticky field) | Sabitle | Keeps a field's content when you add a new note. |
| Card Browser | Kartlarım | The screen where you search and edit all your cards. See [Card Browser and search](10-browser-and-search.md). |
| Change deck | Desteyi değiştir | Moves the selected cards to another deck. |
| Change note type | Not türünü değiştir | Converts notes to another note type. |
| Reposition | Yeniden konumlandır | Changes the order of new cards. |
| Set due date | Vade tarihini ayarla | Sets by hand when a card comes due. |
| Grade now | Şimdi derecelendir | Counts a card as answered without opening the study screen. |
| Reset cards | Kartları sıfırla | Puts the selected cards back into the new state. |
| Empty Cards | Boş kartlar | Finds and cleans up cards that their template no longer produces. |
| Note Types | Not türleri | The screen where you manage note types. |

<a id="data-terms"></a>
## Data

| English | Turkish | Description |
| --- | --- | --- |
| Import / Export | İçe aktar / Dışa aktar | Bringing cards in from a file / writing cards to a file. See [Import and export](14-import-export.md). |
| Anki Deck Package (.apkg) | Anki Deste Paketi (.apkg) | One or more decks. Importing one adds it to your collection. |
| Anki Collection Package (.colpkg) | Anki Koleksiyon Paketi (.colpkg) | The whole collection. Importing one replaces your current collection. |
| Import any learning progress | Çalışma ilerlemesini içe aktar | Also brings in the study state and history from the package. |
| Include scheduling information | Çalışma programını dahil et | Adds the study state and history to the exported package. |
| Import Log | İçe aktarma günlüğü | Lists the result of an import. |
| Backup, Back Up Now | Yedek, Şimdi yedekle | A copy of the collection on the device. See [Backups and maintenance](15-backups-and-maintenance.md). |
| Safety backup | Güvenlik yedeği | A backup made automatically before a risky action. |
| Recovery copy | Kurtarma kopyası | A copy that keeps damaged rows as they are and cannot be restored directly. |
| Check Media | Medyayı denetle | Finds unused and missing image/sound files. |
| Check database | Veritabanını kontrol et | Checks the collection without changing it. |
| Repair and optimize | Onar ve optimize et | Makes a backup first, then repairs damaged rows. |
| Reset progress | İlerlemeyi sıfırla | Deletes the whole collection. See [Backups and maintenance](15-backups-and-maintenance.md#reset-progress). |
| Kurtarılan Kartlar ("Recovered Cards") | Kurtarılan Kartlar | The deck where a repair puts cards whose deck was lost. It keeps this name in the English interface too. |

<a id="app-terms"></a>
## Parts of the app

| English | Turkish | Description |
| --- | --- | --- |
| Decks | Desteler | The app's opening screen. See [Decks](04-decks.md). |
| Overview | Genel bakış | A deck's summary screen. |
| Filtered Deck | Filtrelenmiş deste | A deck that temporarily gathers the cards matching a search. See [Filtered decks and Custom Study](11-filtered-decks.md). |
| Custom Study | Özel çalışma | Starts an extra study session from a deck. |
| Stats, Statistics | İstatistik(ler) | See [Statistics](12-statistics.md). |
| Stopwatch | Kronometre | Measures your study time. See [Stopwatch and study calendar](13-stopwatch-and-calendar.md). |
| Study Calendar | Çalışma Takvimi | Your study sessions by day. |
| TUS Kartları (TUS Cards) | TUS Kartları | The ready-made card pack; its deck keeps the Turkish name. See [TUS card pack](17-tus-card-pack.md). |
| Create shortcut | Kısayol oluştur | Adds a deck to Apple Shortcuts. See [Shortcuts and automation](18-shortcuts-and-automation.md). |
| Settings | Ayarlar | See [Settings](16-settings.md). |

<a id="units"></a>
## Time abbreviations

| English | Turkish | Meaning |
| --- | --- | --- |
| `s` | `sn` | second |
| `m` | `dk` | minute |
| `h` | `sa` | hour |
| `d` | `gün` | day |
| `mo` | `ay` | month (about 30 days) |
| `y` | `yıl` | year |

The intervals above the answer buttons use the largest unit that fits, with one decimal place:
90 minutes shows as `1.5h` and 45 days as `1.5mo`. A time with `<` in front of it means the
learning step falls within the learn ahead limit.

## Related topics

- [Key concepts](02-key-concepts.md)
- [Using TusAnkiM with Anki](19-using-with-anki.md)
