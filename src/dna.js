// Expanded DNA: unique ID + XX/YY 4-number loci per trait.
// Phenotype = blend of average & median of the four parental numbers.
// Race mixing uses ancestry race keys independent of side allegiance.
import { clamp } from './util.js';
import { CIVS } from './civs.js';

/** ~3× the original 9-gene set — physical, mental, social, appearance. */
export const GENES = [
  // core (legacy)
  'speed', 'intelligence', 'resilience', 'strength', 'responsivity',
  'interactivity', 'emotion', 'longevity', 'nightsight',
  // physical
  'mass', 'height', 'reach', 'windDrag', 'swim', 'climb',
  // mental / social
  'curiosity', 'aggression', 'loyalty', 'fertility', 'faithAffinity', 'willpower',
  // appearance / adaptation
  'skinTone', 'hairTone', 'coatPattern', 'hornSize', 'heatTolerance', 'coldTolerance', 'moistureAffinity',
];

const LEGACY = new Set([
  'speed', 'intelligence', 'resilience', 'strength', 'responsivity',
  'interactivity', 'emotion', 'longevity', 'nightsight',
]);

function randLocus(rng, bias = 0.5) {
  // four ints 0..9 representing XX from P1-slot and YY from P2-slot at birth
  const base = clamp(bias, 0.05, 0.95);
  const n = () => clamp(Math.round((base + (rng() - 0.5) * 0.45) * 9), 0, 9);
  return [n(), n(), n(), n()];
}

export function phenotypeOf(locus) {
  if (!locus || locus.length < 4) return 0.5;
  const vals = locus.map(v => v / 9);
  const avg = (vals[0] + vals[1] + vals[2] + vals[3]) / 4;
  const sorted = [...vals].sort((a, b) => a - b);
  const med = (sorted[1] + sorted[2]) / 2;
  return clamp(avg * 0.55 + med * 0.45, 0.05, 1);
}

/** Flat phenotype map for gameplay (speed, strength, …). */
export function phenotypeMap(genome) {
  const out = {};
  for (const g of GENES) out[g] = phenotypeOf(genome.loci[g]);
  return out;
}

export function makeGenome(rng, civKey = 'franks', raceKey = null) {
  const civ = CIVS[civKey] || {};
  const bonus = civ.bonus || {};
  const loci = {};
  for (const g of GENES) {
    const bias = 0.45 + (bonus[g] || 0) * 0.8 + (LEGACY.has(g) ? 0 : (rng() - 0.5) * 0.1);
    loci[g] = randLocus(rng, bias);
  }
  // civ climate bias
  if (civKey === 'aztecs' || civKey === 'orcs') {
    loci.heatTolerance = randLocus(rng, 0.7);
    loci.skinTone = randLocus(rng, 0.65);
  }
  if (civKey === 'vikings' || civKey === 'elves') {
    loci.coldTolerance = randLocus(rng, 0.7);
    loci.skinTone = randLocus(rng, 0.35);
  }
  return {
    id: 'DL-' + Math.random().toString(36).slice(2, 8).toUpperCase() + (rng() * 1e3 | 0).toString(36).toUpperCase(),
    raceKey: raceKey || civKey,
    ancestry: [raceKey || civKey],
    loci,
  };
}

/**
 * XX/YY inheritance: child locus = [P1.x0, P1.x1, P2.y0, P2.y1] with small mutation,
 * then phenotype uses avg+median of the four.
 */
