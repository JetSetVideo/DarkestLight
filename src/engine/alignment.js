// Dual-axis alignment and its consequences.
//
//   goodEvil    -1 evil  ..  +1 good     (systems.js already tracks this as
//                                         `align.value` — kept as-is so every
//                                         existing consumer keeps working)
//   orderChaos  -1 chaos ..  +1 order    (new)
//
// The two axes are independent, giving four quadrants that read differently
// in play: an Orderly Evil god runs a grim but stable tyranny, a Chaotic Good
// god is a benevolent storm. Weather, terrain volatility, crop yield and
// structural decay all key off the pair.
//
// Mission manifests express these as -100..100 (see the EnArcheMissionManifest
// schema), so conversion helpers live here rather than in the loader.

import { clamp } from '../util.js';

/** Quadrant label for the HUD. */
export function quadrantLabel(align) {
  const g = align?.value ?? 0;
  const o = align?.order ?? 0;
  const moral = g > 0.3 ? 'Benevolent' : g < -0.3 ? 'Wrathful' : 'Impartial';
  const civil = o > 0.3 ? 'Ordered' : o < -0.3 ? 'Chaotic' : 'Wavering';
  if (Math.abs(g) <= 0.3 && Math.abs(o) <= 0.3) return 'Undecided';
  return `${civil} ${moral}`;
}

/** Nudge either axis. Returns the alignment for chaining. */
export function nudge(align, { good = 0, order = 0 } = {}) {
  if (!align) return align;
  if (good) align.value = clamp(align.value + good, -1, 1);
  if (order) align.order = clamp((align.order || 0) + order, -1, 1);
  return align;
}

/** Manifest form: both axes as -100..100 integers. */
export function toManifest(align) {
  return {
    goodEvil: Math.round((align?.value ?? 0) * 100),
    orderChaos: Math.round((align?.order ?? 0) * 100),
  };
}

/** Apply a manifest's initialAlignment block. */
export function fromManifest(align, initial = {}) {
  if (!align) return align;
  if (typeof initial.goodEvil === 'number') align.value = clamp(initial.goodEvil / 100, -1, 1);
  if (typeof initial.orderChaos === 'number') align.order = clamp(initial.orderChaos / 100, -1, 1);
  return align;
}

// ---------------------------------------------------------------------------
// Consequences

/**
 * Gameplay effects of the current alignment.
 *
 * Order stabilises the world; Chaos destabilises it. Good and Evil decide
 * whether that stability is nurturing or merely grim, so the two axes
 * multiply rather than sum.
 */
export function effectsFor(align) {
  const g = align?.value ?? 0;   // +good / -evil
  const o = align?.order ?? 0;   // +order / -chaos

  return {
    // Good + Order grow crops; Evil blights them.
    cropGrowthMul: clamp(1 + g * 0.35 + Math.max(0, o) * 0.15, 0.5, 1.6),
    // Order preserves buildings; Chaos rots them.
    structureDecayMul: clamp(1 - o * 0.45, 0.4, 1.8),
    // Chaos mutates biomes and cracks the ground open.
    biomeMutationChance: clamp(Math.max(0, -o) * 0.06, 0, 0.06),
    eruptionChance: clamp(Math.max(0, -o) * 0.035 + Math.max(0, -g) * 0.015, 0, 0.05),
    // Evil gods may spend lives for power; Good gods cannot.
    canSacrifice: g < -0.15,
    // Raw divine power multiplier from a sacrifice.
    sacrificeYield: clamp(18 + Math.max(0, -g) * 42, 18, 60),
  };
}

/**
 * Weather weighting by alignment.
 *
 * Returns multipliers applied to the season's base weather table, so seasons
 * still dominate — alignment tilts the odds rather than overriding climate.
 */
export function weatherBiasFor(align) {
  const g = align?.value ?? 0;
  const o = align?.order ?? 0;
  const chaos = Math.max(0, -o);
  const order = Math.max(0, o);
  const evil = Math.max(0, -g);

  return {
    sunny: 1 + order * 1.4 + Math.max(0, g) * 0.6,
    cloudy: 1 + order * 0.2,
    rain: 1 + Math.max(0, g) * 0.5 - order * 0.1,
    storm: 1 + chaos * 2.6 + evil * 1.2,
    snow: 1 + chaos * 0.4,
    blizzard: 1 + chaos * 2.0 + evil * 0.6,
    heatwave: 1 + chaos * 1.2 + evil * 1.4,
  };
}

/**
 * Pick weather from a season table, tilted by alignment.
 * @param {[string, number][]} table  season's [name, weight] pairs
 */
export function pickWeatherBiased(table, align, rng) {
  const bias = weatherBiasFor(align);
  let tot = 0;
  const weighted = table.map(([name, w]) => {
    const adj = w * (bias[name] ?? 1);
    tot += adj;
    return [name, adj];
  });
  let r = rng() * tot;
  for (const [name, w] of weighted) { r -= w; if (r <= 0) return name; }
  return weighted[0][0];
}

/**
 * How alignment colours a civilisation's evolution — fed into the DNA//culture
 * drift so races visibly diverge under different gods.
 */
export function evolutionBiasFor(align) {
  const g = align?.value ?? 0;
  const o = align?.order ?? 0;
  return {
    aggression: clamp(0.5 - g * 0.4 + Math.max(0, -o) * 0.2, 0, 1),
    cooperation: clamp(0.5 + g * 0.3 + Math.max(0, o) * 0.3, 0, 1),
    // Visual: evil/chaotic stock grows harsher, good/orderly softer.
    harshness: clamp(0.5 - g * 0.45 - o * 0.15, 0, 1),
  };
}
