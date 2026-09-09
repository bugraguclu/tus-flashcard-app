#!/usr/bin/env node
/**
 * Reads the per-install mark out of a leaked copy of the paid catalog.
 *
 * Every catalog install stamps an invisible digest of the store account into a sampled share of
 * its notes (see `lib/catalogWatermark.ts`). This is the other half: point it at whatever turned
 * up — a collection file pulled from a device backup, an `.apkg` posted to a study group, a CSV,
 * a wall of text pasted into a chat — and it reports the marks it finds and, given the customer
 * list, whose they are.
 *
 * Deliberately dependency-free and plain JavaScript. A forensic tool is used at the worst
 * possible moment, often long after the build environment that produced it stopped working, so
 * it has to run on a bare Node with nothing installed. `jszip` is used only when the input turns
 * out to be a zip, and its absence degrades to a clear message rather than a stack trace.
 *
 *   node scripts/trace-catalog-leak.mjs <leaked-file> [--accounts customers.txt]
 *
 * `--accounts` takes one store account id per line — the App User ID column of a RevenueCat
 * customer export. Without it the marks are still reported, and can be matched later.
 */

import { readFileSync } from 'node:fs';

const BIT_ZERO = '​';
const BIT_ONE = '‌';
const MARK_FENCE = '⁠';
const INSTALL_MARK_LENGTH = 12;
const MARK_RE = new RegExp(`${MARK_FENCE}([${BIT_ZERO}${BIT_ONE}]+)${MARK_FENCE}`, 'g');

/**
 * Must stay identical to `installMarkFromAccountId` in `lib/catalogWatermark.ts`.
 * `lib/catalogWatermark.test.ts` fails if the two ever disagree.
 */
export function installMarkFromAccountId(accountId) {
    const input = typeof accountId === 'string' ? accountId.trim() : '';
    if (!input) return '';
    let high = 0x811c9dc5;
    let low = 0x01000193;
    for (let index = 0; index < input.length; index++) {
        const code = input.charCodeAt(index);
        high = Math.imul(high ^ code, 0x01000193) >>> 0;
        low = Math.imul(low ^ (code + index), 0x85ebca6b) >>> 0;
    }
    const first = (high >>> 8).toString(16).padStart(6, '0');
    const second = (low >>> 8).toString(16).padStart(6, '0');
    return `${first}${second}`.slice(0, INSTALL_MARK_LENGTH);
}

/** Must stay identical to `decodeInstallMarks` in `lib/catalogWatermark.ts`. */
export function decodeInstallMarks(text) {
    if (typeof text !== 'string' || !text) return [];
    const found = [];
    const seen = new Set();
    MARK_RE.lastIndex = 0;
    let match;
    while ((match = MARK_RE.exec(text)) !== null) {
        const bits = match[1];
        if (bits.length !== INSTALL_MARK_LENGTH * 4) continue;
        let mark = '';
        for (let index = 0; index < bits.length; index += 4) {
            let nibble = 0;
            for (let offset = 0; offset < 4; offset++) {
                nibble = (nibble << 1) | (bits[index + offset] === BIT_ONE ? 1 : 0);
            }
            mark += nibble.toString(16);
        }
        if (mark.length !== INSTALL_MARK_LENGTH || !/^[0-9a-f]+$/.test(mark) || seen.has(mark)) continue;
        seen.add(mark);
        found.push(mark);
    }
    return found;
}

const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];

function looksLikeZip(bytes) {
    return bytes.length >= 4 && ZIP_MAGIC.every((value, index) => bytes[index] === value);
}

/**
 * Every mark in a buffer.
 *
 * The buffer is decoded as UTF-8 whatever it really is. A SQLite file or an Anki package is
 * mostly binary, and the invalid runs simply become replacement characters — but the text a
 * marked note is stored as decodes exactly, which is all this needs. That is what lets one code
 * path read a database, a CSV and a chat log without knowing which it was handed.
 */
function marksInBuffer(bytes) {
    return decodeInstallMarks(Buffer.from(bytes).toString('utf8'));
}

