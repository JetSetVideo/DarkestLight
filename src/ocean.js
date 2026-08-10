// Gerstner cel-shaded ocean + banded anime sky dome — pure Three.js shaders,
// zero assets. Driven by the Cycles day/night/weather machine.
import * as THREE from 'three';

// Two swells, one mid chop, one cross chop; high-frequency detail is a
// fragment-space normal perturbation so the vertex grid stays coarse.
const WAVES = [
  { dx: 1.0, dz: 0.25, amp: 0.42, len: 34, steep: 0.32 },
  { dx: 0.62, dz: 0.78, amp: 0.3, len: 22, steep: 0.3 },
  { dx: -0.45, dz: 0.89, amp: 0.14, len: 9.5, steep: 0.25 },
  { dx: 0.83, dz: -0.55, amp: 0.11, len: 6.5, steep: 0.22 },
];

export function createOcean({ heights, gridV, worldSize }) {
  const size = worldSize * 2.6;
  const geo = new THREE.PlaneGeometry(size, size, 200, 200);
  geo.rotateX(-Math.PI / 2);

  const tex = new THREE.DataTexture(
    new Float32Array(gridV * gridV), gridV, gridV, THREE.RedFormat, THREE.FloatType,
  );
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;

  const uniforms = {
    uTime: { value: 0 },
    uTerrain: { value: tex },
    uWorldSize: { value: worldSize },
    uSunDir: { value: new THREE.Vector3(0.4, 0.85, 0.3).normalize() },
    uDayAmt: { value: 1 },
    uSunVis: { value: 1 },
    uSkyColor: { value: new THREE.Color(0x87b8e8) },
    uFogNear: { value: 90 },
    uFogFar: { value: 260 },
  };

  const setHeights = (h) => {
    tex.image.data.set(h);
    tex.needsUpdate = true;
  };
  setHeights(heights);

  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: buildOceanVertex(),
    fragmentShader: OCEAN_FRAG,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'ocean';
  mesh.frustumCulled = false;
  return { mesh, uniforms, setHeights };
}

function buildOceanVertex() {
  let sum = '';
  let totalAmp = 0;
  for (const w of WAVES) {
    const l = Math.hypot(w.dx, w.dz);
    const dx = (w.dx / l).toFixed(5), dz = (w.dz / l).toFixed(5);
    const k = ((2 * Math.PI) / w.len).toFixed(6);
    const om = Math.sqrt(9.8 * (2 * Math.PI) / w.len).toFixed(6);
    const a = w.amp.toFixed(4), q = w.steep.toFixed(4);
    totalAmp += w.amp;
    sum += `
    {
      vec2 D = vec2(${dx}, ${dz});
      float f = ${k} * dot(D, p0) - ${om} * uTime;
      float s = sin(f); float c = cos(f);
      pos.x += ${q} * ${a} * D.x * c;
      pos.z += ${q} * ${a} * D.y * c;
      pos.y += ${a} * s;
      nrm.x -= D.x * ${k} * ${a} * c;
      nrm.z -= D.y * ${k} * ${a} * c;
      nrm.y -= ${q} * ${k} * ${a} * s;
    }`;
  }
  return `
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
    vCrest = clamp((pos.y - base.y) / ${(totalAmp * 2).toFixed(4)} + 0.5, 0.0, 1.0);
    gl_Position = projectionMatrix * viewMatrix * vec4(pos, 1.0);
  }`;
}

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
varying vec3 vWorldPos;
varying vec3 vNormal;
varying float vCrest;

const vec3 DEEP  = vec3(0.118, 0.227, 0.373);
const vec3 MID   = vec3(0.290, 0.565, 0.851);
const vec3 LIGHT = vec3(0.659, 0.847, 0.918);
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
  vec3 n = normalize(vNormal + vec3(-nx, 0.0, -nz) * 0.85);

  // 3-band base color by depth + crest band, hard steps.
  vec3 col = DEEP;
  col = mix(col, MID, step(depth, 3.4));
  col = mix(col, LIGHT, step(depth, 1.1));
  col = mix(col, mix(col, LIGHT, 0.6), step(0.74, vCrest));

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
  float foam = clamp(ring1 + ring2 * 0.7, 0.0, 1.0) * inside;
  col = mix(col, FOAM, foam);

  // Open-water crest flecks.
  col = mix(col, FOAM, step(0.88, vCrest) * step(0.55, foamNoise) * 0.8);

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
