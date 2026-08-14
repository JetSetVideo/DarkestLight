// Canonical generation catalogs — every worldgen / populate / visual
// pipeline reads these instead of repeating magic numbers.
// Add-only: new species, biomes, or knobs go here; callers import them.

/** Island plan and adversarial relief (world.js). */
export const RELIEF = {
  plateFreq: 0.038, plateAmp: 12.5, plateBias: -2.2,
  ridgeFreq: 0.055, ridgePow: 1.55, ridgeAmp: 4.5,
  valleyFreq: 0.07, valleyPow: 2.0, valleyAmp: 2.8, valleyRidgeDampen: 0.35,
  falloffStart: 0.88, falloffSpread: 4.2, falloffAmp: 11,
  riverWidth: 7, riverWiggle: 10, riverNoise: 4, riverFloor: -2.4, riverPow: 1.6,
  clipFreq: 0.16, clipThresh: 0.56, clipStep: 1.25, clipStepGain: 3.4,
  volRadius: 28, volPow: 1.8, volBase: 0.55, volNoise: 0.45, volUpliftThresh: 0.35, volUplift: 9,
  shaftFreq: 0.2, shaftThresh: 0.92, shaftCut: 54,
  inlandFreshPoly: 0.82,
  erodePasses: 4, hydraulicPasses: 2, talus: 0.78,
  oceanScale: 1.22, lakeCountMin: 2, lakeCountExtra: 2,
  lakeRadiusMin: 4.2, lakeRadiusSpan: 3.8, lakeFloor: 0.65,
};

/** Temperature / humidity climate mixing. */
export const CLIMATE_GEN = {
  tempBase: 0.22, tempLat: 0.55, tempNoise: 0.22, lapse: 0.55, volHeat: 0.35,
  humBase: 0.7, oroGain: 2.2, oroMin: -0.25, oroMax: 0.35,
  riverMoistR: 12, riverMoist: 0.35, shoreMoist: 0.2,
  dryFront: 0.55, volDry: 0.15, coldHold: 0.55,
};

/** Flora site rules + DNA defaults that drive tree geometry. */
export const FLORA = {
  pine: {
    min: 14, max: 70, maxSlope: 1.35, minAlt: 2.4, nearFresh: 0, desertOk: 0.15,
    cluster: 7, highAlt: 6.2,
    dna: { vigor: 0.62, branch: 0.38, trunk: 0.72, spread: 0.28 },
    wood: 0x5a4630, canopy: [0x2d5b3a, 0x356847],
  },
  cherry: {
    min: 5, max: 26, maxSlope: 0.42, minAlt: 0.4, nearFresh: 1, desertOk: 0,
    cluster: 5, highAlt: 99,
    dna: { vigor: 0.48, branch: 0.62, trunk: 0.42, spread: 0.32 },
    wood: 0x6b4f30, canopy: [0xe8a9c9, 0xf0b8d0],
  },
  oak: {
    min: 22, max: 110, maxSlope: 0.52, minAlt: 0.55, nearFresh: 0.25, desertOk: 0,
    cluster: 6, highAlt: 99,
    dna: { vigor: 0.58, branch: 0.55, trunk: 0.58, spread: 0.3 },
    wood: 0x6b4f30, canopy: [0x3f7a35, 0x498a3d, 0x3a6e30],
  },
  palm: {
    min: 6, max: 36, maxSlope: 0.4, minAlt: 0.25, nearFresh: 0.55, desertOk: 0.2,
    cluster: 5, highAlt: 99,
    dna: { vigor: 0.55, branch: 0.7, trunk: 0.65, spread: 0.26 },
    wood: 0x6b4f30, canopy: [0x4a9440],
  },
};

export const FLORA_PLACE = {
  tries: 1800, cap: 520, margin: 16, minH: 0.45,
  volcanicRockChance: 0.08, clusterBias: 0.35, bushIfNotCluster: 0.22,
  scatterChance: 0.22, bushShare: 0.5, rockShare: 0.82,
  saplingChance: 0.4, minFillGuard: 80, stickChance: 0.55,
  stickMin: 0.8, stickSpan: 1.8, freshProbe: 3.2, freshSamples: 8,
  cherryVsOak: 0.45, cherryOnFertile: 0.12, fertileMin: 0.35,
  slopeProbe: 2.2, seasonMul: { Spring: 1.28, Summer: 1.12, Autumn: 0.68, Winter: 0.32 },
  growPeriod: 420, maxGrowth: 1.35, saplingGrowth: 0.22, adultGrowthMin: 0.55,
  sway: 0.045, yieldTree: 14, yieldSapling: 3, yieldBush: 20, yieldRock: 10, yieldMetal: 7,
};

