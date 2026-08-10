// Phase 0 verification harness for the EnArché cel-shading pipeline.
// Renders the mid-poly toon cube (plus two curved solids that make the
// banding obvious) and reports a rolling FPS figure.
//
// Served by /toon-lab.html. Kept out of the game bundle: main.js never
// imports this file.
import * as THREE from 'three';
import { applyToonShading, attachOutline, TOON_BANDS, TOON_LEVELS } from './toon.js';

const canvas = document.getElementById('lab-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1b2230);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(4.2, 3.4, 6.4);
camera.lookAt(0, 1.25, 0);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Lighting mirrors the in-game Cycles rig (world.js) so what the lab shows
// is what the game renders.
const sun = new THREE.DirectionalLight(0xfff3d8, 2.6);
sun.position.set(6, 9, 4);
scene.add(sun);
scene.add(new THREE.AmbientLight(0x8899bb, 0.9));
scene.add(new THREE.HemisphereLight(0xbcd8ff, 0x3a4530, 0.55));

/** Mid-poly solid + cel material + inverted-hull outline. */
function toonSolid(geo, color, x, y = 1.35) {
  const material = applyToonShading(
    new THREE.MeshLambertMaterial({ color, flatShading: false }),
  );
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.set(x, y, 0);
  attachOutline(mesh, { thickness: 1.0 });
  scene.add(mesh);
  return mesh;
}

// The required subject: a mid-poly cube (subdivided so the bands fall across
// a face, not just between faces).
const cube = toonSolid(new THREE.BoxGeometry(1.9, 1.9, 1.9, 6, 6, 6), 0xd8623f, -2.5);
// Curved solids — banding and rim are easiest to judge on these.
const sphere = toonSolid(new THREE.SphereGeometry(1.05, 32, 24), 0x4f9d5d, 0);
const knot = toonSolid(new THREE.TorusKnotGeometry(0.72, 0.26, 96, 20), 0x4a7bc4, 2.5);

// Ground plane, also cel-shaded, to catch the silhouettes.
const floorMat = applyToonShading(new THREE.MeshLambertMaterial({ color: 0x2c3648 }));
scene.add(new THREE.Mesh(new THREE.PlaneGeometry(24, 24).rotateX(-Math.PI / 2), floorMat));

// --- FPS instrumentation -----------------------------------------------
// Rolling average over a 1s window. Exposed on window for the automated
// Phase 0 check; also drawn into the on-page readout.
const hud = document.getElementById('lab-hud');
let frames = 0;
let windowStart = performance.now();
let fps = 0;
const samples = [];
window.__LAB = {
  get fps() { return fps; },
  get samples() { return samples.slice(); },
  bands: TOON_BANDS,
  levels: TOON_LEVELS,
  ok: false,
  renderer, scene, camera,
  /**
   * Throttle-proof perf probe: time N synchronous renders and report the
   * median frame cost. Chrome throttles requestAnimationFrame in background
   * or occluded tabs, so the rAF counter above under-reports badly when the
   * page isn't foregrounded — this measures actual GPU/CPU frame cost instead.
   */
  benchmark(n = 240) {
    const gl = renderer.getContext();
    const px = new Uint8Array(4);
    // renderer.render() only queues GPU work and returns immediately, so
    // timing it alone measures CPU submission (~0ms). Reading a single pixel
    // back forces a pipeline flush, making each sample a real frame cost.
    const syncedRender = () => {
      renderer.render(scene, camera);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    };
    const t = [];
    syncedRender(); // warm the pipeline
    for (let i = 0; i < n; i++) {
      const a = performance.now();
      syncedRender();
      t.push(performance.now() - a);
    }
    t.sort((x, y) => x - y);
    const median = t[Math.floor(t.length / 2)];
    const p95 = t[Math.floor(t.length * 0.95)];
    return {
      medianMs: +median.toFixed(3),
      p95Ms: +p95.toFixed(3),
      impliedFps: median > 0 ? Math.round(1000 / median) : null,
      calls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      pixelRatio: renderer.getPixelRatio(),
    };
  },
};

let t = 0;
let last = performance.now();
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  t += dt;

  cube.rotation.set(t * 0.35, t * 0.5, 0);
  sphere.position.y = 1.35 + Math.sin(t * 1.2) * 0.25;
  knot.rotation.set(t * 0.4, t * 0.65, 0);

  renderer.render(scene, camera);

  frames++;
  if (now - windowStart >= 1000) {
    fps = (frames * 1000) / (now - windowStart);
    samples.push(Math.round(fps));
    if (samples.length > 30) samples.shift();
    frames = 0;
    windowStart = now;
    const calls = renderer.info.render.calls;
    const tris = renderer.info.render.triangles;
    if (hud) {
      hud.textContent =
        `${fps.toFixed(1)} FPS  ·  ${calls} draw calls  ·  ${tris.toLocaleString()} tris  ` +
        `·  ${TOON_BANDS.length + 1} light bands  ·  dpr ${renderer.getPixelRatio()}`;
    }
    // Steady-state pass flag: ignore the first two warm-up seconds.
    if (samples.length >= 3) {
      const recent = samples.slice(-3);
      window.__LAB.ok = recent.every((s) => s >= 58);
    }
  }
}
requestAnimationFrame(loop);
