"""Oracle for the FSRS-adjacent collection operations of the fifth audit pass.

Records, from Anki's own backend, what these operations write:
  - Set Due Date with the collection FSRS switch on and off (item 3), and the first answer of a
    new card that Set Due Date left at interval 0;
  - Change Deck recomputing memory states in the target deck only (item 5);
  - Check Database repairing `lrt` from the review log (item 6);
  - a future "ignore reviews before" date saved through the deck options (item 7);
  - the preset keys an .apkg export without scheduling keeps (item 8).

Only outputs are recorded. Usage (from scripts/anki-oracle):
    ./run.sh gen_fsrs_ops.py ../../test/fixtures/anki-26.09-fsrs-ops.json
"""
import json
import os
import sqlite3
import sys
import tempfile
import time
import zipfile

os.environ["TZ"] = "Europe/Istanbul"
time.tzset()

from anki.buildinfo import version as anki_version
from anki.collection import Collection, DeckIdLimit, ExportAnkiPackageOptions
from anki.decks import UpdateDeckConfigs
from anki.scheduler.v3 import CardAnswer

OUT = sys.argv[1] if len(sys.argv) > 1 else "fsrs-ops.json"
DAY = 86_400
CUSTOM = [0.3, 1.1, 2.9, 9.1, 6.2, 0.7, 2.8, 0.01, 1.7, 0.15, 0.9,
          1.5, 0.07, 0.3, 1.6, 0.5, 1.9, 0.5, 0.1, 0.07, 0.2]
COLUMNS = ["did", "type", "queue", "due", "ivl", "factor", "reps", "lapses", "left", "odue", "odid", "data"]


def card_row(col, cid):
    row = dict(zip(COLUMNS, col.db.first(f"select {', '.join(COLUMNS)} from cards where id=?", cid)))
    row["data"] = json.loads(row["data"]) if row["data"] else {}
    return row


def revlog_rows(col, cid):
    keys = ["id", "ease", "ivl", "lastIvl", "factor", "time", "type"]
    return [dict(zip(keys, r)) for r in col.db.all(
        "select id, ease, ivl, lastIvl, factor, time, type from revlog where cid=? order by id", cid)]


class Ids:
    def __init__(self):
        self.used = set()

    def take(self, value):
        while value in self.used:
            value += 1
        self.used.add(value)
        return value


def new_card(col, did, label):
    note = col.new_note(col.models.by_name("Basic"))
    note["Front"] = label
    col.add_note(note, did)
    return note.card_ids()[0]


def put(col, cid, **state):
    data = state.pop("data", {})
    sets = ", ".join(f"{key}=?" for key in state)
    col.db.execute(f"update cards set {sets}, data=? where id=?", *state.values(),
                   json.dumps(data) if data else "", cid)


def add_revlog(col, ids, cid, entries):
    for e in entries:
        rid = ids.take(e["id"])
        col.db.execute("insert into revlog (id, cid, usn, ease, ivl, lastIvl, factor, time, type) values (?,?,?,?,?,?,?,?,?)",
                       rid, cid, -1, e["ease"], e["ivl"], e.get("lastIvl", 0), e.get("factor", 2500), 1000, e["type"])


def timing(col):
    t = col._backend.sched_timing_today()
    return {"today": t.days_elapsed, "nextDayAt": t.next_day_at, "nowMs": int(time.time() * 1000)}


