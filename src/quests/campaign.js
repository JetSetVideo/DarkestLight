// Story campaign: mission manifests, sequential progression, and unlocks.
//
// Missions are plain EnArcheMissionManifest JSON in data/missions/. The quest
// engine already speaks that format (QuestEngine.loadManifest), so story mode
// is a loader + a progression gate rather than a second quest system.
//
// Progress persists in localStorage under the same convention as settings
// ('dl-*'), and degrades to in-memory when storage is unavailable (private
// browsing, headless Node) so the campaign still runs.

const STORAGE_KEY = 'dl-campaign';

/** Mission files, in campaign order. */
export const MISSION_FILES = [
  'tutorial-01.json',
  'tutorial-02.json',
  'tutorial-03.json',
  'mission-01.json',
];

/** Minimal structural validation against the manifest schema's required fields. */
export function validateManifest(m) {
  const errors = [];
  if (!m || typeof m !== 'object') return ['manifest is not an object'];
  for (const field of ['missionId', 'title', 'difficulty', 'quests']) {
    if (m[field] === undefined) errors.push(`missing required field: ${field}`);
  }
  if (m.difficulty && !['Tutorial', 'Easy', 'Medium', 'Hard', 'Godlike'].includes(m.difficulty)) {
    errors.push(`invalid difficulty: ${m.difficulty}`);
  }
  if (m.startingAge && !['Stone', 'Fire', 'Bronze', 'Iron', 'Steel'].includes(m.startingAge)) {
    errors.push(`invalid startingAge: ${m.startingAge}`);
  }
  if (Array.isArray(m.quests)) {
    m.quests.forEach((q, i) => {
      for (const field of ['questId', 'title', 'objectives']) {
        if (q[field] === undefined) errors.push(`quest[${i}] missing ${field}`);
      }
      (q.objectives || []).forEach((o, j) => {
        for (const field of ['objectiveId', 'text', 'type']) {
          if (o[field] === undefined) errors.push(`quest[${i}].objective[${j}] missing ${field}`);
        }
      });
    });
  } else if (m.quests !== undefined) {
    errors.push('quests must be an array');
  }
  return errors;
}

/** localStorage with a graceful in-memory fallback. */
function makeStore() {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('dl-probe', '1');
      localStorage.removeItem('dl-probe');
      return localStorage;
    }
  } catch { /* fall through */ }
  const mem = new Map();
  return {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k),
  };
}

export class Campaign {
  /**
   * @param {{basePath?: string, fetchImpl?: Function, store?: object}} [opts]
   */
  constructor({ basePath = './data/missions/', fetchImpl, store } = {}) {
    this.basePath = basePath;
    this.fetch = fetchImpl || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
    this.store = store || makeStore();
    /** @type {any[]} loaded manifests in campaign order */
    this.missions = [];
    this.progress = this._readProgress();
  }

  _readProgress() {
    try {
      const raw = this.store.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch { /* corrupt entry — start fresh rather than crash into a dead menu */ }
    return { completed: [], unlocked: [] };
  }

  _writeProgress() {
    try {
      this.store.setItem(STORAGE_KEY, JSON.stringify(this.progress));
    } catch { /* storage full or blocked — progress stays in memory */ }
  }

  /**
   * Load every mission manifest.
   * @param {(file: string) => Promise<any>} [reader] override for Node/tests
   */
  async load(reader) {
    const read = reader || (async (file) => {
      if (!this.fetch) throw new Error('no fetch available; pass a reader');
      const res = await this.fetch(this.basePath + file);
      if (!res.ok) throw new Error(`failed to load ${file}: ${res.status}`);
      return res.json();
    });

    this.missions = [];
    for (const file of MISSION_FILES) {
      const m = await read(file);
      const errors = validateManifest(m);
      if (errors.length) throw new Error(`${file} is not a valid manifest: ${errors.join('; ')}`);
      this.missions.push(m);
    }
    this.missions.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    // The first mission is always available.
    if (this.missions.length && !this.progress.unlocked.length) {
      this.progress.unlocked = [this.missions[0].missionId];
      this._writeProgress();
    }
    return this.missions;
  }

  byId(id) { return this.missions.find((m) => m.missionId === id) || null; }

  isUnlocked(id) { return this.progress.unlocked.includes(id); }
  isCompleted(id) { return this.progress.completed.includes(id); }

  /** Missions the player may currently start. */
  get playable() { return this.missions.filter((m) => this.isUnlocked(m.missionId)); }

  /** The next mission to play: first unlocked-but-incomplete in order. */
  get next() {
    return this.missions.find((m) => this.isUnlocked(m.missionId) && !this.isCompleted(m.missionId)) || null;
  }

  /**
   * Mark a mission complete and unlock whatever it gates.
   * @returns {{completed: string, unlocked: string|null}}
   */
  completeMission(id) {
    const mission = this.byId(id);
    if (!mission) return { completed: id, unlocked: null };
    if (!this.progress.completed.includes(id)) this.progress.completed.push(id);

    let unlocked = null;
    // Prefer the manifest's explicit `unlocks`, else fall back to the next in
    // campaign order — so a mission that forgets the field still progresses.
    const explicit = mission.unlocks;
    if (explicit) unlocked = explicit;
    else {
      const idx = this.missions.indexOf(mission);
      unlocked = this.missions[idx + 1]?.missionId ?? null;
    }
    if (unlocked && !this.progress.unlocked.includes(unlocked)) {
      this.progress.unlocked.push(unlocked);
    }
    this._writeProgress();
    return { completed: id, unlocked };
  }

  /** Wipe campaign progress (menu option / testing). */
  reset() {
    this.progress = { completed: [], unlocked: this.missions.length ? [this.missions[0].missionId] : [] };
    this._writeProgress();
    return this.progress;
  }

  /**
   * Has the player satisfied a mission? A mission is won when every quest in
   * its manifest is complete.
   */
  static isMissionWon(questEngine) {
    const quests = questEngine?.quests || [];
    return quests.length > 0 && quests.every((q) => q.state === 'complete');
  }

  /** Progress summary for the menu. */
  report() {
    return {
      total: this.missions.length,
      completed: this.progress.completed.length,
      unlocked: this.progress.unlocked.length,
      next: this.next?.missionId ?? null,
      missions: this.missions.map((m) => ({
        id: m.missionId, title: m.title, difficulty: m.difficulty,
        unlocked: this.isUnlocked(m.missionId), completed: this.isCompleted(m.missionId),
      })),
    };
  }
}
