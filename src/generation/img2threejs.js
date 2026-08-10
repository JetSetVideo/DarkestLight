// img2threejs — convert a concept image into an optimized mid-poly Three.js mesh.
//
// Pipeline:
//   RGBA pixels
//     -> binary mask        (alpha key, or background-colour key for opaque art)
//     -> boundary trace     (Moore-neighbour, outer contour of the largest blob)
//     -> simplify           (Douglas-Peucker, binary-searched to a tri budget)
//     -> triangulate        (ear clipping)
//     -> extrude            (front + back caps + side walls)
//     -> BufferGeometry     (non-indexed, so flat shading reads as mid-poly)
//
// Pure array maths — no canvas, no DOM. The same code runs in the browser and
// under Node, which is what lets the CLI verify the pipeline headlessly.
import * as THREE from 'three';

/** @typedef {{width:number, height:number, data:Uint8ClampedArray}} RGBAImage */

// ---------------------------------------------------------------------------
// 1. Mask

/**
 * Build a binary occupancy mask.
 * Transparent art keys on alpha; fully opaque art keys on distance from the
 * corner colour, which is what generated concept art with a flat background
 * gives us.
 */
export function buildMask(img, { alphaThreshold = 128, colorTolerance = 42 } = {}) {
  const { width: W, height: H, data } = img;
  const mask = new Uint8Array(W * H);

  let hasAlpha = false;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 250) { hasAlpha = true; break; }
  }

  if (hasAlpha) {
    for (let p = 0; p < W * H; p++) mask[p] = data[p * 4 + 3] >= alphaThreshold ? 1 : 0;
    return mask;
  }

  // Opaque: treat the top-left corner as background.
  const br = data[0], bg = data[1], bb = data[2];
  for (let p = 0; p < W * H; p++) {
    const o = p * 4;
    const d = Math.hypot(data[o] - br, data[o + 1] - bg, data[o + 2] - bb);
    mask[p] = d > colorTolerance ? 1 : 0;
  }
  return mask;
}

/** Keep only the largest connected blob — drops speckle and stray marks. */
export function largestBlob(mask, W, H) {
  const label = new Int32Array(W * H).fill(-1);
  const stack = [];
  let best = -1, bestSize = 0, current = 0;

  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || label[start] !== -1) continue;
    let size = 0;
    stack.push(start);
    label[start] = current;
    while (stack.length) {
      const p = stack.pop();
      size++;
      const x = p % W, y = (p / W) | 0;
      if (x > 0) push(p - 1);
      if (x < W - 1) push(p + 1);
      if (y > 0) push(p - W);
      if (y < H - 1) push(p + W);
    }
    if (size > bestSize) { bestSize = size; best = current; }
    current++;
  }
  function push(q) {
    if (mask[q] && label[q] === -1) { label[q] = current; stack.push(q); }
  }

  const out = new Uint8Array(W * H);
  if (best < 0) return out;
  for (let p = 0; p < out.length; p++) out[p] = label[p] === best ? 1 : 0;
  return out;
}

// ---------------------------------------------------------------------------
// 2. Contour

/**
 * Trace the outer boundary of a mask with Moore-neighbour tracing.
 * @returns {{x:number,y:number}[]} closed contour in pixel coordinates
 */
export function traceContour(mask, W, H) {
  let start = -1;
  for (let p = 0; p < mask.length; p++) if (mask[p]) { start = p; break; }
  if (start < 0) return [];

  const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? 0 : mask[y * W + x];
  // 8-neighbourhood, clockwise from east
  const N8 = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];

  const sx = start % W, sy = (start / W) | 0;
  const contour = [{ x: sx, y: sy }];
  let cx = sx, cy = sy;
  let backDir = 4; // we entered from the west

  // Guard against pathological inputs rather than spinning forever.
  const maxSteps = W * H * 4;
  for (let step = 0; step < maxSteps; step++) {
    let found = false;
    for (let i = 1; i <= 8; i++) {
      const dir = (backDir + i) % 8;
      const nx = cx + N8[dir][0], ny = cy + N8[dir][1];
      if (!at(nx, ny)) continue;
      backDir = (dir + 5) % 8; // direction we came from, relative to the new cell
      cx = nx; cy = ny;
      found = true;
      break;
    }
    if (!found) break;                       // isolated pixel
    if (cx === sx && cy === sy) break;        // closed the loop
    contour.push({ x: cx, y: cy });
  }
  return contour;
}

