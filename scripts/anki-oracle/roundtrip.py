"""Oracle for repeated package round trips between this app and Anki.

`lib/ankiRoundtrip.oracle.test.ts` drives it: Anki builds a collection that uses what a learner's
collection holds, the app imports and exports it, Anki imports the app's export and exports it
again, and so on. After every pass Anki's view of the package is compared with its view of the
first one, so anything the app loses, changes or adds shows up as a difference.

Usage (from scripts/anki-oracle):
    ./run.sh roundtrip.py source OUT.apkg OUT.colpkg [OUT-legacy.apkg]
        builds the collection and exports it as a package and a collection package, and also as
        a package with "Support older Anki versions" when a third path is given
    ./run.sh roundtrip.py text IN.colpkg OUT_DIR
        writes Anki's four plain-text exports of that collection (notes and cards, with and
        without HTML) to OUT_DIR

The fixtures test/fixtures/anki-26.09-roundtrip{.apkg,.colpkg,-legacy.apkg} and the text exports
beside them are recorded with
    ./run.sh roundtrip.py source F/anki-26.09-roundtrip.apkg F/anki-26.09-roundtrip.colpkg F/anki-26.09-roundtrip-legacy.apkg
    ./run.sh roundtrip.py text F/anki-26.09-roundtrip.colpkg F
where F is ../../test/fixtures.
    ./run.sh roundtrip.py cycle IN OUT.apkg DUMP.json legacy|latest
        imports IN (.apkg or .colpkg) into a fresh collection with progress and presets, writes
        what Anki holds to DUMP.json, and exports the whole collection to OUT.apkg
    ./run.sh roundtrip.py colpkg IN.colpkg OUT.colpkg DUMP.json legacy|latest
        opens IN as a whole collection, dumps it and exports it as a collection package again
"""
import hashlib
import json
import os
import shutil
import struct
import sys
import tempfile
import time
import zlib

from anki.collection import Collection, ExportAnkiPackageOptions
from anki.import_export_pb2 import ImportAnkiPackageOptions, ImportAnkiPackageRequest
from anki.scheduler.v3 import CardAnswer
from anki.utils import field_checksum
import anki.lang

PARENT = "TUS Örnek"
CHILD = f"{PARENT}::Kardiyoloji"
DEEP = f"{PARENT}::Farmakoloji::Otonom"
FSRS_PARAMS = [0.2172, 1.1771, 3.2602, 16.1507, 7.0114, 0.57, 2.0966, 0.0069, 1.5261, 0.112, 1.0178,
               1.849, 0.1133, 0.3127, 2.2934, 0.2191, 3.0004, 0.7536, 0.3332, 0.1437, 0.2]


def png(red, green, blue):
    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))
    header = struct.pack(">IIBBBBB", 1, 1, 8, 6, 0, 0, 0)
    pixel = zlib.compress(bytes([0, red, green, blue, 255]))
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header) + chunk(b"IDAT", pixel) + chunk(b"IEND", b"")


MEDIA = {
    "kalp.png": png(204, 34, 51),
    "şema 2.png": png(29, 53, 87),
    "üfürüm.mp3": b"ID3\x04\x00\x00\x00\x00\x00\x00",
    "_ders.css": b".tus { color: teal; }",
    "ekg.svg": b'<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><rect width="4" height="4"/></svg>',
}


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


def add_presets(col):
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
    quiet = col.decks.add_config("Tekrar ayarları")
    quiet["new"]["perDay"] = 0
    quiet["rev"]["perDay"] = 0
    quiet["waitForAudio"] = False
    col.decks.update_config(quiet)
    return config, quiet


def add_drug_notetype(col, deck_override):
    models = col.models
    drug = models.new("Farmakoloji (TUS)")
    for name in ("İlaç", "Mekanizma", "Yan etki"):
        models.add_field(drug, models.new_field(name))
    drug["flds"][0]["description"] = "Etken madde"
    drug["flds"][0]["font"] = "Inter"
    drug["flds"][0]["size"] = 24
    drug["flds"][1]["sticky"] = True
    drug["flds"][2]["rtl"] = True
    drug["flds"][2]["plainText"] = True
    drug["flds"][2]["collapsed"] = True
    drug["flds"][2]["excludeFromSearch"] = True
    drug["sortf"] = 1
    template = models.new_template("İlaç kartı")
    template["qfmt"] = '<div class="tus">{{İlaç}}</div>'
    template["afmt"] = "{{FrontSide}}<hr id=answer>{{Mekanizma}}<br>{{Yan etki}}"
    template["bqfmt"] = "{{İlaç}} (tarayıcı)"
    template["bafmt"] = "{{Mekanizma}}"
    models.add_template(drug, template)
    reverse = models.new_template("Ters")
    reverse["qfmt"] = "{{#Mekanizma}}{{Mekanizma}}{{/Mekanizma}}"
    reverse["afmt"] = "{{FrontSide}}<hr id=answer>{{İlaç}}"
    reverse["did"] = deck_override
    models.add_template(drug, reverse)
    drug["css"] = '@import url("_ders.css");\n.card { font-family: Inter; color: #1d3557; }'
    models.add(drug)


