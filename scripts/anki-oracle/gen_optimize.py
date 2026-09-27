"""Oracle for FSRS optimization: the parameters Anki trains from simulated review histories.

Two kinds of cases: `compute_fsrs_params_from_items` on item lists (fsrs-rs's trainer alone), and
`compute_fsrs_params` on a whole collection (Anki's item gathering, training and adoption rule),
with Anki's log loss for the default and the resulting parameters.
"""
import json
import math
import os
import random
import sys
import tempfile
import time

from anki.collection import Collection
from anki import scheduler_pb2

SEED = int(sys.argv[1]) if len(sys.argv) > 1 else 1
OUT = sys.argv[2] if len(sys.argv) > 2 else "optimize.json"
# "small" keeps the committed fixture compact; the default sizes are for measuring.
SMALL = len(sys.argv) > 3 and sys.argv[3] == "small"
CASES = [(40, 6), (400, 10)] if SMALL else [(40, 6), (150, 8), (400, 10), (900, 12), (1500, 9)]
COLLECTIONS = [150] if SMALL else [300, 700]
rng = random.Random(SEED)
DEFAULT = [0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666, 0.796,
           1.4835, 0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658, 0.1542]


def learner():
    """A simulated learner: FSRS-6 parameters jittered around the defaults."""
    w = [v * rng.uniform(0.7, 1.3) for v in DEFAULT]
    w[20] = rng.uniform(0.12, 0.5)
    return w


def retrievability(w, t, s):
    factor = 0.9 ** (1 / -w[20]) - 1
    return (1 + factor * t / s) ** -w[20]


def init_d(w, r):
    return min(10, max(1, w[4] - math.exp(w[5] * (r - 1)) + 1))


def step(w, s, d, t, r):
    if t == 0:
        inc = math.exp(w[17] * (r - 3 + w[18])) * s ** -w[19]
        if r >= 3:
            inc = max(inc, 1)
        s2 = s * inc
    else:
        rr = retrievability(w, t, s)
        if r == 1:
            s2 = min(w[11] * d ** -w[12] * ((s + 1) ** w[13] - 1) * math.exp((1 - rr) * w[14]), s / math.exp(w[17] * w[18]))
        else:
            hp = w[15] if r == 2 else 1
            eb = w[16] if r == 4 else 1
            s2 = s * (math.exp(w[8]) * (11 - d) * s ** -w[9] * (math.exp((1 - rr) * w[10]) - 1) * hp * eb + 1)
    delta = -w[6] * (r - 3)
    d2 = d + (10 - d) * delta / 9
    d2 = w[7] * (init_d(w, 4) - d2) + d2
    return min(36500, max(0.001, s2)), min(10, max(1, d2))


def simulate_card(w, spaced):
    """One card's reviews as (rating, days since the previous review, revlog kind)."""
    first = rng.choices([1, 2, 3, 4], weights=[0.2, 0.1, 0.6, 0.1])[0]
    s, d = w[first - 1], init_d(w, first)
    reviews = [(first, 0, 0)]
    for _ in range(rng.choice([0, 0, 1, 2]) if first < 4 else 0):
        r = rng.choices([1, 3], weights=[0.2, 0.8])[0]
        s, d = step(w, s, d, 0, r)
        reviews.append((r, 0, 0))
    for _ in range(spaced):
        t = max(1, round(s * rng.uniform(0.5, 1.6)))
        recalled = rng.random() < retrievability(w, t, s)
        r = rng.choices([2, 3, 4], weights=[0.15, 0.75, 0.1])[0] if recalled else 1
        s, d = step(w, s, d, t, r)
        reviews.append((r, t, 1))
        if r == 1 and rng.random() < 0.6:
            s, d = step(w, s, d, 0, 3)
            reviews.append((3, 0, 2))
    return reviews


def items_of(reviews):
    items = []
    for index in range(1, len(reviews)):
        if reviews[index][1] > 0:
            items.append([[r, t] for r, t, _ in reviews[:index + 1]])
    return items


