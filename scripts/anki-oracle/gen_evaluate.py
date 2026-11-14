"""Oracle for FSRS "Evaluate": the log loss and RMSE(bins) Anki reports for a preset.

Rebuilds each collection recorded by gen_optimize.py (test/fixtures/anki-26.09-optimize.json)
in a fresh Anki 26.09.3 collection, with the same review-log rows, and records what Anki's
Evaluate button computes (`evaluate_params_legacy`, fsrs-rs 6.6.2 `evaluate`) for the default
parameters and for the parameters Anki trained on that collection. Only outputs are recorded.
Card ids differ from the recorded ones; the training items depend only on each card's rows and
the day boundaries, which a whole-day shift of "today" leaves unchanged.

Usage (from scripts/anki-oracle):
    ./run.sh gen_evaluate.py ../../test/fixtures/anki-26.09-optimize.json \
        ../../test/fixtures/anki-26.09-evaluate.json
"""
import importlib.metadata
import json
import os
import sys
import tempfile
import time

os.environ["TZ"] = "Europe/Istanbul"
time.tzset()

from anki.collection import Collection

SOURCE = sys.argv[1]
OUT = sys.argv[2] if len(sys.argv) > 2 else "evaluate.json"
VERSION = importlib.metadata.version("anki")
if tuple(map(int, VERSION.split("."))) != (26, 9, 3):
    raise RuntimeError(f"Anki 26.09.3 required, got {VERSION}")
DEFAULT = [0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666, 0.796,
           1.4835, 0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658, 0.1542]


def rebuild(entry):
    col = Collection(os.path.join(tempfile.mkdtemp(prefix="anki-oracle-"), "col.anki2"))
    did = col.decks.id("Default")
    model = col.models.by_name("Basic")
    for index, card in enumerate(entry["cards"]):
        note = col.new_note(model)
        note["Front"] = f"e{index}"
        col.add_note(note, did)
        cid = note.card_ids()[0]
        for revlog_id, ease, ivl, last_ivl, factor, kind in card["entries"]:
            col.db.execute("insert into revlog (id, cid, usn, ease, ivl, lastIvl, factor, time, type)"
                           " values (?, ?, -1, ?, ?, ?, ?, 5000, ?)", revlog_id, cid, ease, ivl, last_ivl,
                           factor, kind)
        col.db.execute("update cards set type=2, queue=2, due=?, ivl=1, factor=2500, reps=? where id=?",
                       col.sched.today + index % 30, len(card["entries"]), cid)
    return col


def main():
    with open(SOURCE) as handle:
        source = json.load(handle)
    collections = []
    for entry in source["collections"]:
        col = rebuild(entry)
        evaluations = {}
        for label, params in [("default", DEFAULT), ("result", entry["params"])]:
            evaluation = col._backend.evaluate_params_legacy(params=params, search="deck:Default",
                                                             ignore_revlogs_before_ms=0)
            evaluations[label] = {"logLoss": evaluation.log_loss, "rmseBins": evaluation.rmse_bins}
        collections.append({"name": entry["name"], "fsrsItems": entry["fsrsItems"], "evaluate": evaluations})
        col.close()
        print(f"{entry['name']}: {evaluations}")
    with open(OUT, "w") as handle:
        json.dump({"meta": {"ankiVersion": VERSION, "fsrsVersion": "6.6.2", "timezone": "Europe/Istanbul",
                            "rolloverHour": 4, "source": "test/fixtures/anki-26.09-optimize.json",
                            "generator": "scripts/anki-oracle/gen_evaluate.py"},
                   "collections": collections}, handle, indent=1)
        handle.write("\n")
    print(f"wrote {OUT}")


main()
