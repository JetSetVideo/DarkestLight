// Procedural 3D model factory. Every model in the game is generated here
// from Three.js primitives only — no external assets.
import * as THREE from 'three';
import { CIVS, CLASSES, BUILDINGS, SPELLS } from './civs.js';
import { noiseTextureDataURL, mulberry32 } from './util.js';
import { applyToonShading } from './shaders/toon.js';
import { requestUpgrade } from './generation/assetBridge.js';

const matCache = new Map();
const texCache = new Map();

// Cel shading is applied at this single chokepoint, so every procedural model
// in the game is banded without touching any call site. Emissive parts (flames,
// glows, spell orbs) opt out — quantizing them kills the bloom-ish look.
export function mat(color, opts = {}) {
  const key = color + '|' + (opts.emissive || 0) + '|' + (opts.flat ? 1 : 0) + '|' + (opts.mapKey || '');
  if (!matCache.has(key)) {
    const m = new THREE.MeshLambertMaterial({
      color, emissive: opts.emissive || 0x000000, flatShading: true,
    });
    if (opts.mapKey && texCache.has(opts.mapKey)) m.map = texCache.get(opts.mapKey);
    if (!opts.emissive) applyToonShading(m);
    matCache.set(key, m);
  }
  return matCache.get(key);
}

function ensureNoiseTex(seed, hex) {
  const key = seed + ':' + hex;
  if (texCache.has(key)) return key;
  const url = noiseTextureDataURL(seed, 48, hex, 28);
  if (url) {
    const tex = new THREE.TextureLoader().load(url);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.magFilter = THREE.NearestFilter;
    texCache.set(key, tex);
  }
  return key;
}

function box(w, h, d, color, x = 0, y = 0, z = 0, mapKey) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, mapKey ? { mapKey } : {}));
  m.position.set(x, y, z); m.castShadow = true;
  return m;
}
function cone(r, h, seg, color, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), mat(color));
  m.position.set(x, y, z); m.castShadow = true;
  return m;
}
function cyl(rt, rb, h, seg, color, x = 0, y = 0, z = 0, mapKey) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat(color, mapKey ? { mapKey } : {}));
  m.position.set(x, y, z); m.castShadow = true;
  return m;
}
function sph(r, color, x = 0, y = 0, z = 0, seg = 8) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.max(4, seg - 2)), mat(color));
  m.position.set(x, y, z); m.castShadow = true;
  return m;
}

/** Soft sinusoidal flame — vertices scallop instead of a sharp cone. */
function makeSinFlame(radius, height, color, emissive) {
  const segs = 16, rings = 14;
  const geo = new THREE.CylinderGeometry(0.015, radius, height, segs, rings, true);
  geo.translate(0, height * 0.5, 0);
  const pos = geo.attributes.position;
  const rest = new Float32Array(pos.array.length);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const t = Math.max(0, y / height);
    const ang = Math.atan2(z, x);
    const r = Math.hypot(x, z) * (1 + 0.22 * Math.sin(ang * 4 + t * 7));
    rest[i * 3] = Math.cos(ang) * r;
    rest[i * 3 + 1] = y;
    rest[i * 3 + 2] = Math.sin(ang) * r;
    pos.setXYZ(i, rest[i * 3], y, rest[i * 3 + 2]);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({
    color, emissive, transparent: true, opacity: 0.92, side: THREE.DoubleSide, depthWrite: false,
  }));
  m.userData.rest = rest;
  m.userData.height = height;
  m.userData.hearthFuel = true;
  m.castShadow = false;
  return m;
}

function markFuel(obj) {
  obj.userData.hearthFuel = true;
  obj.traverse((o) => { o.userData.hearthFuel = true; });
  return obj;
}

/** Drive flame, stones, logs and perimeter torches from village state. */
export function updateCampfireVisual(mesh, {
  health = 0.5, fuel = 20, eraTier = 0, t = 0, night = false, wind = 0.2,
  pop = 4, popCap = 14, rock = 8, wood = 20,
} = {}) {
  const ud = mesh.userData;
  const fuelN = Math.max(0, Math.min(1, fuel / 80));
  const woodN = Math.max(0, Math.min(1, (wood || 0) / 60));
  const vigor = 0.28 + health * 0.5 + fuelN * 0.4 + Math.min(0.35, pop * 0.04);
  const wave = (flame, speed, amp) => {
    if (!flame?.userData?.rest) return;
    const pos = flame.geometry.attributes.position;
    const rest = flame.userData.rest;
    const h = flame.userData.height || 1;
    for (let i = 0; i < pos.count; i++) {
      const y = rest[i * 3 + 1];
      const tt = y / h;
      const ang = Math.atan2(rest[i * 3 + 2], rest[i * 3]);
      const wiggle = Math.sin(t * speed + ang * 3 + tt * 9) * amp * tt;
      const lean = Math.sin(t * 1.7 + tt * 2) * wind * 0.2 * tt;
      pos.setXYZ(
        i,
        rest[i * 3] + wiggle + lean,
        y,
        rest[i * 3 + 2] + Math.cos(t * speed * 0.85 + ang * 2) * amp * tt * 0.7,
      );
    }
    pos.needsUpdate = true;
  };
  wave(ud.flame, 7.5, 0.08 * vigor);
  wave(ud.flame2, 11, 0.055 * vigor);
  const extra = ud.flames || [];
  const nFlames = 1 + Math.min(extra.length, Math.floor(pop * 0.35 + health * 3 + fuelN * 2));
  extra.forEach((f, i) => {
    f.visible = i < nFlames - 2;
    if (f.visible) wave(f, 8 + i, 0.05 * vigor);
    if (f.visible) f.scale.set(0.55 + vigor * 0.4, 0.5 + vigor * 0.7, 0.55 + vigor * 0.4);
  });
  if (ud.flame) {
    ud.flame.scale.set(vigor, 0.55 + vigor * 1.15, vigor);
    ud.flame.material.emissive.setHex(health > 0.7 ? 0xdd7710 : health > 0.35 ? 0xbb4410 : 0x882211);
    ud.flame.material.color.setHex(health > 0.7 ? 0xffb040 : health > 0.35 ? 0xff8c2e : 0xcc4422);
  }
  if (ud.flame2) ud.flame2.scale.set(vigor * 0.72, 0.75 + vigor * 0.8, vigor * 0.72);
  if (ud.light) ud.light.intensity = (night ? 13 : 5.5) * (0.3 + vigor * 0.9);

  const cubeish = Math.min(1, eraTier / 3);
  const rockGrow = 0.72 + Math.min(1.35, (rock || 0) / 36);
  const stones = ud.stones || [];
  const cap = Math.min(stones.length, Math.max(1, popCap | 0));
  const filled = Math.min(cap, Math.max(0, pop | 0));
  const ringR = 1.15 + Math.min(1.6, cap * 0.055);
  for (let i = 0; i < stones.length; i++) {
    const st = stones[i];
    const inCircle = i < cap;
    const living = i < filled;
    st.visible = inCircle;
    const a = (i / Math.max(1, cap)) * Math.PI * 2 + 0.08;
    st.position.set(Math.cos(a) * ringR, 0.06, Math.sin(a) * ringR);
    if (st.userData.socket) st.userData.socket.visible = inCircle && !living;
    if (st.userData.round) st.userData.round.visible = living && cubeish < 0.62;
    if (st.userData.block) {
      st.userData.block.visible = living && cubeish >= 0.28;
      st.userData.block.scale.setScalar(0.7 + cubeish * 0.55);
    }
    if (living) st.scale.setScalar(rockGrow);
    else st.scale.setScalar(0.55);
  }
  const logs = ud.logs || [];
  const show = Math.max(1, Math.round(2 + woodN * Math.max(0, logs.length - 2) + fuelN * 2));
  for (let i = 0; i < logs.length; i++) logs[i].visible = i < show;

  for (const tr of ud.torches || []) {
    const glow = tr.userData.glow;
    const light = tr.userData.light;
    if (glow) {
      glow.visible = night;
      glow.material.emissiveIntensity = night ? 1.1 : 0;
    }
    if (light) light.intensity = night ? 2.6 : 0;
  }
}