def from_items_case(cards, spaced_max):
    """Card histories, and the items drawn from them as (card, length) pairs in shuffled order."""
    w = learner()
    histories = []
    items = []
    for _ in range(cards):
        reviews = simulate_card(w, rng.randrange(1, spaced_max))
        histories.append([[r, t] for r, t, _ in reviews])
        for index in range(1, len(reviews)):
            if reviews[index][1] > 0:
                items.append([len(histories) - 1, index + 1])
    rng.shuffle(items)
    return histories, items


def main():
    work = tempfile.mkdtemp(prefix="anki-oracle-")
    col = Collection(os.path.join(work, "col.anki2"))
    cases = []
    for cards, spaced_max in CASES:
        histories, items = from_items_case(cards, spaced_max)
        request = [scheduler_pb2.FsrsItem(reviews=[scheduler_pb2.FsrsReview(rating=r, delta_t=t)
                                                   for r, t in histories[card][:length]])
                   for card, length in items]
        response = col._backend.compute_fsrs_params_from_items(items=request)
        cases.append({"histories": histories, "items": items, "params": list(response.params)})
        print(f"from items: {len(items)} items")

    # A whole collection: cards with logs, trained through Anki's own gathering and adoption.
    collections = []
    for cards in COLLECTIONS:
        col2 = Collection(os.path.join(tempfile.mkdtemp(prefix="anki-oracle-"), "col.anki2"))
        did = col2.decks.id("Default")
        model = col2.models.by_name("Basic")
        w = learner()
        now_ms = int(time.time() * 1000)
        logged = []
        used = set()
        for n in range(cards):
            note = col2.new_note(model)
            note["Front"] = f"o{n}"
            col2.add_note(note, did)
            cid = note.card_ids()[0]
            reviews = simulate_card(w, rng.randrange(1, 10))
            total_days = sum(t for _, t, _ in reviews)
            day = rng.randrange(total_days + 1, total_days + 400)
            stamp = now_ms - day * 86_400_000 + rng.randrange(0, 3_600_000)
            entries = []
            for r, t, kind in reviews:
                stamp += t * 86_400_000 + rng.randrange(60_000, 600_000)
                while stamp in used:
                    stamp += 1
                used.add(stamp)
                entries.append([stamp, r, 1 if kind == 1 else -600, 0, 2500 if kind else 0, kind])
                col2.db.execute("insert into revlog (id, cid, usn, ease, ivl, lastIvl, factor, time, type)"
                                " values (?, ?, -1, ?, ?, 0, ?, 5000, ?)", stamp, cid, r, 1 if kind == 1 else -600,
                                2500 if kind else 0, kind)
            col2.db.execute("update cards set type=2, queue=2, due=?, ivl=1, factor=2500, reps=? where id=?",
                            col2.sched.today + rng.randrange(0, 30), len(reviews), cid)
            logged.append({"cid": cid, "nid": note.id, "entries": entries})
        steps = rng.choice([1, 2])
        response = col2._backend.compute_fsrs_params(search="deck:Default", current_params=[],
                                                     ignore_revlogs_before_ms=0, num_of_relearning_steps=steps,
                                                     health_check=False)
        evaluations = {}
        for label, params in [("default", DEFAULT), ("result", list(response.params))]:
            evaluation = col2._backend.evaluate_params_legacy(params=params, search="deck:Default",
                                                               ignore_revlogs_before_ms=0)
            evaluations[label] = evaluation.log_loss
        timing = col2._backend.sched_timing_today()
        collections.append({"cards": logged, "numRelearningSteps": steps, "params": list(response.params),
                            "fsrsItems": response.fsrs_items, "logLoss": evaluations,
                            "nextDayAt": timing.next_day_at, "nowMs": now_ms})
        col2.close()
        print(f"collection: {cards} cards, {response.fsrs_items} items")
    col.close()
    with open(OUT, "w") as handle:
        json.dump({"fromItems": cases, "collections": collections}, handle)
    print(f"wrote {OUT}")


main()
