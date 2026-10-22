import { getDbSetting, setDbSetting } from './dbSettings';
const GLOBAL = 'editor_last_note_type_v1';
const key = (deckId: number) => `${GLOBAL}:deck:${deckId}`;
export function getEditorNoteType(deckId: number | null, availableIds: number[]): number {
    const deckType = deckId === null ? NaN : Number(getDbSetting(key(deckId)));
    const globalType = Number(getDbSetting(GLOBAL));
    if (availableIds.includes(deckType)) return deckType;
    if (availableIds.includes(globalType)) return globalType;
    return availableIds.includes(1) ? 1 : availableIds[0] ?? 1;
}
/** Called inside the successful Add mutation, before its durable flush. */
export function rememberEditorNoteType(deckId: number, noteTypeId: number): void {
    setDbSetting(key(deckId), String(noteTypeId));
    setDbSetting(GLOBAL, String(noteTypeId));
}
