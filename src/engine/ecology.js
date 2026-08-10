// Environmental degradation & restoration — the Phase 1 feedback loop.
//
//   over-exploitation  →  fertility falls  →  biome flips to desert
//                         →  units cross it slower
//   river / rain       →  humidity rises   →  fertility recovers
//                         →  biome flips back, flora returns
//
// Performance: the terrain grid is 193x193 (~37k cells) and Terrain.recolor is
// already the single hottest thing in the frame. Sweeping every cell here each
// tick would add a second hotspot, so this keeps an *active set* — a cell only
// simulates while it is out of equilibrium, and retires itself once it settles.
// A quiet map costs ~nothing per tick.
import { BIOMES, SEG, WORLD_SIZE, WATER_Y } from '../world.js';

const V = SEG + 1;
const DESERT_ID = BIOMES.desert.id;

// Fertility thresholds. Hysteresis on purpose: a cell must fall well below the
// restore point to desertify and climb well above the desertify point to come
// back, so a cell sitting near the boundary can't flicker between biomes.
export const DESERTIFY_AT = 0.22;
export const RESTORE_AT = 0.58;

// Movement cost. Desertified ground is loose sand — crossing it is slow.
export const DESERT_SPEED_MUL = 0.62;

// Rates (per simulated second).
const RECOVER_RATE = 0.055;   // fertility drifting toward its humidity target
const DRY_PER_DRAIN = 0.35;   // humidity stripped alongside fertility
const SETTLE_EPS = 0.004;     // below this drift, a cell retires from the set

/** Biomes that are already arid/frozen — they can't "degrade" further. */
const BARREN = new Set([BIOMES.desert.id, BIOMES.ice_desert.id, BIOMES.ice_cap.id]);

export class Ecology {
  /**
   * @param {import('../world.js').Terrain} terrain
   * @param {{onDesertify?: (x:number,z:number)=>void,
   *          onRestore?: (x:number,z:number)=>void}} [hooks]
   */
  constructor(terrain, hooks = {}) {
    this.terrain = terrain;
    this.hooks = hooks;

    const n = V * V;
    // Fertility 0..1. Seeded from the generated humidity so a rainforest starts
    // rich and a dune field starts poor.
    this.fertility = new Float32Array(n);
    // The climate-natural biome, remembered so restoration knows what to
    // return the cell *to* rather than defaulting everything to plains.
    this.baseBiome = new Uint8Array(n);
    // Cells we have converted to desert ourselves (vs. natural desert).
    this.manMade = new Uint8Array(n);

    for (let k = 0; k < n; k++) {
      this.baseBiome[k] = terrain.biome[k];
      this.fertility[k] = BARREN.has(terrain.biome[k])
        ? Math.min(0.2, terrain.humidity[k])
        : Math.max(0.35, Math.min(1, terrain.humidity[k] * 1.25 + 0.15));
    }

    /** @type {Set<number>} cells currently out of equilibrium */
    this.active = new Set();
    this.stats = { desertified: 0, restored: 0 };
  }

  // --- coordinate helpers (world space -> cell index) ---------------------

  /** Cell index for a world position, or -1 when off-map. */
  idxAt(x, z) {
    const i = Math.round((x / WORLD_SIZE + 0.5) * SEG);
    const j = Math.round((z / WORLD_SIZE + 0.5) * SEG);
    if (i < 0 || i > SEG || j < 0 || j > SEG) return -1;
    return j * V + i;
  }

