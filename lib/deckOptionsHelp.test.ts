// The deck-options help sheets are product copy with a job: they tell a learner what the switch
// in front of them does. Two things can quietly break that job, and both have bitten this repo
// before — copy that exists but is never rendered, and copy that outlived the behaviour it
// describes. The tests here cover the first directly and pin the second where it is checkable.

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildDeckOptionsHelp, OPTION_HELP_KEYS, type OptionHelpKey } from './deckOptionsHelp';

const turkish = buildDeckOptionsHelp((tr) => tr);
const english = buildDeckOptionsHelp((_tr, en) => en);
const screenSource = fs.readFileSync(path.join(process.cwd(), 'app', 'deck-options.tsx'), 'utf8');

describe('deck options help sheets', () => {
    it('gives every sheet a title, a summary and at least three points in both languages', () => {
        for (const locale of [turkish, english]) {
            for (const key of OPTION_HELP_KEYS) {
                const sheet = locale[key];
                expect(sheet.title.trim(), key).not.toBe('');
                expect(sheet.summary.trim(), key).not.toBe('');
                expect(sheet.points.length, key).toBeGreaterThanOrEqual(3);
                expect(sheet.points.every((point) => point.trim().length > 0), key).toBe(true);
                expect(sheet.eyebrow.trim(), key).not.toBe('');
                expect(sheet.dismissLabel.trim(), key).not.toBe('');
            }
        }
    });

    it('actually translates every sentence instead of shipping one language twice', () => {
        const untranslated: string[] = [];
        for (const key of OPTION_HELP_KEYS) {
            const tr = turkish[key];
            const en = english[key];
            if (tr.title === en.title) untranslated.push(`${key}.title`);
            if (tr.summary === en.summary) untranslated.push(`${key}.summary`);
            tr.points.forEach((point, index) => {
                if (point === en.points[index]) untranslated.push(`${key}.points[${index}]`);
            });
            if (tr.note && tr.note === en.note) untranslated.push(`${key}.note`);
        }

        expect(untranslated).toEqual([]);
    });

    // The editor toolbar shipped nine finished, tested helpers that no button ever reached. A help
    // sheet is the same shape of mistake waiting to happen: it is authored here and rendered
    // there, and nothing but this test connects the two.
    it('renders every sheet it defines, and defines every sheet the screen renders', () => {
        const rendered = new Set(
            Array.from(screenSource.matchAll(/optionHelp\.([A-Za-z]+)/g), (match) => match[1]),
        );

        expect([...rendered].sort()).toEqual([...OPTION_HELP_KEYS].sort());
    });

    // Three sections describe SM-2 fields that stop having any effect once FSRS is switched on.
    // Silence there is what the previous copy got wrong — it told the learner these values shape
    // their reviews with no hint that half the screen ignores them.
    // `lib/fsrsScheduler.test.ts` pins the behaviour itself.
    it('warns, in the sections whose fields FSRS ignores, that FSRS ignores them', () => {
        const missing = (['newCards', 'lapses', 'advanced'] as OptionHelpKey[]).filter(
            (key) => !turkish[key].note?.includes('FSRS') || !english[key].note?.includes('FSRS'),
        );

        expect(missing).toEqual([]);
    });

    // Upstream hides its SM-2 options once FSRS is on. The set hidden here is the set
    // `lib/fsrsScheduler.ts` ignores, and the two halves of that sentence are tested in two
    // places: `lib/fsrsScheduler.test.ts` proves moving these settings changes no FSRS outcome,
    // and this proves the screen stops offering them. A field guarded here that FSRS does read —
    // maximum interval, the learning steps, the leech settings — would strand a live control.
    it('hides exactly the fields FSRS supersedes, and no others', () => {
        const guarded = new Set(
            Array.from(screenSource.matchAll(/supersededByFsrs\('([A-Za-z]+)'\)/g), (match) => match[1]),
        );

        expect([...guarded].sort()).toEqual([
            'easyBonus',
            'easyIvl',
            'graduatingIvl',
            'hardIvl',
            'ivlModifier',
            'minIvl',
            'newIvlPercent',
            'startingEase',
        ]);
    });

    // Save refuses while any field is invalid, and a hidden field cannot be corrected. The guard
    // has to yield to a validation error or turning FSRS on can lock the screen.
    it('keeps a superseded field on screen while it still holds a validation error', () => {
        expect(screenSource).toMatch(/supersededByFsrs\s*=\s*\([^)]*\):\s*boolean\s*=>\s*\n?\s*form\.fsrsEnabled\s*&&\s*!validation\.errors\[field\]/);
    });

    it('does not claim FSRS is missing from a build that ships it', () => {
        const everySentence = OPTION_HELP_KEYS.flatMap((key) => [
            ...[turkish[key], english[key]].flatMap((sheet) => [sheet.summary, sheet.note ?? '', ...sheet.points]),
        ]).join('\n');

        expect(everySentence).not.toMatch(/FSRS (bu sürümde )?uygulanmış değildir|FSRS is not implemented/i);
    });
});