def set_due_cases(col, ids, did):
    """Every card shape the audit names, under both switch positions and four inputs."""
    cases = []
    for fsrs in (True, False):
        col.set_config("fsrs", fsrs)
        for text in ("3", "3!", "0", "1!"):
            t = timing(col)
            now, today, nda = t["nowMs"] // 1000, t["today"], t["nextDayAt"]
            shapes = {
                "new": dict(type=0, queue=0, due=17, ivl=0, factor=0, data={}),
                "newWithMemory": dict(type=0, queue=0, due=18, ivl=0, factor=0,
                                      data={"s": 2.3, "d": 5.0, "lrt": nda - 2 * DAY - 600}),
                "learningWithMemory": dict(type=1, queue=1, due=now + 300, ivl=0, factor=2500, left=1,
                                           data={"s": 0.8, "d": 6.1, "lrt": nda - 1 * DAY - 600}),
                "learningNoMemory": dict(type=1, queue=1, due=now + 300, ivl=0, factor=0, left=2, data={}),
                "reviewNoMemoryLrt": dict(type=2, queue=2, due=today - 3, ivl=7, factor=2500,
                                          data={"lrt": nda - 10 * DAY - 600}),
                "reviewMemoryNoLrt": dict(type=2, queue=2, due=today + 2, ivl=7, factor=2500,
                                          data={"s": 9.0, "d": 4.2}),
                "reviewMemoryLrt": dict(type=2, queue=2, due=today, ivl=12, factor=2300,
                                        data={"s": 15.0, "d": 6.6, "lrt": nda - 12 * DAY - 600}),
                "reviewPlain": dict(type=2, queue=2, due=today + 4, ivl=30, factor=2500, data={}),
                "reviewZeroInterval": dict(type=2, queue=2, due=today, ivl=0, factor=2500,
                                           data={"s": 1.0, "d": 5.0, "lrt": nda - 3 * DAY}),
                "relearningMemoryLrt": dict(type=3, queue=1, due=now + 600, ivl=4, factor=2100, left=1,
                                            data={"s": 3.0, "d": 7.7, "lrt": nda - 1 * DAY - 600}),
            }
            for name, state in shapes.items():
                cid = new_card(col, did, f"sd-{fsrs}-{text}-{name}")
                put(col, cid, **{"left": 0, **state})
                before = card_row(col, cid)
                col.sched.set_due_date([cid], text)
                after = card_row(col, cid)
                cases.append({"fsrs": fsrs, "input": text, "shape": name, "timing": t, "before": before,
                              "after": after, "revlog": revlog_rows(col, cid)})
    return cases


def first_answer_after_set_due(col, did):
    """A new card left at interval 0 by Set Due Date, then answered Good: initial parameters."""
    col.set_config("fsrs", True)
    out = []
    for rating in (1, 3):
        cid = new_card(col, did, f"follow-{rating}")
        col.sched.set_due_date([cid], "3")
        before = card_row(col, cid)
        card = col.get_card(cid)
        card.start_timer()
        states = col._backend.get_scheduling_states(cid)
        answer = col.sched.build_answer(card=card, states=states, rating=rating - 1 + CardAnswer.AGAIN)
        col.sched.answer_card(answer)
        out.append({"rating": rating, "timing": timing(col), "before": before, "after": card_row(col, cid),
                    "revlog": revlog_rows(col, cid)})
    return out


def configure(col, did, name, params, retention):
    conf = col.decks.add_config_returning_id(name)
    deck = col.decks.get(did)
    deck["conf"] = conf
    col.decks.save(deck)
    c = col.decks.get_config(conf)
    c["fsrsParams6"] = params
    c["desiredRetention"] = retention
    col.decks.update_config(c)
    return conf


def history(nda, now_ms, days):
    """A learning step and two reviews, the last `days` ago."""
    last = (nda - days * DAY - 3600) * 1000
    return [
        {"id": last - 20 * DAY * 1000, "ease": 3, "ivl": -600, "type": 0, "factor": 0},
        {"id": last - 19 * DAY * 1000, "ease": 3, "ivl": 3, "type": 0, "factor": 2500},
        {"id": last - 15 * DAY * 1000, "ease": 3, "ivl": 9, "type": 1, "factor": 2500, "lastIvl": 3},
        {"id": last, "ease": 2, "ivl": 12, "type": 1, "factor": 2350, "lastIvl": 9},
    ]