async function marksInZip(bytes, source) {
    let JSZip;
    try {
        ({ default: JSZip } = await import('jszip'));
    } catch {
        console.error(
            `${source} is a zip (an .apkg or .colpkg). Reading one needs jszip:\n`
            + '  npm install jszip\n'
            + 'Or unzip it by hand and run this against the files inside.',
        );
        process.exit(1);
    }
    const zip = await JSZip.loadAsync(bytes);
    const found = new Set();
    const entries = Object.values(zip.files).filter((entry) => !entry.dir);
    for (const entry of entries) {
        for (const mark of marksInBuffer(await entry.async('nodebuffer'))) found.add(mark);
    }
    // A modern .colpkg holds a zstd-compressed collection, which this does not unpack. Say so
    // rather than reporting a clean file, which would be the wrong answer to the only question
    // this tool is ever asked.
    const compressed = entries.some((entry) => /^collection\.anki21b$/i.test(entry.name));
    if (compressed && found.size === 0) {
        console.warn(
            'Warning: this package stores its collection zstd-compressed (collection.anki21b), '
            + 'which this tool does not unpack. Import it into the app and re-export as .apkg, '
            + 'or decompress it first, before treating "no marks" as an answer.',
        );
    }
    return [...found];
}

function parseArgs(argv) {
    const args = { file: null, accounts: null };
    for (let index = 0; index < argv.length; index++) {
        const value = argv[index];
        if (value === '--accounts' || value === '-a') args.accounts = argv[++index] ?? null;
        else if (!args.file) args.file = value;
    }
    return args;
}

function readAccounts(path) {
    return readFileSync(path, 'utf8')
        .split(/\r?\n/)
        // Tolerates a pasted CSV column: the id is the first field of the line.
        .map((line) => line.split(',')[0].trim().replace(/^"|"$/g, ''))
        .filter((line) => line && !line.startsWith('#'));
}

async function main() {
    const { file, accounts } = parseArgs(process.argv.slice(2));
    if (!file) {
        console.error('Usage: node scripts/trace-catalog-leak.mjs <leaked-file> [--accounts customers.txt]');
        process.exit(1);
    }

    let bytes;
    try {
        bytes = readFileSync(file);
    } catch (error) {
        console.error(`Could not read ${file}: ${error.message}`);
        process.exit(1);
    }

    const marks = looksLikeZip(bytes) ? await marksInZip(bytes, file) : marksInBuffer(bytes);

    console.log(`Scanned ${file} (${(bytes.length / 1_000_000).toFixed(1)} MB)`);
    if (marks.length === 0) {
        console.log('No install mark found.');
        console.log(
            'That means one of: the copy predates marking, it came from a build with no store '
            + 'account, the marked notes were not among those taken, or the marks were stripped.',
        );
        return;
    }

    console.log(`Found ${marks.length} install mark${marks.length === 1 ? '' : 's'}: ${marks.join(', ')}`);
    if (marks.length > 1) {
        console.log('More than one mark means the copy was assembled from several installs.');
    }

    if (!accounts) {
        console.log('\nRun again with --accounts <file> (one store account id per line, from a');
        console.log('RevenueCat customer export) to turn these into accounts.');
        return;
    }

    let candidates;
    try {
        candidates = readAccounts(accounts);
    } catch (error) {
        console.error(`Could not read ${accounts}: ${error.message}`);
        process.exit(1);
    }

    const byMark = new Map();
    for (const accountId of candidates) {
        const mark = installMarkFromAccountId(accountId);
        if (mark && !byMark.has(mark)) byMark.set(mark, accountId);
    }

    console.log(`\nMatched against ${candidates.length} account${candidates.length === 1 ? '' : 's'}:`);
    for (const mark of marks) {
        const accountId = byMark.get(mark);
        console.log(accountId ? `  ${mark} -> ${accountId}` : `  ${mark} -> no account on this list`);
    }
}

// Importable for the test that keeps this in step with lib/catalogWatermark.ts.
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/^.*\//, ''))) {
    main().catch((error) => {
        console.error(error);
        process.exit(1);
    });
}