function buildCampfireMesh() {
  const g = new THREE.Group();
  const stones = [];
  const SLOTS = 28;
  for (let i = 0; i < SLOTS; i++) {
    const a = (i / SLOTS) * Math.PI * 2 + 0.08;
    const r = 0.95;
    const slot = new THREE.Group();
    slot.position.set(Math.cos(a) * r, 0.06, Math.sin(a) * r);
    const socket = cyl(0.11, 0.12, 0.04, 8, 0x4a463c, 0, 0.01, 0);
    socket.material = socket.material.clone();
    socket.material.transparent = true;
    socket.material.opacity = 0.35;
    const round = sph(0.14, 0x8a8578, 0, 0.06, 0, 10);
    round.scale.y = 0.62;
    const block = box(0.26, 0.15, 0.24, 0x7a766c, 0, 0.07, 0);
    block.visible = false;
    slot.add(socket, round, block);
    slot.userData.socket = socket;
    slot.userData.round = round;
    slot.userData.block = block;
    markFuel(slot);
    g.add(slot);
    stones.push(slot);
  }
  const logs = [];
  for (let i = 0; i < 12; i++) {
    const log = cyl(0.055 + (i % 4) * 0.012, 0.05, 0.7 + (i % 5) * 0.12, 7, 0x6b4f30, 0, 0.12, 0);
    log.rotation.z = Math.PI / 2.35;
    log.rotation.y = (i / 12) * Math.PI * 2 + i * 0.11;
    log.position.y = 0.11 + (i % 3) * 0.04;
    markFuel(log);
    g.add(log);
    logs.push(log);
  }
  const flame = makeSinFlame(0.38, 1.05, 0xff8c2e, 0xdd5510);
  const flame2 = makeSinFlame(0.2, 0.72, 0xffd050, 0xcc9910);
  flame2.position.y = 0.12;
  g.add(flame, flame2);
  const extraFlames = [];
  for (let i = 0; i < 4; i++) {
    const f = makeSinFlame(0.14, 0.55, 0xffa030, 0xcc4408);
    f.position.set(Math.cos(i * 1.7) * 0.22, 0.08, Math.sin(i * 1.7) * 0.22);
    f.visible = false;
    markFuel(f);
    g.add(f);
    extraFlames.push(f);
  }
  const light = new THREE.PointLight(0xff9540, 8, 14);
  light.position.y = 1.15;
  g.add(light);

  const torches = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.4;
    const tr = new THREE.Group();
    tr.position.set(Math.cos(a) * 6.2, 0, Math.sin(a) * 6.2);
    const pole = cyl(0.04, 0.05, 1.15, 6, 0x5d4a33, 0, 0.55, 0);
    const bowl = cyl(0.08, 0.05, 0.1, 6, 0x6b4f30, 0, 1.12, 0);
    const glow = sph(0.09, 0xffa040, 0, 1.22, 0, 8);
    glow.material = new THREE.MeshLambertMaterial({ color: 0xffa040, emissive: 0xcc5500, emissiveIntensity: 0 });
    const tl = new THREE.PointLight(0xff9030, 0, 7);
    tl.position.y = 1.22;
    tr.add(pole, bowl, glow, tl);
    tr.userData.glow = glow;
    tr.userData.light = tl;
    g.add(tr);
    torches.push(tr);
  }

  g.userData.flame = flame;
  g.userData.flame2 = flame2;
  g.userData.flames = extraFlames;
  g.userData.light = light;
  g.userData.stones = stones;
  g.userData.logs = logs;
  g.userData.torches = torches;
  return g;
}

