// Procedural 3D model factory. Every model in the game is generated here
// from Three.js primitives only — no external assets.
import * as THREE from 'three';
import { CIVS, CLASSES, BUILDINGS, SPELLS } from './civs.js';
import { noiseTextureDataURL, mulberry32 } from './util.js';

const matCache = new Map();
const texCache = new Map();

export function mat(color, opts = {}) {
  const key = color + '|' + (opts.emissive || 0) + '|' + (opts.flat ? 1 : 0) + '|' + (opts.mapKey || '');
  if (!matCache.has(key)) {
    const m = new THREE.MeshLambertMaterial({
      color, emissive: opts.emissive || 0x000000, flatShading: true,
    });
    if (opts.mapKey && texCache.has(opts.mapKey)) m.map = texCache.get(opts.mapKey);
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
  const hips = cyl(0.11, 0.13, 0.14, 10, cloth, 0, 0.42, 0, clothKey);
  const belly = cyl(0.13, 0.12, 0.16, 10, cloth, 0, 0.56, 0, clothKey);
  const chest = cyl(0.12, 0.14, 0.18, 10, cloth, 0, 0.72, 0, clothKey);
  g.add(hips, belly, chest);

  // shoulders
  const shL = sph(0.07, skin, -0.16, 0.82, 0, 10);
  const shR = sph(0.07, skin, 0.16, 0.82, 0, 10);
  g.add(shL, shR);

  // head + nose
  const head = sph(0.115, skin, 0, 0.98, 0, 12);
  const nose = cone(0.025, 0.05, 6, skin, 0, 0.97, 0.11);
  nose.rotation.x = Math.PI / 2;
  g.add(head, nose);

  // legs with knees (upper + lower)
  const thighL = box(0.07, 0.16, 0.07, 0x3a3226, -0.07, 0.28, 0);
  const thighR = box(0.07, 0.16, 0.07, 0x3a3226, 0.07, 0.28, 0);
  const kneeL = sph(0.04, skin, -0.07, 0.18, 0, 8);
  const kneeR = sph(0.04, skin, 0.07, 0.18, 0, 8);
  const shinL = box(0.06, 0.15, 0.06, 0x3a3226, -0.07, 0.09, 0);
  const shinR = box(0.06, 0.15, 0.06, 0x3a3226, 0.07, 0.09, 0);
  g.add(thighL, thighR, kneeL, kneeR, shinL, shinR);

  // arms with elbows + spherical hands
  const uArmL = box(0.055, 0.14, 0.055, skin, -0.22, 0.74, 0);
  const uArmR = box(0.055, 0.14, 0.055, skin, 0.22, 0.74, 0);
  const elbL = sph(0.035, skin, -0.22, 0.64, 0, 8);
  const elbR = sph(0.035, skin, 0.22, 0.64, 0, 8);
  const lArmL = box(0.05, 0.13, 0.05, skin, -0.22, 0.55, 0);
  const lArmR = box(0.05, 0.13, 0.05, skin, 0.22, 0.55, 0);
  const handL = sph(0.04, skin, -0.22, 0.46, 0, 8);
  const handR = sph(0.04, skin, 0.22, 0.46, 0, 8);
  g.add(uArmL, uArmR, elbL, elbR, lArmL, lArmR, handL, handR);

  // kinematic handles (animate these)
  g.userData.limbs = {
    legL: thighL, legR: thighR, shinL, shinR, kneeL, kneeR,
    armL: uArmL, armR: uArmR, lArmL, lArmR, elbL, elbR,
    handL, handR, shL, shR, hips, belly, chest, head, nose,
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
    for (let i = 0; i < 6; i++) {
      const s = sph(0.09 - i * 0.008, i % 2 ? 0x5a7a3a : 0x6f8f4a, Math.sin(i * 1.4) * 0.12, 0.08, -i * 0.16, 6);
      g.add(s); segs.push(s);
    }
    const head = sph(0.1, 0x50702f, Math.sin(-1.4) * 0.12, 0.1, 0.15, 6);
    g.add(head, sph(0.02, 0xd7263d, head.position.x, 0.12, 0.27, 4));
    g.userData.slither = true;
    g.userData.limbs = { segs, head };
    g.userData.kinematic = true;
    return g;
  }
  if (type === 'fish') {
    const body = sph(0.16, 0x6aa7c8, 0, 0, 0, 7);
    body.scale.set(1.6, 0.8, 0.7);
    const tail = cone(0.1, 0.18, 4, 0x578cab, -0.3, 0, 0);
    tail.rotation.z = Math.PI / 2;
    const fin = cone(0.05, 0.12, 4, 0x578cab, 0.02, 0.13, 0);
    g.add(body, tail, fin, sph(0.025, 0x10202c, 0.2, 0.03, 0.09, 4));
    g.userData.fish = true;
    g.userData.limbs = { body, tail, fin };
    g.userData.kinematic = true;
    return g;
  }
  const A = {
    panda: { body: 0xf0f0ea, head: 0xf0f0ea, dark: 0x2a2a2a, scale: 1 },
    wolf: { body: 0x8a8f99, head: 0x9aa0aa, dark: 0x4a4f58, scale: 0.9 },
    boar: { body: 0x6b4f35, head: 0x7a5c3f, dark: 0x3f2e1e, scale: 0.85 },
    warg: { body: 0x55584a, head: 0x606352, dark: 0x33352c, scale: 1.05 },
    deer: { body: 0xb08d5e, head: 0xbd9a6b, dark: 0x6f5636, scale: 0.9 },
    jaguar: { body: 0xd9a441, head: 0xe0ac4c, dark: 0x6e5220, scale: 0.9 },
  }[type] || { body: 0x999999, head: 0xaaaaaa, dark: 0x555555, scale: 1 };

  const body = box(0.6, 0.35, 0.3, A.body, 0, 0.42, 0);
  const head = sph(0.15, A.head, 0.38, 0.55, 0, 10);
  const snout = sph(0.08, A.head, 0.52, 0.5, 0, 8);
  g.add(body, head, snout);
  // ears
  g.add(sph(0.05, A.dark, 0.34, 0.72, -0.08, 6), sph(0.05, A.dark, 0.34, 0.72, 0.08, 6));
  // eyes + teeth hint
  g.add(sph(0.025, 0x101010, 0.48, 0.58, -0.07, 5), sph(0.025, 0x101010, 0.48, 0.58, 0.07, 5));
  g.add(cone(0.015, 0.04, 4, 0xe8e0d0, 0.58, 0.46, -0.03), cone(0.015, 0.04, 4, 0xe8e0d0, 0.58, 0.46, 0.03));
  const legs = [];
  for (const [x, z] of [[-0.2, -0.1], [-0.2, 0.1], [0.2, -0.1], [0.2, 0.1]]) {
    const thigh = box(0.08, 0.14, 0.08, A.dark, x, 0.22, z);
    const knee = sph(0.04, A.body, x, 0.14, z, 5);
    const shin = box(0.07, 0.12, 0.07, A.dark, x, 0.07, z);
    g.add(thigh, knee, shin); legs.push(thigh, shin);
  }
  if (type === 'panda') {
    g.add(sph(0.07, A.dark, 0.44, 0.7, -0.09, 6), sph(0.07, A.dark, 0.44, 0.7, 0.09, 6));
    g.add(box(0.28, 0.16, 0.31, A.dark, -0.05, 0.42, 0));
  }
  if (type === 'deer') {
    g.add(cone(0.02, 0.25, 4, 0x8a6f47, 0.34, 0.78, -0.08), cone(0.02, 0.25, 4, 0x8a6f47, 0.34, 0.78, 0.08));
  }
  if (type === 'boar' || type === 'warg') {
    g.add(cone(0.03, 0.1, 4, 0xe8e0d0, 0.5, 0.48, -0.06), cone(0.03, 0.1, 4, 0xe8e0d0, 0.5, 0.48, 0.06));
  }
  if (type === 'jaguar') for (let i = 0; i < 5; i++)
    g.add(sph(0.03, A.dark, -0.2 + i * 0.1, 0.62, (i % 2 ? 0.12 : -0.12), 5));
  if (type === 'wolf' || type === 'warg')
    g.add(cone(0.05, 0.12, 4, A.dark, 0.32, 0.72, -0.07), cone(0.05, 0.12, 4, A.dark, 0.32, 0.72, 0.07));
  // articulated tail
  const tailBase = box(0.06, 0.06, 0.12, A.dark, -0.28, 0.5, 0);
  const tailTip = sph(0.045, A.dark, -0.42, 0.48, 0, 6);
  g.add(tailBase, tailTip);
  g.userData.limbs = { legs, body, head, snout, tail: tailBase, tailTip };
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
export function buildTree(kind = 'oak', rng = Math.random) {
  const g = new THREE.Group();
  // smaller trees, slow growers — variance in trunk lean, radius, canopy
  const s = 0.72 + rng() * 0.45;
  const trunkLen = (kind === 'palm' ? 1.5 : kind === 'pine' ? 0.85 : 0.7) * (0.85 + rng() * 0.35);
  const trunkR = (0.07 + rng() * 0.05) * (kind === 'pine' ? 0.9 : 1);
  const lean = (rng() - 0.5) * 0.18;
  const yaw = rng() * Math.PI * 2;
  const woodKey = ensureNoiseTex((rng() * 1e9) | 0, 0x6b4f30);
  const segs = 12;

  const trunk = cyl(trunkR * 0.75, trunkR, trunkLen, segs, 0x6b4f30, 0, trunkLen * 0.5, 0, woodKey);
  trunk.rotation.z = lean;
  g.add(trunk);
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
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const st = sph(0.16 + (i % 3) * 0.04, 0x8a8578, Math.cos(a) * 0.85, 0.1, Math.sin(a) * 0.85, 5);
        st.scale.y = 0.7;
        g.add(st);
      }
      for (let i = 0; i < 6; i++) {
        const log = cyl(0.07, 0.07, 0.95, 5, 0x6b4f30, 0, 0.14, 0);
        log.rotation.z = Math.PI / 2.4;
        log.rotation.y = (i / 6) * Math.PI * 2;
        g.add(log);
      }
      const flame = cone(0.3, 0.85, 6, 0xff8c2e, 0, 0.55, 0);
      flame.material = new THREE.MeshLambertMaterial({ color: 0xff8c2e, emissive: 0xdd5510 });
      const flame2 = cone(0.17, 0.55, 6, 0xffd050, 0, 0.65, 0);
      flame2.material = new THREE.MeshLambertMaterial({ color: 0xffd050, emissive: 0xcc9910 });
      g.add(flame, flame2);
      g.userData.flame = flame;
      g.userData.flame2 = flame2;
      const light = new THREE.PointLight(0xff9540, 8, 12);
      light.position.y = 1.1;
      g.add(light);
      g.userData.light = light;
      break;
    }
    case 'hut': {
      const hut = hutByCiv(civKey, civ);
      while (hut.children.length) g.add(hut.children[0]);
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
