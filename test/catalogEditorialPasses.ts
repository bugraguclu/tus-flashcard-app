import { readFileSync } from 'node:fs';

/** Every editorial pass applied to the bundled catalog, in the order it was applied. */
export const EDITORIAL_COURSES = [
    'farmakoloji', 'biyokimya', 'mikrobiyoloji', 'patoloji', 'anatomi',
    'pediatri', 'dahiliye', 'deneme-ve-soru', 'fhe', 'genel-cerrahi', 'kadin-dogum', 'kucuk-stajlar',
] as const;

export type EditorialCourse = typeof EDITORIAL_COURSES[number];
type NoteRow = (string | number | null)[];

export function readEditorial<T>(course: EditorialCourse): T {
    return JSON.parse(readFileSync(`docs/catalog-corrections/${course}-editorial.json`, 'utf8')) as T;
}

/**
 * Later passes are authorized. To check an earlier pass's recorded boundary, rewind the note rows
 * every later pass changed to how they were before that later pass.
 */
export function rowsBeforeLaterPasses(course: EditorialCourse): Map<number, NoteRow> {
    const later = EDITORIAL_COURSES.slice(EDITORIAL_COURSES.indexOf(course) + 1);
    return new Map(later.flatMap(name => readEditorial<{ noteRowsBefore: NoteRow[] }>(name)
        .noteRowsBefore.map(row => [Number(row[0]), row] as const)));
}
