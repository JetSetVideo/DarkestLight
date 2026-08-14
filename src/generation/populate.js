// World population: hearths, starting tribe, flora, fauna, relics.
// Driven entirely by catalogs in src/data/generation.js.
import * as THREE from 'three';
import { CIVS } from '../civs.js';
import { Creature, Animal, Monster, Building, ResourceNode, Relic, Holdable } from '../entities.js';
import { WATER_Y, WORLD_SIZE, cellContext } from '../world.js';
import { applyCultureMarkers } from '../systems.js';
import { dist2 } from '../util.js';
import { FLORA, FLORA_PLACE, TRIBE, FAUNA, HEARTH } from '../data/generation.js';

function pickHearth(game, sideSign, pvp) {
  const H = HEARTH;
  for (let t = 0; t < H.siteTries; t++) {
    const x = pvp ? sideSign * (H.siteOffPvp + game.rng() * H.siteSpreadPvp) : (game.rng() - 0.5) * H.siteSpreadSolo;
    const z = (game.rng() - 0.5) * (pvp ? H.siteZPvp : H.siteZSolo);
    const h = game.terrain.getHeight(x, z);
    if (h > WATER_Y + H.siteMinH && h < H.siteMaxH && game.terrain.maxSlope(x, z, H.siteSlopeR) < H.siteSlope) {
      return new THREE.Vector3(x, h, z);
    }
  }
  return new THREE.Vector3(sideSign * (pvp ? H.fallbackPvp : H.fallbackSolo), 2, 0);
}

function nearFresh(terrain, x, z) {
  const n = FLORA_PLACE.freshSamples, r = FLORA_PLACE.freshProbe;
  for (let a = 0; a < n; a++) {
    const px = x + Math.cos((a / n) * Math.PI * 2) * r;
    const pz = z + Math.sin((a / n) * Math.PI * 2) * r;
    if (terrain.isFresh(px, pz)) return true;
  }
  return false;
}

function pickKind(ctx, h, fresh, rng) {
  const { flags, hum: m, fert } = ctx;
  if ((flags.high && flags.cold) || h > FLORA.pine.highAlt) return 'pine';
  if (fresh && m > 0.45 && !flags.dry) return rng() < FLORA_PLACE.cherryVsOak ? 'cherry' : 'oak';
  if (flags.hot && flags.wet) return 'palm';
  if (fert > FLORA_PLACE.fertileMin) return rng() < FLORA_PLACE.cherryOnFertile ? 'cherry' : 'oak';
  return null;
}

function placeFlora(game, sides, inPad) {
  const P = FLORA_PLACE;
  const treeOf = (kind) => game.resources.filter(r => r.kind === 'tree' && r.mesh?.userData?.kind === kind);
  const nearKind = (kind, x, z, r) => treeOf(kind).some(t => dist2(t.pos.x, t.pos.z, x, z) < r * r);

  const tryTree = (kind, x, z, sapling) => {
    const rule = FLORA[kind];
    if (!rule) return false;
    if (treeOf(kind).length >= rule.max) return false;
    const h = game.terrain.getHeight(x, z);
    if (h < WATER_Y + rule.minAlt) return false;
    if (game.terrain.maxSlope(x, z, P.slopeProbe) > rule.maxSlope) return false;
    const flags = cellContext(game.terrain, x, z).flags;
    if (flags.dry && flags.hot && game.rng() > rule.desertOk) return false;
    if (rule.nearFresh > 0.5 && !nearFresh(game.terrain, x, z) && game.rng() > 0.2) return false;
    game.resources.push(new ResourceNode(game, 'tree', x, z, kind, sapling));
    return true;
  };

  for (let t = 0; t < P.tries && game.resources.length < P.cap; t++) {
    const x = (game.rng() - 0.5) * (WORLD_SIZE - P.margin);
    const z = (game.rng() - 0.5) * (WORLD_SIZE - P.margin);
    if (inPad(x, z)) continue;
    const h = game.terrain.getHeight(x, z);
    if (h < WATER_Y + P.minH) continue;
    const ctx = cellContext(game.terrain, x, z, {
      fert: game.ecology?.fertilityAt?.(x, z),
      wind: game.cycles?.wind,
      align: game.alignment?.value,
    });
    if (ctx.flags.volcanic) {
      if (game.rng() < P.volcanicRockChance) game.resources.push(new ResourceNode(game, 'rock', x, z));
      continue;
    }
    const kind = pickKind(ctx, h, nearFresh(game.terrain, x, z), game.rng);
    if (kind) {
      const clustered = nearKind(kind, x, z, FLORA[kind].cluster);
      if (clustered || game.rng() < P.clusterBias) tryTree(kind, x, z, game.rng() < P.saplingChance);
      else if (game.rng() < P.bushIfNotCluster) game.resources.push(new ResourceNode(game, 'bush', x, z));
    } else if (game.rng() < P.scatterChance) {
      const r = game.rng();
      game.resources.push(new ResourceNode(game, r < P.bushShare ? 'bush' : r < P.rockShare ? 'rock' : 'metal', x, z));
    }
  }
  for (const [kind, rule] of Object.entries(FLORA)) {
    let guard = 0;
    while (treeOf(kind).length < rule.min && guard++ < P.minFillGuard) {
      const x = (game.rng() - 0.5) * (WORLD_SIZE - 24);
      const z = (game.rng() - 0.5) * (WORLD_SIZE - 24);
      if (!inPad(x, z)) tryTree(kind, x, z, true);
    }
  }
  for (const r of game.resources) {
    if (r.kind !== 'tree' || game.rng() >= P.stickChance) continue;
    const a = game.rng() * Math.PI * 2, d = P.stickMin + game.rng() * P.stickSpan;
    const sx = r.pos.x + Math.cos(a) * d, sz = r.pos.z + Math.sin(a) * d;
    if (!game.terrain.isWater(sx, sz) && !inPad(sx, sz)) game.holdables.push(new Holdable(game, 'stick', sx, sz));
  }
}

