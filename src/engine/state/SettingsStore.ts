export type Settings = {
  musicEnabled: boolean;
  musicVolume: number; // 0..1
  sfxVolume: number; // 0..1
  musicTempoBpm: number; // ~80..160
  graphicsQuality: "low" | "high";
};

const STORAGE_KEY = "darkestlight.settings.v1";

export class SettingsStore {
  private settings: Settings = {
    musicEnabled: true,
    musicVolume: 0.6,
    sfxVolume: 0.7,
    musicTempoBpm: 118,
    graphicsQuality: "high",
  };

  load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<Settings>;
      this.settings = {
        ...this.settings,
        ...parsed,
        musicEnabled: typeof parsed.musicEnabled === "boolean"
          ? parsed.musicEnabled
          : this.settings.musicEnabled,
        musicVolume: clamp01(parsed.musicVolume ?? this.settings.musicVolume),
        sfxVolume: clamp01(parsed.sfxVolume ?? this.settings.sfxVolume),
        musicTempoBpm: clamp(parsed.musicTempoBpm ?? this.settings.musicTempoBpm, 80, 160),
        graphicsQuality: parsed.graphicsQuality ?? this.settings.graphicsQuality,
      };
    } catch {
      // ignore
    }
  }

  save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
  }

  get(): Settings {
    return { ...this.settings };
  }

  set(partial: Partial<Settings>) {
    const next: Settings = {
      ...this.settings,
      ...partial,
    };
    next.musicEnabled = Boolean(next.musicEnabled);
    next.musicVolume = clamp01(next.musicVolume);
    next.sfxVolume = clamp01(next.sfxVolume);
    next.musicTempoBpm = clamp(next.musicTempoBpm, 80, 160);
    this.settings = next;
    this.save();
  }
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.min(1, Math.max(0, v));
}

function clamp(v: number, lo: number, hi: number): number {
  if (!Number.isFinite(v)) return lo;
  return Math.min(hi, Math.max(lo, v));
}

