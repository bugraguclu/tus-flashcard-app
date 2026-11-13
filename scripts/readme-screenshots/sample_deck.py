"""The sample collection shown in the README screenshots, built with Anki's own library.

Two parent decks (Temel Bilimler, Klinik Bilimler) with ten subdecks, 74 "Soru-Cevap" notes and
four weeks of review history, so the deck list, the study screen, Statistics and the card browser
show realistic numbers. History is written as Anki stores it: revlog rows plus each card's state.
The pharmacology card "Digoksin toksisitesi…" is overdue and the only kind of card due in
Farmakoloji (reviews, no new cards), so studying that deck opens on it.

Usage (Anki.app installed, oracle host built with ../anki-oracle/build-host.sh):
    ../anki-oracle/run.sh sample_deck.py <out.apkg>
"""
import os
import random
import sys
import tempfile
import time

from anki.collection import Collection, ExportAnkiPackageOptions

OUT = sys.argv[1] if len(sys.argv) > 1 else "tus-ornek.apkg"
DAY = 86_400
HISTORY_DAYS = 27

DIGOXIN_Q = "<b>Digoksin</b> toksisitesini kolaylaştıran elektrolit bozuklukları nelerdir?"

DECKS = {
    "Temel Bilimler::Farmakoloji": ("farmakoloji", [
        (DIGOXIN_Q, "<ul><li><b>Hipokalemi</b> (en önemlisi)</li><li>Hipomagnezemi</li><li>Hiperkalsemi</li></ul>",
         "Antidot: digoksine özgü antikor (<i>Fab</i>) fragmanları"),
        ("Benzodiazepin zehirlenmesinin antidotu?", "<b>Flumazenil</b>", ""),
        ("Heparinin antidotu?", "<b>Protamin sülfat</b>", ""),
        ("Demir zehirlenmesinin antidotu?", "<b>Deferoksamin</b>", ""),
        ("Parasetamol zehirlenmesinin antidotu?", "<b>N-asetilsistein</b>", ""),
        ("ACE inhibitörlerinin bradikinine bağlı yan etkileri?", "Kuru öksürük ve anjiyoödem", ""),
        ("Aminoglikozitlerin başlıca yan etkileri?", "Nefrotoksisite, ototoksisite, nöromüsküler blokaj", ""),
        ("Etambutolün önemli yan etkisi?", "Optik nörit (kırmızı-yeşil renk ayrımında bozulma)", ""),
        ("Florokinolonların kas-iskelet yan etkisi?", "Tendinit ve tendon rüptürü (özellikle Aşil)", ""),
        ("Kloramfenikolün yenidoğanda yol açtığı tablo?", "<b>Gri bebek sendromu</b>", ""),
        ("Varfarinin antidotu?", "<b>K vitamini</b>", "Acil durumda protrombin kompleks konsantresi veya taze donmuş plazma"),
        ("Organofosfat zehirlenmesinde kullanılan ilaçlar?", "Atropin ve pralidoksim", ""),
        ("Metotreksat toksisitesinde kurtarma tedavisi?", "Folinik asit (lökovorin)", ""),
        ("Lityumun önemli yan etkileri?", "Tremor, hipotiroidi, nefrojenik diyabetes insipidus", "Terapötik aralığı dardır"),
    ]),
    "Temel Bilimler::Anatomi": ("anatomi", [
        ("Kanatlı skapulaya (scapula alata) yol açan sinir hasarı?", "N. thoracicus longus", "M. serratus anterior felci"),
        ("Düşük el hangi sinirin hasarında görülür?", "N. radialis", ""),
        ("Pençe el en sık hangi sinirin hasarında görülür?", "N. ulnaris", ""),
        ("Düşük ayak hangi sinirin hasarında görülür?", "N. fibularis (peroneus) communis", ""),
        ("Karpal tünelden geçen sinir?", "N. medianus", ""),
        ("Kalbin en arkada yer alan boşluğu?", "Sol atriyum", ""),
        ("Dilin ön 2/3'ünün tat duyusunu taşıyan sinir?", "Chorda tympani (n. facialis)", ""),
        ("Diyaframı innerve eden sinir?", "N. phrenicus (C3–C5)", ""),
    ]),
    "Temel Bilimler::Biyokimya": ("biyokimya", [
        ("Glikolizin hız kısıtlayıcı enzimi?", "Fosfofruktokinaz-1", ""),
        ("Glukoneogenezin hız kısıtlayıcı enzimi?", "Fruktoz-1,6-bisfosfataz", ""),
        ("Kolesterol sentezinin hız kısıtlayıcı enzimi?", "HMG-KoA redüktaz", ""),
        ("Üre döngüsünün hız kısıtlayıcı enzimi?", "Karbamoil fosfat sentetaz I", ""),
        ("Fenilketonüride eksik olan enzim?", "Fenilalanin hidroksilaz", ""),
        ("Pürin yıkımının son ürünü?", "Ürik asit", ""),
        ("Kollajen sentezinde hidroksilasyon için gereken vitamin?", "C vitamini", ""),
        ("Wernicke ensefalopatisine yol açan vitamin eksikliği?", "Tiamin (B1)", ""),
    ]),
    "Temel Bilimler::Fizyoloji": ("fizyoloji", [
        ("Kalbin doğal pacemaker'ı?", "Sinoatriyal (SA) düğüm", ""),
        ("ADH'nin etki ettiği nefron bölümü?", "Toplayıcı kanal (akuaporin-2)", ""),
        ("Aldosteronun toplayıcı kanaldaki etkisi?", "Na⁺ geri emilimi, K⁺ ve H⁺ atılımı", ""),
        ("Surfaktanı salgılayan hücre?", "Tip II pnömosit", ""),
        ("Oksijen-hemoglobin eğrisini sağa kaydıran durumlar?", "Artmış CO₂, asidoz, ateş ve 2,3-BPG", ""),
        ("Gastrin salgılayan hücreler?", "Antrumdaki G hücreleri", ""),
        ("İnsülin salgılayan hücreler?", "Langerhans adacıklarındaki beta hücreleri", ""),
        ("Frank-Starling yasası neyi açıklar?", "Diyastol sonu hacim arttıkça atım hacminin artmasını", ""),
    ]),
    "Temel Bilimler::Mikrobiyoloji": ("mikrobiyoloji", [
        ("Kızamığa özgü enantem?", "Koplik lekeleri", ""),
        ("Sifilizin etkeni?", "<i>Treponema pallidum</i>", ""),
        ("Psödomembranöz kolitin etkeni?", "<i>Clostridioides difficile</i>", ""),
        ("Tüberkülozda kullanılan aside dirençli boyama?", "Ehrlich-Ziehl-Neelsen", ""),
        ("Gazlı gangrenin en sık etkeni?", "<i>Clostridium perfringens</i>", ""),
        ("Lyme hastalığının vektörü?", "<i>Ixodes</i> kenesi", "Etken: <i>Borrelia burgdorferi</i>"),
        ("Akut romatizmal ateşe yol açan etken?", "A grubu beta-hemolitik streptokok", ""),
        ("Tifonun etkeni?", "<i>Salmonella</i> Typhi", ""),
    ]),
    "Temel Bilimler::Patoloji": ("patoloji", [
        ("Koagülasyon nekrozunun tipik örneği?", "Miyokard enfarktüsü", ""),
        ("Likefaksiyon nekrozu en sık hangi organda görülür?", "Beyin", ""),
        ("Kazeifikasyon nekrozu tipik olarak hangi hastalıkta görülür?", "Tüberküloz", ""),
        ("Reed-Sternberg hücresi hangi hastalığa özgüdür?", "Hodgkin lenfoma", ""),
        ("Psammom cisimcikleri görülen tümörler?", "Papiller tiroid karsinomu, seröz over tümörleri, menenjiyom", ""),
        ("Barrett özofagusta görülen metaplazi?", "Yassı epitelden intestinal tip kolumnar epitele", ""),
        ("Amiloidin Kongo kırmızısı ile polarize ışıktaki görünümü?", "Elma yeşili çift kırılma", ""),
        ("Mallory cisimcikleri en sık hangi durumda görülür?", "Alkolik hepatit", ""),
    ]),
    "Klinik Bilimler::Dahiliye": ("dahiliye", [
        ("Addison hastalığında tipik elektrolit bozuklukları?", "Hiponatremi ve hiperkalemi", ""),
        ("Cushing sendromunun en sık nedeni?", "Eksojen glukokortikoid kullanımı", ""),
        ("Hipertiroidinin en sık nedeni?", "Graves hastalığı", ""),
        ("Diyabetik ketoasidozda ilk tedavi basamağı?", "İzotonik sıvı (%0,9 NaCl)", "Ardından insülin infüzyonu ve potasyum takibi"),
        ("Akut pankreatitin en sık iki nedeni?", "Safra taşları ve alkol", ""),
        ("Demir eksikliği anemisinde serum ferritini?", "Düşük", ""),
    ]),
    "Klinik Bilimler::Pediatri": ("pediatri", [
        ("Kawasaki hastalığının en önemli komplikasyonu?", "Koroner arter anevrizması", ""),
        ("Down sendromunda en sık görülen kalp defekti?", "Atriyoventriküler septal defekt", ""),
        ("Kızamıkçıkta tipik lenfadenopati?", "Postauriküler ve oksipital", ""),
        ("Krupun (laringotrakeobronşit) en sık etkeni?", "Parainfluenza virüsü", ""),
        ("Yenidoğanda ilk 24 saatte başlayan sarılık?", "Her zaman patolojiktir", ""),
    ]),
    "Klinik Bilimler::Genel Cerrahi": ("cerrahi", [
        ("Charcot triadı?", "Ateş, sarılık, sağ üst kadran ağrısı", "Akut kolanjit"),
        ("Murphy bulgusu hangi tanıyı düşündürür?", "Akut kolesistit", ""),
        ("En sık görülen kasık fıtığı?", "İndirekt inguinal herni", ""),
        ("McBurney noktasının yeri?", "SIAS ile göbeği birleştiren çizginin dış 1/3'ü", ""),
        ("Boğulmuş fıtıkta yaklaşım?", "Acil cerrahi onarım", ""),
    ]),
    "Klinik Bilimler::Kadın Doğum": ("kadin-dogum", [
        ("Preeklampside nöbet profilaksisinde kullanılan ilaç?", "Magnezyum sülfat", ""),
        ("Ektopik gebeliğin en sık yerleşim yeri?", "Tubanın ampuller bölümü", ""),
        ("Postpartum kanamanın en sık nedeni?", "Uterus atonisi", ""),
        ("Plasenta previanın tipik bulgusu?", "Ağrısız vajinal kanama", ""),
    ]),
}