// ---------------------------------------------------------------------------
// 3. Simplify

/** Perpendicular distance from p to segment a-b. */
function segDist(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Douglas-Peucker polyline simplification. */
export function simplify(points, epsilon) {
  if (points.length < 3) return points.slice();
  let maxD = 0, idx = 0;
  const a = points[0], b = points[points.length - 1];
  for (let i = 1; i < points.length - 1; i++) {
    const d = segDist(points[i], a, b);
    if (d > maxD) { maxD = d; idx = i; }
  }
  if (maxD <= epsilon) return [a, b];
  return [
    ...simplify(points.slice(0, idx + 1), epsilon).slice(0, -1),
    ...simplify(points.slice(idx), epsilon),
  ];
}

/**
 * Simplify to hit a vertex budget. Binary-searches epsilon rather than
 * guessing one, so the result respects the caller's triangle budget across
 * wildly different silhouettes.
 */
export function simplifyToBudget(contour, targetVerts) {
  if (contour.length <= targetVerts) return contour.slice();
  let lo = 0.1, hi = Math.max(contour.length, 64);
  let best = simplify(contour, lo);
  for (let iter = 0; iter < 24; iter++) {
    const mid = (lo + hi) / 2;
    const s = simplify(contour, mid);
    if (s.length > targetVerts) lo = mid;
    else { best = s; hi = mid; }
    if (hi - lo < 1e-3) break;
  }
  return best;
}

// ---------------------------------------------------------------------------
// 4. Triangulate (ear clipping)

function polygonArea(pts) {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    a += (pts[j].x + pts[i].x) * (pts[j].y - pts[i].y);
  }
  return a / 2;
}

function pointInTriangle(p, a, b, c) {
  const d1 = (p.x - b.x) * (a.y - b.y) - (a.x - b.x) * (p.y - b.y);
  const d2 = (p.x - c.x) * (b.y - c.y) - (b.x - c.x) * (p.y - c.y);
  const d3 = (p.x - a.x) * (c.y - a.y) - (c.x - a.x) * (p.y - a.y);
  const neg = (d1 < 0) || (d2 < 0) || (d3 < 0);
  const pos = (d1 > 0) || (d2 > 0) || (d3 > 0);
  return !(neg && pos);
}

/**
 * Ear-clipping triangulation of a simple polygon.
 * @returns {number[]} flat list of vertex indices, 3 per triangle
 */
export function triangulate(points) {
  const n = points.length;
  if (n < 3) return [];
  // Work counter-clockwise.
  const idx = [...Array(n).keys()];
  if (polygonArea(points) > 0) idx.reverse();

  const tris = [];
  let guard = 0;
  while (idx.length > 3 && guard++ < n * n) {
    let clipped = false;
    for (let i = 0; i < idx.length; i++) {
      const i0 = idx[(i + idx.length - 1) % idx.length];
      const i1 = idx[i];
      const i2 = idx[(i + 1) % idx.length];
      const a = points[i0], b = points[i1], c = points[i2];

      // convex corner?
      if ((b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y) <= 0) continue;

      // no other vertex inside the candidate ear?
      let contains = false;
      for (const k of idx) {
        if (k === i0 || k === i1 || k === i2) continue;
        if (pointInTriangle(points[k], a, b, c)) { contains = true; break; }
      }
      if (contains) continue;

      tris.push(i0, i1, i2);
      idx.splice(i, 1);
      clipped = true;
      break;
    }
    if (!clipped) break; // degenerate polygon — stop rather than loop forever
  }
  if (idx.length === 3) tris.push(idx[0], idx[1], idx[2]);
  return tris;
}