// ============================ HUMANOIDS ============================
// Smaller stature; torso split into hips / belly / chest; articulated limbs
// with shoulders, elbows, knees, spherical hands; noise-patterned cloth/skin.
export function buildHuman(civKey, clsKey, titles = []) {
  const civ = CIVS[civKey];
  const g = new THREE.Group();
  const rng = mulberry32(((civKey + clsKey).split('').reduce((a, c) => a + c.charCodeAt(0), 0) * 9973) >>> 0);
  const skin = civKey === 'orcs' ? 0x6f8f3f : civ.skin;
  const cloth = civ.cloth;
  const skinKey = ensureNoiseTex((rng() * 1e9) | 0, skin);
  const clothKey = ensureNoiseTex((rng() * 1e9) | 0, cloth);
  const SCALE = 0.68; // individuals are smaller than trees/houses

  // --- 3 connected torso parts ---
  const hips = cyl(0.11, 0.13, 0.14, 12, cloth, 0, 0.42, 0, clothKey);
  const belly = cyl(0.13, 0.12, 0.16, 12, cloth, 0, 0.56, 0, clothKey);
  const chest = cyl(0.12, 0.14, 0.18, 12, cloth, 0, 0.72, 0, clothKey);
  g.add(hips, belly, chest);

  // shoulders
  const shL = sph(0.07, skin, -0.16, 0.82, 0, 12);
  const shR = sph(0.07, skin, 0.16, 0.82, 0, 12);
  g.add(shL, shR);

  // head + nose
  const head = sph(0.115, skin, 0, 0.98, 0, 14);
  const nose = cone(0.025, 0.05, 8, skin, 0, 0.97, 0.11);
  nose.rotation.x = Math.PI / 2;
  g.add(head, nose);

  // Articulated legs: groups pivot at the hip / knee so walk and run read as a gait.
  const makeLeg = (side) => {
    const thigh = new THREE.Group();
    thigh.position.set(side * 0.075, 0.30, 0);
    const thighM = box(0.075, 0.16, 0.085, 0x3a3226, 0, -0.08, 0);
    const knee = sph(0.042, skin, 0, -0.17, 0, 10);
    const shin = new THREE.Group();
    shin.position.set(0, -0.17, 0);
    const shinM = box(0.065, 0.14, 0.07, 0x3a3226, 0, -0.07, 0);
    const foot = box(0.075, 0.038, 0.13, 0x2a241c, 0, -0.155, 0.035);
    shin.add(shinM, foot);
    thigh.add(thighM, knee, shin);
    g.add(thigh);
    return { thigh, shin, knee, foot };
  };
  const legL = makeLeg(-1);
  const legR = makeLeg(1);

  const makeArm = (side) => {
    const arm = new THREE.Group();
    arm.position.set(side * 0.16, 0.80, 0);
    const uArm = box(0.055, 0.14, 0.055, skin, 0, -0.07, 0);
    const elb = sph(0.035, skin, 0, -0.15, 0, 10);
    const lArm = new THREE.Group();
    lArm.position.set(0, -0.15, 0);
    const lArmM = box(0.05, 0.13, 0.05, skin, 0, -0.07, 0);
    const hand = sph(0.04, skin, 0, -0.15, 0, 10);
    lArm.add(lArmM, hand);
    arm.add(uArm, elb, lArm);
    g.add(arm);
    return { arm, lArm, hand, elb };
  };
  const armL = makeArm(-1);
  const armR = makeArm(1);

  g.userData.limbs = {
    legL: legL.thigh, legR: legR.thigh, shinL: legL.shin, shinR: legR.shin,
    kneeL: legL.knee, kneeR: legR.knee, footL: legL.foot, footR: legR.foot,
    armL: armL.arm, armR: armR.arm, lArmL: armL.lArm, lArmR: armR.lArm,
    elbL: armL.elb, elbR: armR.elb, handL: armL.hand, handR: armR.hand,
    shL, shR, hips, belly, chest, head, nose,
  };
  g.userData.kinematic = true;

  // class-specific dressing
  switch (clsKey) {
    case 'farmer':
      g.add(cyl(0.16, 0.16, 0.03, 8, 0xc9a95e, 0, 1.08, 0));
      g.add(box(0.035, 0.38, 0.035, 0x7a5c37, 0.26, 0.62, 0.04));
      break;
    case 'knight': {
      g.add(cyl(0.12, 0.13, 0.12, 6, 0x8f97a3, 0, 1.06, 0));
      g.add(box(0.04, 0.42, 0.025, 0xb8c0cc, 0.28, 0.68, 0.04));
      const shield = cyl(0.12, 0.12, 0.04, 8, civ.color, -0.26, 0.6, 0);
      shield.rotation.z = Math.PI / 2;
      g.add(shield);
      break;
    }
    case 'king':
      g.add(cyl(0.1, 0.12, 0.09, 6, 0xf5c518, 0, 1.12, 0));
      g.add(box(0.3, 0.4, 0.03, civ.color, 0, 0.58, -0.12));
      break;
    case 'queen':
      g.add(cyl(0.08, 0.1, 0.08, 6, 0xf5c518, 0, 1.12, 0));
      g.add(cone(0.22, 0.38, 8, civ.accent, 0, 0.28, 0));
      break;
    case 'princess':
      g.add(cyl(0.06, 0.08, 0.05, 6, 0xf0e0ff, 0, 1.1, 0));
      g.add(cone(0.19, 0.34, 8, 0xe8a9c9, 0, 0.26, 0));
      break;
    case 'philosopher': {
      const beard = cone(0.07, 0.14, 6, 0xd8d3c8, 0, 0.88, 0.08);
      beard.rotation.x = 0.5;
      g.add(beard, box(0.03, 0.7, 0.03, 0x7a5c37, 0.26, 0.5, 0), sph(0.045, civ.accent, 0.26, 0.88, 0));
      break;
    }
    case 'monk': {
      g.add(cone(0.18, 0.5, 8, 0x4a3f55, 0, 0.4, 0)); // robe
      g.add(cyl(0.12, 0.12, 0.04, 8, 0x2a2435, 0, 1.05, 0)); // hood
      g.add(sph(0.05, civ.accent, 0, 0.7, 0.14)); // prayer bead
      break;
    }
    case 'gatherer':
      g.add(cyl(0.14, 0.14, 0.03, 8, 0x8a6f47, 0, 1.06, 0)); // soft cap
      g.add(box(0.12, 0.1, 0.08, 0x6b4f30, 0.24, 0.55, 0.04)); // basket
      break;
    case 'hunter':
      g.add(cyl(0.11, 0.12, 0.08, 8, 0x5a4630, 0, 1.08, 0)); // leather hat
      g.add(box(0.02, 0.38, 0.02, 0x7a5c37, 0.28, 0.68, 0)); // spear
      g.add(cone(0.03, 0.08, 4, 0xc9a06a, 0.28, 0.9, 0));
      break;
    case 'shaman':
      g.add(cyl(0.13, 0.1, 0.1, 8, civ.accent, 0, 1.1, 0)); // ritual circlet
      g.add(sph(0.06, 0x37c8ab, 0.22, 0.72, 0.05, 6)); // charm
      g.add(cone(0.04, 0.18, 5, 0xe8e4d8, -0.12, 1.18, 0)); // feather
      break;
  }
  if (titles.includes('prince')) g.add(cyl(0.1, 0.11, 0.04, 6, 0xf5c518, 0, 1.1, 0));
  if (titles.includes('princess')) g.add(cyl(0.07, 0.08, 0.05, 6, 0xf0e0ff, 0, 1.11, 0));
  if (titles.includes('chief')) {
    g.add(box(0.12, 0.05, 0.12, 0xf5c518, -0.18, 0.84, 0));
    g.add(cone(0.025, 0.16, 4, 0xd7263d, -0.18, 0.95, 0));
  }
  g.add(box(0.08, 0.08, 0.015, civ.color, 0, 0.7, 0.14));

  if (civKey === 'elves') {
    g.add(cone(0.03, 0.09, 4, skin, -0.12, 1.02, 0), cone(0.03, 0.09, 4, skin, 0.12, 1.02, 0));
  }
  if (civKey === 'orcs') {
    g.add(cone(0.02, 0.06, 4, 0xe8e0d0, -0.04, 0.92, 0.1), cone(0.02, 0.06, 4, 0xe8e0d0, 0.04, 0.92, 0.1));
  }
  if (civKey === 'vikings' && clsKey !== 'knight') {
    g.add(cone(0.025, 0.09, 4, 0xd8cfc0, -0.1, 1.08, 0), cone(0.025, 0.09, 4, 0xd8cfc0, 0.1, 1.08, 0));
  }
  if (civKey === 'chinese') g.add(box(0.14, 0.04, 0.02, civ.accent, 0, 0.78, 0.13)); // sash
  if (civKey === 'aztecs') g.add(cyl(0.13, 0.13, 0.03, 8, civ.accent, 0, 0.85, 0)); // feather collar

  g.scale.setScalar(SCALE);
  return g;
}

