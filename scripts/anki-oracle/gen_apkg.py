"""Oracle for .apkg import: one small collection exported by Anki in both package formats.

Anki's default export writes a zstd-compressed schema-18 `collection.anki21b`; "Support older Anki
versions" writes a schema-11 `collection.anki21` instead. Both files come from the same collection,
together with a JSON record of what that collection holds, so an importer can be checked against
Anki's own data in either format. Presets, fields and decks carry values other than Anki's
defaults, so a value read from the wrong place cannot pass as a default.

Usage (from scripts/anki-oracle):
    ./run.sh gen_apkg.py ../../test/fixtures
writes anki-26.05-modern.apkg, anki-26.05-legacy.apkg and anki-26.05-apkg.json there.
"""
import base64
import json
import os
import struct
import sys
import tempfile
import time
import zlib

from anki.buildinfo import buildhash, version
from anki.collection import Collection, DeckIdLimit, ExportAnkiPackageOptions
from anki.scheduler.v3 import CardAnswer

OUT_DIR = sys.argv[1] if len(sys.argv) > 1 else "."
PARENT = "TUS Örnek"
CHILD = f"{PARENT}::Kardiyoloji"
FSRS_PARAMS = [0.2172, 1.1771, 3.2602, 16.1507, 7.0114, 0.57, 2.0966, 0.0069, 1.5261, 0.112, 1.0178,
               1.849, 0.1133, 0.3127, 2.2934, 0.2191, 3.0004, 0.7536, 0.3332, 0.1437, 0.2]


def png(red, green, blue):
    """A valid 1x1 PNG of one colour, built here so the fixture needs no image tooling."""
    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))
    header = struct.pack(">IIBBBBB", 1, 1, 8, 6, 0, 0, 0)
    pixel = zlib.compress(bytes([0, red, green, blue, 255]))
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header) + chunk(b"IDAT", pixel) + chunk(b"IEND", b"")


MEDIA = {"kalp.png": png(204, 34, 51), "şema.png": png(29, 53, 87), "üfürüm.mp3": b"ID3\x04\x00\x00\x00\x00\x00\x00"}


def answer(col, cid, rating):
    card = col.get_card(cid)
    card.start_timer()
    states = col._backend.get_scheduling_states(cid)
    col.sched.answer_card(col.sched.build_answer(card=card, states=states, rating=rating - 1 + CardAnswer.AGAIN))


def add_note(col, notetype, deck_id, fields, tags):
    note = col.new_note(col.models.by_name(notetype))
    for name, value in fields.items():
        note[name] = value
    note.tags = tags
    col.add_note(note, deck_id)
    return note


def add_presets(col, parent, child):
    config = col.decks.add_config("Kardiyoloji ayarları")
    config["new"].update(perDay=15, delays=[2.0, 15.0], ints=[2, 6, 0], initialFactor=2300, order=0, bury=True)
    config["rev"].update(perDay=150, ease4=1.45, hardFactor=1.1, ivlFct=0.95, maxIvl=3650, bury=True)
    config["lapse"].update(delays=[5.0, 30.0], mult=0.2, minInt=2, leechFails=6, leechAction=0)
    config.update(maxTaken=90, timer=1, autoplay=False, replayq=False, stopTimerOnAnswer=True,
                  secondsToShowQuestion=5.5, secondsToShowAnswer=3.3, questionAction=1, answerAction=2,
                  newMix=1, interdayLearningMix=2, newSortOrder=3, reviewOrder=4, newGatherPriority=5,
                  buryInterdayLearning=True, desiredRetention=0.87, sm2Retention=0.85,
                  easyDaysPercentages=[1.0, 1.0, 0.9, 1.0, 1.0, 0.5, 0.0], fsrsParams6=FSRS_PARAMS,
                  ignoreRevlogsBeforeDate="2025-01-15")
    col.decks.update_config(config)
    deck = col.decks.get(child)
    deck["desc"] = "Kalp ve damar <b>notları</b>"
    deck["conf"] = config["id"]
    col.decks.save(deck)
    # Zero and false are left out of a schema-18 preset blob, so they are the values most easily
    # misread as "missing"; the parent deck's preset carries some.
    quiet = col.decks.add_config("Tekrar ayarları")
    quiet["new"]["perDay"] = 0
    quiet["rev"]["perDay"] = 0
    quiet["waitForAudio"] = False
    col.decks.update_config(quiet)
    parent_deck = col.decks.get(parent)
    parent_deck["conf"] = quiet["id"]
    parent_deck["collapsed"] = True
    col.decks.save(parent_deck)


def add_drug_notetype(col):
    models = col.models
    drug = models.new("Farmakoloji (TUS)")
    for name in ("İlaç", "Mekanizma", "Yan etki"):
        models.add_field(drug, models.new_field(name))
    drug["flds"][1]["sticky"] = True
    drug["flds"][2]["rtl"] = True
    drug["sortf"] = 1
    template = models.new_template("İlaç kartı")
    template["qfmt"] = "{{İlaç}}"
    template["afmt"] = "{{FrontSide}}<hr id=answer>{{Mekanizma}}<br>{{Yan etki}}"
    models.add_template(drug, template)
    drug["css"] = ".card { font-family: Inter; color: #1d3557; }"
    models.add(drug)


