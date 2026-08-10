// Central game controller: two civilizations (player god vs AI god), economy,
// belief & conversion, branching technology + achievements, divine favors,
// spells, storms, monsters, relics, ghost-memory fog of war, score, timer
// and win conditions.
import * as THREE from 'three';
import { CIVS, TECHS, BUILDINGS, FAVORS, INVOKE_FAUNA } from './civs.js';
import { Creature, Animal, Monster, Building, ResourceNode, Relic, Holdable, mixDNA } from './entities.js';
import { Terrain, Cycles, WATER_Y, WORLD_SIZE, MAP_SHAPES } from './world.js';
import { Ecology } from './engine/ecology.js';
import { RiverSystem } from './generation/rivers.js';
import { RoadNetwork } from './engine/roads.js';
import { eraOf, bestToolFor, COMPANIONS, canTame, revealedResources } from './ai/crafting.js';
import { effectsFor, quadrantLabel, nudge, fromManifest } from './engine/alignment.js';
import { QuestEngine } from './quests/questEngine.js';
import { Campaign } from './quests/campaign.js';
import { victoryPoints, victoryBreakdown, proximityModifiers } from './engine/victory.js';
import { mulberry32, clamp, dist2, pick } from './util.js';
import { isHybrid } from './dna.js';
import {
  FocusQueue, createAlignment, nudgeAlignment, alignmentLabel, spellPalette,
  buildInfluenceOverlay, refreshInfluenceOverlay, buildLedgerStats,
  cultureFromMedians, seedPropagationTick, applyCultureMarkers, avatarLearnTick,
} from './systems.js';

