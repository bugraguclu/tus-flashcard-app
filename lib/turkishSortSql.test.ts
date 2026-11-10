import initSqlJs from 'sql.js';
import { beforeAll, describe, expect, it } from 'vitest';
import { turkishSortKeySql } from './turkishSortSql';

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
beforeAll(async () => { SQL = await initSqlJs({ locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm' }); });

function sorted(words: string[], order: string): string[] {
    const db = new SQL.Database();
    try {
        db.run('CREATE TABLE w (v TEXT)');
        for (const word of words) db.run('INSERT INTO w (v) VALUES (?)', [word]);
        return db.exec(`SELECT v FROM w ORDER BY ${order}, rowid`)[0].values.map((row) => String(row[0]));
    } finally {
        db.close();
    }
}

describe('Turkish sort key', () => {
    const words = [
        'Zona', 'Çölyak', 'çocuk', 'Adrenalin', 'İnsülin', 'iskemi', 'Şok', 'Ödem', 'ödül', 'Ağrı', 'Anemi',
        'Isı kaybı', 'ıspanak', 'IŞIK refleksi', 'Ürik asit', 'uyku', 'czerny', 'Dalak', 'Gut', 'Ğ harfi', 'hız',
        'jel', 'kâr', 'kas', 'kaş', 'kat', 'sütur', 'şah', 'tiroit', '%50 ölüm dozu', '5-HT', 'ozon', 'öz',
    ];

    it('orders cards by the Turkish alphabet, capitals with their small letters', () => {
        const turkish = new Intl.Collator('tr', { sensitivity: 'base' });
        expect(sorted(words, turkishSortKeySql('v'))).toEqual([...words].sort(turkish.compare));
    });

    it('shows what the plain NOCASE order did with the same cards', () => {
        const plain = sorted(words, 'v COLLATE NOCASE');
        // Every card that starts with a Turkish letter trailed the whole Latin alphabet.
        expect(plain.indexOf('Çölyak')).toBeGreaterThan(plain.indexOf('Zona'));
        const key = sorted(words, turkishSortKeySql('v'));
        expect(key.indexOf('Çölyak')).toBeLessThan(key.indexOf('Dalak'));
        expect(key.indexOf('ıspanak')).toBeLessThan(key.indexOf('iskemi'));
        expect(key.indexOf('czerny')).toBeLessThan(key.indexOf('çocuk'));
    });

    it('reverses as one key for a descending sort', () => {
        const ascending = sorted(words, turkishSortKeySql('v'));
        expect(sorted(words, `${turkishSortKeySql('v')} DESC`)).toEqual([...ascending].reverse());
    });
});
