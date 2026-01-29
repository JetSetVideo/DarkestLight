import { AudioEngine } from "../engine/audio/AudioEngine";
import { SettingsStore } from "../engine/state/SettingsStore";
import { TitleScreen } from "../screens/title/TitleScreen";
import { GameScreen } from "../screens/game/GameScreen";
import { type Screen } from "./Screen";

export class App {
  #root: HTMLElement;
  #screen: Screen | null = null;

  readonly audio = new AudioEngine();
  readonly settings = new SettingsStore();

  constructor(root: HTMLElement) {
    this.#root = root;
  }

  start() {
    this.settings.load();
    this.gotoTitle();
  }

  gotoTitle() {
    this.#setScreen(
      new TitleScreen({
        root: this.#root,
        audio: this.audio,
        settings: this.settings,
        onStart: () => this.gotoGame(),
      }),
    );
  }

  gotoGame() {
    this.#setScreen(
      new GameScreen({
        root: this.#root,
        audio: this.audio,
        settings: this.settings,
        onExitToTitle: () => this.gotoTitle(),
      }),
    );
  }

  #setScreen(next: Screen) {
    this.#screen?.destroy();
    this.#screen = next;
    void this.#screen.mount();
  }
}

