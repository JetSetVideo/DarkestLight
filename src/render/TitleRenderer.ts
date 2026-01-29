import * as THREE from "https://esm.sh/three@0.161.0";
import { BG_FRAG, BG_VERT, HALO_FRAG, HALO_VERT, PLANET_FRAG, PLANET_VERT } from "./shaders/title";

export class TitleRenderer {
  readonly canvas: HTMLCanvasElement;
  #renderer: THREE.WebGLRenderer;
  #scene: THREE.Scene;
  #camera: THREE.PerspectiveCamera;
  #clock = new THREE.Clock();
  #raf = 0;

  #bgMat: THREE.ShaderMaterial;
  #planetMat: THREE.ShaderMaterial;
  #haloMat: THREE.ShaderMaterial;
  #planet: THREE.Mesh;
  #halo: THREE.Mesh;

  constructor(opts: { quality: "low" | "high" }) {
    this.canvas = document.createElement("canvas");
    this.canvas.className = "dl-layer";

    this.#renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: opts.quality === "high",
      alpha: true,
      powerPreference: "high-performance",
    });
    this.#renderer.setPixelRatio(Math.min(window.devicePixelRatio, opts.quality === "high" ? 2 : 1.25));

    this.#scene = new THREE.Scene();
    this.#camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    this.#camera.position.set(0, 0, 5.2);

    const bgGeo = new THREE.PlaneGeometry(2, 2);
    this.#bgMat = new THREE.ShaderMaterial({
      vertexShader: BG_VERT,
      fragmentShader: BG_FRAG,
      uniforms: {
        uTime: { value: 0 },
        uRes: { value: new THREE.Vector2(1, 1) },
      },
      depthTest: false,
      depthWrite: false,
    });
    const bg = new THREE.Mesh(bgGeo, this.#bgMat);
    bg.position.z = -2;
    this.#scene.add(bg);

    const planetGeo = new THREE.SphereGeometry(1.0, opts.quality === "high" ? 128 : 64, opts.quality === "high" ? 128 : 64);
    this.#planetMat = new THREE.ShaderMaterial({
      vertexShader: PLANET_VERT,
      fragmentShader: PLANET_FRAG,
      uniforms: { uTime: { value: 0 } },
    });
    const planet = new THREE.Mesh(planetGeo, this.#planetMat);
    planet.position.set(0.0, 0.0, 0.0);
    this.#scene.add(planet);
    this.#planet = planet;

    const haloGeo = new THREE.PlaneGeometry(3.0, 3.0);
    this.#haloMat = new THREE.ShaderMaterial({
      vertexShader: HALO_VERT,
      fragmentShader: HALO_FRAG,
      transparent: true,
      blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 } },
      depthWrite: false,
    });
    const halo = new THREE.Mesh(haloGeo, this.#haloMat);
    halo.position.set(0.0, 0.0, 0.8);
    this.#scene.add(halo);
    this.#halo = halo;

    this.resize();
  }

  start() {
    const tick = () => {
      const t = this.#clock.getElapsedTime();
      this.#bgMat.uniforms.uTime.value = t;
      this.#planetMat.uniforms.uTime.value = t;
      this.#haloMat.uniforms.uTime.value = t;
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
    this.#bgMat.uniforms.uRes.value.set(w, h);

    // Responsive composition: keep the planet centered and sized to a safe screen fraction.
    const aspect = w / h;
    const dist = this.#camera.position.z - this.#planet.position.z;
    const fovRad = (this.#camera.fov * Math.PI) / 180;
    const worldH = 2 * dist * Math.tan(fovRad / 2);
    const targetFrac = aspect < 1 ? 0.46 : 0.38; // portrait shows slightly larger planet
    const targetDiameter = worldH * targetFrac;
    const baseRadius = 1.0;
    const scale = Math.max(0.4, Math.min(1.2, targetDiameter / (2 * baseRadius)));

    this.#planet.scale.setScalar(scale);
    // Halo should frame the planet without overflowing the UI too much.
    this.#halo.scale.setScalar(scale * 1.05);
  }

  destroy() {
    cancelAnimationFrame(this.#raf);
    this.#renderer.dispose();
  }
}

