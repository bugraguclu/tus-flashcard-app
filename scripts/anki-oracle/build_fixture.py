"""Assemble test/fixtures/anki-26.05-fsrs.json from the generators' output files.

Usage (from scripts/anki-oracle, after running the generators):
    ./run.sh gen_states.py 31 3000 states.json
    ./run.sh gen_memory.py 33 3000 memory.json
    ./run.sh gen_answer.py 32 2000 answers.json
    ./run.sh gen_fuzz.py 5 400 fuzz.json
    ./run.sh gen_lb.py 34 40 lb.json
    ./run.sh gen_resched.py 1 3 off resched.json
    ./run.sh gen_resched.py 11 1 on resched_lb.json 110
    ./run.sh gen_forget.py 3 60 forget.json
    ./run.sh gen_sortkeys.py 5 120 sortkeys.json
    ./run.sh gen_preview.py 4 6 preview.json
    ./run.sh gen_optimize.py 8 optimize.json small
    python3 build_fixture.py ../../test/fixtures/anki-26.05-fsrs.json
"""
import json
import random
import struct
import sys

OUT = sys.argv[1] if len(sys.argv) > 1 else "anki-fsrs.json"
rng = random.Random(2026)


def load(name):
    with open(name) as handle:
        return json.load(handle)


def pick(items, count):
    items = list(items)
    rng.shuffle(items)
    return items[:count]


def shortest_f32(value):
    """Print an f32 value with the fewest digits that still read back as the same f32."""
    if not isinstance(value, float):
        return value
    single = struct.unpack("<f", struct.pack("<f", value))[0]
    if single != value:
        return value
    for digits in range(1, 10):
        candidate = float(f"{value:.{digits}g}")
        if struct.unpack("<f", struct.pack("<f", candidate))[0] == single:
            return candidate
    return value


def compact(node):
    if isinstance(node, dict):
        return {key: compact(value) for key, value in node.items()}
    if isinstance(node, list):
        return [compact(value) for value in node]
    return shortest_f32(node)


states, memory, answers = load("states.json"), load("memory.json"), load("answers.json")
fuzz, lb, resched = load("fuzz.json"), load("lb.json"), load("resched.json")
resched_lb, forget, sortkeys = load("resched_lb.json"), load("forget.json"), load("sortkeys.json")
preview, optimize = load("preview.json"), load("optimize.json")


def compact_resched_round(rnd):
    """A rescheduling round with each card as a list:
    [cid, nid, before, [ivl, due] after, revlog rows, rescheduled rows]."""
    return {
        "today": rnd["today"], "nextDayAt": rnd["nextDayAt"], "runAtMs": rnd["runAtMs"],
        "easyDays": rnd["easyDays"], "desiredRetention": rnd["desiredRetention"],
        "cards": [[c["cid"], c["nid"], c["before"], [c["after"]["ivl"], c["after"]["due"]],
                   [[e["id"], e["ease"], e["ivl"], e["lastIvl"], e["factor"], e["type"]] for e in c["entries"]],
                   c["rescheduled"]] for c in rnd["cards"]],
    }


fixture = {
    "meta": {"anki": states["meta"]["anki"], "buildhash": states["meta"]["buildhash"], "fsrs": "5.2.0",
             "rand": "0.9.4", "timezone": "Europe/Istanbul", "rolloverHour": 4},
    "states": [{"config": c["config"], "timing": c["timing"], "card": c["card"],
                "out": {b: {k: c["out"][b][k] for k in ("kind", "days", "secs", "s", "d") if k in c["out"][b]}
                        for b in ("again", "hard", "good", "easy")}}
               for c in pick(states["cases"], 150)],
    "memory": [{k: c[k] for k in ("params", "historicalRetention", "ignore", "nextDayAtMs", "card", "entries")}
               | {"state": c["out"].get("state")} for c in pick(memory["cases"], 100)],
    "answers": [{k: c[k] for k in ("config", "cardId", "noteId", "rating", "before", "revlog", "after", "newRevlog")}
                | {"timing": {"today": c["timing"]["today"], "answeredAtMs": c["timing"]["answeredAtMs"]}}
                for c in pick(answers["cases"], 100)],
    "fuzz": pick(fuzz["cases"], 120),
    "loadBalancer": [],
    "reschedule": resched["rounds"][:1],
    "rescheduleBalanced": [compact_resched_round(r) for r in resched_lb["rounds"][:1]],
    "resetCards": forget["cases"],
    "sortKeys": sortkeys,
    "previewAnswers": preview["rounds"],
    "optimize": optimize,
}
for rnd in lb["rounds"][:3]:
    window = [[c["id"], c["nid"], c["due"] - rnd["today"]] for c in rnd["snapshot"] if 0 <= c["due"] - rnd["today"] < 99]
    targets = [{k: t[k] for k in ("cid", "nid", "reps", "ivl", "data")}
               | {"out": {b: t["out"][b].get("days") for b in ("hard", "good", "easy")}} for t in rnd["targets"]]
    fixture["loadBalancer"].append({"nextDayAt": rnd["nextDayAt"], "now": rnd["now"], "easyDays": rnd["easyDays"],
                                    "bury": rnd["bury"], "desiredRetention": rnd["desiredRetention"],
                                    "window": window, "targets": targets})
fixture["reschedule"][0]["cards"] = fixture["reschedule"][0]["cards"][:25]

with open(OUT, "w") as handle:
    json.dump(compact(fixture), handle, separators=(",", ":"))
print(f"wrote {OUT}")