function placeFauna(game, sides, pvp) {
  for (const side of sides) {
    const civ = CIVS[game.civOf(side)];
    const sign = side === 'player' ? -1 : 1;
    for (let i = 0; i < FAUNA.civAnimals; i++) {
      for (let t = 0; t < 30; t++) {
        const x = sign * (10 + game.rng() * 55), z = (game.rng() - 0.5) * 130;
        if (!game.terrain.isWater(x, z)) { game.animals.push(new Animal(game, civ.animal, x, z)); break; }
      }
    }
    for (let t = 0; t < 60; t++) {
      const x = sign * (8 + game.rng() * 20), z = (game.rng() - 0.5) * 120;
      if (!game.terrain.isWater(x, z) &&
          dist2(x, z, game.spawnPts.player.x, game.spawnPts.player.z) > 2000 &&
          (!pvp || dist2(x, z, game.spawnPts.enemy.x, game.spawnPts.enemy.z) > 2000)) {
        game.monsters.push(new Monster(game, civ.monster, x, z));
        break;
      }
    }
  }
  for (let i = 0; i < FAUNA.snakes; i++) {
    for (let t = 0; t < 30; t++) {
      const x = (game.rng() - 0.5) * 130, z = (game.rng() - 0.5) * 130;
      if (!game.terrain.isWater(x, z)) { game.animals.push(new Animal(game, 'snake', x, z)); break; }
    }
  }
  const spawnSchool = (cx, cz, n, r) => {
    for (let i = 0; i < n; i++) {
      const a = game.rng() * Math.PI * 2, d = game.rng() * r;
      const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
      if (game.terrain.isWater(x, z)) game.animals.push(new Animal(game, 'fish', x, z));
    }
  };
  for (const lake of game.terrain.lakes || []) spawnSchool(lake.x, lake.z, FAUNA.lakeSchool, lake.r * FAUNA.lakeRFrac);
  for (let i = 0; i < FAUNA.freshSchools; i++) {
    for (let t = 0; t < 40; t++) {
      const x = (game.rng() - 0.5) * 80, z = (game.rng() - 0.5) * 80;
      if (game.terrain.isFresh(x, z)) { spawnSchool(x, z, FAUNA.freshN, FAUNA.freshR); break; }
    }
  }
  for (let i = 0; i < FAUNA.seaSchools; i++) {
    for (let t = 0; t < 40; t++) {
      const x = (game.rng() - 0.5) * 140, z = (game.rng() - 0.5) * 140;
      if (game.terrain.isWater(x, z) && !game.terrain.isFresh(x, z)) {
        spawnSchool(x, z, FAUNA.seaN, FAUNA.seaR); break;
      }
    }
  }
  for (let i = 0; i < FAUNA.relics; i++) {
    for (let t = 0; t < 60; t++) {
      const x = (game.rng() - 0.5) * 100, z = (game.rng() - 0.5) * 100;
      if (!game.terrain.isWater(x, z)) { game.relics.push(new Relic(game, x, z)); break; }
    }
  }
}

export function populateWorld(game) {
  const pvp = game.mode === 'battle';
  game.spawnPts = { player: pickHearth(game, -1, pvp), enemy: pvp ? pickHearth(game, 1, pvp) : pickHearth(game, -1, pvp) };
  const sides = pvp ? ['player', 'enemy'] : ['player'];
  const HEARTH_R = TRIBE.hearthR;
  for (const side of sides) {
    const p = game.spawnPts[side];
    game.terrain.levelFlat(p.x, p.z, HEARTH_R);
    game.terrain.stampDirt(p.x, p.z, HEARTH_R, 0.95);
    p.y = game.terrain.getHeight(p.x, p.z);
    game.buildings.push(new Building(game, side, 'campfire', p.x, p.z));
    for (const cls of TRIBE.roster) {
      const a = game.rng() * Math.PI * 2, r = TRIBE.spawnRMin + game.rng() * TRIBE.spawnRSpan;
      game.creatures.push(new Creature(game, side, cls,
        p.x + Math.cos(a) * r, p.z + Math.sin(a) * r, null, TRIBE.ageMin + game.rng() * TRIBE.ageSpan));
    }
  }
  const inPad = (x, z) => {
    for (const side of sides) {
      const p = game.spawnPts[side];
      if (dist2(x, z, p.x, p.z) < HEARTH_R * HEARTH_R) return true;
    }
    return false;
  };
  placeFlora(game, sides, inPad);
  placeFauna(game, sides, pvp);
  game.spawnAvatar();
  applyCultureMarkers(game);
}
