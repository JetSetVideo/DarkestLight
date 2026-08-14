// Daily / seasonal timetable — what a unit *wants* to be doing at a given hour.
//
// Advisory, not authoritative: Creature.decide overrides this during raids,
// panic, wounds and divine urges. A schedule that hard-forces behaviour made
// units walk to bed in the middle of an attack.
//
// Eras shift the rhythm: a Stone Age band sleeps with the sun and works a
// short day; a Steel Age society lights its work, sleeps less, and spends more
// of the day on construction and worship. Seasons stretch or shrink the day
// on top of that (long summer evenings, early winter nights).
import { eraIndex } from './crafting.js';
import { dayPhase, SEASON_SHIFT } from './swarm.js';

/**
 * Per-era day shape. Hours are 0..24 in game time.
 *   wake/sleep  — the waking window
 *   pray        — devotional block (shamans/monks weight this heavier)
 *   buildBias   — share of the working day pushed toward construction/repair
 *   duskLead    — hours before sleep when close kin start walking home
 */
const ERA_RHYTHM = {
  Stone: { wake: 4.85, sleep: 19.9, pray: [18.2, 19.4], buildBias: 0.10, duskLead: 1.35 },
  Fire: { wake: 4.7, sleep: 20.6, pray: [18.6, 20], buildBias: 0.16, duskLead: 1.3 },
  Bronze: { wake: 4.55, sleep: 21.4, pray: [6, 7], buildBias: 0.24, duskLead: 1.2 },
  Iron: { wake: 4.4, sleep: 22.0, pray: [5.5, 6.5], buildBias: 0.30, duskLead: 1.15 },
  Steel: { wake: 4.25, sleep: 22.5, pray: [5, 6], buildBias: 0.36, duskLead: 1.05 },
};

/** Classes whose devotional block is a job, not a break. */
const DEVOUT = new Set(['shaman', 'monk', 'philosopher']);

export function rhythmFor(era, season = 'Spring') {
  const base = ERA_RHYTHM[era] || ERA_RHYTHM.Stone;
  const s = SEASON_SHIFT[season] || SEASON_SHIFT.Spring;
  return {
    wake: clampHour(base.wake + s.wake),
    sleep: clampHour(base.sleep + s.sleep),
    pray: base.pray,
    buildBias: base.buildBias,
    duskLead: base.duskLead,
    gatherMul: s.gather,
    exploreMul: s.explore,
  };
}

function clampHour(h) {
  if (h < 3) return 3;
  if (h > 23) return 23;
  return h;
}

/**
 * What this unit should be doing now.
 *
 * @returns {'sleep'|'pray'|'build'|'work'|'rest'} intent
 */
export function scheduledIntent({
  hour, era, cls, energy = 100, rng = Math.random,
  season = 'Spring', night = false,
} = {}) {
  const r = rhythmFor(era, season);
  const phase = dayPhase(hour);

  if (energy < 12) return 'sleep';

  const wrapAwake = r.wake <= r.sleep
    ? (hour >= r.wake && hour < r.sleep)
    : (hour >= r.wake || hour < r.sleep);

  // Last duskLead hours before era bedtime: the swarm layer decides whether
  // the unit is close enough to walk to the fire. Night is always sleep.
  if (night || phase === 'night') return 'sleep';
  if (hour >= r.sleep - r.duskLead) return 'sleep';
  if (!wrapAwake) return 'sleep';

  if (phase === 'dawn' && (DEVOUT.has(cls) || rng() < 0.28)) return 'pray';

  const [p0, p1] = r.pray;
  if (hour >= p0 && hour < p1) {
    if (DEVOUT.has(cls) || rng() < 0.45) return 'pray';
  }

  // Midday pause — eat, chat, sit near the hearth if tired. Warriors skip this
  // in decide(); gatherers take it when energy is slipping.
  if (phase === 'midday' && energy < 48 && rng() < 0.4) return 'rest';

  if (rng() < r.buildBias) return 'build';
  return 'work';
}

/**
 * Human-readable day plan for a given era — used by the HUD/ledger and by the
 * Phase 3 verification script to show schedules actually shifting with era.
 */
export function dayPlan(era, season = 'Spring') {
  const r = rhythmFor(era, season);
  return {
    era,
    season,
    wake: +r.wake.toFixed(1),
    sleep: +r.sleep.toFixed(1),
    wakingHours: +((r.sleep - r.wake + 24) % 24).toFixed(1),
    prayFrom: r.pray[0],
    prayTo: r.pray[1],
    buildBias: r.buildBias,
    duskLead: r.duskLead,
    gatherMul: r.gatherMul,
    tier: eraIndex(era),
    phaseHours: {
      dawn: '5.5–7.5', morning: '7.5–12', midday: '12–14',
      afternoon: '14–17.5', dusk: '17.5–19.8', evening: '19.8–24',
    },
  };
}

/** Every era's plan, ordered — handy for tables and tests. */
export function allPlans(season = 'Spring') {
  return Object.keys(ERA_RHYTHM).map((era) => dayPlan(era, season));
}

export { dayPhase, ERA_RHYTHM };
