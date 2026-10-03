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
 *   node scripts/audit-gate.mjs                   runs `npm audit --json` itself
 *   node scripts/audit-gate.mjs --report <file>   checks a saved `npm audit --json` report
 */
const EXCEPTIONS = [
    {
        advisory: 'GHSA-vfj7-8cjw-p6xm',
        package: 'braces',
        reason: 'build-time only (Metro file watching, through micromatch); no patched braces release as of 2026-10-03',
    },
    {
        advisory: 'GHSA-86w9-cpqp-85rv',
        package: 'node-forge',
        reason: 'build-time only (Expo CLI code-signing certificates); no patched node-forge release as of 2026-10-03',
    },
];

const BLOCKING_SEVERITIES = new Set(['high', 'critical']);

function readReport() {
    const flag = process.argv.indexOf('--report');
    if (flag !== -1) return JSON.parse(fs.readFileSync(process.argv[flag + 1], 'utf8'));
    // npm audit exits non-zero whenever it finds anything, so its exit status is not the verdict.
    const run = spawnSync('npm', ['audit', '--json'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    if (!run.stdout) {
        console.error(run.stderr || 'npm audit produced no report.');
        process.exit(2);
    }
    return JSON.parse(run.stdout);
}

function advisoryId(advisory) {
    return /GHSA-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{4}/i.exec(advisory.url ?? '')?.[0] ?? String(advisory.source ?? advisory.url);
}

const report = readReport();
if (report.error) {
    console.error(`npm audit failed: ${report.error.summary ?? JSON.stringify(report.error)}`);
    process.exit(2);
}

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
    console.error(`\n${failures.length} blocking advisor${failures.length === 1 ? 'y' : 'ies'}:`);
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
}
console.log('No blocking advisories.');
