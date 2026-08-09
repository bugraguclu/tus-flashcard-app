// Regression test: an app update that adds a new built-in note type (e.g. Type Answer /
// Reversed, ids 5-6) must reach installs whose note_types table was already seeded by an
// earlier version — otherwise every study/browser query, which INNER JOINs note_types, would
// silently drop notes of the new type.

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import initSqlJs from 'sql.js';
import { createAppDb, type SyncDb } from '../test/sqljsHarness';

const dbHolder = vi.hoisted(() => ({ db: null as any }));

vi.mock('./db', () => ({
    getDB: () => dbHolder.db,
    buildFtsPrefixQuery: () => '',
}));

import { ensureBuiltinNoteTypesSeeded } from './ankiInit';
import { BUILTIN_NOTE_TYPES } from './models';

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
let db: SyncDb;

beforeAll(async () => {
    SQL = await initSqlJs({ locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm' });
});

beforeEach(() => {
    db = createAppDb(SQL);
    dbHolder.db = db;
});

afterEach(() => db.close());

describe('ensureBuiltinNoteTypesSeeded', () => {
    it('seeds every built-in note type into an empty table', () => {
        ensureBuiltinNoteTypesSeeded();

        const rows = db.getAllSync<{ id: number }>('SELECT id FROM note_types ORDER BY id');
        expect(rows.map((r) => r.id)).toEqual(BUILTIN_NOTE_TYPES.map((nt) => nt.id));
    });

    it('adds only the newly-introduced types to a table already seeded by an older app version', () => {
        // Simulate an install that ran initAnkiData() before types 5/6 existed.
        for (const nt of BUILTIN_NOTE_TYPES.filter((n) => n.id <= 4)) {
            db.runSync(
                'INSERT INTO note_types (id, name, data, updated_at, usn, tombstone) VALUES (?, ?, ?, ?, ?, ?)',
                nt.id, nt.name, JSON.stringify(nt), 0, -1, 0,
            );
        }

        ensureBuiltinNoteTypesSeeded();

        const rows = db.getAllSync<{ id: number }>('SELECT id FROM note_types ORDER BY id');
        expect(rows.map((r) => r.id)).toEqual(BUILTIN_NOTE_TYPES.map((nt) => nt.id));
    });

    it('never overwrites a user-edited built-in type (e.g. a renamed/restyled note type)', () => {
        const customized = { ...BUILTIN_NOTE_TYPES.find((nt) => nt.id === 1)!, name: 'Kullanıcı Adı Verdi' };
        db.runSync(
            'INSERT INTO note_types (id, name, data, updated_at, usn, tombstone) VALUES (?, ?, ?, ?, ?, ?)',
            customized.id, customized.name, JSON.stringify(customized), 0, -1, 0,
        );

        ensureBuiltinNoteTypesSeeded();

        const row = db.getFirstSync<{ data: string }>('SELECT data FROM note_types WHERE id = ?', 1);
        expect(JSON.parse(row!.data).name).toBe('Kullanıcı Adı Verdi');
    });
});

describe('healBuiltinNoteTypeTemplates', () => {
    const LEGACY_FOOTER = '{{#Kaynak}}<div class="source">📚 {{Kaynak}}</div>{{/Kaynak}}';

    it('strips the legacy Kaynak footer from a stored TUS template, keeping other user edits', () => {
        // An install seeded before the footer was removed, with a user-customized name and css.
        const base = BUILTIN_NOTE_TYPES.find((nt) => nt.id === 4)!;
        const legacy = {
            ...base,
            name: 'Benim Kartım',
            css: '.card { color: red; }',
            templates: [{
                ...base.templates[0],
                afmt: `${base.templates[0].afmt}${LEGACY_FOOTER}`,
            }],
        };
        db.runSync(
            'INSERT INTO note_types (id, name, data, updated_at, usn, tombstone) VALUES (?, ?, ?, ?, ?, ?)',
            legacy.id, legacy.name, JSON.stringify(legacy), 0, -1, 0,
        );

        ensureBuiltinNoteTypesSeeded();

        const row = db.getFirstSync<{ data: string }>('SELECT data FROM note_types WHERE id = ?', 4);
        const healed = JSON.parse(row!.data);
        expect(healed.templates[0].afmt).not.toContain('Kaynak');
        expect(healed.templates[0].afmt).toContain('{{Cevap}}');
        expect(healed.name).toBe('Benim Kartım');
        expect(healed.css).toBe('.card { color: red; }');
    });

    it('leaves an already-clean template untouched', () => {
        ensureBuiltinNoteTypesSeeded();
        const before = db.getFirstSync<{ data: string }>('SELECT data FROM note_types WHERE id = ?', 4)!.data;

        ensureBuiltinNoteTypesSeeded();
        const after = db.getFirstSync<{ data: string }>('SELECT data FROM note_types WHERE id = ?', 4)!.data;
        expect(after).toBe(before);
    });
});

describe('healSeededDeckDescriptions', () => {
    const seedPythonDeck = (description: string) => {
        const deck = { id: 1, name: 'Python', configId: 1, mod: 0, usn: 0, description, collapsed: false, isFiltered: false };
        db.runSync(
            'INSERT INTO decks (id, name, data, updated_at, usn, tombstone) VALUES (?, ?, ?, ?, ?, ?)',
            deck.id, deck.name, JSON.stringify(deck), 0, -1, 0,
        );
    };

    it('clears the seeded placeholder description from the Python deck', () => {
        seedPythonDeck('Python ana deste');

        ensureBuiltinNoteTypesSeeded();

        const row = db.getFirstSync<{ data: string }>('SELECT data FROM decks WHERE name = ?', 'Python');
        expect(JSON.parse(row!.data).description).toBe('');
    });

    it('preserves a real description the user later wrote', () => {
        seedPythonDeck('Benim notlarım');

        ensureBuiltinNoteTypesSeeded();

        const row = db.getFirstSync<{ data: string }>('SELECT data FROM decks WHERE name = ?', 'Python');
        expect(JSON.parse(row!.data).description).toBe('Benim notlarım');
    });
});
