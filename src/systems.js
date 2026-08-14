// Cross-cutting systems from the GDD roadmap: Focus Mode queue,
// influence fields, DNA/ecosystem ledger, god alignment, culture markers.
import * as THREE from 'three';
import { clamp, dist2 } from './util.js';
import { GENES, phenotypeOf } from './dna.js';

// ============================ FOCUS MODE ============================
/** While paused, god actions enqueue and flush together on resume. */
export class FocusQueue {
  constructor() {
    this.items = [];
  }
  get length() { return this.items.length; }
  clear() { this.items = []; }
  push(item) {
    this.items.push(item);
    if (this.items.length > 24) this.items.shift();
  }
  /** Execute all queued actions against the live game. */
  flush(game) {
    const batch = this.items.splice(0);
    for (const it of batch) {
      try {
        if (it.kind === 'spell') game.castSpell(it.side, it.shape, it.worldPts, { ...it.opts, _focusFlush: true });
        else if (it.kind === 'invoke') game.invokeFauna(it.side, it.x, it.z, { _focusFlush: true });
        else if (it.kind === 'build') game.build(it.side, it.type, it.x, it.z, { _focusFlush: true });
        else if (it.kind === 'plant') {
          game.focusPlant?.(it.x, it.z, it.kind, { _focusFlush: true });
        }
      } catch { /* keep flushing */ }
    }
    return batch.length;
  }
}

// ============================ GOD ALIGNMENT ============================
/**
 * Track alignment on two independent axes.
 *   value  −1 evil  … +1 good   (kept under this name: every existing
 *                                consumer — spellPalette, the ledger snapshot,
 *                                culture drift — already reads `.value`)
 *   order  −1 chaos … +1 order  (Phase 4)
 * See engine/alignment.js for the quadrant labels and gameplay consequences.
 */
export function createAlignment() {
  return { value: 0, order: 0, kills: 0, heals: 0, pets: 0, slaps: 0, sacrifices: 0 };
}

export function nudgeAlignment(align, delta) {
  align.value = clamp(align.value + delta, -1, 1);
  return align.value;
}

export function alignmentLabel(v) {
  if (v > 0.35) return 'Benevolent';
  if (v < -0.35) return 'Wrathful';
  return 'Balanced';
}

/** Spell VFX colors shift with alignment (good = gold light, evil = brimstone). */
export function spellPalette(align) {
  const v = align?.value ?? 0;
  if (v > 0.35) {
    return {
      fire: 0xffe08a, fireEmissive: 0xccaa40,
      meteor: 0xf5e6a8, meteorEmissive: 0xaa8840,
      lightning: 0xffffee, rain: 0xa8e0ff, shield: 0xfff0c0, heal: 0xe8fff0,
    };
  }
  if (v < -0.35) {
    return {
      fire: 0x8b1010, fireEmissive: 0x550000,
      meteor: 0x3a1510, meteorEmissive: 0x220800,
      lightning: 0xcc66ff, rain: 0x406080, shield: 0x662222, heal: 0x664466,
    };
  }
  return {
    fire: 0xff6a20, fireEmissive: 0xcc4400,
    meteor: 0x5a4030, meteorEmissive: 0x331800,
    lightning: 0xffffff, rain: 0x66ccff, shield: 0xe8c064, heal: 0xa8ffe0,
  };
}

// ============================ INFLUENCE MAP ============================
/**
 * Sample influence at world points for overlay rings.
 * Layers: godReach (player belief aura), village (buildings), belief (creature faith).
 */
