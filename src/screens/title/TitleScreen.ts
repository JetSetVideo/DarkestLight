import { type AudioEngine } from "../../engine/audio/AudioEngine";
import { type SettingsStore } from "../../engine/state/SettingsStore";
import { loadVersion } from "../../data/version";
import { TitleRenderer } from "../../render/TitleRenderer";
import { el, on } from "../../ui/dom";
import { Modal } from "../../ui/Modal";
import { exitSvg, gearSvg } from "../../ui/icons";
import { type Screen } from "../../runtime/Screen";

export class TitleScreen implements Screen {
  #root: HTMLElement;
  #audio: AudioEngine;
  #settings: SettingsStore;
  #onStart: () => void;

  #container = el("div", { className: "dl-layer" });
  #ui = el("div", { className: "dl-ui" });
  #cleanup: Array<() => void> = [];
  #renderer: TitleRenderer | null = null;
  #modal: Modal | null = null;

  constructor(opts: {
    root: HTMLElement;
    audio: AudioEngine;
    settings: SettingsStore;
    onStart: () => void;
  }) {
    this.#root = opts.root;
    this.#audio = opts.audio;
    this.#settings = opts.settings;
    this.#onStart = opts.onStart;
  }

  mount() {
    const { graphicsQuality, musicVolume, sfxVolume, musicEnabled, musicTempoBpm } = this.#settings.get();
    this.#audio.setVolumes({ music: musicVolume, sfx: sfxVolume });
    this.#audio.setMusicEnabled(musicEnabled);
    this.#audio.setTempoBpm(musicTempoBpm);

    this.#renderer = new TitleRenderer({ quality: graphicsQuality });
    this.#container.append(this.#renderer.canvas);

    const topRight = el("div", { className: "dl-top-right" });
    const settingsBtn = el("button", { className: "dl-icon-btn" });
    settingsBtn.innerHTML = gearSvg();
    const exitBtn = el("button", { className: "dl-icon-btn" });
    exitBtn.innerHTML = exitSvg();
    topRight.append(settingsBtn, exitBtn);

    const card = el("div", { className: "dl-card dl-fade-in" });
    const title = el("h1", { className: "dl-title", text: "Deus Ex Planetum" });
    const subtitle = el("p", {
      className: "dl-subtitle",
      text: "A god-game RTS prototype. Shaders, sound, and procedural worlds.",
    });

    const actions = el("div", { className: "dl-actions" });
    const startBtn = el("button", { className: "dl-primary", text: "Start" });
    actions.append(startBtn);

    card.append(title, subtitle, actions);

    this.#ui.append(topRight, card);
    this.#container.append(this.#ui);
    this.#root.append(this.#container);

    this.#renderer.start();

    this.#cleanup.push(on(window, "resize", () => this.#renderer?.resize()));

    this.#cleanup.push(
      on(startBtn, "pointerenter", () => this.#audio.playUiHover()),
    );
    this.#cleanup.push(
      on(startBtn, "click", async () => {
        await this.#audio.ensureReady();
        const s = this.#settings.get();
        this.#audio.setVolumes({ music: s.musicVolume, sfx: s.sfxVolume });
        this.#audio.setMusicEnabled(s.musicEnabled);
        this.#audio.setTempoBpm(s.musicTempoBpm);
        this.#audio.startMusic();
        this.#audio.playUiClick();
        startBtn.animate(
          [
            { transform: "translateY(0) scale(1)" },
            { transform: "translateY(0) scale(0.98)" },
            { transform: "translateY(-1px) scale(1.02)" },
          ],
          { duration: 260, easing: "cubic-bezier(0.2, 1.2, 0.2, 1)" },
        );
        // Small delay so the click animation/sound lands.
        setTimeout(() => this.#onStart(), 160);
      }),
    );

    this.#cleanup.push(
      on(settingsBtn, "pointerenter", () => this.#audio.playUiHover()),
    );
    this.#cleanup.push(
      on(settingsBtn, "click", async () => {
        this.#audio.playUiClick();
        await this.#openSettingsModal({ showExitToTitle: false });
      }),
    );

    this.#cleanup.push(
      on(exitBtn, "pointerenter", () => this.#audio.playUiHover()),
    );
    this.#cleanup.push(
      on(exitBtn, "click", () => {
        this.#audio.playUiClick();
        // In browsers, window.close() is only allowed if opened by script.
        // We still provide the control to match the requested UI.
        const closed = window.close();
        if (!closed) {
          alert("Close this tab/window to exit.");
        }
      }),
    );
  }

  destroy() {
    this.#modal?.destroy();
    this.#modal = null;
    for (const fn of this.#cleanup) fn();
    this.#cleanup = [];
    this.#renderer?.destroy();
    this.#renderer = null;
    this.#container.remove();
  }

  async #openSettingsModal(opts: { showExitToTitle: boolean }) {
    this.#modal?.destroy();
    this.#modal = null;

    const version = await loadVersion();
    const state = this.#settings.get();

    const content = el("div", { className: "dl-modal-content" });

    const row = (label: string, right: HTMLElement) => {
      const r = el("div", { className: "dl-row" });
      const l = el("div", { text: label });
      r.append(l, right);
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

    const gfx = document.createElement("select");
    gfx.innerHTML =
      `<option value="high">Graphics: High</option><option value="low">Graphics: Low</option>`;
    gfx.value = state.graphicsQuality;

    content.append(
      row("Version", el("div", { text: version })),
      row("Music enabled", musicEnabled),
      row("Music volume", music),
      row("Tempo (BPM)", tempo),
      row("SFX volume", sfx),
      row("Graphics", gfx),
    );

    const apply = () => {
      this.#settings.set({
        musicEnabled: musicEnabled.checked,
        musicVolume: Number(music.value),
        sfxVolume: Number(sfx.value),
        musicTempoBpm: Number(tempo.value),
        graphicsQuality: gfx.value === "low" ? "low" : "high",
      });
      const next = this.#settings.get();
      this.#audio.setVolumes({ music: next.musicVolume, sfx: next.sfxVolume });
      this.#audio.setTempoBpm(next.musicTempoBpm);
      this.#audio.setMusicEnabled(next.musicEnabled);
      if (next.musicEnabled) this.#audio.startMusic();
    };

    const cleanupInputs = [
      on(musicEnabled, "change", () => apply()),
      on(music, "input", () => apply()),
      on(tempo, "input", () => apply()),
      on(sfx, "input", () => apply()),
      on(gfx, "change", () => {
        apply();
        // quality affects renderer; user can reopen to see changes on next entry
      }),
    ];

    if (opts.showExitToTitle) {
      // Title screen doesn't use this, game screen does.
    }

    this.#modal = new Modal({
      title: "Settings",
      content,
      onClose: () => {
        for (const fn of cleanupInputs) fn();
      },
    });
    this.#modal.mount(this.#container);
  }
}