def build(col):
    col.db.execute("update col set crt = ?", int(time.time()) - 400 * 86_400)
    col.set_config("fsrs", True)
    parent = col.decks.id(PARENT)
    child = col.decks.id(CHILD)
    deep = col.decks.id(DEEP)
    config, quiet = add_presets(col)
    child_deck = col.decks.get(child)
    child_deck["desc"] = "Kalp ve damar <b>notları</b>"
    child_deck["conf"] = config["id"]
    col.decks.save(child_deck)
    parent_deck = col.decks.get(parent)
    parent_deck["conf"] = quiet["id"]
    parent_deck["collapsed"] = True
    parent_deck["browserCollapsed"] = True
    parent_deck["desc"] = "**Markdown** açıklama"
    parent_deck["md"] = True
    col.decks.save(parent_deck)
    deep_deck = col.decks.get(deep)
    deep_deck["conf"] = config["id"]
    col.decks.save(deep_deck)
    add_drug_notetype(col, deep)
    stored = {name: col.media.write_data(name, data) for name, data in MEDIA.items()}

    pacemaker = add_note(col, "Basic", child, {"Front": "Kalbin doğal pacemaker'ı?",
                                               "Back": f'SA düğümü<img src="{stored["kalp.png"]}">'},
                         ["kardiyoloji", "Önemli", "marked"])
    digoxin = add_note(col, "Basic (and reversed card)", child,
                       {"Front": "Digoksin", "Back": "Na⁺/K⁺-ATPaz inhibitörü"}, ["TUS::Farmakoloji"])
    aspirin = add_note(col, "Cloze", child,
                       {"Text": "{{c1::Aspirin}} COX'u {{c2::geri dönüşümsüz::nasıl?}} inhibe eder. {{c3::TXA2}}",
                        "Back Extra": f"Trombosit ömrü boyunca [sound:{stored['üfürüm.mp3']}]"},
                       ["TUS::Farmakoloji", "önemli"])
    metoprolol = add_note(col, "Farmakoloji (TUS)", deep,
                          {"İlaç": "Metoprolol", "Mekanizma": "β1 seçici bloker",
                           "Yan etki": f'Bradikardi<img src="{stored["şema 2.png"]}">'}, [])
    metformin = add_note(col, "Basic", parent, {"Front": "Tip 2 diyabette ilk basamak?", "Back": "Metformin"},
                         ["Şeker"])
    html = add_note(col, "Basic", parent,
                    {"Front": 'a &lt; b &amp;&amp; "c"<br>ikinci satır &nbsp; 🫀',
                     "Back": f'<div style="color: red">x</div><img src="{stored["ekg.svg"]}">\n<ul><li>1</li></ul>'},
                    ["etiket_alt::çizgi", "UPPER"])
    empty_back = add_note(col, "Basic (optional reversed card)", deep, {"Front": "Yalnız ön", "Back": ""}, [])
    lapsed = add_note(col, "Basic", child, {"Front": "Lapse", "Back": "Relearn"}, ["leech"])
    learning = add_note(col, "Basic", child, {"Front": "Öğreniliyor", "Back": "Adım"}, [])
    flagged = add_note(col, "Basic (type in the answer)", deep, {"Front": "Yaz", "Back": "cevap"}, [])

    answer(col, pacemaker.card_ids()[0], 4)
    forward, reverse = digoxin.card_ids()
    answer(col, forward, 1)
    col.set_user_flag_for_cards(2, [reverse])
    first_cloze, second_cloze, third_cloze = aspirin.card_ids()
    answer(col, first_cloze, 3)
    col.sched.suspend_cards([second_cloze])
    col.sched.bury_cards([third_cloze], manual=False)
    col.sched.set_due_date(metoprolol.card_ids(), "3")
    col.sched.bury_cards(metformin.card_ids())
    col.set_user_flag_for_cards(7, html.card_ids())
    col.sched.set_due_date(lapsed.card_ids(), "0")
    answer(col, lapsed.card_ids()[0], 1)
    answer(col, learning.card_ids()[0], 3)
    card = col.get_card(flagged.card_ids()[0])
    card.custom_data = json.dumps({"src": "tus", "n": 3})
    col.update_card(card)
    col.set_user_flag_for_cards(5, flagged.card_ids())
    col.sched.reposition_new_cards(empty_back.card_ids(), starting_from=1, step_size=1, randomize=False,
                                   shift_existing=True)
    extras(col, child, deep, stored)


