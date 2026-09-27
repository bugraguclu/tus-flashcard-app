"""Oracle for answers in a preview filtered deck (rescheduling off): the review-log row and card."""
import json
import os
import random
import sys
import tempfile
import time

from anki.collection import Collection
from anki.scheduler.v3 import CardAnswer

SEED = int(sys.argv[1]) if len(sys.argv) > 1 else 1
ROUNDS = int(sys.argv[2]) if len(sys.argv) > 2 else 6
OUT = sys.argv[3] if len(sys.argv) > 3 else "preview.json"
rng = random.Random(SEED)
COLUMNS = ["id", "did", "odid", "type", "queue", "due", "odue", "ivl", "factor", "reps", "lapses", "left", "data"]


def card_row(col, cid):
    row = dict(zip(COLUMNS, col.db.first(f"select {', '.join(COLUMNS)} from cards where id=?", cid)))
    row["data"] = json.loads(row["data"]) if row["data"] else {}
    return row


def main():
    rounds = []
    for _ in range(ROUNDS):
        work = tempfile.mkdtemp(prefix="anki-oracle-")
        col = Collection(os.path.join(work, "col.anki2"))
        col.db.execute("update col set crt = ?", int(time.time()) - 500 * 86_400)
        col.set_config("fsrs", rng.random() < 0.5)
        did = col.decks.id("Default")
        today = col._backend.sched_timing_today().days_elapsed
        now = int(time.time())
        model = col.models.by_name("Basic")
        for index in range(12):
            note = col.new_note(model)
            note["Front"] = f"p{index}"
            col.add_note(note, did)
            cid = note.card_ids()[0]
            kind = rng.choice(["new", "review", "review", "learn"])
            if kind == "review":
                col.db.execute("update cards set type=2, queue=2, due=?, ivl=?, factor=2500, reps=?, data=? where id=?",
                               today + rng.randrange(-5, 30), rng.randrange(1, 60), rng.randrange(1, 20),
                               json.dumps({"s": 20.5, "d": 5.2, "lrt": now - 86_400 * 9}), cid)
            elif kind == "learn":
                col.db.execute("update cards set type=1, queue=1, due=?, ivl=0, factor=0, reps=1, left=1001 where id=?",
                               now - rng.randrange(0, 600), cid)
        delays = [rng.choice([0, 60, 90, 600]), rng.choice([0, 600, 1200, 90_000]), rng.choice([0, 600, 172_800])]
        fdid = col.decks.new_filtered("Preview")
        deck = col.decks.get(fdid)
        deck["terms"] = [["deck:Default", 100, 1]]
        deck["resched"] = False
        deck["previewAgainSecs"], deck["previewHardSecs"], deck["previewGoodSecs"] = delays
        col.decks.save(deck)
        col.sched.rebuild_filtered_deck(fdid)
        timing = col._backend.sched_timing_today()
        answers = []
        for cid in col.find_cards(f"did:{fdid}"):
            before = card_row(col, cid)
            card = col.get_card(cid)
            card.start_timer()
            states = col._backend.get_scheduling_states(cid)
            rating = rng.choice([1, 2, 3, 4])
            answer = col.sched.build_answer(card=card, states=states, rating=rating - 1 + CardAnswer.AGAIN)
            answered_at = time.time()
            col.sched.answer_card(answer)
            revlog = col.db.all("select ease, ivl, lastIvl, factor, type from revlog where cid=?", cid)
            answers.append({"cid": cid, "rating": rating, "before": before, "after": card_row(col, cid),
                            "revlog": revlog, "answeredAt": answered_at,
                            "secsUntilRollover": timing.next_day_at - int(answered_at)})
        rounds.append({"today": today, "nextDayAt": timing.next_day_at, "delays": delays,
                       "fsrs": col.get_config("fsrs"), "answers": answers})
        col.close()
    with open(OUT, "w") as handle:
        json.dump({"rounds": rounds}, handle)
    print(f"wrote {len(rounds)} rounds to {OUT}")


main()
