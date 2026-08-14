// Gerstner cel-shaded ocean + banded anime sky dome — pure Three.js shaders,
// zero assets. Driven by the Cycles day/night/weather machine.
import * as THREE from 'three';
import { RELIEF, WAVE } from './data/generation.js';

// Two swells, one mid chop, one cross chop; high-frequency detail is a
// fragment-space normal perturbation so the vertex grid stays coarse.

export function createOcean({ heights, fresh, gridV, worldSize }) {
  const size = worldSize * RELIEF.oceanScale;
  const geo = new THREE.PlaneGeometry(size, size, 160, 160);
  geo.rotateX(-Math.PI / 2);

  const makeTex = (src) => {
    const tex = new THREE.DataTexture(
      new Float32Array(gridV * gridV), gridV, gridV, THREE.RedFormat, THREE.FloatType,
    );
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    if (src) tex.image.data.set(src);
    tex.needsUpdate = true;
    return tex;
  };
  const heightTex = makeTex(heights);
  const freshTex = makeTex(fresh);

  const uniforms = {
    uTime: { value: 0 },
    uTerrain: { value: heightTex },
    uFresh: { value: freshTex },
    uWorldSize: { value: worldSize },
    uSunDir: { value: new THREE.Vector3(0.4, 0.85, 0.3).normalize() },
    uDayAmt: { value: 1 },
    uSunVis: { value: 1 },
    uSkyColor: { value: new THREE.Color(0x87b8e8) },
    uFogNear: { value: 90 },
    uFogFar: { value: 260 },
    uWaveAmp: { value: WAVE.defaultAmp },
    uStorm: { value: 0 },
    uDeep: { value: new THREE.Color(0x1e3a5f) },
    uMid: { value: new THREE.Color(0x4a90d9) },
    uLight: { value: new THREE.Color(0xa8d8ea) },
  };

  const setHeights = (h) => {
    heightTex.image.data.set(h);
    heightTex.needsUpdate = true;
  };
  const setFresh = (f) => {
    if (!f) return;
    freshTex.image.data.set(f);
    freshTex.needsUpdate = true;
  };

  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: OCEAN_VERT,
    fragmentShader: OCEAN_FRAG,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'ocean';
  mesh.frustumCulled = false;
  return { mesh, uniforms, setHeights, setFresh };
}

const OCEAN_VERT = `
  uniform float uTime;
  uniform float uWaveAmp;
  uniform float uStorm;
  uniform sampler2D uFresh;
  uniform float uWorldSize;
  varying vec3 vWorldPos;
  varying vec3 vNormal;
  varying float vCrest;
  varying float vFresh;
  void main() {
    vec3 base = (modelMatrix * vec4(position, 1.0)).xyz;
    vec2 p0 = base.xz;
    vec2 mapUv = p0 / uWorldSize + 0.5;
    float inland = 0.0;
    if (mapUv.x > 0.0 && mapUv.x < 1.0 && mapUv.y > 0.0 && mapUv.y < 1.0)
      inland = texture2D(uFresh, mapUv).r;
    vFresh = inland;
    float calm = mix(1.0, ${WAVE.inlandCalm.toFixed(2)}, clamp(inland * 1.4, 0.0, 1.0));
    float amp = uWaveAmp * calm;
    vec2 toCenter = -normalize(p0 + vec2(0.17, 0.11));
    vec3 pos = base;
    vec3 nrm = vec3(0.0, 1.0, 0.0);
    float crest = 0.0;
    // Inward chaotic swells — direction leans toward the island heart.
    for (int i = 0; i < 4; i++) {
      float fi = float(i);
      vec2 D = normalize(toCenter + vec2(sin(fi * 2.17 + p0.x * 0.02), cos(fi * 1.63 + p0.y * 0.018)) * (0.35 + fi * 0.12));
      float len = 28.0 - fi * 5.5;
      float k = 6.28318 / len;
      float om = sqrt(9.8 * k);
      float a = amp * (0.42 - fi * 0.07) * (1.0 + uStorm * 0.85);
      float q = 0.28 + uStorm * 0.12;
      float f = k * dot(D, p0) - om * uTime * (0.85 + fi * 0.08);
      float s = sin(f); float c = cos(f);
      pos.x += q * a * D.x * c;
      pos.z += q * a * D.y * c;
      pos.y += a * s;
      nrm.x -= D.x * k * a * c;
      nrm.z -= D.y * k * a * c;
      nrm.y -= q * k * a * s;
      crest += s * a;
    }
    vWorldPos = pos;
    vNormal = normalize(nrm);
    vCrest = clamp(crest / max(amp * 1.6, 0.05) + 0.5, 0.0, 1.0);
    gl_Position = projectionMatrix * viewMatrix * vec4(pos, 1.0);
  }
`;

