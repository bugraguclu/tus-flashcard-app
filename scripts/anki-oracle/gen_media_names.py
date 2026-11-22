"""Oracle for media names on the card page and the card page's body classes.

Writes test/fixtures/anki-26.09-media-names.json for lib/cardMediaNames.test.ts:
- `stored`: the name Anki keeps when a media file of that name is added (MediaManager.write_data);
- `rendered`: a card's question HTML as the collection renders it (the field's raw names);
- `escaped`: what the reviewer hands its web view (MediaManager.escape_media_filenames, which
  aqt's prepare_card_text_for_display calls before showing a side);
- `body`: aqt.theme's body classes for a card page by day and at night.

Run: (cd scripts/anki-oracle && ./build-host.sh) once, then
  QT_QPA_PLATFORM=offscreen scripts/anki-oracle/run.sh scripts/anki-oracle/gen_media_names.py OUT.json
"""
import json
import os
import sys
import tempfile

import aqt
from anki.collection import Collection

OUT = sys.argv[1] if len(sys.argv) > 1 else "anki-26.09-media-names.json"

NAMES = ["Şekil #3.png", "Kalp sesi #2.mp3", "a.png?x=1", "50% off.pdf", "A b.png"]
HTML = [
    '<img src="Şekil #3.png">',
    '<img src="Kalp sesi.png">',
    '<img src="a%20b.png">',
    '<img src="x%23y.png">',
    '<img src="50% off.png">',
    '<img src=q#1.png>',
    '<img src="a&amp;b #1.png">',
    '<img class="a" src="Ş #1.png" alt="#">',
    '<audio controls src="s #1.mp3"></audio>',
    '<source src="s #1.mp3">',
    '<video poster="p #1.png" src="v #1.mp4"></video>',
    '<img src="q?.png">',
    '<a href="x#y.pdf">l</a>',
    '<img src="https://example.com/a.png#b">',
    '<style>.a{background:url("b #1.png")}</style>',
]


class _Profile:
    """The profile settings aqt.theme reads (reduce motion, minimalist mode), all off."""

    def __getattr__(self, _name):
        return lambda *args, **kwargs: False


class _Main:
    pm = _Profile()


def main():
    col = Collection(os.path.join(tempfile.mkdtemp(prefix="anki-oracle-"), "col.anki2"))
    stored = {name: col.media.write_data(name, b"x") for name in NAMES}
    escaped = {html: col.media.escape_media_filenames(html) for html in HTML}
    note = col.new_note(col.models.by_name("Basic"))
    note["Front"] = '<img src="Şekil #3.png">'
    col.add_note(note, col.decks.id("Default"))
    question = note.cards()[0].question()
    rendered = question[question.index("</style>") + len("</style>"):]
    col.close()

    aqt.mw = _Main()
    from aqt.theme import theme_manager

    body = {
        "day": theme_manager.body_classes_for_card_ord(0, night_mode=False),
        "night": theme_manager.body_classes_for_card_ord(0, night_mode=True),
    }
    with open(OUT, "w", encoding="utf-8") as handle:
        json.dump({"stored": stored, "rendered": rendered, "escaped": escaped, "body": body},
                  handle, ensure_ascii=False, indent=2)
        handle.write("\n")


main()
