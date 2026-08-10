import * as THREE from "three";

export type CharacterModel = {
  root: THREE.Group;
  hit: THREE.Object3D;
  ring: THREE.Mesh;
  setSelected: (selected: boolean) => void;
  update: (t: number) => void;
};

export function createCharacter(): CharacterModel {
  const root = new THREE.Group();
  root.name = "PlayerCharacter";

  const skin = new THREE.MeshStandardMaterial({ color: new THREE.Color(0xd9b08c), roughness: 0.9, metalness: 0.0, flatShading: true });
  const cloth = new THREE.MeshStandardMaterial({ color: new THREE.Color(0x2b3b6b), roughness: 0.95, metalness: 0.0, flatShading: true });
  const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color(0x161a23), roughness: 0.95, metalness: 0.0, flatShading: true });

  // Body proportions (stylized lowpoly).
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.52, 0.22), cloth);
  torso.position.set(0, 0.52, 0);
  torso.castShadow = true;

  const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.18, 0), skin);
  head.position.set(0, 0.88, 0);
  head.castShadow = true;

  const hip = new THREE.Group();
  hip.position.set(0, 0.32, 0);

  const legGeo = new THREE.CylinderGeometry(0.07, 0.08, 0.42, 5);
  const armGeo = new THREE.CylinderGeometry(0.05, 0.06, 0.36, 5);
  const handGeo = new THREE.BoxGeometry(0.07, 0.06, 0.09);
  const footGeo = new THREE.BoxGeometry(0.11, 0.06, 0.16);

  const lLeg = new THREE.Mesh(legGeo, dark);
  lLeg.position.set(-0.12, 0.10, 0);
  lLeg.castShadow = true;
  const rLeg = new THREE.Mesh(legGeo, dark);
  rLeg.position.set(0.12, 0.10, 0);
  rLeg.castShadow = true;

  const lFoot = new THREE.Mesh(footGeo, dark);
  lFoot.position.set(-0.12, -0.12, 0.05);
  lFoot.castShadow = true;
  const rFoot = new THREE.Mesh(footGeo, dark);
  rFoot.position.set(0.12, -0.12, 0.05);
  rFoot.castShadow = true;

  const shoulders = new THREE.Group();
  shoulders.position.set(0, 0.72, 0);

  const lArm = new THREE.Mesh(armGeo, cloth);
  lArm.position.set(-0.30, 0.0, 0);
  lArm.rotation.z = Math.PI * 0.12;
  lArm.castShadow = true;
  const rArm = new THREE.Mesh(armGeo, cloth);
  rArm.position.set(0.30, 0.0, 0);
  rArm.rotation.z = -Math.PI * 0.12;
  rArm.castShadow = true;

  const lHand = new THREE.Mesh(handGeo, skin);
  lHand.position.set(-0.38, -0.18, 0);
  lHand.castShadow = true;
  const rHand = new THREE.Mesh(handGeo, skin);
  rHand.position.set(0.38, -0.18, 0);
  rHand.castShadow = true;

  root.add(torso, head, hip, shoulders);
  hip.add(lLeg, rLeg, lFoot, rFoot);
  shoulders.add(lArm, rArm, lHand, rHand);

  // Selection ring slightly above ground.
  const ringGeo = new THREE.TorusGeometry(0.32, 0.03, 10, 48);
  const ringMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0x77e2ff),
    emissive: new THREE.Color(0x2aa7c8),
    emissiveIntensity: 0.6,
    roughness: 0.35,
    metalness: 0.15,
    transparent: true,
    opacity: 0.0,
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.04;
  ring.visible = true;

  // Hit proxy: a simple sphere.
  const hit = new THREE.Mesh(new THREE.SphereGeometry(0.55, 10, 10), new THREE.MeshBasicMaterial({ visible: false }));
  hit.position.set(0, 0.55, 0);

  root.add(ring, hit);

  let selected = false;
  let selectT = 0;
  const setSelected = (v: boolean) => {
    selected = v;
    selectT = 0;
    const m = ring.material as THREE.MeshStandardMaterial;
    m.opacity = v ? 1.0 : 0.0;
  };

  const update = (t: number) => {
    // Idle animation: breathing + micro sway.
    const breathe = 0.02 * Math.sin(t * 2.1);
    torso.scale.setScalar(1.0 + breathe);
    head.position.y = 0.88 + breathe * 1.6;
    shoulders.rotation.y = 0.08 * Math.sin(t * 0.8);

    if (selected) {
      selectT = Math.min(1, selectT + 0.06);
      const pulse = 0.5 + 0.5 * Math.sin(t * 4.0);
      ring.scale.setScalar(1.0 + pulse * 0.08);
      (ring.material as THREE.MeshStandardMaterial).opacity = 0.65 + pulse * 0.25;
      // Tiny “acknowledge” arm raise at selection onset.
      const k = easeOutBack(selectT);
      lArm.rotation.z = Math.PI * (0.12 + 0.28 * k);
      rArm.rotation.z = -Math.PI * (0.12 + 0.28 * k);
    } else {
      // Return arms to rest smoothly.
      lArm.rotation.z = lerp(lArm.rotation.z, Math.PI * 0.12, 0.08);
      rArm.rotation.z = lerp(rArm.rotation.z, -Math.PI * 0.12, 0.08);
      ring.scale.setScalar(lerp(ring.scale.x, 1.0, 0.08));
    }
  };

  return { root, hit, ring, setSelected, update };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function easeOutBack(x: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}

