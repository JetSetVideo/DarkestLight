// Phase 1 verification harness — proves the environmental feedback loop
// headlessly, so the check is repeatable and survives future refactors.
//
//   node scripts/test-ecology.mjs
//
// Asserts, in order:
//   1. over-harvesting fertile ground turns it to desert
//   2. desertified ground applies a movement malus
//   3. flora rooted in the ruined cell dies
//   4. routing a river through the desert restores fertility and biome
//   5. moving a river is non-destructive (heights return to original)
import * as THREE from 'three';
import { Game } from '../src/game.js';
import { River } from '../src/generation/rivers.js';
import { BIOMES } from '../src/world.js';
import { DESERT_SPEED_MUL } from '../src/engine/ecology.js';

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera();
const game = new Game({
  scene, camera, mode: 'construction',
  playerCiv: 'franks', enemyCiv: 'orcs',
  settings: { fog: false, particles: false, shadows: false, matchlen: 20, camspeed: 1 },
  onEnd: () => {}, msg: () => {},
});

const eco = game.ecology;
const terrain = game.terrain;

let failures = 0;
const check = (label, cond, detail = '') => {
  console.log(`${cond ? '  PASS' : '  FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`);
  if (!cond) failures++;
};

/** Find a fertile land cell well away from the generated river corridor. */
function findFertileSpot() {
  for (let attempt = 0; attempt < 6000; attempt++) {
    const x = (Math.random() - 0.5) * 90;
    const z = (Math.random() - 0.5) * 90;
    if (terrain.isWater(x, z)) continue;
    if (terrain.getHeight(x, z) < 1.2) continue;
    // stay clear of the worldgen river valley so we test our own watering
    if (Math.abs(x - Math.sin(z * 0.055) * 10) < 26) continue;
    if (eco.fertilityAt(x, z) < 0.5) continue;
    return { x, z };
  }
  return null;
}

const spot = findFertileSpot();
if (!spot) {
  console.error('Could not find a fertile test cell — aborting.');
  process.exit(1);
}
const { x, z } = spot;
const k = eco.idxAt(x, z);
const originalBiome = terrain.biome[k];

console.log(`\nTest cell (${x.toFixed(1)}, ${z.toFixed(1)})  biome=${terrain.getBiomeKey(x, z)}  fertility=${eco.fertilityAt(x, z).toFixed(2)}`);

// Plant flora on the cell so we can watch it die.
game.spawnSeedling(x, z, 'oak');
game.spawnSeedling(x + 1, z, 'oak');
const floraBefore = game.resources.length;

// --- 1. over-exploitation --------------------------------------------------
console.log('\n[1] Over-harvesting fertile ground');
const speedBefore = eco.speedFactorAt(x, z);
for (let i = 0; i < 400; i++) {
  eco.drainAt(x, z, 0.05, 3.0);
  eco.tick(0.25);
}
check('fertility collapsed', eco.fertilityAt(x, z) < 0.25,
  `fertility=${eco.fertilityAt(x, z).toFixed(3)}`);
check('biome flipped to desert', terrain.biome[k] === BIOMES.desert.id,
  `biome=${terrain.getBiomeKey(x, z)}`);
check('marked as man-made desert', eco.isDesertified(x, z));

// --- 2. movement malus -----------------------------------------------------
console.log('\n[2] Movement penalty on desertified ground');
const speedAfter = eco.speedFactorAt(x, z);
check('speed factor dropped', speedAfter < speedBefore,
  `${speedBefore.toFixed(2)} -> ${speedAfter.toFixed(2)}`);
check('malus matches DESERT_SPEED_MUL', Math.abs(speedAfter - DESERT_SPEED_MUL) < 1e-6,
  `expected ${DESERT_SPEED_MUL}, got ${speedAfter.toFixed(3)}`);

// --- 3. flora died ---------------------------------------------------------
console.log('\n[3] Vegetation response');
check('flora on the ruined cell was removed', game.resources.length < floraBefore,
  `${floraBefore} -> ${game.resources.length} nodes`);

// --- 4. restoration by river ----------------------------------------------
console.log('\n[4] Routing a river through the wasteland');
const heightsBefore = Float32Array.from(terrain.heights);
const river = new River(
  [{ x: x - 30, z: z - 30 }, { x, z }, { x: x + 30, z: z + 30 }],
  { width: 5, depth: 1.0, flow: 0.9 },
);
game.rivers.add(river);

let restoredAt = -1;
for (let step = 0; step < 4000; step++) {
  river.flowTick(eco, 0.5);
  eco.tick(0.5);
  if (terrain.biome[k] !== BIOMES.desert.id) { restoredAt = step * 0.5; break; }
}
check('fertility recovered', eco.fertilityAt(x, z) > 0.5,
  `fertility=${eco.fertilityAt(x, z).toFixed(3)}`);
check('biome restored to its original type', terrain.biome[k] === originalBiome,
  `biome=${terrain.getBiomeKey(x, z)} (was ${BIOMES[Object.keys(BIOMES)[originalBiome]]?.name ?? originalBiome})`);
check('restoration took simulated time (not instant)', restoredAt > 0,
  `restored after ${restoredAt.toFixed(1)}s of flow`);
check('speed malus lifted', eco.speedFactorAt(x, z) === 1,
  `speed factor=${eco.speedFactorAt(x, z).toFixed(2)}`);

// --- 5. moving a river is non-destructive ---------------------------------
console.log('\n[5] Moving a watercourse restores the terrain it carved');
river.restore(terrain);
let maxDrift = 0;
for (let i = 0; i < terrain.heights.length; i++) {
  maxDrift = Math.max(maxDrift, Math.abs(terrain.heights[i] - heightsBefore[i]));
}
check('heights returned to pre-river values', maxDrift < 1e-5,
  `max drift=${maxDrift.toExponential(2)}`);

const moved = game.rivers.moveNearest(x, z, x + 12, z + 6, 40);
check('moveNearest found and re-routed a river', !!moved);

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
console.log(`ecology stats: ${JSON.stringify(eco.stats)}  activeCells=${eco.active.size}`);
process.exit(failures === 0 ? 0 : 1);
