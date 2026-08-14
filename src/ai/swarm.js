// Swarm intelligence: space, time, kin, and civilisation stance.
//
// Units still decide individually (entities.Creature.decide) so panic, wounds
// and raids stay authoritative. This module supplies *shared* context those
// decisions read: a sleep ring around the hearth, flocking offsets, work-party
// bias, a day-phase calendar, and a slowly evolving harmony/opposition stance
// between the two gods' peoples.

import * as THREE from 'three';
import { dist2, clamp } from '../util.js';

/** World-space radius: "close enough to come home for the night". */
export const SLEEP_HOME_R = 52;
export const SLEEP_HOME_R2 = SLEEP_HOME_R * SLEEP_HOME_R;
/** Arrived at a sleep-ring slot. */
export const SLEEP_SLOT_R2 = 2.4 * 2.4;

/**
 * Clock phases used by the timetable. Hours are 0..24 (Cycles.hour).
 * Dusk is the "night is coming" window — kin within SLEEP_HOME_R walk to the fire.
 */
export function dayPhase(hour) {
  const h = ((hour % 24) + 24) % 24;
  if (h < 4.5) return 'night';
  if (h < 7.2) return 'dawn';
  if (h < 12) return 'morning';
  if (h < 14) return 'midday';
  if (h < 17.4) return 'afternoon';
  if (h < 19.6) return 'dusk';
  return 'evening';
}

export const PHASE_LABEL = {
  night: 'Night',
  dawn: 'Dawn',
  morning: 'Morning',
  midday: 'Midday',
  afternoon: 'Afternoon',
  dusk: 'Dusk',
  evening: 'Evening',
};

/** Seasonal tilt of the working day (added to era wake/sleep). */
export const SEASON_SHIFT = {
  Spring: { wake: -0.35, sleep: 0.25, gather: 1.05, explore: 1.1 },
  Summer: { wake: -0.7, sleep: 0.7, gather: 1.18, explore: 1.2 },
  Autumn: { wake: 0.15, sleep: -0.25, gather: 1.28, explore: 0.9 },
  Winter: { wake: 0.65, sleep: -0.85, gather: 0.78, explore: 0.55 },
};

export function stanceLabel(v) {
  if (v > 0.35) return 'Harmony';
  if (v < -0.35) return 'Opposition';
  return 'Indifferent';
}

/** A point on the campfire sleep circle (two concentric rings). */
export function sleepRingSlot(home, index, count) {
  const n = Math.max(count, 1);
  const inner = index % 2 === 0;
  const ringI = Math.floor(index / 2);
  const onRing = Math.ceil(n / 2);
  const a = ((ringI + 0.5) / onRing) * Math.PI * 2 + index * 0.07;
  const r = inner ? 3.15 : 4.35;
  return new THREE.Vector3(
    home.x + Math.cos(a) * r,
    0,
    home.z + Math.sin(a) * r,
  );
}

/**
 * Assign sleep-ring slots to a side. Children take the inner ring first.
 * Called from groupAITick so the circle is coherent rather than random.
 */
export function assignSleepSlots(game, side) {
  const home = game.homeOf(side);
  if (!home) return;
  const kin = game.creatures.filter(c => c.side === side && !c.held && c.hp > 0);
  const kids = kin.filter(c => c.lifeStage === 'child');
  const adults = kin.filter(c => c.lifeStage !== 'child');
  const ordered = [...kids, ...adults];
  ordered.forEach((c, i) => {
    c._sleepSlot = sleepRingSlot(home.pos, i, ordered.length);
    c._sleepIndex = i;
  });
}

/**
 * Cheap flocking offset: separation (already in act) plus cohesion toward
 * nearby kin who share a labour task. Returns a unit-ish {x,z} to add to dir.
 */
