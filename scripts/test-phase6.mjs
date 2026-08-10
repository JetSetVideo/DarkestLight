// Phase 6 verification — story campaign, mission manifests, progression.
//
//   node scripts/test-phase6.mjs
//
// The brief's check: the player can launch Story Mode, complete guided
// objectives sequentially, and automatically unlock the next mission.
import * as THREE from 'three';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Game } from '../src/game.js';
import { Campaign, MISSION_FILES, validateManifest } from '../src/quests/campaign.js';
import { QUEST_STATE, TRIGGER_TYPES, OBJECTIVE_TYPES, WEATHER_SHIFTS } from '../src/quests/questEngine.js';
import { ERAS } from '../src/ai/crafting.js';

const here = dirname(fileURLToPath(import.meta.url));
const missionsDir = join(here, '..', 'data', 'missions');
const reader = async (file) => JSON.parse(await readFile(join(missionsDir, file), 'utf8'));

let failures = 0;
const check = (label, cond, detail = '') => {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`);
  if (!cond) failures++;
};

// --- 1. Manifests load and validate ---------------------------------------
console.log('\n[1] Mission manifests');
const campaign = new Campaign();
const missions = await campaign.load(reader);
check('all mission files loaded', missions.length === MISSION_FILES.length,
  `${missions.length} of ${MISSION_FILES.length}`);
check('every manifest validates', missions.every((m) => validateManifest(m).length === 0));
check('the three tutorials are present',
  missions.filter((m) => m.difficulty === 'Tutorial').length === 3,
  missions.filter((m) => m.difficulty === 'Tutorial').map((m) => m.title).join(', '));
check('mission 1 is present', !!campaign.byId('mission-01'), campaign.byId('mission-01')?.title);
check('missions are ordered', missions.every((m, i) => i === 0 || (missions[i - 1].order ?? 0) <= (m.order ?? 0)),
  missions.map((m) => m.order).join(' -> '));

for (const m of missions) {
  const triggersOk = m.quests.every((q) => TRIGGER_TYPES.includes(q.triggerCondition?.type));
  const objsOk = m.quests.every((q) => q.objectives.every((o) => OBJECTIVE_TYPES.includes(o.type)));
  const weatherOk = m.quests.every((q) => !q.rewards?.weatherShift || WEATHER_SHIFTS.includes(q.rewards.weatherShift));
  const alignOk = !m.initialAlignment ||
    (Math.abs(m.initialAlignment.orderChaos) <= 100 && Math.abs(m.initialAlignment.goodEvil) <= 100);
  console.log(`    ${m.missionId.padEnd(12)} "${m.title}" · ${m.difficulty} · ${m.startingAge} · ${m.quests.length} quests`);
  check(`  ${m.missionId}: schema enums valid`, triggersOk && objsOk && weatherOk && alignOk);
}

check('tutorial 1 covers terrain + rivers + restoration',
  /terrain|earth/i.test(JSON.stringify(campaign.byId('tutorial-01'))) &&
  /river|water/i.test(JSON.stringify(campaign.byId('tutorial-01'))));
check('tutorial 2 covers roads + tools + companions', (() => {
  const t = JSON.stringify(campaign.byId('tutorial-02'));
  return /BuildRoad/.test(t) && /CraftTools/.test(t) && /TameCompanions/.test(t);
})());
check('tutorial 3 covers gestures + weather + alignment', (() => {
  const t = campaign.byId('tutorial-03');
  return t.quests.some((q) => q.objectives.some((o) => o.type === 'CastSpell')) &&
    t.quests.some((q) => q.rewards?.weatherShift && q.rewards.weatherShift !== 'None') &&
    t.quests.some((q) => q.rewards?.alignmentImpact);
})());
check('mission 1 faces a low-aggression chaos AI', (() => {
  const m = campaign.byId('mission-01');
  return m.aiGod?.aggression <= 0.3 && m.aiGod?.initialAlignment?.orderChaos < 0;
})(), JSON.stringify(campaign.byId('mission-01')?.aiGod));

// --- 2. Progression gating -------------------------------------------------
console.log('\n[2] Sequential progression and unlocks');
campaign.reset();
check('only the first mission starts unlocked',
  campaign.playable.length === 1 && campaign.playable[0].missionId === 'tutorial-01',
  campaign.playable.map((m) => m.missionId).join(', '));
check('later missions are locked', !campaign.isUnlocked('tutorial-02') && !campaign.isUnlocked('mission-01'));
check('next() points at tutorial 1', campaign.next?.missionId === 'tutorial-01', campaign.next?.missionId);

const step1 = campaign.completeMission('tutorial-01');
check('completing tutorial 1 unlocks tutorial 2', step1.unlocked === 'tutorial-02', JSON.stringify(step1));
check('tutorial 1 records as complete', campaign.isCompleted('tutorial-01'));
check('next() advances', campaign.next?.missionId === 'tutorial-02', campaign.next?.missionId);
check('mission 1 still locked', !campaign.isUnlocked('mission-01'));

campaign.completeMission('tutorial-02');
const step3 = campaign.completeMission('tutorial-03');
check('the tutorials chain into mission 1', step3.unlocked === 'mission-01', JSON.stringify(step3));
check('all four are now unlocked', campaign.playable.length === 4, `${campaign.playable.length}`);

const rep = campaign.report();
check('report summarises progress', rep.total === 4 && rep.completed === 3, JSON.stringify(rep.missions.map(m => m.id + (m.completed ? '*' : ''))));

// Persistence across instances (shared in-memory store when no localStorage).
const campaign2 = new Campaign({ store: campaign.store });
await campaign2.load(reader);
check('progress persists across sessions',
  campaign2.isCompleted('tutorial-01') && campaign2.isUnlocked('mission-01'),
  `completed=${campaign2.progress.completed.length}`);

campaign2.reset();
check('reset returns to a fresh campaign',
  campaign2.progress.completed.length === 0 && campaign2.playable.length === 1);

// --- 3. A mission actually configures a match ------------------------------
console.log('\n[3] Missions configure the match they launch');
const mkGame = () => new Game({
  scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), mode: 'battle',
  playerCiv: 'franks', enemyCiv: 'orcs',
  settings: { fog: false, particles: false, shadows: false, matchlen: 20, camspeed: 1 },
  onEnd: () => {}, msg: () => {},
});

const g = mkGame();
const t3 = campaign.byId('tutorial-03');
g.applyMission(t3);
check('mission quests replaced the generated set',
  g.quests.quests.length === t3.quests.length &&
  g.quests.quests.every((q) => t3.quests.some((tq) => tq.questId === q.questId)),
  `${g.quests.quests.length} quests`);
check('starting age granted the right techs', ERAS.indexOf(g.eraOf('player')) >= ERAS.indexOf('Bronze'),
  `${g.eraOf('player')} (manifest asked for ${t3.startingAge})`);

const gm = mkGame();
gm.applyMission(campaign.byId('mission-01'));
check('rival god inherited the manifest alignment',
  gm.enemyAlignment.order < 0 && gm.enemyAlignment.value < 0,
  `order=${gm.enemyAlignment.order} good=${gm.enemyAlignment.value}`);
check('rival aggression applied', gm.aiAggression === 0.25, `${gm.aiAggression}`);

// --- 4. Playing a mission to completion unlocks the next -------------------
console.log('\n[4] Completing objectives sequentially unlocks the next chapter');
const fresh = new Campaign({ store: { _m: new Map(), getItem(k) { return this._m.get(k) ?? null; }, setItem(k, v) { this._m.set(k, v); }, removeItem(k) { this._m.delete(k); } } });
await fresh.load(reader);

const play = mkGame();
play.applyMission(fresh.byId('tutorial-03'));
play.state.player.dp = 100000;

check('mission starts with no quest complete', !play.missionWon);

// Drive the objectives: tutorial-03 is a casting mission.
const pts = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(3, 0, 3), new THREE.Vector3(6, 0, 0)];
const dt = 1 / 20;
for (let step = 0; step < 900 && !play.missionWon; step++) {
  for (let i = 0; i < 3; i++) play.castSpell('player', 'circle', pts, {});
  play.update(dt);
  play.quests.tick();
}

const states = play.quests.quests.map((q) => `${q.questId}:${q.state}`);
console.log(`    quest states: ${states.join(', ')}`);
console.log(`    quest log: ${play.quests.log.length} entries, ${play.quests.stats.completed} completed`);
check('every mission objective completed',
  play.quests.quests.every((q) => q.state === QUEST_STATE.COMPLETE), states.join(', '));
check('missionWon reports true', play.missionWon === true);

const unlock = fresh.completeMission('tutorial-03');
check('finishing the mission unlocks mission 1', unlock.unlocked === 'mission-01', JSON.stringify(unlock));
check('the newly unlocked mission is playable', fresh.isUnlocked('mission-01'));
check('quest rewards were applied (VP earned)', fresh && play.quests.vpFor('player') > 0,
  `${play.quests.vpFor('player')} VP`);

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
