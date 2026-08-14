// Drop-to-interact: placing a follower beside something assigns work.
import * as THREE from 'three';
import { dist2 } from '../util.js';
import { LIFT, INTERACT } from '../data/generation.js';

const NOTE = {
  tree: 'chops wood', bush: 'picks fruit', rock: 'gathers stone', metal: 'digs ore',
};

export function assignDropTask(game, creature, x, z) {
  if (!creature || creature.side !== 'player') return null;
  creature.releaseClaim?.();
  const home = game.homeOf(creature.side);
  const R2 = LIFT.dropR * LIFT.dropR;
  const near = (px, pz) => dist2(px, pz, x, z) < R2;

  for (const b of game.buildings) {
    if (b.type === 'campfire' && near(b.pos.x, b.pos.z)) {
      creature.task = 'deposit'; creature.target = b;
      return 'offers at the hearth';
    }
    if (b.constructing && b.side === creature.side && near(b.pos.x, b.pos.z)) {
      creature.task = 'build'; creature.target = b;
      return 'joins the builders';
    }
    if (b.type === 'farm' && b.side === creature.side && near(b.pos.x, b.pos.z)) {
      creature.task = 'work'; creature.target = b;
      return 'tends the field';
    }
    if (b.type === 'well' && near(b.pos.x, b.pos.z)) {
      creature.task = 'water'; creature.target = b;
      return 'draws water';
    }
  }
  let bestNode = null, bd = R2;
  for (const r of game.resources) {
    const d = dist2(r.pos.x, r.pos.z, x, z);
    if (d < bd) { bd = d; bestNode = r; }
  }
  if (bestNode) {
    bestNode.claimedBy = creature.id;
    creature.claimed = bestNode;
    creature.task = 'harvest';
    creature.target = bestNode;
    return NOTE[bestNode.kind] || 'gathers';
  }
  for (const h of game.holdables) {
    if (!h.heldBy && near(h.pos.x, h.pos.z)) {
      creature.task = 'pickup'; creature.target = h;
      return 'picks up wood';
    }
  }
  if (game.terrain.isFresh(x, z) || game.terrain.isFresh(x + 1.5, z) || game.terrain.isFresh(x, z + 1.5)) {
    const fish = game.nearestFish(creature, INTERACT.fishR);
    if (fish) { creature.task = 'fish'; creature.target = fish; return 'goes fishing'; }
    creature.task = 'water'; creature.target = { pos: new THREE.Vector3(x, 0, z) };
    return 'fetches fresh water';
  }
  const prey = game.nearestHuntable(creature, INTERACT.huntR);
  if (prey && dist2(prey.pos.x, prey.pos.z, x, z) < INTERACT.huntDropR2) {
    creature.task = 'hunt'; creature.target = prey;
    return 'hunts';
  }
  const foe = game.creatures.find(c => c !== creature && c.side !== creature.side && c.hp > 0 && near(c.pos.x, c.pos.z));
  if (foe) {
    creature.task = 'attack'; creature.target = foe;
    return `strikes ${foe.name}`;
  }
  const beast = game.animals.find(a => a.hp > 0 && !a.isAvatar && near(a.pos.x, a.pos.z));
  if (beast) {
    creature.task = 'tame'; creature.target = beast;
    return `tries to tame the ${beast.type}`;
  }
  const kin = game.creatures.find(c => c !== creature && c.side === creature.side && near(c.pos.x, c.pos.z));
  if (kin) {
    creature.task = 'wander'; creature.target = kin.pos.clone();
    return `stands with ${kin.name}`;
  }
  if (home && dist2(home.pos.x, home.pos.z, x, z) < INTERACT.homeReturnR2) {
    creature.task = 'deposit'; creature.target = home;
    return 'returns to the fire';
  }
  return null;
}