FRONT = "<div class=soru>{{Soru}}</div>"
BACK = ("{{FrontSide}}<hr id=answer><div class=cevap>{{Cevap}}</div>"
        "{{#Ek Bilgi}}<div class=ek>{{Ek Bilgi}}</div>{{/Ek Bilgi}}")
CSS = """.card { font-family: -apple-system, system-ui, sans-serif; font-size: 22px; line-height: 1.45; text-align: center; }
.soru { font-size: 24px; }
.cevap ul { display: inline-block; text-align: left; margin: 0; }
.ek { margin-top: 18px; font-size: 18px; opacity: 0.7; }
"""


def notetype(col):
    models = col.models
    m = models.new("Soru-Cevap")
    for name in ("Soru", "Cevap", "Ek Bilgi"):
        models.add_field(m, models.new_field(name))
    t = models.new_template("Kart 1")
    t["qfmt"], t["afmt"] = FRONT, BACK
    models.add_template(m, t)
    m["css"] = CSS
    models.add(m)
    return models.by_name("Soru-Cevap")


def at(day_offset, rng, now, latest=None):
    """A timestamp on the study day `day_offset` days before today, during waking hours."""
    midnight = time.mktime(time.localtime(now)[:3] + (0, 0, 0, 0, 0, -1))
    start = midnight - day_offset * DAY + 9 * 3600
    end = midnight - day_offset * DAY + 22 * 3600
    if latest is not None:
        end = min(end, latest)
    return start + rng.random() * max(60, end - start)


