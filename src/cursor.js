// The divine hand: grab, throw, shake, plant, draw shapes to cast spells,
// dig/raise terrain, place buildings. Also drives the camera rig.
import * as THREE from 'three';
import { recognizeShape, clamp } from './util.js';
import { ResourceNode, Creature, Animal, Monster, Building } from './entities.js';
import { BUILDINGS } from './civs.js';

export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.target = new THREE.Vector3(-30, 0, 0);
    this.yaw = 0.6;
    this.pitch = 0.9;
    this.dist = 42;
    this.keys = {};
    this.binds = { panForward: 'w', panBack: 's', panLeft: 'a', panRight: 'd' };
    window.addEventListener('keydown', e => { this.keys[e.key.toLowerCase()] = true; });
    window.addEventListener('keyup', e => { this.keys[e.key.toLowerCase()] = false; });
  }
  setKeybinds(binds) {
    if (binds) this.binds = { ...this.binds, ...binds };
  }
  update(dt, speedMul, terrain) {
    const sp = 30 * speedMul * (this.dist / 42);
    const fwd = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const right = new THREE.Vector3(fwd.z, 0, -fwd.x);
    const b = this.binds;
    if (this.keys[b.panForward] || this.keys['arrowup']) this.target.addScaledVector(fwd, -sp * dt);
    if (this.keys[b.panBack] || this.keys['arrowdown']) this.target.addScaledVector(fwd, sp * dt);
    if (this.keys[b.panLeft] || this.keys['arrowleft']) this.target.addScaledVector(right, -sp * dt);
    if (this.keys[b.panRight] || this.keys['arrowright']) this.target.addScaledVector(right, sp * dt);
    this.target.x = clamp(this.target.x, -85, 85);
    this.target.z = clamp(this.target.z, -85, 85);
    if (terrain) this.target.y = Math.max(terrain.getHeight(this.target.x, this.target.z), 0);
    const off = new THREE.Vector3(
      Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      Math.cos(this.yaw) * Math.cos(this.pitch),
    ).multiplyScalar(this.dist);
    this.camera.position.copy(this.target).add(off);
    this.camera.lookAt(this.target);
  }
  /** Drag-pan: mouse drag opposite to desired camera motion. */
  panByDrag(dx, dy) {
    const sp = 0.045 * (this.dist / 42);
    const fwd = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const right = new THREE.Vector3(fwd.z, 0, -fwd.x);
    // opposite of drag on X (and Y → depth) = grab-the-map feel
    this.target.addScaledVector(right, -dx * sp);
    this.target.addScaledVector(fwd, -dy * sp);
    this.target.x = clamp(this.target.x, -85, 85);
    this.target.z = clamp(this.target.z, -85, 85);
  }
  rotate(dx, dy) {
    this.yaw -= dx * 0.005;
    this.pitch = clamp(this.pitch + dy * 0.004, 0.35, 1.4);
  }
  zoom(delta) { this.dist = clamp(this.dist * (delta > 0 ? 1.1 : 0.9), 12, 110); }
}

export class GodCursor {
  constructor({ canvas, camera, rig, getGame, onInspect, setTool, msg }) {
    this.canvas = canvas;
    this.camera = camera;
    this.rig = rig;
    this.getGame = getGame;
    this.onInspect = onInspect;
    this.msg = msg;
    this.tool = 'hand';
    this.buildType = null;
    this.ray = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();

    this.held = null;
    this.holdHistory = [];   // {x,z,t} world history for throw velocity + shake
    this.downAt = null;
    this.downEntity = null;
    this.lifting = false;
    this.panning = false;
    this.rotating = false;
    this.terraforming = false;
    this.spellPts = [];       // screen pts
    this.spellWorld = [];     // world pts
    this.phantom = null;      // building placement ghost
    this._phantomValid = false;

    // spell trail overlay
    this.trailCanvas = document.createElement('canvas');
    document.getElementById('spell-trail').appendChild(this.trailCanvas);
    this.resizeTrail();
    window.addEventListener('resize', () => this.resizeTrail());

    canvas.addEventListener('pointerdown', e => this.onDown(e));
    window.addEventListener('pointermove', e => this.onMove(e));
    window.addEventListener('pointerup', e => this.onUp(e));
    canvas.addEventListener('wheel', e => { e.preventDefault(); this.rig.zoom(e.deltaY); }, { passive: false });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
  }