// ============================ ANIMALS ============================
export function buildAnimal(type) {
  const g = new THREE.Group();
  if (type === 'snake') {
    const segs = [];
    for (let i = 0; i < 10; i++) {
      const s = sph(0.095 - i * 0.006, i % 2 ? 0x5a7a3a : 0x6f8f4a, Math.sin(i * 1.15) * 0.1, 0.07, -i * 0.13, 10);
      g.add(s); segs.push(s);
    }
    const head = sph(0.11, 0x50702f, 0, 0.1, 0.16, 12);
    g.add(head, sph(0.025, 0xd7263d, 0.02, 0.11, 0.28, 6));
    g.add(sph(0.018, 0x101010, 0.07, 0.13, 0.2, 6), sph(0.018, 0x101010, -0.07, 0.13, 0.2, 6));
    g.userData.slither = true;
    g.userData.limbs = { segs, head };
    g.userData.kinematic = true;
    return g;
  }
  if (type === 'fish') {
    const body = sph(0.17, 0x6aa7c8, 0, 0, 0, 12);
    body.scale.set(1.7, 0.75, 0.65);
    const tail = cone(0.11, 0.2, 8, 0x578cab, -0.32, 0, 0);
    tail.rotation.z = Math.PI / 2;
    const fin = cone(0.05, 0.14, 6, 0x578cab, 0.02, 0.14, 0);
    const finL = cone(0.04, 0.1, 6, 0x4e7a98, 0.02, 0, 0.12);
    finL.rotation.x = 0.9;
    g.add(body, tail, fin, finL, sph(0.028, 0x10202c, 0.22, 0.04, 0.08, 6));
    g.scale.setScalar(0.42);
    g.userData.fish = true;
    g.userData.limbs = { body, tail, fin };
    g.userData.kinematic = true;
    return g;
  }
  const A = {
    panda: { body: 0xf0f0ea, head: 0xf0f0ea, dark: 0x2a2a2a, scale: 1.05, long: 0.72, tall: 0.42, snout: 0.07 },
    wolf: { body: 0x8a8f99, head: 0x9aa0aa, dark: 0x4a4f58, scale: 0.95, long: 0.85, tall: 0.38, snout: 0.12 },
    boar: { body: 0x6b4f35, head: 0x7a5c3f, dark: 0x3f2e1e, scale: 0.92, long: 0.7, tall: 0.44, snout: 0.14 },
    warg: { body: 0x55584a, head: 0x606352, dark: 0x33352c, scale: 1.12, long: 0.95, tall: 0.42, snout: 0.14 },
    deer: { body: 0xb08d5e, head: 0xbd9a6b, dark: 0x6f5636, scale: 0.95, long: 0.78, tall: 0.4, snout: 0.08 },
    jaguar: { body: 0xd9a441, head: 0xe0ac4c, dark: 0x6e5220, scale: 0.95, long: 0.8, tall: 0.36, snout: 0.1 },
  }[type] || { body: 0x999999, head: 0xaaaaaa, dark: 0x555555, scale: 1, long: 0.7, tall: 0.38, snout: 0.1 };

  const torso = cyl(A.tall * 0.42, A.tall * 0.48, A.long, 14, A.body, 0, A.tall, 0);
  torso.rotation.z = Math.PI / 2;
  const chest = sph(A.tall * 0.48, A.body, A.long * 0.28, A.tall + 0.02, 0, 12);
  const rump = sph(A.tall * 0.46, A.body, -A.long * 0.28, A.tall, 0, 12);
  const neck = cyl(0.08, 0.11, 0.18, 10, A.head, A.long * 0.38, A.tall + 0.12, 0);
  const head = sph(0.16, A.head, A.long * 0.48, A.tall + 0.22, 0, 12);
  const snout = sph(A.snout, A.head, A.long * 0.48 + 0.14, A.tall + 0.16, 0, 10);
  g.add(torso, chest, rump, neck, head, snout);
  g.add(sph(0.055, A.dark, A.long * 0.46, A.tall + 0.36, -0.08, 8), sph(0.055, A.dark, A.long * 0.46, A.tall + 0.36, 0.08, 8));
  g.add(sph(0.028, 0x101010, A.long * 0.55, A.tall + 0.26, -0.07, 6), sph(0.028, 0x101010, A.long * 0.55, A.tall + 0.26, 0.07, 6));

  const legs = [];
  const hipY = A.tall * 0.55;
  for (const [lx, lz] of [[-A.long * 0.28, -0.12], [-A.long * 0.28, 0.12], [A.long * 0.22, -0.12], [A.long * 0.22, 0.12]]) {
    const thigh = new THREE.Group();
    thigh.position.set(lx, hipY, lz);
    const thighM = cyl(0.045, 0.05, 0.16, 8, A.dark, 0, -0.08, 0);
    const shin = new THREE.Group();
    shin.position.set(0, -0.16, 0);
    const shinM = cyl(0.035, 0.04, 0.14, 8, A.dark, 0, -0.07, 0);
    const paw = sph(0.045, A.dark, 0, -0.15, 0.02, 8);
    shin.add(shinM, paw);
    thigh.add(thighM, shin);
    g.add(thigh);
    legs.push(thigh);
  }

  if (type === 'panda') {
    g.add(sph(0.08, A.dark, A.long * 0.5, A.tall + 0.28, -0.1, 8), sph(0.08, A.dark, A.long * 0.5, A.tall + 0.28, 0.1, 8));
    g.add(cyl(0.16, 0.18, 0.22, 10, A.dark, 0, A.tall, 0));
  }
  if (type === 'deer') {
    const ant = (z) => {
      const a = cyl(0.012, 0.018, 0.28, 6, 0x8a6f47, A.long * 0.46, A.tall + 0.42, z);
      const b = cyl(0.01, 0.012, 0.12, 5, 0x8a6f47, A.long * 0.42, A.tall + 0.5, z + 0.04);
      b.rotation.z = 0.6;
      g.add(a, b);
    };
    ant(-0.07); ant(0.07);
  }
  if (type === 'boar' || type === 'warg') {
    g.add(cone(0.025, 0.12, 6, 0xe8e0d0, A.long * 0.58, A.tall + 0.12, -0.05));
    g.add(cone(0.025, 0.12, 6, 0xe8e0d0, A.long * 0.58, A.tall + 0.12, 0.05));
  }
  if (type === 'jaguar') {
    for (let i = 0; i < 8; i++)
      g.add(sph(0.035, A.dark, -0.25 + i * 0.08, A.tall + 0.18, (i % 2 ? 0.12 : -0.12), 6));
  }
  if (type === 'wolf' || type === 'warg') {
    g.add(cone(0.045, 0.11, 6, A.dark, A.long * 0.44, A.tall + 0.38, -0.07));
    g.add(cone(0.045, 0.11, 6, A.dark, A.long * 0.44, A.tall + 0.38, 0.07));
  }
  const tailBase = new THREE.Group();
  tailBase.position.set(-A.long * 0.4, A.tall + 0.06, 0);
  const tailM = cyl(0.025, 0.04, 0.28, 8, A.dark, 0, 0, -0.12);
  tailM.rotation.x = Math.PI / 2;
  const tailTip = sph(0.04, A.dark, 0, 0, -0.28, 8);
  tailBase.add(tailM, tailTip);
  g.add(tailBase);
  g.userData.limbs = { legs, body: torso, head, snout, tail: tailBase, tailTip };
  g.userData.kinematic = true;
  g.scale.setScalar(A.scale);
  return g;
}

