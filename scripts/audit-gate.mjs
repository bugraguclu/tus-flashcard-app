import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

/**
 * CI's dependency-advisory gate: `npm audit` at high severity, with named, temporary exceptions.
 *
 * `npm audit --audit-level=high` cannot set one advisory aside, so an advisory with no patched
 * release would block every push until upstream ships one. Each exception names a single advisory,
 * the package it is filed against and why it is tolerated. The gate fails again as soon as npm
 * reports a fix that needs no breaking upgrade, so an exception cannot outlive its reason.
 *
 * A newly published advisory changes the verdict without any change to the code. CI therefore
 * passes `--warn-only` when a push or PR leaves package.json and package-lock.json alone: the
 * findings appear as warnings on the run instead of failing it, and the next dependency change
 * has to resolve them.
 *
 *   node scripts/audit-gate.mjs                   runs `npm audit --json` itself
 *   node scripts/audit-gate.mjs --report <file>   checks a saved `npm audit --json` report
 *   node scripts/audit-gate.mjs --warn-only       reports findings as warnings and exits 0
 */
const EXCEPTIONS = [
    {
        advisory: 'GHSA-mrhx-c7xc-m3w5',
        package: 'zod',
        reason: 'build-time only (Expo CLI 57 argument and config validation; the app never imports zod); patched only in zod 4.6.6, while @expo/cli 57.0.32 still requires zod ^3.25.76, as of 2026-10-24',
    },
];

const BLOCKING_SEVERITIES = new Set(['high', 'critical']);
const WARN_ONLY = process.argv.includes('--warn-only');

/** Ends the run with a failure, or in warn-only mode with a GitHub Actions warning and success. */
function fail(lines, exitCode) {
    if (!WARN_ONLY) {
        for (const line of lines) console.error(line);
        process.exit(exitCode);
    }
    for (const line of lines) if (line.trim()) console.log(`::warning title=Dependency advisories::${line.trim()}`);
    console.log('Not blocking: this change leaves the dependencies alone.');
    process.exit(0);
}

function readReport() {
    const flag = process.argv.indexOf('--report');
    if (flag !== -1) return JSON.parse(fs.readFileSync(process.argv[flag + 1], 'utf8'));
    // npm audit exits non-zero whenever it finds anything, so its exit status is not the verdict.
    const run = spawnSync('npm', ['audit', '--json'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    if (!run.stdout) fail([run.stderr || 'npm audit produced no report.'], 2);
    return JSON.parse(run.stdout);
}

function advisoryId(advisory) {
    return /GHSA-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{4}/i.exec(advisory.url ?? '')?.[0] ?? String(advisory.source ?? advisory.url);
}

const report = readReport();
if (report.error) fail([`npm audit failed: ${report.error.summary ?? JSON.stringify(report.error)}`], 2);

const vulnerabilities = report.vulnerabilities ?? {};
const blocking = new Map();
for (const entry of Object.values(vulnerabilities)) {
    for (const advisory of entry.via ?? []) {
        // A string names another vulnerable package; only objects are advisories.
        if (typeof advisory !== 'object' || !BLOCKING_SEVERITIES.has(advisory.severity)) continue;
        blocking.set(advisoryId(advisory), advisory);
    }
}

const failures = [];
for (const [id, advisory] of blocking) {
    const exception = EXCEPTIONS.find((candidate) => candidate.advisory === id);
    if (!exception) {
        failures.push(`${advisory.severity} ${advisory.name}: ${advisory.title} (${advisory.url})`);
    } else if (vulnerabilities[exception.package]?.fixAvailable === true) {
        failures.push(`${exception.package} now has a non-breaking fix for ${id}: update the lockfile and drop the exception`);
    } else {
        console.log(`excepted ${id} in ${exception.package}: ${exception.reason}`);
    }
}
for (const exception of EXCEPTIONS) {
    if (!blocking.has(exception.advisory)) {
        console.log(`exception ${exception.advisory} (${exception.package}) no longer matches anything and can be removed`);
    }
}

if (failures.length) {
    fail([`\n${failures.length} blocking advisor${failures.length === 1 ? 'y' : 'ies'}:`, ...failures.map((failure) => `  - ${failure}`)], 1);
}
console.log('No blocking advisories.');
