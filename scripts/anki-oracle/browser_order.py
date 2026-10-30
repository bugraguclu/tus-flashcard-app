"""Oracle for three browser operations, recorded from Anki's own backend.

- Reposition (no randomize) numbers the cards in the order their ids are passed.
- Reset/Forget puts the cards at the end of the new queue in that same order.
- Change Deck on a card held by a filtered deck first returns it home (original due, no odid).

Run with ./run.sh browser_order.py; prints one JSON object.
"""
import json
import os
import tempfile

from anki.collection import Collection

col = Collection(os.path.join(tempfile.mkdtemp(), 'oracle.anki2'))
basic = col.models.by_name('Basic')
home = col.decks.id('Home')
target = col.decks.id('Target')


def add(front):
    note = col.new_note(basic)
    note['Front'] = front
    note['Back'] = 'b'
    col.add_note(note, home)
    return note.cards()[0].id


def snapshot(cid):
    card = col.get_card(cid)
    return {'did': card.did, 'odid': card.odid, 'due': card.due, 'odue': card.odue, 'type': card.type, 'queue': card.queue}


out = {}
cids = [add(f'q{i}') for i in range(1, 6)]
col.sched.reposition_new_cards(card_ids=[cids[3], cids[0], cids[2]], starting_from=10, step_size=1, randomize=False, shift_existing=False)
out['reposition_q4_q1_q3_from_10'] = {f'q{i + 1}': col.get_card(cid).due for i, cid in enumerate(cids)}

col.sched.set_due_date(cids, '1')
col.sched.schedule_cards_as_new([cids[3], cids[0], cids[2]], restore_position=False, reset_counts=False)
out['forget_q4_q1_q3'] = {f'q{i + 1}': col.get_card(cid).due for i, cid in enumerate(cids)}

moved = add('filtered')
col.sched.set_due_date([moved], '5')
filtered = col.sched.get_or_create_filtered_deck(deck_id=0)
filtered.name = 'Filter'
filtered.config.search_terms[0].search = 'front:filtered'
filtered.config.reschedule = True
filtered_id = col.sched.add_or_update_filtered_deck(filtered).id
before = snapshot(moved)
col.set_deck([moved], target)
out['change_deck_from_filtered'] = {
    'home': home, 'target': target, 'filtered': filtered_id,
    'before': before, 'after': snapshot(moved),
}
print(json.dumps(out, indent=1))
col.close()
