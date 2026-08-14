// Paved road networks.
//
// Roads are the civilisation's answer to Phase 1's desertification malus:
// paving cancels the loose-sand penalty entirely and adds a speed bonus on
// top, so a society that has ruined its land can engineer its way around the
// consequence instead of only restoring it.
//
// Same active-grid discipline as Ecology — a flat Uint8 per cell, no per-frame
// sweeps, O(1) lookups on the movement hot path.
import { SEG, WORLD_SIZE, WATER_Y } from '../world.js';

const V = SEG + 1;

/** Speed multiplier on a fully paved cell. */
export const ROAD_SPEED_MUL = 1.38;
/** Wood cost per road segment paved. */
export const PAVE_COST_WOOD = 1;

export class RoadNetwork {
  constructor(terrain) {
    this.terrain = terrain;
    /** Pave quality 0..255 per cell (0 = unpaved). */
    this.paved = new Uint8Array(V * V);
    // Terrain.recolor tints paved cells; share the buffer so it can read it.
    terrain.paved = this.paved;
    /** @type {{a: object, b: object, points: {x:number,z:number}[], done: number}[]} */
    this.routes = [];
    this.stats = { cellsPaved: 0, routesPlanned: 0, routesCompleted: 0 };
  }

  idxAt(x, z) {
    const i = Math.round((x / WORLD_SIZE + 0.5) * SEG);
    const j = Math.round((z / WORLD_SIZE + 0.5) * SEG);
    if (i < 0 || i > SEG || j < 0 || j > SEG) return -1;
    return j * V + i;
  }

  /** Pave quality 0..1 at a world position. */
  qualityAt(x, z) {
    const k = this.idxAt(x, z);
    return k < 0 ? 0 : this.paved[k] / 255;
  }

  isPaved(x, z) { return this.qualityAt(x, z) > 0.35; }

  /**
   * Movement multiplier from roads. Returns 1 off-road; blends toward
   * ROAD_SPEED_MUL with pave quality.
   */
  speedFactorAt(x, z) {
    const q = this.qualityAt(x, z);
    return q <= 0 ? 1 : 1 + (ROAD_SPEED_MUL - 1) * q;
  }

  /** Lay pavement in a brush around a point. */
  pave(x, z, radius = 1.6, strength = 1) {
    const iC = (x / WORLD_SIZE + 0.5) * SEG;
    const jC = (z / WORLD_SIZE + 0.5) * SEG;
    const r = Math.max(1e-3, radius / (WORLD_SIZE / SEG));
    let added = 0;
    for (let j = Math.max(0, Math.floor(jC - r)); j <= Math.min(SEG, Math.ceil(jC + r)); j++) {
      for (let i = Math.max(0, Math.floor(iC - r)); i <= Math.min(SEG, Math.ceil(iC + r)); i++) {
        const d = Math.hypot(i - iC, j - jC);
        if (d > r) continue;
        const k = j * V + i;
        if (this.terrain.heights[k] < WATER_Y + 0.15) continue; // no paving the sea
        const was = this.paved[k];
        const val = Math.min(255, was + Math.round(255 * strength * (1 - d / r)));
        this.paved[k] = val;
        if (was < 90 && val >= 90) added++;
      }
    }
    if (added) {
      this.stats.cellsPaved += added;
      this.terrain._colDirty = true; // roads tint the ground in recolor()
    }
    return added;
  }

  /**
   * Plan a route between two structures.
   *
   * Straight-line sampling, but rejected if it would cross water — a road
   * into the sea is worse than no road, and bridging is a separate building.
   * Returns null when the route is not viable.
   */
  planRoute(a, b, step = 2.4) {
    const ax = a.pos.x, az = a.pos.z, bx = b.pos.x, bz = b.pos.z;
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 6) return null;                 // already adjacent
    const n = Math.ceil(len / step);
    const points = [];
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      const x = ax + (bx - ax) * u;
      const z = az + (bz - az) * u;
      if (this.terrain.getHeight(x, z) < WATER_Y + 0.2) return null; // crosses water
      points.push({ x, z });
    }
    const route = { a, b, points, done: 0 };
    this.routes.push(route);
    this.stats.routesPlanned++;
    return route;
  }

  /** True when a route between these two structures already exists. */
  hasRoute(a, b) {
    return this.routes.some((r) =>
      (r.a === a && r.b === b) || (r.a === b && r.b === a));
  }

  /** The next unpaved waypoint on a route, or null when finished. */
  nextWaypoint(route) {
    while (route.done < route.points.length) {
      const p = route.points[route.done];
      if (!this.isPaved(p.x, p.z)) return p;
      route.done++;
    }
    return null;
  }

  /** Mark a waypoint paved and advance the route cursor. */
  completeWaypoint(route) {
    const p = route.points[route.done];
    if (!p) return false;
    this.pave(p.x, p.z, 1.8, 1);
    route.done++;
    if (route.done >= route.points.length) {
      this.stats.routesCompleted++;
      return true;
    }
    return false;
  }

  /** Routes still needing work. */
  get openRoutes() {
    return this.routes.filter((r) => r.done < r.points.length);
  }
}