  /** Run `fn(k, falloff)` over every cell within `radius` world units. */
  _brush(x, z, radius, fn) {
    const iC = (x / WORLD_SIZE + 0.5) * SEG;
    const jC = (z / WORLD_SIZE + 0.5) * SEG;
    const r = Math.max(1e-3, radius / (WORLD_SIZE / SEG));
    const j0 = Math.max(0, Math.floor(jC - r));
    const j1 = Math.min(SEG, Math.ceil(jC + r));
    const i0 = Math.max(0, Math.floor(iC - r));
    const i1 = Math.min(SEG, Math.ceil(iC + r));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const d = Math.hypot(i - iC, j - jC);
        if (d > r) continue;
        fn(j * V + i, 1 - d / r);
      }
    }
  }

  // --- the two inputs -----------------------------------------------------

  /**
   * Strip fertility from the ground — called when units harvest, trample or
   * clear-cut. Repeated draining on the same spot is what desertifies it.
   */
  drainAt(x, z, amount, radius = 2.2) {
    this._brush(x, z, radius, (k, fall) => {
      if (this.terrain.heights[k] < WATER_Y + 0.2) return; // underwater: no soil
      const before = this.fertility[k];
      this.fertility[k] = Math.max(0, before - amount * fall);
      // Stripped ground loses its moisture too, which is what keeps the cell
      // from simply bouncing back the moment harvesting stops.
      this.terrain.humidity[k] = Math.max(0, this.terrain.humidity[k] - amount * fall * DRY_PER_DRAIN);
      if (this.fertility[k] !== before) this.active.add(k);
    });
  }

  /**
   * Add moisture — from a river course, rainfall, or a rain miracle. This is
   * the restoration input: humidity raises the fertility target, which pulls
   * a desertified cell back to life over time.
   */
  waterAt(x, z, amount, radius = 3.0) {
    this._brush(x, z, radius, (k, fall) => {
      if (this.terrain.heights[k] < WATER_Y + 0.2) return;
      const t = this.terrain;
      const before = t.humidity[k];
      t.humidity[k] = Math.min(1, before + amount * fall);
      if (t.humidity[k] !== before) this.active.add(k);
    });
  }

  // --- gameplay queries ---------------------------------------------------

  /** True if this cell is desert that the player's civilisation created. */
  isDesertified(x, z) {
    const k = this.idxAt(x, z);
    return k >= 0 && this.manMade[k] === 1;
  }

  /**
   * Movement multiplier at a world position — 1.0 on healthy ground, falling
   * toward DESERT_SPEED_MUL on loose desertified sand.
   */
  speedFactorAt(x, z) {
    const k = this.idxAt(x, z);
    if (k < 0) return 1;
    if (this.terrain.biome[k] !== DESERT_ID) return 1;
    // Natural desert slows you a little; land ruined by over-harvesting is
    // looser and slows you the full amount.
    const severity = this.manMade[k] ? 1 : 0.5;
    return 1 - (1 - DESERT_SPEED_MUL) * severity;
  }

  /** Fertility 0..1 at a world position (for HUD / AI decisions). */
  fertilityAt(x, z) {
    const k = this.idxAt(x, z);
    return k < 0 ? 0 : this.fertility[k];
  }

  // --- simulation ---------------------------------------------------------

  /**
   * Advance the active cells. Cells drift toward the fertility their local
   * humidity can support, flipping biome when they cross a threshold, and
   * retire from the active set once they stop moving.
   */
  tick(dt) {
    if (this.active.size === 0) return;
    const t = this.terrain;
    let colorDirty = false;
    const retire = [];

    for (const k of this.active) {
      const hum = t.humidity[k];
      // Ground can only hold as much life as its moisture supports.
      const target = Math.max(0, Math.min(1, hum * 1.25 + 0.05));
      const drift = (target - this.fertility[k]) * RECOVER_RATE * dt;
      this.fertility[k] += drift;

      const f = this.fertility[k];
      const bio = t.biome[k];

      // --- desertification ---
      if (f <= DESERTIFY_AT && bio !== DESERT_ID && !BARREN.has(this.baseBiome[k])) {
        t.biome[k] = DESERT_ID;
        this.manMade[k] = 1;
        this.stats.desertified++;
        colorDirty = true;
        this.hooks.onDesertify?.(...this._worldOf(k));
      // --- restoration ---
      } else if (f >= RESTORE_AT && bio === DESERT_ID && this.manMade[k]) {
        t.biome[k] = this.baseBiome[k];
        this.manMade[k] = 0;
        this.stats.restored++;
        colorDirty = true;
        this.hooks.onRestore?.(...this._worldOf(k));
      }

      // Dry ground keeps drying until something waters it, so only retire a
      // cell once it has genuinely settled.
      if (Math.abs(drift) < SETTLE_EPS * dt || f <= 0.001 || f >= 0.999) retire.push(k);
    }

    for (const k of retire) this.active.delete(k);
    if (colorDirty) t._colDirty = true;
  }

  /** World-space centre of a cell index. */
  _worldOf(k) {
    const i = k % V;
    const j = (k / V) | 0;
    return [(i / SEG - 0.5) * WORLD_SIZE, (j / SEG - 0.5) * WORLD_SIZE];
  }
}
