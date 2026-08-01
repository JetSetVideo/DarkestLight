// World: climate-driven polygonal island (square/hexagon/octagon/round).
// Pipeline: adversarial macro relief → altitude (sea = 0) → temperature &
// humidity → biome frames → geological deposits → erosion → light terracing →
// ground shaders (grass / sand waves) + matching socle pedestal under the map.
// Also: tides, path wear, day/night + moon, weather machine, fog of war.
import * as THREE from 'three';
import { makeFBM, clamp, lerp, pick } from './util.js';

export const WORLD_SIZE = 160;
export const SEG = 192;
export const WATER_Y = 0; // sea level = altitude 0
export const MAP_SHAPES = { square: 4, hexagon: 6, octagon: 8, round: 24 };

/** Surface terracing only — deep useless layers replaced by the socle. */
const SURFACE_LAYERS = 4;
const V = SEG + 1;

const SOCLE_SCALE = 1.07;   // slightly larger footprint than the map
const SOCLE_TOP = -3.2;     // sits under sea bed / cliffs
const SOCLE_DEPTH = 5.5;    // how far the pedestal drops

// ============================ BIOME FRAMES ============================
// Each biome is a value-frame over altitude (m≈world Y), humidity 0..1,
// temperature 0..1 (−cold … +hot). Used for deposits, flora bias, coloring.
export const BIOMES = {
  ice_desert: {
    id: 0, name: 'Ice desert',
    alt: [0, 14], hum: [0.0, 0.25], temp: [0.0, 0.22],
    deposits: { sand: 0.15, gravel: 0.55, limestone: 0.1, peat: 0, ash: 0 },
    color: 0xdde6ef, pattern: 'ice',
  },
  tundra: {
    id: 1, name: 'Tundra',
    alt: [0, 6], hum: [0.15, 0.45], temp: [0.08, 0.32],
    deposits: { peat: 0.35, silt: 0.4, gravel: 0.25, clay: 0.15 },
    color: 0x8a9a7a, pattern: 'moss',
  },
  boreal: {
    id: 2, name: 'Boreal forest',
    alt: [0.5, 8], hum: [0.35, 0.7], temp: [0.18, 0.42],
    deposits: { loam: 0.55, peat: 0.25, clay: 0.2, silt: 0.2 },
    color: 0x3d6b45, pattern: 'grass',
  },
  temperate_forest: {
    id: 3, name: 'Temperate forest',
    alt: [0.4, 7], hum: [0.4, 0.75], temp: [0.35, 0.62],
    deposits: { loam: 0.7, clay: 0.25, silt: 0.2 },
    color: 0x4f8f3e, pattern: 'grass',
  },
  tropical_forest: {
    id: 4, name: 'Tropical forest',
    alt: [0.3, 6], hum: [0.65, 1.0], temp: [0.7, 1.0],
    deposits: { loam: 0.5, clay: 0.45, silt: 0.3, peat: 0.15 },
    color: 0x2f7a3a, pattern: 'grass',
  },
  swamp: {
    id: 5, name: 'Swamp',
    alt: [-0.5, 2.2], hum: [0.7, 1.0], temp: [0.4, 0.85],
    deposits: { peat: 0.7, clay: 0.5, silt: 0.55, sand: 0.1 },
    color: 0x3a6b48, pattern: 'moss',
  },
  mangrove: {
    id: 6, name: 'Mangrove',
    alt: [-0.3, 1.5], hum: [0.75, 1.0], temp: [0.65, 1.0],
    deposits: { silt: 0.65, clay: 0.4, sand: 0.25, peat: 0.3 },
    color: 0x3f7055, pattern: 'moss',
  },
  desert: {
    id: 7, name: 'Desert',
    alt: [0.2, 8], hum: [0.0, 0.22], temp: [0.65, 1.0],
    deposits: { sand: 0.9, gravel: 0.25, limestone: 0.2, clay: 0.1 },
    color: 0xd8c68a, pattern: 'sand',
  },
  ice_cap: {
    id: 8, name: 'Ice cap / snowfields',
    alt: [8, 16], hum: [0.0, 0.5], temp: [0.0, 0.28],
    deposits: { gravel: 0.4, limestone: 0.15, sand: 0.05 },
    color: 0xe8e8ee, pattern: 'ice',
  },
  plains: {
    id: 9, name: 'Plains',
    alt: [0.4, 4.5], hum: [0.25, 0.55], temp: [0.4, 0.75],
    deposits: { loam: 0.65, silt: 0.35, clay: 0.2, sand: 0.15 },
    color: 0x9aa04e, pattern: 'grass',
  },
  savanna: {
    id: 10, name: 'Savanna',
    alt: [0.5, 5], hum: [0.18, 0.42], temp: [0.6, 0.95],
    deposits: { loam: 0.4, sand: 0.35, clay: 0.25, silt: 0.2 },
    color: 0xb3a06a, pattern: 'grass',
  },
  chaparral: {
    id: 11, name: 'Chaparral / scrub',
    alt: [0.5, 6], hum: [0.2, 0.4], temp: [0.5, 0.8],
    deposits: { clay: 0.35, gravel: 0.3, loam: 0.3, limestone: 0.25 },
    color: 0xa89858, pattern: 'grass',
  },
  hills: {
    id: 12, name: 'Hills',
    alt: [2.5, 7.5], hum: [0.25, 0.65], temp: [0.3, 0.7],
    deposits: { loam: 0.4, gravel: 0.45, limestone: 0.3, clay: 0.2 },
    color: 0x6a9a4a, pattern: 'grass',
  },
  high_mountains: {
    id: 13, name: 'High mountains',
    alt: [6.5, 16], hum: [0.1, 0.55], temp: [0.0, 0.4],
    deposits: { gravel: 0.7, limestone: 0.45, basalt: 0.2, sand: 0.05 },
    color: 0x8d8a80, pattern: 'rock',
  },
  alpine_meadow: {
    id: 14, name: 'Alpine meadow',
    alt: [5, 9], hum: [0.35, 0.7], temp: [0.15, 0.4],
    deposits: { loam: 0.45, silt: 0.3, gravel: 0.35, peat: 0.1 },
    color: 0x7aab6a, pattern: 'grass',
  },
  volcano: {
    id: 15, name: 'Volcano',
    alt: [3, 16], hum: [0.05, 0.45], temp: [0.55, 1.0],
    deposits: { basalt: 0.85, ash: 0.75, gravel: 0.4, sand: 0.15 },
    color: 0x4a4038, pattern: 'rock',
  },
  shore: {
    id: 16, name: 'Shore / beach',
    alt: [-0.2, 1.2], hum: [0.3, 0.9], temp: [0.25, 0.95],
    deposits: { sand: 0.85, silt: 0.3, clay: 0.15, gravel: 0.2 },
    color: 0xc4b183, pattern: 'sand',
  },
  seabed: {
    id: 17, name: 'Seabed',
    alt: [-8, -0.15], hum: [0.8, 1.0], temp: [0.2, 0.8],
    deposits: { silt: 0.6, sand: 0.4, clay: 0.35, limestone: 0.15 },
    color: 0x3b5b46, pattern: 'none',
  },
};

