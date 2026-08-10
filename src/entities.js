// Living things and structures: DNA, stats, aging, class decision trees,
// cumulative titles, sleep/alert states, awareness-based task claiming,
// animals (incl. snakes & fish), monsters, buildings and resources.
import { CIVS, CLASSES, BUILDINGS, JOB_LABEL, TITLES } from './civs.js';
import { buildHuman, buildAnimal, buildMonster, buildTree, buildBush, buildRock, buildMetalOre, buildStick, buildBuilding, buildRelic } from './models.js';
import { clamp, lerp, genName, dist2, dlGuard } from './util.js';
import { WATER_Y } from './world.js';
import { iconForTask, STATUS_ICONS } from './actions.js';
import {
  GENES, makeGenome, mixGenome, phenotypeMap, dnaString as genomeString,
  genomeFromLegacy, isHybrid, dnaLociTable,
} from './dna.js';
import * as THREE from 'three';
import { scheduledIntent } from './ai/schedule.js';
import { COMPANIONS, canTame, canAfford, payFor } from './ai/crafting.js';
import { PAVE_COST_WOOD } from './engine/roads.js';

/**
 * Back-link a mesh tree to its entity for picking (cursor.js walks up parents
 * looking for `userData.entity`).
 *
 * The link is defined non-enumerable on purpose: THREE.Object3D.copy() deep
 * clones userData with JSON.parse(JSON.stringify(...)), and an entity holds a
 * `.game` reference, so an enumerable back-link makes every mesh.clone() throw
 * on the circular structure. That crashed fog-of-war ghost spawning
 * (game.js ghostTick). Non-enumerable keeps property access identical while
 * staying invisible to JSON.stringify.
 */
function tagEntity(root, entity) {
  // Object3D.traverse visits the root itself, then all descendants.
  root.traverse((o) => Object.defineProperty(o.userData, 'entity', {
    value: entity, enumerable: false, writable: true, configurable: true,
  }));
}

export { GENES, dnaLociTable } from './dna.js';

/** @deprecated use makeGenome — kept for call sites expecting flat phenotypes */
export function makeDNA(rng, civBonus = {}, civKey = 'franks') {
  return phenotypeMap(makeGenome(rng, civKey));
}
/** Mix two creatures' genomes (or legacy flat dna) → phenotype map + attach ._genome */
export function mixDNA(rng, a, b, biomeHints = {}) {
  // accepts Creature, genome, or legacy flat dna
  const gA = a?.genome || a?._genome || (a?.loci ? a : genomeFromLegacy(a, a?.civKey || a?.raceKey || 'franks', rng));
  const gB = b?.genome || b?._genome || (b?.loci ? b : genomeFromLegacy(b, b?.civKey || b?.raceKey || 'franks', rng));
  const child = mixGenome(rng, gA, gB, biomeHints);
  const ph = phenotypeMap(child);
  ph._genome = child;
  return ph;
}
export function dnaString(dnaOrGenome) {
  if (dnaOrGenome?._genome) return genomeString(dnaOrGenome._genome);
  if (dnaOrGenome?.loci) return genomeString(dnaOrGenome);
  return genomeString(dnaOrGenome);
}

let NEXT_ID = 1;

// ============================ CREATURE ============================
export class Creature {
  constructor(game, side, clsKey, x, z, dna, age = 20, titles = []) {
    this.id = NEXT_ID++;
    this.game = game;
    this.side = side;                       // 'player' | 'enemy'
    this.civKey = game.civOf(side);
    this.cls = clsKey;                      // job/class: farmer, knight, philosopher, king, queen, princess
    this.titles = titles;                   // cumulative: prince, princess, chief...
    // DNA: genome (XX/YY loci) + flat phenotype map for gameplay stats
    if (dna?._genome) {
      this.genome = dna._genome;
      this.dna = dna;
    } else if (dna?.loci) {
      this.genome = dna;
      this.dna = phenotypeMap(dna);
    } else if (dna && typeof dna.speed === 'number') {
      this.genome = genomeFromLegacy(dna, this.civKey, game.rng);
      this.dna = phenotypeMap(this.genome);
    } else {
      this.genome = makeGenome(game.rng, this.civKey);
      this.dna = phenotypeMap(this.genome);
    }
    this.raceKey = this.genome.raceKey || this.civKey;
    this.sex = game.rng() > 0.5 ? 'M' : 'F';
    this.name = genName(game.rng, this.raceKey.includes('+') ? this.raceKey.split('+')[0] : this.civKey);
    this.age = age;
    this.hp = this.maxHp;
    this.energy = 100;
    this.maxEnergy = 100;
    this.carrying = { food: 0, wood: 0, rock: 0, metal: 0 };
    this.task = 'idle';
    this.target = null;
    this.claimed = null;                    // resource node claimed via awareness system
    this.beliefs = { player: side === 'player' ? 62 : 30, enemy: side === 'enemy' ? 62 : 30 };
    this.held = false;
    this.vel = new THREE.Vector3();
    this.airborne = false;
    this.thinkTimer = game.rng();
    this.mateCooldown = 0;
    this.fear = 0;
    this.alert = 0;                         // seconds of remaining alert state
    this.sprinting = false;
    this.panicFrom = null;                   // world point we flee away from
    this._baseScale = 0.68;
    this.holding = null;                     // holdable item (stick etc.)
    this.lover = null;                       // partner when mating
    // --- Phase 3 attributes ---
    this.tool = null;                        // equipped crafted tool
    this.companion = null;                   // tamed animal following this unit
    this.morale = 60;                        // 0..100, sways with events
    this.willpower = 35 + (this.dna.willpower ?? this.dna.intelligence ?? 0.5) * 55;
    this.family = { parents: [], children: [], spouse: null };
    this.rebuildMesh(x, z);
    this.walkPhase = game.rng() * 10;
    this._iconT = 0;
  }

  rebuildMesh(x, z) {
    const old = this.mesh;
    this.mesh = buildHuman(this.civKey, this.cls, this.titles);
    if (old) {
      this.mesh.position.copy(old.position);
      this.mesh.rotation.y = old.rotation.y;
      this.game.scene.remove(old);
    } else {
      this.mesh.position.set(x, this.game.terrain.getHeight(x, z), z);
    }
    tagEntity(this.mesh, this);
    this.game.scene.add(this.mesh);
    this._ensureStatusIcon();
  }

  _ensureStatusIcon() {
    if (this._iconSprite) return;
    if (typeof document === 'undefined') return; // headless simulation
    const canvas = document.createElement('canvas');
    canvas.width = 64; canvas.height = 64;
    this._iconCanvas = canvas;
    this._iconCtx = canvas.getContext('2d');
    const tex = new THREE.CanvasTexture(canvas);
    tex.magFilter = THREE.NearestFilter;
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
    this._iconSprite = new THREE.Sprite(mat);
    this._iconSprite.scale.set(0.55, 0.55, 1);
    this._iconSprite.position.y = 1.35;
    this._iconSprite.visible = false;
    this.mesh.add(this._iconSprite);
    this._iconTex = tex;
    this._iconKey = null;
  }

  _drawStatusIcon(key) {
    const meta = STATUS_ICONS[key];
    if (!meta || !this._iconCtx) { if (this._iconSprite) this._iconSprite.visible = false; return; }
    const ctx = this._iconCtx, c = this._iconCanvas;
    ctx.clearRect(0, 0, 64, 64);
    let alpha = 1;
    if (meta.fade) alpha = 0.35 + 0.65 * Math.abs(Math.sin(this._iconT * 2.5));
    ctx.globalAlpha = alpha;
    ctx.fillStyle = meta.color;
    ctx.font = key === 'sleep' ? 'bold 42px serif' : 'bold 36px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const y = meta.bob ? 32 + Math.sin(this._iconT * 3) * 6 : 32;
    ctx.fillText(meta.glyph, 32, y);
    this._iconTex.needsUpdate = true;
    this._iconSprite.visible = true;
    if (meta.bob || meta.fade) this._iconSprite.position.y = 1.35 + Math.sin(this._iconT * 3) * 0.05;
  }

