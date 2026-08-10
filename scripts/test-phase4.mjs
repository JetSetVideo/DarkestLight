// Phase 4 verification — gestures, dual-axis alignment, weather & consequences.
//
//   node scripts/test-phase4.mjs
//
// Covers the brief's criteria: a drawn gesture triggers a spell, and player
// actions shift alignment which in turn alters weather and the landscape.
import * as THREE from 'three';
import { Game } from '../src/game.js';
import { recognizeShape } from '../src/util.js';
import {
  effectsFor, weatherBiasFor, pickWeatherBiased, quadrantLabel,
  nudge, toManifest, fromManifest, evolutionBiasFor,
} from '../src/engine/alignment.js';

let failures = 0;
const check = (label, cond, detail = '') => {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`);
  if (!cond) failures++;
};

// --- 1. Gesture recognition ------------------------------------------------
console.log('\n[1] Mouse gesture recognition');

/** Synthesise a screen-space stroke the way the cursor records one. */
const stroke = {
  circle: (n = 40, r = 60) => Array.from({ length: n }, (_, i) => {
    const a = (i / (n - 1)) * Math.PI * 2;
    return { x: 200 + Math.cos(a) * r, y: 200 + Math.sin(a) * r };
  }),
  line: (n = 30) => Array.from({ length: n }, (_, i) => ({ x: 200, y: 100 + i * 8 })),
  zigzag: (n = 48) => Array.from({ length: n }, (_, i) => ({
    x: 100 + i * 8, y: 200 + (i % 4 < 2 ? -40 : 40),
  })),
  spiral: (n = 90) => Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 6;
    const r = 8 + (i / n) * 70;
    return { x: 220 + Math.cos(a) * r, y: 220 + Math.sin(a) * r };
  }),
};

const recognised = {};
for (const [name, make] of Object.entries(stroke)) {
  recognised[name] = recognizeShape(make());
  console.log(`    ${name.padEnd(8)} -> ${recognised[name]}`);
}
check('a circle stroke is recognised', !!recognised.circle, `${recognised.circle}`);
check('a line stroke is recognised', !!recognised.line, `${recognised.line}`);
check('a zigzag stroke is recognised', !!recognised.zigzag, `${recognised.zigzag}`);
check('a spiral stroke is recognised', !!recognised.spiral, `${recognised.spiral}`);
check('distinct strokes map to distinct shapes',
  new Set(Object.values(recognised).filter(Boolean)).size >= 3,
  [...new Set(Object.values(recognised))].join(', '));
check('noise is rejected', recognizeShape([{ x: 0, y: 0 }, { x: 1, y: 1 }]) === null);

// --- 2. Dual-axis alignment ------------------------------------------------
console.log('\n[2] Dual-axis alignment');
const a = { value: 0, order: 0 };
check('starts Undecided', quadrantLabel(a) === 'Undecided', quadrantLabel(a));
nudge(a, { good: 0.8, order: 0.8 });
check('good + order -> Ordered Benevolent', quadrantLabel(a) === 'Ordered Benevolent', quadrantLabel(a));
nudge(a, { good: -1.6, order: -1.6 });
check('evil + chaos -> Chaotic Wrathful', quadrantLabel(a) === 'Chaotic Wrathful', quadrantLabel(a));
check('axes clamp to [-1,1]', a.value >= -1 && a.order >= -1, `${a.value}, ${a.order}`);
check('axes are independent',
  quadrantLabel({ value: 0.8, order: -0.8 }) === 'Chaotic Benevolent',
  quadrantLabel({ value: 0.8, order: -0.8 }));

// Manifest round-trip (EnArcheMissionManifest uses -100..100)
const m = toManifest({ value: 0.42, order: -0.7 });
check('serialises to manifest range', m.goodEvil === 42 && m.orderChaos === -70, JSON.stringify(m));
const restored = fromManifest({ value: 0, order: 0 }, { goodEvil: -55, orderChaos: 30 });
check('restores from a manifest block',
  Math.abs(restored.value + 0.55) < 1e-9 && Math.abs(restored.order - 0.30) < 1e-9,
  JSON.stringify(restored));

// --- 3. Alignment consequences --------------------------------------------
console.log('\n[3] Alignment drives gameplay effects');
const saint = effectsFor({ value: 1, order: 1 });
const tyrant = effectsFor({ value: -1, order: -1 });
console.log(`    saint : ${JSON.stringify(saint)}`);
console.log(`    tyrant: ${JSON.stringify(tyrant)}`);
check('good/order grows crops', saint.cropGrowthMul > 1.3, `${saint.cropGrowthMul.toFixed(2)}`);
check('evil/chaos blights crops', tyrant.cropGrowthMul < 0.8, `${tyrant.cropGrowthMul.toFixed(2)}`);
check('order preserves structures', saint.structureDecayMul < 0.7, `${saint.structureDecayMul.toFixed(2)}`);
check('chaos rots structures', tyrant.structureDecayMul > 1.3, `${tyrant.structureDecayMul.toFixed(2)}`);
check('only chaos mutates biomes',
  saint.biomeMutationChance === 0 && tyrant.biomeMutationChance > 0,
  `${saint.biomeMutationChance} vs ${tyrant.biomeMutationChance.toFixed(3)}`);
check('only chaos erupts volcanoes',
  saint.eruptionChance === 0 && tyrant.eruptionChance > 0,
  `${saint.eruptionChance} vs ${tyrant.eruptionChance.toFixed(3)}`);
check('good gods cannot sacrifice', saint.canSacrifice === false);
check('evil gods can sacrifice', tyrant.canSacrifice === true);

// --- 4. Weather responds to alignment -------------------------------------
console.log('\n[4] Weather bends to alignment');
const bias = { saint: weatherBiasFor({ value: 1, order: 1 }), tyrant: weatherBiasFor({ value: -1, order: -1 }) };
check('order favours clear skies', bias.saint.sunny > bias.tyrant.sunny,
  `${bias.saint.sunny.toFixed(2)} vs ${bias.tyrant.sunny.toFixed(2)}`);
check('chaos favours storms', bias.tyrant.storm > bias.saint.storm,
  `${bias.tyrant.storm.toFixed(2)} vs ${bias.saint.storm.toFixed(2)}`);

// Sample the biased picker to show the distribution genuinely moves.
const table = [['sunny', 40], ['cloudy', 25], ['rain', 20], ['storm', 10], ['heatwave', 5]];
const sample = (align) => {
  const counts = {};
  let seed = 12345;
  const rng = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let i = 0; i < 4000; i++) {
    const w = pickWeatherBiased(table, align, rng);
    counts[w] = (counts[w] || 0) + 1;
  }
  return counts;
};
const calm = sample({ value: 1, order: 1 });
const wild = sample({ value: -1, order: -1 });
console.log(`    ordered god : ${JSON.stringify(calm)}`);
console.log(`    chaotic god : ${JSON.stringify(wild)}`);
check('a chaotic god gets materially more storms',
  (wild.storm || 0) > (calm.storm || 0) * 2,
  `${calm.storm || 0} -> ${wild.storm || 0} storms per 4000`);
check('an orderly god gets more sun',
  (calm.sunny || 0) > (wild.sunny || 0),
  `${wild.sunny || 0} -> ${calm.sunny || 0}`);

// --- 5. Evolution bias -----------------------------------------------------
console.log('\n[5] Alignment colours race evolution');
const evSaint = evolutionBiasFor({ value: 1, order: 1 });
const evTyrant = evolutionBiasFor({ value: -1, order: -1 });
check('evil/chaos breeds aggression', evTyrant.aggression > evSaint.aggression,
  `${evSaint.aggression.toFixed(2)} -> ${evTyrant.aggression.toFixed(2)}`);
check('good/order breeds cooperation', evSaint.cooperation > evTyrant.cooperation,
  `${evTyrant.cooperation.toFixed(2)} -> ${evSaint.cooperation.toFixed(2)}`);
check('appearance harshness tracks alignment', evTyrant.harshness > evSaint.harshness,
  `${evSaint.harshness.toFixed(2)} -> ${evTyrant.harshness.toFixed(2)}`);

// --- 6. Live match: casting, sacrifice, chaos ------------------------------
console.log('\n[6] Live match — casting shifts alignment, chaos reshapes the island');
const scene = new THREE.Scene();
const game = new Game({
  scene, camera: new THREE.PerspectiveCamera(), mode: 'battle',
  playerCiv: 'franks', enemyCiv: 'orcs',
  settings: { fog: false, particles: false, shadows: false, matchlen: 20, camspeed: 1 },
  onEnd: () => {}, msg: () => {},
});
game.state.player.dp = 5000;

check('game exposes a quadrant label', typeof game.alignLabel === 'string', game.alignLabel);
check('cycles received the alignment', game.cycles.alignment === game.alignment);

// A destructive sigil should tilt wrathful AND chaotic.
const before = { good: game.alignment.value, order: game.alignment.order };
const pts = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(4, 0, 4), new THREE.Vector3(8, 0, 0)];
for (let i = 0; i < 8; i++) game.castSpell('player', 'zigzag', pts, {});
check('destructive casting tilts wrathful',
  game.alignment.value < before.good, `${before.good.toFixed(2)} -> ${game.alignment.value.toFixed(2)}`);
check('destructive casting tilts chaotic',
  game.alignment.order < before.order, `${before.order.toFixed(2)} -> ${game.alignment.order.toFixed(2)}`);

// A good god must be refused a sacrifice.
game.alignment.value = 0.6;
const victim = game.creatures.find((c) => c.side === 'player');
check('benevolent god refused a sacrifice', game.sacrifice(victim) === 0);

// An evil god may take it, and the cost compounds.
game.alignment.value = -0.6;
const dpBefore = game.state.player.dp;
const orderBefore = game.alignment.order;
const gained = game.sacrifice(victim);
check('wrathful god granted power for a life', gained > 0, `+${gained.toFixed(0)} dp`);
check('sacrifice credited divine power', game.state.player.dp > dpBefore,
  `${dpBefore.toFixed(0)} -> ${game.state.player.dp.toFixed(0)}`);
check('sacrifice drove alignment further toward chaos',
  game.alignment.order < orderBefore, `${orderBefore.toFixed(3)} -> ${game.alignment.order.toFixed(3)}`);
check('sacrifice was counted', game.alignment.sacrifices === 1);

// Drive the god fully chaotic and confirm the island actually changes.
game.alignment.value = -1; game.alignment.order = -1;
const heightsBefore = Float32Array.from(game.terrain.heights);
for (let i = 0; i < 400; i++) game.chaosTick();
let drift = 0;
for (let i = 0; i < heightsBefore.length; i++) {
  drift = Math.max(drift, Math.abs(game.terrain.heights[i] - heightsBefore[i]));
}
console.log(`    chaos events: ${JSON.stringify({ eruptions: game.alignment.eruptions || 0, mutations: game.alignment.mutations || 0 })}`);
check('a chaotic god erupted volcanoes', (game.alignment.eruptions || 0) > 0,
  `${game.alignment.eruptions || 0} eruptions`);
check('eruptions reshaped the terrain', drift > 0.5, `max height drift ${drift.toFixed(2)}`);
check('a chaotic god mutated biomes', (game.alignment.mutations || 0) > 0,
  `${game.alignment.mutations || 0} mutations`);

// A saintly god must leave the island alone.
const calmGame = new Game({
  scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), mode: 'battle',
  playerCiv: 'franks', enemyCiv: 'orcs',
  settings: { fog: false, particles: false, shadows: false, matchlen: 20, camspeed: 1 },
  onEnd: () => {}, msg: () => {},
});
calmGame.alignment.value = 1; calmGame.alignment.order = 1;
for (let i = 0; i < 400; i++) calmGame.chaosTick();
check('a benevolent orderly god causes no eruptions',
  !calmGame.alignment.eruptions && !calmGame.alignment.mutations,
  `eruptions=${calmGame.alignment.eruptions || 0} mutations=${calmGame.alignment.mutations || 0}`);

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