// ============================ MONSTERS ============================
export function buildMonster(type) {
  const g = new THREE.Group();
  switch (type) {
    case 'dragon': {
      const body = cyl(0.3, 0.45, 1.4, 6, 0xb02030, 0, 1.1, 0);
      const head = sph(0.32, 0xc22839, 0, 1.95, 0.15);
      const wingL = box(1.1, 0.06, 0.5, 0x801525, -0.75, 1.4, -0.1);
      const wingR = box(1.1, 0.06, 0.5, 0x801525, 0.75, 1.4, -0.1);
      wingL.rotation.z = 0.4; wingR.rotation.z = -0.4;
      g.add(body, head, wingL, wingR,
        cone(0.06, 0.2, 4, 0xf5c518, -0.12, 2.2, 0.1), cone(0.06, 0.2, 4, 0xf5c518, 0.12, 2.2, 0.1),
        cone(0.15, 0.7, 5, 0x901a2a, 0, 0.45, -0.5));
      g.userData.wings = { wingL, wingR };
      g.userData.limbs = { wingL, wingR, head };
      break;
    }
    case 'troll': {
      const armL = box(0.22, 0.7, 0.22, 0x5f7161, -0.55, 0.75, 0);
      const armR = box(0.22, 0.7, 0.22, 0x5f7161, 0.55, 0.75, 0);
      g.add(cyl(0.4, 0.55, 1.1, 6, 0x5f7161, 0, 0.95, 0),
        sph(0.32, 0x6c7f6e, 0, 1.75, 0.05), armL, armR,
        box(0.26, 0.5, 0.26, 0x4c5b4e, -0.22, 0.25, 0), box(0.26, 0.5, 0.26, 0x4c5b4e, 0.22, 0.25, 0),
        cyl(0.09, 0.13, 0.9, 5, 0x7a6a4f, 0.75, 0.85, 0));
      g.userData.limbs = { armL, armR };
      break;
    }
    case 'griffin': {
      const body = box(0.7, 0.45, 0.4, 0xc9a227, 0, 0.75, 0);
      const head = sph(0.24, 0xe8e4d8, 0.45, 1.05, 0);
      const beak = cone(0.08, 0.22, 4, 0xf5c518, 0.62, 1.02, 0);
      beak.rotation.z = -Math.PI / 2;
      const wingL = box(0.9, 0.05, 0.4, 0xe8e4d8, -0.5, 1.05, 0);
      const wingR = box(0.9, 0.05, 0.4, 0xe8e4d8, 0.5, 1.05, 0);
      wingL.rotation.z = 0.35; wingR.rotation.z = -0.35;
      g.add(body, head, beak, wingL, wingR);
      g.userData.wings = { wingL, wingR };
      g.userData.limbs = { wingL, wingR };
      break;
    }
    case 'ogre': {
      const armL = box(0.24, 0.8, 0.24, 0x8f7a4f, -0.6, 0.8, 0);
      const armR = box(0.24, 0.8, 0.24, 0x8f7a4f, 0.6, 0.8, 0);
      g.add(cyl(0.45, 0.6, 1.2, 6, 0x8f7a4f, 0, 1.0, 0),
        sph(0.3, 0x9c8757, 0, 1.85, 0.05),
        cone(0.05, 0.15, 4, 0xe8e0d0, 0, 2.05, 0.1), armL, armR,
        box(0.28, 0.5, 0.28, 0x74633f, -0.24, 0.25, 0), box(0.28, 0.5, 0.28, 0x74633f, 0.24, 0.25, 0));
      g.userData.limbs = { armL, armR };
      break;
    }
    case 'ent': {
      const trunk = cyl(0.3, 0.45, 1.6, 7, 0x5d4a33, 0, 1.1, 0);
      const crown = sph(0.55, 0x3f6b35, 0, 2.2, 0);
      const armL = box(0.15, 0.9, 0.15, 0x5d4a33, -0.5, 1.2, 0);
      const armR = box(0.15, 0.9, 0.15, 0x5d4a33, 0.5, 1.2, 0);
      g.add(trunk, crown, armL, armR,
        sph(0.05, 0xf5c518, -0.12, 1.6, 0.26, 5), sph(0.05, 0xf5c518, 0.12, 1.6, 0.26, 5));
      g.userData.limbs = { armL, armR, crown };
      break;
    }
    case 'serpent': {
      const segs = [];
      for (let i = 0; i < 5; i++) {
        const s = sph(0.28 - i * 0.03, i % 2 ? 0x2f9e8f : 0x37c8ab, 0, 0.3 + Math.abs(Math.sin(i * 1.2)) * 0.35, -i * 0.42);
        g.add(s); segs.push(s);
      }
      const head = sph(0.3, 0x2a8f81, 0, 0.75, 0.35);
      g.add(head, cone(0.06, 0.3, 5, 0xe0842c, 0, 1.05, 0.35),
        sph(0.05, 0xf5c518, -0.12, 0.85, 0.55, 5), sph(0.05, 0xf5c518, 0.12, 0.85, 0.55, 5));
      g.userData.limbs = { segs, head };
      break;
    }
  }
  g.userData.kinematic = true;
  g.scale.setScalar(1.15);
  return g;
}

