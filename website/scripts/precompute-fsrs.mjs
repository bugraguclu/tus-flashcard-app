import fs from 'node:fs';
import path from 'node:path';
import module from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEBSITE_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(WEBSITE_ROOT, '..');
const OUT_PATH = path.join(WEBSITE_ROOT, 'src/data/generated/fsrs-curves.json');

// Register Node 24 ESM hook so extensionless TypeScript imports inside ../lib/*.ts resolve cleanly.
module.registerHooks({
  resolve(specifier, context, nextResolve) {
    if (
      (specifier.startsWith('./') || specifier.startsWith('../')) &&
      !path.extname(specifier) &&
      context.parentURL &&
      context.parentURL.startsWith('file://')
    ) {
      const parentDir = path.dirname(fileURLToPath(context.parentURL));
      const candidate = path.resolve(parentDir, `${specifier}.ts`);
      if (fs.existsSync(candidate)) {
        return { url: pathToFileURL(candidate).href, shortCircuit: true };
      }
    }
    return nextResolve(specifier, context);
  },
});

const { simulateFsrs } = await import(pathToFileURL(path.join(REPO_ROOT, 'lib/fsrsSimulator.ts')).href);
const { DEFAULT_FSRS_PARAMETERS } = await import(pathToFileURL(path.join(REPO_ROOT, 'lib/fsrs.ts')).href);
const { DEFAULT_SIMULATOR_LEARNER } = await import(pathToFileURL(path.join(REPO_ROOT, 'lib/fsrsSimulatorModel.ts')).href);

const SCOPES = [
  { id: 'all', label: 'Tüm BKA TUS Paketi', cards: 9575 },
  { id: 'temel', label: 'Temel Bilimler (6 Ders)', cards: 3957 },
  { id: 'klinik', label: 'Klinik Bilimler (5 Ders)', cards: 4812 },
  { id: 'single', label: 'Tek Ders Odak (Ort.)', cards: 800 },
  { id: 'mega', label: '27.341 Kartlık Mega Deste (Karşılaştırma)', cards: 27341 },
];

const HORIZONS = [120, 180, 270, 365];
const PACES = [20, 40, 60, 80, 100, 140];
const DESIRED_RETENTION = 0.90;

// Fixed reference timestamp for deterministic rollover weekday (2026-11-20 04:00 UTC+3)
const NEXT_DAY_MS = Date.UTC(2026, 10, 20, 1, 0, 0);

function sampleIndices(days, count = 10) {
  const out = [];
  for (let i = 0; i < count; i++) {
    out.push(Math.min(days - 1, Math.round((i * (days - 1)) / (count - 1))));
  }
  return [...new Set(out)];
}

async function runScenario(cards, days, newLimit) {
  const stride = Math.max(1, Math.floor(days / 12));
  const sim = await simulateFsrs({
    params: DEFAULT_FSRS_PARAMETERS,
    desiredRetention: DESIRED_RETENTION,
    days,
    existing: [],
    newCards: cards,
    introducedToday: 0,
    newLimit,
    reviewLimit: 9999,
    maxInterval: 365,
    newCardsIgnoreReviewLimit: true,
    leechThreshold: 8,
    learningSteps: 2,
    relearningSteps: 1,
    reviewOrder: 'dueRandom',
    easyDays: [100, 100, 100, 100, 100, 100, 100],
    nextDayAtMs: NEXT_DAY_MS,
    learner: DEFAULT_SIMULATOR_LEARNER,
    memorizedStride: stride,
  });

  if (!sim) throw new Error('Simulation cancelled unexpectedly');

  let sumRev = 0;
  let sumNew = 0;
  let sumSec = 0;
  let peakTotal = 0;
  let peakSec = 0;
  let finishDay = null;
  let cumNew = 0;

  for (let d = 0; d < days; d++) {
    const rev = sim.reviews[d];
    const nw = sim.newCards[d];
    const sec = sim.seconds[d];
    sumRev += rev;
    sumNew += nw;
    sumSec += sec;
    cumNew += nw;
    if (rev + nw > peakTotal) peakTotal = rev + nw;
    if (sec > peakSec) peakSec = sec;
    if (finishDay === null && cumNew >= cards) finishDay = d + 1;
  }

  const endMemorized = Math.round(sim.memorized[days - 1] || 0);
  const idxs = sampleIndices(days, 8);
  const pts = idxs.map((d) => [d + 1, Math.round(sim.reviews[d] + sim.newCards[d]), Math.round(sim.seconds[d] / 60)]);

  return {
    avg: Math.round((sumRev + sumNew) / days),
    rev: Math.round(sumRev / days),
    peak: Math.round(peakTotal),
    min: Math.round(sumSec / days / 60),
    pMin: Math.round(peakSec / 60),
    intro: sumNew,
    mem: endMemorized,
    pct: Number(((endMemorized / cards) * 100).toFixed(1)),
    fin: finishDay,
    pts,
  };
}

async function main() {
  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  const matrix = {};

  for (const scope of SCOPES) {
    matrix[scope.id] = {};
    for (const days of HORIZONS) {
      matrix[scope.id][String(days)] = {};
      for (const pace of PACES) {
        matrix[scope.id][String(days)][String(pace)] = await runScenario(scope.cards, days, pace);
      }
    }
  }

  const output = {
    engine: 'TusAnkiM FSRS-6 (lib/fsrsSimulator.ts)',
    desiredRetention: DESIRED_RETENTION,
    horizons: HORIZONS,
    paces: PACES,
    scopes: SCOPES,
    matrix,
  };

  const json = JSON.stringify(output);
  fs.writeFileSync(OUT_PATH, json + '\n');
  console.log(`[precompute-fsrs] Wrote ${OUT_PATH} (${(Buffer.byteLength(json) / 1024).toFixed(1)} KB, ${SCOPES.length * HORIZONS.length * PACES.length} FSRS-6 simulations).`);
}

main().catch((err) => {
  console.error('[precompute-fsrs] FAILED:', err);
  process.exit(1);
});