def build(col):
    col.db.execute("update col set crt = ?", int(time.time()) - 400 * 86_400)
    col.set_config("fsrs", True)
    parent = col.decks.id(PARENT)
    child = col.decks.id(CHILD)
    add_presets(col, parent, child)
    add_drug_notetype(col)
    stored = {name: col.media.write_data(name, data) for name, data in MEDIA.items()}

    pacemaker = add_note(col, "Basic", child, {"Front": "Kalbin doğal pacemaker'ı?",
                                               "Back": f'SA düğümü<img src="{stored["kalp.png"]}">'},
                         ["kardiyoloji", "Önemli"])
    digoxin = add_note(col, "Basic (and reversed card)", child,
                       {"Front": "Digoksin", "Back": "Na⁺/K⁺-ATPaz inhibitörü"}, ["TUS::Farmakoloji"])
    aspirin = add_note(col, "Cloze", child,
                       {"Text": "{{c1::Aspirin}} COX'u {{c2::geri dönüşümsüz}} inhibe eder.",
                        "Back Extra": f"Trombosit ömrü boyunca [sound:{stored['üfürüm.mp3']}]"},
                       ["TUS::Farmakoloji", "önemli"])
    metoprolol = add_note(col, "Farmakoloji (TUS)", child,
                          {"İlaç": "Metoprolol", "Mekanizma": "β1 seçici bloker",
                           "Yan etki": f'Bradikardi<img src="{stored["şema.png"]}">'}, [])
    metformin = add_note(col, "Basic", parent, {"Front": "Tip 2 diyabette ilk basamak?", "Back": "Metformin"}, ["Şeker"])

    answer(col, pacemaker.card_ids()[0], 4)
    forward, reverse = digoxin.card_ids()
    answer(col, forward, 1)
    col.set_user_flag_for_cards(2, [reverse])
    first_cloze, second_cloze = aspirin.card_ids()
    answer(col, first_cloze, 3)
    col.sched.suspend_cards([second_cloze])
    col.sched.set_due_date(metoprolol.card_ids(), "3")
    col.sched.bury_cards(metformin.card_ids())
    return parent


def export(col, deck_id, name, legacy):
    path = os.path.join(OUT_DIR, name)
    options = ExportAnkiPackageOptions(with_scheduling=True, with_deck_configs=True, with_media=True, legacy=legacy)
    count = col.export_anki_package(out_path=path, options=options, limit=DeckIdLimit(deck_id))
    print(f"wrote {path} ({count} notes, {os.path.getsize(path)} bytes)")


def record(col, deck_id):
    """What the exported decks hold, read back through Anki's own collection."""
    cids = list(col.find_cards(f'"deck:{PARENT}"'))
    nids = sorted({col.get_card(cid).nid for cid in cids})
    notes = [col.get_note(nid) for nid in nids]
    deck_names = {deck.id: deck.name for deck in col.decks.all_names_and_ids()}
    in_cards = ",".join(map(str, cids))
    card_rows = col.db.all("select id, nid, did, ord, type, queue, due, ivl, factor, reps, lapses, left, odue, odid, "
                           f"flags, data from cards where id in ({in_cards}) order by id")
    revlog = col.db.all(f"select id, cid, ease, ivl, lastIvl, factor, time, type from revlog where cid in ({in_cards}) order by id")
    decks = [col.decks.get(did) for did in (deck_id, col.decks.id(CHILD))]
    notetypes = {note.mid: col.models.get(note.mid) for note in notes}
    configs = {deck["conf"]: col.decks.get_config(deck["conf"]) for deck in decks}
    guid = {note.id: note.guid for note in notes}
    return {
        "meta": {"anki": version, "buildhash": buildhash, "crt": col.crt, "exportedAtMs": int(time.time() * 1000)},
        "notes": [{"guid": note.guid, "notetype": notetypes[note.mid]["name"], "mod": note.mod,
                   "fields": list(note.fields), "tags": list(note.tags)} for note in notes],
        "cards": [{"id": row[0], "guid": guid[row[1]], "deck": deck_names[row[2]], "ord": row[3], "type": row[4],
                   "queue": row[5], "due": row[6], "ivl": row[7], "factor": row[8], "reps": row[9], "lapses": row[10],
                   "left": row[11], "odue": row[12], "odid": row[13], "flags": row[14], "data": row[15]}
                  for row in card_rows],
        "revlog": [dict(zip(["id", "cid", "ease", "ivl", "lastIvl", "factor", "time", "type"], row)) for row in revlog],
        "decks": [{"name": deck["name"], "desc": deck.get("desc", ""), "collapsed": deck["collapsed"],
                   "config": configs[deck["conf"]]["name"]} for deck in decks],
        "notetypes": [{"name": model["name"], "type": model["type"], "sortf": model["sortf"], "css": model["css"],
                       "fields": [{key: field[key] for key in ("name", "ord", "sticky", "rtl")} for field in model["flds"]],
                       "templates": [{key: t[key] for key in ("name", "ord", "qfmt", "afmt")} for t in model["tmpls"]]}
                      for model in sorted(notetypes.values(), key=lambda model: model["name"])],
        "configs": sorted(configs.values(), key=lambda config: config["name"]),
        "media": {name: base64.b64encode(data).decode() for name, data in MEDIA.items()},
    }


def main():
    work = tempfile.mkdtemp(prefix="anki-oracle-")
    col = Collection(os.path.join(work, "col.anki2"))
    deck_id = build(col)
    export(col, deck_id, "anki-26.05-modern.apkg", legacy=False)
    export(col, deck_id, "anki-26.05-legacy.apkg", legacy=True)
    data = record(col, deck_id)
    col.close()
    path = os.path.join(OUT_DIR, "anki-26.05-apkg.json")
    with open(path, "w") as handle:
        json.dump(data, handle, ensure_ascii=False, indent=1)
    print(f"wrote {path}")


main()