def change_deck_cases(col, ids):
    out = []
    for fsrs in (True, False):
        col.set_config("fsrs", fsrs)
        tag = "on" if fsrs else "off"
        source = col.decks.id(f"CD-{tag}-Source")
        target = col.decks.id(f"CD-{tag}-Target")
        child = col.decks.id(f"CD-{tag}-Target::Child")
        configure(col, target, f"CD-{tag}-Target preset", CUSTOM, 0.95)
        t = timing(col)
        nda = t["nextDayAt"]
        cards = {}

        def review(deck, label, data, days):
            cid = new_card(col, deck, label)
            put(col, cid, type=2, queue=2, due=t["today"] + 2, ivl=12, factor=2350, reps=4, left=0, data=data)
            add_revlog(col, ids, cid, history(nda, t["nowMs"], days))
            return cid

        cards["movedWithMemory"] = review(source, f"{tag}-moved", {"s": 20.0, "d": 4.0, "dr": 0.9, "decay": 0.154,
                                                                     "lrt": nda - 5 * DAY - 3600}, 5)
        cards["movedNoMemory"] = review(source, f"{tag}-moved-plain", {}, 8)
        new_moved = new_card(col, source, f"{tag}-moved-new")
        cards["movedNew"] = new_moved
        cards["targetNoMemory"] = review(target, f"{tag}-target-plain", {}, 6)
        cards["targetWithMemory"] = review(target, f"{tag}-target-memory", {"s": 33.0, "d": 3.0, "dr": 0.9,
                                                                             "decay": 0.154, "lrt": nda - 7 * DAY}, 7)
        cards["childNoMemory"] = review(child, f"{tag}-child-plain", {}, 4)
        before = {name: card_row(col, cid) for name, cid in cards.items()}
        revlog = {name: revlog_rows(col, cid) for name, cid in cards.items()}
        moved = col.set_deck([cards["movedWithMemory"], cards["movedNoMemory"], new_moved], target)
        after = {name: card_row(col, cid) for name, cid in cards.items()}
        out.append({"fsrs": fsrs, "timing": t, "params": CUSTOM, "desiredRetention": 0.95, "moved": moved.count,
                    "cards": {name: {"before": before[name], "after": after[name], "revlog": revlog[name]}
                              for name in cards}})
    return out


