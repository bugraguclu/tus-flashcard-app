import { describe, expect, it } from 'vitest';
import { hardenAndValidateAnkiReader, type SqliteReader } from './importApkg';

function reader(overrides: Record<string, unknown> = {}): SqliteReader {
    return {
        execSync: () => undefined,
        getFirstSync: ((sql: string) => {
            if (sql.includes('quick_check')) return { quick_check: 'ok' };
            if (sql.includes('MAX(length(flds))')) return { maxFields: 100, maxTags: 20 };
            if (sql.includes('COUNT(*)')) return { count: 10 };
            return null;
        }) as SqliteReader['getFirstSync'],
        getAllSync: ((sql: string) => {
            if (sql.includes('sqlite_master')) {
                return [
                    { name: 'notes', type: 'table' },
                    { name: 'cards', type: 'table' },
                    { name: 'revlog', type: 'table' },
                ];
            }
            return [];
        }) as SqliteReader['getAllSync'],
        ...overrides,
    };
}

describe('Anki SQLite import boundary', () => {
    it('enables defensive/read-only pragmas and accepts a healthy bounded collection', () => {
        const pragmas: string[] = [];
        hardenAndValidateAnkiReader(reader({ execSync: (sql: string) => pragmas.push(sql) }));
        expect(pragmas.join('\n')).toContain('trusted_schema = OFF');
        expect(pragmas.join('\n')).toContain('query_only = ON');
    });

    it('rejects integrity failures, views masquerading as core tables, and excessive rows', () => {
        expect(() => hardenAndValidateAnkiReader(reader({
            getFirstSync: (sql: string) => sql.includes('quick_check') ? { quick_check: 'corrupt' } : { count: 1 },
        }))).toThrow(/bütünlük/i);

        expect(() => hardenAndValidateAnkiReader(reader({
            getAllSync: () => [{ name: 'notes', type: 'view' }, { name: 'cards', type: 'table' }],
        }))).toThrow(/tablo yapısı/i);

        expect(() => hardenAndValidateAnkiReader(reader({
            getFirstSync: (sql: string) => {
                if (sql.includes('quick_check')) return { quick_check: 'ok' };
                if (sql.includes('FROM notes')) return { count: 1_000_001 };
                return { count: 1 };
            },
        }))).toThrow(/çok fazla kayıt/i);
    });
});
