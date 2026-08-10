// Verification for wiring generated assets into models.js.
//
//   node scripts/test-asset-bridge.mjs
//
// The bridge must satisfy two opposing requirements:
//   - enabled:  generated geometry actually replaces the procedural shell
//   - disabled: the game looks and behaves exactly as it did before
// and in both cases animated parts and entity picking must survive.
import * as THREE from 'three';
import { buildBuilding } from '../src/models.js';
import {
  setGeneratedAssets, generatedAssetsEnabled, requestUpgrade, flushUpgrades,
  revertUpgrade, bridgeStats, resetBridge, assetLibrary,
} from '../src/generation/assetBridge.js';
import { Game } from '../src/game.js';

let failures = 0;
const check = (label, cond, detail = '') => {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`);
  if (!cond) failures++;
};

const countVisibleMeshes = (g) => {
  let n = 0;
  g.traverse((o) => { if (o.isMesh && o.visible) n++; });
  return n;
};
const hasGenerated = (g) => !!g.userData?.dlGenerated;

// --- 1. Default is off with the offline provider ---------------------------
console.log('\n[1] Default behaviour with the offline provider');
resetBridge();
check('generated assets default OFF when no Imagen key is configured',
  generatedAssetsEnabled() === false,
  `provider=${assetLibrary().imagen.provider.name}`);

const proc = buildBuilding('hut', 'franks');
await flushUpgrades();
check('procedural hut built normally', countVisibleMeshes(proc) > 0, `${countVisibleMeshes(proc)} meshes`);
check('no generated geometry attached', !hasGenerated(proc));
check('requests were skipped, not failed', bridgeStats.skipped > 0 && bridgeStats.failed === 0,
  JSON.stringify(bridgeStats));

// --- 2. Forced on: geometry is genuinely swapped ---------------------------
console.log('\n[2] Forced on — generated geometry replaces the shell');
resetBridge();
setGeneratedAssets(true);
check('feature reports enabled', generatedAssetsEnabled() === true);

const hut = buildBuilding('hut', 'franks');
const beforeVisible = countVisibleMeshes(hut);
await flushUpgrades();
check('generated LOD attached', hasGenerated(hut));
check('generated node is a THREE.LOD', hut.userData.dlGenerated?.isLOD === true);
check('LOD has 3 detail levels', hut.userData.dlGenerated?.levels.length === 3,
  `${hut.userData.dlGenerated?.levels.length}`);
check('procedural shell was hidden', countVisibleMeshes(hut) !== beforeVisible,
  `${beforeVisible} visible before, ${countVisibleMeshes(hut)} after`);
check('upgrade counted', bridgeStats.upgraded > 0, JSON.stringify(bridgeStats));

// Scale must match the placeholder footprint, or buildings float/sink.
const procBox = new THREE.Box3().setFromObject(buildBuilding('hut', 'franks'));
const genBox = new THREE.Box3().setFromObject(hut.userData.dlGenerated);
const ps = new THREE.Vector3(), gs = new THREE.Vector3();
procBox.getSize(ps); genBox.getSize(gs);
check('generated mesh matches the procedural height', Math.abs(gs.y - ps.y) < ps.y * 0.5 + 0.5,
  `procedural ${ps.y.toFixed(2)} vs generated ${gs.y.toFixed(2)}`);

// --- 3. Animated parts survive --------------------------------------------
console.log('\n[3] Animated and emissive parts survive the swap');
resetBridge();
setGeneratedAssets(true);
const campfire = buildBuilding('campfire', 'franks');
const flameRef = campfire.userData.flame;
const flame2Ref = campfire.userData.flame2;
await flushUpgrades();
check('campfire upgraded', hasGenerated(campfire));
check('flame reference still points at a live object', !!flameRef && !!flameRef.material,
  flameRef ? 'flame present' : 'flame missing');
check('flame is still visible (not hidden by the swap)', flameRef?.visible === true);
check('second flame still visible', flame2Ref ? flame2Ref.visible === true : true);
check('the light source survives', (() => {
  let lit = false;
  campfire.traverse((o) => { if (o.isLight && o.visible) lit = true; });
  return lit;
})());

// --- 4. Entity picking survives -------------------------------------------
console.log('\n[4] Entity back-links survive the swap');
resetBridge();
setGeneratedAssets(true);
const tagged = buildBuilding('hut', 'franks');
const fakeEntity = { id: 42, name: 'test-building' };
tagged.traverse((o) => Object.defineProperty(o.userData, 'entity', {
  value: fakeEntity, enumerable: false, writable: true, configurable: true,
}));
await flushUpgrades();
let untagged = 0;
tagged.userData.dlGenerated?.traverse((o) => { if (o.userData.entity !== fakeEntity) untagged++; });
check('every generated child is tagged for picking', untagged === 0, `${untagged} untagged`);
check('back-link stays non-enumerable (clone-safe)',
  !Object.keys(tagged.userData.dlGenerated.userData).includes('entity'));
// The Phase 0 crash class: cloning must still work.
let cloneOk = true;
try { tagged.clone(); } catch { cloneOk = false; }
check('the upgraded group still clones (no circular userData)', cloneOk);

// --- 5. Revert -------------------------------------------------------------
console.log('\n[5] Reverting restores the procedural look');
revertUpgrade(tagged);
check('generated node removed', !hasGenerated(tagged));
check('procedural children visible again', countVisibleMeshes(tagged) > 0,
  `${countVisibleMeshes(tagged)} meshes`);

// --- 6. Failure tolerance --------------------------------------------------
console.log('\n[6] Generation failure leaves the procedural mesh intact');
resetBridge();
setGeneratedAssets(true);
const lib = assetLibrary();
const origBuild = lib.build.bind(lib);
lib.build = () => Promise.reject(new Error('simulated provider outage'));
const resilient = buildBuilding('temple', 'franks');
const visibleBefore = countVisibleMeshes(resilient);
await flushUpgrades();
check('failure was recorded', bridgeStats.failed > 0, JSON.stringify(bridgeStats));
check('no generated geometry attached', !hasGenerated(resilient));
check('procedural mesh untouched and visible', countVisibleMeshes(resilient) === visibleBefore,
  `${visibleBefore} meshes`);
lib.build = origBuild;

// --- 7. A live match still runs with the feature on ------------------------
console.log('\n[7] A live match runs with generated assets enabled');
resetBridge();
setGeneratedAssets(true);
const game = new Game({
  scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), mode: 'battle',
  playerCiv: 'franks', enemyCiv: 'orcs',
  settings: { fog: false, particles: false, shadows: false, matchlen: 20, camspeed: 1 },
  onEnd: () => {}, msg: () => {},
});
const dt = 1 / 20;
for (let t = 0; t < 120; t += dt) game.update(dt);
await flushUpgrades();
const upgradedBuildings = game.buildings.filter((b) => hasGenerated(b.mesh)).length;
console.log(`    bridge: ${JSON.stringify(bridgeStats)}`);
console.log(`    buildings upgraded: ${upgradedBuildings}/${game.buildings.length}`);
check('the match ran without error', game.creatures.length > 0, `${game.creatures.length} units`);
check('buildings received generated meshes', upgradedBuildings > 0, `${upgradedBuildings}`);
// The meaningful caching measure is deduplication: many requests, few builds.
// (cacheHits only counts hits on *completed* entries; requests that arrive
// while a build is still in flight are deduped via the pending map instead,
// which is the common case when a match spawns everything at once.)
const dedupe = assetLibrary().stats.built;
check('many asset requests collapsed into few builds',
  dedupe > 0 && dedupe < bridgeStats.requested / 4,
  `${bridgeStats.requested} requests -> ${dedupe} builds`);
check('every distinct asset built exactly once',
  dedupe === assetLibrary().entries.size,
  `${dedupe} builds, ${assetLibrary().entries.size} cached entries`);

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
