import { describe, expect, it } from 'vitest';
import {
    IMPORT_LOG_STATUSES,
    ImportLogBuilder,
    importLogFailureCount,
    importLogFromCounts,
    importLogWrittenCount,
    MAX_LOGGED_ROWS_PER_STATUS,
} from './importLog';

describe('ImportLogBuilder', () => {
    it('counts every recorded row and keeps it browsable', () => {
        const builder = new ImportLogBuilder();
        builder.record('added', ['Front', 'Back'], 7);
        builder.record('duplicate', ['Front', 'Back'], 7);
        builder.record('added', ['Other', 'Row']);

        const log = builder.result();
        expect(log.found).toBe(3);
        expect(log.counts.added).toBe(2);
        expect(log.counts.duplicate).toBe(1);
        expect(log.truncated).toBe(false);
        expect(log.entries).toHaveLength(3);
        expect(log.entries[0]).toEqual({ status: 'added', fields: ['Front', 'Back'], noteId: 7 });
        expect(log.entries[2].noteId).toBeUndefined();
    });

    it('keeps counts exact but bounds the retained rows per status', () => {
        const builder = new ImportLogBuilder();
        const total = MAX_LOGGED_ROWS_PER_STATUS + 25;
        for (let i = 0; i < total; i++) builder.record('added', [`Row ${i}`]);

        const log = builder.result();
        expect(log.found).toBe(total);
        expect(log.counts.added).toBe(total);
        expect(log.entries).toHaveLength(MAX_LOGGED_ROWS_PER_STATUS);
        expect(log.truncated).toBe(true);
    });

    it('truncates a huge field and drops surplus fields so one note cannot bloat the log', () => {
        const builder = new ImportLogBuilder();
        builder.record('added', ['x'.repeat(5000), 'b', 'c', 'd', 'e', 'f', 'g', 'h']);

        const entry = builder.result().entries[0];
        expect(entry.fields).toHaveLength(6);
        expect(entry.fields[0].length).toBeLessThan(250);
        expect(entry.fields[0].endsWith('…')).toBe(true);
    });

    it('covers every status the log screen can render', () => {
        const builder = new ImportLogBuilder();
        for (const status of IMPORT_LOG_STATUSES) builder.record(status, ['row']);

        const log = builder.result();
        expect(log.found).toBe(IMPORT_LOG_STATUSES.length);
        for (const status of IMPORT_LOG_STATUSES) expect(log.counts[status]).toBe(1);
    });
});

describe('import log aggregates', () => {
    it('reports only the three hard failures as "could not be imported"', () => {
        const log = importLogFromCounts(
            { missingNotetype: 2, missingDeck: 1, emptyFirstField: 3, duplicate: 9, conflicting: 4 },
            19,
        );
        expect(importLogFailureCount(log.counts)).toBe(6);
    });

    it('counts written notes as new plus updated', () => {
        const log = importLogFromCounts({ added: 5, updated: 2, firstFieldMatch: 3, duplicate: 8 }, 18);
        expect(importLogWrittenCount(log.counts)).toBe(7);
    });

    it('fills the unnamed statuses with zero so a screen can read them all', () => {
        const log = importLogFromCounts({ added: 1 }, 1);
        for (const status of IMPORT_LOG_STATUSES) expect(typeof log.counts[status]).toBe('number');
        expect(log.entries).toEqual([]);
    });
});