  refreshStatusIcon() {
    dlGuard('refreshStatusIcon');
    this._ensureStatusIcon();
    this._iconT = (this._iconT || 0) + 0.05;
    const key = iconForTask(this.task, {
      sleeping: this.task === 'sleep',
      loving: !!this.lover,
      alert: this.alert > 0 && this.task !== 'panic',
      holding: !!this.holding,
      yields: this.claimed?.yields,
      shaman: this.cls === 'shaman' && this.task === 'pray',
    });
    if (key !== this._iconKey || (STATUS_ICONS[key]?.fade || STATUS_ICONS[key]?.bob)) {
      this._iconKey = key;
      this._drawStatusIcon(key);
    }
    if (!key && this._iconSprite) this._iconSprite.visible = false;
  }

  get pos() { return this.mesh.position; }
  // "Warrior Prince Grumzog", "Worker Chief Mei"
  get displayTitle() {
    const t = this.titles.map(k => TITLES[k]?.name || k).join(' ');
    const job = JOB_LABEL[this.cls] || this.cls;
    return t ? `${job} ${t}` : job;
  }
  get lifespan() {
    const civ = CIVS[this.civKey];
    return (45 + this.dna.longevity * 50) * (1 + (civ.bonus.longevity || 0));
  }
  get lifeStage() {
    if (this.age < 12) return 'child';
    if (this.age > this.lifespan * 0.72) return 'elder';
    return 'adult';
  }
  get ageMul() {
    let m = 1;
    if (this.age < 12) m = 0.45 + (this.age / 12) * 0.55;
    else if (this.age > this.lifespan * 0.72) {
      const t = (this.age - this.lifespan * 0.72) / (this.lifespan * 0.28);
      m = 1 - clamp(t, 0, 1) * 0.55;
    }
    if (this.game.favorActive(this.side, 'youth')) m = 1 - (1 - m) * 0.5;
    return m;
  }
  get favorMul() { return this.game.favorActive(this.side, 'vigor') ? 1.25 : 1; }
  get isWarrior() { return this.cls === 'knight'; }
  get speed() {
    let s = 2.2 * 0.7 * (0.55 + this.dna.speed * 0.9) * this.ageMul * this.favorMul *
      this.game.cycles.speedMul * (this.isWarrior ? 1.15 : 1) *
      (1 - (this.dna.mass || 0.5) * 0.15);
    if (this.isWarrior && this.game.hasTech(this.side, 'berserk')) s *= 1.15;
    if (this.alert > 0) s *= 1.1;
    // sprinting is costly — energy must remain
    if (this.sprinting && this.energy > 2) s *= 1.9;
    else this.sprinting = false;
    // exhaustion slows you
    if (this.energy < 15) s *= 0.7;
    // Terrain underfoot. A paved road cancels the desertification malus
    // outright and adds its own bonus — engineering beats erosion.
    const { x, z } = this.mesh.position;
    const roads = this.game.roads;
    const road = roads ? roads.speedFactorAt(x, z) : 1;
    if (road > 1) s *= road;
    else if (this.game.ecology) s *= this.game.ecology.speedFactorAt(x, z);
    // A mount or draught animal carries you faster.
    s *= this.companionBonus('speed');
    return s;
  }
  get strength() {
    const cls = CLASSES[this.cls];
    let s = cls.baseStr * (0.55 + this.dna.strength * 0.9) * this.ageMul * this.favorMul;
    if (this.isWarrior) {
      const g = this.game;
      if (g.hasTech(this.side, 'warcraft')) s *= 1.5;
      if (g.hasTech(this.side, 'berserk')) s *= 1.3;
      if (g.hasTech(this.side, 'runestones')) s *= 1.1;
      if (g.hasTech(this.side, 'bloodrage')) s *= 1.2;
    }
    return s;
  }
  get intelligence() { return CLASSES[this.cls].baseInt * (0.55 + this.dna.intelligence * 0.9) * this.ageMul; }
  get maxHp() {
    let h = CLASSES[this.cls].hp * (0.6 + this.dna.resilience * 0.8);
    if (this.isWarrior && this.game.hasTech(this.side, 'discipline')) h *= 1.4;
    return h;
  }
  // how far this creature reveals fog at night (0..1 scale factor of day vision)
  get nightSight() {
    if (this.game.hasTech(this.side, 'moonsight')) return 1;
    return clamp((this.dna.nightsight ?? 0.4) * 0.7 + (CIVS[this.civKey].night || 0), 0, 1);
  }
  get visionRadius() {
    const cy = this.game.cycles;
    if (!cy.isNight) return 10;
    const n = this.nightSight;
    return cy.moonOut ? lerp(4.5, 10, n) : lerp(3, 7, n);
  }
  get emotion() {
    if (this.task === 'panic') return 'panicking';
    if (this.task === 'sleep') return 'dreaming';
    if (this.energy < 20) return 'exhausted';
    if (this.alert > 0) return 'alert';
    if (this.fear > 0.5) return 'terrified';
    const own = this.beliefs[this.side], other = this.beliefs[this.side === 'player' ? 'enemy' : 'player'];
    if (own > 75) return 'devoted';
    if (other > own) return 'doubting';
    if (this.hp < this.maxHp * 0.35) return 'suffering';
    return 'content';
  }

  get carryTotal() {
    const c = this.carrying;
    return (c.food || 0) + (c.wood || 0) + (c.rock || 0) + (c.metal || 0);
  }

  // ------------------------- Phase 3: tools & companions -------------------

  /** Equip a crafted tool (replacing whatever was held). */
  equipTool(tool) {
    this.tool = tool;
    this.morale = Math.min(100, this.morale + 6);
    return tool;
  }

  /**
   * Attempt to tame a wild animal. Willpower raises the odds; failure spooks
   * the animal rather than simply doing nothing, so taming has a real cost.
   */
  tameAttempt(beast) {
    if (!beast || beast.tamedBy) return false;
    const g = this.game;
    const spec = COMPANIONS[beast.type];
    if (!spec || !canTame(g.stateOf(this.side).techs, beast.type)) return false;

    if (g.civStats) g.civStats.tameAttempts++;
    const odds = spec.tameChance * (0.6 + this.willpower / 100);
    if (g.rng() > odds) {
      beast.startle(this.pos);
      this.morale = Math.max(0, this.morale - 3);
      return false;
    }
    beast.tamedBy = this;
    beast.side = this.side;
    this.companion = beast;
    this.morale = Math.min(100, this.morale + 12);
    if (g.civStats) g.civStats.tamed++;
    g.msg?.(`${this.name} tamed a ${spec.name}`, this.pos.clone());
    return true;
  }

  /** Aggregate bonus granted by an equipped tool + tamed companion. */
  companionBonus(field) {
    const spec = this.companion && COMPANIONS[this.companion.type];
    return spec?.grants?.[field] ?? 1;
  }

  /** Start panic: sprint away from a point with arms raised. */
  startPanic(fromPos) {
    this.releaseClaim();
    this.fear = Math.max(this.fear, 0.85);
    this.panicFrom = fromPos ? fromPos.clone() : this.pos.clone();
    this.task = 'panic';
    this.sprinting = true;
    const dx = this.pos.x - this.panicFrom.x, dz = this.pos.z - this.panicFrom.z;
    let len = Math.hypot(dx, dz);
    // if already on top of the blast, pick a random away direction
    let ux, uz;
    if (len < 0.4) {
      const a = this.game.rng() * Math.PI * 2;
      ux = Math.cos(a); uz = Math.sin(a);
    } else { ux = dx / len; uz = dz / len; }
    const dist = 14 + this.game.rng() * 10;
    this.target = new THREE.Vector3(
      clamp(this.pos.x + ux * dist, -75, 75), 0,
      clamp(this.pos.z + uz * dist, -75, 75));
  }
  attitudeToward(god) {
    const b = this.beliefs[god];
    const f = this.fear > 0.4 && this.game.lastSmiter === god;
    if (f && b > 55) return 'fears & respects';
    if (f) return 'fears & hates';
    if (b > 70) return 'loves';
    if (b > 45) return 'respects';
    return 'hates';
  }

  releaseClaim() {
    if (this.claimed) { this.claimed.claimedBy = null; this.claimed = null; }
  }

