import * as THREE from "https://esm.sh/three@0.161.0";
import { type WorldMap } from "../../mapgen/MapTypes";
import { idx } from "../../mapgen/MapTypes";
import { createCharacter, type CharacterModel } from "./CharacterRig";
import { createTerrain } from "./TerrainMesh";

export class GameRenderer3D {
  readonly canvas: HTMLCanvasElement;

  #renderer: THREE.WebGLRenderer;
  #scene = new THREE.Scene();
  #camera: THREE.PerspectiveCamera;
  #clock = new THREE.Clock();
  #raf = 0;

  #terrain: THREE.Mesh | null = null;
  #water: THREE.Mesh | null = null;
  #character: CharacterModel | null = null;

  // Camera controller (simple orbital side view with panning target)
  #target = new THREE.Vector3(0, 0, 0);
  #yaw = -0.65;
  #pitch = 0.78;
  #distance = 85;

  readonly raycaster = new THREE.Raycaster();
  readonly pointerNdc = new THREE.Vector2();

  constructor(opts: { quality: "low" | "high" }) {
    this.canvas = document.createElement("canvas");
    this.canvas.className = "dl-layer";

    this.#renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: opts.quality === "high",
      alpha: false,
      powerPreference: "high-performance",
    });
    this.#renderer.setPixelRatio(Math.min(window.devicePixelRatio, opts.quality === "high" ? 2 : 1.25));
    this.#renderer.shadowMap.enabled = opts.quality === "high";
    this.#renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.#camera = new THREE.PerspectiveCamera(55, 1, 0.1, 2000);

    this.#scene.background = new THREE.Color(0x070914);

    const hemi = new THREE.HemisphereLight(0xbfd6ff, 0x151624, 0.85);
    this.#scene.add(hemi);

    const dir = new THREE.DirectionalLight(0xffffff, 1.25);
    dir.position.set(90, 140, 60);
    dir.castShadow = opts.quality === "high";
    dir.shadow.mapSize.set(opts.quality === "high" ? 2048 : 1024, opts.quality === "high" ? 2048 : 1024);
    dir.shadow.camera.near = 10;
    dir.shadow.camera.far = 420;
    dir.shadow.camera.left = -160;
    dir.shadow.camera.right = 160;
    dir.shadow.camera.top = 160;
    dir.shadow.camera.bottom = -160;
    this.#scene.add(dir);

    // Subtle atmosphere fog for depth separation (cheap).
    this.#scene.fog = new THREE.FogExp2(0x070914, 0.006);

    this.resize();
  }

  setWorld(map: WorldMap) {
    this.#terrain?.removeFromParent();
    this.#water?.removeFromParent();
    this.#terrain?.geometry.dispose();
    (this.#terrain?.material as any)?.dispose?.();

    const { terrain, water } = createTerrain(map, { verticalScale: 24 });
    terrain.castShadow = false;
    terrain.receiveShadow = true;
    water.receiveShadow = true;

    this.#scene.add(terrain);
    this.#scene.add(water);
    this.#terrain = terrain;
    this.#water = water;

    // Spawn character at map spawn (convert to world coords relative to plane center).
    this.#character?.root.removeFromParent();
    this.#character = createCharacter();
    this.#scene.add(this.#character.root);

    const sx = map.spawn.x - (map.width - 1) / 2;
    const sz = map.spawn.y - (map.height - 1) / 2;
    const y = sampleTerrainHeightAtMesh(terrain, map, map.spawn.x, map.spawn.y, 24);
    this.#character.root.position.set(sx, y, sz);

    // Camera target on spawn.
    this.#target.set(sx, y, sz);
    this.#distance = 85;
    this.#yaw = -0.65;
    this.#pitch = 0.78;
    this.#updateCamera();
  }

  getCharacter(): CharacterModel | null {
    return this.#character;
  }

  setSelected(selected: boolean) {
    this.#character?.setSelected(selected);
  }

  panBy(dx: number, dy: number) {
    // Pan target in camera-right / camera-forward on ground plane.
    const right = new THREE.Vector3().setFromMatrixColumn(this.#camera.matrix, 0).normalize();
    const forward = new THREE.Vector3().setFromMatrixColumn(this.#camera.matrix, 2).normalize();
    forward.y = 0;
    forward.normalize();
    const scale = this.#distance * 0.0016;
    this.#target.addScaledVector(right, -dx * scale);
    this.#target.addScaledVector(forward, dy * scale);
    this.#updateCamera();
  }

  zoom(delta: number) {
    const factor = delta > 0 ? 1.08 : 0.92;
    this.#distance = clamp(this.#distance * factor, 35, 220);
    this.#updateCamera();
  }

  setPointerFromClient(clientX: number, clientY: number) {
    const rect = this.canvas.getBoundingClientRect();
    const x = (clientX - rect.left) / rect.width;
    const y = (clientY - rect.top) / rect.height;
    this.pointerNdc.set(x * 2 - 1, -(y * 2 - 1));
  }

  hitTestCharacter(): boolean {
    if (!this.#character) return false;
    this.raycaster.setFromCamera(this.pointerNdc, this.#camera);
    const hits = this.raycaster.intersectObject(this.#character.hit, false);
    return hits.length > 0;
  }

  start() {
    const tick = () => {
      const t = this.#clock.getElapsedTime();
      this.#character?.update(t);
      this.#renderer.render(this.#scene, this.#camera);
      this.#raf = requestAnimationFrame(tick);
    };
    this.#raf = requestAnimationFrame(tick);
  }

  resize() {
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);
    this.#renderer.setSize(w, h, false);
    this.#camera.aspect = w / h;
    this.#camera.updateProjectionMatrix();
  }

  destroy() {
    cancelAnimationFrame(this.#raf);
    this.#renderer.dispose();
  }

  #updateCamera() {
    const cy = Math.cos(this.#yaw);
    const sy = Math.sin(this.#yaw);
    const cp = Math.cos(this.#pitch);
    const sp = Math.sin(this.#pitch);
    const offset = new THREE.Vector3(
      sy * cp,
      sp,
      cy * cp,
    ).multiplyScalar(this.#distance);
    this.#camera.position.copy(this.#target).add(offset);
    this.#camera.lookAt(this.#target);
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function sampleTerrainHeightAtMesh(
  _mesh: THREE.Mesh,
  map: WorldMap,
  x: number,
  y: number,
  verticalScale: number,
): number {
  // Height is encoded as (h - seaLevel) * verticalScale in TerrainMesh.
  // Use cell height directly for now.
  const c = map.cells[idx(map.width, x, y)];
  return (c.h - map.seaLevel) * verticalScale;
}

