import * as THREE from "three";
import { type WorldMap } from "../../mapgen/MapTypes";
import { idx } from "../../mapgen/MapTypes";
import { createCharacter, type CharacterModel } from "./CharacterRig";
import { createTerrain } from "./TerrainMesh";
import { createOcean, type Ocean } from "./Ocean";
import { createSkyDome, type SkyDome } from "./SkyDome";

const VERTICAL_SCALE = 24;
const SUN_DIR = new THREE.Vector3(0.45, 0.62, 0.38).normalize();
const FOG_DENSITY = 0.0016;

export type PerfStats = {
  fps: number;
  frameMs: number;
  pixelRatio: number;
  drawCalls: number;
  triangles: number;
};

export class GameRenderer3D {
  readonly canvas: HTMLCanvasElement;

  #renderer: THREE.WebGLRenderer;
  #scene = new THREE.Scene();
  #camera: THREE.PerspectiveCamera;
  #clock = new THREE.Clock();
  #raf = 0;

  #terrain: THREE.Mesh | null = null;
  #ocean: Ocean | null = null;
  #sky: SkyDome;
  #character: CharacterModel | null = null;

  // Camera controller (simple orbital side view with panning target)
  #target = new THREE.Vector3(0, 0, 0);
  #yaw = -0.65;
  #pitch = 0.78;
  #distance = 85;

