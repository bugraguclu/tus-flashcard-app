// Adding remembers the selected note type: https://docs.ankiweb.net/editing.html
import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => new Map<string, string>());
vi.mock('./dbSettings', () => ({ getDbSetting: (key: string) => state.get(key) ?? null, setDbSetting: (key: string, value: string) => state.set(key, value) }));
import { getEditorNoteType, rememberEditorNoteType } from './editorNoteTypeMemory';
beforeEach(() => state.clear());
describe('last successful Add note type', () => {
 it('prefers the destination deck last type, otherwise the global last type', () => {
  rememberEditorNoteType(10, 3);
  rememberEditorNoteType(11, 7);
  expect(getEditorNoteType(10, [1,3,7])).toBe(3);
  expect(getEditorNoteType(11, [1,3,7])).toBe(7);
  expect(getEditorNoteType(12, [1,3,7])).toBe(7);
 });
 it('falls back when a remembered type was deleted or is unavailable', () => {
  rememberEditorNoteType(10, 3);
  expect(getEditorNoteType(10, [1,7])).toBe(1);
 });
});

it('restores both remembered values when a new-note durable save is rolled back', () => {
 rememberEditorNoteType(10, 1);
 rememberEditorNoteType(11, 3);
 const rollback = rememberEditorNoteType(10, 7);
 rollback();
 expect(getEditorNoteType(10, [1,3,7])).toBe(1);
 expect(getEditorNoteType(12, [1,3,7])).toBe(3);
});