  update(dt) {
    dlGuard('Creature.update');
    const g = this.game;
    this.age += dt / g.YEAR_SEC;
    this.mateCooldown = Math.max(0, this.mateCooldown - dt);
    if (this._loverUntil && this.game.elapsed > this._loverUntil) {
      this.lover = null;
      this._loverUntil = 0;
    }
    const fearless = this.isWarrior && g.hasTech(this.side, 'runestones');
    this.fear = fearless ? 0 : Math.max(0, this.fear - dt * 0.12);
    this.alert = Math.max(0, this.alert - dt);

    // energy: sprint drains fast, idle/walk recovers
    if (this.sprinting && this._moving) {
      this.energy = Math.max(0, this.energy - dt * 28);
      if (this.energy <= 0) { this.sprinting = false; if (this.task === 'panic') this.fear = Math.min(this.fear, 0.45); }
    } else {
      this.energy = Math.min(this.maxEnergy, this.energy + dt * (this.task === 'sleep' ? 12 : 4));
    }

    if (this.held) {
      this.animateFlail(dt);
      this.refreshStatusIcon();
      return;
    }

    if (this.airborne) {
      // gravity + wind + drag from DNA
      const wind = g.cycles?.wind || 0;
      const ang = g.cycles?.windAngle || 0;
      const drag = 0.35 + (this.dna.windDrag || 0.5) * 0.9;
      const mass = 0.6 + (this.dna.mass || 0.5) * 1.2;
      this.vel.y -= (18 + mass * 6) * dt;
      this.vel.x += Math.cos(ang) * wind * 6 * dt;
      this.vel.z += Math.sin(ang) * wind * 6 * dt;
      this.vel.x *= (1 - drag * dt);
      this.vel.z *= (1 - drag * dt);
      this.pos.addScaledVector(this.vel, dt);
      const ground = g.terrain.getHeight(this.pos.x, this.pos.z);
      if (this.pos.y <= ground) {
        this.pos.y = ground;
        const impact = this.vel.length();
        this.airborne = false;
        this.vel.set(0, 0, 0);
        if (impact > 8) this.damage((impact - 8) * 4, null);
        this.fear = 1;
        this.animate(dt); // settle posture
      } else {
        this.animateFlail(dt);
      }
      return;
    }

    if (this.age > this.lifespan) { g.killCreature(this, null, 'age'); return; }

    this.thinkTimer -= dt;
    if (this.thinkTimer <= 0) {
      this.thinkTimer = lerp(0.9, 0.35, this.dna.responsivity);
      this.decide();
    }

    if (this.task === 'sleep') {
      this.mesh.rotation.x = lerp(this.mesh.rotation.x, -1.35, dt * 4);
      this.hp = Math.min(this.maxHp, this.hp + dt * 1.2);
    } else {
      this.mesh.rotation.x = lerp(this.mesh.rotation.x, 0, dt * 6);
      this.act(dt);
      this.animate(dt);
    }
    this.refreshStatusIcon();

    // title auras (awareness of who leads and who excels)
    if (this.titles.includes('prince') || this.titles.includes('princess') || this.cls === 'princess') {
      if ((this._auraT = (this._auraT || 0) + dt) > 1) {
        this._auraT = 0;
        for (const c of g.creatures)
          if (c.side === this.side && c !== this && dist2(c.pos.x, c.pos.z, this.pos.x, this.pos.z) < 30)
            c.beliefs[this.side] = clamp(c.beliefs[this.side] + 0.5, 0, 100);
      }
    }

    let drift = 0.15;
    if (g.hasTech(this.side, 'chivalry')) drift *= 1.5;
    this.beliefs[this.side] = clamp(this.beliefs[this.side] + dt * drift, 0, 100);
  }

