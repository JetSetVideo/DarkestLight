import * as THREE from "three";
import { idx, type WorldMap } from "../../mapgen/MapTypes";

export type Ocean = {
  mesh: THREE.Mesh;
  update(elapsedSeconds: number): void;
  dispose(): void;
};

type Wave = { dirX: number; dirZ: number; amplitude: number; wavelength: number; steepness: number };

// Two swells, one mid chop, one cross chop. High-frequency detail lives in the
// fragment shader as a normal perturbation so the vertex grid can stay coarse.
const WAVES: Wave[] = [
  { dirX: 1.0, dirZ: 0.25, amplitude: 0.85, wavelength: 46, steepness: 0.32 },
  { dirX: 0.62, dirZ: 0.78, amplitude: 0.6, wavelength: 31, steepness: 0.3 },
  { dirX: -0.45, dirZ: 0.89, amplitude: 0.28, wavelength: 13, steepness: 0.25 },
  { dirX: 0.83, dirZ: -0.55, amplitude: 0.22, wavelength: 9, steepness: 0.22 },
];

const OCEAN_SIZE = 1600;
const OCEAN_SEGMENTS = 220;

export function createOcean(
  map: WorldMap,
  opts: { verticalScale: number; sunDir: THREE.Vector3; fogColor: THREE.Color; fogDensity: number },
): Ocean {
  const heightTex = buildTerrainHeightTexture(map, opts.verticalScale);

  const geo = new THREE.PlaneGeometry(OCEAN_SIZE, OCEAN_SIZE, OCEAN_SEGMENTS, OCEAN_SEGMENTS);
  geo.rotateX(-Math.PI / 2);

  const uniforms = {
    uTime: { value: 0 },
    uTerrain: { value: heightTex },
    uMapSize: { value: new THREE.Vector2(map.width, map.height) },
    uSunDir: { value: opts.sunDir.clone().normalize() },
    uFogColor: { value: opts.fogColor.clone() },
    uFogDensity: { value: opts.fogDensity },
  };

  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: buildVertexShader(),
    fragmentShader: FRAGMENT_SHADER,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = 0;
  mesh.frustumCulled = false;

  return {
    mesh,
    update(elapsedSeconds: number) {
      uniforms.uTime.value = elapsedSeconds;
    },
    dispose() {
      geo.dispose();
      mat.dispose();
      heightTex.dispose();
    },
  };
}

// World-space terrain height (Y) over the island footprint, used by the
// fragment shader to derive water depth for shore banding and foam.
function buildTerrainHeightTexture(map: WorldMap, verticalScale: number): THREE.DataTexture {
  const w = map.width;
  const h = map.height;
  const data = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = map.cells[idx(w, x, y)];
      data[y * w + x] = (c.h - map.seaLevel) * verticalScale;
    }
  }
  const tex = new THREE.DataTexture(data, w, h, THREE.RedFormat, THREE.FloatType);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

function buildVertexShader(): string {
  // Bake wave constants into GLSL literals (no per-frame uniform churn).
  let sum = "";
  let totalAmp = 0;
  for (const wv of WAVES) {
    const len = Math.hypot(wv.dirX, wv.dirZ);
    const dx = (wv.dirX / len).toFixed(5);
    const dz = (wv.dirZ / len).toFixed(5);
    const k = ((2 * Math.PI) / wv.wavelength).toFixed(6);
    const omega = (Math.sqrt(9.8 * (2 * Math.PI) / wv.wavelength)).toFixed(6);
    const a = wv.amplitude.toFixed(4);
    const q = wv.steepness.toFixed(4);
    totalAmp += wv.amplitude;
    sum += `
    {
      vec2 D = vec2(${dx}, ${dz});
      float k = ${k};
      float f = k * dot(D, p0) - ${omega} * uTime;
      float s = sin(f);
      float c = cos(f);
      pos.x += ${q} * ${a} * D.x * c;
      pos.z += ${q} * ${a} * D.y * c;
      pos.y += ${a} * s;
      nrm.x -= D.x * k * ${a} * c;
      nrm.z -= D.y * k * ${a} * c;
      nrm.y -= ${q} * k * ${a} * s;
    }`;
  }

  return /* glsl */ `
  uniform float uTime;
  varying vec3 vWorldPos;
  varying vec3 vNormal;
  varying float vCrest;

  void main() {
    vec3 base = (modelMatrix * vec4(position, 1.0)).xyz;
    vec2 p0 = base.xz;
    vec3 pos = base;
    vec3 nrm = vec3(0.0, 1.0, 0.0);
    ${sum}
    vWorldPos = pos;
    vNormal = normalize(nrm);
    vCrest = clamp(pos.y / ${totalAmp.toFixed(4)} * 0.5 + 0.5, 0.0, 1.0);
    gl_Position = projectionMatrix * viewMatrix * vec4(pos, 1.0);
  }`;
}

