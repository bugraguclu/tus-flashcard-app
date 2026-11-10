"""Oracle for five behaviours the app follows, recorded from Anki's own backend.

- Unsuspend also restores buried cards (one backend call does both).
- Adding a note whose first field holds no text is refused (fields_check = EMPTY), also for a
  reversed type whose back is filled and for a blank cloze note.
- A text import matches an existing note by the text of its first field, not by its markup.
- The typed-answer comparison decodes the expected answer's character references once.
- A card answered into a step longer than the learn-ahead limit is not in the learning count.

Run with ./run.sh parity_probes.py; prints one JSON object.
"""
import json
import os
import tempfile

from anki.collection import Collection, ImportCsvRequest
from anki.scheduler.v3 import CardAnswer

col = Collection(os.path.join(tempfile.mkdtemp(), 'oracle.anki2'))
basic = col.models.by_name('Basic')
home = col.decks.id('Home')
out = {}


def add(front, back='b', deck=home):
    note = col.new_note(basic)
    note['Front'] = front
    note['Back'] = back
    col.add_note(note, deck)
    return note


# 1. Unsuspend on a suspended, a user-buried and a sibling-buried card; unbury on a suspended one.
ids = [add(name).cards()[0].id for name in ('suspended', 'buried', 'sched-buried')]
col.sched.suspend_cards([ids[0]])
col.sched.bury_cards([ids[1]], manual=True)
col.sched.bury_cards([ids[2]], manual=False)
before = [col.get_card(cid).queue for cid in ids]
col.sched.unsuspend_cards(ids)
out['unsuspend'] = {'before': before, 'after': [col.get_card(cid).queue for cid in ids]}
col.sched.suspend_cards([ids[0]])
col.sched.unbury_cards([ids[0]])
out['unbury_on_suspended'] = col.get_card(ids[0]).queue


# 2. fields_check: 0 normal, 1 empty first field, 3 cloze type without a deletion.
def state(notetype, fields):
    note = col.new_note(col.models.by_name(notetype))
    for index, value in enumerate(fields):
        note.fields[index] = value
    return int(note.fields_check())


out['fields_check'] = {
    'basic_empty_front': state('Basic', ['', 'x']),
    'basic_nbsp_front': state('Basic', ['&nbsp;', 'x']),
    'basic_br_front': state('Basic', ['<br>', 'x']),
    'basic_img_front': state('Basic', ['<img src="a.png">', 'x']),
    'basic_front_only': state('Basic', ['a', '']),
    'reversed_empty_front': state('Basic (and reversed card)', ['', 'x']),
    'cloze_blank': state('Cloze', ['', '']),
    'cloze_no_deletion': state('Cloze', ['text', '']),
    'cloze_ok': state('Cloze', ['{{c1::a}}', '']),
}

# 3. Text import (HTML off) of a row whose first field differs from a note's only in markup.
existing = add("Graves'in <b>hastalığı</b>", 'old')
path = os.path.join(tempfile.mkdtemp(), 'rows.txt')
with open(path, 'w', encoding='utf-8') as handle:
    handle.write("Graves'in hastalığı;new\n")
meta = col.get_csv_metadata(path=path, delimiter=None)
meta.deck_id = home
meta.global_notetype.id = basic['id']
meta.is_html = False
log = col.import_csv(ImportCsvRequest(path=path, metadata=meta)).log
out['text_import'] = {
    'new': len(log.new),
    'first_field_match': len(log.first_field_match),
    'existing_fields_after': col.get_note(existing.id).fields,
}

# 4. Typed answer: the expected answer's character references.
out['compare_answer'] = {
    'entities_vs_plain': col.compare_answer("T&uuml;rkiye&#x27;de", "Türkiye'de"),
    'amp_lt': col.compare_answer('a &amp;lt; b', 'a &lt; b'),
}

# 5. Learning count after Again (1m, inside the 20-minute learn-ahead) and Good (60m, beyond it).
steps = col.decks.id('Steps')
conf = col.decks.config_dict_for_deck_id(steps)
conf['new']['delays'] = [1, 60]
col.decks.update_config(conf)
for index in range(3):
    add(f'q{index}', deck=steps)
col.decks.select(steps)


def counts():
    queued = col.sched.get_queued_cards()
    return [queued.new_count, queued.learning_count, queued.review_count]


def answer(rating):
    queued = col.sched.get_queued_cards().cards[0]
    card = col.get_card(queued.card.id)
    card.start_timer()
    col.sched.answer_card(col.sched.build_answer(card=card, states=queued.states, rating=rating))


out['learn_ahead_secs'] = col.get_preferences().scheduling.learn_ahead_secs
out['counts'] = {'start': counts()}
answer(CardAnswer.AGAIN)
out['counts']['after_again_1m'] = counts()
answer(CardAnswer.GOOD)
out['counts']['after_good_60m'] = counts()

print(json.dumps(out, ensure_ascii=False, indent=1))
