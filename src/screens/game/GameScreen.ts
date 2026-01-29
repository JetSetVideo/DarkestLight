import { type AudioEngine } from "../../engine/audio/AudioEngine";
import { type SettingsStore } from "../../engine/state/SettingsStore";
import { loadVersion } from "../../data/version";
import { MapGenerator } from "../../mapgen/MapGenerator";
import { type WorldMap } from "../../mapgen/MapTypes";
import { type Screen } from "../../runtime/Screen";
import { el, on } from "../../ui/dom";
import { Modal } from "../../ui/Modal";
import { gearSvg } from "../../ui/icons";
import { GameRenderer3D } from "../../render/game3d/GameRenderer3D";

export class GameScreen implements Screen {
  #root: HTMLElement;
  #audio: AudioEngine;
  #settings: SettingsStore;
  #onExitToTitle: () => void;

  #container = el("div", { className: "dl-layer" });
  #cleanup: Array<() => void> = [];
  #renderer3d: GameRenderer3D | null = null;
  #selected = false;

  #modal: Modal | null = null;

  #map: WorldMap | null = null;
  #hud: HTMLElement | null = null;

  constructor(opts: {
    root: HTMLElement;
    audio: AudioEngine;
    settings: SettingsStore;
    onExitToTitle: () => void;
  }) {
    this.#root = opts.root;
    this.#audio = opts.audio;
    this.#settings = opts.settings;
    this.#onExitToTitle = opts.onExitToTitle;
  }

  async mount() {
    // Ensure audio is ready by now (Start click is the gesture).
    await this.#audio.ensureReady();
    const s = this.#settings.get();
    this.#audio.setVolumes({ music: s.musicVolume, sfx: s.sfxVolume });
    this.#audio.setMusicEnabled(s.musicEnabled);
    this.#audio.setTempoBpm(s.musicTempoBpm);
    this.#audio.startMusic();

    this.#renderer3d = new GameRenderer3D({ quality: s.graphicsQuality });
    this.#container.append(this.#renderer3d.canvas);

    const topRight = el("div", { className: "dl-top-right" });
    const gearBtn = el("button", { className: "dl-icon-btn" });
    gearBtn.innerHTML = gearSvg();
    topRight.append(gearBtn);
    this.#container.append(topRight);

    const countdown = el("div", { className: "dl-countdown" });
    this.#container.append(countdown);

    this.#root.append(this.#container);

    this.#renderer3d.resize();
    this.#cleanup.push(on(window, "resize", () => this.#renderer3d?.resize()));

    this.#cleanup.push(
      on(gearBtn, "pointerenter", () => this.#audio.playUiHover()),
    );
    this.#cleanup.push(
      on(gearBtn, "click", async () => {
        this.#audio.playUiClick();
        await this.#openInGameMenu();
      }),
    );

    // Generate map immediately; gameplay begins after countdown finishes.
    this.#map = MapGenerator.generate({ width: 140, height: 96 });
    this.#renderer3d.setWorld(this.#map);

    await this.#runCountdown(countdown);
    countdown.remove();

