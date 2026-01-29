import { fbm2D, RNG } from "./Noise";
import { idx, type MapCell, type Tile, type WorldMap } from "./MapTypes";

export class MapGenerator {
  static generate(opts: { width: number; height: number; seed?: number }): WorldMap {
    const seed = (opts.seed ?? ((Math.random() * 2 ** 31) | 0)) >>> 0;
    const rng = new RNG(seed);
    const width = opts.width;
    const height = opts.height;

    const cells: MapCell[] = new Array(width * height);

    // Base height field: fbm + island falloff so we always have a sea.
    const seaLevel = 0.46 + rng.range(-0.03, 0.03);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const nx = x / width - 0.5;
        const ny = y / height - 0.5;
        const r = Math.sqrt(nx * nx + ny * ny);
        const falloff = smoothstep(0.75, 0.2, r); // 1 center -> 0 edges

        const e = fbm2D(x / 110, y / 110, seed, 6) * 0.55 +
          fbm2D(x / 35, y / 35, seed ^ 0x9e3779b9, 4) * 0.45;
        const h = clamp01(0.5 + e * 0.6);
        const hf = clamp01(h * 0.75 + falloff * 0.45);

        const m0 = clamp01(0.55 + fbm2D(x / 90, y / 90, seed ^ 0x85ebca6b, 5) * 0.35);
        cells[idx(width, x, y)] = { h: hf, m: m0, tile: "grass", deco: null };
      }
    }

    // Pick a river source: find a high point not too close to the edge.
    const src = findRiverSource(cells, width, height, rng);
    const river = carveRiver(cells, width, height, src.x, src.y, seaLevel, rng);

    // Moisture boost near water.
    const waterDist = distanceToWater(cells, width, height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = idx(width, x, y);
        const d = waterDist[i];
        const boost = Math.exp(-d * 0.07) * 0.55;
        cells[i].m = clamp01(cells[i].m * 0.65 + boost);
      }
    }

    // Tile classification.
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = idx(width, x, y);
        const c = cells[i];
        const h = c.h;
        const m = c.m;
        let tile: Tile;
        if (c.tile === "river") {
          tile = "river";
        } else if (h < seaLevel) {
          tile = "sea";
        } else if (h < seaLevel + 0.035) {
          tile = "sand";
        } else if (h > 0.86) {
          tile = "snow";
        } else if (h > 0.74) {
          tile = "mountain";
        } else if (h > 0.64) {
          tile = "rock";
        } else {
          tile = m > 0.58 ? "grass" : "sand";
        }
        c.tile = tile;
      }
    }

    // Trees: scatter on grass near water but not too close to river.
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = idx(width, x, y);
        const c = cells[i];
        if (c.tile !== "grass") continue;
        const d = waterDist[i];
        const p = clamp01(0.22 * Math.exp(-Math.max(0, d - 2) * 0.12));
        if (rng.next() < p) c.deco = "tree";
      }
    }

    const spawn = pickSpawn(cells, width, height, seaLevel, river, rng);

    return { width, height, seed, seaLevel, cells, spawn };
  }
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

function findRiverSource(cells: MapCell[], w: number, h: number, rng: RNG): { x: number; y: number } {
  let best = { x: (w / 2) | 0, y: (h / 2) | 0, score: -1 };
  for (let k = 0; k < 1200; k++) {
    const x = rng.int((w * 0.2) | 0, (w * 0.8) | 0);
    const y = rng.int((h * 0.2) | 0, (h * 0.8) | 0);
    const c = cells[idx(w, x, y)];
    const score = c.h + rng.next() * 0.03;
    if (score > best.score) best = { x, y, score };
  }
  return { x: best.x, y: best.y };
}

function carveRiver(
  cells: MapCell[],
  w: number,
  h: number,
  sx: number,
  sy: number,
  seaLevel: number,
  rng: RNG,
): Array<{ x: number; y: number }> {
  const path: Array<{ x: number; y: number }> = [];
  let x = sx;
  let y = sy;
  let safety = 0;
  while (safety++ < w * h) {
    path.push({ x, y });
    const i = idx(w, x, y);
    cells[i].tile = "river";

    if (cells[i].h < seaLevel + 0.01) break;

    // Choose neighbor with lowest height (plus a tiny random meander).
    let bestX = x;
    let bestY = y;
    let bestH = cells[i].h + 1;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 1 || ny < 1 || nx >= w - 1 || ny >= h - 1) continue;
        const nh = cells[idx(w, nx, ny)].h + rng.range(-0.004, 0.004);
        if (nh < bestH) {
          bestH = nh;
          bestX = nx;
          bestY = ny;
        }
      }
    }

    if (bestX === x && bestY === y) break;
    x = bestX;
    y = bestY;
  }
  return path;
}

function distanceToWater(cells: MapCell[], w: number, h: number): Float32Array {
  const dist = new Float32Array(w * h);
  const qx = new Int32Array(w * h);
  const qy = new Int32Array(w * h);
  let qh = 0;
  let qt = 0;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = idx(w, x, y);
      const isWater = cells[i].tile === "river" || cells[i].h < 0.47;
      dist[i] = isWater ? 0 : 1e9;
      if (isWater) {
        qx[qt] = x;
        qy[qt] = y;
        qt++;
      }
    }
  }

  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const;

  while (qh < qt) {
    const x = qx[qh];
    const y = qy[qh];
    qh++;
    const i = idx(w, x, y);
    const d = dist[i];
    for (const [dx, dy] of dirs) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const ni = idx(w, nx, ny);
      if (dist[ni] > d + 1) {
        dist[ni] = d + 1;
        qx[qt] = nx;
        qy[qt] = ny;
        qt++;
      }
    }
  }
  return dist;
}

function pickSpawn(
  cells: MapCell[],
  w: number,
  h: number,
  seaLevel: number,
  river: Array<{ x: number; y: number }>,
  rng: RNG,
): { x: number; y: number } {
  const riverMid = river[(river.length * 0.55) | 0] ?? { x: (w / 2) | 0, y: (h / 2) | 0 };
  let best = { x: riverMid.x, y: riverMid.y, score: -1 };
  for (let k = 0; k < 1000; k++) {
    const x = clampInt(riverMid.x + rng.int(-40, 40), 2, w - 3);
    const y = clampInt(riverMid.y + rng.int(-40, 40), 2, h - 3);
    const c = cells[idx(w, x, y)];
    if (c.h < seaLevel + 0.05) continue;
    if (c.tile !== "grass") continue;
    const d = Math.hypot(x - riverMid.x, y - riverMid.y);
    const score = (1 - d / 60) + c.m * 0.3 + rng.next() * 0.05;
    if (score > best.score) best = { x, y, score };
  }
  return { x: best.x, y: best.y };
}

function clampInt(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v | 0));
}