def lrt_repair_cases(col, ids, did):
    col.set_config("fsrs", True)
    t = timing(col)
    nda, now_ms = t["nextDayAt"], t["nowMs"]
    day = DAY * 1000
    base = (nda - 30 * DAY) * 1000
    review = {"ease": 3, "ivl": 5, "type": 1, "factor": 2500}
    learn = {"ease": 3, "ivl": -600, "type": 0, "factor": 0}
    shapes = {
        # Stored value too early: set to the last answer.
        "wrongLrt": ({"lrt": nda - 40 * DAY}, [dict(learn, id=base), dict(review, id=base + 3 * day)]),
        "missingLrt": ({}, [dict(learn, id=base), dict(review, id=base + 4 * day)]),
        "correctLrt": ({"lrt": (base + 5 * day) // 1000}, [dict(learn, id=base), dict(review, id=base + 5 * day)]),
        # A reset after the answer (manual, factor 0), then Set Due Date (manual with a factor).
        "resetThenSetDue": ({"lrt": (base + 2 * day) // 1000},
                            [dict(review, id=base + 2 * day), {"id": base + 6 * day, "ease": 0, "ivl": 0, "type": 4, "factor": 0},
                             {"id": base + 6 * day + 5, "ease": 0, "ivl": 3, "type": 4, "factor": 2500}]),
        "onlyManual": ({"lrt": nda - 3 * DAY}, [{"id": base + 7 * day, "ease": 0, "ivl": 4, "type": 4, "factor": 2500}]),
        # Cramming (filtered, factor 0) and rescheduled rows do not count; the review before does.
        "crammingAfter": ({}, [dict(review, id=base + 8 * day), {"id": base + 9 * day, "ease": 3, "ivl": 0, "type": 3, "factor": 0}]),
        "rescheduledAfter": ({}, [dict(review, id=base + 10 * day), {"id": base + 11 * day, "ease": 0, "ivl": 9, "type": 5, "factor": 2500}]),
        # A filtered review that rescheduled (factor kept) does count.
        "filteredRescheduling": ({}, [dict(review, id=base + 12 * day), {"id": base + 13 * day, "ease": 3, "ivl": 6, "type": 3, "factor": 2500}]),
        "noRevlog": ({"lrt": nda - 9 * DAY}, []),
        "newWithRevlog": ({"lrt": nda - 9 * DAY}, [dict(review, id=base + 14 * day), {"id": base + 15 * day, "ease": 0, "ivl": 0, "type": 4, "factor": 0}]),
        "lrtInFuture": ({"lrt": nda + 30 * DAY}, [dict(review, id=base + 16 * day)]),
    }
    cards = {}
    for name, (data, entries) in shapes.items():
        cid = new_card(col, did, f"lrt-{name}")
        if name == "newWithRevlog":
            put(col, cid, type=0, queue=0, due=40, ivl=0, factor=0, data=data)
        else:
            put(col, cid, type=2, queue=2, due=t["today"] + 3, ivl=5, factor=2500, reps=3, data=data)
        add_revlog(col, ids, cid, entries)
        cards[name] = cid
    before = {name: card_row(col, cid) for name, cid in cards.items()}
    message, ok = col.fix_integrity()
    after = {name: card_row(col, cid) for name, cid in cards.items()}
    message2, _ = col.fix_integrity()
    return {"timing": t, "message": message, "ok": ok, "secondMessage": message2,
            "cards": {name: {"before": before[name], "after": after[name], "revlog": revlog_rows(col, cards[name])}
                      for name in cards}}


def future_cutoff_case(col):
    col.set_config("fsrs", True)
    did = col.decks.id("Cutoff")
    conf_id = configure(col, did, "Cutoff preset", [], 0.9)
    results = {}
    for value in ("2099-01-01", "2020-05-06", ""):
        current = col.decks.get_deck_configs_for_update(did)
        configs = []
        for entry in current.all_config:
            config = entry.config
            if config.id == conf_id:
                config.config.ignore_revlogs_before_date = value
            configs.append(config)
        col.decks.update_deck_configs(UpdateDeckConfigs(
            target_deck_id=did, configs=configs, removed_config_ids=[], mode=0,
            card_state_customizer=current.card_state_customizer, limits=current.current_deck.limits,
            new_cards_ignore_review_limit=current.new_cards_ignore_review_limit, fsrs=True,
            apply_all_parent_limits=current.apply_all_parent_limits, fsrs_reschedule=False,
            fsrs_health_check=False))
        results[value] = col.decks.get_config(conf_id).get("ignoreRevlogsBeforeDate")
    return {"timing": timing(col), "saved": results}


def export_presets(col, work):
    did = col.decks.id("Export")
    conf_id = configure(col, did, "Export preset", CUSTOM, 0.87)
    c = col.decks.get_config(conf_id)
    c["sm2Retention"] = 0.82
    c["ignoreRevlogsBeforeDate"] = "2025-06-01"
    c["fsrsParams5"] = CUSTOM[:19]
    c["fsrsWeights"] = CUSTOM[:17]
    col.decks.update_config(c)
    new_card(col, did, "export")
    out = {}
    for scheduling in (True, False):
        path = os.path.join(work, f"export-{scheduling}.apkg")
        col.export_anki_package(out_path=path, options=ExportAnkiPackageOptions(
            with_scheduling=scheduling, with_deck_configs=True, with_media=False, legacy=True),
            limit=DeckIdLimit(deck_id=did))
        with zipfile.ZipFile(path) as archive:
            inner = os.path.join(work, f"inner-{scheduling}.anki21")
            with open(inner, "wb") as handle:
                handle.write(archive.read("collection.anki21"))
        db = sqlite3.connect(inner)
        dconf = json.loads(db.execute("select dconf from col").fetchone()[0])
        db.close()
        preset = next(value for value in dconf.values() if value["name"] == "Export preset")
        out["withScheduling" if scheduling else "withoutScheduling"] = {
            key: preset.get(key, "<absent>") for key in
            ("fsrsWeights", "fsrsParams5", "fsrsParams6", "desiredRetention", "sm2Retention", "ignoreRevlogsBeforeDate")}
    return out


def main():
    work = tempfile.mkdtemp(prefix="anki-oracle-")
    col = Collection(os.path.join(work, "col.anki2"))
    ids = Ids()
    did = col.decks.id("Default")
    result = {
        "meta": {"anki": anki_version, "timezone": "Europe/Istanbul", "rolloverHour": col.get_config("rollover", 4)},
        "setDueDate": set_due_cases(col, ids, did),
        "firstAnswerAfterSetDue": first_answer_after_set_due(col, did),
        "changeDeck": change_deck_cases(col, ids),
        "lrtRepair": lrt_repair_cases(col, ids, did),
        "futureCutoff": future_cutoff_case(col),
        "exportPresets": export_presets(col, work),
    }
    col.close()
    with open(OUT, "w") as handle:
        json.dump(result, handle, separators=(",", ":"))
    print(f"wrote {OUT}")


main()
