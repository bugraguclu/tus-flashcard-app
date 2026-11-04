"""Assemble test/fixtures/anki-26.09-sm2.json from the SM-2 generators' output.

Usage (from scripts/anki-oracle):
    ./run.sh gen_sm2_states.py 301 8000 sm2_states.json
    ./run.sh gen_sm2_answers.py 302 4000 sm2_answers.json
    python3 build_sm2_fixture.py ../../test/fixtures/anki-26.09-sm2.json

Only states Anki itself can reach go in (the generators tag the others in `edge`). The sample is
drawn with a fixed seed; the probes are cases of seed 301's run that decide on a single day whether
the arithmetic is done in f32, as Anki does, or in f64.
"""
import json
import random
import sys

OUT = sys.argv[1] if len(sys.argv) > 1 else "anki-sm2.json"
rng = random.Random(2026)
STATE_SAMPLE, ANSWER_SAMPLE = 300, 200
# Seed 301, 8000 states: Hard 1995 (not 1996), Hard 474 (not 475) and Easy 232 (not 233).
F32_PROBES = [4942, 5907, 7823]


def load(name):
    with open(name) as handle:
        return json.load(handle)


def pick(items, count):
    items = list(items)
    rng.shuffle(items)
    return items[:count]


OUTCOME_KEYS = {
    "review": ("days", "ease", "lapses", "leeched"),
    "learning": ("secs", "remaining"),
    "relearning": ("secs", "remaining", "days", "ease", "lapses", "leeched"),
}


def outcome(state):
    return {"kind": state["kind"]} | {key: state[key] for key in OUTCOME_KEYS[state["kind"]]}


def compact_state(case):
    card = {key: case["card"][key] for key in ("id", "kind", "type", "queue", "due", "ivl", "factor", "reps", "lapses", "left")}
    if case["card"]["filtered"]:
        card |= {"filtered": True, "odue": case["card"]["odue"]}
    return {
        "index": case["index"],
        "config": case["config"],
        "timing": {"now": case["timing"]["now"], "today": case["timing"]["today"]},
        "card": card,
        "out": {button: outcome(case["out"][button]) for button in ("again", "hard", "good", "easy")},
        "labels": [label.replace("⁨", "").replace("⁩", "") for label in case["labels"]],
    }


def compact_answer(case):
    after = dict(case["after"])
    return {
        "index": case["index"],
        "config": case["config"],
        "timing": {"today": case["timing"]["today"], "answeredAtMs": case["timing"]["answeredAtMs"]},
        "cardId": case["cardId"], "noteId": case["noteId"], "rating": case["rating"],
        "before": case["before"], "after": after,
        "newRevlog": {key: case["newRevlog"][key] for key in ("ease", "ivl", "lastIvl", "factor", "type")},
        "leechTagged": "leech" in case["tags"],
    }


states, answers = load("sm2_states.json"), load("sm2_answers.json")
if states["meta"]["anki"] != "26.09.3" or states["meta"]["seed"] != 301:
    raise SystemExit("the probes come from an Anki 26.09.3 run of gen_sm2_states.py with seed 301")

realistic_states = [c for c in states["cases"] if not c["card"]["edge"]]
probes = [states["cases"][index] for index in F32_PROBES]
assert all(not c["card"]["edge"] and c["card"]["kind"] == "review" for c in probes)
sample = [c for c in pick(realistic_states, STATE_SAMPLE + len(probes)) if c["index"] not in F32_PROBES][:STATE_SAMPLE]
realistic_answers = [c for c in answers["cases"] if not c["edge"]]

fixture = {
    "meta": {"anki": states["meta"]["anki"], "buildhash": states["meta"]["buildhash"],
             "timezone": states["meta"]["timezone"], "rolloverHour": states["meta"]["rolloverHour"],
             "collapseSecs": states["meta"]["collapseSecs"]},
    "f32Probes": [compact_state(c) for c in probes],
    "states": [compact_state(c) for c in sorted(sample, key=lambda c: c["index"])],
    "answers": [compact_answer(c) for c in sorted(pick(realistic_answers, ANSWER_SAMPLE), key=lambda c: c["index"])],
}

graduations = sum(1 for c in fixture["states"] if c["card"]["kind"] in ("new", "learning") and c["card"]["lapses"] > 0
                  for o in c["out"].values() if o["kind"] == "review")
seconds = sum(1 for c in fixture["states"] for label in c["labels"] if label.endswith("s") and not label.endswith("mos"))
early = sum(1 for c in fixture["states"] if c["card"].get("filtered") and c["card"]["odue"] > c["timing"]["today"])
print(f"{len(fixture['states'])} states ({graduations} forgotten-card graduations, {seconds} second labels, "
      f"{early} early filtered reviews), {len(fixture['answers'])} answers, {len(fixture['f32Probes'])} probes")
with open(OUT, "w") as handle:
    json.dump(fixture, handle, separators=(",", ":"))
print(f"wrote {OUT}")
