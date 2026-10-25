// Regression coverage for independently derived note/import/export safety fixes.
// Behavior reference: ankitects/anki @ 8d6e0a0f462f016889896ceaaab1be2aba182588.
import { readFileSync } from 'node:fs';
import initSqlJs from 'sql.js';
import JSZip from 'jszip';
import { beforeAll, beforeEach, afterEach, expect, it, vi } from 'vitest';
import { Platform } from 'react-native';
import { createAppDb } from '../test/sqljsHarness';
const h = vi.hoisted(() => ({ db: null as any, SQL: null as any, media: new Map<string, Uint8Array>() }));
vi.mock('./db', () => ({
  getDB: () => h.db, buildFtsPrefixQuery: () => '', dbIndexAllCards: () => {},
  dbUpsertFtsCard: () => {}, dbDeleteFtsCard: () => {}, dbSearchCards: () => [],
}));
vi.mock('./mediaStore', async () => ({
  sanitizeMediaFilename: (await import('./mediaFilename')).sanitizeMediaFilename,
  saveMediaBytes: async (name: string, bytes: Uint8Array) => { h.media.set(name, new Uint8Array(bytes)); },
  readMediaBytes: async (name: string) => h.media.get(name) ?? null,
}));
vi.mock('./webDb', () => ({ loadSqlJs: async () => h.SQL }));
import {
  createNote, getNote, getAllNotes, getCardsForNote, saveNote, saveAnkiCard,
  saveNoteType, getAllAnkiCards,
} from './noteManager';
import { saveDeck, saveDeckConfig, renameDeck, getDeck, getAllDecks } from './deckManager';
import { DEFAULT_DECK_CONFIG, checksumField, type NoteType } from './models';
import { importDelimitedNotes, importRows, previewDelimitedNotes } from './importNotes';
import { buildAnkiExport } from './exportAnkiPackage';
import { importApkg } from './importApkg';
import { localMediaFilename, rewriteMediaReferences } from './mediaAttachment';
import type { Note, AnkiCard } from './models';
const noteType: NoteType = { id: 4, name: 'Audit', kind: 'standard', mod: 0, css: '', sortFieldIdx: 0,
  fields: ['Front', 'Back', 'Extra'].map((name, ord) => ({ name, ord, sticky: false, rtl: false })),
  templates: [{ name: 'Forward', ord: 0, qfmt: '{{Front}}', afmt: '{{Back}}' }] };
function makeNote(id: number, tags: string[], fields: string[]): Note {
  return { id, guid: `guid-${id}`, noteTypeId: 4, mod: 0, usn: -1, tags, fields, sfld: fields[0], csum: 0, flags: 0 };
}
function makeCard(id: number, noteId: number, deckId: number): AnkiCard {
  return { id, noteId, deckId, ord: 0, mod: 0, usn: -1, type: 0, queue: 0, due: id,
    ivl: 0, factor: 0, reps: 0, lapses: 0, left: 0, odue: 0, odid: 0, flags: 0, lastReview: 0 };
}