const FRAGMENT_SHADER = /* glsl */ `
precision highp float;

uniform float uTime;
uniform sampler2D uTerrain;
uniform vec2 uMapSize;
uniform vec3 uSunDir;
uniform vec3 uFogColor;
uniform float uFogDensity;

varying vec3 vWorldPos;
varying vec3 vNormal;
varying float vCrest;

// Cel water palette (spec: deep / mid / crest).
const vec3 DEEP  = vec3(0.118, 0.227, 0.373); // #1e3a5f
const vec3 MID   = vec3(0.290, 0.565, 0.851); // #4a90d9
const vec3 LIGHT = vec3(0.659, 0.847, 0.918); // #a8d8ea
const vec3 FOAM  = vec3(0.96, 0.985, 1.0);

float hash21(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

void main() {
  // ---- depth from terrain height texture (world XZ -> map uv) ----
  vec2 mapUv = (vWorldPos.xz + (uMapSize - 1.0) * 0.5 + 0.5) / uMapSize;
  float insideMap = step(0.0, mapUv.x) * step(mapUv.x, 1.0) * step(0.0, mapUv.y) * step(mapUv.y, 1.0);
  float ground = texture2D(uTerrain, clamp(mapUv, 0.0, 1.0)).r;
  ground = mix(-40.0, ground, insideMap);
  float depth = max(vWorldPos.y - ground, 0.0);

  // ---- detail normal (high-frequency waves in fragment only) ----
  vec2 dp = vWorldPos.xz * 0.55 + vec2(uTime * 0.6, -uTime * 0.45);
  float e = 0.35;
  float n0 = vnoise(dp);
  float nx = vnoise(dp + vec2(e, 0.0)) - n0;
  float nz = vnoise(dp + vec2(0.0, e)) - n0;
  vec3 n = normalize(vNormal + vec3(-nx, 0.0, -nz) * 0.9);

  // ---- 3-band base color: depth + crest, hard steps ----
  vec3 col = DEEP;
  col = mix(col, MID, step(depth, 7.5));
  col = mix(col, LIGHT, step(depth, 2.6));
  // Crest band from Gerstner height.
  col = mix(col, mix(col, LIGHT, 0.65), step(0.72, vCrest));

  // ---- quantized cel diffuse (3 steps) + hard rim of shadow ----
  float diff = max(dot(n, uSunDir), 0.0);
  float shade = 0.68 + 0.16 * step(0.30, diff) + 0.16 * step(0.62, diff);
  col *= shade;

  // ---- binary specular ----
  vec3 viewDir = normalize(cameraPosition - vWorldPos);
  vec3 refl = reflect(-uSunDir, n);
  float spec = step(0.982, max(dot(refl, viewDir), 0.0));
  col = mix(col, FOAM, spec * 0.85);

  // ---- anime sparkles on crests ----
  vec2 cellId = floor(vWorldPos.xz * 1.7) + floor(uTime * 2.0);
  float sparkle = step(0.993, hash21(cellId)) * step(0.6, vCrest);
  col = mix(col, vec3(1.0), sparkle);

  // ---- shoreline foam: two animated hard rings + noise breakup ----
  float foamNoise = vnoise(vWorldPos.xz * 0.9 + vec2(uTime * 0.35, uTime * 0.22));
  float ring1 = step(depth, 0.85 + foamNoise * 0.55);
  float ring2 = step(abs(depth - (2.0 + 0.6 * sin(uTime * 1.3 + foamNoise * 6.2831))), 0.28);
  float foam = clamp(ring1 + ring2 * 0.75, 0.0, 1.0) * insideMap;
  col = mix(col, FOAM, foam);

  // ---- crest foam flecks on open water ----
  float crestFoam = step(0.86, vCrest) * step(0.55, foamNoise);
  col = mix(col, FOAM, crestFoam * 0.8);

  // ---- fog toward horizon ----
  float dist = length(cameraPosition - vWorldPos);
  float fogF = 1.0 - exp(-uFogDensity * uFogDensity * dist * dist);
  col = mix(col, uFogColor, clamp(fogF, 0.0, 1.0));

  gl_FragColor = vec4(col, 1.0);
}
`;
