"""Oracle for .apkg export: imports packages this app exported into Anki, as a learner would.

The app's package tests are app-to-app round trips, so only Anki itself can say whether it accepts
an export. Each package is imported into a fresh temporary collection under every combination of
Anki's two import options (learning progress, deck presets), and the decks, cards and reviews that
arrived are printed, or the error Anki refused the package with. The exit status is 1 when any
import was refused.

Usage (from scripts/anki-oracle):
    ./run.sh import_app_export.py path/to/export.apkg [more.apkg ...]
An export can come from the app's Export screen, or from a throwaway vitest file in lib/ that calls
buildAnkiExport and writes the bytes, with ./db and ./mediaStore mocked as in
lib/exportAnkiPackage.ankiImport.test.ts.
"""
import os
import sys
import tempfile

from anki.collection import Collection
from anki.import_export_pb2 import ImportAnkiPackageOptions, ImportAnkiPackageRequest


def import_once(path, with_scheduling, with_deck_configs):
    col = Collection(os.path.join(tempfile.mkdtemp(prefix="anki-oracle-"), "col.anki2"))
    try:
        col.import_anki_package(ImportAnkiPackageRequest(
            package_path=os.path.abspath(path),
            options=ImportAnkiPackageOptions(with_scheduling=with_scheduling, with_deck_configs=with_deck_configs),
        ))
        decks = col.db.all("SELECT d.name, COUNT(c.id) FROM decks d LEFT JOIN cards c ON c.did = d.id"
                           " GROUP BY d.id ORDER BY d.name")
        cards = ", ".join(f"{name.replace(chr(31), '::')}: {count}" for name, count in decks)
        return f"{cards}; reviews: {col.db.scalar('SELECT COUNT() FROM revlog')}"
    finally:
        col.close()


def main():
    refused = False
    for path in sys.argv[1:]:
        for with_scheduling in (True, False):
            for with_deck_configs in (True, False):
                label = (f"{os.path.basename(path)} (progress {'on' if with_scheduling else 'off'},"
                         f" presets {'on' if with_deck_configs else 'off'})")
                try:
                    print(f"imported {label}: {import_once(path, with_scheduling, with_deck_configs)}")
                except Exception as error:
                    refused = True
                    print(f"refused  {label}: {error}")
    sys.exit(1 if refused else 0)


main()