  // Keyboard camera state (camera is the only keyboard-driven system).
  #keys = new Set<string>();
  #onKeyDown = (ev: KeyboardEvent) => {
    if (ev.repeat) return;
    this.#keys.add(ev.code);
  };
  #onKeyUp = (ev: KeyboardEvent) => {
    this.#keys.delete(ev.code);
  };
  #onBlur = () => this.#keys.clear();

  // Adaptive pixel ratio: never let the frame rate sag below ~58 fps.
  #prCap: number;
  #pixelRatio: number;
  #frameAcc = 0;
  #frameCount = 0;

  readonly perf: PerfStats = { fps: 60, frameMs: 16.7, pixelRatio: 1, drawCalls: 0, triangles: 0 };

  readonly raycaster = new THREE.Raycaster();
  readonly pointerNdc = new THREE.Vector2();

  // Pooled scratch vectors — no allocation in the render loop.
  #scratchA = new THREE.Vector3();
  #scratchB = new THREE.Vector3();

  constructor(opts: { quality: "low" | "high" }) {
    this.canvas = document.createElement("canvas");
    this.canvas.className = "dl-layer";

    this.#renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: opts.quality === "high",
      alpha: false,
      powerPreference: "high-performance",
    });
    this.#prCap = Math.min(window.devicePixelRatio, opts.quality === "high" ? 2 : 1.25);
    this.#pixelRatio = this.#prCap;
    this.#renderer.setPixelRatio(this.#pixelRatio);
    this.#renderer.shadowMap.enabled = opts.quality === "high";
    this.#renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.#camera = new THREE.PerspectiveCamera(55, 1, 0.1, 2000);

    // Day scene: banded sky dome + warm sun + soft blue ambient bounce.
    this.#sky = createSkyDome({ sunDir: SUN_DIR });
    this.#scene.add(this.#sky.mesh);
    this.#scene.background = this.#sky.horizonColor;
    this.#scene.fog = new THREE.FogExp2(this.#sky.horizonColor, FOG_DENSITY);

    const hemi = new THREE.HemisphereLight(0xdff0ff, 0x8a9a7a, 0.85);
    this.#scene.add(hemi);

    const dir = new THREE.DirectionalLight(0xfff1d6, 1.35);
    dir.position.copy(SUN_DIR).multiplyScalar(280);
    dir.castShadow = opts.quality === "high";
    dir.shadow.mapSize.set(opts.quality === "high" ? 2048 : 1024, opts.quality === "high" ? 2048 : 1024);
    dir.shadow.camera.near = 10;
    dir.shadow.camera.far = 700;
    dir.shadow.camera.left = -160;
    dir.shadow.camera.right = 160;
    dir.shadow.camera.top = 160;
    dir.shadow.camera.bottom = -160;
    this.#scene.add(dir);

    window.addEventListener("keydown", this.#onKeyDown);
    window.addEventListener("keyup", this.#onKeyUp);
    window.addEventListener("blur", this.#onBlur);

    this.resize();
  }

  setWorld(map: WorldMap) {
    this.#terrain?.removeFromParent();
    this.#terrain?.geometry.dispose();
    (this.#terrain?.material as THREE.Material | undefined)?.dispose?.();
    this.#ocean?.mesh.removeFromParent();
    this.#ocean?.dispose();

    const { terrain } = createTerrain(map, { verticalScale: VERTICAL_SCALE });
    terrain.castShadow = false;
    terrain.receiveShadow = true;
    this.#scene.add(terrain);
    this.#terrain = terrain;

    this.#ocean = createOcean(map, {
      verticalScale: VERTICAL_SCALE,
      sunDir: SUN_DIR,
      fogColor: this.#sky.horizonColor,
      fogDensity: FOG_DENSITY,
    });
    this.#scene.add(this.#ocean.mesh);

    // Spawn character at map spawn (convert to world coords relative to plane center).
    this.#character?.root.removeFromParent();
    this.#character = createCharacter();
    this.#scene.add(this.#character.root);

    const sx = map.spawn.x - (map.width - 1) / 2;
    const sz = map.spawn.y - (map.height - 1) / 2;
    const y = sampleTerrainHeight(map, map.spawn.x, map.spawn.y, VERTICAL_SCALE);
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
    const right = this.#scratchA.setFromMatrixColumn(this.#camera.matrix, 0).normalize();
    const forward = this.#scratchB.setFromMatrixColumn(this.#camera.matrix, 2);
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
      const dt = Math.min(this.#clock.getDelta(), 0.1);
      const t = this.#clock.getElapsedTime();

      this.#updateKeyboardCamera(dt);
      this.#character?.update(t);
      this.#ocean?.update(t);

      this.#renderer.render(this.#scene, this.#camera);
      this.#trackPerformance(dt);
      this.#raf = requestAnimationFrame(tick);
    };
    this.#raf = requestAnimationFrame(tick);
  }

  resize() {
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);
    this.#renderer.setPixelRatio(this.#pixelRatio);
    this.#renderer.setSize(w, h, false);
    this.#camera.aspect = w / h;
    this.#camera.updateProjectionMatrix();
  }

  destroy() {
    cancelAnimationFrame(this.#raf);
    window.removeEventListener("keydown", this.#onKeyDown);
    window.removeEventListener("keyup", this.#onKeyUp);
    window.removeEventListener("blur", this.#onBlur);
    this.#ocean?.dispose();
    this.#sky.dispose();
    this.#renderer.dispose();
  }

  #updateKeyboardCamera(dt: number) {
    const k = this.#keys;
    if (k.size === 0) return;

    let panX = 0;
    let panY = 0;
    if (k.has("KeyW") || k.has("ArrowUp")) panY += 1;
    if (k.has("KeyS") || k.has("ArrowDown")) panY -= 1;
    if (k.has("KeyA") || k.has("ArrowLeft")) panX += 1;
    if (k.has("KeyD") || k.has("ArrowRight")) panX -= 1;

    if (panX !== 0 || panY !== 0) {
      // Reuse pointer-pan path with a dt-scaled synthetic pixel delta.
      const speed = 620 * dt;
      this.panBy(panX * speed, panY * speed);
    }

    let rot = 0;
    if (k.has("KeyQ")) rot += 1;
    if (k.has("KeyE")) rot -= 1;
    if (rot !== 0) {
      this.#yaw += rot * dt * 1.6;
      this.#updateCamera();
    }
  }

  #trackPerformance(dt: number) {
    this.#frameAcc += dt;
    this.#frameCount++;
    if (this.#frameCount < 60) return;

    const avg = this.#frameAcc / this.#frameCount;
    this.#frameAcc = 0;
    this.#frameCount = 0;

    this.perf.fps = Math.round(1 / avg);
    this.perf.frameMs = Math.round(avg * 10000) / 10;
    this.perf.drawCalls = this.#renderer.info.render.calls;
    this.perf.triangles = this.#renderer.info.render.triangles;
    this.perf.pixelRatio = this.#pixelRatio;

    // Adaptive pixel ratio: drop 0.25 below ~58 fps, recover slowly above 60.
    if (avg > 1 / 58 && this.#pixelRatio > 1.0) {
      this.#pixelRatio = Math.max(1.0, this.#pixelRatio - 0.25);
      this.resize();
    } else if (avg < 1 / 61 && this.#pixelRatio < this.#prCap) {
      this.#pixelRatio = Math.min(this.#prCap, this.#pixelRatio + 0.25);
      this.resize();
    }
  }

  #updateCamera() {
    const cy = Math.cos(this.#yaw);
    const sy = Math.sin(this.#yaw);
    const cp = Math.cos(this.#pitch);
    const sp = Math.sin(this.#pitch);
    const offset = this.#scratchA.set(sy * cp, sp, cy * cp).multiplyScalar(this.#distance);
    this.#camera.position.copy(this.#target).add(offset);
    this.#camera.lookAt(this.#target);
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function sampleTerrainHeight(map: WorldMap, x: number, y: number, verticalScale: number): number {
  const c = map.cells[idx(map.width, x, y)];
  return (c.h - map.seaLevel) * verticalScale;
}
