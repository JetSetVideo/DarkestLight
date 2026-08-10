// Asset caching + LOD management for generated meshes.
//
// One concept image produces every level of detail: img2threejs is re-run
// against the same pixels with a smaller triangle budget, so LODs share a
// silhouette and pop far less than independently generated meshes would.
//
// Caching matters more here than in a normal asset pipeline: a generated
// asset may cost a network round trip, so nothing is generated twice — and
// in-flight requests are shared, not duplicated.
import * as THREE from 'three';
import { imageToGeometry } from './img2threejs.js';
import { ImagenService, assetKey, ASSET_KINDS } from './imagen.js';
import { applyToonShading, attachOutline } from '../shaders/toon.js';

/** Detail tiers: fraction of the full triangle budget, and switch distance. */
export const LOD_LEVELS = [
  { name: 'high', budget: 1.0, distance: 0 },
  { name: 'mid', budget: 0.35, distance: 26 },
  { name: 'low', budget: 0.12, distance: 60 },
];

export class AssetLibrary {
  /**
   * @param {{imagen?: ImagenService, levels?: typeof LOD_LEVELS}} [opts]
   */
  constructor({ imagen, levels = LOD_LEVELS } = {}) {
    this.imagen = imagen || ImagenService.autoDetect();
    this.levels = levels;
    /** @type {Map<string, {geometries: THREE.BufferGeometry[], material: THREE.Material, palette: number[], stats: object}>} */
    this.entries = new Map();
    /** @type {Map<string, Promise<any>>} in-flight builds, so N callers share one generation */
    this.pending = new Map();
    this.stats = { built: 0, cacheHits: 0, instances: 0 };
  }

  /**
   * Build (or fetch cached) the LOD set for an asset spec.
   * @param {{kind: keyof ASSET_KINDS} & Record<string, any>} spec
   */
  async build(spec) {
    const key = assetKey(spec);
    if (this.entries.has(key)) {
      this.stats.cacheHits++;
      return this.entries.get(key);
    }
    if (this.pending.has(key)) return this.pending.get(key);

    const job = this._build(spec, key).finally(() => this.pending.delete(key));
    this.pending.set(key, job);
    return job;
  }

  async _build(spec, key) {
    const kind = ASSET_KINDS[spec.kind];
    if (!kind) throw new Error(`Unknown asset kind: ${spec.kind}`);

    const image = await this.imagen.concept(spec);

    const geometries = [];
    let palette = [];
    let stats = null;
    for (const level of this.levels) {
      const r = imageToGeometry(image, {
        depth: spec.depth ?? kind.depth,
        targetTris: Math.max(24, Math.round((spec.targetTris ?? kind.targetTris) * level.budget)),
        size: spec.size ?? 1.0,
      });
      geometries.push(r.geometry);
      if (!stats) { stats = r.stats; palette = r.palette; }
    }

    // One cel-shaded material per asset, shared by every instance and LOD.
    const material = applyToonShading(new THREE.MeshLambertMaterial({
      color: palette[0] ?? 0xb0b0b0,
      flatShading: true,
    }));

    const entry = { key, spec, geometries, material, palette, stats, image };
    this.entries.set(key, entry);
    this.stats.built++;
    return entry;
  }

  /**
   * Instantiate an asset as a THREE.LOD ready to add to the scene.
   * Geometry and material are shared with every other instance.
   *
   * @param {object} spec
   * @param {{outline?: boolean}} [opts]
   */
  async instantiate(spec, opts = {}) {
    const entry = await this.build(spec);
    const lod = new THREE.LOD();
    lod.name = entry.key;

    entry.geometries.forEach((geo, i) => {
      const mesh = new THREE.Mesh(geo, entry.material);
      mesh.castShadow = true;
      mesh.receiveShadow = false;
      // Outline only the highest tier: at LOD range the hull is sub-pixel and
      // costs a draw call for nothing.
      if (opts.outline && i === 0) attachOutline(mesh);
      lod.addLevel(mesh, this.levels[i].distance);
    });

    this.stats.instances++;
    return lod;
  }

  /** Release GPU resources for everything the library has built. */
  dispose() {
    for (const entry of this.entries.values()) {
      for (const g of entry.geometries) g.dispose();
      entry.material.dispose();
    }
    this.entries.clear();
    this.pending.clear();
  }

  /** Snapshot for HUD / debugging. */
  report() {
    let tris = 0;
    for (const e of this.entries.values()) {
      for (const g of e.geometries) tris += g.attributes.position.count / 3;
    }
    return {
      assets: this.entries.size,
      totalTriangles: tris,
      provider: this.imagen.provider.name,
      ...this.stats,
      imagen: this.imagen.stats,
    };
  }
}