    this.#mountHud();
    this.#bindWorldInput();
    this.#renderer3d.start();
  }

  destroy() {
    this.#modal?.destroy();
    this.#modal = null;
    this.#hud?.remove();
    this.#hud = null;
    this.#renderer3d?.destroy();
    this.#renderer3d = null;
    for (const fn of this.#cleanup) fn();
    this.#cleanup = [];
    this.#container.remove();
  }

  async #runCountdown(node: HTMLElement) {
    const steps = ["3", "2", "1", "Start!"];
    for (const s of steps) {
      node.textContent = s;
      node.animate(
        [{ opacity: 0, transform: "scale(0.85)" }, { opacity: 1, transform: "scale(1)" }],
        { duration: 260, easing: "cubic-bezier(0.2, 1.3, 0.2, 1)" },
      );
      if (s === "Start!") this.#audio.playStartSting();
      else this.#audio.playCountdownTick();
      await wait(650);
    }
  }

  #bindWorldInput() {
    const r = this.#renderer3d;
    if (!r) return;

    // Disable context menu to allow right-click deselect.
    this.#cleanup.push(
      on(r.canvas, "contextmenu", (ev: MouseEvent) => {
        ev.preventDefault();
      }),
    );

    let dragging = false;
    let lastX = 0;
    let lastY = 0;

    this.#cleanup.push(
      on(r.canvas, "pointerdown", (ev: PointerEvent) => {
        if (ev.button === 2) {
          // Right click: deselect.
          if (this.#selected) {
            this.#selected = false;
            r.setSelected(false);
            this.#audio.playDeselect();
            this.#updateHudSelected();
          } else {
            this.#audio.playDeselect();
          }
          return;
        }
        dragging = true;
        lastX = ev.clientX;
        lastY = ev.clientY;
        (ev.target as HTMLElement).setPointerCapture?.(ev.pointerId);

        r.setPointerFromClient(ev.clientX, ev.clientY);
        if (r.hitTestCharacter()) {
          this.#selected = true;
          r.setSelected(true);
          this.#audio.playSelect();
          this.#updateHudSelected();
          // micro UI animation
          this.#hud?.animate([{ transform: "translateY(0)" }, { transform: "translateY(-2px)" }, { transform: "translateY(0)" }], {
            duration: 220,
            easing: "ease-out",
          });
        }
      }),
    );

    const end = () => (dragging = false);
    this.#cleanup.push(on(r.canvas, "pointerup", () => end()));
    this.#cleanup.push(on(r.canvas, "pointercancel", () => end()));

    this.#cleanup.push(
      on(r.canvas, "pointermove", (ev: PointerEvent) => {
        if (!dragging) return;
        const dx = ev.clientX - lastX;
        const dy = ev.clientY - lastY;
        lastX = ev.clientX;
        lastY = ev.clientY;
        r.panBy(dx, dy);
      }),
    );

    this.#cleanup.push(
      on(r.canvas, "wheel", (ev: WheelEvent) => {
        ev.preventDefault();
        r.zoom(Math.sign(ev.deltaY));
      }, { passive: false }),
    );
  }

  #mountHud() {
    const hud = el("div", { className: "dl-ui" });
    hud.style.pointerEvents = "none";

    const panel = el("div", { className: "dl-card dl-fade-in" });
    panel.style.width = "min(420px, calc(100vw - 40px))";
    panel.style.position = "absolute";
    panel.style.left = "18px";
    panel.style.bottom = "18px";
    panel.style.padding = "14px 14px";
    panel.style.display = "grid";
    panel.style.gridTemplateColumns = "72px 1fr";
    panel.style.gap = "12px";
    panel.style.alignItems = "center";
    panel.style.pointerEvents = "auto";

    const portrait = document.createElement("canvas");
    portrait.width = 72;
    portrait.height = 72;
    portrait.style.borderRadius = "14px";
    portrait.style.border = "1px solid rgba(255,255,255,0.12)";
    portrait.style.background = "rgba(10,12,24,0.5)";
    drawPortrait(portrait, { selected: this.#selected });

    const info = el("div");
    const name = el("div", { text: "Wanderer Unit" });
    name.style.fontWeight = "700";
    name.style.letterSpacing = "0.04em";

    const stats = el("div", { text: "Click the character to select." });
    stats.style.color = "rgba(248,250,252,0.68)";
    stats.style.fontSize = "13px";
    stats.dataset["stats"] = "1";

    info.append(name, stats);
    panel.append(portrait, info);
    hud.append(panel);

    this.#container.append(hud);
    this.#hud = hud;
    this.#updateHudSelected();
  }

  #updateHudSelected() {
    if (!this.#hud) return;
    const canvas = this.#hud.querySelector("canvas") as HTMLCanvasElement | null;
    const stats = this.#hud.querySelector('[data-stats="1"]') as HTMLElement | null;
    if (canvas) drawPortrait(canvas, { selected: this.#selected });
    if (stats) {
      stats.textContent = this.#selected
        ? "Selected • HP 100 • ATK 10 • DEF 6"
        : "Click the character to select. Right click to deselect.";
    }
  }

  async #openInGameMenu() {
    this.#modal?.destroy();
    this.#modal = null;

    const version = await loadVersion();
    const state = this.#settings.get();
    const content = el("div", { className: "dl-modal-content" });

    const row = (label: string, right: HTMLElement) => {
      const r = el("div", { className: "dl-row" });
      r.append(el("div", { text: label }), right);
      return r;
    };

    const music = document.createElement("input");
    music.type = "range";
    music.min = "0";
    music.max = "1";
    music.step = "0.01";
    music.value = String(state.musicVolume);
    music.className = "dl-slider";

    const musicEnabled = document.createElement("input");
    musicEnabled.type = "checkbox";
    musicEnabled.checked = state.musicEnabled;

    const sfx = document.createElement("input");
    sfx.type = "range";
    sfx.min = "0";
    sfx.max = "1";
    sfx.step = "0.01";
    sfx.value = String(state.sfxVolume);
    sfx.className = "dl-slider";

    const tempo = document.createElement("input");
    tempo.type = "range";
    tempo.min = "80";
    tempo.max = "160";
    tempo.step = "1";
    tempo.value = String(state.musicTempoBpm);
    tempo.className = "dl-slider";

    const exitBtn = el("button", { className: "dl-danger", text: "Exit to title" });

    content.append(
      row("Version", el("div", { text: version })),
      row("Music enabled", musicEnabled),
      row("Music volume", music),
      row("Tempo (BPM)", tempo),
      row("SFX volume", sfx),
      row("", exitBtn),
    );

    const apply = () => {
      this.#settings.set({
        musicEnabled: musicEnabled.checked,
        musicVolume: Number(music.value),
        sfxVolume: Number(sfx.value),
        musicTempoBpm: Number(tempo.value),
      });
      const next = this.#settings.get();
      this.#audio.setVolumes({ music: next.musicVolume, sfx: next.sfxVolume });
      this.#audio.setTempoBpm(next.musicTempoBpm);
      this.#audio.setMusicEnabled(next.musicEnabled);
      if (next.musicEnabled) this.#audio.startMusic();
    };

    const clean = [
      on(musicEnabled, "change", () => apply()),
      on(music, "input", () => apply()),
      on(tempo, "input", () => apply()),
      on(sfx, "input", () => apply()),
      on(exitBtn, "pointerenter", () => this.#audio.playUiHover()),
      on(exitBtn, "click", () => {
        this.#audio.playUiClick();
        exitBtn.animate(
          [{ transform: "scale(1)" }, { transform: "scale(0.98)" }, { transform: "scale(1)" }],
          { duration: 220, easing: "ease-out" },
        );
        this.#modal?.destroy();
        this.#modal = null;
        this.#onExitToTitle();
      }),
    ];

    this.#modal = new Modal({
      title: "Menu",
      content,
      onClose: () => {
        for (const fn of clean) fn();
      },
    });
    this.#modal.mount(this.#container);
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function drawPortrait(canvas: HTMLCanvasElement, opts: { selected: boolean }) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = opts.selected ? "rgba(119,226,255,0.12)" : "rgba(10,12,24,0.35)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Minimal stylized face.
  ctx.save();
  ctx.translate(36, 38);
  ctx.fillStyle = "rgba(217,176,140,0.95)";
  ctx.beginPath();
  ctx.arc(0, -6, 18, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(22,26,35,0.85)";
  ctx.beginPath();
  ctx.arc(-6, -10, 2.2, 0, Math.PI * 2);
  ctx.arc(6, -10, 2.2, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(22,26,35,0.65)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-6, 2);
  ctx.quadraticCurveTo(0, 7, 6, 2);
  ctx.stroke();

  if (opts.selected) {
    ctx.strokeStyle = "rgba(119,226,255,0.85)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, -6, 23, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

