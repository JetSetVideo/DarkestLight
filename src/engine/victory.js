// Victory point scoring and resource-stream balance.
//
// The legacy scoreOf() in game.js is a flat kill/pop/tech tally. Phase 5 needs
// 4X-shaped scoring: territory held, population, technological era, quests
// completed and faith infrastructure — so victory can be won by cultivating an
// island rather than only by winning fights.
//
// scoreOf() is left intact; this sits alongside it and is what checkEnd()
// consults, so existing callers and saves are unaffected.
import { SEG, WORLD_SIZE, WATER_Y } from '../world.js';
import { eraOf, ERAS } from '../ai/crafting.js';

const V = SEG + 1;

/** Weight of each victory category. Tuned so no single axis dominates. */
export const VP_WEIGHTS = {
  land: 2.0,        // per % of habitable island influenced
  population: 6.0,  // per living unit
  era: 60.0,        // per era advanced beyond Stone
  quests: 1.0,      // quest rewards already carry their own VP values
  faith: 25.0,      // per faith structure (temple / campfire)
  structures: 8.0,  // per other building
};

/** Buildings that count as faith infrastructure. */
const FAITH_BUILDINGS = new Set(['temple', 'campfire']);

/**
 * Fraction of habitable land a side controls, by proximity to its buildings.
 *
 * Sampled on a coarse lattice rather than per-cell: the grid is ~37k cells and
 * this runs on the scoring timer, so an 8x stride keeps it cheap while staying
 * stable enough to rank two civilisations.
 */
export function landControl(game, side, stride = 8) {
  const terrain = game.terrain;
  const mine = game.buildings.filter((b) => b.side === side);
  if (!mine.length) return 0;

  const radius2 = 26 * 26;
  let habitable = 0, held = 0;
  for (let j = 0; j <= SEG; j += stride) {
    for (let i = 0; i <= SEG; i += stride) {
      const k = j * V + i;
      if (terrain.heights[k] < WATER_Y + 0.2) continue;
      habitable++;
      const x = (i / SEG - 0.5) * WORLD_SIZE;
      const z = (j / SEG - 0.5) * WORLD_SIZE;
      for (const b of mine) {
        const dx = b.pos.x - x, dz = b.pos.z - z;
        if (dx * dx + dz * dz <= radius2) { held++; break; }
      }
    }
  }
  return habitable ? held / habitable : 0;
}

/**
 * Full victory-point breakdown for a side.
 * Returned itemised so the HUD and the end screen can show *why* a side won.
 */
export function victoryBreakdown(game, side) {
  const st = game.stateOf(side);
  const era = eraOf(st.techs);
  const eraTier = Math.max(0, ERAS.indexOf(era));
  const buildings = game.buildings.filter((b) => b.side === side);
  const faith = buildings.filter((b) => FAITH_BUILDINGS.has(b.type)).length;
  const other = buildings.length - faith;
  const landPct = landControl(game, side) * 100;
  const questVP = game.quests?.vpFor(side) ?? 0;

  const parts = {
    land: landPct * VP_WEIGHTS.land,
    population: game.popOf(side) * VP_WEIGHTS.population,
    era: eraTier * VP_WEIGHTS.era,
    quests: questVP * VP_WEIGHTS.quests,
    faith: faith * VP_WEIGHTS.faith,
    structures: Math.max(0, other) * VP_WEIGHTS.structures,
  };
  const total = Object.values(parts).reduce((a, b) => a + b, 0);

  return {
    side, era, eraTier,
    landPct: +landPct.toFixed(1),
    population: game.popOf(side),
    faithStructures: faith,
    questVP,
    parts,
    total: Math.round(total),
  };
}

export function victoryPoints(game, side) {
  return victoryBreakdown(game, side).total;
}

// ---------------------------------------------------------------------------
// Resource stream balance

/**
 * The four Phase 5 streams, mapped onto the stockpiles the game already keeps.
 * Biomass merges food and wood — both are living matter drawn from the land,
 * and the ecology already couples them.
 */
export const STREAMS = {
  faith: (st) => st.dp || 0,
  biomass: (st) => (st.food || 0) + (st.wood || 0),
  ore: (st) => (st.metal || 0),
  wood: (st) => (st.wood || 0),
};

/**
 * Proximity bonus/malus multipliers for a side's resource streams.
 *
 * Clustering settlements concentrates faith but strains the land: tight
 * packing boosts faith and ore logistics while suppressing biomass, because
 * the surrounding ground is over-harvested. Spread-out civilisations get the
 * inverse. This is what makes settlement layout a real decision.
 */
export function proximityModifiers(game, side) {
  const mine = game.buildings.filter((b) => b.side === side);
  if (mine.length < 2) return { faith: 1, biomass: 1, ore: 1, wood: 1, spread: 0 };

  let sum = 0, pairs = 0;
  for (let i = 0; i < mine.length; i++) {
    for (let j = i + 1; j < mine.length; j++) {
      sum += Math.hypot(mine[i].pos.x - mine[j].pos.x, mine[i].pos.z - mine[j].pos.z);
      pairs++;
    }
  }
  const meanSpread = sum / pairs;
  // 0 = tightly packed, 1 = spread across the island
  const spread = Math.max(0, Math.min(1, meanSpread / 70));

  return {
    faith: 1 + (1 - spread) * 0.30,   // worship concentrates
    ore: 1 + (1 - spread) * 0.20,     // short haul routes
    biomass: 1 + spread * 0.35,       // dispersed farming spares the soil
    wood: 1 + spread * 0.25,
    spread: +spread.toFixed(3),
  };
}