beforeAll(async () => { h.SQL = await initSqlJs({ locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm' }); });
beforeEach(() => {
  h.db = createAppDb(h.SQL); h.media.clear(); Platform.OS = 'web';
  saveDeckConfig({ ...DEFAULT_DECK_CONFIG });
  saveDeck({ id: 1, name: 'Audit', configId: 1, mod: 0, usn: -1, description: '', collapsed: false, isFiltered: false });
  saveNoteType(noteType);
});
afterEach(() => { vi.restoreAllMocks(); h.db.close(); });

function seed(id = 10, fields = ['Question', 'Answer', '']) {
  const note = { ...makeNote(id, [], fields), csum: checksumField(fields[0]) };
  const card = makeCard(id, id, 1);
  saveNote(note); saveAnkiCard(card); return { note, card };
}
function openReader(bytes: Uint8Array) {
  const raw = new h.SQL.Database(bytes);
  const all = (sql: string, ...params: any[]) => {
    const result = raw.exec(sql, params.length ? params : undefined)[0];
    return result ? result.values.map((values: any[]) => Object.fromEntries(result.columns.map((col: string, i: number) => [col, values[i]]))) : [];
  };
  return { getAllSync: all, getFirstSync: (sql: string, ...params: any[]) => all(sql, ...params)[0] ?? null,
    execSync: (sql: string) => raw.exec(sql), close: () => raw.close() } as any;
}

it('N1 creating a note must not replace an existing imported note with the same timestamp id', () => {
  const stamp = 2_100_000_000_000;
  const { note, card } = seed(stamp, ['Existing imported question', 'My old answer', '']);
  vi.spyOn(Date, 'now').mockReturnValue(stamp);
  const created = createNote(noteType, ['Brand new question', 'New answer', ''], 1);
  expect.soft(created.note.id).not.toBe(note.id);
  expect.soft(getNote(note.id)).toEqual(note);
  expect(getCardsForNote(note.id).find(c => c.id === card.id)).toEqual(card);
  expect(getAllNotes()).toHaveLength(2);
});

it('N2 rename then APKG export retains the renamed deck instead of returning the stale original archive', async () => {
  const original = new Uint8Array(readFileSync('test/fixtures/anki-26.05-legacy.apkg'));
  await importApkg(original, { subject: 'audit', fileName: 'original.apkg', openReader: async bytes => openReader(bytes) });
  const deckId = getAllAnkiCards()[0].deckId;
  renameDeck(deckId, 'New user deck name');
  const artifact = await buildAnkiExport('apkg', undefined, true);
  const zip = await JSZip.loadAsync(artifact.bytes!);
  const reader = openReader(await zip.file('collection.anki21')!.async('uint8array'));
  const exportedDeckNames = Object.values(JSON.parse(reader.getFirstSync('SELECT decks FROM col').decks)).map((deck: any) => deck.name);
  reader.close();
  expect(exportedDeckNames).toContain('New user deck name');
});

it('N3 CSV update changes every matching same-type note, not just the first duplicate', () => {
  seed(10, ['Question', 'Old answer A', '']); seed(20, ['Question', 'Old answer B', '']);
  importDelimitedNotes('Question\tCorrect answer\t', { noteType, deckId: 1, delimiter: '\t', isHtml: true });
  const answers = getAllNotes().map(note => note.fields[1]);
  expect(answers).toEqual(['Correct answer', 'Correct answer']);
});

it('N4 CSV update generates a newly enabled optional-reverse card', () => {
  const optionalReverse: NoteType = {
    ...noteType, id: 40, name: 'Audit optional reverse',
    fields: [{ name: 'Front', ord: 0, sticky: false, rtl: false },
      { name: 'Back', ord: 1, sticky: false, rtl: false }, { name: 'Add Reverse', ord: 2, sticky: false, rtl: false }],
    templates: [{ name: 'Forward', ord: 0, qfmt: '{{Front}}', afmt: '{{Back}}' },
      { name: 'Reverse', ord: 1, qfmt: '{{#Add Reverse}}{{Back}}{{/Add Reverse}}', afmt: '{{Front}}' }],
  };
  saveNoteType(optionalReverse);
  const { note, cards } = createNote(optionalReverse, ['Question', 'Answer', ''], 1);
  expect(cards).toHaveLength(1);
  importDelimitedNotes('Question\tAnswer\tyes', { noteType: optionalReverse, deckId: 1, delimiter: '\t', isHtml: true });
  expect(getNote(note.id)?.fields[2]).toBe('yes');
  expect(getCardsForNote(note.id).map(card => card.ord).sort()).toEqual([0, 1]);
});

it('N5 APKG media export includes a filename written with a valid named HTML entity', async () => {
  seed(10, ['<img src="caf&eacute;.png">', 'Answer', '']);
  h.media.set('café.png', new Uint8Array([137, 80, 78, 71]));
  const artifact = await buildAnkiExport('apkg', undefined, true);
  const zip = await JSZip.loadAsync(artifact.bytes!);
  const manifest = JSON.parse(await zip.file('media')!.async('string'));
  expect(Object.values(manifest)).toContain('café.png');
});

it.each([false, true])('N1 failed card creation rolls back the new note (outer transaction: %s)', (outerTransaction) => {
  seed();
  const before = getAllNotes();
  const run = h.db.runSync.bind(h.db);
  vi.spyOn(h.db, 'runSync').mockImplementation((sql: any, ...params: any[]) => {
    if (/INSERT.*INTO anki_cards/.test(sql)) throw new Error('card write failed');
    return run(sql, ...params);
  });
  if (outerTransaction) h.db.execSync('BEGIN');
  expect(() => createNote(noteType, ['New question', 'New answer', ''], 1)).toThrow('card write failed');
  expect(getAllNotes()).toEqual(before);
  if (outerTransaction) h.db.execSync('COMMIT');
  expect(getAllAnkiCards()).toHaveLength(1);
});

it.each(['notetype', 'notetypeAndDeck'] as const)('N3 updates all matches within %s and reports one row even when the first match is identical', (matchScope) => {
  seed(10, ['Question', 'Correct', '']);
  seed(20, ['Question', 'Old', '']);
  const third = seed(30, ['Question', 'Other deck', '']);
  saveDeck({ ...getDeck(1)!, id: 2, name: 'Other' });
  saveAnkiCard({ ...third.card, deckId: 2 });
  const otherType = { ...noteType, id: 50 };
  saveNoteType(otherType);
  const differentType = createNote(otherType, ['Question', 'Different type', ''], 1).note;
  const text = 'Question\tCorrect\t\nQuestion\tCorrect\t';
  const options = { noteType, deckId: 1, delimiter: '\t', isHtml: true, matchScope };
  const before = getAllNotes();
  const preview = previewDelimitedNotes(text, options);
  expect(getAllNotes()).toEqual(before);
  const result = importDelimitedNotes(text, options);
  expect(result).toMatchObject({ updated: 1, duplicates: 1 });
  expect(preview.log.counts).toEqual(result.log.counts);
  expect(result.log.found).toBe(2);
  expect(getNote(20)?.fields[1]).toBe('Correct');
  expect(getNote(30)?.fields[1]).toBe(matchScope === 'notetype' ? 'Correct' : 'Other deck');
  expect(getNote(differentType.id)?.fields[1]).toBe('Different type');
});

it('N3 GUID update remains single-note and preserve mode keeps all duplicates', () => {
  const a = seed(10, ['Question', 'A', '']);
  seed(20, ['Question', 'B', '']);
  importRows([['Question', 'Changed', '']], { noteType, deckId: 1, rowGuids: [a.note.guid] });
  expect(getNote(10)?.fields[1]).toBe('Changed');
  expect(getNote(20)?.fields[1]).toBe('B');
  const before = getAllNotes();
  importRows([['Question', 'Ignored', '']], { noteType, deckId: 1, duplicateResolution: 'preserve' });
  expect(getAllNotes()).toEqual(before);
});

function reverseType(): NoteType {
  return { ...noteType, id: 40, templates: [...noteType.templates,
    { name: 'Reverse', ord: 1, qfmt: '{{#Extra}}{{Back}}{{/Extra}}', afmt: '{{Front}}' }] };
}

it('N4 fills missing cards on an identical import and preserves all existing card scheduling', () => {
  const type = reverseType();
  saveNoteType(type);
  const { note, cards } = createNote(type, ['Question', 'Answer', 'yes'], 1);
  const existing = { ...cards[0], type: 2 as const, queue: 2 as const, ivl: 45, reps: 9, due: 12345, deckId: 2 };
  saveDeck({ ...getDeck(1)!, id: 2, name: 'Other' });
  saveAnkiCard(existing);
  h.db.runSync('DELETE FROM anki_cards WHERE id = ?', cards[1].id);
  h.db.runSync('INSERT INTO revlog VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', 100, existing.id, -1, 3, 45, 20, 2500, 1000, 1);
  const beforeLog = h.db.getAllSync('SELECT * FROM revlog');
  const result = importRows([note.fields], { noteType: type, deckId: 1 });
  expect(result).toMatchObject({ updated: 0, duplicates: 1 });
  expect(getCardsForNote(note.id)).toHaveLength(2);
  expect(getCardsForNote(note.id).find(c => c.id === existing.id)).toEqual(existing);
  importRows([['Question', 'Answer', '']], { noteType: type, deckId: 1 });
  expect(getCardsForNote(note.id)).toHaveLength(2);
  expect(h.db.getAllSync('SELECT * FROM revlog')).toEqual(beforeLog);
});

it('N4 GUID update generates new cloze ordinals without replacing the original card', () => {
  const type: NoteType = { ...noteType, id: 41, kind: 'cloze', templates: [
    { name: 'Cloze', ord: 0, qfmt: '{{cloze:Front}}', afmt: '{{cloze:Front}}' }] };
  saveNoteType(type);
  const { note, cards } = createNote(type, ['{{c1::A}}', '', ''], 1);
  importRows([['{{c1::A}} and {{c2::B}}', '', '']], { noteType: type, deckId: 1, rowGuids: [note.guid] });
  const updated = getCardsForNote(note.id);
  expect(updated.map(c => c.ord).sort()).toEqual([0, 1]);
  expect(updated.find(c => c.id === cards[0].id)).toEqual(cards[0]);
});

it('N4 rolls back every duplicate update when generating a missing card fails', () => {
  const type = reverseType();
  saveNoteType(type);
  createNote(type, ['Question', 'First', ''], 1);
  createNote(type, ['Question', 'Second', ''], 1);
  const beforeNotes = getAllNotes();
  const beforeCards = getAllAnkiCards();
  const run = h.db.runSync.bind(h.db);
  let inserts = 0;
  vi.spyOn(h.db, 'runSync').mockImplementation((sql: any, ...params: any[]) => {
    if (/INSERT.*INTO anki_cards/.test(sql) && ++inserts === 2) throw new Error('second card failed');
    return run(sql, ...params);
  });
  expect(() => importRows([['Question', 'Changed', 'yes']], { noteType: type, deckId: 1 })).toThrow('second card failed');
  expect(getAllNotes()).toEqual(beforeNotes);
  expect(getAllAnkiCards()).toEqual(beforeCards);
});

it.each(['caf&eacute;.png', 'caf&#233;.png', 'caf&#xE9;.png', 'café.png'])('N5 resolves and rewrites the same media file from %s', (reference) => {
  expect(localMediaFilename(reference)).toBe('café.png');
  expect(rewriteMediaReferences(`<img src="${reference}">`, { 'café.png': 'renamed.png' }))
    .toBe('<img src="renamed.png">');
});

it('N5 decodes named entities once and malformed numeric references cannot crash export scanning', () => {
  expect(localMediaFilename('&ccedil;&ouml;.png')).toBe('çö.png');
  expect(localMediaFilename('a&amp;b.png')).toBe('a&b.png');
  expect(localMediaFilename('caf&amp;eacute;.png')).toBe('caf&eacute;.png');
  expect(() => localMediaFilename('bad&#99999999;.png')).not.toThrow();
});

it('N2 parent rename invalidates child source packages for a subtree-scoped export', async () => {
  const original = new Uint8Array(readFileSync('test/fixtures/anki-26.05-legacy.apkg'));
  await importApkg(original, { subject: 'audit', fileName: 'original.apkg', openReader: async bytes => openReader(bytes) });
  const parent = getAllDecks().find(deck => deck.name === 'TUS Örnek')!;
  renameDeck(parent.id, 'Renamed parent');
  const artifact = await buildAnkiExport('apkg', 'Renamed parent', true);
  const zip = await JSZip.loadAsync(artifact.bytes!);
  const reader = openReader(await zip.file('collection.anki21')!.async('uint8array'));
  const names = Object.values(JSON.parse(reader.getFirstSync('SELECT decks FROM col').decks)).map((deck: any) => deck.name);
  reader.close();
  expect(names).toContain('Renamed parent');
  expect(names).toContain('Renamed parent::Kardiyoloji');
  expect(names.some(name => name.startsWith('TUS Örnek'))).toBe(false);
});

it('N2 failed subtree rename rolls back names and original-package eligibility together', async () => {
  const original = new Uint8Array(readFileSync('test/fixtures/anki-26.05-legacy.apkg'));
  await importApkg(original, { subject: 'audit', fileName: 'original.apkg', openReader: async bytes => openReader(bytes) });
  const beforeDecks = getAllDecks();
  const parent = beforeDecks.find(deck => deck.name === 'TUS Örnek')!;
  const run = h.db.runSync.bind(h.db);
  let writes = 0;
  vi.spyOn(h.db, 'runSync').mockImplementation((sql: any, ...params: any[]) => {
    if (sql.includes('UPDATE decks') && ++writes === 2) throw new Error('rename failed');
    return run(sql, ...params);
  });
  expect(() => renameDeck(parent.id, 'Renamed')).toThrow('rename failed');
  expect(getAllDecks()).toEqual(beforeDecks);
  const artifact = await buildAnkiExport('apkg', undefined, true);
  expect(Buffer.from(artifact.bytes!).equals(Buffer.from(original))).toBe(true);
});

it('N4 generated catalog siblings retain ownership and cannot be created by a locked import', () => {
  const type = reverseType();
  saveNoteType(type);
  const { note, cards } = createNote(type, ['Question', 'Answer', 'yes'], 1);
  const owned = { ...note, catalogPack: 'bka-tus' };
  h.db.runSync('UPDATE notes SET data = ? WHERE id = ?', JSON.stringify(owned), note.id);
  h.db.runSync('DELETE FROM anki_cards WHERE id = ?', cards[1].id);
  expect(() => importRows([note.fields], { noteType: type, deckId: 2 })).toThrow(/satın alma/);
  expect(getCardsForNote(note.id)).toHaveLength(1);
  h.db.runSync('INSERT INTO settings (key, value) VALUES (?, ?)', 'bka_tus_catalog_installed_v5', 'full');
  importRows([note.fields], { noteType: type, deckId: 2 });
  expect(getCardsForNote(note.id).find(c => c.ord === 1)).toMatchObject({ catalogPack: 'bka-tus', deckId: 1 });
});
