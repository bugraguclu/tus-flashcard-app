#!/usr/bin/env python3
"""Apply audited, field-scoped catalog editorial changes; dry run unless --apply.

The patch records exact before/after fields and original note/card identities.
It is not a text-cleaning heuristic and never touches a learner's collection.
"""
import argparse
import hashlib
import html
import json
import os
from pathlib import Path
import re
import sqlite3
import tempfile
import time
import zipfile


def media(value):
    return sorted(re.findall(r'''(?i)<(?:img|audio|video|source)\b[^>]*\bsrc=["']([^"']+)["']|\[sound:([^\]]+)\]''', value))


def plain(value):
    value = re.sub(r'(?s)<!--.*?-->', '', value)
    value = re.sub(r'(?si)<(?:style|script).*?>.*?</(?:style|script)>', '', value)
    return html.unescape(re.sub(r'(?s)<.*?>', '', value)).replace('\xa0', ' ')


def sort_field(value):
    value = re.sub(r'''(?i)<img[^>]+src=["']?([^"'>]+)["']?[^>]*>''', r' \1 ', value)
    return plain(value)


def digest_rows(db, query):
    return hashlib.sha256(json.dumps(db.execute(query).fetchall(), ensure_ascii=False, separators=(',', ':')).encode()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--patch', required=True, type=Path)
    parser.add_argument('--package', default='assets/catalog/bka-tus-complete.apkg', type=Path)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    review = json.loads(args.patch.read_text())
    assert review['schema'] == 'tusankim.catalog-editorial/v1'
    audited_courses = {
        'Farmakoloji': (669, 1748430717056), 'Biyokimya': (484, 1748430717053),
        'Mikrobiyoloji': (587, 1748430717054),
        'Patoloji': (609, 1748430717055), 'Anatomi': (381, 1748430717051),
        'Pediatri': (1169, 1748430717058), 'Dahiliye': (995, 1748430717057),
        'Deneme ve Soru': (745, 1748430717050), 'FHE': (510, 1748430717052),
        'Genel Cerrahi': (564, 1748430717059), 'Kadın Doğum': (524, 1748430717061),
        'Küçük Stajlar': (484, 1748430717060),
    }
    assert review['course'] in audited_courses, 'Only explicitly audited courses are authorized.'
    expected_count, deck_id = audited_courses[review['course']]
    scope = {n['noteId']: n for n in review['scope']}
    assert len(scope) == review['reviewedNotes'] == expected_count
    assert len({n['noteId'] for n in review['notes']}) == len(review['notes'])
    assert set(n['noteId'] for n in review['notes']).issubset(scope)
    with zipfile.ZipFile(args.package) as archive:
        assert archive.testzip() is None
        entries = archive.infolist()
        payload = {entry.filename: archive.read(entry.filename) for entry in entries}
    with tempfile.TemporaryDirectory() as temp:
        dbpath = Path(temp) / 'collection.anki21'
        dbpath.write_bytes(payload['collection.anki21'])
        db = sqlite3.connect(dbpath)
        db.create_collation('unicase', lambda a,b: (a.casefold() > b.casefold()) - (a.casefold() < b.casefold()))
        models = json.loads(db.execute('select models from col').fetchone()[0])
        actual_scope = {row[0] for row in db.execute('select distinct nid from cards where did=?', (deck_id,))}
        assert actual_scope == set(scope), 'Course scope differs from the audited deck.'
        for nid, note in scope.items():
            assert db.execute('select guid from notes where id=?', (nid,)).fetchone()[0] == note['guid']
            assert [row[0]+1 for row in db.execute('select ord from cards where nid=? order by ord', (nid,))] == note['ordinals']
        ids = ','.join(map(str, sorted(scope)))
        queries = {
            'cards': 'select * from cards order by id',
            'revlog': 'select * from revlog order by id',
            'graves': 'select * from graves order by oid,type',
            'collection': 'select * from col order by id',
            'noteIdentity': 'select id,guid,mid,usn,tags,flags,data from notes order by id',
            'otherCourses': f'select * from notes where id not in ({ids}) order by id',
        }
        def check_boundaries():
            for key, query in queries.items():
                assert digest_rows(db, query) == review['boundaries'][key], key
        check_boundaries()
        changed = 0
        now = int(time.time())
        for entry in review['notes']:
            nid = entry['noteId']
            guid, mid, flds = db.execute('select guid,mid,flds from notes where id=?', (nid,)).fetchone()
            assert guid == entry['guid'] == scope[nid]['guid'], (nid, 'GUID')
            model = models[str(mid)]
            names = [field['name'] for field in model['flds']]
            values = flds.split('\x1f')
            for name, update in entry['fields'].items():
                assert name in (('Text', 'Extra') if model['type'] == 1 else ('Ön', 'Geri')), name
                index = names.index(name)
                assert values[index] in (update['before'], update['after']), (nid, name, 'stale before')
                assert media(values[index]) == media(update['after']), (nid, name, 'media')
                values[index] = update['after']
            if model['type'] == 1:
                ords = sorted(int(n) for n in set(re.findall(r'\{\{c(\d+)::', values[names.index('Text')])))
                assert ords == scope[nid]['ordinals'], (nid, 'cloze ordinals')
            updated = '\x1f'.join(values)
            if updated != flds:
                changed += 1
                db.execute('update notes set flds=?,sfld=?,csum=?,mod=? where id=?',
                           (updated, sort_field(values[model['sortf']]),
                            int(hashlib.sha1(sort_field(values[0]).encode()).hexdigest()[:8], 16), now, nid))
        check_boundaries()
        assert db.execute('pragma integrity_check').fetchone()[0] == 'ok'
        if not args.apply:
            print(f'Dry run: {changed} notes; identities, media, scheduling and other courses preserved.')
            db.close()
            return
        db.commit()
        db.close()
        if not changed:
            print('Already applied; package not rewritten.')
            return
        payload['collection.anki21'] = dbpath.read_bytes()
        handle, temporary = tempfile.mkstemp(suffix='.apkg', dir=args.package.parent)
        os.close(handle)
        try:
            with zipfile.ZipFile(temporary, 'w') as archive:
                for entry in entries:
                    archive.writestr(entry, payload[entry.filename])
            with zipfile.ZipFile(temporary) as archive:
                assert archive.testzip() is None
            os.replace(temporary, args.package)
        finally:
            if os.path.exists(temporary):
                os.unlink(temporary)
        print(f'Applied {changed} notes to {args.package}; no cards or other courses changed.')


if __name__ == '__main__':
    main()
