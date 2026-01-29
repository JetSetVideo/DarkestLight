export const BG_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const BG_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform float uTime;
uniform vec2 uRes;

// Hash / noise helpers
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float starfield(vec2 uv) {
  vec2 p = uv * 600.0;
  vec2 ip = floor(p);
  vec2 fp = fract(p);
  float h = hash21(ip);
  float d = length(fp - 0.5);
  float s = smoothstep(0.06, 0.0, d);
  return step(0.995, h) * s;
}

void main() {
  vec2 uv = vUv;
  vec2 p = (uv - 0.5) * vec2(uRes.x / uRes.y, 1.0);

  // Slow moving nebula-ish gradients
  float t = uTime * 0.04;
  float a = sin(p.x * 2.2 + t) * 0.5 + 0.5;
  float b = cos(p.y * 2.6 - t * 1.3) * 0.5 + 0.5;
  float c = sin((p.x + p.y) * 1.8 + t * 0.7) * 0.5 + 0.5;

  vec3 base = vec3(0.02, 0.03, 0.08);
  vec3 nebA = vec3(0.10, 0.20, 0.40) * a;
  vec3 nebB = vec3(0.06, 0.40, 0.26) * b * 0.6;
  vec3 nebC = vec3(0.35, 0.16, 0.42) * c * 0.35;

  float vign = smoothstep(1.15, 0.25, length(p));
  float stars = starfield(uv + vec2(t * 0.6, -t * 0.3)) + starfield(uv * 0.93 + vec2(-t * 0.2, t * 0.45));

  vec3 col = base + nebA + nebB + nebC;
  col *= vign;
  col += vec3(0.9) * stars * 0.8;

  gl_FragColor = vec4(col, 1.0);
}
`;

export const PLANET_VERT = /* glsl */ `
precision highp float;
varying vec3 vPos;
varying vec3 vN;
uniform float uTime;

mat3 rotY(float a) {
  float s = sin(a), c = cos(a);
  return mat3(
    c, 0.0, -s,
    0.0, 1.0, 0.0,
    s, 0.0, c
  );
}

mat3 rotZ(float a) {
  float s = sin(a), c = cos(a);
  return mat3(
    c, s, 0.0,
    -s, c, 0.0,
    0.0, 0.0, 1.0
  );
}

void main() {
  // Slightly off-center axis (tilt + subtle wobble)
  float tilt = 0.35;
  float wob = sin(uTime * 0.12) * 0.04;
  mat3 R = rotZ(tilt) * rotY(uTime * 0.08 + wob);
  vec3 p = R * position;
  vec3 n = normalize(R * normal);

  vPos = p;
  vN = n;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`;

export const PLANET_FRAG = /* glsl */ `
precision highp float;
varying vec3 vPos;
varying vec3 vN;
uniform float uTime;

// Black-hole core: mostly absorptive, with a tight photon ring.

void main() {
  vec3 n = normalize(vN);
  vec3 vdir = normalize(vec3(0.0, 0.0, 1.0));
  float ndv = clamp(dot(n, vdir), 0.0, 1.0);

  // Deep absorptive body (almost pure black).
  vec3 core = vec3(0.002, 0.002, 0.004);

  // Photon ring concentrated near the silhouette (high rim).
  float rim = pow(1.0 - ndv, 2.4);
  float ring = smoothstep(0.42, 0.98, rim) * smoothstep(1.12, 0.62, rim);

  // Slight chromatic separation in the ring for "lensing" flavor.
  vec3 ringCol = vec3(0.65, 0.85, 1.0) * 0.55 + vec3(1.0, 0.55, 0.25) * 0.35;
  float flick = 0.85 + 0.15 * sin(uTime * 1.2 + rim * 18.0);

  vec3 col = core;
  col += ringCol * ring * flick;

  // Very faint internal gradient to keep volume readable.
  col += vec3(0.02, 0.03, 0.05) * pow(ndv, 2.2) * 0.25;

  gl_FragColor = vec4(col, 1.0);
}
`;

export const HALO_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const HALO_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform float uTime;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i + vec2(0.0, 0.0));
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.55;
  mat2 R = mat2(0.8, -0.6, 0.6, 0.8);
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = R * p * 2.02 + 7.3;
    a *= 0.52;
  }
  return v;
}

void main() {
  vec2 uv = vUv * 2.0 - 1.0;
  float r = length(uv);
  float ang = atan(uv.y, uv.x);

  // "Event horizon" mask: keep center dark and sharp.
  float horizon = smoothstep(0.32, 0.28, r);

  // Accretion disk: thin band with swirl + turbulent brightness.
  float diskR = 0.70;
  float diskW = 0.10;
  float disk = smoothstep(diskW, 0.0, abs(r - diskR));

  float swirl = ang + uTime * 0.9 + fbm(vec2(r * 6.0, ang * 2.0)) * 1.2;
  float bands = 0.5 + 0.5 * sin(swirl * 10.0 + r * 14.0);
  float hot = pow(bands, 2.2);
  float turb = fbm(vec2(uv.x * 5.0 + uTime * 0.15, uv.y * 5.0 - uTime * 0.11));

  vec3 cool = vec3(0.20, 0.55, 1.00);
  vec3 warm = vec3(1.00, 0.55, 0.18);
  vec3 diskCol = mix(cool, warm, clamp(0.15 + hot * 0.85, 0.0, 1.0));
  diskCol *= (0.55 + 0.75 * turb) * (0.55 + 0.45 * hot);

  // Gravitational lensing-style glow closer to the horizon.
  float lens = smoothstep(0.9, 0.2, r) * smoothstep(0.22, 0.38, r);
  float pulse = 0.75 + 0.25 * sin(uTime * 0.8);
  vec3 glowCol = vec3(0.55, 0.85, 1.0) * lens * 0.35 * pulse;

  vec3 col = diskCol * disk + glowCol;
  col *= (1.0 - horizon * 0.98);

  float a = clamp(disk * 0.55 + lens * 0.35, 0.0, 1.0);
  gl_FragColor = vec4(col, a);
}
`;

