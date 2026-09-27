"""Oracle for Anki's review fuzz: fuzz_delta(card, interval) for many card ids and review counts."""
import json
import os
import random
import sys
import tempfile

from anki.collection import Collection

SEED = int(sys.argv[1]) if len(sys.argv) > 1 else 1
COUNT = int(sys.argv[2]) if len(sys.argv) > 2 else 200
OUT = sys.argv[3] if len(sys.argv) > 3 else "fuzz.json"
rng = random.Random(SEED)


def main():
    work = tempfile.mkdtemp(prefix="anki-oracle-")
    col = Collection(os.path.join(work, "col.anki2"))
    did = col.decks.id("Default")
    model = col.models.by_name("Basic")
    note = col.new_note(model)
    note["Front"] = "fuzz"
    col.add_note(note, did)
    cid = note.card_ids()[0]
    cases = []
    for index in range(COUNT):
        # Card ids are epoch milliseconds in practice; include small and huge ones too.
        new_id = rng.choice([rng.randrange(1, 10_000), rng.randrange(1_600_000_000_000, 1_800_000_000_000),
                             rng.randrange(2**40, 2**52)])
        reps = rng.choice([0, 1, 2, rng.randrange(0, 5000)])
        col.db.execute("update cards set id=?, reps=?, type=2, queue=2, ivl=10 where id=?", new_id, reps, cid)
        cid = new_id
        intervals = [rng.choice([1, 2, 3, 4, 7, 10, 25, 60, 100, 365, 1000, 5000])]
        deltas = [col._backend.fuzz_delta(card_id=cid, interval=i) for i in intervals]
        cases.append({"cardId": cid, "reps": reps, "intervals": intervals, "deltas": deltas})
    col.close()
    with open(OUT, "w") as handle:
        json.dump({"cases": cases}, handle)
    print(f"wrote {len(cases)} cases to {OUT}")


main()