export const BIOME_KEYS = Object.keys(BIOMES);
const BIOME_BY_ID = BIOME_KEYS.map(k => BIOMES[k]);

function scoreBiome(key, alt, hum, temp) {
  const b = BIOMES[key];
  const inR = (v, [a, c]) => {
    if (v < a) return 1 - (a - v) / Math.max(0.5, c - a + 0.5);
    if (v > c) return 1 - (v - c) / Math.max(0.5, c - a + 0.5);
    return 1;
  };
  // soft membership — adversarial: nearby biomes compete, winner takes cell
  return inR(alt, b.alt) * inR(hum, b.hum) * inR(temp, b.temp);
}

function classifyBiome(alt, hum, temp, volcanic) {
  if (alt < WATER_Y - 0.15) return 'seabed';
  if (volcanic > 0.62 && alt > 2.5) return 'volcano';
  if (alt < WATER_Y + 1.1 && alt > WATER_Y - 0.2 && (hum > 0.35 || Math.abs(alt) < 0.6)) {
    if (hum > 0.75 && temp > 0.65) return 'mangrove';
    if (alt < WATER_Y + 0.85) return 'shore';
  }
  let best = 'plains', bestS = -1;
  for (const key of BIOME_KEYS) {
    if (key === 'seabed' || key === 'shore' || key === 'volcano') continue;
    const s = scoreBiome(key, alt, hum, temp);
    if (s > bestS) { bestS = s; best = key; }
  }
  return best;
}

// ============================ GROUND SHADER ============================
// Ground patterns injected into MeshLambertMaterial via onBeforeCompile.
// Uses a custom varying (Lambert may not expose vWorldPosition).
const GROUND_FRAG_PATCH = /* glsl */`
  {
    float green = diffuseColor.g - max(diffuseColor.r, diffuseColor.b) * 0.55;
    float sandY = diffuseColor.r * 0.45 + diffuseColor.g * 0.4 - diffuseColor.b * 0.5;
    vec3 wp = vDlWorld;
    if (green > 0.04 && wp.y > 0.15) {
      float blades = fract(sin(dot(wp.xz * 9.0, vec2(127.1, 311.7))) * 43758.5453);
      float sway = sin(wp.x * 14.0 + wp.z * 11.0 + uTime * 1.8) * 0.5 + 0.5;
      float gPat = mix(blades, sway, 0.35);
      diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.88, 1.12, 0.82), clamp(green * 2.2, 0.0, 0.55) * gPat);
    }
    if (sandY > 0.12 && green < 0.08 && wp.y > -0.5 && wp.y < 4.0) {
      float rip = sin(dot(wp.xz, vec2(1.7, 0.9)) * 3.2 + uTime * 0.35)
                * sin(dot(wp.xz, vec2(-0.6, 1.4)) * 5.5 + uTime * 0.2);
      rip = rip * 0.5 + 0.5;
      diffuseColor.rgb = mix(diffuseColor.rgb * 0.88, diffuseColor.rgb * 1.12, rip * clamp(sandY * 1.8, 0.0, 0.7));
    }
  }
`;

const SOCLE_VERT = /* glsl */`
varying vec3 vPos;
varying vec3 vNormalW;
void main() {
  vPos = position;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const SOCLE_FRAG = /* glsl */`
uniform float uTime;
uniform vec3 uSunDir;
varying vec3 vPos;
varying vec3 vNormalW;

float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}