export function sampleInfluence(game, side = 'player') {
  const samples = [];
  const home = game.homeOf(side);
  if (home) samples.push({ kind: 'village', x: home.pos.x, z: home.pos.z, r: 14, strength: 1 });
  for (const b of game.buildings) {
    if (b.side !== side || b.constructing) continue;
    const r = b.type === 'temple' ? 16 : b.type === 'campfire' ? 12 : 7;
    samples.push({ kind: 'village', x: b.pos.x, z: b.pos.z, r, strength: 0.7 });
  }
  for (const c of game.creatures) {
    if (c.side !== side) continue;
    const faith = (c.beliefs?.[side] ?? 50) / 100;
    samples.push({ kind: 'belief', x: c.pos.x, z: c.pos.z, r: 3 + faith * 5, strength: faith });
  }
  // Godly reach = union of high-faith creatures + temples
  const godR = 22 + game.faithLevel(side) * 28;
  if (home) samples.push({ kind: 'god', x: home.pos.x, z: home.pos.z, r: godR, strength: game.faithLevel(side) });
  // Extra rings: wrathful alignment and ecology desert front (do not replace belief).
  const alignV = game.alignment?.value ?? 0;
  if (home && alignV < -0.3) {
    samples.push({
      kind: 'wrath', x: home.pos.x, z: home.pos.z,
      r: 16 + Math.abs(alignV) * 22, strength: Math.abs(alignV),
    });
  }
  if (game.ecology && home) {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const x = home.pos.x + Math.cos(a) * 16, z = home.pos.z + Math.sin(a) * 16;
      if (game.ecology.isDesertified(x, z)) {
        samples.push({ kind: 'desert', x, z, r: 5.5, strength: 0.55 });
      }
    }
  }
  return samples;
}

export function buildInfluenceOverlay(scene) {
  const group = new THREE.Group();
  group.name = 'influence-overlay';
  group.visible = false;
  scene.add(group);
  return group;
}

export function refreshInfluenceOverlay(group, game, side = 'player') {
  while (group.children.length) {
    const ch = group.children.pop();
    ch.geometry?.dispose?.();
    ch.material?.dispose?.();
    group.remove(ch);
  }
  const samples = sampleInfluence(game, side);
  const colors = { god: 0xe8c064, village: 0x6aa7c8, belief: 0xc9a0e8, wrath: 0xaa3030, desert: 0xd8c68a };
  for (const s of samples) {
    const geo = new THREE.RingGeometry(Math.max(0.5, s.r - 0.35), s.r, 32);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      color: colors[s.kind] || 0xffffff,
      transparent: true,
      opacity: 0.12 + s.strength * 0.22,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    const y = game.terrain.getHeight(s.x, s.z) + 0.15;
    mesh.position.set(s.x, y, s.z);
    group.add(mesh);
  }
}

// ============================ DNA / ECO LEDGER ============================
export function buildLedgerStats(game, side = 'player') {
  const kin = game.creatures.filter(c => c.side === side);
  const medians = {};
  for (const g of GENES) {
    const vals = kin.map(c => c.dna?.[g] ?? 0.5).sort((a, b) => a - b);
    medians[g] = vals.length ? vals[Math.floor(vals.length / 2)] : 0.5;
  }
  const races = {};
  for (const c of kin) {
    const r = c.raceKey || c.civKey;
    races[r] = (races[r] || 0) + 1;
  }
  const hybrids = kin.filter(c => (c.raceKey || '').includes('+')).length;
  const flora = game.resources.filter(r => r.kind === 'tree' || r.kind === 'bush').length;
  const fauna = game.animals.length;
  const fertility = estimateFertility(game);
  return {
    pop: kin.length,
    hybrids,
    races,
    medians,
    flora,
    fauna,
    fertility: fertility.blended,
    fertilityHumidity: fertility.humidity,
    fertilityEcology: fertility.eco,
    faith: game.faithLevel(side),
    alignment: game.alignment?.value ?? 0,
    order: game.alignment?.order ?? 0,
  };
}

function estimateFertility(game) {
  // average humidity on land cells near both homes, plus ecology fertility samples
  let sum = 0, n = 0, ecoSum = 0, ecoN = 0;
  for (const side of ['player', 'enemy']) {
    const h = game.homeOf(side);
    if (!h) continue;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const x = h.pos.x + Math.cos(a) * 10, z = h.pos.z + Math.sin(a) * 10;
      sum += game.terrain.getHumidity?.(x, z) ?? game.terrain.humidity?.[game.terrain.idx(x, z)] ?? 0.5;
      n++;
      if (game.ecology?.fertilityAt) {
        ecoSum += game.ecology.fertilityAt(x, z);
        ecoN++;
      }
    }
  }
  const humidity = n ? sum / n : 0.5;
  const eco = ecoN ? ecoSum / ecoN : humidity;
  return { humidity, eco, blended: (humidity + eco) * 0.5 };
}