  // ---------------- decision trees ----------------
  decide() {
    dlGuard('Creature.decide');
    const g = this.game;
    const home = g.homeOf(this.side);
    if (!home) { this.task = 'idle'; this.sprinting = false; return; }
    const nearHome = dist2(this.pos.x, this.pos.z, home.pos.x, home.pos.z) < 80;

    // drop invalid targets (dead entities freeze the AI otherwise)
    if (this.target && this.target.hp !== undefined && this.target.hp <= 0) this.target = null;
    if (this.claimed && (this.claimed.depleted || !g.resources.includes(this.claimed))) this.releaseClaim();

    const threat = g.nearestThreat(this);
    const threatD = threat ? dist2(this.pos.x, this.pos.z, threat.pos.x, threat.pos.z) : 1e9;
    if (threatD < 140) {
      this.alert = Math.max(this.alert, 6);
      for (const c of g.creatures)
        if (c.side === this.side && c !== this && dist2(c.pos.x, c.pos.z, this.pos.x, this.pos.z) <
          (g.hasTech(this.side, 'discipline') ? 90 : 50))
          c.alert = Math.max(c.alert, 4);
    }

    // PANIC: sprint away from danger — never toward home (that caused the freeze)
    if (this.fear > 0.55 && this.energy > 5) {
      if (this.task !== 'panic' || !this.target) {
        this.startPanic(this.panicFrom || (threat && threat.pos) || null);
      }
      return;
    }
    if (this.task === 'panic') { this.task = 'idle'; this.sprinting = false; this.panicFrom = null; }

    // wounded / threatened non-warriors retreat TO camp (walk, not panic loop)
    if ((this.hp < this.maxHp * 0.3 && !this.isWarrior) || (threat && !this.isWarrior && threatD < 36)) {
      this.releaseClaim();
      this.sprinting = this.energy > 20;
      this.task = 'retreat';
      this.target = home.pos.clone();
      return;
    }
    if (this.lifeStage === 'child') { this.task = 'wander'; this.pickWanderNear(home.pos, 5); return; }

    // join an unfinished construction site (workers)
    if (CLASSES[this.cls].role === 'gather' && this.carryTotal < 2) {
      const site = g.nearestConstruction(this);
      if (site) {
        this.releaseClaim();
        this.task = 'build';
        this.target = site;
        return;
      }
    }

    // Daily schedule (Phase 3). Advisory only: warriors, alerted and
    // frightened units ignore the clock, which is what stops a unit walking
    // home to bed in the middle of a raid.
    if (!this.isWarrior && this.cls !== 'monk' && this.alert <= 0 && this.fear < 0.3) {
      const intent = scheduledIntent({
        hour: g.cycles.hour,
        era: g.eraOf(this.side),
        cls: this.cls,
        energy: this.energy,
        rng: g.rng,
      });
      if (intent === 'sleep') {
        this.releaseClaim();
        this.sprinting = false;
        if (nearHome) { this.task = 'sleep'; this.target = null; }
        else { this.task = 'retreat'; this.target = home.pos.clone(); }
        return;
      }
      if (intent === 'pray' && nearHome) {
        this.releaseClaim();
        this.task = 'pray'; this.target = null;
        return;
      }
    }
    if (this.task === 'sleep') this.task = 'idle';

    if (this.titles.includes('king') || this.titles.includes('queen') ||
        this.cls === 'king' || this.cls === 'queen') {
      this.task = 'wander'; this.pickWanderNear(home.pos, 4); return;
    }

    switch (CLASSES[this.cls]?.role) {
      case 'gather': {
        // Keep pursuing an in-progress taming. think() re-runs every tick, so
        // without this the unit re-rolls its intent before it ever reaches the
        // animal — harvesting survives this via `claimed`, taming needs its own
        // guard.
        if (this.task === 'tame' && this.target && !this.target.tamedBy
            && this.target.hp > 0 && !this.target.spooked) {
          return;
        }
        const cap = 12;
        if (this.holding) { this.task = 'deposit'; this.target = home; return; }
        if (this.carryTotal >= cap) { this.task = 'deposit'; this.target = home; this.sprinting = this.energy > 30; return; }
        if (this.claimed && !this.claimed.depleted && !this.claimed.held) {
          this.task = 'harvest'; this.target = this.claimed; return;
        }
        this.releaseClaim();
        const st = g.stateOf(this.side);

        // --- Phase 3 civic work, ahead of raw gathering ---
        // Craft the best tool this era affords, if we're empty-handed.
        if (!this.tool) {
          const tool = g.bestToolForSide(this.side, 'wood')
            || g.bestToolForSide(this.side, 'food');
          if (tool && canAfford(st, tool) && g.rng() < 0.5) {
            payFor(st, tool);
            this.equipTool(tool);
            if (g.civStats) g.civStats.toolsCrafted++;
            g.msg?.(`${this.name} crafted a ${tool.name}`, this.pos.clone());
          }
        }
        // Pave an open route between structures.
        const route = g.roads?.openRoutes[0];
        if (route && st.wood >= PAVE_COST_WOOD && g.rng() < 0.35) {
          const wp = g.roads.nextWaypoint(route);
          if (wp) {
            this.task = 'pave';
            this.target = { pos: new THREE.Vector3(wp.x, g.terrain.getHeight(wp.x, wp.z), wp.z), route };
            return;
          }
        }
        // Try to tame a nearby wild animal into a companion. The gate is
        // generous because it only fires when a tameable beast is genuinely
        // in range and this unit has no companion — a tight gate combined
        // with wandering fauna means taming effectively never happens.
        if (!this.companion && g.rng() < 0.35) {
          const beast = g.nearestTameable?.(this, 26);
          if (beast) { this.task = 'tame'; this.target = beast; return; }
        }

        // pick a need based on stockpiles, then claim a matching node / activity
        const needs = [
          { y: 'food', w: st.food < 40 ? 3 : 1 },
          { y: 'wood', w: st.wood < 50 ? 2.5 : 1 },
          { y: 'rock', w: st.rock < 20 ? 2 : 0.6 },
          { y: 'metal', w: st.metal < 10 ? 1.8 : 0.4 },
        ];
        let pickY = 'food', bestW = -1;
        for (const n of needs) {
          const score = n.w * (0.5 + g.rng());
          if (score > bestW) { bestW = score; pickY = n.y; }
        }
        // occasional hunt / fish / explore
        const roll = g.rng();
        if (roll < 0.12 && pickY === 'food') {
          const prey = g.nearestHuntable(this, 25);
          if (prey) { this.task = 'hunt'; this.target = prey; return; }
        }
        if (roll > 0.88) {
          const fish = g.nearestFish(this, 22);
          if (fish) { this.task = 'fish'; this.target = fish; return; }
        }
        if (roll > 0.95) {
          this.task = 'explore';
          this.pickWanderNear(home.pos, 40);
          return;
        }
        // pick up fallen sticks near trees
        if (!this.holding && g.rng() < 0.2) {
          const stick = g.nearestStick(this, 12);
          if (stick) { this.task = 'pickup'; this.target = stick; return; }
        }
        const node = g.bestResourceFor(this, pickY) ||
          g.bestResourceFor(this, 'wood') || g.bestResourceFor(this, 'food') ||
          g.bestResourceFor(this, 'rock') || g.bestResourceFor(this, 'metal');
        if (node) {
          node.claimedBy = this.id;
          this.claimed = node;
          this.task = 'harvest'; this.target = node;
        } else {
          // nothing left nearby — explore or return to camp
          if (g.rng() < 0.5) { this.task = 'explore'; this.pickWanderNear(home.pos, 35); }
          else { this.task = 'retreat'; this.target = home.pos.clone(); }
        }
        return;
      }
      case 'hunt': {
        const cap = 12;
        if (this.holding) { this.task = 'deposit'; this.target = home; return; }
        if (this.carryTotal >= cap) { this.task = 'deposit'; this.target = home; this.sprinting = this.energy > 30; return; }
        const prey = g.nearestHuntable(this, 28);
        if (prey) { this.task = 'hunt'; this.target = prey; return; }
        const fish = g.nearestFish(this, 20);
        if (fish) { this.task = 'fish'; this.target = fish; return; }
        const stick = g.nearestStick(this, 14);
        if (stick && !this.holding) { this.task = 'pickup'; this.target = stick; return; }
        this.task = 'explore'; this.pickWanderNear(home.pos, 22);
        return;
      }
      case 'shaman': {
        const temple = g.buildings.find(b => b.side === this.side && b.type === 'temple' && !b.constructing);
        if (temple && dist2(this.pos.x, this.pos.z, temple.pos.x, temple.pos.z) < 16) {
          g.stateOf(this.side).dp += 0.7 * this.intelligence;
          for (const c of g.creatures)
            if (c.side === this.side && dist2(c.pos.x, c.pos.z, this.pos.x, this.pos.z) < 40)
              c.beliefs[this.side] = clamp(c.beliefs[this.side] + 0.4, 0, 100);
          this.task = 'pray';
        } else if (temple) { this.task = 'wander'; this.target = temple.pos.clone(); }
        else {
          g.stateOf(this.side).dp += 0.25 * this.intelligence;
          this.task = 'ponder';
          this.pickWanderNear(home.pos, 8);
        }
        return;
      }
      case 'fight': {
        const foe = g.nearestEnemy(this, 60);
        if (foe && (g.stateOf(this.side).attackMode || dist2(this.pos.x, this.pos.z, foe.pos.x, foe.pos.z) < 100)) {
          this.task = 'attack'; this.target = foe; return;
        }
        const mon = g.nearestMonsterNear(home.pos, 18);
        if (mon) { this.task = 'attack'; this.target = mon; return; }
        if (g.stateOf(this.side).attackMode) {
          const eh = g.homeOf(this.side === 'player' ? 'enemy' : 'player');
          if (eh) { this.task = 'attack'; this.target = eh; return; }
        }
        this.task = 'patrol'; this.pickWanderNear(home.pos, 9);
        return;
      }
      case 'lead':
        this.task = 'wander'; this.pickWanderNear(home.pos, 4); return;
      case 'inspire':
        this.task = 'wander'; this.pickWanderNear(home.pos, 7); return;
      case 'pray': {
        const temple = g.buildings.find(b => b.side === this.side && b.type === 'temple' && !b.constructing);
        if (temple) {
          if (dist2(this.pos.x, this.pos.z, temple.pos.x, temple.pos.z) < 12) {
            g.stateOf(this.side).dp += 0.55 * this.intelligence;
            this.beliefs[this.side] = clamp(this.beliefs[this.side] + 0.8, 0, 100);
            this.task = 'pray';
          } else { this.task = 'wander'; this.target = temple.pos.clone(); }
        } else { this.task = 'wander'; this.pickWanderNear(home.pos, 6); }
        return;
      }
      case 'think': {
        if (dist2(this.pos.x, this.pos.z, home.pos.x, home.pos.z) < 30) {
          let gain = 0.35 * this.intelligence;
          if (g.hasTech(this.side, 'celestial_bureaucracy')) gain *= 2;
          g.stateOf(this.side).dp += gain;
          this.task = 'ponder';
        } else { this.task = 'wander'; this.target = home.pos.clone(); }
        return;
      }
      default:
        this.task = 'wander'; this.pickWanderNear(home.pos, 8);
    }
  }

  pickWanderNear(center, radius) {
    const g = this.game;
    for (let t = 0; t < 6; t++) {
      const a = g.rng() * Math.PI * 2, r = g.rng() * radius;
      const x = center.x + Math.cos(a) * r, z = center.z + Math.sin(a) * r;
      if (!g.terrain.isWater(x, z)) { this.target = new THREE.Vector3(x, 0, z); return; }
    }
    this.target = center.clone();
  }

