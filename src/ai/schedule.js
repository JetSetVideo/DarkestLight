// Daily schedule engine — what a unit *wants* to be doing at a given hour.
//
// The schedule is advisory, not authoritative: it produces an intent, and the
// existing decision tree in entities.js is free to override it when something
// urgent happens (a raid, starvation, panic). That separation is deliberate —
// a schedule that hard-forces behaviour makes units walk to bed during an
// attack.
//
// Eras shift the rhythm: a Stone Age band sleeps with the sun and works a
// short day; a Steel Age society lights its work, sleeps less, and spends more
// of the day on construction and worship.
import { eraIndex } from './crafting.js';

/**
 * Per-era day shape. Hours are 0..24 in game time.
 *   wake/sleep  — the waking window
 *   pray        — devotional block (shamans/monks weight this heavier)
 *   buildBias   — share of the working day pushed toward construction/repair
 */
const ERA_RHYTHM = {
  Stone: { wake: 6.5, sleep: 19.5, pray: [18, 19], buildBias: 0.10 },
  Fire: { wake: 6.0, sleep: 20.5, pray: [18.5, 20], buildBias: 0.16 },
  Bronze: { wake: 5.5, sleep: 21.5, pray: [6, 7], buildBias: 0.24 },
  Iron: { wake: 5.0, sleep: 22.0, pray: [5.5, 6.5], buildBias: 0.30 },
  Steel: { wake: 4.5, sleep: 22.5, pray: [5, 6], buildBias: 0.36 },
};

/** Classes whose devotional block is a job, not a break. */
const DEVOUT = new Set(['shaman', 'monk', 'philosopher']);

/**
 * What this unit should be doing now.
 *
 * @param {{hour:number, era:string, cls:string, energy:number, rng:()=>number}} ctx
 * @returns {'sleep'|'pray'|'build'|'work'} intent
 */
export function scheduledIntent({ hour, era, cls, energy = 100, rng = Math.random }) {
  const r = ERA_RHYTHM[era] || ERA_RHYTHM.Stone;

  // Exhaustion overrides the clock — a unit that has run itself flat sleeps
  // whenever it can, which is what stops permanent-daylight death spirals.
  if (energy < 12) return 'sleep';

  const awake = r.wake <= r.sleep
    ? (hour >= r.wake && hour < r.sleep)
    : (hour >= r.wake || hour < r.sleep);
  if (!awake) return 'sleep';

  const [p0, p1] = r.pray;
  if (hour >= p0 && hour < p1) {
    // The devout always take the block; others attend sometimes.
    if (DEVOUT.has(cls) || rng() < 0.45) return 'pray';
  }

  // Later eras put more of the day into building and repair.
  if (rng() < r.buildBias) return 'build';
  return 'work';
}

/**
 * Human-readable day plan for a given era — used by the HUD/ledger and by the
 * Phase 3 verification script to show schedules actually shifting with era.
 */
export function dayPlan(era) {
  const r = ERA_RHYTHM[era] || ERA_RHYTHM.Stone;
  return {
    era,
    wake: r.wake,
    sleep: r.sleep,
    wakingHours: +((r.sleep - r.wake + 24) % 24).toFixed(1),
    prayFrom: r.pray[0],
    prayTo: r.pray[1],
    buildBias: r.buildBias,
    tier: eraIndex(era),
  };
}

/** Every era's plan, ordered — handy for tables and tests. */
export function allPlans() {
  return Object.keys(ERA_RHYTHM).map(dayPlan);
}