void main() {
  vec3 base = vec3(0.18, 0.20, 0.26);
  vec3 vein = vec3(0.32, 0.36, 0.44);
  float strata = sin(vPos.y * 2.4 + noise(vPos.xz * 0.35) * 4.0);
  float marble = noise(vPos.xz * 1.1 + vPos.y * 0.2);
  float pat = mix(strata * 0.5 + 0.5, marble, 0.55);
  pat += 0.04 * sin(uTime * 0.4 + vPos.x * 0.3);
  vec3 col = mix(base, vein, clamp(pat, 0.0, 1.0));
  float edge = smoothstep(0.35, 0.95, abs(vNormalW.y));
  col = mix(col * 0.75, col * 1.15, edge);
  float ndl = max(0.15, dot(normalize(vNormalW), normalize(uSunDir)));
  gl_FragColor = vec4(col * (0.35 + ndl * 0.75), 1.0);
}
`;

// ============================ TERRAIN ============================
export class Terrain {
  constructor(scene, seed, shapeName) {
    this.scene = scene;
    this.seed = seed >>> 0;
    this.shapeName = shapeName || pick(Math.random, Object.keys(MAP_SHAPES));
    this.heights = new Float32Array(V * V);      // altitude; sea = 0
    this.humidity = new Float32Array(V * V);     // 0..1
    this.temperature = new Float32Array(V * V);  // 0..1 cold→hot
    this.biome = new Uint8Array(V * V);
    this.moist = this.humidity; // API compat (flora / AI)
    this.rock = new Float32Array(V * V);
    this.sand = new Float32Array(V * V);
    this.clay = new Float32Array(V * V);
    this.loam = new Float32Array(V * V);
    this.silt = new Float32Array(V * V);
    this.peat = new Float32Array(V * V);
    this.gravel = new Float32Array(V * V);
    this.basalt = new Float32Array(V * V);
    this.limestone = new Float32Array(V * V);
    this.ash = new Float32Array(V * V);
    this.volcanic = new Float32Array(V * V);
    this.fog = new Float32Array(V * V);
    this.wear = new Float32Array(V * V);
    this.dirt = new Float32Array(V * V);
    this.leveled = new Float32Array(V * V);
    this.fogEnabled = true;
    this.seasonTint = { snow: 0, autumn: 0 };
    this._colDirty = true;
    this.time = 0;

    this._generate(seed);
    this._buildMeshes(scene);
    this.recolor();
  }

  /** Regular N-gon signed distance: 0 at center, 1 at edge. */
  _polyDist(x, z, sides, rot) {
    let d = 0;
    for (let i = 0; i < sides; i++) {
      const a = rot + (i / sides) * Math.PI * 2;
      d = Math.max(d, x * Math.cos(a) + z * Math.sin(a));
    }
    return d / (WORLD_SIZE / 2);
  }

  _generate(seed) {
    const fbm = makeFBM(seed, 5);
    const fbmRid = makeFBM(seed + 401, 5);   // ridge adversary
    const fbmVal = makeFBM(seed + 811, 4);   // valley adversary
    const fbmHum = makeFBM(seed + 999, 4);
    const fbmDry = makeFBM(seed + 1301, 3);  // arid front adversary
    const fbmTemp = makeFBM(seed + 1717, 3);
    const fbmVol = makeFBM(seed + 2203, 3);
    const fbmGeo = makeFBM(seed + 4242, 4);
    const fbmGeo2 = makeFBM(seed + 5555, 3);
    const fbmShaft = makeFBM(seed + 7777, 2);
    const sides = MAP_SHAPES[this.shapeName] || 8;
    this._sides = sides;
    this._rot = ((seed % 100) / 100) * Math.PI;
    const rot = this._rot;

    // Prevailing wind direction (orographic humidity)
    const windAng = ((seed * 17) % 360) * Math.PI / 180;
    const windX = Math.cos(windAng), windZ = Math.sin(windAng);

    // Volcano seed point (adversarial hot spot vs glacial north)
    const volX = ((seed % 50) - 25) * 1.4;
    const volZ = ((Math.floor(seed / 50) % 50) - 25) * 1.4;

    for (let j = 0; j < V; j++) {
      for (let i = 0; i < V; i++) {
        const x = (i / SEG - 0.5) * WORLD_SIZE;
        const z = (j / SEG - 0.5) * WORLD_SIZE;
        const k = j * V + i;
        const d = this._polyDist(x, z, sides, rot);

        // —— Step 1: adversarial macro relief ——
        // Keep island mostly above sea (altitude 0); valleys/rivers carve locally.
        const plate = fbm(i * 0.038, j * 0.038);
        const ridge = fbmRid(i * 0.055, j * 0.055);
        const valley = fbmVal(i * 0.07, j * 0.07);
        // Base uplift similar to prior working range (~−3.5…10), then adversaries sculpt
        let alt = plate * 12.5 - 2.2;
        alt += Math.pow(ridge, 1.55) * 4.5;                 // ridges push up
        alt -= Math.pow(valley, 2.0) * 2.8 * (1 - ridge * 0.35); // valleys cut, weakly

        // Island falloff (closed landmass)
        alt -= Math.pow(Math.max(0, d - 0.68) * 3.4, 2) * 10;

        // River carved as valley adversary along a sine corridor
        const riverX = Math.sin(z * 0.055) * 10 + (fbm(z * 0.02, 2.2) - 0.5) * 4;
        const rd = Math.abs(x - riverX);
        if (rd < 7) alt = Math.min(alt, lerp(-2.4, alt, Math.pow(rd / 7, 1.6)));

        // Volcanic cone adversary (local radial uplift + ash later)
        const vDist = Math.hypot(x - volX, z - volZ);
        const volCore = clamp(1 - vDist / 28, 0, 1);
        const volN = fbmVol(i * 0.08, j * 0.08);
        const volcanic = Math.pow(volCore, 1.8) * (0.55 + volN * 0.45);
        this.volcanic[k] = volcanic;
        if (volcanic > 0.35) alt += volcanic * volcanic * 9;

        // Rare shafts / sinkholes
        const shaftN = fbmShaft(i * 0.2, j * 0.2);
        if (shaftN > 0.92 && alt > WATER_Y + 1 && rd > 10 && volcanic < 0.4)
          alt -= 4.5 * (shaftN - 0.92) * 12;

        this.heights[k] = alt; // altitude; sea level = 0

        // —— Step 2: temperature (°C proxy 0..1) ——
        // Latitude-like (north colder via z), lapse rate with altitude, volcanic heat
        const lat = clamp(0.5 - z / WORLD_SIZE, 0, 1); // north of map cooler
        const lapse = clamp(alt / 14, 0, 1);            // ~6.5°C/km abstracted
        const tNoise = fbmTemp(i * 0.04, j * 0.04);
        let temp = clamp(
          0.22 + lat * 0.55 + tNoise * 0.22 - lapse * 0.55 + volcanic * 0.35,
          0, 1,
        );
        this.temperature[k] = temp;

        // —— Step 3: humidity (adversarial wet vs dry fronts) ——
        const moistBase = fbmHum(i * 0.055, j * 0.055);
        const dryFront = fbmDry(i * 0.09 + 3, j * 0.09);
        // Orographic: windward of ridges wetter (project gradient onto wind)
        const gx = (ridge - fbmRid((i - 1) * 0.055, j * 0.055));
        const gz = (ridge - fbmRid(i * 0.055, (j - 1) * 0.055));
        const orographic = clamp(-(gx * windX + gz * windZ) * 2.2, -0.25, 0.35);
        // River / shore moisture boost; desert dry-front adversary
        const riverBoost = rd < 12 ? (1 - rd / 12) * 0.35 : 0;
        const shoreBoost = alt < 1.5 && alt > -0.5 ? 0.2 : 0;
        let hum = moistBase * 0.7 + orographic + riverBoost + shoreBoost
          - dryFront * dryFront * 0.55 * (1 - moistBase)
          + volcanic * -0.15; // ash slopes run dry on leeward
        hum = clamp(hum, 0, 1);
        // Cold air holds less moisture
        hum *= lerp(0.55, 1, temp * 0.5 + 0.5);
        this.humidity[k] = hum;

        // —— Step 4: biome classification ——
        const biomeKey = classifyBiome(alt, hum, temp, volcanic);
        this.biome[k] = BIOMES[biomeKey].id;

        // —— Step 5: geological deposits (real-world-inspired equations) ——
        this._depositCell(k, biomeKey, alt, hum, temp, volcanic, fbmGeo, fbmGeo2, i, j, rd);
      }
    }

    this.erode(4);
    this.hydraulicPass(2);
    this.terrace();
  }

  /**
   * Deposit strengths from biome frames × local equations.
   * Inspired by: alluvial silt near rivers, peat in anoxic wetlands,
   * aeolian sand in arid basins, limestone on mid-alt shelves,
   * basalt/ash around volcanoes, gravel on steep slopes.
   */
  _depositCell(k, biomeKey, alt, hum, temp, volcanic, fbmGeo, fbmGeo2, i, j, rd) {
    const frame = BIOMES[biomeKey].deposits || {};
    const n1 = fbmGeo(i * 0.1, j * 0.1);
    const n2 = fbmGeo2(i * 0.13 + 5, j * 0.13);
    const mul = (base) => clamp((base || 0) * (0.55 + n1 * 0.9), 0, 1);

    // Alluvial silt / clay in floodplains
    const alluvial = rd < 14 ? Math.pow(1 - rd / 14, 1.4) : 0;
    // Aeolian sand: dry + warm + low-mid altitude
    const aeolian = clamp((1 - hum) * temp * clamp(1 - Math.abs(alt - 2) / 5, 0, 1), 0, 1);
    // Peat: waterlogged wetlands
    const peatEnv = clamp(hum * 1.2 - 0.4, 0, 1) * clamp(1.2 - Math.abs(alt - 0.5), 0, 1);
    // Limestone shelves (karst-ish mid altitude)
    const limeEnv = clamp(1 - Math.abs(alt - 4.5) / 4, 0, 1) * (0.4 + hum * 0.3);
    // Colluvial gravel on high ground (noise stand-in for slope)
    const gravelEnv = clamp((alt - 3) / 8, 0, 1) * (0.35 + n1 * 0.5);

    this.sand[k] = clamp(mul(frame.sand) * 0.7 + aeolian * 0.85 + (alt < 1.2 ? 0.25 : 0) * n2, 0, 1);
    this.clay[k] = clamp(mul(frame.clay) * 0.75 + alluvial * 0.5 * (0.5 + hum) + (hum > 0.6 ? n2 * 0.3 : 0), 0, 1);
    this.silt[k] = clamp(mul(frame.silt) * 0.7 + alluvial * 0.8, 0, 1);
    this.loam[k] = clamp(mul(frame.loam) * (0.5 + hum * 0.5) * (1 - aeolian * 0.6), 0, 1);
    this.peat[k] = clamp(mul(frame.peat) * 0.6 + peatEnv * 0.9, 0, 1);
    this.gravel[k] = clamp(mul(frame.gravel) * 0.65 + gravelEnv * 0.8, 0, 1);
    this.limestone[k] = clamp(mul(frame.limestone) * 0.7 + limeEnv * 0.75 * (1 - volcanic), 0, 1);
    this.basalt[k] = clamp(mul(frame.basalt) * 0.5 + volcanic * volcanic * 1.1, 0, 1);
    this.ash[k] = clamp(mul(frame.ash) * 0.4 + Math.pow(volcanic, 1.5) * 0.95 * (0.5 + n2), 0, 1);
    // rock = gravel + basalt + limestone composite (legacy API)
    this.rock[k] = clamp(this.gravel[k] * 0.5 + this.basalt[k] * 0.7 + this.limestone[k] * 0.4, 0, 1);
  }

  erode(passes) {
    const talus = 0.78;
    for (let p = 0; p < passes; p++) {
      for (let j = 1; j < V - 1; j++) {
        for (let i = 1; i < V - 1; i++) {
          const k = j * V + i;
          const h = this.heights[k];
          let low = k, lowH = h;
          for (const nk of [k - 1, k + 1, k - V, k + V]) {
            if (this.heights[nk] < lowH) { lowH = this.heights[nk]; low = nk; }
          }
          const diff = h - lowH;
          // Wet cells erode faster (chemical/physical weathering proxy)
          const wetMul = 0.25 + this.humidity[k] * 0.2;
          if (diff > talus) {
            const move = (diff - talus) * wetMul;
            this.heights[k] -= move;
            this.heights[low] += move;
            // sediment: move silt/clay downhill
            const sed = move * 0.08;
            this.silt[low] = Math.min(1, this.silt[low] + sed);
            this.clay[low] = Math.min(1, this.clay[low] + sed * 0.6);
          }
        }
      }
    }
  }

  /** Lightweight hydraulic: rainfall drains along humidity×slope, deposits silt. */
  hydraulicPass(passes) {
    for (let p = 0; p < passes; p++) {
      for (let j = 1; j < V - 1; j++) {
        for (let i = 1; i < V - 1; i++) {
          const k = j * V + i;
          if (this.humidity[k] < 0.4) continue;
          const h = this.heights[k];
          let low = k, lowH = h;
          for (const nk of [k - 1, k + 1, k - V, k + V]) {
            if (this.heights[nk] < lowH) { lowH = this.heights[nk]; low = nk; }
          }
          if (h - lowH > 0.15) {
            const flow = (h - lowH) * 0.04 * this.humidity[k];
            this.heights[k] -= flow;
            this.heights[low] += flow * 0.85;
            this.silt[low] = Math.min(1, this.silt[low] + flow * 0.15);
          }
        }
      }
    }
  }

  /** Surface-only terracing — fewer bands; deep stack replaced by socle. */
  terrace() {
    let min = 99, max = -99;
    for (const h of this.heights) {
      if (h < WATER_Y - 0.2) continue; // ignore seabed for step sizing
      if (h < min) min = h;
      if (h > max) max = h;
    }
    if (max <= min) return;
    const step = (max - min) / SURFACE_LAYERS;
    for (let k = 0; k < this.heights.length; k++) {
      const h = this.heights[k];
      if (h < WATER_Y - 0.25) continue;
      const band = Math.floor((h - min) / step);
      const frac = ((h - min) - band * step) / step;
      const bio = BIOME_BY_ID[this.biome[k]];
      const sharp = bio?.pattern === 'rock' ? 5.5
        : (this.humidity[k] > 0.6 ? 2.2 : 3.5);
      const shaped = clamp((frac - 0.5) * sharp + 0.5, 0, 1);
      this.heights[k] = lerp(h, min + (band + shaped) * step, 0.55);
    }
  }

  _buildMeshes(scene) {
    const geo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, SEG, SEG);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    for (let k = 0; k < pos.count; k++) pos.setY(k, this.heights[k]);
    geo.computeVertexNormals();
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(pos.count * 3), 3));
    this.geo = geo;

    this.groundUniforms = {
      uTime: { value: 0 },
      uSunDir: { value: new THREE.Vector3(0.4, 0.85, 0.3).normalize() },
    };
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    // Inject grass / sand pattern shaders into Lambert (keeps lighting + visibility)
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this.groundUniforms.uTime;
      shader.vertexShader = 'varying vec3 vDlWorld;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace(
        '#include <project_vertex>',
        `#include <project_vertex>
         vDlWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
      );
      shader.fragmentShader = 'varying vec3 vDlWorld;\nuniform float uTime;\n' + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>\n${GROUND_FRAG_PATCH}`,
      );
    };
    mat.customProgramCacheKey = () => 'dl-ground-v3';
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.receiveShadow = true;
    this.mesh.name = 'terrain';
    scene.add(this.mesh);

    // Water
    const waterGeo = new THREE.PlaneGeometry(WORLD_SIZE * 1.45, WORLD_SIZE * 1.45);
    waterGeo.rotateX(-Math.PI / 2);
    this.water = new THREE.Mesh(waterGeo, new THREE.MeshLambertMaterial({
      color: 0x2a6f9e, transparent: true, opacity: 0.82,
    }));
    this.water.position.y = WATER_Y;
    scene.add(this.water);

    // Socle — same polygonal plan as the map, slightly larger, closes the underside
    this.socle = this._buildSocle();
    scene.add(this.socle);
  }

  _buildSocle() {
    const sides = this._sides;
    const rot = this._rot;
    const R = (WORLD_SIZE / 2) * SOCLE_SCALE;
    const topY = SOCLE_TOP;
    const botY = SOCLE_TOP - SOCLE_DEPTH;

    // N-gon prism: top + bottom + side quads
    const top = [], bot = [];
    for (let i = 0; i < sides; i++) {
      const a = rot + (i / sides) * Math.PI * 2 + Math.PI / sides;
      // For regular polygon inscribed approx — use same support function inverse
      // Radius to vertex for circumradius matching polyDist≈1 at R
      const vx = Math.cos(a) * R * 1.05;
      const vz = Math.sin(a) * R * 1.05;
      top.push(vx, topY, vz);
      bot.push(vx, botY, vz);
    }

    const positions = [];
    const normals = [];
    const pushTri = (ax, ay, az, bx, by, bz, cx, cy, cz, nx, ny, nz) => {
      positions.push(ax, ay, az, bx, by, bz, cx, cy, cz);
      for (let t = 0; t < 3; t++) normals.push(nx, ny, nz);
    };

    // Top face (fan)
    for (let i = 1; i < sides - 1; i++) {
      pushTri(
        top[0], top[1], top[2],
        top[i * 3], top[i * 3 + 1], top[i * 3 + 2],
        top[(i + 1) * 3], top[(i + 1) * 3 + 1], top[(i + 1) * 3 + 2],
        0, 1, 0,
      );
    }
    // Bottom face (fan, flipped)
    for (let i = 1; i < sides - 1; i++) {
      pushTri(
        bot[0], bot[1], bot[2],
        bot[(i + 1) * 3], bot[(i + 1) * 3 + 1], bot[(i + 1) * 3 + 2],
        bot[i * 3], bot[i * 3 + 1], bot[i * 3 + 2],
        0, -1, 0,
      );
    }
    // Sides
    for (let i = 0; i < sides; i++) {
      const j = (i + 1) % sides;
      const ax = top[i * 3], ay = top[i * 3 + 1], az = top[i * 3 + 2];
      const bx = top[j * 3], by = top[j * 3 + 1], bz = top[j * 3 + 2];
      const cx = bot[j * 3], cy = bot[j * 3 + 1], cz = bot[j * 3 + 2];
      const dx = bot[i * 3], dy = bot[i * 3 + 1], dz = bot[i * 3 + 2];
      const e1x = bx - ax, e1z = bz - az;
      const nx = e1z, ny = 0, nz = -e1x;
      const len = Math.hypot(nx, nz) || 1;
      pushTri(ax, ay, az, bx, by, bz, cx, cy, cz, nx / len, 0, nz / len);
      pushTri(ax, ay, az, cx, cy, cz, dx, dy, dz, nx / len, 0, nz / len);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geo.computeVertexNormals();

    this.socleUniforms = {
      uTime: { value: 0 },
      uSunDir: { value: new THREE.Vector3(0.4, 0.85, 0.3).normalize() },
    };
    const mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      vertexShader: SOCLE_VERT,
      fragmentShader: SOCLE_FRAG,
      uniforms: this.socleUniforms,
      flatShading: true,
      side: THREE.DoubleSide,
    }));
    mesh.name = 'socle';
    mesh.receiveShadow = true;
    return mesh;
  }

  idx(x, z) {
    const i = clamp(Math.round((x / WORLD_SIZE + 0.5) * SEG), 0, SEG);
    const j = clamp(Math.round((z / WORLD_SIZE + 0.5) * SEG), 0, SEG);
    return j * V + i;
  }

  getAltitude(x, z) { return this.getHeight(x, z); } // sea = 0
  getHumidity(x, z) { return this.humidity[this.idx(x, z)]; }
  getTemperature(x, z) { return this.temperature[this.idx(x, z)]; }
  getBiomeKey(x, z) { return BIOME_BY_ID[this.biome[this.idx(x, z)]]?.name || 'plains'; }
  getBiomeId(x, z) { return this.biome[this.idx(x, z)]; }

  getHeight(x, z) {
    const fi = clamp((x / WORLD_SIZE + 0.5) * SEG, 0, SEG - 0.001);
    const fj = clamp((z / WORLD_SIZE + 0.5) * SEG, 0, SEG - 0.001);
    const i = Math.floor(fi), j = Math.floor(fj);
    const fx = fi - i, fz = fj - j;
    const h00 = this.heights[j * V + i], h10 = this.heights[j * V + i + 1];
    const h01 = this.heights[(j + 1) * V + i], h11 = this.heights[(j + 1) * V + i + 1];
    return lerp(lerp(h00, h10, fx), lerp(h01, h11, fx), fz);
  }

  isWater(x, z) { return this.getHeight(x, z) < WATER_Y - 0.15; }

  isShaft(x, z, radius = 2.5) {
    const center = this.getHeight(x, z);
    if (center < WATER_Y + 0.2) return false;
    let maxN = center;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const h = this.getHeight(x + Math.cos(a) * radius, z + Math.sin(a) * radius);
      if (h > maxN) maxN = h;
    }
    return maxN - center > 2.8;
  }

  maxSlope(x, z, radius) {
    const c = this.getHeight(x, z);
    let worst = 0;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const h = this.getHeight(x + Math.cos(a) * radius, z + Math.sin(a) * radius);
      worst = Math.max(worst, Math.abs(h - c) / radius);
    }
    return worst;
  }

  levelFlat(x, z, radius) {
    const pad = radius * 1.25;
    const iC = (x / WORLD_SIZE + 0.5) * SEG;
    const jC = (z / WORLD_SIZE + 0.5) * SEG;
    const r = pad / (WORLD_SIZE / SEG);
    const target = this.getHeight(x, z);
    const pos = this.geo.attributes.position;
    for (let j = Math.max(0, Math.floor(jC - r)); j <= Math.min(SEG, Math.ceil(jC + r)); j++) {
      for (let i = Math.max(0, Math.floor(iC - r)); i <= Math.min(SEG, Math.ceil(iC + r)); i++) {
        const d = Math.hypot(i - iC, j - jC);
        if (d > r) continue;
        const k = j * V + i;
        const fall = 1 - d / r;
        const blend = fall * fall;
        this.heights[k] = lerp(this.heights[k], target, blend * 0.92);
        if (this.heights[k] < WATER_Y + 0.35) this.heights[k] = WATER_Y + 0.35;
        pos.setY(k, this.heights[k]);
        this.leveled[k] = Math.min(1, this.leveled[k] + blend);
        this.dirt[k] = Math.min(0.95, this.dirt[k] + blend * 0.85);
      }
    }
    pos.needsUpdate = true;
    this.geo.computeVertexNormals();
    this._colDirty = true;
  }

  deform(x, z, radius, delta) {
    const iC = (x / WORLD_SIZE + 0.5) * SEG;
    const jC = (z / WORLD_SIZE + 0.5) * SEG;
    const r = radius / (WORLD_SIZE / SEG);
    const pos = this.geo.attributes.position;
    for (let j = Math.max(0, Math.floor(jC - r)); j <= Math.min(SEG, Math.ceil(jC + r)); j++) {
      for (let i = Math.max(0, Math.floor(iC - r)); i <= Math.min(SEG, Math.ceil(iC + r)); i++) {
        const d = Math.hypot(i - iC, j - jC);
        if (d > r) continue;
        const fall = Math.cos((d / r) * Math.PI * 0.5);
        const k = j * V + i;
        this.heights[k] = clamp(this.heights[k] + delta * fall, -5, 16);
        pos.setY(k, this.heights[k]);
      }
    }
    pos.needsUpdate = true;
    this.geo.computeVertexNormals();
    this._colDirty = true;
  }

  addWear(x, z, amt) {
    const k = this.idx(x, z);
    this.wear[k] = Math.min(1, this.wear[k] + amt);
    this._colDirty = true;
  }

  stampDirt(x, z, radius, amt = 0.8) {
    const iC = (x / WORLD_SIZE + 0.5) * SEG;
    const jC = (z / WORLD_SIZE + 0.5) * SEG;
    const r = radius / (WORLD_SIZE / SEG);
    for (let j = Math.max(0, Math.floor(jC - r)); j <= Math.min(SEG, Math.ceil(jC + r)); j++) {
      for (let i = Math.max(0, Math.floor(iC - r)); i <= Math.min(SEG, Math.ceil(iC + r)); i++) {
        const d = Math.hypot(i - iC, j - jC);
        if (d > r) continue;
        const k = j * V + i;
        this.dirt[k] = Math.min(0.9, this.dirt[k] + amt * (1 - d / r));
      }
    }
    this._colDirty = true;
  }

  fogAt(x, z) { return this.fogEnabled ? this.fog[this.idx(x, z)] : 1; }

  clearFogFrame() {
    if (!this.fogEnabled) return;
    for (let k = 0; k < this.fog.length; k++) if (this.fog[k] > 0.56) this.fog[k] = 0.55;
  }

  revealFog(x, z, radius) {
    if (!this.fogEnabled) return;
    const iC = (x / WORLD_SIZE + 0.5) * SEG;
    const jC = (z / WORLD_SIZE + 0.5) * SEG;
    const r = radius / (WORLD_SIZE / SEG);
    for (let j = Math.max(0, Math.floor(jC - r)); j <= Math.min(SEG, Math.ceil(jC + r)); j++) {
      for (let i = Math.max(0, Math.floor(iC - r)); i <= Math.min(SEG, Math.ceil(iC + r)); i++) {
        if (Math.hypot(i - iC, j - jC) <= r) this.fog[j * V + i] = 1;
      }
    }
    this._colDirty = true;
  }

  setSeasonTint(snow, autumn) {
    if (Math.abs(snow - this.seasonTint.snow) > 0.02 || Math.abs(autumn - this.seasonTint.autumn) > 0.02) {
      this.seasonTint = { snow, autumn };
      this._colDirty = true;
    }
  }

  recolor() {
    const col = this.geo.attributes.color;
    const { snow, autumn } = this.seasonTint;
    const c = new THREE.Color();
    const dirtCol = new THREE.Color(0x8a6b45);
    const levelCol = new THREE.Color(0x9a8060);
    const ashCol = new THREE.Color(0x5a5450);
    const peatCol = new THREE.Color(0x3a4a32);
    for (let k = 0; k < col.count; k++) {
      const h = this.heights[k];
      const bio = BIOME_BY_ID[this.biome[k]] || BIOMES.plains;
      c.setHex(bio.color);

      // Deposit overlays (geological expression on surface)
      if (this.ash[k] > 0.45) c.lerp(ashCol, this.ash[k] * 0.65);
      if (this.peat[k] > 0.5 && h < 2.5) c.lerp(peatCol, this.peat[k] * 0.45);
      if (this.sand[k] > 0.55 && h < 3.5) c.lerp(new THREE.Color(0xd8c68a), this.sand[k] * 0.5);
      if (this.clay[k] > 0.65 && this.humidity[k] < 0.45) c.lerp(new THREE.Color(0xa87850), 0.4);
      if (this.basalt[k] > 0.55) c.lerp(new THREE.Color(0x3a3835), this.basalt[k] * 0.55);
      if (this.limestone[k] > 0.55 && h > 2) c.lerp(new THREE.Color(0xc4bca8), this.limestone[k] * 0.4);
      if (this.gravel[k] > 0.6) c.lerp(new THREE.Color(0x9a9484), 0.35);

      // Shore / seabed absolute bands
      if (h < WATER_Y - 0.4) c.setHex(0x3b5b46);
      else if (h < WATER_Y + 0.35) c.lerp(new THREE.Color(0xc4b183), 0.85);

      if (autumn > 0 && (bio.pattern === 'grass' || bio.pattern === 'moss'))
        c.lerp(new THREE.Color(0xb5793a), autumn * 0.5);
      if (this.leveled[k] > 0.05) c.lerp(levelCol, this.leveled[k] * 0.7);
      if (h > WATER_Y + 0.35) {
        const w = clamp(this.wear[k] + this.dirt[k], 0, 0.85);
        if (w > 0.02) c.lerp(dirtCol, w);
      }
      if (snow > 0 && h > WATER_Y + 0.5) c.lerp(new THREE.Color(0xe9edf2), snow * 0.7);
      const f = this.fogEnabled ? 0.06 + this.fog[k] * 0.94 : 1;
      col.setXYZ(k, c.r * f, c.g * f, c.b * f);
    }
    col.needsUpdate = true;
    this._colDirty = false;
  }

  update(dt, sunDir) {
    this.time += dt;
    this.water.position.y = WATER_Y + Math.sin(this.time * 0.06) * 0.22;
    if (this.groundUniforms) this.groundUniforms.uTime.value = this.time;
    if (this.socleUniforms) {
      this.socleUniforms.uTime.value = this.time;
      if (sunDir) this.socleUniforms.uSunDir.value.copy(sunDir).normalize();
    }
    this._wearDecay = (this._wearDecay || 0) + dt;
    if (this._wearDecay > 3) {
      this._wearDecay = 0;
      for (let k = 0; k < this.wear.length; k++) if (this.wear[k] > 0) this.wear[k] *= 0.94;
      this._colDirty = true;
    }
    if (this._colDirty) this.recolor();
  }
}

// ============================ SKY / CYCLES / WEATHER ============================
export const SEASONS = ['Spring', 'Summer', 'Autumn', 'Winter'];
const DAY_LEN = 60;
const SEASON_DAYS = 4;

export const WEATHER_META = {
  sunny:    { icon: '☀️',  label: 'Sunny' },
  cloudy:   { icon: '☁️',  label: 'Cloudy' },
  rain:     { icon: '🌧️', label: 'Rain' },
  storm:    { icon: '⛈️', label: 'Storm' },
  snow:     { icon: '🌨️', label: 'Snow' },
  blizzard: { icon: '❄️',  label: 'Blizzard' },
  heatwave: { icon: '🌡️', label: 'Heatwave' },
};

const WEATHER_TABLE = [
  /* spring */ [['sunny', 3], ['cloudy', 3], ['rain', 3], ['storm', 1]],
  /* summer */ [['sunny', 4], ['heatwave', 2.5], ['cloudy', 2], ['rain', 1], ['storm', 0.5]],
  /* autumn */ [['cloudy', 3.5], ['rain', 3], ['sunny', 2], ['storm', 1.5]],
  /* winter */ [['snow', 3.5], ['cloudy', 2.5], ['sunny', 2.5], ['blizzard', 1.5]],
];

export class Cycles {
  constructor(scene, seed) {
    this.scene = scene;
    this.time = DAY_LEN * 0.3;
    this.weather = 'sunny';
    this.weatherTimer = 20;
    this.wind = 0.15;
    this.windAngle = 0;
    this._seed = seed;
    this._noise = makeFBM(seed + 5, 2);

    this.sun = new THREE.DirectionalLight(0xfff3d8, 2.6);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const c = this.sun.shadow.camera;
    c.left = -95; c.right = 95; c.top = 95; c.bottom = -95; c.far = 400;
    scene.add(this.sun, this.sun.target);

    this.ambient = new THREE.AmbientLight(0x8899bb, 0.9);
    this.hemi = new THREE.HemisphereLight(0xbcd8ff, 0x3a4530, 0.55);
    scene.add(this.ambient, this.hemi);

    scene.fog = new THREE.Fog(0x0d0f14, 90, 260);

    const N = 1600;
    const pts = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      pts[i * 3] = (Math.random() - 0.5) * WORLD_SIZE;
      pts[i * 3 + 1] = Math.random() * 32;
      pts[i * 3 + 2] = (Math.random() - 0.5) * WORLD_SIZE;
    }
    this.rainGeo = new THREE.BufferGeometry();
    this.rainGeo.setAttribute('position', new THREE.BufferAttribute(pts, 3));
    this.rain = new THREE.Points(this.rainGeo, new THREE.PointsMaterial({
      color: 0x9db8d8, size: 0.32, transparent: true, opacity: 0.6,
    }));
    this.rain.visible = false;
    scene.add(this.rain);

    const M = 1100;
    const spts = new Float32Array(M * 3);
    for (let i = 0; i < M; i++) {
      spts[i * 3] = (Math.random() - 0.5) * WORLD_SIZE;
      spts[i * 3 + 1] = Math.random() * 28;
      spts[i * 3 + 2] = (Math.random() - 0.5) * WORLD_SIZE;
    }
    this.snowGeo = new THREE.BufferGeometry();
    this.snowGeo.setAttribute('position', new THREE.BufferAttribute(spts, 3));
    this.snow = new THREE.Points(this.snowGeo, new THREE.PointsMaterial({
      color: 0xf2f5fa, size: 0.34, transparent: true, opacity: 0.85,
    }));
    this.snow.visible = false;
    scene.add(this.snow);

    // Visible sinusoidal wind lines (Equilinox / B&W inspired)
    const WL = 48;
    this._windSegs = 28;
    this.windLines = [];
    for (let i = 0; i < WL; i++) {
      const pts = [];
      for (let s = 0; s <= this._windSegs; s++) pts.push(new THREE.Vector3());
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0.22,
      }));
      line.userData.phase = Math.random() * Math.PI * 2;
      line.userData.y0 = 4 + Math.random() * 14;
      line.userData.z0 = (Math.random() - 0.5) * WORLD_SIZE * 0.9;
      line.userData.x0 = (Math.random() - 0.5) * WORLD_SIZE * 0.9;
      scene.add(line);
      this.windLines.push(line);
    }

    this.particlesEnabled = true;
  }

  get day() { return Math.floor(this.time / DAY_LEN); }
  get seasonIndex() { return Math.floor(this.day / SEASON_DAYS) % 4; }
  get season() { return SEASONS[this.seasonIndex]; }
  get dayFrac() { return (this.time % DAY_LEN) / DAY_LEN; }
  get isNight() { return this.dayFrac < 0.22 || this.dayFrac > 0.78; }
  get moonOut() { return ((this.day * 2654435761 + this._seed) % 97) / 97 > 0.33; }
  get raining() { return this.weather === 'rain' || this.weather === 'storm'; }
  get snowing() { return this.weather === 'snow' || this.weather === 'blizzard'; }

  pickWeather(rng) {
    const table = WEATHER_TABLE[this.seasonIndex];
    let tot = 0;
    for (const [, w] of table) tot += w;
    let r = rng() * tot;
    for (const [name, w] of table) { r -= w; if (r <= 0) return name; }
    return table[0][0];
  }

  update(dt, camera, rng = Math.random) {
    this.time += dt;
    const f = this.dayFrac;
    const ang = f * Math.PI * 2 - Math.PI / 2;
    const sunY = Math.sin(ang), sunX = Math.cos(ang);
    this.sun.position.set(sunX * 120, Math.max(sunY, -0.2) * 120, 40);
    this.sun.target.position.set(0, 0, 0);

    this.weatherTimer -= dt;
    if (this.weatherTimer <= 0) {
      this.weatherTimer = 22 + rng() * 26;
      this.weather = this.pickWeather(rng);
    }
    const targetWind = { storm: 0.95, blizzard: 1, rain: 0.5, cloudy: 0.3, snow: 0.35, sunny: 0.15, heatwave: 0.05 }[this.weather] || 0.2;
    this.wind = lerp(this.wind, targetWind * (0.8 + this._noise(this.time * 0.05, 3.3) * 0.4), dt * 0.5);
    this.windAngle += dt * 0.02;

    const dim = { storm: 0.35, blizzard: 0.4, rain: 0.55, snow: 0.7, cloudy: 0.72, heatwave: 1.05, sunny: 1 }[this.weather] || 1;
    let dayAmt = clamp(sunY * 2.2 + 0.35, 0.04, 1);
    if (this.isNight && this.moonOut) dayAmt = Math.max(dayAmt, 0.12);
    this.sun.intensity = 2.6 * dayAmt * dim;
    this.ambient.intensity = lerp(0.22, 0.9, dayAmt) * (0.7 + dim * 0.3);
    this.hemi.intensity = lerp(0.1, 0.55, dayAmt);

    const skyByWeather = {
      sunny: 0x87b8e8, heatwave: 0xf0c890, cloudy: 0x8fa3b8, rain: 0x5a6a80,
      storm: 0x3c4557, snow: 0xb9c4d2, blizzard: 0x9aa8ba,
    };
    const daySky = new THREE.Color(skyByWeather[this.weather] || 0x87b8e8);
    const nightSky = new THREE.Color(this.moonOut ? 0x141a30 : 0x0a0e1c);
    const sky = nightSky.clone().lerp(daySky, dayAmt);
    this.scene.background = sky;
    this.scene.fog.color.copy(sky);

    const s = this.seasonIndex;
    this.sun.color.setHex(this.weather === 'heatwave' ? 0xffd9a0 : s === 3 ? 0xdde8ff : s === 2 ? 0xffe0b0 : 0xfff3d8);

    const windX = Math.cos(this.windAngle) * this.wind, windZ = Math.sin(this.windAngle) * this.wind;

    // animate wind ribbons — parallel sinusoids morphing with strength
    if (this.windLines) {
      const amp = 0.4 + this.wind * 2.2;
      const len = 18 + this.wind * 22;
      for (const line of this.windLines) {
        line.material.opacity = 0.08 + this.wind * 0.28;
        const pos = line.geometry.attributes.position;
        const ph = line.userData.phase + this.time * (0.6 + this.wind);
        // drift anchors with wind
        line.userData.x0 += windX * dt * 8;
        line.userData.z0 += windZ * dt * 8;
        if (Math.abs(line.userData.x0) > WORLD_SIZE * 0.55) line.userData.x0 *= -0.9;
        if (Math.abs(line.userData.z0) > WORLD_SIZE * 0.55) line.userData.z0 *= -0.9;
        for (let s = 0; s <= this._windSegs; s++) {
          const t = s / this._windSegs;
          const along = (t - 0.5) * len;
          const px = line.userData.x0 + Math.cos(this.windAngle) * along;
          const pz = line.userData.z0 + Math.sin(this.windAngle) * along;
          const py = line.userData.y0 + Math.sin(ph + t * 6) * amp
            + Math.sin(ph * 0.5 + t * 11) * amp * 0.35;
          pos.setXYZ(s, px, py, pz);
        }
        pos.needsUpdate = true;
      }
    }

    this.rain.visible = this.raining && this.particlesEnabled;
    if (this.rain.visible) {
      const heavy = this.weather === 'storm';
      this.rainGeo.setDrawRange(0, heavy ? 1600 : 850);
      this.rain.material.size = heavy ? 0.42 : 0.3;
      const p = this.rainGeo.attributes.position;
      const fall = heavy ? 38 : 28;
      for (let i = 0; i < p.count; i++) {
        let y = p.getY(i) - dt * fall;
        let x = p.getX(i) + windX * dt * 22, z = p.getZ(i) + windZ * dt * 22;
        if (y < 0) { y = 32; x = (Math.random() - 0.5) * WORLD_SIZE; z = (Math.random() - 0.5) * WORLD_SIZE; }
        p.setXYZ(i, x, y, z);
      }
      p.needsUpdate = true;
    }
    this.snow.visible = this.snowing && this.particlesEnabled;
    if (this.snow.visible) {
      const heavy = this.weather === 'blizzard';
      this.snowGeo.setDrawRange(0, heavy ? 1100 : 600);
      const p = this.snowGeo.attributes.position;
      const fall = heavy ? 10 : 5;
      for (let i = 0; i < p.count; i++) {
        let y = p.getY(i) - dt * fall;
        let x = p.getX(i) + (windX * 14 + Math.sin(this.time * 2 + i) * 0.5) * dt;
        let z = p.getZ(i) + windZ * 14 * dt;
        if (y < 0) { y = 28; x = (Math.random() - 0.5) * WORLD_SIZE; z = (Math.random() - 0.5) * WORLD_SIZE; }
        p.setXYZ(i, x, y, z);
      }
      p.needsUpdate = true;
    }
  }

  get gatherMul() {
    let m = this.seasonIndex === 3 ? 0.6 : this.seasonIndex === 1 ? 1.15 : 1;
    if (this.weather === 'blizzard') m *= 0.5;
    else if (this.weather === 'heatwave') m *= 0.8;
    else if (this.weather === 'storm') m *= 0.75;
    return m;
  }
  get speedMul() {
    let m = this.seasonIndex === 3 ? 0.88 : 1;
    if (this.weather === 'blizzard') m *= 0.75;
    else if (this.weather === 'heatwave') m *= 0.9;
    return m;
  }
  get snowAmt() { return this.snowing ? 1 : this.seasonIndex === 3 ? 0.8 : 0; }
  get autumnAmt() { return this.seasonIndex === 2 ? 1 : 0; }
}