  act(dt) {
    dlGuard('Creature.act');
    const g = this.game;
    const tgt = this.target;
    if (!tgt || this.task === 'ponder' || this.task === 'idle' || this.task === 'pray') return;

    // dead / removed target → stop (prevents post-fireball freeze)
    if (tgt.hp !== undefined && tgt.hp <= 0) { this.target = null; this.task = 'idle'; this.sprinting = false; return; }
    if (tgt.mesh && !tgt.mesh.parent && tgt.kind === undefined && !tgt.constructing) {
      this.target = null; this.task = 'idle'; return;
    }

    const tp = tgt.pos || tgt;
    if (!tp || tp.x === undefined) { this.target = null; return; }
    const dx = tp.x - this.pos.x, dz = tp.z - this.pos.z;
    const d = Math.hypot(dx, dz) || 0.0001;

    if (this.task === 'harvest' && d < 1.4) {
      let mul = 3.2 * this.intelligence * g.cycles.gatherMul * (g.hasTech(this.side, 'toolmaking') ? 1.3 : 1);
      if (tgt.kind === 'bush' && g.hasTech(this.side, 'herbalism')) mul *= 1.6;
      if (g.chiefNear(this)) mul *= 1.2;
      // Phase 3: an equipped tool accelerates its matching resource stream.
      if (this.tool && this.tool.yields === (tgt.yields || 'wood')) mul *= this.tool.boost;
      const got = tgt.harvest(dt * mul);
      const y = tgt.yields || 'wood';
      this.carrying[y] = (this.carrying[y] || 0) + got;
      // Phase 1: taking from the land costs the land. Biomass (wood/food)
      // strips the soil; ore and stone barely touch it.
      const bite = (y === 'wood' || y === 'food') ? 0.030 : 0.006;
      g.ecology?.drainAt(tgt.pos.x, tgt.pos.z, got * bite, 2.6);
      if (tgt.depleted) { this.releaseClaim(); this.target = null; }
      return;
    }
    if (this.task === 'pave' && d < 1.8) {
      const route = tgt?.route;
      const st = g.stateOf(this.side);
      if (route && st.wood >= PAVE_COST_WOOD) {
        st.wood -= PAVE_COST_WOOD;
        const finished = g.roads.completeWaypoint(route);
        if (finished) g.msg?.('A road now joins two of our structures', this.pos.clone());
      }
      this.task = 'idle'; this.target = null;
      return;
    }
    if (this.task === 'tame') {
      // An approached animal goes still and wary rather than wandering off.
      // Without this a unit almost never closes the gap on a moving target,
      // and taming silently never fires.
      if (tgt && d < 7) tgt._curious = 0.6;
      if (d < 2.6) {
        this.tameAttempt(tgt);
        this.task = 'idle'; this.target = null;
        return;
      }
    }
    if (this.task === 'deposit' && d < 2.6) {
      const st = g.stateOf(this.side);
      st.food += this.carrying.food || 0;
      st.wood += this.carrying.wood || 0;
      st.rock += this.carrying.rock || 0;
      st.metal += this.carrying.metal || 0;
      if (this.holding) {
        st.wood += this.holding.amount || 1;
        g.removeHoldable(this.holding);
        this.holding = null;
      }
      g.trackGather(this.side, this.carrying);
      this.carrying = { food: 0, wood: 0, rock: 0, metal: 0 };
      this.task = 'idle'; this.sprinting = false;
      return;
    }
    if (this.task === 'pickup' && d < 1.2) {
      if (tgt && tgt.holdable) {
        this.holding = tgt;
        tgt.heldBy = this;
        // attach visually to hand
        if (tgt.mesh) {
          g.scene.remove(tgt.mesh);
          tgt.mesh.position.set(0.22, 0.5, 0.05);
          tgt.mesh.scale.setScalar(0.85);
          this.mesh.add(tgt.mesh);
        }
        this.target = null; this.task = 'idle';
      }
      return;
    }
    if (this.task === 'attack' && d < 1.5) {
      if (tgt.damage) tgt.damage(this.strength * 9 * dt, this);
      if (tgt.hp !== undefined && tgt.hp <= 0) this.target = null;
      return;
    }
    if (this.task === 'hunt' && d < 1.6) {
      if (tgt.damage) tgt.damage(this.strength * 12 * dt, this);
      if (tgt.hp !== undefined && tgt.hp <= 0) {
        this.carrying.food = (this.carrying.food || 0) + (tgt.type === 'snake' ? 4 : 10);
        this.target = null; this.task = 'idle';
      }
      return;
    }
    if (this.task === 'fish' && d < 2.2) {
      // stand on shore / in shallows and catch
      this._fishT = (this._fishT || 0) + dt;
      if (this._fishT > 2.5) {
        this._fishT = 0;
        this.carrying.food = (this.carrying.food || 0) + 6;
        if (tgt.damage) tgt.damage(99, this);
        this.target = null; this.task = 'idle';
      }
      return;
    }
    if (this.task === 'build' && d < 2.8) {
      if (tgt.constructing) {
        tgt.addWork(dt * (1.2 + this.intelligence * 0.8) * (g.chiefNear(this) ? 1.25 : 1), this);
        if (!tgt.constructing) { this.target = null; this.task = 'idle'; }
      } else { this.target = null; this.task = 'idle'; }
      return;
    }
    if ((this.task === 'wander' || this.task === 'patrol' || this.task === 'explore' ||
         this.task === 'panic' || this.task === 'retreat') && d < 0.9) {
      if (this.task === 'panic') {
        // arrived at flee point — if still terrified, flee further; else calm
        if (this.fear > 0.55 && this.energy > 8) this.startPanic(this.panicFrom);
        else { this.task = 'idle'; this.sprinting = false; this.panicFrom = null; this.target = null; }
      } else {
        this.task = 'idle'; this.target = null; this.sprinting = false;
      }
      return;
    }

    // locomotion + separation
    let dirX = dx / d, dirZ = dz / d;
    let sepX = 0, sepZ = 0;
    for (const c of g.creatures) {
      if (c === this || c.side !== this.side) continue;
      const sd = dist2(c.pos.x, c.pos.z, this.pos.x, this.pos.z);
      if (sd < 2 && sd > 0.0001) {
        const s = Math.sqrt(sd);
        sepX += (this.pos.x - c.pos.x) / s * (1.4 - s);
        sepZ += (this.pos.z - c.pos.z) / s * (1.4 - s);
      }
    }
    dirX += sepX * 0.7; dirZ += sepZ * 0.7;
    const dl = Math.hypot(dirX, dirZ) || 1;
    dirX /= dl; dirZ /= dl;

    // fishing: approach water edge — allow shallow water
    const step = this.speed * dt;
    let nx = this.pos.x + dirX * step, nz = this.pos.z + dirZ * step;
    const allowWater = this.task === 'fish';
    if (!allowWater && g.terrain.isWater(nx, nz) && !g.bridgeAt(nx, nz)) {
      let found = false;
      for (const off of [0.9, -0.9, 1.8, -1.8]) {
        const a = Math.atan2(dz, dx) + off;
        const tx = this.pos.x + Math.cos(a) * step, tz = this.pos.z + Math.sin(a) * step;
        if (!g.terrain.isWater(tx, tz) || g.bridgeAt(tx, tz)) { nx = tx; nz = tz; found = true; break; }
      }
      if (!found) { this.task = 'idle'; this.target = null; this.sprinting = false; return; }
    }
    this.pos.x = clamp(nx, -78, 78);
    this.pos.z = clamp(nz, -78, 78);
    this.pos.y = Math.max(g.terrain.getHeight(this.pos.x, this.pos.z), WATER_Y);
    this.mesh.rotation.y = Math.atan2(dx, dz);
    this._moving = true;
    g.terrain.addWear(this.pos.x, this.pos.z, this.sprinting ? 0.018 : 0.010);
  }

  /** Funny circling extremities while held / thrown (B&W flail). */
  animateFlail(dt) {
    const L = this.mesh.userData.limbs;
    if (!L) return;
    this._flailT = (this._flailT || 0) + dt * 14;
    const t = this._flailT;
    if (L.armL) L.armL.rotation.set(Math.sin(t) * 1.8, 0, Math.cos(t * 1.3) * 1.2);
    if (L.armR) L.armR.rotation.set(Math.cos(t) * 1.8, 0, Math.sin(t * 1.1) * -1.2);
    if (L.legL) L.legL.rotation.x = Math.sin(t * 1.4) * 1.1;
    if (L.legR) L.legR.rotation.x = Math.cos(t * 1.4) * 1.1;
    if (L.lArmL) L.lArmL.rotation.x = Math.sin(t * 2) * 0.8;
    if (L.lArmR) L.lArmR.rotation.x = Math.cos(t * 2) * 0.8;
    if (L.head) L.head.rotation.z = Math.sin(t * 0.7) * 0.35;
    this.mesh.rotation.z = Math.sin(t * 0.5) * 0.15;
  }

