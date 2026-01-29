export class AudioEngine {
  #ctx: AudioContext | null = null;

  #master: GainNode | null = null;
  #musicBus: GainNode | null = null;
  #sfxBus: GainNode | null = null;

  #musicVol = 0.6;
  #sfxVol = 0.7;
  #musicEnabled = true;
  #tempoBpm = 118;

  // Music runtime
  #musicRunning = false;
  #musicTimer: number | null = null;
  #musicNextTime = 0;
  #musicStep = 0;
  #noiseBuf: AudioBuffer | null = null;

  get isReady(): boolean {
    return this.#ctx !== null;
  }

  async ensureReady() {
    if (this.#ctx) return;
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    this.#ctx = new Ctx();
    // Some browsers require an explicit resume even after construction.
    if (this.#ctx.state === "suspended") await this.#ctx.resume();

    // Routing
    this.#master = this.#ctx.createGain();
    this.#master.gain.value = 1.0;
    this.#master.connect(this.#ctx.destination);

    this.#musicBus = this.#ctx.createGain();
    this.#musicBus.gain.value = this.#musicEnabled ? this.#musicVol : 0.0;
    this.#musicBus.connect(this.#master);

    this.#sfxBus = this.#ctx.createGain();
    this.#sfxBus.gain.value = this.#sfxVol;
    this.#sfxBus.connect(this.#master);
  }

  setVolumes(opts: { music: number; sfx: number }) {
    this.#musicVol = clamp01(opts.music);
    this.#sfxVol = clamp01(opts.sfx);
    if (this.#musicBus) this.#musicBus.gain.value = this.#musicEnabled ? this.#musicVol : 0.0;
    if (this.#sfxBus) this.#sfxBus.gain.value = this.#sfxVol;
  }

  setMusicEnabled(enabled: boolean) {
    this.#musicEnabled = Boolean(enabled);
    if (this.#musicBus) this.#musicBus.gain.value = this.#musicEnabled ? this.#musicVol : 0.0;
    // Save CPU if music is muted.
    if (!this.#musicEnabled) this.stopMusic();
  }

  setTempoBpm(bpm: number) {
    const next = clamp(bpm, 80, 160);
    this.#tempoBpm = next;
  }

  playUiClick() {
    this.#beep({ freq: 540, duration: 0.04, type: "triangle", gain: 0.25 });
  }

  playUiHover() {
    this.#beep({ freq: 980, duration: 0.02, type: "sine", gain: 0.12 });
  }

  playCountdownTick() {
    this.#beep({ freq: 220, duration: 0.06, type: "square", gain: 0.18 });
  }

  playStartSting() {
    this.#beep({ freq: 440, duration: 0.08, type: "sawtooth", gain: 0.22 });
    setTimeout(() => this.#beep({ freq: 660, duration: 0.09, type: "sawtooth", gain: 0.18 }), 70);
  }

  playSelect() {
    // Confirm selection: short rising interval.
    this.#beep({ freq: 392, duration: 0.06, type: "triangle", gain: 0.22 });
    setTimeout(() => this.#beep({ freq: 587.33, duration: 0.06, type: "triangle", gain: 0.18 }), 55);
  }

  playDeselect() {
    // Deselect: noise-ish click (square) downwards.
    this.#beep({ freq: 240, duration: 0.05, type: "square", gain: 0.18 });
    setTimeout(() => this.#beep({ freq: 160, duration: 0.05, type: "square", gain: 0.14 }), 45);
  }

  startMusic() {
    if (!this.#ctx || !this.#musicBus) return;
    if (this.#musicRunning) return;
    if (!this.#musicEnabled) return;

    const ctx = this.#ctx;
    this.#noiseBuf ??= createNoiseBuffer(ctx, 1.0);

    // Electro-rock: 4/4 at tempo, 16-step grid (16th notes).
    this.#musicRunning = true;
    this.#musicStep = 0;
    this.#musicNextTime = ctx.currentTime + 0.05;

    const lookaheadMs = 25;
    const scheduleAhead = 0.14;

    const schedule = () => {
      if (!this.#ctx || !this.#musicBus || !this.#musicRunning) return;
      const stepDur = (60 / this.#tempoBpm) / 4; // 16th
      while (this.#musicNextTime < this.#ctx.currentTime + scheduleAhead) {
        this.#scheduleStep(this.#musicNextTime, this.#musicStep);
        this.#musicNextTime += stepDur;
        this.#musicStep = (this.#musicStep + 1) % 16;
      }
    };

    this.#musicTimer = window.setInterval(schedule, lookaheadMs);
    schedule();
  }

  stopMusic() {
    if (!this.#musicRunning) return;
    this.#musicRunning = false;
    if (this.#musicTimer !== null) window.clearInterval(this.#musicTimer);
    this.#musicTimer = null;
  }

  #beep(opts: {
    freq: number;
    duration: number;
    type: OscillatorType;
    gain: number;
  }) {
    if (!this.#ctx || !this.#sfxBus) return;
    const ctx = this.#ctx;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = opts.type;
    osc.frequency.value = opts.freq;

    const t0 = ctx.currentTime;
    const amp = opts.gain * this.#sfxVol;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, amp), t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.duration);

    osc.connect(g);
    g.connect(this.#sfxBus);
    osc.start(t0);
    osc.stop(t0 + opts.duration + 0.02);
    osc.onended = () => {
      osc.disconnect();
      g.disconnect();
    };
  }

  #scheduleStep(t: number, step: number) {
    if (!this.#ctx || !this.#musicBus || !this.#noiseBuf) return;
    const ctx = this.#ctx;

    // Pattern: kick (0, 8) + occasional syncopation; snare (4, 12); hats 16ths with accents.
    const kick = step === 0 || step === 8 || (step === 10 && Math.random() < 0.25);
    const snare = step === 4 || step === 12;
    const hat = true;

    const bar = 16;
    const barIndex = Math.floor((ctx.currentTime * this.#tempoBpm) / 60 / 4);

    // Chord progression (4 bars): Em – C – G – D (rock staple, works electro).
    const prog: Array<[number, number, number]> = [
      triadFromMidi(52, "min"), // E3
      triadFromMidi(48, "maj"), // C3
      triadFromMidi(43, "maj"), // G2
      triadFromMidi(50, "maj"), // D3
    ];
    const chord = prog[barIndex % prog.length];

    if (kick) this.#kick(t, 0.9);
    if (snare) this.#snare(t, 0.75);
    if (hat) {
      const accent = step % 4 === 0 ? 0.7 : (step % 2 === 0 ? 0.42 : 0.28);
      this.#hat(t, accent);
    }

    // Bass: 8ths, root with octave jumps + slight electro glide.
    if (step % 2 === 0) {
      const root = chord[0];
      const octave = step === 14 && Math.random() < 0.35 ? 12 : 0;
      this.#bass(t, midiToHz(root + octave), 0.55);
    }

    // Chord stabs: off-beats, lightly distorted
    if (step === 6 || step === 14) {
      this.#stab(t, chord.map(midiToHz), 0.22);
    }

    // Ambient pad swell very lightly every bar.
    if (step === 0) {
      this.#pad(t, chord.map((m) => midiToHz(m + 12)), 0.08);
    }
  }

  #kick(t: number, level: number) {
    if (!this.#ctx || !this.#musicBus) return;
    const ctx = this.#ctx;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    const g = ctx.createGain();
    const amp = 0.9 * level;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, amp), t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
    osc.frequency.setValueAtTime(120, t);
    osc.frequency.exponentialRampToValueAtTime(52, t + 0.06);
    osc.connect(g);
    g.connect(this.#musicBus);
    osc.start(t);
    osc.stop(t + 0.16);
    osc.onended = () => {
      osc.disconnect();
      g.disconnect();
    };
  }

  #snare(t: number, level: number) {
    if (!this.#ctx || !this.#musicBus || !this.#noiseBuf) return;
    const ctx = this.#ctx;

    const noise = ctx.createBufferSource();
    noise.buffer = this.#noiseBuf;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 1200;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1800;
    bp.Q.value = 0.7;
    const g = ctx.createGain();
    const amp = 0.42 * level;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, amp), t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);

    noise.connect(hp);
    hp.connect(bp);
    bp.connect(g);
    g.connect(this.#musicBus);
    noise.start(t);
    noise.stop(t + 0.14);
    noise.onended = () => {
      noise.disconnect();
      hp.disconnect();
      bp.disconnect();
      g.disconnect();
    };
  }

  #hat(t: number, level: number) {
    if (!this.#ctx || !this.#musicBus || !this.#noiseBuf) return;
    const ctx = this.#ctx;
    const noise = ctx.createBufferSource();
    noise.buffer = this.#noiseBuf;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 6500;
    const g = ctx.createGain();
    const amp = 0.12 * level;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, amp), t + 0.0015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
    noise.connect(hp);
    hp.connect(g);
    g.connect(this.#musicBus);
    noise.start(t);
    noise.stop(t + 0.05);
    noise.onended = () => {
      noise.disconnect();
      hp.disconnect();
      g.disconnect();
    };
  }

  #bass(t: number, freq: number, level: number) {
    if (!this.#ctx || !this.#musicBus) return;
    const ctx = this.#ctx;
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 220;
    filter.Q.value = 0.9;
    const g = ctx.createGain();
    const amp = 0.22 * level;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, amp), t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);

    // Slight glide for electro feel
    osc.frequency.setValueAtTime(freq * 1.06, t);
    osc.frequency.exponentialRampToValueAtTime(freq, t + 0.03);

    osc.connect(filter);
    filter.connect(g);
    g.connect(this.#musicBus);
    osc.start(t);
    osc.stop(t + 0.22);
    osc.onended = () => {
      osc.disconnect();
      filter.disconnect();
      g.disconnect();
    };
  }

  #stab(t: number, freqs: number[], level: number) {
    if (!this.#ctx || !this.#musicBus) return;
    const ctx = this.#ctx;

    const waveshaper = ctx.createWaveShaper();
    waveshaper.curve = makeSoftClipCurve(0.75);
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 900;
    filter.Q.value = 0.6;
    const g = ctx.createGain();
    const amp = 0.22 * level;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, amp), t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.10);

    const oscs = freqs.map((f) => {
      const o = ctx.createOscillator();
      o.type = "triangle";
      o.frequency.value = f;
      o.detune.value = (Math.random() * 10 - 5);
      o.connect(filter);
      return o;
    });

    filter.connect(waveshaper);
    waveshaper.connect(g);
    g.connect(this.#musicBus);

    for (const o of oscs) o.start(t);
    for (const o of oscs) o.stop(t + 0.12);

    const last = oscs[oscs.length - 1];
    last.onended = () => {
      for (const o of oscs) o.disconnect();
      filter.disconnect();
      waveshaper.disconnect();
      g.disconnect();
    };
  }

  #pad(t: number, freqs: number[], level: number) {
    if (!this.#ctx || !this.#musicBus) return;
    const ctx = this.#ctx;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 520;
    filter.Q.value = 0.65;
    const g = ctx.createGain();
    const amp = 0.10 * level;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, amp), t + 0.25);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.10);

    const oscs = freqs.map((f) => {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = f;
      o.connect(filter);
      return o;
    });

    filter.connect(g);
    g.connect(this.#musicBus);
    for (const o of oscs) o.start(t);
    for (const o of oscs) o.stop(t + 1.2);
    const last = oscs[oscs.length - 1];
    last.onended = () => {
      for (const o of oscs) o.disconnect();
      filter.disconnect();
      g.disconnect();
    };
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

function midiToHz(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

function triadFromMidi(root: number, quality: "maj" | "min"): [number, number, number] {
  return quality === "maj"
    ? [root, root + 4, root + 7]
    : [root, root + 3, root + 7];
}

function createNoiseBuffer(ctx: AudioContext, seconds: number): AudioBuffer {
  const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * 0.7;
  return buf;
}

function makeSoftClipCurve(amount: number): Float32Array {
  const k = clamp01(amount) * 50 + 1;
  const n = 1024;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / (n - 1) - 1;
    curve[i] = (1 + k) * x / (1 + k * Math.abs(x));
  }
  return curve;
}