def extras(col, child, deep, stored):
    """What a learner's collection also holds: deck-level limits, an unused file, a deleted note
    with its history, an Image Occlusion note and a filtered deck with cards in it."""
    deck = col.decks.get(deep)
    deck.update(reviewLimit=40, newLimit=0, desiredRetention=88)
    col.decks.save(deck)
    col.media.write_data("kullanılmayan.txt", b"no note refers to this file")
    gone = add_note(col, "Basic", child, {"Front": "Silinecek", "Back": "x"}, [])
    answer(col, gone.card_ids()[0], 3)
    col.remove_notes([gone.id])
    occlusion = col.models.by_name("Image Occlusion")
    if occlusion:
        note = col.new_note(occlusion)
        note["Image"] = f'<img src="{stored["kalp.png"]}">'
        note["Occlusion"] = ("{{c1::image-occlusion:rect:left=.1:top=.1:width=.3:height=.2:oi=1}}"
                             "{{c2::image-occlusion:ellipse:left=.5:top=.5:rx=.1:ry=.2}}"
                             "{{c2::image-occlusion:text:left=.2:top=.3:text=Sol & sağ:scale=1.5:fs=0.04}}"
                             "{{c3::image-occlusion:polygon:points=1,2 3,4 5,6:oi=1}}")
        note["Header"] = "Kalp"
        col.add_note(note, child)
    filtered = col.decks.new_filtered(f"{PARENT}::Filtre")
    deck = col.decks.get(filtered)
    deck["terms"] = [["deck:\"TUS Örnek::Kardiyoloji\" is:new", 3, 1]]
    deck["resched"] = False
    deck["previewAgainSecs"] = 30
    col.decks.save(deck)
    col.sched.rebuild_filtered_deck(filtered)


def build_source(out_apkg, out_colpkg, out_legacy=None):
    work = tempfile.mkdtemp(prefix="anki-oracle-")
    col = Collection(os.path.join(work, "col.anki2"))
    build(col)
    export_all(col, out_apkg, legacy=False)
    if out_legacy:
        export_all(col, out_legacy, legacy=True)
    col.export_collection_package(out_colpkg, include_media=True, legacy=False)
    col.close()
    shutil.rmtree(work, ignore_errors=True)


def export_all(col, path, legacy):
    options = ExportAnkiPackageOptions(with_scheduling=True, with_deck_configs=True, with_media=True, legacy=legacy)
    col.export_anki_package(out_path=path, options=options, limit=None)


def without(value, *keys):
    return {key: item for key, item in value.items() if key not in keys}


def dump(col):
    """Everything a learner's package carries, as Anki holds it after the import.

    Ids that Anki assigns afresh on import (decks and presets) are replaced by names; ids it keeps
    (notes, cards, reviews, note types) are kept. `mod` and `usn` of the collection objects say
    when they were last synced or touched, which an import itself changes, so they are left out.
    """
    deck_names = {deck["id"]: deck["name"] for deck in col.decks.all()}
    config_names = {config["id"]: config["name"] for config in col.decks.all_config()}
    used_notetypes = {row[0] for row in col.db.all("select distinct mid from notes")}
    used_decks = {row[0] for row in col.db.all("select distinct did from cards")}
    used_decks |= {row[0] for row in col.db.all("select distinct odid from cards where odid != 0")}
    kept_decks = set()
    for did in used_decks:
        parts = deck_names[did].split("::")
        kept_decks |= {"::".join(parts[:index + 1]) for index in range(len(parts))}

    def deck(entry):
        entry = without(entry, "id", "mod", "usn", "lrnToday", "revToday", "newToday", "timeToday")
        if "conf" in entry:
            entry["conf"] = config_names.get(entry["conf"], entry["conf"])
        return entry

    def notetype(entry):
        entry = without(entry, "mod", "usn")
        entry["tmpls"] = [dict(template, did=deck_names.get(template.get("did"), template.get("did")))
                          for template in entry["tmpls"]]
        return entry

    used_configs = {deck_entry["conf"] for deck_entry in col.decks.all() if deck_entry["name"] in kept_decks
                    and not deck_entry["dyn"]}
    media_dir = col.media.dir()
    return {
        "notetypes": sorted((notetype(m) for m in col.models.all() if m["id"] in used_notetypes),
                            key=lambda m: m["id"]),
        "decks": sorted((deck(d) for d in col.decks.all() if d["name"] in kept_decks), key=lambda d: d["name"]),
        "presets": sorted((without(c, "id", "mod", "usn") for c in col.decks.all_config()
                           if c["id"] in used_configs), key=lambda c: c["name"]),
        "notes": [list(row) for row in col.db.all(
            "select id, guid, mid, mod, tags, flds, sfld, csum, flags, data from notes order by id")],
        "cards": [[*row[:2], deck_names[row[2]], *row[3:14], deck_names.get(row[14], row[14]), *row[15:]] for row in col.db.all(
            "select id, nid, did, ord, mod, type, queue, due, ivl, factor, reps, lapses, left, odue, odid, flags,"
            " data from cards order by id")],
        "revlog": [list(row) for row in col.db.all(
            "select id, cid, ease, ivl, lastIvl, factor, time, type from revlog order by id")],
        "tags": sorted(col.tags.all()),
        # Notes whose first-field checksum is not the one Anki computes (its duplicate check reads it).
        "wrongChecksums": [nid for nid, flds, csum in col.db.all("select id, flds, csum from notes")
                           if csum != field_checksum(flds.split("\x1f")[0])],
        "media": {name: hashlib.sha1(open(os.path.join(media_dir, name), "rb").read()).hexdigest()
                  for name in sorted(os.listdir(media_dir)) if os.path.isfile(os.path.join(media_dir, name))},
    }