/** Starting tribe, hearth pad, vision, lift. */
export const TRIBE = {
  roster: ['king', 'queen', 'gatherer', 'hunter'],
  ageMin: 20, ageSpan: 10,
  spawnRMin: 1.8, spawnRSpan: 2.2,
  hearthR: 6.2, royalWorkUntilPop: 8,
  yearSec: 12,
  startFood: 55, startWood: 24, startRock: 8, startMetal: 2, startDp: 100,
  popBase: 14, popPerHut: 6, popPerTech: 3, popPerAgeSlice: 2, ageSliceSec: 300,
};

export const HEARTH = {
  stoneSlots: 28, logSlots: 12, extraFlames: 4, torches: 6,
  torchR: 6.2, ringBase: 1.15, ringPerCap: 0.055, ringMax: 1.6,
  padBase: 5.4, padPerPop: 0.32, padMax: 14, padGrowStep: 0.45,
  woodNorm: 60, fuelNorm: 80,
  siteTries: 280, siteMinH: 0.8, siteMaxH: 4.8, siteSlope: 0.38, siteSlopeR: 7,
  siteSpreadPvp: 22, siteSpreadSolo: 50, siteOffPvp: 28, siteOffSolo: 0,
  siteZPvp: 70, siteZSolo: 55, fallbackPvp: 35, fallbackSolo: 8,
};

export const VISION = {
  base: 4.2, eyeSpan: 2.4, nightMoon: 0.55, nightDark: 0.32,
  fovBase: 0.5, fovEye: 0.28, behindFrac: 0.28, bodyFrac: 0.22,
  coneScale: 0.92, diskScale: 0.28,
  buildingNight: 8, buildingDay: 13,
};

export const INTERACT = {
  huntR: 5, huntDropR2: 16, fishR: 8, homeReturnR2: 36,
  kinStand: true, paveChance: 0.12, paveFirst: 0.82, paveMax: 1, tameChance: 0.45, craftChance: 0.5,
};

/** Per-species trunk / canopy geometry (models.js). */
export const TREE_GEOM = {
  scaleMin: 0.62, scaleSpan: 0.55, lean: 0.18,
  rootBase: 3, rootSpan: 4, rootLen: 0.22, rootLenSpan: 0.18,
  limbBase: 1, limbSpan: 3, limbLen: 0.28, limbLenSpan: 0.34,
  grainBase: 3, grainSpan: 5,
  pine: { trunkLen: 0.85, trunkRMul: 0.9, layers: 3, layerSpan: 2, coneR: 0.55, coneStep: 0.12, coneH: 0.7 },
  palm: { trunkLen: 1.5, trunkRMul: 1, leafBase: 5, leafSpan: 3, leafW: 0.7, leafH: 0.035 },
  cherry: { trunkLen: 0.7, trunkRMul: 1, crown: 0.45, puff: 0.28 },
  oak: { trunkLen: 0.7, trunkRMul: 1, crown: 0.42, puffMul: 0.65 },
};

export const LIFT = {
  holdSec: 1000, hover: 0.55, hoverGain: 0.28, sideX: 0.7, sideZ: 0.25,
  dropR: 3.4, camFloor: 2.4,
};

export const FAUNA = {
  civAnimals: 5, snakes: 5, relics: 2,
  lakeSchool: 10, lakeRFrac: 0.5,
  freshSchools: 4, freshN: 8, freshR: 3.2,
  seaSchools: 3, seaN: 5, seaR: 2.4,
  fishScale: 0.42, avatarScale: 2.4, avatarHp: 180,
};

export const WAVE = {
  sunnyAmp: 0.06, stormAmp: 0.55, windAmp: 0.25,
  stormFull: 1, rainN: 0.45, cloudyN: 0.18, calmN: 0.04,
  inlandCalm: 0.06, foamFreshCut: 0.88,
  bobAmp: 0.06, bobFreq: 0.04,
  defaultAmp: 0.18,
};

export const TEXTURE = {
  size: 64, variance: 34,
  clothRepeat: 2.4, barkRepeat: 1.8, rockRepeat: 1.6, skinRepeat: 1.2,
};

export const SEASON_GROWTH = FLORA_PLACE.seasonMul;

export function hashWorldSeed(raw) {
  if (raw == null || raw === '') return (Math.random() * 1e9) | 0;
  const n = Number(raw);
  if (Number.isFinite(n) && String(raw).trim() !== '') return (n >>> 0) || 1;
  let h = 2166136261;
  const s = String(raw);
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function rollFloraDna(rng, kind = 'oak') {
  const spec = FLORA[kind] || FLORA.oak;
  const d = spec.dna;
  return {
    vigor: Math.max(0.08, Math.min(1, d.vigor + (rng() - 0.5) * d.spread)),
    branch: Math.max(0.08, Math.min(1, d.branch + (rng() - 0.5) * d.spread)),
    trunk: Math.max(0.08, Math.min(1, d.trunk + (rng() - 0.5) * d.spread)),
    moistureAffinity: spec.nearFresh,
    heatTolerance: spec.desertOk,
    kind,
    wood: spec.wood,
    canopy: spec.canopy.slice(),
  };
}
