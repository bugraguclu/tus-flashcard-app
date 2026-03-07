import { fsrs, generatorParameters, Rating, State, FSRSVersion, createEmptyCard } from 'ts-fsrs';
import { getScheduler } from './lib/scheduler';
import type { CardState, AppSettings } from './lib/types';

// `ts-fsrs` params (using FSRS v4.5/v5 defaults)
const params = generatorParameters({
    request_retention: 0.9,
    maximum_interval: 36500,
    w: [0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046, 1.54575, 0.1192, 1.01925, 1.9395, 0.11, 0.29605, 2.2698, 0.2315, 2.9898, 0.51655, 0.6621]
});
const f = fsrs(params);

const scheduler = getScheduler('FSRS');

const defaultSettings: AppSettings = {
    dailyNewLimit: 20,
    learningSteps: [1, 10], // 1m, 10m
    graduatingInterval: 1, // 1 day
    easyInterval: 4, // 4 days
    startingEase: 2.5,
    lapseNewInterval: 0,
    desiredRetention: 0.9,
    algorithm: 'FSRS',
};

// Initial Card State - Custom FSRS
let customCardState: CardState = {
    interval: 0,
    repetition: 0,
    dueDate: new Date().toISOString().split('T')[0],
    dueTime: new Date().getTime(),
    status: 'new',
    suspended: false,
    buried: false,
    ...scheduler.initCardState!(defaultSettings) as any
};

// Start a testing sequence with `ts-fsrs`
const now = new Date();
const card = createEmptyCard(now);


// Test all 4 grades for the first review of a NEW card
console.log("\n--- REVIEW 1: NEW CARD ---");
const r1 = f.repeat(card, now);
const customR1_1 = scheduler.schedule(customCardState, 1, defaultSettings);
const customR1_2 = scheduler.schedule(customCardState, 2, defaultSettings);
const customR1_3 = scheduler.schedule(customCardState, 3, defaultSettings);
const customR1_4 = scheduler.schedule(customCardState, 4, defaultSettings);

for (let g = 1; g <= 4; g++) {
    const tsS = (r1 as any)[g].card.stability;
    const tsD = (r1 as any)[g].card.difficulty;
    const custom = [customR1_1, customR1_2, customR1_3, customR1_4][g - 1];
    console.log(`Grade ${g}: ts-fsrs S=${tsS.toFixed(4)} D=${tsD.toFixed(4)} | custom S=${custom.stateUpdates.stability?.toFixed(4)} D=${custom.stateUpdates.difficulty?.toFixed(4)}`);
}

// Emulate Good on first review (Learning, Step 1)
const tsCard1Good = r1[Rating.Good].card;
const due1Good = new Date(now.getTime() + 10 * 60000); // 10 minutes later (ts-fsrs sets due?)

console.log("\n--- REVIEW 2: LEARNING STEP 2 (After Good) ---");
const r2 = f.repeat(tsCard1Good, due1Good);
const customStateAfterGood = { ...customCardState, ...customR1_3.stateUpdates, status: 'learning' as any };
const customR2_1 = scheduler.schedule(customStateAfterGood, 1, defaultSettings);
const customR2_2 = scheduler.schedule(customStateAfterGood, 2, defaultSettings);
const customR2_3 = scheduler.schedule(customStateAfterGood, 3, defaultSettings);
const customR2_4 = scheduler.schedule(customStateAfterGood, 4, defaultSettings);

for (let g = 1; g <= 4; g++) {
    const tsS = (r2 as any)[g].card.stability;
    const tsD = (r2 as any)[g].card.difficulty;
    const custom = [customR2_1, customR2_2, customR2_3, customR2_4][g - 1];
    console.log(`Grade ${g}: ts-fsrs S=${tsS.toFixed(4)} D=${tsD.toFixed(4)} | custom S=${custom.stateUpdates.stability?.toFixed(4)} D=${custom.stateUpdates.difficulty?.toFixed(4)}`);
}