def write_json(path, data):
    with open(path, "w") as handle:
        json.dump(data, handle, ensure_ascii=False, indent=1, sort_keys=True)


def cycle(source, out_pkg, dump_path, legacy):
    work = tempfile.mkdtemp(prefix="anki-oracle-")
    col = Collection(os.path.join(work, "col.anki2"))
    try:
        col.import_anki_package(ImportAnkiPackageRequest(
            package_path=os.path.abspath(source),
            options=ImportAnkiPackageOptions(with_scheduling=True, with_deck_configs=True),
        ))
        write_json(dump_path, dump(col))
        export_all(col, out_pkg, legacy)
    finally:
        col.close()
        shutil.rmtree(work, ignore_errors=True)


def colpkg_cycle(source, out_pkg, dump_path, legacy):
    """Replaces a collection with IN, as Anki's File > Import of a .colpkg does."""
    work = tempfile.mkdtemp(prefix="anki-oracle-")
    path = os.path.join(work, "col.anki2")
    try:
        col = Collection(path)
        backend = col._backend
        col.close(downgrade=False)
        backend.import_collection_package(col_path=path, backup_path=os.path.abspath(source),
                                          media_folder=os.path.join(work, "col.media"),
                                          media_db=os.path.join(work, "col.media.db2"))
        col = Collection(path)
        try:
            data = dump(col)
            # A collection package also carries the collection's creation day and settings.
            data["crt"] = col.crt
            data["config"] = without(col.all_config(), "curModel", "localOffset", "creationOffset")
            write_json(dump_path, data)
            col.export_collection_package(out_pkg, include_media=True, legacy=legacy)
        finally:
            col.close()
    finally:
        shutil.rmtree(work, ignore_errors=True)


def text_exports(source, out_dir):
    work = tempfile.mkdtemp(prefix="anki-oracle-")
    path = os.path.join(work, "col.anki2")
    try:
        col = Collection(path)
        backend = col._backend
        col.close(downgrade=False)
        backend.import_collection_package(col_path=path, backup_path=os.path.abspath(source),
                                          media_folder=os.path.join(work, "col.media"),
                                          media_db=os.path.join(work, "col.media.db2"))
        col = Collection(path)
        try:
            for html, suffix in ((True, "html"), (False, "text")):
                col.export_note_csv(out_path=os.path.join(out_dir, f"anki-26.09-notes-{suffix}.txt"), limit=None,
                                    with_html=html, with_tags=True, with_deck=True, with_notetype=True, with_guid=True)
                col.export_card_csv(out_path=os.path.join(out_dir, f"anki-26.09-cards-{suffix}.txt"),
                                    limit=None, with_html=html)
        finally:
            col.close()
    finally:
        shutil.rmtree(work, ignore_errors=True)


def main():
    # field_checksum strips HTML through the backend that set_lang installs.
    anki.lang.set_lang("en_US")
    command, *args = sys.argv[1:]
    if command == "source":
        build_source(*args)
    elif command == "cycle":
        cycle(args[0], args[1], args[2], args[3] == "legacy")
    elif command == "text":
        text_exports(*args)
    elif command == "colpkg":
        colpkg_cycle(args[0], args[1], args[2], args[3] == "legacy")
    else:
        sys.exit(f"unknown command {command}")


main()