// ============================ FLORA ============================
export function buildTree(kind = 'oak', rng = Math.random, dna = null) {
  const g = new THREE.Group();
  const vigor = dna?.vigor ?? (0.55 + rng() * 0.45);
  const branchN = dna?.branch ?? vigor;
  const trunkG = dna?.trunk ?? vigor;
  const s = 0.62 + vigor * 0.55;
  const trunkLen = (kind === 'palm' ? 1.5 : kind === 'pine' ? 0.85 : 0.7) * (0.75 + trunkG * 0.5);
  const trunkR = (0.06 + trunkG * 0.07) * (kind === 'pine' ? 0.9 : 1);
  const lean = (rng() - 0.5) * 0.18;
  const yaw = rng() * Math.PI * 2;
  const woodKey = ensureNoiseTex((rng() * 1e9) | 0, 0x6b4f30);
  const segs = 12;

  const trunk = cyl(trunkR * 0.75, trunkR, trunkLen, segs, 0x6b4f30, 0, trunkLen * 0.5, 0, woodKey);
  trunk.rotation.z = lean;
  g.add(trunk);
  // spreading roots
  const roots = 3 + ((branchN * 4) | 0);
  for (let i = 0; i < roots; i++) {
    const root = cyl(0.018, 0.01, 0.22 + rng() * 0.18, 5, 0x5a4028, 0, 0.02, 0);
    root.rotation.z = Math.PI / 2.4;
    root.rotation.y = (i / roots) * Math.PI * 2;
    root.position.set(Math.cos(root.rotation.y) * 0.08, 0.02, Math.sin(root.rotation.y) * 0.08);
    g.add(root);
  }
  const limbs = 1 + ((branchN * 3) | 0);
  for (let i = 0; i < limbs; i++) {
    const len = 0.28 + rng() * 0.34 * (0.5 + branchN);
    const limb = cyl(trunkR * 0.45, 0.012, len, 5, 0x6b4f30, 0, trunkLen * (0.35 + rng() * 0.45), 0, woodKey);
    limb.rotation.z = 0.7 + rng() * 0.5;
    limb.rotation.y = (i / Math.max(1, limbs)) * Math.PI * 2 + rng() * 0.4;
    g.add(limb);
  }
  const grains = 3 + ((rng() * 5) | 0);
  for (let i = 0; i < grains; i++) {
    const band = cyl(trunkR * 1.02, trunkR * 1.02, 0.025, segs, i % 2 ? 0x5a4028 : 0x7a5c37, 0, 0.12 + i * (trunkLen / (grains + 1)), 0);
    band.rotation.z = lean;
    g.add(band);
  }

  if (kind === 'pine') {
    const layers = 3 + ((rng() * 2) | 0);
    for (let i = 0; i < layers; i++) {
      const rr = 0.55 - i * 0.12 * (0.8 + rng() * 0.4);
      g.add(cone(rr, 0.7 + rng() * 0.25, 8, i % 2 ? 0x2d5b3a : 0x356847, lean * 0.3, trunkLen * 0.55 + i * 0.45, 0));
    }
  } else if (kind === 'palm') {
    for (let i = 0; i < 5 + ((rng() * 3) | 0); i++) {
      const leaf = box(0.7 + rng() * 0.4, 0.035, 0.12 + rng() * 0.08, 0x4a9440, 0, trunkLen + 0.05, 0);
      leaf.rotation.y = (i / 6) * Math.PI * 2 + rng() * 0.3;
      leaf.rotation.z = 0.3 + rng() * 0.25;
      leaf.translateX(0.35);
      g.add(leaf);
    }
  } else if (kind === 'cherry') {
    g.add(sph(0.45 + rng() * 0.2, 0xe8a9c9, lean * 0.2, trunkLen * 0.85, 0, 10));
    g.add(sph(0.28 + rng() * 0.15, 0xf0b8d0, 0.2 + rng() * 0.15, trunkLen * 0.7, 0.1, 8));
  } else {
    const r1 = 0.42 + rng() * 0.22;
    g.add(sph(r1, 0x3f7a35, 0, trunkLen * 0.9, 0, 10));
    g.add(sph(r1 * 0.65, 0x498a3d, 0.2 + rng() * 0.15, trunkLen * 0.75, 0.1, 8));
    if (rng() > 0.4) g.add(sph(r1 * 0.5, 0x3a6e30, -0.22, trunkLen * 0.8, -0.08, 8));
  }
  g.rotation.y = yaw;
  g.scale.setScalar(s);
  g.userData.kind = kind;
  g.userData.grains = grains;
  return g;
}

export function buildBush(rng = Math.random) {
  const g = new THREE.Group();
  const s = 0.85 + rng() * 0.4;
  g.add(sph(0.32 + rng() * 0.1, 0x3c6e32, 0, 0.28, 0, 8));
  g.add(sph(0.22, 0x458038, 0.18, 0.26, 0.08, 7));
  if (rng() > 0.3) g.add(sph(0.18, 0x3a6a2e, -0.15, 0.24, -0.1, 6));
  for (let i = 0; i < 4 + ((rng() * 4) | 0); i++)
    g.add(sph(0.04, 0xd7263d, (rng() - 0.5) * 0.45, 0.32 + rng() * 0.15, (rng() - 0.5) * 0.45, 5));
  g.rotation.y = rng() * Math.PI * 2;
  g.scale.setScalar(s);
  return g;
}

/** Fallen wood stick — pickable holdable near trees. */
export function buildStick(rng = Math.random) {
  const g = new THREE.Group();
  const len = 0.35 + rng() * 0.25;
  const stick = cyl(0.018, 0.022, len, 6, 0x7a5c37, 0, 0.04, 0);
  stick.rotation.z = Math.PI / 2 + (rng() - 0.5) * 0.4;
  stick.rotation.y = rng() * Math.PI;
  g.add(stick);
  if (rng() > 0.5) g.add(cone(0.02, 0.06, 4, 0x5a4028, len * 0.4, 0.05, 0));
  g.userData.holdable = 'stick';
  g.userData.yields = 'wood';
  g.userData.amount = 1 + (rng() > 0.7 ? 1 : 0);
  requestUpgrade(g, { kind: 'prop', name: 'wooden stick', size: 1 });
  return g;
}

export function buildRock(rng = Math.random) {
  const g = new THREE.Group();
  const rockKey = ensureNoiseTex((rng() * 1e9) | 0, 0x8a8578);
  const r = sph(0.38 + rng() * 0.3, 0x8a8578, 0, 0.25, 0, 5);
  if (r.material) { /* keep */ }
  r.scale.y = 0.7;
  g.add(r);
  if (rng() > 0.4) g.add(sph(0.18, 0x7d7869, 0.28, 0.14, 0.12, 5));
  g.userData.yields = 'rock';
  return g;
}

export function buildMetalOre(rng = Math.random) {
  const g = new THREE.Group();
  const base = sph(0.32, 0x5a5e66, 0, 0.2, 0, 5);
  base.scale.y = 0.65;
  g.add(base);
  // glittering veins
  for (let i = 0; i < 4; i++) {
    const vein = box(0.08, 0.04, 0.18, 0xc9a227, (rng() - 0.5) * 0.3, 0.22 + rng() * 0.1, (rng() - 0.5) * 0.2);
    vein.rotation.y = rng() * Math.PI;
    g.add(vein);
  }
  g.userData.yields = 'metal';
  return g;
}

// ============================ BUILDINGS ============================
function addDoor(g, color = 0x4a3826) {
  // recessed rectangular door on +Z face
  g.add(box(0.35, 0.55, 0.06, color, 0, 0.35, 0.72));
  g.add(sph(0.03, 0xf5c518, 0.12, 0.35, 0.76, 6)); // knob
}

function hutByCiv(civKey, civ) {
  // Soft hut forms — no spikes / cones on the roof ridge. Always a door.
  const g = new THREE.Group();
  switch (civKey) {
    case 'chinese':
      g.add(box(1.6, 0.9, 1.4, 0xb8a078, 0, 0.45, 0));
      g.add(box(1.9, 0.12, 1.7, civ.color, 0, 0.98, 0)); // flat tiled eaves, no finial spike
      g.add(box(1.4, 0.08, 1.2, 0xd7263d, 0, 1.1, 0));
      addDoor(g, 0x5a3020);
      break;
    case 'vikings':
      g.add(box(2.2, 0.85, 1.2, 0x6b5538, 0, 0.42, 0));
      g.add(box(2.4, 0.1, 1.4, 0x4a3a28, 0, 0.92, 0)); // flat sod roof, no horns
      addDoor(g, 0x3a2b1e);
      break;
    case 'franks':
      g.add(box(1.6, 1.0, 1.3, 0xd4c4a0, 0, 0.5, 0));
      g.add(box(0.08, 1.0, 1.3, 0x5d4a33, -0.65, 0.5, 0));
      g.add(box(0.08, 1.0, 1.3, 0x5d4a33, 0.65, 0.5, 0));
      g.add(box(1.8, 0.14, 1.5, civ.color, 0, 1.08, 0)); // thatched flat roof
      addDoor(g);
      break;
    case 'orcs':
      g.add(sph(0.95, 0x5a4a32, 0, 0.5, 0, 10));
      g.add(box(0.9, 0.12, 0.9, civ.color, 0, 1.0, 0)); // hide flap roof, no spike
      addDoor(g, 0x3a2b1e);
      break;
    case 'elves':
      g.add(cyl(0.65, 0.85, 0.35, 10, 0x5d4a33, 0, 0.18, 0));
      g.add(cyl(0.5, 0.6, 1.0, 10, 0x4a6b3a, 0, 0.75, 0));
      g.add(sph(0.55, 0x3f8f5a, 0, 1.4, 0, 10)); // living canopy, no point
      addDoor(g, 0x3a5a30);
      break;
    case 'aztecs':
      g.add(box(1.8, 0.3, 1.8, 0xc4a06a, 0, 0.15, 0));
      g.add(box(1.3, 0.35, 1.3, 0xb89050, 0, 0.45, 0));
      g.add(box(0.9, 0.4, 0.9, civ.color, 0, 0.8, 0)); // no roof spike
      addDoor(g, 0x5a3a20);
      break;
    default:
      g.add(cyl(0.85, 0.95, 0.9, 10, 0x9c8055, 0, 0.45, 0));
      g.add(box(1.5, 0.12, 1.5, civ.color, 0, 0.98, 0));
      addDoor(g);
  }
  return g;
}