  animate(dt) {
    dlGuard('Creature.animate');
    const L = this.mesh.userData.limbs;
    if (!L) return;
    // settle from flail
    this.mesh.rotation.z *= 0.85;
    if (L.head) L.head.rotation.z *= 0.85;
    const panic = this.task === 'panic';
    const g = this.game;
    const inWater = g.terrain.isWater(this.pos.x, this.pos.z);
    const swimGene = this.dna.swim ?? 0.5;

    // swim / drown posture
    if (inWater) {
      this._pose = 'swim';
      this.walkPhase += dt * (1.2 + swimGene);
      const s = Math.sin(this.walkPhase) * 0.55;
      if (L.armL) L.armL.rotation.set(-0.6 + s, 0, 0.8);
      if (L.armR) L.armR.rotation.set(-0.6 - s, 0, -0.8);
      if (L.legL) L.legL.rotation.x = s * 0.7;
      if (L.legR) L.legR.rotation.x = -s * 0.7;
      this.mesh.rotation.x = lerp(this.mesh.rotation.x, 0.35, dt * 3);
      this.pos.y = Math.max(this.pos.y, WATER_Y - 0.05 + Math.sin(this.walkPhase) * 0.04);
      if (swimGene < 0.25) this.hp = Math.max(1, this.hp - dt * 2); // weak swimmers struggle
      this._moving = false;
      const stage = this.lifeStage === 'child' ? 0.55 : this.lifeStage === 'elder' ? 0.92 : 1;
      this.mesh.scale.setScalar(this._baseScale * stage);
      return;
    }

    // kneel before royalty
    if (this._pose === 'kneel' && !this._moving && !panic) {
      if (L.legL) L.legL.rotation.x = 1.1;
      if (L.legR) L.legR.rotation.x = 1.1;
      if (L.shinL) L.shinL.rotation.x = -1.4;
      if (L.shinR) L.shinR.rotation.x = -1.4;
      if (L.armL) L.armL.rotation.x = -0.4;
      if (L.armR) L.armR.rotation.x = -0.4;
      if (L.head) L.head.rotation.x = 0.25;
      this.mesh.position.y = g.terrain.getHeight(this.pos.x, this.pos.z) - 0.12;
      this._pose = null; // one-shot until next group tick
      const stage = this.lifeStage === 'child' ? 0.55 : this.lifeStage === 'elder' ? 0.92 : 1;
      this.mesh.scale.setScalar(this._baseScale * stage);
      return;
    }

    // hold hands with partner
    const partner = this._holdHandsWith;
    if (partner && partner.hp > 0 && !this._moving && !panic) {
      const dx = partner.pos.x - this.pos.x, dz = partner.pos.z - this.pos.z;
      this.mesh.rotation.y = Math.atan2(dx, dz);
      if (L.armR) L.armR.rotation.set(0.2, 0, -0.9);
      if (L.armL) L.armL.rotation.set(0.2, 0, 0.4);
      if (L.handR) L.handR.position.set(0.28, 0.5, 0.12);
    } else {
      this._holdHandsWith = null;
    }

    if (this._moving) {
      const rate = this.sprinting ? 4.5 : 2.2;
      this.walkPhase += dt * this.speed * rate;
      const s = Math.sin(this.walkPhase) * (this.sprinting ? 0.55 : 0.42);
      if (L.legL) L.legL.rotation.x = s;
      if (L.legR) L.legR.rotation.x = -s;
      if (L.shinL) L.shinL.rotation.x = s * 0.4;
      if (L.shinR) L.shinR.rotation.x = -s * 0.4;
      if (panic) {
        if (L.armL) L.armL.rotation.x = -2.4;
        if (L.armR) L.armR.rotation.x = -2.4;
        if (L.lArmL) L.lArmL.rotation.x = -0.3;
        if (L.lArmR) L.lArmR.rotation.x = -0.3;
        if (L.handL) L.handL.position.y = 0.72;
        if (L.handR) L.handR.position.y = 0.72;
      } else if (!partner) {
        if (L.armL) L.armL.rotation.x = -s * 0.65;
        if (L.armR) L.armR.rotation.x = s * 0.65;
        if (L.lArmL) L.lArmL.rotation.x = -s * 0.3;
        if (L.lArmR) L.lArmR.rotation.x = s * 0.3;
      }
      if (L.chest) L.chest.position.y = 0.72 + Math.abs(s) * 0.02;
      this._moving = false;
    } else {
      if (L.legL) L.legL.rotation.x *= 0.9;
      if (L.legR) L.legR.rotation.x *= 0.9;
      if (!panic && !partner) {
        if (L.armL) L.armL.rotation.x *= 0.9;
        if (L.armR) L.armR.rotation.x *= 0.9;
      }
    }
    const stage = this.lifeStage === 'child' ? 0.55 : this.lifeStage === 'elder' ? 0.92 : 1;
    this.mesh.scale.setScalar(this._baseScale * stage);
  }

  damage(amount, attacker) {
    this.hp -= amount;
    if (attacker) {
      this.fear = Math.min(1, this.fear + 0.15);
      this.alert = Math.max(this.alert, 5);
      if (attacker.pos) this.panicFrom = attacker.pos.clone();
    }
    if (this.hp <= 0) this.game.killCreature(this, attacker, 'combat');
  }
}

// ============================ ANIMAL ============================
export class Animal {
  constructor(game, type, x, z) {
    this.id = NEXT_ID++;
    this.game = game;
    this.type = type;
    this.aquatic = type === 'fish';
    this.hp = type === 'fish' ? 8 : type === 'snake' ? 12 : 30;
    this.held = false;
    this.airborne = false;
    this.vel = new THREE.Vector3();
    this.mesh = buildAnimal(type);
    this.mesh.position.set(x, this.aquatic ? WATER_Y - 0.12 : game.terrain.getHeight(x, z), z);
    tagEntity(this.mesh, this);
    game.scene.add(this.mesh);
    this.moveTimer = 0;
    this.biteTimer = 0;
    this.jumpT = -1;
    this.t = game.rng() * 10;
    this.target = null;
  }
  get pos() { return this.mesh.position; }
  update(dt) {
    if (this.held) return;
    const g = this.game;
    this.t += dt;
    if (this.airborne && !this.aquatic) {
      this.vel.y -= 22 * dt;
      this.pos.addScaledVector(this.vel, dt);
      const ground = g.terrain.getHeight(this.pos.x, this.pos.z);
      if (this.pos.y <= ground) {
        this.pos.y = ground; this.airborne = false;
        if (this.vel.length() > 10) this.damage(25, null);
        this.vel.set(0, 0, 0);
      }
      return;
    }
    // Phase 3: a tamed companion trails its owner instead of wandering.
    if (this.tamedBy) {
      if (this.tamedBy.dead || this.tamedBy.hp <= 0) { this.tamedBy = null; }
      else {
        const owner = this.tamedBy.pos;
        const dx = owner.x - this.pos.x, dz = owner.z - this.pos.z;
        const d = Math.hypot(dx, dz);
        if (d > 2.4) {
          const sp = 2.4 * dt;
          this.pos.x += (dx / d) * sp;
          this.pos.z += (dz / d) * sp;
          this.pos.y = g.terrain.getHeight(this.pos.x, this.pos.z);
          this.mesh.rotation.y = Math.atan2(dx, dz);
        }
        this._spook = Math.max(0, (this._spook || 0) - dt);
        return;
      }
    }
    // Being approached by a would-be tamer: hold still.
    if (this._curious > 0) {
      this._curious -= dt;
      this._spook = Math.max(0, (this._spook || 0) - dt);
      return;
    }

    if (this.aquatic) return this.updateFish(dt);
    if (this.type === 'snake') this.updateSnakeExtras(dt);

    this.moveTimer -= dt;
    if (this.moveTimer <= 0) {
      this.moveTimer = 2 + g.rng() * 4;
      const a = g.rng() * Math.PI * 2, r = 3 + g.rng() * 6;
      const x = clamp(this.pos.x + Math.cos(a) * r, -75, 75);
      const z = clamp(this.pos.z + Math.sin(a) * r, -75, 75);
      if (!g.terrain.isWater(x, z)) this.target = new THREE.Vector3(x, 0, z);
    }
    if (this.target) {
      const dx = this.target.x - this.pos.x, dz = this.target.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.5) this.target = null;
      else {
        const sp = this.type === 'snake' ? 0.9 : 1.6;
        const nx = this.pos.x + (dx / d) * sp * dt, nz = this.pos.z + (dz / d) * sp * dt;
        if (!g.terrain.isWater(nx, nz)) {
          this.pos.x = nx; this.pos.z = nz;
          this.pos.y = g.terrain.getHeight(nx, nz);
          this.mesh.rotation.y = Math.atan2(dx, dz) - (this.type === 'snake' ? 0 : Math.PI / 2);
          if (this.type === 'snake') this.mesh.rotation.y += Math.sin(this.t * 6) * 0.3;
          this._moving = true;
        } else this.target = null;
      }
    }
    // kinematic legs / body
    const L = this.mesh.userData.limbs;
    if (L && L.legs && this._moving) {
      const s = Math.sin(this.t * 8) * 0.35;
      L.legs.forEach((leg, i) => { leg.rotation.x = (i % 2 ? s : -s); });
      if (L.tail) L.tail.rotation.y = Math.sin(this.t * 5) * 0.4;
      this._moving = false;
    }
    if (L && L.segs) {
      L.segs.forEach((seg, i) => { seg.position.x = Math.sin(this.t * 5 + i * 1.4) * 0.12; });
    }
  }
  updateSnakeExtras(dt) {
    const g = this.game;
    this.biteTimer -= dt;
    if (this.biteTimer <= 0) {
      for (const c of g.creatures) {
        if (dist2(c.pos.x, c.pos.z, this.pos.x, this.pos.z) < 1.6) {
          c.damage(4, null);
          c.fear = Math.min(1, c.fear + 0.5);
          this.biteTimer = 6;
          break;
        }
      }
    }
  }
  updateFish(dt) {
    const g = this.game;
    // occasional leap out of the water
    if (this.jumpT >= 0) {
      this.jumpT += dt * 2.2;
      this.pos.y = WATER_Y - 0.12 + Math.sin(Math.min(this.jumpT, 1) * Math.PI) * 0.8;
      this.mesh.rotation.z = Math.sin(Math.min(this.jumpT, 1) * Math.PI) * 0.8;
      if (this.jumpT >= 1) { this.jumpT = -1; this.mesh.rotation.z = 0; }
    } else {
      this.pos.y = WATER_Y - 0.12 + Math.sin(this.t * 2) * 0.05;
      if (g.rng() < dt * 0.05) this.jumpT = 0;
    }
    this.moveTimer -= dt;
    if (this.moveTimer <= 0) {
      this.moveTimer = 2 + g.rng() * 3;
      const a = g.rng() * Math.PI * 2, r = 2 + g.rng() * 5;
      const x = clamp(this.pos.x + Math.cos(a) * r, -75, 75);
      const z = clamp(this.pos.z + Math.sin(a) * r, -75, 75);
      if (g.terrain.isWater(x, z)) this.target = new THREE.Vector3(x, 0, z);
    }
    if (this.target) {
      const dx = this.target.x - this.pos.x, dz = this.target.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.4) this.target = null;
      else {
        const nx = this.pos.x + (dx / d) * 1.3 * dt, nz = this.pos.z + (dz / d) * 1.3 * dt;
        if (g.terrain.isWater(nx, nz)) {
          this.pos.x = nx; this.pos.z = nz;
          this.mesh.rotation.y = Math.atan2(dx, dz) - Math.PI / 2;
        } else this.target = null;
      }
    }
  }
  damage(amount, attacker) {
    this.hp -= amount;
    if (this.hp <= 0) this.game.killAnimal(this, attacker);
  }

  /**
   * A failed taming spooks the animal: it bolts away from the would-be tamer
   * and refuses further attempts while spooked, so taming has a real cost
   * rather than being a free reroll every tick.
   */
  startle(fromPos) {
    this._spook = 6;
    const dx = this.pos.x - fromPos.x, dz = this.pos.z - fromPos.z;
    const d = Math.hypot(dx, dz) || 1;
    this.pos.x += (dx / d) * 2.5;
    this.pos.z += (dz / d) * 2.5;
    this.pos.y = this.game.terrain.getHeight(this.pos.x, this.pos.z);
  }

  /** Spooked animals can't be tamed until they settle. */
  get spooked() { return (this._spook || 0) > 0; }
}