def main():
    rng = random.Random(20261108)
    now = int(time.time())
    work = tempfile.mkdtemp()
    col = Collection(os.path.join(work, "col.anki2"))
    col.db.execute("update col set crt = ?", now - 120 * DAY)
    col.close()
    col = Collection(os.path.join(work, "col.anki2"))
    today = col.sched.today
    model = notetype(col)

    revlog = []
    position = 0
    for deck_name, (tag, notes) in DECKS.items():
        did = col.decks.id(deck_name)
        pharmacology = tag == "farmakoloji"
        for q, a, extra in notes:
            note = col.new_note(model)
            note["Soru"], note["Cevap"], note["Ek Bilgi"] = q, a, extra
            note.tags = [tag]
            col.add_note(note, did)
            card = note.cards()[0]
            position += 1

            # Pharmacology is fully studied; elsewhere about a third of the cards are still new.
            if not pharmacology and rng.random() < 0.34:
                continue
            first = rng.randint(1, HISTORY_DAYS) if q != DIGOXIN_Q else HISTORY_DAYS
            t = at(first, rng, now)
            revlog.append((int(t * 1000), card.id, 3, -600, -60, 0, rng.randint(4000, 12000), 0))
            revlog.append((int(t * 1000) + 600_000, card.id, 3, 1, -600, 2500, rng.randint(3000, 9000), 0))
            ivl, factor, reps, lapses, day = 1, 2500, 2, 0, today - first + 1
            while True:
                if q == DIGOXIN_Q and day >= today - 2:
                    day = today - 2  # overdue by two days, left for the screenshot
                    break
                if day > today:
                    break
                if day == today and not pharmacology and rng.random() < 0.5:
                    break  # still due today
                if day == today and pharmacology and rng.random() < 0.6:
                    break
                roll = rng.random()
                ease = 1 if roll < 0.08 else 2 if roll < 0.15 else 4 if roll < 0.23 else 3
                ts = int(at(today - day, rng, now, latest=now - 1800) * 1000)
                if ease == 1:
                    revlog.append((ts, card.id, 1, -600, ivl, factor, rng.randint(6000, 15000), 1))
                    revlog.append((ts + 600_000, card.id, 3, 1, -600, factor - 200, rng.randint(3000, 8000), 2))
                    factor, ivl, lapses = max(1300, factor - 200), 1, lapses + 1
                else:
                    new_ivl = max(ivl + 1, round(ivl * {2: 1.2, 3: factor / 1000, 4: factor / 1000 * 1.3}[ease]))
                    new_ivl = max(new_ivl, round(new_ivl * (0.95 + rng.random() * 0.1)))
                    revlog.append((ts, card.id, ease, new_ivl, ivl, factor, rng.randint(2500, 9000), 1))
                    if ease == 2:
                        factor = max(1300, factor - 150)
                    elif ease == 4:
                        factor += 150
                    ivl = new_ivl
                reps += 1
                day += ivl
            col.db.execute(
                "update cards set type = 2, queue = 2, due = ?, ivl = ?, factor = ?, reps = ?, lapses = ?,"
                " left = 0, mod = ?, usn = -1 where id = ?",
                day, ivl, factor, reps + lapses, lapses, now, card.id)

    # Two Klinik Bilimler cards met for the first time today and still in learning.
    for deck_name in ("Klinik Bilimler::Dahiliye", "Klinik Bilimler::Pediatri"):
        did = col.decks.id(deck_name)
        cid = col.db.scalar("select id from cards where did = ? and type = 0 order by due limit 1", did)
        if cid:
            ts = int(at(0, rng, now, latest=now - 1200) * 1000)
            revlog.append((ts, cid, 3, -600, -60, 0, rng.randint(4000, 9000), 0))
            col.db.execute("update cards set type = 1, queue = 1, due = ?, left = 1001, reps = 1, mod = ? where id = ?",
                           now - 120, now, cid)

    seen = set()
    for row in sorted(revlog):
        rid = row[0]
        while rid in seen:
            rid += 1
        seen.add(rid)
        col.db.execute("insert into revlog (id, cid, usn, ease, ivl, lastIvl, factor, time, type)"
                       " values (?, ?, -1, ?, ?, ?, ?, ?, ?)", rid, *row[1:])

    options = ExportAnkiPackageOptions(with_scheduling=True, with_deck_configs=True, with_media=True, legacy=False)
    count = col.export_anki_package(out_path=os.path.abspath(OUT), options=options, limit=None)
    print(f"{count} notes, {len(revlog)} reviews, today={today} -> {OUT}")
    col.close()


main()
