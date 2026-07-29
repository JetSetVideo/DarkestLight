// Bootstrap: renderer, scene, camera rig, god cursor, UI and game lifecycle.
import * as THREE from 'three';
import { Game } from './game.js';
import { UI } from './ui.js';
import { CameraRig, GodCursor } from './cursor.js';
import { CIV_KEYS } from './civs.js';
import { detectPlatform, loadKeybinds, buildUserReport } from './platform.js';

const canvas = document.getElementById('game-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0d0f14);

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 600);
const rig = new CameraRig(camera);

// Detect language / hardware / keyboard on launch (French → AZERTY on Mac M1, etc.)
const platform = detectPlatform();
let keybinds = loadKeybinds(platform.layout);
rig.setKeybinds(keybinds);
console.info('[DarkestLight] platform', platform);
console.info('[DarkestLight] keybinds', keybinds);
// stash a quiet report snapshot for support
try { window.__DL_REPORT__ = buildUserReport({ boot: true }); } catch { /* ignore */ }

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

let game = null;

const ui = new UI({
  onStartGame: (mode, civKey) => startGame(mode, civKey),
  onQuitGame: () => endGame(),
  onSelectTool: (tool) => {
    cursor.tool = tool;
    if (tool !== 'build') cursor.clearPhantom();
    if (tool === 'build') ui.renderBuildMenu();
  },
  onSelectBuild: (type) => { cursor.buildType = type; ui.msg(`Placing: ${type} — green pad = valid site`); },
  onCenterCamera: (pos) => { rig.target.set(pos.x, pos.y, pos.z); },
  onKeybindsChange: (binds) => { keybinds = binds; rig.setKeybinds(binds); },
});

const cursor = new GodCursor({
  canvas, camera, rig,
  getGame: () => game,
  onInspect: (ent) => { if (game) ui.inspect(game, ent); },
  msg: (t) => ui.msg(t),
});

function startGame(mode, playerCiv) {
  endGame();
  ui.saveSettings?.();
  const enemies = CIV_KEYS.filter(k => k !== playerCiv);
  const enemyCiv = enemies[(Math.random() * enemies.length) | 0];
  renderer.shadowMap.enabled = ui.settings.shadows;

  game = new Game({
    scene, camera, mode, playerCiv, enemyCiv,
    settings: ui.settings,
    msg: (t, pos) => ui.msg(t, pos),
    onEnd: (result) => { ui.showEnd(result); },
  });
  ui.attachGame(game);
  ui.showHUD();
  ui.msg(mode === 'battle'
    ? `Convert or exterminate the ${game.civOf('enemy')} before time runs out`
    : 'Construction mode — shape the world freely');

  // aim camera at the player's campfire
  const home = game.homeOf('player');
  if (home) rig.target.copy(home.pos);
  cursor.tool = 'hand';
  document.querySelectorAll('#hud-tools .tool').forEach(b =>
    b.classList.toggle('selected', b.dataset.tool === 'hand'));
  document.getElementById('build-menu').classList.add('hidden');
}

function endGame() {
  if (!game) return;
  cursor.clearPhantom();
  game.dispose();
  game = null;
  ui.attachGame(null);
  scene.background = new THREE.Color(0x0d0f14);
}

// dev hook: ?auto=battle|construction&civ=franks starts a match immediately
const params = new URLSearchParams(location.search);
if (params.get('auto')) {
  document.getElementById('screen-menu').classList.add('hidden');
  startGame(params.get('auto') === 'construction' ? 'construction' : 'battle',
    CIV_KEYS.includes(params.get('civ')) ? params.get('civ') : 'franks');
}
// dev hook: ?clicktest=construction drives the real menu flow via DOM clicks
if (params.get('clicktest')) {
  const mode = params.get('clicktest') === 'battle' ? 'btn-battle' : 'btn-construction';
  setTimeout(() => {
    document.getElementById(mode).click();
    setTimeout(() => {
      document.querySelector('#civ-list .civ-btn')?.click();
      setTimeout(() => {
        const hudHidden = document.getElementById('hud').classList.contains('hidden');
        console.log(`[clicktest] mode=${params.get('clicktest')} hudVisible=${!hudHidden} game=${game ? game.mode : 'none'}`);
      }, 1500);
    }, 300);
  }, 300);
}

let last = performance.now();
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  if (game && !game.over) {
    rig.update(dt, ui.settings.camspeed, game.terrain);
    game.update(dt);
    ui.updateHUD(game);
  }
  renderer.render(scene, camera);
}
requestAnimationFrame(loop);