// ============================ MONSTER ============================
export class Monster {
  constructor(game, type, x, z) {
    this.id = NEXT_ID++;
    this.game = game;
    this.type = type;
    this.hp = 220; this.maxHp = 220;
    this.held = false;
    this.airborne = false;
    this.vel = new THREE.Vector3();
    this.mesh = buildMonster(type);
    this.mesh.position.set(x, game.terrain.getHeight(x, z), z);
    tagEntity(this.mesh, this);
    game.scene.add(this.mesh);
    this.lair = new THREE.Vector3(x, 0, z);
    this.target = null;
    this.wanderTimer = 0;
    this.t = 0;
  }
  get pos() { return this.mesh.position; }
  get strength() { return 2.2; }
  update(dt) {
    if (this.held) return;
    const g = this.game;
    this.t += dt;
    const w = this.mesh.userData.wings;
    if (w) { w.wingL.rotation.z = 0.4 + Math.sin(this.t * 6) * 0.3; w.wingR.rotation.z = -0.4 - Math.sin(this.t * 6) * 0.3; }
    if (this.airborne) {
      this.vel.y -= 22 * dt;
      this.pos.addScaledVector(this.vel, dt);
      const ground = g.terrain.getHeight(this.pos.x, this.pos.z);
      if (this.pos.y <= ground) { this.pos.y = ground; this.airborne = false; this.vel.set(0, 0, 0); this.damage(30, null); }
      return;
    }
    const lairD = dist2(this.pos.x, this.pos.z, this.lair.x, this.lair.z);
    if (lairD > 900) {
      this.target = null;
      const dx = this.lair.x - this.pos.x, dz = this.lair.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      const nx = this.pos.x + (dx / d) * 1.9 * dt, nz = this.pos.z + (dz / d) * 1.9 * dt;
      if (!g.terrain.isWater(nx, nz)) {
        this.pos.x = nx; this.pos.z = nz; this.pos.y = g.terrain.getHeight(nx, nz);
        this.mesh.rotation.y = Math.atan2(dx, dz);
      }
      return;
    }
    if (!this.target || this.target.hp <= 0) {
      let best = null, bd = 225;
      for (const c of g.creatures) {
        if (dist2(c.pos.x, c.pos.z, this.lair.x, this.lair.z) > 900) continue;
        const d = dist2(c.pos.x, c.pos.z, this.pos.x, this.pos.z);
        if (d < bd) { bd = d; best = c; }
      }
      this.target = best;
    }
    if (this.target) {
      const dx = this.target.pos.x - this.pos.x, dz = this.target.pos.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 1.8) {
        this.target.damage(this.strength * 8 * dt, this);
        this.target.fear = 1;
      } else if (d < 22) {
        const nx = this.pos.x + (dx / d) * 1.9 * dt, nz = this.pos.z + (dz / d) * 1.9 * dt;
        if (!g.terrain.isWater(nx, nz)) {
          this.pos.x = nx; this.pos.z = nz;
          this.pos.y = g.terrain.getHeight(nx, nz);
          this.mesh.rotation.y = Math.atan2(dx, dz);
        }
      } else this.target = null;
    }
    if (!this.target) {
      this.wanderTimer -= dt;
      if (this.wanderTimer <= 0) {
        this.wanderTimer = 4 + g.rng() * 5;
        this._wdir = g.rng() * Math.PI * 2;
      }
      if (this._wdir !== undefined) {
        const nx = this.pos.x + Math.cos(this._wdir) * dt, nz = this.pos.z + Math.sin(this._wdir) * dt;
        if (!g.terrain.isWater(nx, nz) && Math.abs(nx) < 70 && Math.abs(nz) < 70) {
          this.pos.x = nx; this.pos.z = nz; this.pos.y = g.terrain.getHeight(nx, nz);
          this.mesh.rotation.y = Math.atan2(Math.cos(this._wdir), Math.sin(this._wdir));
        } else this._wdir += Math.PI / 2;
      }
    }
  }
  damage(amount, attacker) {
    this.hp -= amount;
    if (this.hp <= 0) this.game.killMonster(this, attacker);
  }
}