  clearPhantom() {
    const game = this.getGame();
    if (this.phantom) {
      if (game) game.scene.remove(this.phantom);
      this.phantom.geometry?.dispose?.();
      this.phantom.material?.dispose?.();
      this.phantom = null;
    }
  }

  ensurePhantom(fp) {
    const game = this.getGame();
    if (!game) return;
    if (this.phantom && this.phantom.userData.fp === fp) return;
    this.clearPhantom();
    const geo = new THREE.CylinderGeometry(fp, fp, 0.12, 28);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x4ade80, transparent: true, opacity: 0.35, depthWrite: false,
    });
    this.phantom = new THREE.Mesh(geo, mat);
    this.phantom.userData.fp = fp;
    this.phantom.renderOrder = 10;
    game.scene.add(this.phantom);
  }

  updatePhantom(p) {
    const game = this.getGame();
    if (!game || this.tool !== 'build' || !this.buildType) {
      this.clearPhantom();
      return;
    }
    const def = BUILDINGS[this.buildType];
    const fp = def?.footprint || 2.5;
    this.ensurePhantom(fp);
    if (!p) { this.phantom.visible = false; return; }
    const check = game.validateBuildSite(this.buildType, p.x, p.z);
    const canAfford = game.canBuild('player', this.buildType);
    this._phantomValid = check.ok && canAfford;
    this.phantom.visible = true;
    this.phantom.position.set(p.x, game.terrain.getHeight(p.x, p.z) + 0.08, p.z);
    this.phantom.material.color.setHex(this._phantomValid ? 0x4ade80 : 0xef4444);
    this.phantom.material.opacity = this._phantomValid ? 0.4 : 0.45;
  }

  resizeTrail() {
    this.trailCanvas.width = window.innerWidth;
    this.trailCanvas.height = window.innerHeight;
  }

  setPointer(e) {
    this.pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    this.pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
  }

  groundPoint(e) {
    this.setPointer(e);
    this.ray.setFromCamera(this.pointer, this.camera);
    const game = this.getGame();
    if (!game) return null;
    const hits = this.ray.intersectObject(game.terrain.mesh);
    return hits.length ? hits[0].point : null;
  }

  pickEntity(e) {
    this.setPointer(e);
    this.ray.setFromCamera(this.pointer, this.camera);
    const game = this.getGame();
    if (!game) return null;
    const pool = [];
    for (const c of game.creatures) if (c.mesh.visible) pool.push(c.mesh);
    for (const a of game.animals) if (a.mesh.visible) pool.push(a.mesh);
    for (const m of game.monsters) if (m.mesh.visible) pool.push(m.mesh);
    for (const b of game.buildings) if (b.mesh.visible) pool.push(b.mesh);
    for (const r of game.resources) if (r.mesh.visible) pool.push(r.mesh);
    const hits = this.ray.intersectObjects(pool, true);
    for (const h of hits) {
      let o = h.object;
      while (o && !o.userData.entity) o = o.parent;
      if (o) return o.userData.entity;
    }
    return null;
  }

  onDown(e) {
    const game = this.getGame();
    if (!game) return;
    if (e.button === 2 || e.button === 1) { this.rotating = true; return; }
    if (e.button !== 0) return;

    switch (this.tool) {
      case 'hand': {
        this.downAt = { x: e.clientX, y: e.clientY };
        this.downEntity = this.pickEntity(e);
        this.lifting = false;
        this.panning = false;
        break;
      }
      case 'spell': {
        this.spellPts = [{ x: e.clientX, y: e.clientY }];
        const p = this.groundPoint(e);
        if (p) this.spellWorld = [p.clone()];
        break;
      }
      case 'plant': {
        const p = this.groundPoint(e);
        if (p && !game.terrain.isWater(p.x, p.z)) {
          const cost = game.mode === 'battle' ? 5 : 0;
          if (game.state.player.dp >= cost) {
            game.state.player.dp -= cost;
            game.resources.push(new ResourceNode(game, 'tree', p.x, p.z, ['oak', 'pine', 'cherry'][(game.rng() * 3) | 0], true));
          } else this.msg('Need 5 ✦ to plant');
        }
        break;
      }
      case 'dig': case 'raise':
        this.terraforming = true;
        this.terraformAt(e, 0.016);
        break;
      case 'build': {
        if (!this.buildType) break;
        const p = this.groundPoint(e);
        if (p) {
          this.updatePhantom(p);
          if (!this._phantomValid) {
            const check = game.validateBuildSite(this.buildType, p.x, p.z);
            this.msg(check.ok ? 'Cannot afford / unlock this building' : check.reason);
            break;
          }
          if (game.build('player', this.buildType, p.x, p.z)) {
            this.msg(`${BUILDINGS[this.buildType]?.name || this.buildType} placed`);
          }
        }
        break;
      }
    }
  }

  onMove(e) {
    const game = this.getGame();
    if (!game) return;
    if (this.rotating) { this.rig.rotate(e.movementX, e.movementY); return; }

    // LMB drag-pan: opposite of drag direction (grab-the-map)
    if (this.tool === 'hand' && this.downAt && !this.held) {
      const moved = Math.hypot(e.clientX - this.downAt.x, e.clientY - this.downAt.y);
      if (moved > 8) {
        const onGrabbable = this.downEntity && this.grabbable(this.downEntity);
        if (onGrabbable && !this.panning) {
          this.held = this.downEntity;
          this.held.held = true;
          this.holdHistory = [];
          this.lifting = true;
        } else if (!onGrabbable || this.panning) {
          this.panning = true;
          this.rig.panByDrag(e.movementX, e.movementY);
        }
      }
    }
    if (this.held) {
      const p = this.groundPoint(e);
      if (p) {
        this.held.mesh.position.set(p.x, p.y + 2.2, p.z);
        this.holdHistory.push({ x: p.x, z: p.z, t: performance.now() / 1000 });
        if (this.holdHistory.length > 30) this.holdHistory.shift();
        this.checkShake();
      }
    }
    if (this.tool === 'spell' && this.spellPts.length) {
      this.spellPts.push({ x: e.clientX, y: e.clientY });
      const p = this.groundPoint(e);
      if (p) this.spellWorld.push(p.clone());
      this.drawTrail();
    }
    if (this.terraforming) this.terraformAt(e, 0.016);

    // phantom building preview follows cursor
    if (this.tool === 'build' && this.buildType) {
      this.updatePhantom(this.groundPoint(e));
    } else if (this.phantom) {
      this.clearPhantom();
    }
  }

  onUp(e) {
    const game = this.getGame();
    this.rotating = false;
    this.terraforming = false;
    if (!game) return;

    if (this.tool === 'hand') {
      if (this.held) {
        // throw or drop, based on recent hand velocity
        const h = this.holdHistory;
        let vx = 0, vz = 0;
        if (h.length >= 2) {
          const a = h[Math.max(0, h.length - 5)], b = h[h.length - 1];
          const dt = Math.max(0.02, b.t - a.t);
          vx = (b.x - a.x) / dt; vz = (b.z - a.z) / dt;
        }
        const sp = Math.hypot(vx, vz);
        this.held.held = false;
        const throwCost = game.mode === 'battle' ? 3 : 0;
        if (sp > 9 && game.state.player.dp >= throwCost) {
          game.state.player.dp -= throwCost;
          this.held.vel.set(vx * 0.7, 5, vz * 0.7);
          this.held.airborne = true;
          this.held._thrownBy = 'player';
          if (this.held.fear !== undefined) this.held.fear = 1;
        } else {
          if (sp > 9) this.msg('Not enough ✦ to hurl (3 ✦)');
          const p = this.held.mesh.position;
          p.y = game.terrain.getHeight(p.x, p.z);
        }
        this.held = null;
      } else if (this.downAt && !this.panning && this.downEntity) {
        this.onInspect(this.downEntity);
      } else if (this.downAt && !this.panning) {
        this.onInspect(null);
      }
      this.downAt = null;
      this.downEntity = null;
      this.panning = false;
    }

    if (this.tool === 'spell' && this.spellPts.length) {
      const shape = recognizeShape(this.spellPts);
      if (shape && this.spellWorld.length > 2) game.castSpell('player', shape, this.spellWorld);
      else if (this.spellPts.length > 5) this.msg('The heavens did not recognize that sigil');
      this.spellPts = [];
      this.spellWorld = [];
      this.clearTrail();
    }
  }

  grabbable(ent) {
    if (ent instanceof Creature || ent instanceof Animal || ent instanceof Monster) return true;
    if (ent instanceof ResourceNode) return ent.kind === 'tree' || ent.kind === 'rock';
    return false;
  }

  checkShake() {
    // rapid direction reversals of the held object = a divine shake
    const h = this.holdHistory;
    if (h.length < 8) return;
    let flips = 0;
    for (let i = 2; i < h.length; i++) {
      const d1 = h[i - 1].x - h[i - 2].x, d2 = h[i].x - h[i - 1].x;
      if (d1 * d2 < -0.001) flips++;
    }
    if (flips >= 5) {
      this.holdHistory = [];
      const game = this.getGame();
      if (game.mode === 'battle') {
        if (game.state.player.dp < 1) return;
        game.state.player.dp -= 1;
      }
      const ent = this.held;
      if (ent instanceof ResourceNode && ent.kind === 'tree') {
        const got = ent.harvest(3);
        game.state.player.wood += got;
        game.trackGather('player', { food: 0, wood: got });
        this.msg(`Shaken! +${Math.round(got)} wood`);
      } else if (ent instanceof Creature) {
        ent.fear = 1;
        ent.carrying = { food: 0, wood: 0, rock: 0, metal: 0 };
        ent.beliefs.player = clamp(ent.beliefs.player + 6, 0, 100);
        this.msg(`${ent.name} trembles before you`);
      } else if (ent instanceof Animal || ent instanceof Monster) {
        ent.damage(8, null);
      }
    }
  }

  terraformAt(e, dt) {
    const game = this.getGame();
    const p = this.groundPoint(e);
    if (!p) return;
    const st = game.state.player;
    // free sandbox terraforming in construction mode; costs favor in battle
    if (game.mode === 'battle') {
      const cost = 12 * dt;
      if (st.dp < cost) { this.msg('Not enough ✦ to reshape the land'); this.terraforming = false; return; }
      st.dp -= cost;
    }
    game.terrain.deform(p.x, p.z, 5, (this.tool === 'dig' ? -1 : 1) * 7 * dt);
  }

  drawTrail() {
    const ctx = this.trailCanvas.getContext('2d');
    ctx.clearRect(0, 0, this.trailCanvas.width, this.trailCanvas.height);
    if (this.spellPts.length < 2) return;
    ctx.strokeStyle = 'rgba(232,192,100,0.9)';
    ctx.lineWidth = 3;
    ctx.shadowColor = '#e8c064';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.moveTo(this.spellPts[0].x, this.spellPts[0].y);
    for (const p of this.spellPts) ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }
  clearTrail() {
    const ctx = this.trailCanvas.getContext('2d');
    ctx.clearRect(0, 0, this.trailCanvas.width, this.trailCanvas.height);
  }
}