export function buildBuilding(type, civKey) {
  const civ = CIVS[civKey] || CIVS.franks;
  const g = new THREE.Group();
  switch (type) {
    case 'campfire': {
      const fire = buildCampfireMesh();
      while (fire.children.length) g.add(fire.children[0]);
      Object.assign(g.userData, fire.userData);
      break;
    }
    case 'hut': {
      const hut = hutByCiv(civKey, civ);
      while (hut.children.length) g.add(hut.children[0]);
      break;
    }
    case 'well': {
      g.add(cyl(0.55, 0.62, 0.35, 12, 0x8a8578, 0, 0.16, 0));
      g.add(cyl(0.38, 0.38, 0.08, 12, 0x2a4a55, 0, 0.28, 0));
      g.add(box(0.08, 0.7, 0.08, 0x6b4f30, -0.42, 0.55, 0));
      g.add(box(0.08, 0.7, 0.08, 0x6b4f30, 0.42, 0.55, 0));
      g.add(box(0.95, 0.06, 0.08, 0x6b4f30, 0, 0.9, 0));
      g.add(cyl(0.05, 0.05, 0.35, 8, 0x5d4a33, 0, 0.55, 0));
      break;
    }
    case 'farm': {
      g.add(box(2.4, 0.08, 1.8, 0x6e5636, 0, 0.04, 0));
      for (let r = 0; r < 4; r++) for (let c = 0; c < 5; c++)
        g.add(cone(0.07, 0.28, 4, 0xd9c66a, -0.85 + c * 0.42, 0.18, -0.55 + r * 0.4));
      g.add(box(0.55, 0.55, 0.55, 0x9c8055, 1.35, 0.28, 0), cone(0.45, 0.4, 4, civ.color, 1.35, 0.75, 0));
      break;
    }
    case 'barracks':
      g.add(box(2.0, 1.1, 1.5, 0x77705f, 0, 0.55, 0),
        cone(1.4, 0.75, 4, civ.color, 0, 1.45, 0),
        box(0.08, 1.8, 0.08, 0x5d4a33, 0.85, 0.9, 0.65),
        box(0.4, 0.28, 0.03, civ.color, 1.1, 1.6, 0.65));
      break;
    case 'temple': {
      g.add(cyl(1.2, 1.4, 0.35, 8, 0xcfc7b4, 0, 0.18, 0));
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        g.add(cyl(0.1, 0.1, 1.3, 6, 0xd8d0be, Math.cos(a) * 0.9, 0.9, Math.sin(a) * 0.9));
      }
      g.add(cone(1.3, 0.7, 8, civ.color, 0, 1.85, 0));
      const orb = sph(0.2, civ.accent, 0, 2.4, 0);
      orb.material = new THREE.MeshLambertMaterial({ color: civ.accent, emissive: civ.accent, emissiveIntensity: 0.6 });
      g.add(orb);
      break;
    }
    case 'forge': {
      g.add(box(1.8, 0.9, 1.4, 0x5a5550, 0, 0.45, 0));
      g.add(cyl(0.35, 0.4, 0.9, 8, 0x3a3835, 0.5, 0.9, 0)); // chimney
      const glow = sph(0.2, 0xff6a20, -0.3, 0.5, 0.5);
      glow.material = new THREE.MeshLambertMaterial({ color: 0xff6a20, emissive: 0xcc4400 });
      g.add(glow);
      g.add(box(0.5, 0.25, 0.4, 0x8a8578, -0.5, 0.35, 0.3)); // anvil block
      break;
    }
    case 'bridge': {
      g.add(box(3.4, 0.16, 1.2, 0x8a6f47, 0, 0.4, 0));
      for (const x of [-1.4, 0, 1.4]) {
        g.add(box(0.1, 0.55, 0.1, 0x6b4f30, x, 0.7, -0.55), box(0.1, 0.55, 0.1, 0x6b4f30, x, 0.7, 0.55));
      }
      g.add(box(3.4, 0.06, 0.06, 0x6b4f30, 0, 0.95, -0.55), box(3.4, 0.06, 0.06, 0x6b4f30, 0, 0.95, 0.55));
      break;
    }
  }
  // buildings dominate the landscape
  if (type !== 'campfire' && type !== 'bridge') g.scale.setScalar(1.45);
  else if (type === 'bridge') g.scale.setScalar(1.2);
  // The procedural mesh above is returned immediately and remains the
  // fallback. When generated assets are enabled, an upgrade is requested in
  // the background and swapped in on arrival (see generation/assetBridge.js).
  requestUpgrade(g, {
    kind: 'structure',
    name: BUILDINGS[type]?.name || type,
    era: civ.era || 'bronze',
    material: type === 'forge' ? 'stone' : 'timber',
    size: 1,
  });
  return g;
}

export function buildRelic() {
  const g = new THREE.Group();
  const base = cyl(0.25, 0.32, 0.18, 6, 0x554e40, 0, 0.09, 0);
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.22),
    new THREE.MeshLambertMaterial({ color: 0xf5c518, emissive: 0xa07a10 }));
  gem.position.y = 0.5; gem.castShadow = true;
  g.add(base, gem);
  g.userData.gem = gem;
  return g;
}

