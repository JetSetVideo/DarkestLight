// Phase 3 verification — civilisation advancement, crafting, taming, schedules.
//
//   node scripts/test-phase3.mjs
//
// Checks the brief's stated criteria: units harvest, build road networks
// between structures, equip crafted tools, tame animal companions, and shift
// their schedules with the technological era.
import * as THREE from 'three';
import { Game } from '../src/game.js';
import { Building } from '../src/entities.js';
import { eraOf, ERAS, TOOLS, COMPANIONS, craftableTools, bestToolFor, canTame, revealedResources } from '../src/ai/crafting.js';
import { dayPlan, allPlans, scheduledIntent } from '../src/ai/schedule.js';
import { ROAD_SPEED_MUL } from '../src/engine/roads.js';

let failures = 0;
const check = (label, cond, detail = '') => {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`);
  if (!cond) failures++;
};

// --- 1. Era derivation (pure) ---------------------------------------------
console.log('\n[1] Technological eras derive from researched techs');
check('no techs -> Stone', eraOf({}) === 'Stone', eraOf({}));
check('toolmaking -> Fire', eraOf({ toolmaking: 1 }) === 'Fire', eraOf({ toolmaking: 1 }));
check('+masonry -> Bronze', eraOf({ toolmaking: 1, masonry: 1 }) === 'Bronze',
  eraOf({ toolmaking: 1, masonry: 1 }));
const ironTechs = { toolmaking: 1, masonry: 1, warcraft: 1 };
check('+warcraft -> Iron', eraOf(ironTechs) === 'Iron', eraOf(ironTechs));
const steelTechs = { ...ironTechs, agriculture: 1, discipline: 1 };
check('5 techs -> Steel', eraOf(steelTechs) === 'Steel', eraOf(steelTechs));

// --- 2. Tools gated by era -------------------------------------------------
console.log('\n[2] Tool availability advances with era');
const stoneTools = craftableTools({});
const steelTools = craftableTools(steelTechs);
check('Stone age has at least one tool', stoneTools.length >= 1,
  stoneTools.map(t => t.name).join(', '));
check('Steel age unlocks strictly more', steelTools.length > stoneTools.length,
  `${stoneTools.length} -> ${steelTools.length}`);
check('better tools at higher era', steelTools[0].boost > stoneTools[0].boost,
  `${stoneTools[0].boost} -> ${steelTools[0].boost}`);
check('bestToolFor picks by resource', bestToolFor(steelTechs, 'food')?.yields === 'food',
  bestToolFor(steelTechs, 'food')?.name);

// --- 3. Companions gated by era -------------------------------------------
console.log('\n[3] Animal companions gated by era');
check('boar tameable in Stone age', canTame({}, 'boar'));
check('jaguar NOT tameable in Stone age', !canTame({}, 'jaguar'));
check('jaguar tameable in Bronze age', canTame({ toolmaking: 1, masonry: 1 }, 'jaguar'));
check('every companion species exists in the world roster',
  Object.keys(COMPANIONS).every(s => ['deer', 'boar', 'wolf', 'warg', 'panda', 'jaguar', 'snake', 'fish'].includes(s)),
  Object.keys(COMPANIONS).join(', '));

// --- 4. Hidden resources ---------------------------------------------------
console.log('\n[4] Tech milestones reveal hidden resources');
check('nothing revealed with no techs', revealedResources({}).length === 0);
const revealed = revealedResources(steelTechs);
check('masonry/warcraft reveal deposits', revealed.length >= 2,
  revealed.map(r => r.label).join(', '));

// --- 5. Schedules shift with era ------------------------------------------
console.log('\n[5] Daily schedules shift with technological era');
const plans = allPlans();
console.table?.(plans);
const stone = dayPlan('Stone'), steel = dayPlan('Steel');
check('later eras wake earlier', steel.wake < stone.wake, `${stone.wake} -> ${steel.wake}`);
check('later eras work longer days', steel.wakingHours > stone.wakingHours,
  `${stone.wakingHours}h -> ${steel.wakingHours}h`);
check('later eras build more', steel.buildBias > stone.buildBias,
  `${stone.buildBias} -> ${steel.buildBias}`);
// 03:00 is night in every era
check('deep night sleeps in all eras',
  ERAS.every(era => scheduledIntent({ hour: 3, era, cls: 'farmer', rng: () => 0.9 }) === 'sleep'));
// Stone sleeps at 20:30; Steel is still awake
check('20:30 — Stone sleeps, Steel still works',
  scheduledIntent({ hour: 20.5, era: 'Stone', cls: 'farmer', rng: () => 0.9 }) === 'sleep' &&
  scheduledIntent({ hour: 20.5, era: 'Steel', cls: 'farmer', rng: () => 0.9 }) !== 'sleep');
check('exhaustion overrides the clock',
  scheduledIntent({ hour: 12, era: 'Steel', cls: 'farmer', energy: 5, rng: () => 0.9 }) === 'sleep');
check('devout classes take the prayer block',
  scheduledIntent({ hour: 5.5, era: 'Steel', cls: 'monk', rng: () => 0.99 }) === 'pray');

// --- 6. Live match: roads, tools, taming ----------------------------------
console.log('\n[6] Live match — units build roads, craft tools, tame animals');
const scene = new THREE.Scene();
const game = new Game({
  scene, camera: new THREE.PerspectiveCamera(), mode: 'battle',
  playerCiv: 'franks', enemyCiv: 'orcs',
  settings: { fog: false, particles: false, shadows: false, matchlen: 20, camspeed: 1 },
  onEnd: () => {}, msg: () => {},
});

// Grant techs so the player reaches a tool-bearing era quickly.
for (const t of ['toolmaking', 'masonry', 'agriculture']) game.state.player.techs[t] = 1;
game.state.player.wood = 400;
game.state.player.rock = 200;
game.state.player.metal = 120;

check('game exposes an era for each side', ERAS.includes(game.eraOf('player')),
  `player era=${game.eraOf('player')}`);
check('road network initialised', !!game.roads);

// A civ only completes its campfire within this window, and a road needs two
// endpoints — so place a second finished structure to exercise the network.
// (Road building in normal play therefore begins once a civ has 2 buildings.)
// Constructed directly rather than via game.build(), which runs the economy
// and site validator — we're exercising the road network, not the build rules.
const home = game.homeOf('player');
for (const [dx, dz] of [[16, 4], [-14, 10]]) {
  const bx = home.pos.x + dx, bz = home.pos.z + dz;
  if (game.terrain.isWater(bx, bz)) continue;
  game.buildings.push(new Building(game, 'player', 'hut', bx, bz, { constructing: false }));
}
check('test placed extra structures',
  game.buildings.filter(b => b.side === 'player' && !b.constructing).length >= 2,
  `${game.buildings.filter(b => b.side === 'player' && !b.constructing).length} finished`);

const dt = 1 / 20;
for (let t = 0; t < 9 * 60; t += dt) game.update(dt);

const tooled = game.creatures.filter((c) => c.side === 'player' && c.tool);
const tamers = game.creatures.filter((c) => c.companion);
const tamed = game.animals.filter((a) => a.tamedBy);

console.log(`  roads: ${JSON.stringify(game.roads.stats)}`);
console.log(`  tools equipped: ${tooled.length} (${[...new Set(tooled.map(c => c.tool.name))].join(', ') || 'none'})`);
console.log(`  companions: ${tamed.length} (${[...new Set(tamed.map(a => a.type))].join(', ') || 'none'})`);
console.log(`  player era after 9min: ${game.eraOf('player')}`);

check('routes were planned between structures', game.roads.stats.routesPlanned > 0,
  `${game.roads.stats.routesPlanned} routes`);
check('road cells were actually paved', game.roads.stats.cellsPaved > 0,
  `${game.roads.stats.cellsPaved} cells`);
check('units equipped crafted tools', tooled.length > 0, `${tooled.length} units`);
// Companions die and units are replaced during a match, so success is measured
// cumulatively; the live links are checked separately for consistency.
console.log(`  civStats: ${JSON.stringify(game.civStats)}`);
check('units attempted taming', game.civStats.tameAttempts > 0,
  `${game.civStats.tameAttempts} attempts`);
check('units tamed animal companions', game.civStats.tamed > 0,
  `${game.civStats.tamed} tamed over the match, ${tamers.length} still bonded`);
check('companion links are symmetric',
  tamers.every((c) => c.companion.tamedBy === c) && tamed.every((a) => a.tamedBy.companion === a),
  `${tamers.length} owners / ${tamed.length} animals`);
check('no dangling companion refs to dead animals',
  tamers.every((c) => game.animals.includes(c.companion)),
  'owners all point at live animals');

// Roads must beat the desert malus at the same spot.
const pavedCell = (() => {
  for (const r of game.roads.routes) {
    for (const p of r.points) if (game.roads.isPaved(p.x, p.z)) return p;
  }
  return null;
})();
if (pavedCell) {
  game.ecology.drainAt(pavedCell.x, pavedCell.z, 5, 3);
  game.ecology.tick(60);
  const roadMul = game.roads.speedFactorAt(pavedCell.x, pavedCell.z);
  check('paved ground beats the desertification malus', roadMul > 1,
    `road factor=${roadMul.toFixed(2)} (>1 means it overrides the 0.62 sand malus)`);
  check('road bonus within spec', roadMul <= ROAD_SPEED_MUL + 1e-6,
    `${roadMul.toFixed(3)} <= ${ROAD_SPEED_MUL}`);
} else {
  check('found a paved cell to test', false, 'no paved cells produced');
}

// Attributes exist on every unit.
const sample = game.creatures[0];
check('units carry morale / willpower / family',
  typeof sample.morale === 'number' && typeof sample.willpower === 'number' && !!sample.family,
  `morale=${sample.morale.toFixed(0)} willpower=${sample.willpower.toFixed(0)}`);
check('emotion reads as a label', typeof sample.emotion === 'string', sample.emotion);

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