// ---------------------------------------------------------------------------
// 5. Build the mesh

/**
 * Convert a concept image into a mid-poly extruded BufferGeometry.
 *
 * @param {RGBAImage} img
 * @param {{depth?:number, targetTris?:number, size?:number}} [opts]
 * @returns {{geometry: THREE.BufferGeometry, stats: object, palette: number[]}}
 */
export function imageToGeometry(img, opts = {}) {
  const depth = opts.depth ?? 0.35;
  const targetTris = opts.targetTris ?? 600;
  const worldSize = opts.size ?? 1.0;
  const { width: W, height: H } = img;

  const mask = largestBlob(buildMask(img, opts), W, H);
  const raw = traceContour(mask, W, H);
  if (raw.length < 3) throw new Error('img2threejs: no silhouette found in image');

  // Each contour vertex contributes 2 side-wall triangles, and the caps add
  // roughly (n-2) triangles each — so n ≈ targetTris / 4.
  const budget = Math.max(8, Math.floor(targetTris / 4));
  const contour = simplifyToBudget(raw, budget);

  const capIdx = triangulate(contour);

  // Normalise pixel coords into a centred unit-ish shape, preserving aspect.
  const scale = worldSize / Math.max(W, H);
  const toWorld = (p) => ({
    x: (p.x - W / 2) * scale,
    y: (H / 2 - p.y) * scale, // image Y grows downward, world Y grows up
  });
  const pts = contour.map(toWorld);
  const hz = depth / 2;

  const positions = [];
  const uvs = [];
  const pushVert = (x, y, z, u, v) => { positions.push(x, y, z); uvs.push(u, v); };
  const uvOf = (i) => [contour[i].x / (W - 1), 1 - contour[i].y / (H - 1)];

  // Front cap (+z, CCW) and back cap (-z, reversed winding).
  for (let t = 0; t < capIdx.length; t += 3) {
    const [a, b, c] = [capIdx[t], capIdx[t + 1], capIdx[t + 2]];
    for (const i of [a, b, c]) pushVert(pts[i].x, pts[i].y, hz, ...uvOf(i));
    for (const i of [c, b, a]) pushVert(pts[i].x, pts[i].y, -hz, ...uvOf(i));
  }

  // Side walls — a quad per contour edge, as two triangles.
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    const [ua, va] = uvOf(i), [ub, vb] = uvOf(j);
    const A = pts[i], B = pts[j];
    pushVert(A.x, A.y, hz, ua, va);
    pushVert(B.x, B.y, hz, ub, vb);
    pushVert(B.x, B.y, -hz, ub, vb);

    pushVert(A.x, A.y, hz, ua, va);
    pushVert(B.x, B.y, -hz, ub, vb);
    pushVert(A.x, A.y, -hz, ua, va);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  // Non-indexed + computed normals => per-face normals => flat mid-poly look.
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  return {
    geometry,
    palette: samplePalette(img, mask),
    stats: {
      sourcePx: `${W}x${H}`,
      rawContourPoints: raw.length,
      simplifiedPoints: contour.length,
      capTriangles: capIdx.length / 3 * 2,
      wallTriangles: pts.length * 2,
      triangles: positions.length / 9,
      targetTris,
    },
  };
}

/** Dominant colours inside the silhouette, for cel material tinting. */
export function samplePalette(img, mask, count = 3) {
  const { width: W, height: H, data } = img;
  const buckets = new Map();
  for (let p = 0; p < W * H; p++) {
    if (!mask[p]) continue;
    const o = p * 4;
    // Quantize to 5 bits/channel so near-identical shades group together.
    const key = ((data[o] >> 3) << 10) | ((data[o + 1] >> 3) << 5) | (data[o + 2] >> 3);
    buckets.set(key, (buckets.get(key) || 0) + 1);
  }
  return [...buckets.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, count)
    .map(([key]) => {
      const r = ((key >> 10) & 31) << 3, g = ((key >> 5) & 31) << 3, b = (key & 31) << 3;
      return (r << 16) | (g << 8) | b;
    });
}
