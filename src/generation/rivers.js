// Watercourses the player can re-route.
//
// A river is a polyline of control points. It does two things every match:
//   1. carves a channel into the terrain heightmap (once, and again whenever
//      it is moved), and
//   2. waters the cells along its course each tick, which is the restoration
//      half of the Phase 1 ecology loop — steer a river through dead ground
//      and the ground comes back.
//
// Moving a river must not permanently scar the map, so every cell the channel
// lowers is recorded with its original height and restored before re-carving.
import { SEG, WORLD_SIZE, WATER_Y } from '../world.js';

const V = SEG + 1;

export class River {
  /**
   * @param {{x:number,z:number}[]} points  course, from source to mouth
   * @param {{width?:number, depth?:number, flow?:number}} [opts]
   */
  constructor(points, opts = {}) {
    this.points = points.map((p) => ({ x: p.x, z: p.z }));
    this.width = opts.width ?? 4.2;
    this.depth = opts.depth ?? 1.1;
    this.flow = opts.flow ?? 0.5;      // moisture delivered per second
    /** @type {Map<number, number>} cell index -> height before we carved it */
    this._carved = new Map();
  }

  /** Sample the polyline into evenly spaced world points. */
  *_samples(step = 1.4) {
    const pts = this.points;
    for (let s = 0; s < pts.length - 1; s++) {
      const a = pts[s], b = pts[s + 1];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      const n = Math.max(1, Math.ceil(len / step));
      for (let t = 0; t < n; t++) {
        const u = t / n;
        yield { x: a.x + (b.x - a.x) * u, z: a.z + (b.z - a.z) * u };
      }
    }
    const last = pts[pts.length - 1];
    if (last) yield { x: last.x, z: last.z };
  }

  /**
   * Lower the terrain along the course into a channel.
   * Idempotent: calling it again re-carves from the *original* surface.
   */
  carve(terrain) {
    this.restore(terrain);
    const r = this.width / (WORLD_SIZE / SEG);
    const pos = terrain.geo.attributes.position;

    for (const p of this._samples()) {
      const iC = (p.x / WORLD_SIZE + 0.5) * SEG;
      const jC = (p.z / WORLD_SIZE + 0.5) * SEG;
      for (let j = Math.max(0, Math.floor(jC - r)); j <= Math.min(SEG, Math.ceil(jC + r)); j++) {
        for (let i = Math.max(0, Math.floor(iC - r)); i <= Math.min(SEG, Math.ceil(iC + r)); i++) {
          const d = Math.hypot(i - iC, j - jC);
          if (d > r) continue;
          const k = j * V + i;
          if (!this._carved.has(k)) this._carved.set(k, terrain.heights[k]);
          // Cosine profile: deepest mid-channel, feathering out to the banks.
          const cut = this.depth * Math.cos((d / r) * Math.PI * 0.5);
          const orig = this._carved.get(k);
          const target = Math.min(terrain.heights[k], orig - cut);
          terrain.heights[k] = target;
          pos.setY(k, target);
          if (target < WATER_Y + 0.2) terrain.fresh[k] = 1;
        }
      }
    }
    pos.needsUpdate = true;
    terrain.geo.computeVertexNormals();
    terrain._colDirty = true;
  }

  /** Put every cell this river lowered back to its pre-river height. */
  restore(terrain) {
    if (this._carved.size === 0) return;
    const pos = terrain.geo.attributes.position;
    for (const [k, h] of this._carved) {
      terrain.heights[k] = h;
      pos.setY(k, h);
    }
    this._carved.clear();
    pos.needsUpdate = true;
    terrain.geo.computeVertexNormals();
    terrain._colDirty = true;
  }

  /** Deliver moisture to the ground along the course. */
  flowTick(ecology, dt) {
    const amt = this.flow * dt;
    if (amt <= 0) return;
    for (const p of this._samples(3.0)) {
      ecology.waterAt(p.x, p.z, amt, this.width * 1.9);
    }
  }

  /** Index of the control point nearest a world position, with its distance. */
  nearestPoint(x, z) {
    let best = -1, bestD = Infinity;
    this.points.forEach((p, i) => {
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < bestD) { bestD = d; best = i; }
    });
    return { index: best, distance: bestD };
  }
}

export class RiverSystem {
  constructor(terrain, ecology) {
    this.terrain = terrain;
    this.ecology = ecology;
    /** @type {River[]} */
    this.rivers = [];
  }

  add(river) {
    this.rivers.push(river);
    river.carve(this.terrain);
    return river;
  }

  /**
   * Build the river that worldgen implies. world.js carves its valley along
   * `sin(z * 0.055) * 10` (plus noise) — we follow the same corridor so the
   * runtime river sits in the generated valley instead of cutting across it.
   */
  addGeneratedRiver() {
    const pts = [];
    const half = WORLD_SIZE / 2;
    for (let z = -half + 6; z <= half - 6; z += 12) {
      pts.push({ x: Math.sin(z * 0.055) * 10, z });
    }
    return this.add(new River(pts, { width: 4.2, depth: 1.0, flow: 0.55 }));
  }

  /**
   * Find the control point nearest a world position, across all rivers.
   * @returns {{river: River, index: number, distance: number}|null}
   */
  nearestControl(x, z, grabRadius = 14) {
    let best = null, bestD = grabRadius;
    for (const r of this.rivers) {
      const { index, distance } = r.nearestPoint(x, z);
      if (distance < bestD) { bestD = distance; best = { river: r, index, distance }; }
    }
    return best;
  }

  /**
   * Move a specific control point. Used by the drag half of the river tool,
   * so the grab is resolved once on mouse-down and every subsequent move
   * steers the same point rather than re-picking the nearest one.
   */
  moveControl(grab, toX, toZ) {
    if (!grab?.river) return null;
    grab.river.points[grab.index].x = toX;
    grab.river.points[grab.index].z = toZ;
    grab.river.carve(this.terrain);
    this.moves = (this.moves || 0) + 1;
    return grab.river;
  }

  /**
   * Drag the nearest control point of the nearest river to a new position.
   * This is the "Move River / Watercourse" topography tool.
   *
   * @returns {River|null} the river that moved, or null if none was in range
   */
  moveNearest(fromX, fromZ, toX, toZ, grabRadius = 14) {
    const grab = this.nearestControl(fromX, fromZ, grabRadius);
    return grab ? this.moveControl(grab, toX, toZ) : null;
  }

  /** Water the ground under every river. */
  tick(dt) {
    for (const r of this.rivers) r.flowTick(this.ecology, dt);
  }

  /** True when a world position sits in a river channel (below water level). */
  isChannel(x, z) {
    return this.terrain.getHeight(x, z) < WATER_Y + 0.35;
  }
}