/** Abstract spell glyph model for the Lexicon. */
export function buildSpellGlyph(key) {
  const g = new THREE.Group();
  if (key === 'rain') {
    g.add(cyl(0.6, 0.6, 0.04, 32, 0x66ccff, 0, 0.5, 0));
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      g.add(box(0.04, 0.35, 0.04, 0x9db8d8, Math.cos(a) * 0.35, 0.25, Math.sin(a) * 0.35));
    }
  } else if (key === 'heal') {
    g.add(cyl(0.55, 0.55, 0.04, 28, 0xa8ffe0, 0, 0.45, 0));
    g.add(box(0.12, 0.55, 0.12, 0xe8fff8, 0, 0.55, 0));
    g.add(box(0.55, 0.12, 0.12, 0xe8fff8, 0, 0.55, 0));
  } else if (key === 'shield') {
    g.add(sph(0.45, 0xe8c064, 0, 0.5, 0, 12));
    g.children[0].material = new THREE.MeshLambertMaterial({
      color: 0xe8c064, transparent: true, opacity: 0.45, wireframe: true,
    });
  } else if (key === 'lightning') {
    const pts = [[0, 1.2], [0.15, 0.7], [-0.1, 0.7], [0.2, 0.2], [-0.05, 0.2], [0.1, -0.1]];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const dx = b[0] - a[0], dy = b[1] - a[1];
      const len = Math.hypot(dx, dy);
      const bolt = box(0.08, len, 0.08, 0xfff3a0, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 0.3, 0);
      bolt.rotation.z = -Math.atan2(dx, dy);
      bolt.material = new THREE.MeshLambertMaterial({ color: 0xfff3a0, emissive: 0xccaa40 });
      g.add(bolt);
    }
  } else if (key === 'storm') {
    g.add(cyl(0.5, 0.2, 0.15, 16, 0x8fa3b8, 0, 0.7, 0));
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      g.add(box(0.35, 0.04, 0.04, 0x9db8d8, Math.cos(a) * 0.25, 0.4, Math.sin(a) * 0.25));
    }
  } else if (key === 'meteor' || key === 'earthquake') {
    const ball = sph(0.35, key === 'meteor' ? 0x5a4030 : 0x8a6b45, 0, 0.5, 0);
    ball.material = new THREE.MeshLambertMaterial({ color: key === 'meteor' ? 0x5a4030 : 0x8a6b45, emissive: 0x331800 });
    g.add(ball);
  } else {
    const ball = sph(0.35, 0xff6a20, 0, 0.5, 0);
    ball.material = new THREE.MeshLambertMaterial({ color: 0xff6a20, emissive: 0xcc4400 });
    g.add(ball);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      g.add(cone(0.08, 0.3, 4, 0xff9540, Math.cos(a) * 0.4, 0.5, Math.sin(a) * 0.4));
    }
  }
  return g;
}

// ============================ CATALOG (for gallery) ============================
export function buildCatalog() {
  const items = [];
  for (const civKey of Object.keys(CIVS)) {
    const civ = CIVS[civKey];
    for (const clsKey of Object.keys(CLASSES)) {
      const cls = CLASSES[clsKey];
      items.push({
        name: `${civ.name} ${cls.name}`, category: 'unit', civ: civKey,
        factory: () => buildHuman(civKey, clsKey),
        stats: {
          Role: cls.role, HP: cls.hp,
          Strength: (cls.baseStr * (1 + (civ.bonus.strength || 0))).toFixed(2),
          Intelligence: (cls.baseInt * (1 + (civ.bonus.intelligence || 0))).toFixed(2),
          Speed: clsKey === 'knight' ? '2.6' : '2.2',
          Lifespan: `${Math.round(60 * (1 + (civ.bonus.longevity || 0)))}y`,
        },
      });
    }
    items.push({
      name: civ.animal[0].toUpperCase() + civ.animal.slice(1), category: 'animal', civ: civKey,
      factory: () => buildAnimal(civ.animal),
      stats: { HP: 30, Speed: '2.8', Diet: 'herbivore-ish', Behavior: 'roams, flees the hand', Food: '+10 when hunted', Home: civ.name },
    });
    items.push({
      name: civ.monster[0].toUpperCase() + civ.monster.slice(1), category: 'monster', civ: civKey,
      factory: () => buildMonster(civ.monster),
      stats: { HP: 220, Strength: '3.5', Speed: '1.8', Behavior: 'territorial predator', Aging: 'mythical — none', Fear: 'inspires terror' },
    });
    items.push({
      name: `${civ.name} Hut`, category: 'building', civ: civKey,
      factory: () => buildBuilding('hut', civKey),
      stats: { Role: 'shelter', HP: BUILDINGS.hut.hp, Wood: BUILDINGS.hut.wood, Rock: BUILDINGS.hut.rock, Intent: BUILDINGS.hut.intent },
    });
  }
  for (const bKey of Object.keys(BUILDINGS)) {
    if (bKey === 'hut') continue; // already per-civ
    const b = BUILDINGS[bKey];
    items.push({
      name: b.name, category: 'building', civ: 'all',
      factory: () => buildBuilding(bKey, 'franks'),
      stats: {
        Role: b.role || '—', HP: b.hp, Wood: b.wood, Rock: b.rock || 0, Metal: b.metal || 0,
        Divine: b.dp, Tech: b.tech || 'none', Intent: b.intent, Effect: b.desc,
      },
    });
  }
  for (const t of ['oak', 'pine', 'palm', 'cherry']) {
    items.push({
      name: t[0].toUpperCase() + t.slice(1) + ' tree', category: 'flora', civ: 'all',
      factory: () => buildTree(t, () => 0.5),
      stats: { Wood: '+12 chopped', Grains: '4–12 (craft quality)', Biome: t === 'pine' ? 'highlands' : t === 'palm' ? 'shore' : 'plains', Grab: 'yes', Shake: 'drops wood', Growth: 'grows over time' },
    });
  }
  items.push({
    name: 'Berry bush', category: 'flora', civ: 'all', factory: () => buildBush(() => 0.5),
    stats: { Food: '+20 total', Regrow: 'naturally, faster in rain', Grab: 'no', Biome: 'plains' },
  });
  items.push({
    name: 'Rock', category: 'object', civ: 'all', factory: () => buildRock(() => 0.5),
    stats: { Yield: 'rock', Use: 'masonry, forges, bridges', Grab: 'yes', Amount: '8–14' },
  });
  items.push({
    name: 'Wood stick', category: 'object', civ: 'all', factory: () => buildStick(() => 0.5),
    stats: { Yield: 'wood', Found: 'under trees', Hold: 'yes', Deposit: 'campfire +1–2 wood' },
  });
  items.push({
    name: 'Metal ore', category: 'object', civ: 'all', factory: () => buildMetalOre(() => 0.5),
    stats: { Yield: 'metal', Use: 'barracks, forges, advanced builds', Veins: 'golden glitter', Amount: '5–10' },
  });
  items.push({
    name: 'Snake', category: 'animal', civ: 'all', factory: () => buildAnimal('snake'),
    stats: { HP: 12, Behavior: 'slithers, bites trespassers', Bite: '4 dmg + fear', Biome: 'everywhere' },
  });
  items.push({
    name: 'Fish', category: 'animal', civ: 'all', factory: () => buildAnimal('fish'),
    stats: { HP: 8, Behavior: 'schools in rivers — can be fished', Habitat: 'water only', Food: '+6 when caught' },
  });
  for (const sp of SPELLS) {
    items.push({
      name: sp.name, category: 'spell', civ: 'all',
      factory: () => buildSpellGlyph(sp.key),
      stats: {
        Glyph: sp.glyph, Cost: `${sp.cost} ✦ (base)`,
        Cast: sp.cast, Power: 'scales with tribal Faith',
        Effect: sp.desc,
      },
    });
  }
  return items;
}