/** Dominant culture profile from median DNA of a side. */
export function cultureFromMedians(medians, civKey) {
  const skin = medians.skinTone ?? 0.5;
  const faith = medians.faithAffinity ?? 0.5;
  const agg = medians.aggression ?? 0.5;
  const style = agg > 0.6 ? 'war-marks' : faith > 0.6 ? 'sacred-ink' : skin > 0.6 ? 'sun-dyed' : 'hearth-woven';
  const symbol = faith > 0.55 ? '☉' : agg > 0.55 ? '⚔' : '☘';
  const accent = agg > 0.6 ? 0xaa3030 : faith > 0.6 ? 0xe8c064 : skin > 0.6 ? 0xc48a3a : 0x6a8a5a;
  return { style, symbol, civKey, skin, faith, agg, accent };
}

/** Attach / refresh a small culture badge on adults of a side. */
export function applyCultureMarkers(game) {
  for (const side of ['player', 'enemy']) {
    const stats = buildLedgerStats(game, side);
    const culture = cultureFromMedians(stats.medians, game.civOf(side));
    game.culture[side] = culture;
    for (const c of game.creatures) {
      if (c.side !== side || c.lifeStage === 'child') continue;
      if (typeof document === 'undefined') continue; // headless simulation
      let badge = c.mesh.userData.cultureBadge;
      if (!badge) {
        const canvas = document.createElement('canvas');
        canvas.width = 64; canvas.height = 64;
        const tex = new THREE.CanvasTexture(canvas);
        tex.magFilter = THREE.NearestFilter;
        const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
        badge = new THREE.Sprite(mat);
        badge.scale.set(0.32, 0.32, 1);
        badge.position.set(0.18, 1.05, 0.05);
        c.mesh.add(badge);
        c.mesh.userData.cultureBadge = badge;
        c.mesh.userData.cultureCanvas = canvas;
      }
      const ctx = c.mesh.userData.cultureCanvas.getContext('2d');
      ctx.clearRect(0, 0, 64, 64);
      ctx.fillStyle = '#' + culture.accent.toString(16).padStart(6, '0');
      ctx.beginPath(); ctx.arc(32, 32, 26, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#1a1410';
      ctx.font = '32px serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(culture.symbol, 32, 34);
      badge.material.map.needsUpdate = true;
      // sash tint once per culture style change
      const L = c.mesh.userData.limbs;
      if (L?.chest?.material?.color && c._cultureStyle !== culture.style) {
        if (!c._chestTinted) {
          L.chest.material = L.chest.material.clone();
          c._chestTinted = true;
        }
        L.chest.material.color.lerp(new THREE.Color(culture.accent), 0.22);
        c._cultureStyle = culture.style;
      }
    }
  }
}

/** Avatar learns from world events; mutates genome loci slightly. */
export function avatarLearnTick(game, dt) {
  const av = game.avatar;
  if (!av || av.hp <= 0) return;
  const learn = av._avatarLearn || (av._avatarLearn = { diet: 0, combat: 0, moral: 0 });
  // diet: near food bushes / fish
  for (const r of game.resources) {
    if (r.kind === 'bush' && dist2(r.pos.x, r.pos.z, av.pos.x, av.pos.z) < 9) learn.diet += dt * 0.15;
  }
  for (const a of game.animals) {
    if (a === av || !a.aquatic) continue;
    if (dist2(a.pos.x, a.pos.z, av.pos.x, av.pos.z) < 16) learn.diet += dt * 0.08;
  }
  // combat: near combat / monsters
  for (const m of game.monsters) {
    if (dist2(m.pos.x, m.pos.z, av.pos.x, av.pos.z) < 100) learn.combat += dt * 0.2;
  }
  for (const c of game.creatures) {
    if (c.task === 'attack' && dist2(c.pos.x, c.pos.z, av.pos.x, av.pos.z) < 64) learn.combat += dt * 0.12;
  }
  // moral: mirrors god alignment drift
  learn.moral += (game.alignment?.value || 0) * dt * 0.05;

  game._avatarApplyT = (game._avatarApplyT || 0) + dt;
  if (game._avatarApplyT < 8) return;
  game._avatarApplyT = 0;
  // apply learning as soft phenotype bumps (stored on avatar)
  av.learned = av.learned || { mass: 0.5, aggression: 0.5, loyalty: 0.5, curiosity: 0.5 };
  av.learned.mass = clamp(av.learned.mass + learn.diet * 0.02, 0.1, 1);
  av.learned.aggression = clamp(av.learned.aggression + learn.combat * 0.015, 0.1, 1);
  av.learned.loyalty = clamp(av.learned.loyalty + Math.max(0, learn.moral) * 0.02, 0.1, 1);
  av.learned.curiosity = clamp(av.learned.curiosity + Math.abs(learn.moral) * 0.01, 0.1, 1);
  const scale = 2.2 + av.learned.mass * 0.6;
  av.mesh.scale.setScalar(scale);
  av.hp = Math.min(220, av.hp + learn.diet * 2);
  // bleed learning into nearby player kin DNA (cultural imprint)
  for (const c of game.creatures) {
    if (c.side !== 'player' || !c.genome?.loci) continue;
    if (dist2(c.pos.x, c.pos.z, av.pos.x, av.pos.z) > 64) continue;
    for (const gene of ['aggression', 'loyalty', 'curiosity', 'mass']) {
      const loc = c.genome.loci[gene];
      if (!loc) continue;
      const target = Math.round(av.learned[gene] * 9);
      loc[2] = clamp(Math.round(loc[2] * 0.92 + target * 0.08), 0, 9);
      loc[3] = clamp(Math.round(loc[3] * 0.92 + target * 0.08), 0, 9);
      c.dna[gene] = phenotypeOf(loc);
    }
  }
  learn.diet *= 0.4; learn.combat *= 0.4; learn.moral *= 0.5;
}

// ============================ SEED PROPAGATION ============================
export function seedPropagationTick(game, dt) {
  game._seedT = (game._seedT || 0) + dt;
  if (game._seedT < 2.5) return;
  game._seedT = 0;
  const wind = game.cycles.wind || 0;
  const ang = game.cycles.windAngle || 0;
  const wx = Math.cos(ang) * wind, wz = Math.sin(ang) * wind;
  const trees = game.resources.filter(r => r.kind === 'tree' && !r.depleted && (r.growth || 1) > 0.85);
  if (trees.length > 80) return; // cap
  for (const t of trees) {
    if (game.rng() > 0.08 + wind * 0.1) continue;
    // seed rolls downhill + wind
    let sx = t.pos.x + (game.rng() - 0.5) * 2 + wx * 4;
    let sz = t.pos.z + (game.rng() - 0.5) * 2 + wz * 4;
    const h0 = game.terrain.getHeight(t.pos.x, t.pos.z);
    const h1 = game.terrain.getHeight(sx, sz);
    if (h1 < h0) { // prefer downhill
      sx += (sx - t.pos.x) * 0.5;
      sz += (sz - t.pos.z) * 0.5;
    }
    if (game.terrain.isWater(sx, sz)) continue;
    if (game.resources.some(r => dist2(r.pos.x, r.pos.z, sx, sz) < 9)) continue;
    const hum = game.terrain.humidity?.[game.terrain.idx(sx, sz)] ?? 0.5;
    if (hum < 0.22) continue;
    const kind = t.variant || t.mesh?.userData?.kind || 'oak';
    // lazy import avoided — game provides factory
    game.spawnSeedling?.(sx, sz, kind);
  }
  // water cycle fertility: raining bumps nearby dirt moisture proxy (wear inverse)
  if (game.cycles.raining) {
    for (const b of game.buildings) {
      if (b.type !== 'farm' && b.type !== 'campfire') continue;
      game.terrain.stampDirt?.(b.pos.x, b.pos.z, 3, -0.02); // slightly less dirt = greener look via less wear blend
    }
  }
}
