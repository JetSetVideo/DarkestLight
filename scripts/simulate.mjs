// Headless balance simulation: runs the full game logic in Node (no renderer)
// and reports population, resources and death causes over a 20-minute match.
import * as THREE from 'three';
import { Game } from '../src/game.js';

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera();
let result = null;

const game = new Game({
  scene, camera, mode: 'battle',
  playerCiv: process.argv[2] || 'franks',
  enemyCiv: process.argv[3] || 'orcs',
  settings: {
    fog: process.env.SIM_FOG !== '0',
    particles: false, shadows: false, matchlen: 20, camspeed: 1,
  },
  onEnd: (r) => { result = r; },
  msg: () => {},
});

const deaths = { player: {}, enemy: {} };
const origKill = game.killCreature.bind(game);
game.killCreature = (c, attacker, cause) => {
  const tag = cause === 'age' ? 'age'
    : attacker ? (attacker.type ? 'monster:' + attacker.type : 'creature:' + attacker.cls)
    : 'spell/impact';
  deaths[c.side][tag] = (deaths[c.side][tag] || 0) + 1;
  origKill(c, attacker, cause);
};

const dt = 1 / 20;
let next = 0;
for (let t = 0; t < 20 * 60 && !result; t += dt) {
  const u0 = performance.now();
  game.update(dt);
  const uMs = performance.now() - u0;
  if (uMs > 250) {
    console.log(`SLOW UPDATE ${uMs.toFixed(0)}ms at t=${(t / 60).toFixed(2)}min — ` +
      `creatures=${game.creatures.length} animals=${game.animals.length} monsters=${game.monsters.length} ` +
      `buildings=${game.buildings.length} resources=${game.resources.length} holdables=${game.holdables.length} effects=${game.effects.length}`);
    if (uMs > 5000) { console.log('Aborting: single update exceeded 5s'); break; }
  }
  if (t >= next) {
    next += 60;
    console.log(
      `t=${(t / 60).toFixed(1)}min  pPop=${game.popOf('player')} ePop=${game.popOf('enemy')}` +
      `  pFood=${game.state.player.food.toFixed(0)} pWood=${game.state.player.wood.toFixed(0)} pDP=${game.state.player.dp.toFixed(0)}` +
      `  eDP=${game.state.enemy.dp.toFixed(0)} eKnights=${game.creatures.filter(c => c.side === 'enemy' && c.cls === 'knight').length}` +
      `  monsters=${game.monsters.length}`
    );
  }
}
console.log('\nDeaths (player):', deaths.player);
console.log('Deaths (enemy):', deaths.enemy);
console.log('Result:', result ? `${result.won ? 'WON' : 'LOST'} — ${result.how} score=${result.score} vs ${result.enemyScore}` : 'timer would continue');
console.log('Techs P:', Object.keys(game.state.player.techs), ' E:', Object.keys(game.state.enemy.techs));