export class Game {
  constructor({ scene, camera, mode, playerCiv, enemyCiv, settings, onEnd, msg }) {
    this.scene = scene;
    this.camera = camera;
    this.mode = mode; // 'battle' | 'construction'
    this.settings = settings;
    this.onEnd = onEnd;
    this.msg = msg; // (text, worldPos?) => void
    this.YEAR_SEC = 9;
    this.paused = false; // Focus Mode — set by main time controls
    this.focusQueue = new FocusQueue();
    this.alignment = createAlignment();

    const seed = (Math.random() * 1e9) | 0;
    this.rng = mulberry32(seed);
    this.mapShape = pick(this.rng, Object.keys(MAP_SHAPES));
    this.terrain = new Terrain(scene, seed, this.mapShape);
    this.terrain.fogEnabled = settings.fog && mode === 'battle';
    this.cycles = new Cycles(scene, seed);
    // Phase 4: the sky answers to the god. Weather picking reads this.
    this.cycles.alignment = this.alignment;
    this.cycles.particlesEnabled = settings.particles;
    this.cycles.oceanUniforms = this.terrain.oceanUniforms;

    // Phase 1 — environmental feedback. Ecology tracks soil fertility and
    // flips biomes between fertile and desert; rivers carve the map and are
    // the moisture source that reverses desertification.
    this.ecology = new Ecology(this.terrain, {
      onDesertify: (x, z) => this.onCellDesertified(x, z),
      onRestore: (x, z) => this.onCellRestored(x, z),
    });
    this.rivers = new RiverSystem(this.terrain, this.ecology);
    this.rivers.addGeneratedRiver();

    // Phase 3 — paved road network between structures.
    this.roads = new RoadNetwork(this.terrain);
    this._roadPlanTimer = 6;
    // Cumulative civic activity. Snapshot counts (live companions, equipped
    // tools) undercount badly because companions die and units are replaced —
    // these totals are what the ledger and the verification script read.
    this.civStats = { tamed: 0, tameAttempts: 0, toolsCrafted: 0 };

    // Phase 5 — quest engine + counters the objectives measure against.
    this.spellsCast = 0;
    this.riverMoves = 0;
    this.terrainEdits = 0;
    this.quests = new QuestEngine(this);
    this.quests.seed('player');
    this._questTimer = 3;
    // AI gods play by the same alignment rules the player does.
    this.enemyAlignment = createAlignment();

    this.influenceOverlay = buildInfluenceOverlay(scene);
    this.influenceOn = false;

    this.civKeys = { player: playerCiv, enemy: enemyCiv };
    this.state = { player: this.freshState(), enemy: this.freshState() };
    this.creatures = [];
    this.animals = [];
    this.monsters = [];
    this.buildings = [];
    this.resources = [];
    this.holdables = [];
    this.relics = [];
    this.effects = [];
    this.ghosts = new Map(); // entity id -> ghost mesh (fog-of-war memory)
    this.favors = { player: {}, enemy: {} };
    this.lastSmiter = null;
    this.samples = [];       // population timeline for the recap chart
    this.culture = { player: null, enemy: null };

    this.timeLeft = mode === 'battle' ? settings.matchlen * 60 : Infinity;
    this.elapsed = 0;
    this.over = false;
    this._repTimer = 0; this._trainTimer = 0; this._convTimer = 0; this._aiTimer = 3;
    this._incomeTimer = 0; this._chiefTimer = 20; this._ghostTimer = 0; this._sampleTimer = 0;

    // gold selection ring (tighter diameter)
    const ringGeo = new THREE.RingGeometry(0.38, 0.52, 28);
    ringGeo.rotateX(-Math.PI / 2);
    this.selRing = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
      color: 0xf5c518, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false,
    }));
    this.selRing.visible = false;
    scene.add(this.selRing);
    this.selected = null;

    this.populate();
  }

  freshState() {
    return {
      food: 40, wood: 20, rock: 8, metal: 2, dp: 100, attackMode: false,
      techs: {}, ach: { wood: 0, food: 0, rock: 0, metal: 0, spells: 0, births: 0, relics: 0 },
      kills: 0, conversions: 0, deaths: 0,
    };
  }

  /** Tribal faith 0..1 — average devotion + temples + mysticism techs. */
  faithLevel(side) {
    const pop = this.popOf(side);
    let belief = 0;
    if (pop) {
      for (const c of this.creatures) if (c.side === side) belief += c.beliefs[side];
      belief /= pop * 100;
    }
    const temples = this.buildings.filter(b => b.side === side && b.type === 'temple' && !b.constructing).length;
    const myst = (this.hasTech(side, 'mysticism') ? 0.12 : 0) +
      (this.hasTech(side, 'stormcalling') || this.hasTech(side, 'lifebloom') ? 0.12 : 0);
    return clamp(belief * 0.55 + Math.min(temples, 3) * 0.12 + myst + Object.keys(this.state[side].techs).length * 0.02, 0.15, 1.35);
  }

  civOf(side) { return this.civKeys[side]; }
  stateOf(side) { return this.state[side]; }
  hasTech(side, key) { return !!this.state[side].techs[key]; }
  favorActive(side, key) { return (this.favors[side][key] || 0) > 0; }
  homeOf(side) { return this.buildings.find(b => b.side === side && b.type === 'campfire' && !b.constructing); }
  popOf(side) { return this.creatures.filter(c => c.side === side).length; }
  // the tribe grows as the ages pass: huts, knowledge and sheer time raise the cap
  popCap(side) {
    return 14 +
      this.buildings.filter(b => b.side === side && b.type === 'hut' && !b.constructing).length * 6 +
      Object.keys(this.state[side].techs).length * 3 +
      Math.floor(this.elapsed / 300) * 2;
  }
  // overall wellbeing shown by the campfire flame
  tribeHealth(side) {
    const st = this.state[side];
    const pop = this.popOf(side);
    if (pop === 0) return 0;
    let belief = 0;
    for (const c of this.creatures) if (c.side === side) belief += c.beliefs[side];
    belief /= pop * 100;
    return clamp((clamp(st.food / 80, 0, 1) + clamp(pop / this.popCap(side), 0, 1) + belief) / 3, 0, 1);
  }

  // ---------------- world population ----------------
  populate() {
    const spawn = (sideSign) => {
      for (let t = 0; t < 200; t++) {
        const x = sideSign * (28 + this.rng() * 22);
        const z = (this.rng() - 0.5) * 70;
        const h = this.terrain.getHeight(x, z);
        if (h > WATER_Y + 0.8 && h < 6) return new THREE.Vector3(x, h, z);
      }
      return new THREE.Vector3(sideSign * 35, 2, 0);
    };
    this.spawnPts = { player: spawn(-1), enemy: spawn(1) };

    for (const side of ['player', 'enemy']) {
      const p = this.spawnPts[side];
      this.buildings.push(new Building(this, side, 'campfire', p.x, p.z));
      const roster = ['king', 'queen', 'gatherer', 'gatherer', 'hunter', 'farmer', 'shaman', 'knight'];
      for (const cls of roster) {
        const a = this.rng() * Math.PI * 2, r = 2 + this.rng() * 3;
        this.creatures.push(new Creature(this, side, cls, p.x + Math.cos(a) * r, p.z + Math.sin(a) * r, null, 15 + this.rng() * 22));
      }
    }

    // flora — biome-aware placement (humidity / altitude / biome frames)
    for (let t = 0; t < 1400 && this.resources.length < 480; t++) {
      const x = (this.rng() - 0.5) * (WORLD_SIZE - 20);
      const z = (this.rng() - 0.5) * (WORLD_SIZE - 20);
      const h = this.terrain.getHeight(x, z);
      if (h < WATER_Y + 0.5) continue;
      const k = this.terrain.idx(x, z);
      const m = this.terrain.humidity[k];
      const bioId = this.terrain.biome[k];
      // desert / ice / volcano: sparse flora
      if (bioId === 7 || bioId === 0 || bioId === 15) {
        if (this.rng() < 0.08) this.resources.push(new ResourceNode(this, 'rock', x, z));
        continue;
      }
      if (bioId === 13 || h > 7) { // high mountains / cold
        if (this.rng() < 0.4) this.resources.push(new ResourceNode(this, 'tree', x, z, 'pine', true));
      } else if (bioId === 4 || bioId === 6 || (h < WATER_Y + 1.8 && m > 0.6)) {
        if (this.rng() < 0.4) this.resources.push(new ResourceNode(this, 'tree', x, z, 'palm', true));
      } else if (bioId === 5 || m > 0.72) { // swamp: bushes + sparse trees
        if (this.rng() < 0.5) this.resources.push(new ResourceNode(this, this.rng() < 0.6 ? 'bush' : 'tree', x, z, 'oak', true));
      } else if (m > 0.4 && this.rng() < 0.82) {
        const kind = this.rng() < 0.12 ? 'cherry' : 'oak';
        this.resources.push(new ResourceNode(this, 'tree', x, z, kind, this.rng() < 0.35));
      } else if (this.rng() < 0.28) {
        const r = this.rng();
        const kind = r < 0.5 ? 'bush' : r < 0.8 ? 'rock' : 'metal';
        this.resources.push(new ResourceNode(this, kind, x, z));
      }
    }
    // sticks under / near trees
    for (const r of this.resources) {
      if (r.kind !== 'tree') continue;
      if (this.rng() < 0.55) {
        const a = this.rng() * Math.PI * 2, d = 0.8 + this.rng() * 1.8;
        const sx = r.pos.x + Math.cos(a) * d, sz = r.pos.z + Math.sin(a) * d;
        if (!this.terrain.isWater(sx, sz)) this.holdables.push(new Holdable(this, 'stick', sx, sz));
      }
    }

    // fauna: each civ's animal roams its half, its monster prowls the frontier
    for (const side of ['player', 'enemy']) {
      const civ = CIVS[this.civOf(side)];
      const sign = side === 'player' ? -1 : 1;
      for (let i = 0; i < 5; i++) {
        for (let t = 0; t < 30; t++) {
          const x = sign * (10 + this.rng() * 55), z = (this.rng() - 0.5) * 130;
          if (!this.terrain.isWater(x, z)) { this.animals.push(new Animal(this, civ.animal, x, z)); break; }
        }
      }
      for (let t = 0; t < 60; t++) {
        const x = sign * (8 + this.rng() * 20), z = (this.rng() - 0.5) * 120;
        if (!this.terrain.isWater(x, z) &&
            dist2(x, z, this.spawnPts.player.x, this.spawnPts.player.z) > 2000 &&
            dist2(x, z, this.spawnPts.enemy.x, this.spawnPts.enemy.z) > 2000) {
          this.monsters.push(new Monster(this, civ.monster, x, z));
          break;
        }
      }
    }
    // snakes slither everywhere; fish school in the river and sea
    for (let i = 0; i < 5; i++) {
      for (let t = 0; t < 30; t++) {
        const x = (this.rng() - 0.5) * 130, z = (this.rng() - 0.5) * 130;
        if (!this.terrain.isWater(x, z)) { this.animals.push(new Animal(this, 'snake', x, z)); break; }
      }
    }
    for (let i = 0; i < 10; i++) {
      for (let t = 0; t < 60; t++) {
        const x = (this.rng() - 0.5) * 140, z = (this.rng() - 0.5) * 140;
        if (this.terrain.isWater(x, z)) { this.animals.push(new Animal(this, 'fish', x, z)); break; }
      }
    }

    for (let i = 0; i < 2; i++) {
      for (let t = 0; t < 60; t++) {
        const x = (this.rng() - 0.5) * 100, z = (this.rng() - 0.5) * 100;
        if (!this.terrain.isWater(x, z)) { this.relics.push(new Relic(this, x, z)); break; }
      }
    }

    // Avatar pet stub — giant creature that follows the player god's flock
    this.spawnAvatar();
    applyCultureMarkers(this);
  }

  spawnAvatar() {
    const home = this.homeOf('player');
    if (!home) return;
    const type = CIVS[this.civOf('player')].animal || 'wolf';
    const av = new Animal(this, type, home.pos.x + 6, home.pos.z + 4);
    av.hp = 180;
    av.isAvatar = true;
    av.mesh.scale.setScalar(2.4);
    av._avatarLearn = { diet: 0, combat: 0, moral: 0 };
    this.animals.push(av);
    this.avatar = av;
    this.msg(`Your Avatar stirs — a great ${type}`, home.pos.clone());
  }

  /** Contextual group AI: flock idle adults into loose circles near leaders. */
  groupAITick() {
    for (const side of ['player', 'enemy']) {
      const leader = this.creatures.find(c => c.side === side && (c.cls === 'king' || c.cls === 'queen'));
      if (!leader) continue;
      const idle = this.creatures.filter(c =>
        c.side === side && c !== leader && c.lifeStage === 'adult' &&
        (c.task === 'idle' || c.task === 'wander') &&
        dist2(c.pos.x, c.pos.z, leader.pos.x, leader.pos.z) < 220);
      if (idle.length < 3) continue;
      // respectful arc in front of leader
      idle.slice(0, 8).forEach((c, i) => {
        const a = -0.9 + (i / Math.max(1, idle.length - 1)) * 1.8;
        const r = 3.5;
        c.task = 'wander';
        c.target = new THREE.Vector3(
          leader.pos.x + Math.sin(a + leader.mesh.rotation.y) * r,
          0,
          leader.pos.z + Math.cos(a + leader.mesh.rotation.y) * r,
        );
      });
    }
    // Avatar follows player camp / selected
    if (this.avatar && this.avatar.hp > 0) {
      const home = this.homeOf('player');
      const sel = this.selected;
      const tgt = (sel && sel.pos) ? sel.pos : home?.pos;
      if (tgt && dist2(this.avatar.pos.x, this.avatar.pos.z, tgt.x, tgt.z) > 36) {
        this.avatar.target = tgt.clone();
      }
    }
    // ranks hold hands: pair nearby idle adults
    for (const side of ['player', 'enemy']) {
      const idle = this.creatures.filter(c =>
        c.side === side && c.lifeStage === 'adult' &&
        (c.task === 'idle' || c.task === 'wander') && !c.held);
      for (let i = 0; i < idle.length - 1; i += 2) {
        const a = idle[i], b = idle[i + 1];
        if (dist2(a.pos.x, a.pos.z, b.pos.x, b.pos.z) < 16) {
          a._holdHandsWith = b;
          b._holdHandsWith = a;
          a._pose = a._pose || 'idle';
          // kneel when close to royalty
          const royal = this.creatures.find(c =>
            c.side === side && (c.cls === 'king' || c.cls === 'queen') &&
            dist2(c.pos.x, c.pos.z, a.pos.x, a.pos.z) < 25);
          if (royal) { a._pose = 'kneel'; b._pose = 'kneel'; }
        }
      }
    }
  }

  // ---------------- queries (awareness system) ----------------
  bestResourceFor(creature, yields) {
    let best = null, bestScore = -1e9;
    for (const r of this.resources) {
      if (r.yields !== yields || r.depleted || r.held) continue;
      if (r.claimedBy && r.claimedBy !== creature.id) continue;
      const d = Math.sqrt(dist2(r.pos.x, r.pos.z, creature.pos.x, creature.pos.z));
      const score = -d + r.amount * 0.25 + (r.grains || 0) * 0.1;
      if (score > bestScore) { bestScore = score; best = r; }
    }
    return best;
  }
  nearestConstruction(creature) {
    let best = null, bd = 35 * 35;
    for (const b of this.buildings) {
      if (b.side !== creature.side || !b.constructing) continue;
      const d = dist2(b.pos.x, b.pos.z, creature.pos.x, creature.pos.z);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }
  nearestHuntable(creature, range) {
    let best = null, bd = range * range;
    for (const a of this.animals) {
      if (a.aquatic || a.type === 'snake') continue;
      const d = dist2(a.pos.x, a.pos.z, creature.pos.x, creature.pos.z);
      if (d < bd) { bd = d; best = a; }
    }
    return best;
  }
  nearestFish(creature, range) {
    let best = null, bd = range * range;
    for (const a of this.animals) {
      if (!a.aquatic) continue;
      const d = dist2(a.pos.x, a.pos.z, creature.pos.x, creature.pos.z);
      if (d < bd) { bd = d; best = a; }
    }
    return best;
  }
  nearestStick(creature, range) {
    let best = null, bd = range * range;
    for (const h of this.holdables) {
      if (h.heldBy) continue;
      const d = dist2(h.pos.x, h.pos.z, creature.pos.x, creature.pos.z);
      if (d < bd) { bd = d; best = h; }
    }
    return best;
  }
  removeHoldable(h) {
    const i = this.holdables.indexOf(h);
    if (i >= 0) this.holdables.splice(i, 1);
    if (h.mesh?.parent) h.mesh.parent.remove(h.mesh);
    else this.scene.remove(h.mesh);
  }

  /**
   * Validate a building footprint: no water/shaft overlap, no existing buildings
   * or blocking resources, slope must be gentle.
   * Returns { ok, reason } or { ok: true }.
   */
  validateBuildSite(type, x, z) {
    const def = BUILDINGS[type];
    const fp = def.footprint || 2.5;
    const isBridge = type === 'bridge';
    // sample ring + center
    const pts = [[0, 0]];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      pts.push([Math.cos(a) * fp, Math.sin(a) * fp]);
      pts.push([Math.cos(a) * fp * 0.5, Math.sin(a) * fp * 0.5]);
    }
    let waterHits = 0;
    for (const [dx, dz] of pts) {
      const px = x + dx, pz = z + dz;
      if (this.terrain.isWater(px, pz)) waterHits++;
      if (this.terrain.isShaft(px, pz, 2)) return { ok: false, reason: 'Shaft / sinkhole in footprint' };
    }
    if (isBridge) {
      if (waterHits < 3) return { ok: false, reason: 'Bridge needs water' };
    } else if (waterHits > 0) {
      return { ok: false, reason: 'Cannot build on water' };
    }
    if (!isBridge && this.terrain.maxSlope(x, z, fp) > 0.55)
      return { ok: false, reason: 'Ground too steep — needs leveling space' };
    // overlap existing buildings
    for (const b of this.buildings) {
      const other = BUILDINGS[b.type]?.footprint || 2.5;
      if (dist2(b.pos.x, b.pos.z, x, z) < (fp + other) * (fp + other) * 0.55)
        return { ok: false, reason: 'Overlaps an existing structure' };
    }
    // blocking trees / rocks in pad (bushes ok)
    for (const r of this.resources) {
      if (r.kind === 'bush') continue;
      if (dist2(r.pos.x, r.pos.z, x, z) < fp * fp * 0.7)
        return { ok: false, reason: 'Clear trees / rocks first' };
    }
    return { ok: true };
  }
  chiefNear(creature) {
    for (const c of this.creatures) {
      if (c.side !== creature.side || c === creature || !c.titles.includes('chief')) continue;
      if (c.cls === creature.cls && dist2(c.pos.x, c.pos.z, creature.pos.x, creature.pos.z) < 100) return true;
    }
    return false;
  }
  nearestEnemy(creature, range) {
    const other = creature.side === 'player' ? 'enemy' : 'player';
    let best = null, bd = range * range;
    for (const c of this.creatures) {
      if (c.side !== other) continue;
      const d = dist2(c.pos.x, c.pos.z, creature.pos.x, creature.pos.z);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }
  nearestThreat(creature) {
    let best = null, bd = 1e9;
    for (const m of this.monsters) {
      const d = dist2(m.pos.x, m.pos.z, creature.pos.x, creature.pos.z);
      if (d < bd) { bd = d; best = m; }
    }
    const foe = this.nearestEnemy(creature, 10);
    if (foe && foe.cls === 'knight') {
      const d = dist2(foe.pos.x, foe.pos.z, creature.pos.x, creature.pos.z);
      if (d < bd) return foe;
    }
    return best;
  }
  nearestMonsterNear(pos, r) {
    for (const m of this.monsters)
      if (dist2(m.pos.x, m.pos.z, pos.x, pos.z) < r * r) return m;
    return null;
  }
  bridgeAt(x, z) {
    for (const b of this.buildings)
      if (b.type === 'bridge' && dist2(b.pos.x, b.pos.z, x, z) < 4) return true;
    return false;
  }

  setSelected(ent) {
    this.selected = ent;
    this.selRing.visible = !!ent;
  }

  // ---------------- deaths / removals ----------------
  killCreature(c, attacker, cause) {
    const i = this.creatures.indexOf(c);
    if (i >= 0) this.creatures.splice(i, 1);
    c.releaseClaim?.();
    this.scene.remove(c.mesh);
    this.state[c.side].deaths++;
    if (this.selected === c) this.setSelected(null);
    if (cause === 'combat' && this.lastSmiter === 'player' && c.side !== 'player') {
      this.alignment.kills++;
      nudgeAlignment(this.alignment, -0.035);
    }
    // clear references so survivors don't freeze on a dead target
    for (const o of this.creatures) {
      if (o.target === c) { o.target = null; if (o.task === 'attack' || o.task === 'hunt') o.task = 'idle'; }
    }
    if (attacker && attacker.side && attacker.side !== c.side) {
      this.state[attacker.side].kills++;
      if (attacker.isWarrior && this.hasTech(attacker.side, 'bloodrage')) this.state[attacker.side].food += 5;
    }
    if (cause === 'age' && c.side === 'player') this.msg(`${c.name} died of old age (${Math.floor(c.age)}y)`, c.pos.clone());
    else if (cause === 'combat' && c.side === 'player') this.msg(`${c.name} has been slain!`, c.pos.clone());
  }
  killAnimal(a, attacker) {
    const i = this.animals.indexOf(a);
    if (i >= 0) this.animals.splice(i, 1);
    this.scene.remove(a.mesh);
    if (this.selected === a) this.setSelected(null);
    // A tamed companion's owner must not keep a reference to a dead animal —
    // the link is bidirectional, so both ends have to be cleared.
    if (a.tamedBy) {
      if (a.tamedBy.companion === a) {
        a.tamedBy.companion = null;
        a.tamedBy.morale = Math.max(0, a.tamedBy.morale - 15); // losing a companion hurts
      }
      a.tamedBy = null;
    }
    if (attacker && attacker.side && !a.aquatic) this.state[attacker.side].food += a.type === 'snake' ? 4 : 10;
  }
  killMonster(m, attacker) {
    const i = this.monsters.indexOf(m);
    if (i >= 0) this.monsters.splice(i, 1);
    this.scene.remove(m.mesh);
    if (this.selected === m) this.setSelected(null);
    if (attacker && attacker.side) {
      this.state[attacker.side].kills += 3;
      this.msg(`The ${m.type} has been slain!`, m.pos.clone());
    }
  }
  destroyBuilding(b, attacker) {
    const i = this.buildings.indexOf(b);
    if (i >= 0) this.buildings.splice(i, 1);
    this.scene.remove(b.mesh);
    if (this.selected === b) this.setSelected(null);
    if (b.type === 'campfire') this.msg(`A campfire has been extinguished!`, b.pos.clone());
  }
  removeResource(r) {
    const i = this.resources.indexOf(r);
    if (i >= 0) this.resources.splice(i, 1);
    r.amount = 0; // so any claimant abandons it
    this.scene.remove(r.mesh);
  }
  // ===================== PHASE 6: STORY MODE ================================

  /**
   * Configure this match from a mission manifest: starting age, the god's
   * initial alignment, the rival god's temperament, and the mission's quests
   * (replacing the procedurally seeded set).
   */
  applyMission(manifest) {
    if (!manifest) return null;
    this.mission = manifest;

    // Starting age: grant the techs that era implies, so the civ genuinely
    // begins there rather than merely being labelled with it.
    const AGE_TECHS = {
      Stone: [], Fire: ['toolmaking'],
      Bronze: ['toolmaking', 'masonry'],
      Iron: ['toolmaking', 'masonry', 'warcraft'],
      Steel: ['toolmaking', 'masonry', 'warcraft', 'agriculture', 'discipline'],
    };
    for (const t of AGE_TECHS[manifest.startingAge] || []) {
      this.state.player.techs[t] = 1;
    }

    fromManifest(this.alignment, manifest.initialAlignment || {});
    if (manifest.aiGod?.initialAlignment) {
      fromManifest(this.enemyAlignment, manifest.aiGod.initialAlignment);
    }
    if (typeof manifest.aiGod?.aggression === 'number') {
      this.aiAggression = manifest.aiGod.aggression;
    }

    // Mission quests replace the generated ones.
    this.quests = new QuestEngine(this);
    this.quests.loadManifest(manifest, 'player');
    return this.quests;
  }

  /** True when every quest in the loaded mission is complete. */
  get missionWon() {
    return Campaign.isMissionWon(this.quests);
  }

  // ===================== PHASE 5: RIVAL GODS & VICTORY ======================

  /**
   * A rival god acts: it picks a sigil consistent with the personality its own
   * alignment has drifted into, pays divine power for it, and drifts further.
   * Uses the same castSpell path as the player, so any spell balance change
   * applies to both.
   */
  aiGodCast(side, st) {
    const align = this.enemyAlignment;
    if (!align || (st.dp ?? 0) < 60) return;
    // Missions can set a rival's aggression (mission-01 uses a low 0.25 to
    // give the player room to learn); default is a middling temperament.
    if (this.rng() > (this.aiAggression ?? 0.35)) return;

    const wrathful = align.value < 0;
    // Wrathful gods smite; benevolent ones tend their flock.
    const table = wrathful
      ? [['zigzag', 3], ['star', 2], ['line', 3], ['spiral', 2]]
      : [['circle', 3], ['circle_soft', 3], ['line', 1]];
    let tot = 0;
    for (const [, w] of table) tot += w;
    let r = this.rng() * tot;
    let shape = table[0][0];
    for (const [name, w] of table) { r -= w; if (r <= 0) { shape = name; break; } }

    // Aim at the player's settlement when hostile, its own when nurturing.
    const anchor = wrathful ? this.homeOf('player') : this.homeOf(side);
    if (!anchor) return;
    const pts = [0, 1, 2].map((i) => new THREE.Vector3(
      anchor.pos.x + (this.rng() - 0.5) * 8 + i,
      0,
      anchor.pos.z + (this.rng() - 0.5) * 8,
    ));

    this.castSpell(side, shape, pts, {});

    // The rival's own alignment drifts from what it chooses to do.
    const CHAOTIC = { zigzag: -0.05, spiral: -0.04, star: -0.035 };
    const ORDERLY = { circle_soft: 0.05, circle: 0.03 };
    nudge(align, {
      good: (shape === 'circle' || shape === 'circle_soft') ? 0.05 : -0.04,
      order: CHAOTIC[shape] ?? ORDERLY[shape] ?? 0,
    });
    this.aiCasts = (this.aiCasts || 0) + 1;
  }

  /** Victory-point totals and their itemised breakdown. */
  victoryPointsOf(side) { return victoryPoints(this, side); }
  victoryBreakdownOf(side) { return victoryBreakdown(this, side); }

  /** Resource-stream multipliers from settlement layout. */
  proximityFor(side) { return proximityModifiers(this, side); }

  // ===================== PHASE 4: DIVINE CONSEQUENCE ========================

  /** Current gameplay effects of the god's alignment. */
  get alignEffects() { return effectsFor(this.alignment); }

  /** Quadrant name for the HUD, e.g. "Chaotic Wrathful". */
  get alignLabel() { return quadrantLabel(this.alignment); }

  /**
   * Chaos destabilises the island: biomes mutate and volcanoes wake. Run on a
   * slow timer rather than per frame — these are landscape events, and the
   * chance values are tuned per-event, not per-tick.
   */
  chaosTick() {
    const fx = this.alignEffects;
    if (fx.biomeMutationChance <= 0 && fx.eruptionChance <= 0) return;

    if (this.rng() < fx.biomeMutationChance) {
      const x = (this.rng() - 0.5) * 120, z = (this.rng() - 0.5) * 120;
      if (!this.terrain.isWater(x, z)) {
        // A wild swing in moisture, which the ecology then resolves into a
        // biome change — chaos works through the same system as everything
        // else rather than writing biomes directly.
        const wet = this.rng() < 0.5;
        if (wet) this.ecology.waterAt(x, z, 0.5, 9);
        else this.ecology.drainAt(x, z, 0.5, 9);
        this.alignment.mutations = (this.alignment.mutations || 0) + 1;
        this.msg('The land twists under a chaotic god', new THREE.Vector3(x, this.terrain.getHeight(x, z), z));
      }
    }

    if (this.rng() < fx.eruptionChance) {
      const x = (this.rng() - 0.5) * 110, z = (this.rng() - 0.5) * 110;
      if (!this.terrain.isWater(x, z)) {
        this.terrain.deform(x, z, 7, 2.2);          // a new cone shoulders up
        this.ecology.drainAt(x, z, 0.9, 8);          // ash sterilises the ground
        this.alignment.eruptions = (this.alignment.eruptions || 0) + 1;
        this.msg('A volcano erupts!', new THREE.Vector3(x, this.terrain.getHeight(x, z), z));
      }
    }
  }

  /**
   * Sacrifice a unit for raw divine power. Only an evil god may do this, and
   * it drives alignment further toward evil and chaos — the power is real but
   * the cost compounds.
   *
   * @returns {number} divine power granted (0 if refused)
   */
  sacrifice(creature) {
    const fx = this.alignEffects;
    if (!creature || creature.hp <= 0) return 0;
    if (!fx.canSacrifice) {
      this.msg('A benevolent god cannot demand blood');
      return 0;
    }
    const gained = fx.sacrificeYield;
    const side = creature.side;
    this.stateOf(side).dp += gained;
    this.alignment.sacrifices = (this.alignment.sacrifices || 0) + 1;
    nudge(this.alignment, { good: -0.06, order: -0.03 });
    // Witnesses lose heart.
    for (const c of this.creatures) {
      if (c === creature || c.side !== side) continue;
      if (dist2(c.pos.x, c.pos.z, creature.pos.x, creature.pos.z) < 400) {
        c.morale = Math.max(0, (c.morale ?? 60) - 18);
        c.fear = Math.min(1, (c.fear || 0) + 0.35);
      }
    }
    this.killCreature(creature, null, 'sacrifice');
    this.msg(`A life is spent for power (+${gained.toFixed(0)} ✦)`, creature.pos.clone());
    return gained;
  }

  // ===================== PHASE 3: CIVILISATION ADVANCEMENT ==================

  /** Technological era of a side, derived from the techs it holds. */
  eraOf(side) { return eraOf(this.stateOf(side).techs); }

  /** Best craftable tool for a resource stream at this side's era. */
  bestToolForSide(side, yields) { return bestToolFor(this.stateOf(side).techs, yields); }

  /** Hidden map resources this side's techs have revealed. */
  revealedFor(side) { return revealedResources(this.stateOf(side).techs); }

  /** Nearest untamed animal this side's era permits taming, within reach. */
  nearestTameable(unit, maxDist = 18) {
    const techs = this.stateOf(unit.side).techs;
    let best = null, bestD = maxDist * maxDist;
    for (const a of this.animals) {
      if (a.tamedBy || a.spooked || !COMPANIONS[a.type] || !canTame(techs, a.type)) continue;
      const d = dist2(a.pos.x, a.pos.z, unit.pos.x, unit.pos.z);
      if (d < bestD) { bestD = d; best = a; }
    }
    return best;
  }

  /**
   * Periodically plan roads between this side's structures. Nearest-pair
   * first, so the network grows outward from the settlement core rather than
   * flinging a highway to the furthest hut.
   */
  planRoads(side) {
    const structures = this.buildings.filter((b) => b.side === side && !b.constructing);
    if (structures.length < 2) return null;
    let bestPair = null, bestD = Infinity;
    for (let i = 0; i < structures.length; i++) {
      for (let j = i + 1; j < structures.length; j++) {
        const a = structures[i], b = structures[j];
        if (this.roads.hasRoute(a, b)) continue;
        const d = dist2(a.pos.x, a.pos.z, b.pos.x, b.pos.z);
        if (d < bestD) { bestD = d; bestPair = [a, b]; }
      }
    }
    return bestPair ? this.roads.planRoute(bestPair[0], bestPair[1]) : null;
  }

  // ===================== PHASE 1: ENVIRONMENTAL FEEDBACK =====================

  /**
   * Rain waters the island. Sampled on a coarse lattice rather than per-cell:
   * Ecology.waterAt already brushes a radius, so a sparse grid covers the map
   * at a fraction of the cost and keeps rain off the frame budget.
   */
  rainfallTick(dt) {
    const strength = this.cycles.weather === 'storm' ? 0.055 : 0.03;
    const half = WORLD_SIZE / 2;
    const step = 16;
    for (let z = -half; z <= half; z += step) {
      for (let x = -half; x <= half; x += step) {
        this.ecology.waterAt(x, z, strength * dt, step * 0.8);
      }
    }
  }

  /**
   * A cell just turned to desert. Vegetation rooted in it dies — this is the
   * visible consequence that makes over-harvesting legible to the player.
   */
  onCellDesertified(x, z) {
    const doomed = [];
    for (const r of this.resources) {
      if (r.kind !== 'tree' && r.kind !== 'bush') continue;
      if (dist2(r.pos.x, r.pos.z, x, z) > 9) continue; // within ~3 world units
      doomed.push(r);
    }
    for (const r of doomed) this.removeResource(r);
    if (doomed.length && this.terrain.fogAt(x, z) > 0.9) {
      this.msg('The soil is spent — the land turns to desert', new THREE.Vector3(x, this.terrain.getHeight(x, z), z));
    }
  }

  /**
   * A cell recovered. Flora returns gradually — one sapling at a time, gated
   * by rng so a restored region greens over seconds instead of popping in.
   */
  onCellRestored(x, z) {
    if (this.rng() > 0.12) return;
    if (this.terrain.isWater(x, z)) return;
    // Match the restored biome rather than always planting oak.
    const bio = this.terrain.getBiomeKey?.(x, z) || '';
    const kind = /Boreal|Tundra|Ice/i.test(bio) ? 'pine'
      : /Tropical|Mangrove|Swamp/i.test(bio) ? 'palm'
      : 'oak';
    this.spawnSeedling(x, z, kind);
    if (this.terrain.fogAt(x, z) > 0.9) {
      this.msg('Green returns to the wasted land', new THREE.Vector3(x, this.terrain.getHeight(x, z), z));
    }
  }

  smashTree(tree) {
    const owner = tree._thrownBy || 'player';
    this.state[owner].wood += 8;
    this.trackGather(owner, { food: 0, wood: 8 });
    this.removeResource(tree);
    if (owner === 'player') this.msg('+8 wood from the shattered tree', tree.pos.clone());
  }
  claimRelic(relic, side) {
    const i = this.relics.indexOf(relic);
    if (i >= 0) this.relics.splice(i, 1);
    this.scene.remove(relic.mesh);
    this.state[side].dp += 100;
    this.state[side].ach.relics++;
    if (side === 'player') this.msg('Ancient relic found! +100 ✦', relic.pos.clone());
  }
  trackGather(side, carried) {
    this.state[side].ach.wood += carried.wood || 0;
    this.state[side].ach.food += carried.food || 0;
    this.state[side].ach.rock += carried.rock || 0;
    this.state[side].ach.metal += carried.metal || 0;
  }

  // ---------------- tech tree / favors / building ----------------
  achievementDone(side, tech) {
    const st = this.state[side];
    switch (tech.ach) {
      case 'wood50': return st.ach.wood >= 50;
      case 'wood100': return st.wood >= 100;
      case 'food80': return st.ach.food >= 80;
      case 'pop12': return this.popOf(side) >= 12;
      case 'pop15': return this.popOf(side) >= 15;
      case 'pop20': return this.popOf(side) >= 20;
      case 'spells5': return st.ach.spells >= 5;
      case 'spells8': return st.ach.spells >= 8;
      case 'spells10': return st.ach.spells >= 10;
      case 'kills5': return st.kills >= 5;
      case 'kills8': return st.kills >= 8;
      case 'warriors5': return this.creatures.filter(c => c.side === side && c.cls === 'knight').length >= 5;
      case 'births10': return st.ach.births >= 10;
      default: return false;
    }
  }
  // a tech is visible/unlockable for a side if it's global or matches its civ
  techsFor(side) {
    const civ = this.civOf(side);
    return TECHS.filter(t => !t.civ || t.civ === civ);
  }
  techAvailable(side, tech) {
    const st = this.state[side];
    if (st.techs[tech.key]) return false;
    if (tech.civ && tech.civ !== this.civOf(side)) return false;
    if (tech.excludes && st.techs[tech.excludes]) return false;   // other branch chosen
    for (const r of tech.req) if (!st.techs[r]) return false;
    return true;
  }
  unlockTech(side, key) {
    const tech = TECHS.find(t => t.key === key);
    const st = this.state[side];
    if (!tech || !this.techAvailable(side, tech) || st.dp < tech.dp || !this.achievementDone(side, tech)) return false;
    st.dp -= tech.dp;
    st.techs[key] = true;
    if (key === 'masonry') for (const b of this.buildings) if (b.side === side) { b.maxHp *= 2; b.hp *= 2; }
    if (side === 'player') this.msg(`${tech.name} unlocked!`);
    return true;
  }
  buyFavor(side, key) {
    const fav = FAVORS.find(f => f.key === key);
    const st = this.state[side];
    if (!fav || st.dp < fav.dp) return false;
    st.dp -= fav.dp;
    if (key === 'harvest') {
      st.food += 80;
      for (const r of this.resources) r.regrow(20);
    } else {
      this.favors[side][key] = key === 'youth' ? 90 : 60;
    }
    if (side === 'player') this.msg(`${fav.name} granted`);
    return true;
  }
  canBuild(side, type) {
    const def = BUILDINGS[type];
    const st = this.state[side];
    if (def.tech && !st.techs[def.tech]) return false;
    if (this.mode === 'construction' && side === 'player') return true;
    return st.wood >= (def.wood || 0) && st.rock >= (def.rock || 0) &&
      st.metal >= (def.metal || 0) && st.dp >= (def.dp || 0);
  }
  build(side, type, x, z, opts = {}) {
    if (this.paused && side === 'player' && !opts._focusFlush) {
      this.focusQueue.push({ kind: 'build', side, type, x, z });
      this.msg(`Queued ${type} (${this.focusQueue.length} in Focus)`);
      return true;
    }
    if (!this.canBuild(side, type)) return false;
    const def = BUILDINGS[type];
    const check = this.validateBuildSite(type, x, z);
    if (!check.ok) {
      if (side === 'player') this.msg(check.reason);
      return false;
    }
    if (!(this.mode === 'construction' && side === 'player')) {
      const st = this.state[side];
      st.wood -= def.wood || 0;
      st.rock -= def.rock || 0;
      st.metal -= def.metal || 0;
      st.dp -= def.dp || 0;
    }
    // level a pad slightly larger than the footprint, then place scaffold
    if (type !== 'bridge' && type !== 'campfire') {
      this.terrain.levelFlat(x, z, (def.footprint || 2.5) * 1.15);
    }
    const instant = type === 'campfire';
    const b = new Building(this, side, type, x, z, { constructing: !instant && (def.buildTime || 0) > 0 });
    this.buildings.push(b);
    if (side === 'player') {
      this.msg(b.constructing
        ? `Ground leveled — clearing site for ${def.name}`
        : `${def.name} built`, new THREE.Vector3(x, 0, z));
    }
    return true;
  }

  // ---------------- spells ----------------
  spellCost(side, base) {
    if (this.mode === 'construction' && side === 'player') return 0;
    const faith = this.faithLevel(side);
    // higher faith slightly discounts cost (more efficient rites)
    const myst = this.hasTech(side, 'mysticism') ? 0.7 : 1;
    return Math.max(5, Math.round(base * myst * (1.15 - faith * 0.25)));
  }

  castSpell(side, shape, worldPts, opts = {}) {
    // Focus Mode: queue while paused (except when flushing the queue)
    if (this.paused && side === 'player' && !opts._focusFlush) {
      this.focusQueue.push({ kind: 'spell', side, shape, worldPts: worldPts.map(p => p.clone()), opts });
      this.msg(`Queued ${shape} (${this.focusQueue.length} in Focus)`);
      return;
    }
    const st = this.state[side];
    const costs = {
      circle: opts.miracle ? 45 : 30,
      circle_soft: 35,
      line: 40, zigzag: 50, spiral: 55, star: 70,
    };
    const cost = this.spellCost(side, costs[shape] || 40);
    if (st.dp < cost) { if (side === 'player') this.msg(`Not enough Divine Points (${cost} ✦ needed)`); return; }
    st.dp -= cost;
    st.ach.spells++;
    const faith = this.faithLevel(side);
    const center = worldPts[Math.floor(worldPts.length / 2)];
    // Alignment moves on both axes (Phase 4): harmful smites tilt wrathful,
    // rain/heal tilt benevolent — and destructive, world-tearing miracles
    // (quake, storm, meteor) tilt chaotic while nurturing ones tilt orderly.
    if (side === 'player') {
      if (shape === 'star' || shape === 'zigzag' || shape === 'line') nudgeAlignment(this.alignment, -0.04);
      if (shape === 'circle' && !opts.miracle) nudgeAlignment(this.alignment, 0.05);
      if (shape === 'circle_soft') nudgeAlignment(this.alignment, 0.07);

      const CHAOTIC = { zigzag: -0.05, spiral: -0.04, star: -0.035, wave: -0.02 };
      const ORDERLY = { circle_soft: 0.05, circle: 0.03 };
      nudge(this.alignment, { order: CHAOTIC[shape] ?? ORDERLY[shape] ?? 0 });
      this.spellsCast++;   // Phase 5: CastSpell objectives measure this
    }
    if (shape === 'circle_soft') this.spellHeal(side, center, faith);
    else if (shape === 'circle') {
      if (opts.miracle) this.spellShield(side, center, faith);
      else this.spellRain(side, center, faith);
    }
    if (shape === 'line') this.spellLightning(side, worldPts, faith);
    if (shape === 'zigzag') {
      let pathLen = 0;
      for (let i = 1; i < worldPts.length; i++)
        pathLen += Math.hypot(worldPts[i].x - worldPts[i - 1].x, worldPts[i].z - worldPts[i - 1].z);
      if (pathLen > 28) this.spellEarthquake(side, worldPts, faith);
      else this.spellFire(side, center, faith);
    }
    if (shape === 'spiral') this.spellStorm(side, center, faith);
    if (shape === 'star') this.spellMeteor(side, center, faith);
  }

  spellShield(side, center, faith = 1) {
    const pal = spellPalette(side === 'player' ? this.alignment : null);
    const r = 6 + faith * 5;
    const ringGeo = new THREE.SphereGeometry(r, 16, 12);
    const mesh = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
      color: pal.shield, transparent: true, opacity: 0.22, wireframe: true,
    }));
    mesh.position.set(center.x, this.terrain.getHeight(center.x, center.z) + 1, center.z);
    this.scene.add(mesh);
    this._shields = this._shields || [];
    this._shields.push({ side, x: center.x, z: center.z, r, ttl: 12 + faith * 8 });
    this.effects.push({
      mesh, ttl: 12 + faith * 8,
      update: (e, dt) => { e.mesh.rotation.y += dt; e.mesh.material.opacity = 0.12 + Math.sin(this.elapsed * 3) * 0.08; },
    });
    if (side === 'player') this.msg('Shield Bubble ◎', center.clone());
  }

  spellStorm(side, center, faith = 1) {
    this.cycles.weather = 'storm';
    this.cycles.weatherTimer = 18 + faith * 10;
    this.cycles.wind = Math.min(1, 0.7 + faith * 0.3);
    this.spellRain(side, center, faith * 0.7);
    for (const b of this.buildings) {
      if (b.type === 'hut' && dist2(b.pos.x, b.pos.z, center.x, center.z) < 400)
        b.damage(15 * faith, null);
    }
    if (side === 'player') this.msg('Tempest Spiral 🌀', center.clone());
  }

  spellMeteor(side, center, faith = 1) {
    this.lastSmiter = side;
    const rock = this.terrain.rock[this.terrain.idx(center.x, center.z)] || 0.3;
    const craterR = (3.5 + faith * 3) * (0.7 + rock * 0.6);
    // skip if shielded
    if ((this._shields || []).some(s => s.ttl > 0 && dist2(s.x, s.z, center.x, center.z) < s.r * s.r)) {
      if (side === 'player') this.msg('Meteor absorbed by a shield!', center.clone());
      return;
    }
    const pal = spellPalette(side === 'player' ? this.alignment : null);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(1.2, 8, 6),
      new THREE.MeshLambertMaterial({ color: pal.meteor, emissive: pal.meteorEmissive }));
    const groundY = this.terrain.getHeight(center.x, center.z);
    ball.position.set(center.x, 40, center.z);
    this.scene.add(ball);
    this.effects.push({
      mesh: ball, ttl: 4,
      update: (e, dt) => {
        e.mesh.position.y -= dt * 28;
        if (e.mesh.position.y <= groundY + 0.5 && !e._boom) {
          e._boom = true; e.ttl = 0.5;
          this.terrain.deform(center.x, center.z, craterR, -2.8);
          // smoke ring
          const smoke = new THREE.Mesh(new THREE.RingGeometry(1, craterR * 1.4, 24),
            new THREE.MeshBasicMaterial({ color: 0x888888, transparent: true, opacity: 0.5, side: THREE.DoubleSide }));
          smoke.rotation.x = -Math.PI / 2;
          smoke.position.set(center.x, groundY + 0.4, center.z);
          this.scene.add(smoke);
          this.effects.push({ mesh: smoke, ttl: 3, update: (s, d) => { s.mesh.scale.multiplyScalar(1 + d * 0.4); s.mesh.material.opacity -= d * 0.15; } });
          // shockwave trees outward
          for (const r of this.resources.slice()) {
            if (r.kind !== 'tree') continue;
            const d = dist2(r.pos.x, r.pos.z, center.x, center.z);
            if (d < craterR * craterR * 4) {
              const ang = Math.atan2(r.pos.z - center.z, r.pos.x - center.x);
              r.vel = r.vel || new THREE.Vector3();
              r.vel.set(Math.cos(ang) * 12, 8, Math.sin(ang) * 12);
              r.airborne = true;
            }
          }
          for (const c of this.creatures.slice()) {
            if (dist2(c.pos.x, c.pos.z, center.x, center.z) < craterR * craterR * 2.5) {
              c.startPanic(center.clone());
              c.damage(70 * faith, null);
            }
          }
          for (const b of this.buildings.slice())
            if (dist2(b.pos.x, b.pos.z, center.x, center.z) < craterR * craterR * 2)
              b.damage(120 * faith, null);
        }
      },
    });
    if (side === 'player') this.msg(`Meteor ✶ crater ${craterR.toFixed(1)}`, center.clone());
  }

  spellEarthquake(side, worldPts, faith = 1) {
    for (const p of worldPts) {
      if (this.rng() < 0.35) this.terrain.deform(p.x, p.z, 2.5, -0.6 * faith);
    }
    const a = worldPts[0], b = worldPts[worldPts.length - 1];
    for (const r of this.resources.slice()) {
      if (r.kind === 'tree' && dist2(r.pos.x, r.pos.z, a.x, a.z) < 900) {
        // near fault
        const abx = b.x - a.x, abz = b.z - a.z, len2 = abx * abx + abz * abz || 1;
        const t = clamp(((r.pos.x - a.x) * abx + (r.pos.z - a.z) * abz) / len2, 0, 1);
        if (dist2(r.pos.x, r.pos.z, a.x + abx * t, a.z + abz * t) < 36) this.removeResource(r);
      }
    }
    for (const bl of this.buildings.slice()) {
      const abx = b.x - a.x, abz = b.z - a.z, len2 = abx * abx + abz * abz || 1;
      const t = clamp(((bl.pos.x - a.x) * abx + (bl.pos.z - a.z) * abz) / len2, 0, 1);
      if (dist2(bl.pos.x, bl.pos.z, a.x + abx * t, a.z + abz * t) < 64)
        bl.damage(50 * faith, null);
    }
    if (side === 'player') this.msg('Earthquake 〰', a.clone());
  }

  invokeFauna(side, x, z, opts = {}) {
    if (this.paused && side === 'player' && !opts._focusFlush) {
      this.focusQueue.push({ kind: 'invoke', side, x, z });
      this.msg(`Queued invoke (${this.focusQueue.length} in Focus)`);
      return true;
    }
    const st = this.stateOf(side);
    const faith = this.faithLevel(side);
    const cost = this.mode === 'construction' && side === 'player' ? 0 : 25;
    if (st.dp < cost) { this.msg(`Need ${cost} ✦ to invoke`); return false; }
    if (faith < 0.25 && this.mode === 'battle') { this.msg('Faith too weak to call beasts'); return false; }
    const civ = this.civOf(side);
    const pool = INVOKE_FAUNA[civ] || ['deer'];
    const bio = this.terrain.getBiomeId?.(x, z) ?? 9;
    const wet = this.terrain.isWater(x, z);
    let type;
    if (wet) {
      type = 'fish';
    } else {
      type = pick(this.rng, pool);
      if (bio === 7 || bio === 0) type = pool.find(t => t === 'snake' || t === 'jaguar') || type;
      if (bio === 5 || bio === 6) type = pool.includes('snake') ? 'snake' : type;
      if (bio === 13 || bio === 8) type = pool.find(t => t === 'wolf' || t === 'deer') || type;
      if (bio === 4 || bio === 10) type = pool.find(t => t === 'jaguar' || t === 'boar' || t === 'deer') || type;
    }
    st.dp -= cost;
    this.animals.push(new Animal(this, type, x, z));
    if (side === 'player') {
      const biomeName = this.terrain.getBiomeKey?.(x, z) || 'wilds';
      this.msg(`Invoked ${type} (${biomeName})`, new THREE.Vector3(x, 0, z));
    }
    return true;
  }

  spawnSeedling(x, z, kind = 'oak') {
    this.resources.push(new ResourceNode(this, 'tree', x, z, kind, true));
  }

  focusPlant(x, z, kind, opts = {}) {
    if (this.paused && !opts._focusFlush) {
      this.focusQueue.push({ kind: 'plant', x, z, kind });
      this.msg(`Queued plant (${this.focusQueue.length} in Focus)`);
      return;
    }
    if (this.terrain.isWater(x, z)) return;
    const cost = this.mode === 'battle' ? 5 : 0;
    if (this.state.player.dp < cost) return;
    this.state.player.dp -= cost;
    this.spawnSeedling(x, z, kind || ['oak', 'pine', 'cherry'][(this.rng() * 3) | 0]);
  }

  toggleInfluence() {
    this.influenceOn = !this.influenceOn;
    this.influenceOverlay.visible = this.influenceOn;
    if (this.influenceOn) refreshInfluenceOverlay(this.influenceOverlay, this, 'player');
    this.msg(this.influenceOn ? 'Influence map shown' : 'Influence map hidden');
  }

  flushFocusQueue() {
    const n = this.focusQueue.flush(this);
    if (n) this.msg(`Focus Mode: ${n} actions unleashed`);
  }

  recordGodTouch(kind) {
    // pet / slap from cursor — moral alignment
    if (kind === 'pet') { this.alignment.pets++; nudgeAlignment(this.alignment, 0.06); }
    if (kind === 'slap') { this.alignment.slaps++; nudgeAlignment(this.alignment, -0.05); }
  }

  ledgerStats() { return buildLedgerStats(this, 'player'); }
  alignmentInfo() {
    return { value: this.alignment.value, label: alignmentLabel(this.alignment.value) };
  }

  tryScoop(x, z) {
    // scoop wood / food / water (bubble) for stockpiles
    let wood = 0, food = 0, water = 0;
    if (this.terrain.isWater(x, z)) water = 8 + ((this.rng() * 6) | 0);
    for (const h of this.holdables) {
      if (!h.heldBy && dist2(h.pos.x, h.pos.z, x, z) < 16) {
        wood += h.amount || 1;
        this.removeHoldable(h);
      }
    }
    for (const r of this.resources) {
      if (dist2(r.pos.x, r.pos.z, x, z) > 20) continue;
      if (r.kind === 'bush') { food += r.harvest(4); }
      if (r.kind === 'tree') { wood += r.harvest(2); }
    }
    if (wood + food + water < 1) return null;
    if (water >= wood && water >= food) return { kind: 'water', amount: Math.round(water) };
    const kind = wood >= food ? 'wood' : 'food';
    const amount = Math.round(kind === 'wood' ? wood : food);
    return { kind, amount };
  }

  dropScoop(side, scoop, x, z) {
    if (!scoop) return;
    const home = this.homeOf(side);
    const nearHome = home && dist2(home.pos.x, home.pos.z, x, z) < 100;
    const st = this.stateOf(side);
    if (scoop.kind === 'water') {
      // water bubble → fertility stamp around drop + slight food via farms
      this.terrain.stampDirt?.(x, z, 3.5, 0.15);
      for (const r of this.resources) {
        if (r.kind === 'bush' && dist2(r.pos.x, r.pos.z, x, z) < 64) r.regrow(6);
      }
      if (nearHome) st.food = (st.food || 0) + Math.floor(scoop.amount * 0.35);
      if (side === 'player') this.msg(`Water bubble nourished the land (+${scoop.amount})`, new THREE.Vector3(x, 0, z));
      return;
    }
    if (nearHome) {
      st[scoop.kind] = (st[scoop.kind] || 0) + scoop.amount;
      this.trackGather(side, { food: scoop.kind === 'food' ? scoop.amount : 0, wood: scoop.kind === 'wood' ? scoop.amount : 0 });
      if (side === 'player') this.msg(`Stockpiled +${scoop.amount} ${scoop.kind}`, home.pos.clone());
    } else if (side === 'player') {
      this.msg('Drop nearer the campfire to stockpile');
      st[scoop.kind] = (st[scoop.kind] || 0) + Math.floor(scoop.amount * 0.5);
    }
  }

  spellRain(side, center, faith = 1) {
    const bloom = this.hasTech(side, 'lifebloom');
    const radius = 8 + faith * 8;
    const heal = (bloom ? 30 : 15) * faith;
    const pal = spellPalette(side === 'player' ? this.alignment : null);
    const ringGeo = new THREE.RingGeometry(1, radius, 32);
    ringGeo.rotateX(-Math.PI / 2);
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: pal.rain, transparent: true, opacity: 0.5, side: THREE.DoubleSide }));
    ring.position.set(center.x, this.terrain.getHeight(center.x, center.z) + 0.3, center.z);
    this.scene.add(ring);
    this.effects.push({ mesh: ring, ttl: 2, update: (e, dt) => { e.mesh.scale.multiplyScalar(1 + dt); e.mesh.material.opacity -= dt * 0.25; } });

    const r2 = radius * radius;
    for (const r of this.resources) if (dist2(r.pos.x, r.pos.z, center.x, center.z) < r2 * 1.2) r.regrow(bloom ? 20 : 10);
    for (const c of this.creatures) {
      if (dist2(c.pos.x, c.pos.z, center.x, center.z) < r2 * 2) {
        c.hp = Math.min(c.maxHp, c.hp + heal);
        c.beliefs[side] = clamp(c.beliefs[side] + (bloom ? 18 : 9) * faith, 0, 100);
      }
    }
    if (side === 'player') {
      this.alignment.heals++;
      nudgeAlignment(this.alignment, 0.03);
      this.msg(`Rain of life ◯ (faith ${Math.round(faith * 100)}%)`, center.clone());
    }
  }

  /** Healing Aura — soft circle; cures panic and restores HP without weather change. */
  spellHeal(side, center, faith = 1) {
    const radius = 6 + faith * 5;
    const heal = 22 * faith;
    const pal = spellPalette(side === 'player' ? this.alignment : null);
    const ringGeo = new THREE.RingGeometry(0.5, radius, 28);
    ringGeo.rotateX(-Math.PI / 2);
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
      color: pal.heal || pal.rain || 0xa8e0ff, transparent: true, opacity: 0.55, side: THREE.DoubleSide,
    }));
    ring.position.set(center.x, this.terrain.getHeight(center.x, center.z) + 0.35, center.z);
    this.scene.add(ring);
    this.effects.push({
      mesh: ring, ttl: 2.2,
      update: (e, dt) => { e.mesh.rotation.z += dt; e.mesh.material.opacity -= dt * 0.22; },
    });
    const r2 = radius * radius;
    for (const c of this.creatures) {
      if (c.side !== side && side === 'player') continue;
      if (dist2(c.pos.x, c.pos.z, center.x, center.z) < r2 * 2) {
        c.hp = Math.min(c.maxHp, c.hp + heal);
        c.fear = Math.max(0, c.fear - 0.5);
        c.alert = 0;
        c.energy = Math.min(c.maxEnergy, c.energy + 15);
        c.beliefs[side] = clamp(c.beliefs[side] + 12 * faith, 0, 100);
      }
    }
    if (side === 'player') {
      this.alignment.heals++;
      nudgeAlignment(this.alignment, 0.05);
      this.msg(`Healing Aura ✚`, center.clone());
    }
  }

  lightningBoltMesh(a, b, color = 0xffffff) {
    const points = [];
    const N = 10;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const x = a.x + (b.x - a.x) * t + (i > 0 && i < N ? (this.rng() - 0.5) * 1.6 : 0);
      const z = a.z + (b.z - a.z) * t + (i > 0 && i < N ? (this.rng() - 0.5) * 1.6 : 0);
      points.push(new THREE.Vector3(x, this.terrain.getHeight(x, z) + 0.2, z));
      points.push(new THREE.Vector3(x, 25 - t * 5, z));
      points.push(new THREE.Vector3(x, this.terrain.getHeight(x, z) + 0.2, z));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color }));
    this.scene.add(line);
    this.effects.push({ mesh: line, ttl: 0.5, update: () => {} });
  }

  spellLightning(side, pts, faith = 1) {
    this.lastSmiter = side;
    const a = pts[0], b = pts[pts.length - 1];
    const pal = spellPalette(side === 'player' ? this.alignment : null);
    this.lightningBoltMesh(a, b, pal.lightning);
    const mul = (this.hasTech(side, 'stormcalling') ? 1.5 : 1) * faith;
    const width = 9 * (0.7 + faith * 0.5);

    const hit = (e) => {
      const abx = b.x - a.x, abz = b.z - a.z;
      const len2 = abx * abx + abz * abz || 1;
      const t = clamp(((e.pos.x - a.x) * abx + (e.pos.z - a.z) * abz) / len2, 0, 1);
      const px = a.x + abx * t, pz = a.z + abz * t;
      return dist2(e.pos.x, e.pos.z, px, pz) < width;
    };
    for (const c of [...this.creatures]) if (hit(c)) {
      c.startPanic(a.clone());
      c.damage(38 * mul, null);
    }
    for (const m of [...this.monsters]) if (hit(m)) m.damage(80 * mul, null);
    for (const bl of [...this.buildings]) if (hit(bl)) bl.damage(60 * mul, null);
    // Electrify water / fish along the bolt
    for (const an of [...this.animals]) {
      if (an.aquatic && hit(an)) an.damage(99, null);
    }
    for (let i = 0; i < pts.length; i += 3) {
      const p = pts[i];
      if (this.terrain.isWater(p.x, p.z)) {
        for (const c of this.creatures)
          if (dist2(c.pos.x, c.pos.z, p.x, p.z) < 36 && this.terrain.isWater(c.pos.x, c.pos.z))
            c.damage(22 * mul, null);
      }
    }
    for (const c of this.creatures) {
      if (dist2(c.pos.x, c.pos.z, a.x, a.z) < 500) {
        c.fear = Math.min(1, c.fear + 0.5);
        if (!c.panicFrom) c.panicFrom = a.clone();
        c.beliefs[side] = clamp(c.beliefs[side] + 5, 0, 100);
      }
    }
    if (side === 'player') this.msg(`Lightning | (faith ${Math.round(faith * 100)}%)`, a.clone());
  }

  // wild lightning during storms — no god behind it, only weather
  naturalLightning(center) {
    this.lightningBoltMesh(center, center.clone().add(new THREE.Vector3(2, 0, 2)));
    for (const c of [...this.creatures]) if (dist2(c.pos.x, c.pos.z, center.x, center.z) < 9) {
      c.startPanic(center.clone());
      c.damage(38, null);
    }
    for (const m of [...this.monsters]) if (dist2(m.pos.x, m.pos.z, center.x, center.z) < 9) m.damage(60, null);
    for (const r of [...this.resources]) if (r.kind === 'tree' && dist2(r.pos.x, r.pos.z, center.x, center.z) < 6) this.removeResource(r);
    for (const c of this.creatures)
      if (dist2(c.pos.x, c.pos.z, center.x, center.z) < 500) {
        c.fear = Math.min(1, c.fear + 0.4);
        c.panicFrom = center.clone();
      }
    this.msg('Lightning splits the sky!', center.clone());
  }

  spellFire(side, center, faith = 1) {
    this.lastSmiter = side;
    const mul = (this.hasTech(side, 'stormcalling') ? 1.5 : 1) * faith;
    const blastR = 25 + faith * 20;
    const ballSize = 0.7 + faith * 0.5;
    const pal = spellPalette(side === 'player' ? this.alignment : null);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(ballSize, 8, 6),
      new THREE.MeshLambertMaterial({ color: pal.fire, emissive: pal.fireEmissive }));
    const groundY = this.terrain.getHeight(center.x, center.z);
    ball.position.set(center.x, 26, center.z);
    this.scene.add(ball);
    this.effects.push({
      mesh: ball, ttl: 3,
      update: (e, dt) => {
        e.mesh.position.y -= dt * 24;
        if (e.mesh.position.y <= groundY + 0.5 && !e._boom) {
          e._boom = true; e.ttl = 0.4;
          e.mesh.scale.setScalar(3 + faith * 2);
          // snapshot lists so kills during the boom never skip or freeze survivors
          const critters = this.creatures.slice();
          for (const c of critters) {
            if (!this.creatures.includes(c)) continue;
            const d = dist2(c.pos.x, c.pos.z, center.x, center.z);
            if (d < blastR) {
              c.startPanic(center.clone());
              c.damage(55 * mul, null);
            } else if (d < blastR * 8) {
              c.fear = Math.min(1, c.fear + 0.7);
              c.panicFrom = center.clone();
              c.beliefs[side] = clamp(c.beliefs[side] + 4, 0, 100);
            }
          }
          for (const m of this.monsters.slice()) {
            if (this.monsters.includes(m) && dist2(m.pos.x, m.pos.z, center.x, center.z) < blastR)
              m.damage(110 * mul, null);
          }
          for (const b of this.buildings.slice()) {
            if (this.buildings.includes(b) && dist2(b.pos.x, b.pos.z, center.x, center.z) < blastR)
              b.damage(90 * mul, null);
          }
          for (const r of this.resources.slice()) {
            if (r.kind !== 'rock' && r.kind !== 'metal' &&
                dist2(r.pos.x, r.pos.z, center.x, center.z) < blastR * 0.7)
              this.removeResource(r);
          }
        }
      },
    });
    if (side === 'player') this.msg(`Fireball ∿ (faith ${Math.round(faith * 100)}%)`, center.clone());
  }

  // ---------------- periodic simulation ----------------
  update(dt) {
    if (this.over) return;
    dt = Math.min(dt, 0.1);
    this.elapsed += dt;
    if (this.timeLeft !== Infinity) this.timeLeft -= dt;

    this.cycles.update(dt, this.camera, this.rng);
    this.terrain.setSeasonTint(this.cycles.snowAmt, this.cycles.autumnAmt);
    const sunDir = this.cycles.sun.position.clone().normalize();
    this.terrain.update(dt, sunDir);

    // Phase 1 environmental loop: rivers deliver moisture, rain waters the
    // whole island, then the ecology resolves fertility and biome flips.
    this.rivers.tick(dt);
    if (this.cycles.weather === 'rain' || this.cycles.weather === 'storm') {
      this._rainTimer = (this._rainTimer || 0) - dt;
      if (this._rainTimer <= 0) {
        this._rainTimer = 0.5;
        this.rainfallTick(0.5);
      }
    }
    this.ecology.tick(dt);

    // Phase 5: quests measure cumulative counters, so a slow tick suffices.
    this._questTimer -= dt;
    if (this._questTimer <= 0) { this._questTimer = 2; this.quests.tick(); }

    // Phase 4: chaotic gods destabilise the island. Landscape-scale events,
    // so they resolve on their own slow timer.
    this._chaosTimer = (this._chaosTimer ?? 5) - dt;
    if (this._chaosTimer <= 0) { this._chaosTimer = 5; this.chaosTick(); }

    // Road planning: cheap, but no reason to run it every frame.
    this._roadPlanTimer -= dt;
    if (this._roadPlanTimer <= 0) {
      this._roadPlanTimer = 12;
      for (const side of ['player', 'enemy']) {
        if (this.roads.openRoutes.length < 3) this.planRoads(side);
      }
    }
    // decay shields
    if (this._shields) {
      for (const s of this._shields) s.ttl -= dt;
      this._shields = this._shields.filter(s => s.ttl > 0);
    }

    // storms hurl wild lightning (rare)
    if (this.cycles.weather === 'storm' && this.rng() < dt * 0.05) {
      for (let t = 0; t < 10; t++) {
        const x = (this.rng() - 0.5) * 140, z = (this.rng() - 0.5) * 140;
        if (!this.terrain.isWater(x, z)) { this.naturalLightning(new THREE.Vector3(x, 0, z)); break; }
      }
    }

    // fog of war: creatures see by their own night ability under the moon
    if (this.terrain.fogEnabled) {
      this.terrain.clearFogFrame();
      const night = this.cycles.isNight;
      for (const c of this.creatures) if (c.side === 'player') this.terrain.revealFog(c.pos.x, c.pos.z, c.visionRadius);
      for (const b of this.buildings) if (b.side === 'player') this.terrain.revealFog(b.pos.x, b.pos.z, night ? 8 : 13);
    }

    for (const c of [...this.creatures]) c.update(dt);
    for (const a of [...this.animals]) a.update(dt);
    for (const m of [...this.monsters]) m.update(dt);
    for (const b of [...this.buildings]) b.update(dt);
    // sandbox: construction sites finish faster without waiting for workers
    if (this.mode === 'construction') {
      for (const b of this.buildings) if (b.constructing && b.side === 'player') b.addWork(dt * 4);
    }
    for (const r of [...this.resources]) r.update(dt);
    for (const h of [...this.holdables]) h.update?.(dt);
    for (const rl of [...this.relics]) rl.update(dt);

    for (const e of [...this.effects]) {
      e.ttl -= dt;
      e.update(e, dt);
      if (e.ttl <= 0) { this.scene.remove(e.mesh); this.effects.splice(this.effects.indexOf(e), 1); }
    }
    for (const side of ['player', 'enemy'])
      for (const k of Object.keys(this.favors[side]))
        this.favors[side][k] = Math.max(0, this.favors[side][k] - dt);

    // belief income
    this._incomeTimer -= dt;
    if (this._incomeTimer <= 0) {
      this._incomeTimer = 1;
      for (const side of ['player', 'enemy']) {
        let dp = 0;
        for (const c of this.creatures) if (c.beliefs[side] > 50) dp += 0.2;
        if (this.civOf(side) === 'aztecs') dp *= 1.25;
        if (this.hasTech(side, 'sun_rituals')) dp *= 1.5;
        this.state[side].dp += dp;
      }
    }

    // nature regenerates
    this._floraTimer = (this._floraTimer || 0) - dt;
    if (this._floraTimer <= 0) {
      this._floraTimer = 2;
      for (const r of this.resources) r.regrow(this.cycles.raining ? 3 : 0.6);
      const trees = this.resources.filter(r => r.kind === 'tree');
      if (trees.length > 0 && trees.length < 200 && this.rng() < 0.5) {
        const parent = pick(this.rng, trees);
        const x = parent.pos.x + (this.rng() - 0.5) * 10, z = parent.pos.z + (this.rng() - 0.5) * 10;
        if (Math.abs(x) < 76 && Math.abs(z) < 76 && !this.terrain.isWater(x, z))
          this.resources.push(new ResourceNode(this, 'tree', x, z, parent.mesh.userData.kind || 'oak', true));
      }
    }

    this._repTimer -= dt;
    if (this._repTimer <= 0) { this._repTimer = 1.2; this.reproductionTick(); }
    this._trainTimer -= dt;
    if (this._trainTimer <= 0) { this._trainTimer = 10; this.trainingTick(); }
    this._convTimer -= dt;
    if (this._convTimer <= 0) { this._convTimer = 2; this.conversionTick(); }
    this._aiTimer -= dt;
    if (this._aiTimer <= 0) { this._aiTimer = 5; this.aiGodTick(); }
    this._chiefTimer -= dt;
    if (this._chiefTimer <= 0) { this._chiefTimer = 45; this.chiefTick(); }
    this._groupT = (this._groupT || 0) - dt;
    if (this._groupT <= 0) { this._groupT = 4.5; this.groupAITick(); }

    seedPropagationTick(this, dt);
    avatarLearnTick(this, dt);
    this._cultureT = (this._cultureT || 0) - dt;
    if (this._cultureT <= 0) { this._cultureT = 12; applyCultureMarkers(this); }
    this._inflT = (this._inflT || 0) - dt;
    if (this.influenceOn && this._inflT <= 0) {
      this._inflT = 1.2;
      refreshInfluenceOverlay(this.influenceOverlay, this, 'player');
    }

    // entity visibility + ghost memory (last state seen)
    if (this.terrain.fogEnabled) {
      const visAt = (p) => this.terrain.fogAt(p.x, p.z);
      for (const c of this.creatures) c.mesh.visible = c.side === 'player' || visAt(c.pos) > 0.9;
      for (const m of this.monsters) m.mesh.visible = visAt(m.pos) > 0.9;
      for (const a of this.animals) a.mesh.visible = visAt(a.pos) > 0.9;
      for (const b of this.buildings) b.mesh.visible = b.side === 'player' || visAt(b.pos) > 0.9;
      for (const r of this.resources) r.mesh.visible = visAt(r.pos) > 0.4;
      this._ghostTimer -= dt;
      if (this._ghostTimer <= 0) { this._ghostTimer = 0.5; this.ghostTick(visAt); }
    }

    // recap timeline samples
    this._sampleTimer -= dt;
    if (this._sampleTimer <= 0) {
      this._sampleTimer = 5;
      this.samples.push({ t: this.elapsed, p: this.popOf('player'), e: this.popOf('enemy') });
    }

    // selection ring follows the selected entity
    if (this.selected) {
      const alive = this.creatures.includes(this.selected) || this.buildings.includes(this.selected) ||
        this.monsters.includes(this.selected) || this.animals.includes(this.selected) ||
        this.resources.includes(this.selected);
      if (!alive) this.setSelected(null);
      else {
        const p = this.selected.pos;
        this.selRing.position.set(p.x, this.terrain.getHeight(p.x, p.z) + 0.12, p.z);
        const s = (this.selected.type && BUILDINGS[this.selected.type]) ? 1.4 : 0.72;
        const pulse = 1 + Math.sin(this.elapsed * 4) * 0.08;
        this.selRing.scale.setScalar(s * pulse);
      }
    }

    this.checkEnd();
  }

  // fog-of-war memory: enemy structures & monsters remain as ghosts where last seen
  ghostTick(visAt) {
    const track = [...this.buildings.filter(b => b.side === 'enemy'), ...this.monsters];
    const liveIds = new Set();
    for (const e of track) {
      liveIds.add(e.id);
      const vis = visAt(e.pos) > 0.9;
      if (vis) {
        e._lastSeen = e.pos.clone();
        const g = this.ghosts.get(e.id);
        if (g) { this.scene.remove(g); this.ghosts.delete(e.id); }
      } else if (e._lastSeen && !this.ghosts.has(e.id)) {
        const ghost = e.mesh.clone();
        const mat = new THREE.MeshLambertMaterial({ color: 0x8a93a3, transparent: true, opacity: 0.4 });
        ghost.traverse(o => {
          if (o.isMesh) { o.material = mat; o.castShadow = false; }
          else if (o.isLight) o.visible = false;
        });
        ghost.position.copy(e._lastSeen);
        ghost.visible = true;
        this.scene.add(ghost);
        this.ghosts.set(e.id, ghost);
      }
    }
    // ghosts of dead things vanish once the spot is re-observed
    for (const [id, ghost] of this.ghosts) {
      if (!liveIds.has(id) && visAt(ghost.position) > 0.9) {
        this.scene.remove(ghost);
        this.ghosts.delete(id);
      }
    }
  }

  reproductionTick() {
    for (const side of ['player', 'enemy']) {
      const home = this.homeOf(side);
      if (!home) continue;
      const st = this.stateOf(side);
      for (const c of this.creatures) {
        if (c.side === side && c.lover && c._loverUntil && this.elapsed > c._loverUntil) c.lover = null;
      }
      if (this.popOf(side) >= this.popCap(side) || st.food < 20) continue;
      const near = this.creatures.filter(c => c.side === side && c.lifeStage === 'adult' &&
        c.mateCooldown <= 0 && dist2(c.pos.x, c.pos.z, home.pos.x, home.pos.z) < 90);
      // Prefer cross-race pairs when both present (race mixing)
      let male = null, female = null;
      const males = near.filter(c => c.sex === 'M');
      const females = near.filter(c => c.sex === 'F');
      for (const m of males) {
        const f = females.find(ff => (ff.raceKey || ff.civKey) !== (m.raceKey || m.civKey));
        if (f) { male = m; female = f; break; }
      }
      if (!male) { male = males[0]; female = females[0]; }
      if (male && female) {
        // Fertility gene gates chance to conceive
        const fert = ((male.dna.fertility ?? 0.5) + (female.dna.fertility ?? 0.5)) * 0.5;
        if (this.rng() > 0.35 + fert * 0.55) {
          male.mateCooldown = 8; female.mateCooldown = 8;
          continue;
        }
        male.lover = female; female.lover = male;
        male.refreshStatusIcon?.(); female.refreshStatusIcon?.();
        st.food -= 15;
        st.ach.births++;
        male.mateCooldown = 25; female.mateCooldown = 25;
        const hx = home.pos.x, hz = home.pos.z;
        const bio = this.terrain.getBiomeId?.(hx, hz) ?? 9;
        const hints = {
          hot: bio === 7 || bio === 10 || bio === 15,
          cold: bio === 0 || bio === 1 || bio === 8 || bio === 13,
          wet: bio === 5 || bio === 6 || bio === 4,
        };
        const dna = mixDNA(this.rng, male, female, hints);
        const hybrid = isHybrid(dna._genome);
        const royalParent = [male, female].some(p =>
          ['king', 'queen'].includes(p.cls) || p.titles.includes('prince') || p.titles.includes('princess'));
        const r = this.rng();
        const cls = r < 0.38 ? 'gatherer' : r < 0.58 ? 'hunter' : r < 0.72 ? 'farmer'
          : r < 0.84 ? 'knight' : r < 0.92 ? 'shaman' : 'philosopher';
        const baby = new Creature(this, side, cls,
          hx + (this.rng() - 0.5) * 3, hz + (this.rng() - 0.5) * 3, dna, 0, []);
        if (royalParent) {
          baby.titles.push(baby.sex === 'M' ? 'prince' : 'princess');
          baby.rebuildMesh();
        }
        this.creatures.push(baby);
        if (side === 'player') {
          this.msg(hybrid
            ? `${baby.name} born — hybrid of ${male.raceKey} × ${female.raceKey}`
            : `${baby.name} was born (${baby.displayTitle})`, home.pos.clone());
        }
        male._loverUntil = this.elapsed + 2.8;
        female._loverUntil = this.elapsed + 2.8;
      }
    }
  }

  trainingTick() {
    for (const side of ['player', 'enemy']) {
      const st = this.stateOf(side);
      const barracks = this.buildings.find(b => b.side === side && b.type === 'barracks' && !b.constructing);
      if (!barracks || st.food < 30) continue;
      const knights = this.creatures.filter(c => c.side === side && c.cls === 'knight').length;
      const farmers = this.creatures.filter(c => c.side === side && c.cls === 'farmer').length;
      if (knights >= 10 || farmers <= 3) continue;
      const farmer = this.creatures.find(c => c.side === side && c.cls === 'farmer' && c.lifeStage === 'adult');
      if (farmer) {
        st.food -= 20;
        farmer.releaseClaim();
        farmer.cls = 'knight';
        farmer.rebuildMesh();
        if (side === 'player') this.msg(`${farmer.name} trained as a warrior`, barracks.pos.clone());
      }
    }
  }

  // the best of each trade earns the Chief title (workers first)
  chiefTick() {
    for (const side of ['player', 'enemy']) {
      const workers = this.creatures.filter(c => c.side === side && c.cls === 'farmer' && c.lifeStage === 'adult');
      if (!workers.length) continue;
      let best = workers[0];
      for (const w of workers) if (w.intelligence * w.strength > best.intelligence * best.strength) best = w;
      if (best.titles.includes('chief')) continue;
      for (const w of this.creatures) {
        if (w.side === side && w.titles.includes('chief')) {
          w.titles = w.titles.filter(t => t !== 'chief');
          w.rebuildMesh();
        }
      }
      best.titles.push('chief');
      best.rebuildMesh();
      if (side === 'player') this.msg(`${best.name} is now ${best.displayTitle}`, best.pos.clone());
    }
  }

  conversionTick() {
    for (const c of [...this.creatures]) {
      const other = c.side === 'player' ? 'enemy' : 'player';
      if (c.beliefs[other] > 78 && c.beliefs[other] > c.beliefs[c.side] + 12) {
        c.releaseClaim();
        c.side = other;
        // cultural allegiance flips; genetic raceKey stays for race mixing
        c.civKey = this.civOf(other);
        c.beliefs = { player: other === 'player' ? 70 : 25, enemy: other === 'enemy' ? 70 : 25 };
        this.state[other].conversions++;
        c.rebuildMesh();
        this.msg(other === 'player' ? `${c.name} converted to your faith!` : `${c.name} was seduced by the enemy god!`, c.pos.clone());
      }
    }
  }

  // ---------------- AI god ----------------
  aiGodTick() {
    if (this.mode !== 'battle') return;
    const side = 'enemy';
    const st = this.stateOf(side);
    const home = this.homeOf(side);
    if (!home) return;

    // walk the tech tree: prefer the war/faith branch fitting the civ capstone
    for (const t of this.techsFor(side)) {
      if (st.techs[t.key]) continue;
      // when facing an either/or choice, take the first option deterministically
      this.unlockTech(side, t.key);
    }

    // Phase 5: the AI god plays by the player's rules — it casts gesture
    // spells from the same table, pays the same divine power, and its choices
    // move its own alignment on both axes. A rival god that ignored alignment
    // would be playing a different game.
    this.aiGodCast(side, st);

    const count = (type) => this.buildings.filter(b => b.side === side && b.type === type && !b.constructing).length;
    const spotNear = () => {
      for (let t = 0; t < 20; t++) {
        const a = this.rng() * Math.PI * 2, r = 4 + this.rng() * 6;
        const x = home.pos.x + Math.cos(a) * r, z = home.pos.z + Math.sin(a) * r;
        if (!this.terrain.isWater(x, z)) return { x, z };
      }
      return null;
    };
    const wants =
      (this.popOf(side) >= this.popCap(side) - 2 && count('hut') < 4) ? 'hut' :
      (st.techs.agriculture && count('farm') < 2) ? 'farm' :
      (st.techs.warcraft && count('barracks') < 1) ? 'barracks' :
      (st.techs.mysticism && count('temple') < 1) ? 'temple' : null;
    if (wants && this.canBuild(side, wants)) {
      const s = spotNear();
      if (s) this.build(side, wants, s.x, s.z);
    }

    const knights = this.creatures.filter(c => c.side === side && c.cls === 'knight').length;
    st.attackMode = knights >= 5;

    if (st.attackMode && st.techs.masonry && !this.buildings.some(b => b.side === side && b.type === 'bridge')) {
      for (let t = 0; t < 25; t++) {
        const z = home.pos.z + (this.rng() - 0.5) * 60;
        const x = Math.sin(z * 0.055) * 10;
        if (this.terrain.isWater(x, z) && this.build(side, 'bridge', x, z)) break;
      }
    }

    this._smiteCd = Math.max(0, (this._smiteCd || 0) - 5);
    if (this.elapsed > 240 && st.dp > 150 && this._smiteCd <= 0) {
      const targets = this.creatures.filter(c => c.side === 'player' && c.pos.x > -12);
      if (targets.length && this.rng() < 0.5) {
        const t = pick(this.rng, targets);
        this.castSpell(side, 'line', [t.pos.clone(), t.pos.clone().add(new THREE.Vector3(4, 0, 4))]);
        this._smiteCd = 45;
      }
    }
    if (st.food < 25 && st.dp > 60) this.buyFavor(side, 'harvest');
  }

  // ---------------- scoring & end ----------------
  scoreOf(side) {
    const st = this.stateOf(side);
    return Math.round(
      this.popOf(side) * 10 + st.kills * 20 + st.conversions * 50 +
      Object.keys(st.techs).length * 100 +
      this.buildings.filter(b => b.side === side).length * 30 +
      st.ach.relics * 100 + st.dp * 0.2
    );
  }

  checkEnd() {
    if (this.mode !== 'battle' || this.over) return;
    const pPop = this.popOf('player'), ePop = this.popOf('enemy');
    let result = null;
    if (ePop === 0 && this.elapsed > 5) result = { won: true, how: this.state.player.conversions >= 5 ? 'The enemy flock now sings your name.' : 'The enemy civilization was exterminated.' };
    else if (pPop === 0 && this.elapsed > 5) result = { won: false, how: 'Your civilization has fallen.' };
    else if (this.timeLeft <= 0) {
      // Phase 5: judged on 4X victory points (land, population, era, quests,
      // faith) rather than the old kill/tech tally, so cultivating an island
      // is a route to victory and not only winning fights.
      const pv = victoryPoints(this, 'player'), ev = victoryPoints(this, 'enemy');
      result = {
        won: pv >= ev,
        how: `Time is up — judged on victory points (${pv} vs ${ev}).`,
        breakdown: { player: victoryBreakdown(this, 'player'), enemy: victoryBreakdown(this, 'enemy') },
      };
    }
    if (result) {
      this.over = true;
      result.score = this.scoreOf('player');
      result.enemyScore = this.scoreOf('enemy');
      // Phase 5 totals travel with every result, not just timeout victories,
      // so the end screen can always show the 4X breakdown.
      result.vp = victoryPoints(this, 'player');
      result.enemyVp = victoryPoints(this, 'enemy');
      result.breakdown = result.breakdown || {
        player: victoryBreakdown(this, 'player'),
        enemy: victoryBreakdown(this, 'enemy'),
      };
      result.quests = { completed: this.quests.stats.completed, log: this.quests.log };
      result.state = this.state.player;
      result.enemyState = this.state.enemy;
      result.pop = pPop;
      result.enemyPop = ePop;
      result.samples = this.samples;
      result.elapsed = this.elapsed;
      this.onEnd(result);
    }
  }

  dispose() {
    const all = [
      ...this.creatures.map(c => c.mesh), ...this.animals.map(a => a.mesh),
      ...this.monsters.map(m => m.mesh), ...this.buildings.map(b => b.mesh),
      ...this.resources.map(r => r.mesh), ...this.relics.map(r => r.mesh),
      ...this.holdables.map(h => h.mesh),
      ...this.effects.map(e => e.mesh), ...this.ghosts.values(),
      this.selRing, this.influenceOverlay,
      this.terrain.mesh, this.terrain.water, this.terrain.socle,
      this.cycles.skyDome,
      this.cycles.sun, this.cycles.sun.target, this.cycles.ambient, this.cycles.hemi,
      this.cycles.rain, this.cycles.snow,
      ...(this.cycles.windLines || []),
    ];
    for (const m of all) if (m) this.scene.remove(m);
    this.scene.fog = null;
  }
}