export function flockOffset(creature, game) {
  const { pos } = creature;
  let cx = 0, cz = 0, n = 0;
  let ox = 0, oz = 0;
  const labour = creature.task === 'harvest' || creature.task === 'work'
    || creature.task === 'hunt' || creature.task === 'build' || creature.task === 'explore';
  for (const c of game.creatures) {
    if (c === creature || c.side !== creature.side || c.held) continue;
    const d2 = dist2(c.pos.x, c.pos.z, pos.x, pos.z);
    if (d2 > 144 || d2 < 0.01) continue; // 12u neighbourhood
    const d = Math.sqrt(d2);
    // extra separation beyond the tight act() bump — keep a personal space
    if (d < 1.6) {
      ox += (pos.x - c.pos.x) / d * (1.6 - d);
      oz += (pos.z - c.pos.z) / d * (1.6 - d);
    }
    if (labour && (c.task === creature.task || c.task === 'harvest' || c.task === 'work')) {
      cx += c.pos.x; cz += c.pos.z; n++;
    }
  }
  if (n >= 2) {
    cx /= n; cz /= n;
    const dx = cx - pos.x, dz = cz - pos.z;
    const len = Math.hypot(dx, dz) || 1;
    // mild cohesion — don't override the resource target
    ox += (dx / len) * 0.22;
    oz += (dz / len) * 0.22;
  }
  return { x: ox, z: oz };
}

/**
 * If two or more kin are already harvesting a yield nearby, join that party.
 */
export function workPartyYield(creature, game) {
  const counts = { food: 0, wood: 0, rock: 0, metal: 0 };
  for (const c of game.creatures) {
    if (c === creature || c.side !== creature.side) continue;
    if (c.task !== 'harvest' && c.task !== 'work' && c.task !== 'hunt') continue;
    if (dist2(c.pos.x, c.pos.z, creature.pos.x, creature.pos.z) > 484) continue;
    const y = c.claimed?.yields || c.target?.yields;
    if (y && counts[y] != null) counts[y]++;
  }
  let best = null, n = 0;
  for (const [y, k] of Object.entries(counts)) if (k > n) { n = k; best = y; }
  return n >= 2 ? best : null;
}

/** Active divine gather-urge for a side, or null. */
export function activeUrge(game, side) {
  const u = game.urges?.[side];
  if (!u || u.ttl <= 0) return null;
  return u;
}

/**
 * Drift the two civilisations toward harmony, opposition, or indifference.
 * Called once per in-game day. Pets/heals/hybrids pull toward harmony;
 * kills, slaps and raids pull toward opposition; time decays toward 0.
 */
export function tickRelations(game) {
  const rel = game.relations || (game.relations = { stance: 0, day: -1 });
  const a = game.alignment || {};
  const stP = game.state?.player, stE = game.state?.enemy;
  const hybrids = game.creatures.filter(c => (c.raceKey || '').includes('+')).length;
  const kills = (stP?.kills || 0) + (stE?.kills || 0);
  const conv = (stP?.conversions || 0) + (stE?.conversions || 0);
  let delta = 0;
  delta += (a.pets || 0) * 0.004 + (a.heals || 0) * 0.006;
  delta -= (a.slaps || 0) * 0.005 + (a.kills || 0) * 0.008;
  delta += hybrids * 0.012;
  delta -= Math.max(0, kills - conv) * 0.004;
  // Alignment itself: benevolent gods soothe the frontier, wrathful ones inflame it.
  delta += (a.value || 0) * 0.04;
  // Decay toward indifference — peoples who ignore each other stay that way.
  rel.stance = clamp(rel.stance * 0.82 + delta, -1, 1);
  rel.day = game.cycles.day;
  rel.label = stanceLabel(rel.stance);
  return rel;
}

export function relationsOf(game) {
  return game.relations || { stance: 0, label: 'Indifferent', day: -1 };
}

/**
 * Should this unit start walking to the hearth sleep ring?
 * Close kin at dusk always do. Anyone still out after nightfall does too.
 * Far units at dusk keep their current job (they'll come in as they drift).
 */
export function shouldReturnToFire(creature, game, home) {
  if (!home) return false;
  if (creature.alert > 0 && creature.fear > 0.35) return false;
  const hour = game.cycles.hour;
  const phase = dayPhase(hour);
  const night = game.cycles.isNight || phase === 'night' || phase === 'evening';
  const dusk = phase === 'dusk';
  const d2 = dist2(creature.pos.x, creature.pos.z, home.pos.x, home.pos.z);
  const close = d2 < SLEEP_HOME_R2;
  if (creature.lifeStage === 'child' && (dusk || night)) return true;
  if (night) return true;
  if (dusk && close) return true;
  return false;
}