const OCEAN_FRAG = `
precision highp float;
uniform float uTime;
uniform sampler2D uTerrain;
uniform float uWorldSize;
uniform vec3 uSunDir;
uniform float uDayAmt;
uniform float uSunVis;
uniform vec3 uSkyColor;
uniform float uFogNear;
uniform float uFogFar;
uniform vec3 uDeep;
uniform vec3 uMid;
uniform vec3 uLight;
uniform float uStorm;
varying vec3 vWorldPos;
varying vec3 vNormal;
varying float vCrest;
varying float vFresh;

const vec3 FOAM  = vec3(0.96, 0.985, 1.0);

float hash21(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
    mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x), u.y);
}

void main() {
  vec2 mapUv = vWorldPos.xz / uWorldSize + 0.5;
  float inside = step(0.0, mapUv.x) * step(mapUv.x, 1.0) * step(0.0, mapUv.y) * step(mapUv.y, 1.0);
  float ground = texture2D(uTerrain, clamp(mapUv, 0.0, 1.0)).r;
  ground = mix(-30.0, ground, inside);
  float depth = max(vWorldPos.y - ground, 0.0);

  // Fragment-space detail normal (waves 5-6).
  vec2 dp = vWorldPos.xz * 0.85 + vec2(uTime * 0.55, -uTime * 0.4);
  float n0 = vnoise(dp);
  float nx = vnoise(dp + vec2(0.35, 0.0)) - n0;
  float nz = vnoise(dp + vec2(0.0, 0.35)) - n0;
  vec3 n = normalize(vNormal + vec3(-nx, 0.0, -nz) * 0.85 * (1.0 - vFresh * 0.9));

  vec3 DEEP = uDeep;
  vec3 MID = uMid;
  vec3 LIGHT = mix(uLight, vec3(0.45, 0.72, 0.68), vFresh);

  // 3-band base color by depth + crest band, hard steps.
  vec3 col = DEEP;
  col = mix(col, MID, step(depth, 3.4));
  col = mix(col, LIGHT, step(depth, 1.1));
  col = mix(col, mix(col, LIGHT, 0.6), step(0.74, vCrest) * (1.0 - vFresh));

  // Quantized cel diffuse (3 steps).
  float diff = max(dot(n, uSunDir), 0.0);
  float shade = 0.68 + 0.16 * step(0.30, diff) + 0.16 * step(0.62, diff);
  col *= shade;

  // Binary specular + crest sparkles, only when the sun is out.
  vec3 viewDir = normalize(cameraPosition - vWorldPos);
  float spec = step(0.982, max(dot(reflect(-uSunDir, n), viewDir), 0.0));
  col = mix(col, FOAM, spec * 0.8 * uSunVis);
  vec2 cellId = floor(vWorldPos.xz * 2.3) + floor(uTime * 2.0);
  float sparkle = step(0.993, hash21(cellId)) * step(0.6, vCrest) * uSunVis;
  col = mix(col, vec3(1.0), sparkle);

  // Shoreline foam: animated hard ring + breakup, plus a second offset ring.
  float foamNoise = vnoise(vWorldPos.xz * 1.5 + vec2(uTime * 0.35, uTime * 0.22));
  float ring1 = step(depth, 0.34 + foamNoise * 0.26);
  float ring2 = step(abs(depth - (0.85 + 0.3 * sin(uTime * 1.3 + foamNoise * 6.2831))), 0.11);
  float foam = clamp(ring1 + ring2 * 0.7, 0.0, 1.0) * inside * (1.0 - vFresh * ${WAVE.foamFreshCut.toFixed(2)});
  col = mix(col, FOAM, foam);

  // Open-water crest flecks.
  col = mix(col, FOAM, step(0.88, vCrest) * step(0.55, foamNoise) * (0.35 + uStorm * 0.65) * (1.0 - vFresh));

  // Day/night: dim and pull toward the sky tint at night.
  float dayLight = clamp(uDayAmt, 0.0, 1.0);
  col *= 0.22 + 0.78 * dayLight;
  col = mix(col, col * (0.6 + 0.4 * uSkyColor / max(max(uSkyColor.r, uSkyColor.g), max(uSkyColor.b, 0.001))), 0.35);

  // Linear fog, matched to scene fog.
  float dist = length(cameraPosition - vWorldPos);
  float fogF = clamp((dist - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);
  col = mix(col, uSkyColor, fogF);

  gl_FragColor = vec4(col, 1.0);
}
`;

// ---------------------------------------------------------------------------

export function createSkyDome() {
  const uniforms = {
    uZenith: { value: new THREE.Color(0x3d7ec2) },
    uMid: { value: new THREE.Color(0x87b8e8) },
    uHorizon: { value: new THREE.Color(0xc8e0f2) },
    uSunColor: { value: new THREE.Color(0xfff4c2) },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uSunAmt: { value: 1 },
  };

  const geo = new THREE.SphereGeometry(300, 32, 18);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms,
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 pos = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = pos.xyww;
      }
    `,
    fragmentShader: `
      precision highp float;
      uniform vec3 uZenith;
      uniform vec3 uMid;
      uniform vec3 uHorizon;
      uniform vec3 uSunColor;
      uniform vec3 uSunDir;
      uniform float uSunAmt;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float t = clamp(d.y, 0.0, 1.0);
        vec3 col = uHorizon;
        col = mix(col, uMid, smoothstep(0.02, 0.16, t));
        col = mix(col, uZenith, smoothstep(0.22, 0.55, t));

        vec3 sd = normalize(uSunDir);
        float c = dot(d, sd);
        if (c > 0.955 && uSunAmt > 0.02) {
          vec3 tang = normalize(cross(sd, vec3(0.0, 1.0, 0.0)));
          vec3 bit = cross(sd, tang);
          vec2 off = vec2(dot(d, tang), dot(d, bit));
          float r = length(off);
          float ang = atan(off.y, off.x);
          float spikeLen = 0.052 + 0.030 * pow(abs(sin(ang * 4.0)), 8.0);
          float rays = step(r, spikeLen) * uSunAmt;
          float halo = step(r, 0.040) * uSunAmt;
          float disc = step(r, 0.030) * uSunAmt;
          col = mix(col, mix(col, uSunColor, 0.55), rays);
          col = mix(col, mix(uSunColor, vec3(1.0), 0.25), halo * 0.6);
          col = mix(col, vec3(1.0, 0.98, 0.9), disc);
        }
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'skydome';
  mesh.frustumCulled = false;
  mesh.renderOrder = -100;
  return { mesh, uniforms };
}