export function mixGenome(rng, mother, father, biomeHints = {}) {
  const loci = {};
  for (const g of GENES) {
    const a = mother.loci[g] || [4, 4, 4, 4];
    const b = father.loci[g] || [4, 4, 4, 4];
    // XX from parent A (first two), YY from parent B (last two) — randomly which parent is XX
    const pXX = rng() > 0.5 ? a : b;
    const pYY = pXX === a ? b : a;
    let child = [pXX[0], pXX[1], pYY[2], pYY[3]];
    // mutation ±1 on one slot sometimes
    if (rng() < 0.12) {
      const i = (rng() * 4) | 0;
      child[i] = clamp(child[i] + (rng() > 0.5 ? 1 : -1), 0, 9);
    }
    // biome adaptation drift
    if (g === 'heatTolerance' && biomeHints.hot) {
      if (rng() < 0.2) child[(rng() * 4) | 0] = clamp(child[0] + 1, 0, 9);
    }
    if (g === 'coldTolerance' && biomeHints.cold) {
      if (rng() < 0.2) child[(rng() * 4) | 0] = clamp(child[0] + 1, 0, 9);
    }
    if (g === 'moistureAffinity' && biomeHints.wet) {
      if (rng() < 0.2) child[(rng() * 4) | 0] = clamp(child[0] + 1, 0, 9);
    }
    // alignment evolution bias (optional extras on biomeHints)
    const driftToward = (target01) => {
      if (target01 == null || rng() >= 0.18) return;
      const i = (rng() * 4) | 0;
      const want = Math.round(clamp(target01, 0, 1) * 9);
      child[i] = clamp(child[i] + Math.sign(want - child[i]), 0, 9);
    };
    if (g === 'aggression') driftToward(biomeHints.aggression);
    if (g === 'loyalty') driftToward(biomeHints.cooperation);
    if (g === 'emotion' && biomeHints.harshness != null) driftToward(1 - biomeHints.harshness);
    loci[g] = child;
  }

  const rA = mother.raceKey || 'franks';
  const rB = father.raceKey || 'franks';
  let raceKey = rA;
  const ancestry = [...new Set([...(mother.ancestry || [rA]), ...(father.ancestry || [rB])])];
  if (rA !== rB) {
    // hybrid race key — stable order for visuals
    raceKey = [rA, rB].sort().join('+');
    ancestry.push(raceKey);
  }

  return {
    id: 'DL-' + Math.random().toString(36).slice(2, 8).toUpperCase() + (rng() * 1e3 | 0).toString(36).toUpperCase(),
    raceKey,
    ancestry: ancestry.slice(0, 6),
    loci,
    hybrid: rA !== rB,
  };
}

/** Compact readable string: ID · race · key trait digits */
/** Compact readable string: ID · race · trait codes · XX/YY sample */
export function dnaString(genomeOrPheno) {
  if (genomeOrPheno && genomeOrPheno.loci) {
    const g = genomeOrPheno;
    const ph = phenotypeMap(g);
    const keys = ['speed', 'intelligence', 'strength', 'resilience', 'emotion',
      'fertility', 'skinTone', 'heatTolerance', 'coldTolerance', 'faithAffinity'];
    const core = keys.map(k => k[0].toUpperCase() + Math.round(ph[k] * 9)).join('');
    const xxYy = ['speed', 'skinTone', 'fertility'].map(k => {
      const L = g.loci[k] || [4, 4, 4, 4];
      return `${k.slice(0, 3)}[${L[0]}${L[1]}|${L[2]}${L[3]}]`;
    }).join(' ');
    const hybrid = g.hybrid || (g.raceKey && g.raceKey.includes('+')) ? 'H' : '';
    return `${g.id}${hybrid}·${g.raceKey}·${core} · ${xxYy}`;
  }
  return GENES.filter(g => LEGACY.has(g)).map(g =>
    g[0].toUpperCase() + Math.round((genomeOrPheno[g] ?? 0.5) * 9)).join('·');
}

/** Pretty XX/YY dump for inspect panel */
export function dnaLociTable(genome, limit = 10) {
  if (!genome?.loci) return '';
  return GENES.slice(0, limit).map(k => {
    const L = genome.loci[k] || [4, 4, 4, 4];
    return `${k}:XX${L[0]}${L[1]}/YY${L[2]}${L[3]}→${phenotypeOf(L).toFixed(2)}`;
  }).join(' · ');
}

export function genomeFromLegacy(dna, civKey, rng = Math.random) {
  const g = makeGenome(rng, civKey);
  if (!dna) return g;
  for (const k of Object.keys(dna)) {
    if (!GENES.includes(k)) continue;
    const v = Math.round(clamp(dna[k], 0, 1) * 9);
    g.loci[k] = [v, v, v, v];
  }
  return g;
}

export function isHybrid(genome) {
  return !!(genome?.hybrid || (genome?.raceKey && genome.raceKey.includes('+')));
}
