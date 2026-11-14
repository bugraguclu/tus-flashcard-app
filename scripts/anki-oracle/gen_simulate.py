"""Oracle for the FSRS simulator: what Anki 26.09.3's simulator reports for a recorded preset.

Rebuilds collections recorded by gen_optimize.py (test/fixtures/anki-26.09-optimize.json) in a
fresh Anki 26.09.3 collection, as gen_evaluate.py does, with card i due in i % 30 days, and runs
`simulate_fsrs_review` (fsrs-rs 6.6.2 `simulate`, seed 42) for a few requests. The simulation is
random, so only totals and coarse shapes are recorded; lib/fsrsSimulator.test.ts compares the
app's own simulation, which draws different random numbers, with a tolerance.

Usage (from scripts/anki-oracle):
    ./run.sh gen_simulate.py ../../test/fixtures/anki-26.09-optimize.json \
        ../../test/fixtures/anki-26.09-simulate.json
"""
import importlib.metadata
import json
import os
import sys
import tempfile
import time

os.environ["TZ"] = "Europe/Istanbul"
time.tzset()

from anki import deck_config_pb2, scheduler_pb2
from anki.collection import Collection
from anki.config import Config

SOURCE = sys.argv[1]
OUT = sys.argv[2] if len(sys.argv) > 2 else "simulate.json"
VERSION = importlib.metadata.version("anki")
if tuple(map(int, VERSION.split("."))) != (26, 9, 3):
    raise RuntimeError(f"Anki 26.09.3 required, got {VERSION}")
DAY_ORDER = deck_config_pb2.DeckConfig.Config.ReviewCardOrder.Value("REVIEW_CARD_ORDER_DAY")
SCENARIOS = [
    # name, collection, request overrides
    ("open-limits", "cards-400", dict(deck_size=600, new_limit=10, review_limit=9999)),
    ("tight-reviews", "cards-400", dict(deck_size=600, new_limit=20, review_limit=60,
                                        new_cards_ignore_review_limit=False)),
    ("existing-only", "cards-150", dict(deck_size=0, new_limit=0, review_limit=9999, desired_retention=0.85)),
]


def rebuild(entry):
    col = Collection(os.path.join(tempfile.mkdtemp(prefix="anki-oracle-"), "col.anki2"))
    did = col.decks.id("Default")
    model = col.models.by_name("Basic")
    for index, card in enumerate(entry["cards"]):
        note = col.new_note(model)
        note["Front"] = f"s{index}"
        col.add_note(note, did)
        cid = note.card_ids()[0]
        for revlog_id, ease, ivl, last_ivl, factor, kind in card["entries"]:
            col.db.execute("insert into revlog (id, cid, usn, ease, ivl, lastIvl, factor, time, type)"
                           " values (?, ?, -1, ?, ?, ?, ?, 5000, ?)", revlog_id, cid, ease, ivl, last_ivl,
                           factor, kind)
        col.db.execute("update cards set type=2, queue=2, due=?, ivl=1, factor=2500, reps=? where id=?",
                       col.sched.today + index % 30, len(card["entries"]), cid)
    return col


def blocks(values, size=30):
    return [sum(values[start:start + size]) for start in range(0, len(values), size)]


def main():
    with open(SOURCE) as handle:
        source = {entry["name"]: entry for entry in json.load(handle)["collections"]}
    scenarios = []
    for name, collection, overrides in SCENARIOS:
        col = rebuild(source[collection])
        request = dict(params=[], desired_retention=0.9, deck_size=0, days_to_simulate=365, new_limit=10,
                       review_limit=9999, max_interval=36500, search="deck:Default",
                       new_cards_ignore_review_limit=True, easy_days_percentages=[1.0] * 7,
                       review_order=DAY_ORDER, historical_retention=0.9, learning_step_count=2,
                       relearning_step_count=1)
        request.update(overrides)
        response = col._backend.simulate_fsrs_review(scheduler_pb2.SimulateFsrsReviewRequest(**request))
        reviews = list(response.daily_review_count)
        new = list(response.daily_new_count)
        seconds = list(response.daily_time_cost)
        memorized = list(response.accumulated_knowledge_acquisition)
        scenarios.append({
            "name": name, "collection": collection, "request": {k: v for k, v in request.items() if k != "params"},
            "loadBalancer": col.get_config_bool(Config.Bool.LOAD_BALANCER_ENABLED),
            "totals": {"reviews": sum(reviews), "newCards": sum(new), "seconds": sum(seconds),
                       "memorizedFirst": memorized[0], "memorizedLast": memorized[-1]},
            "reviewsBy30Days": blocks(reviews), "newBy30Days": blocks(new),
            "memorizedEvery30Days": memorized[::30],
            "maxReviewsPerDay": max(reviews), "maxNewPerDay": max(new),
        })
        col.close()
        print(name, scenarios[-1]["totals"])
    with open(OUT, "w") as handle:
        json.dump({"meta": {"ankiVersion": VERSION, "fsrsVersion": "6.6.2", "timezone": "Europe/Istanbul",
                            "rolloverHour": 4, "source": "test/fixtures/anki-26.09-optimize.json",
                            "dueOffsets": "card i due in i % 30 days, interval 1, factor 2500",
                            "generator": "scripts/anki-oracle/gen_simulate.py"},
                   "scenarios": scenarios}, handle, indent=1)
        handle.write("\n")
    print(f"wrote {OUT}")


main()