// ============================ BUILDING ============================
export class Building {
  constructor(game, side, type, x, z, opts = {}) {
    this.id = NEXT_ID++;
    this.game = game;
    this.side = side;
    this.type = type;
    const def = BUILDINGS[type];
    this.role = def.role || type;
    this.hp = def.hp * (game.hasTech(side, 'masonry') ? 2 : 1);
    this.maxHp = this.hp;
    this.constructing = !!opts.constructing;
    this.buildProgress = opts.constructing ? 0 : 1;
    this.buildNeeded = def.buildTime || 1;
    this.workers = new Set();
    this.mesh = buildBuilding(type, game.civOf(side));
    this.mesh.position.set(x, Math.max(game.terrain.getHeight(x, z), type === 'bridge' ? WATER_Y : -99), z);
    tagEntity(this.mesh, this);
    if (this.constructing) {
      this.mesh.scale.multiplyScalar(0.15);
      this.mesh.traverse(o => {
        if (o.isMesh && o.material && o.material.color) {
          o.material = o.material.clone();
          o.material.transparent = true;
          o.material.opacity = 0.35;
        }
      });
    }
    game.scene.add(this.mesh);
    this.t = game.rng() * 10;
    if (type !== 'bridge') game.terrain.stampDirt(x, z, type === 'campfire' ? 4.5 : 4.2, this.constructing ? 0.95 : 0.7);
  }
  get pos() { return this.mesh.position; }
  addWork(amount, worker) {
    if (!this.constructing) return;
    if (worker) this.workers.add(worker.id);
    this.buildProgress += amount;
    const t = clamp(this.buildProgress / this.buildNeeded, 0.15, 1);
    this.mesh.scale.setScalar(t * (this.type === 'bridge' ? 1.2 : 1.45));
    if (this.buildProgress >= this.buildNeeded) {
      this.constructing = false;
      this.mesh.scale.setScalar(this.type === 'bridge' ? 1.2 : 1.45);
      this.mesh.traverse(o => {
        if (o.isMesh && o.material) { o.material.transparent = false; o.material.opacity = 1; }
      });
      this.workers.clear();
      if (this.side === 'player') this.game.msg(`${BUILDINGS[this.type].name} completed`, this.pos.clone());
    }
  }
  update(dt) {
    if (this.constructing) return;
    this.t += dt;
    if (this.type === 'campfire') {
      const health = this.game.tribeHealth(this.side);
      const f = this.mesh.userData.flame, f2 = this.mesh.userData.flame2;
      const flicker = 1 + Math.sin(this.t * 9) * 0.13;
      const size = (0.55 + health * 0.9) * flicker;
      if (f) {
        f.scale.setScalar(size);
        f.material.emissive.setHex(health > 0.7 ? 0xdd7710 : health > 0.35 ? 0xbb4410 : 0x882211);
        f.material.color.setHex(health > 0.7 ? 0xffb040 : health > 0.35 ? 0xff8c2e : 0xcc4422);
      }
      if (f2) f2.scale.setScalar(size * 0.9);
      const l = this.mesh.userData.light;
      if (l) l.intensity = (this.game.cycles.isNight ? 11 : 5) * (0.4 + health * 0.8);
    }
    if (this.type === 'farm') {
      this.game.stateOf(this.side).food += dt * 0.8 * this.game.cycles.gatherMul;
    }
    if (this.type === 'forge') {
      // slowly convert rock → metal if stocked
      const st = this.game.stateOf(this.side);
      if (st.rock >= 1 && (this._forgeT = (this._forgeT || 0) + dt) > 4) {
        this._forgeT = 0; st.rock -= 1; st.metal += 1;
      }
    }
    if (this.type === 'temple') {
      // temples generate Divine Points and radiate belief
      this.game.stateOf(this.side).dp += dt * 1.4;
      for (const c of this.game.creatures) {
        if (c.side !== this.side) continue;
        if (dist2(c.pos.x, c.pos.z, this.pos.x, this.pos.z) < 200)
          c.beliefs[this.side] = clamp(c.beliefs[this.side] + dt * 1.4, 0, 100);
        // convert visitors into monks (not royals/kids)
        if (c.cls !== 'monk' && c.cls !== 'king' && c.cls !== 'queen' && c.lifeStage === 'adult' &&
            dist2(c.pos.x, c.pos.z, this.pos.x, this.pos.z) < 16 &&
            c.beliefs[this.side] > 70 && this.game.rng() < dt * 0.04) {
          c.releaseClaim();
          c.cls = 'monk';
          c.rebuildMesh();
          if (c.side === 'player') this.game.msg(`${c.name} took the vows — now a Monk`, c.pos.clone());
        }
      }
    }
  }
  damage(amount, attacker) {
    this.hp -= amount;
    if (this.hp <= 0) this.game.destroyBuilding(this, attacker);
  }
}

// ============================ RESOURCES ============================
export class ResourceNode {
  constructor(game, kind, x, z, treeKind, sapling = false) {
    this.id = NEXT_ID++;
    this.game = game;
    this.kind = kind; // 'tree' | 'bush' | 'rock' | 'metal'
    this.yields = kind === 'bush' ? 'food' : kind === 'rock' ? 'rock' : kind === 'metal' ? 'metal' : 'wood';
    this.amount = kind === 'bush' ? 20 : kind === 'tree' ? 14 : kind === 'rock' ? 10 : kind === 'metal' ? 7 : 0;
    this.claimedBy = null;
    this.held = false;
    this.airborne = false;
    this.vel = new THREE.Vector3();
    this.mesh = kind === 'tree' ? buildTree(treeKind, game.rng)
      : kind === 'bush' ? buildBush(game.rng)
      : kind === 'metal' ? buildMetalOre(game.rng)
      : buildRock(game.rng);
    this.mesh.position.set(x, game.terrain.getHeight(x, z), z);
    tagEntity(this.mesh, this);
    game.scene.add(this.mesh);
    this.grains = kind === 'tree' ? (this.mesh.userData.grains || 6) : 0;
    this.growth = kind === 'tree' ? (sapling ? 0.22 : 0.55 + game.rng() * 0.45) : 1;
    if (kind === 'tree') {
      this.baseScale = this.mesh.scale.x;
      if (sapling) this.amount = 3;
      this.swayPhase = game.rng() * 10;
    }
  }
  get pos() { return this.mesh.position; }
  get depleted() { return this.amount <= 0; }
  harvest(amount) {
    const got = Math.min(this.amount, amount);
    this.amount -= got;
    if (this.depleted) this.game.removeResource(this);
    return got;
  }
  regrow(amt) { if (this.kind === 'bush') this.amount = Math.min(20, this.amount + amt); }
  update(dt) {
    if (this.held) return;
    if (this.kind === 'tree' && !this.airborne) {
      if (this.growth < 1.35) {
        this.growth += dt / 420; // slower growth
        this.amount = Math.min(18, this.amount + dt * 0.03);
      }
      this.mesh.scale.setScalar(this.baseScale * this.growth);
      const wind = this.game.cycles.wind;
      this.mesh.rotation.z = Math.sin(this.game.cycles.time * (1.2 + wind * 2) + this.swayPhase) * 0.045 * wind;
    }
    if (this.airborne) {
      this.vel.y -= 22 * dt;
      this.pos.addScaledVector(this.vel, dt);
      const ground = this.game.terrain.getHeight(this.pos.x, this.pos.z);
      if (this.pos.y <= ground) {
        this.pos.y = ground;
        this.airborne = false;
        if (this.kind === 'tree' && this.vel.length() > 8) this.game.smashTree(this);
        this.vel.set(0, 0, 0);
      }
    }
  }
}

// ============================ HOLDABLE ============================
export class Holdable {
  constructor(game, kind, x, z) {
    this.id = NEXT_ID++;
    this.game = game;
    this.kind = kind;
    this.holdable = kind; // 'stick'
    this.heldBy = null;
    this.mesh = kind === 'stick' ? buildStick(game.rng) : buildStick(game.rng);
    this.amount = this.mesh.userData.amount || 1;
    this.mesh.position.set(x, game.terrain.getHeight(x, z), z);
    tagEntity(this.mesh, this);
    game.scene.add(this.mesh);
  }
  get pos() { return this.mesh.position; }
  update() {}
}

// ============================ RELIC ============================
export class Relic {
  constructor(game, x, z) {
    this.id = NEXT_ID++;
    this.game = game;
    this.mesh = buildRelic();
    this.mesh.position.set(x, game.terrain.getHeight(x, z), z);
    tagEntity(this.mesh, this);
    game.scene.add(this.mesh);
    this.t = 0;
  }
  get pos() { return this.mesh.position; }
  update(dt) {
    this.t += dt;
    const gem = this.mesh.userData.gem;
    if (gem) { gem.rotation.y += dt * 1.5; gem.position.y = 0.5 + Math.sin(this.t * 2) * 0.08; }
    for (const c of this.game.creatures) {
      if (dist2(c.pos.x, c.pos.z, this.pos.x, this.pos.z) < 4) {
        this.game.claimRelic(this, c.side);
        return;
      }
    }
  }
}
