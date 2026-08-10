// Tools, animal companions, and the technological eras that gate them.
//
// Definitions live here rather than in civs.js so the advancement data stays
// separable from the civ roster — Phase 5 quests and Phase 6 missions both
// need to reference eras and tool tiers without importing the whole civ table.

/**
 * Technological eras, in order. A civilisation's era is derived from the techs
 * it has actually researched, so it advances as a *consequence* of play rather
 * than as a separate resource to spend.
 */
export const ERAS = ['Stone', 'Fire', 'Bronze', 'Iron', 'Steel'];

/** Techs that, once held, qualify a civ for each era. */
const ERA_REQUIREMENTS = [
  { era: 'Stone', need: 0, techs: [] },
  { era: 'Fire', need: 1, techs: ['toolmaking'] },
  { era: 'Bronze', need: 2, techs: ['masonry', 'agriculture', 'herbalism'] },
  { era: 'Iron', need: 3, techs: ['warcraft', 'discipline', 'masonry'] },
  { era: 'Steel', need: 5, techs: [] },
];

/**
 * Derive a civilisation's era from its tech set.
 * @param {Record<string, any>} techs  the side's researched tech map
 */
export function eraOf(techs) {
  const held = Object.keys(techs || {});
  let era = 'Stone';
  for (const rule of ERA_REQUIREMENTS) {
    if (held.length < rule.need) continue;
    if (rule.techs.length && !rule.techs.some((t) => held.includes(t))) continue;
    era = rule.era;
  }
  return era;
}

export function eraIndex(era) {
  const i = ERAS.indexOf(era);
  return i < 0 ? 0 : i;
}

// ---------------------------------------------------------------------------
// Tools

/**
 * Craftable tools. `boost` multiplies the matching work, `yields` names the
 * resource stream it accelerates. Cost is paid from the civ's stockpile.
 */
export const TOOLS = {
  stone_axe: {
    name: 'Stone axe', era: 'Stone', yields: 'wood', boost: 1.45,
    cost: { wood: 4, rock: 2 }, tech: null,
  },
  flint_sickle: {
    name: 'Flint sickle', era: 'Fire', yields: 'food', boost: 1.4,
    cost: { wood: 3, rock: 3 }, tech: 'toolmaking',
  },
  bronze_pick: {
    name: 'Bronze pick', era: 'Bronze', yields: 'rock', boost: 1.6,
    cost: { wood: 4, metal: 3 }, tech: 'masonry',
  },
  iron_plough: {
    name: 'Iron plough', era: 'Iron', yields: 'food', boost: 1.85,
    cost: { wood: 6, metal: 6 }, tech: 'agriculture',
  },
  steel_hammer: {
    name: 'Steel hammer', era: 'Steel', yields: 'rock', boost: 2.0,
    cost: { wood: 5, metal: 10 }, tech: 'masonry',
  },
};

/** Tools this civ can currently craft, best-first. */
export function craftableTools(techs) {
  const era = eraIndex(eraOf(techs));
  return Object.entries(TOOLS)
    .filter(([, t]) => eraIndex(t.era) <= era && (!t.tech || techs[t.tech]))
    .sort((a, b) => b[1].boost - a[1].boost)
    .map(([key, t]) => ({ key, ...t }));
}

/** The best tool for a given resource stream, or null. */
export function bestToolFor(techs, yields) {
  return craftableTools(techs).find((t) => t.yields === yields) || null;
}

/** Can the stockpile afford this tool? */
export function canAfford(state, tool) {
  return Object.entries(tool.cost).every(([res, amt]) => (state[res] || 0) >= amt);
}

export function payFor(state, tool) {
  for (const [res, amt] of Object.entries(tool.cost)) state[res] -= amt;
}

// ---------------------------------------------------------------------------
// Animal companions

/**
 * Tameable species and what taming them grants. Gated on era so a Stone Age
 * band cannot walk out and domesticate a warhorse.
 */
// Species here must exist in the world — these are the fauna the game
// actually spawns (see INVOKE_FAUNA in civs.js and the Animal spawner).
// Listing species the world never produces silently disables taming.
export const COMPANIONS = {
  deer: { name: 'Deer', era: 'Stone', tameChance: 0.40, grants: { speed: 1.12 } },
  boar: { name: 'Boar', era: 'Stone', tameChance: 0.35, grants: { carry: 1.3 } },
  wolf: { name: 'Wolf', era: 'Fire', tameChance: 0.28, grants: { alertRadius: 1.5 } },
  warg: { name: 'Warg', era: 'Fire', tameChance: 0.20, grants: { speed: 1.25 } },
  panda: { name: 'Panda', era: 'Bronze', tameChance: 0.30, grants: { carry: 1.6 } },
  jaguar: { name: 'Jaguar', era: 'Bronze', tameChance: 0.18, grants: { alertRadius: 1.8 } },
};

/** Is this species tameable at the civ's current era? */
export function canTame(techs, species) {
  const c = COMPANIONS[species];
  if (!c) return false;
  return eraIndex(c.era) <= eraIndex(eraOf(techs));
}

// ---------------------------------------------------------------------------
// Hidden resources unlocked by tech milestones

/**
 * Resources invisible until the matching tech is researched — the "tech
 * milestones unlock new hidden map resources" requirement. Deposits exist in
 * the terrain from worldgen; the tech is what lets a civ *see and use* them.
 */
export const HIDDEN_RESOURCES = {
  copper: { tech: 'masonry', deposit: 'gravel', yields: 'metal', label: 'Copper seam' },
  iron: { tech: 'warcraft', deposit: 'basalt', yields: 'metal', label: 'Iron vein' },
  saltpetre: { tech: 'discipline', deposit: 'limestone', yields: 'rock', label: 'Saltpetre bed' },
};

export function revealedResources(techs) {
  return Object.entries(HIDDEN_RESOURCES)
    .filter(([, r]) => techs[r.tech])
    .map(([key, r]) => ({ key, ...r }));
}
