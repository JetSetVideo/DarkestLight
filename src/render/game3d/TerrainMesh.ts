import * as THREE from "https://esm.sh/three@0.161.0";
import { idx, type WorldMap } from "../../mapgen/MapTypes";

export type TerrainAssets = {
  terrain: THREE.Mesh;
  water: THREE.Mesh;
};

export function createTerrain(map: WorldMap, opts: { verticalScale: number }): TerrainAssets {
  const w = map.width;
  const h = map.height;
  const cells = map.cells;

  // Lowpoly via non-indexed geometry (flat shading).
  const geo = new THREE.PlaneGeometry(w - 1, h - 1, w - 1, h - 1);
  geo.rotateX(-Math.PI / 2);

  const pos = geo.attributes.position as THREE.BufferAttribute;
  const col = new THREE.BufferAttribute(new Float32Array(pos.count * 3), 3);

  // The plane is centered; we want coordinates in map space: [0..w-1], [0..h-1].
  // PlaneGeometry builds from -w/2..w/2. Convert each vertex to cell sampling coords.
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + (w - 1) / 2;
    const z = pos.getZ(i) + (h - 1) / 2;

    const xi = clampInt(Math.round(x), 0, w - 1);
    const yi = clampInt(Math.round(z), 0, h - 1);
    const c = cells[idx(w, xi, yi)];

    const y = (c.h - map.seaLevel) * opts.verticalScale;
    pos.setY(i, y);

    const rgb = tileColor(c.tile, c.h, c.m);
    col.setXYZ(i, rgb.r, rgb.g, rgb.b);
  }

  geo.setAttribute("color", col);
  geo.computeVertexNormals();

  // Convert to non-indexed for crisp faceting.
  const flat = geo.toNonIndexed();
  flat.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    flatShading: true,
    roughness: 0.95,
    metalness: 0.0,
  });
  const terrain = new THREE.Mesh(flat, mat);
  terrain.receiveShadow = true;

  // Water plane at sea level.
  const waterGeo = new THREE.PlaneGeometry(w - 1, h - 1, 1, 1);
  waterGeo.rotateX(-Math.PI / 2);
  const waterMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0x0b2a3c),
    roughness: 0.15,
    metalness: 0.05,
    transparent: true,
    opacity: 0.78,
  });
  const water = new THREE.Mesh(waterGeo, waterMat);
  water.position.y = 0;
  water.receiveShadow = true;

  return { terrain, water };
}

function clampInt(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v | 0));
}

function tileColor(tile: string, height01: number, moisture01: number): THREE.Color {
  // Palette tuned for lowpoly readability (not physically based).
  switch (tile) {
    case "sea":
      return new THREE.Color().setRGB(0.03, 0.10, 0.22);
    case "river":
      return new THREE.Color().setRGB(0.10, 0.45, 0.55);
    case "sand": {
      const t = clamp01(0.25 + moisture01 * 0.25);
      return new THREE.Color().setRGB(0.58 + t * 0.12, 0.52 + t * 0.12, 0.32 + t * 0.08);
    }
    case "grass": {
      const t = clamp01(0.15 + moisture01 * 0.65);
      return new THREE.Color().setRGB(0.14 + t * 0.10, 0.32 + t * 0.28, 0.18 + t * 0.10);
    }
    case "rock": {
      const t = clamp01((height01 - 0.62) / 0.2);
      return new THREE.Color().setRGB(0.25 + t * 0.22, 0.26 + t * 0.22, 0.29 + t * 0.22);
    }
    case "mountain": {
      const t = clamp01((height01 - 0.74) / 0.12);
      return new THREE.Color().setRGB(0.32 + t * 0.25, 0.30 + t * 0.25, 0.28 + t * 0.25);
    }
    case "snow":
      return new THREE.Color().setRGB(0.88, 0.91, 0.95);
    default:
      return new THREE.Color(0xff00ff);
  }
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

