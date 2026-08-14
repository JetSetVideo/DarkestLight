// Dynamic quest engine.
//
// Quest and mission data conform to the EnArcheMissionManifest JSON schema —
// the same shape Phase 6's story missions load from disk — so a hand-authored
// mission file and a runtime-generated quest are the same kind of object and
// run through the same code path.
//
// Trigger types:   BiomeDesertified | PopulationReached | AgeReached | TerrainModified
// Objective types: RedirectRiver | CraftTools | BuildRoad | TameCompanions | CastSpell | GatherFood | GrowPopulation | ConvertSouls
// Rewards:         victoryPoints, unlockedTech, weatherShift, alignmentImpact
import { nudge } from '../engine/alignment.js';
import { eraOf, ERAS } from '../ai/crafting.js';

export const TRIGGER_TYPES = ['BiomeDesertified', 'PopulationReached', 'AgeReached', 'TerrainModified'];
export const OBJECTIVE_TYPES = [
  'RedirectRiver', 'CraftTools', 'BuildRoad', 'TameCompanions', 'CastSpell',
  'GatherFood', 'GrowPopulation', 'ConvertSouls',
];
export const WEATHER_SHIFTS = ['Rainstorm', 'ClearSkies', 'Heatwave', 'None'];

/** Quest lifecycle. `dormant` quests are waiting on their trigger. */
export const QUEST_STATE = {
  DORMANT: 'dormant',
  ACTIVE: 'active',
  COMPLETE: 'complete',
  FAILED: 'failed',
};

// ---------------------------------------------------------------------------
// Templates used to generate quests procedurally. Each produces a
// schema-conformant quest object.

const TEMPLATES = [
  {
    id: 'be_their_god',
    title: 'Be their god',
    description: 'Show the flock a miracle, then fill the stores. A god is known by the people they keep alive.',
    trigger: { type: 'AgeReached', targetValue: 'Stone' },
    objectives: [
      { objectiveId: 'miracle', text: 'Work a miracle over the island', type: 'CastSpell', targetAmount: 1 },
      { objectiveId: 'feed', text: 'Gather food for the fire', type: 'GatherFood', targetAmount: 25 },
    ],
    rewards: {
      victoryPoints: 60, weatherShift: 'None',
      alignmentImpact: { orderChaosDelta: 0.02, goodEvilDelta: 0.06 },
    },
  },
  {
    id: 'drought',
    title: 'Survive the drought',
    description: 'The soil is dying. Bring water back to the wasted land.',
    trigger: { type: 'BiomeDesertified', targetValue: '40' },
    objectives: [
      { objectiveId: 'divert', text: 'Divert a watercourse into the wasteland', type: 'RedirectRiver', targetAmount: 1 },
    ],
    rewards: {
      victoryPoints: 120, weatherShift: 'Rainstorm',
      alignmentImpact: { orderChaosDelta: 0.05, goodEvilDelta: 0.08 },
    },
  },
  {
    id: 'trade_route',
    title: 'Pave a trade route',
    description: 'Bind the settlements together with a paved road.',
    trigger: { type: 'PopulationReached', targetValue: '10' },
    objectives: [
      { objectiveId: 'pave', text: 'Pave road segments between structures', type: 'BuildRoad', targetAmount: 12 },
    ],
    rewards: {
      victoryPoints: 90, unlockedTech: 'masonry', weatherShift: 'None',
      alignmentImpact: { orderChaosDelta: 0.12, goodEvilDelta: 0.02 },
    },
  },
  {
    id: 'toolsmiths',
    title: 'Arm the people',
    description: 'Put a proper tool in every working hand.',
    trigger: { type: 'AgeReached', targetValue: 'Fire' },
    objectives: [
      { objectiveId: 'craft', text: 'Craft tools for your workers', type: 'CraftTools', targetAmount: 6 },
    ],
    rewards: {
      victoryPoints: 80, weatherShift: 'ClearSkies',
      alignmentImpact: { orderChaosDelta: 0.08, goodEvilDelta: 0.0 },
    },
  },
  {
    id: 'menagerie',
    title: 'Beasts at heel',
    description: 'Win the trust of the wild things.',
    trigger: { type: 'PopulationReached', targetValue: '12' },
    objectives: [
      { objectiveId: 'tame', text: 'Tame animal companions', type: 'TameCompanions', targetAmount: 2 },
    ],
    rewards: {
      victoryPoints: 70, weatherShift: 'None',
      alignmentImpact: { orderChaosDelta: 0.0, goodEvilDelta: 0.06 },
    },
  },
  {
    id: 'shrine',
    title: 'Build a shrine',
    description: 'Raise a place where your name is spoken.',
    trigger: { type: 'TerrainModified', targetValue: '1' },
    objectives: [
      { objectiveId: 'cast', text: 'Work miracles over your people', type: 'CastSpell', targetAmount: 3 },
    ],
    rewards: {
      victoryPoints: 100, weatherShift: 'ClearSkies',
      alignmentImpact: { orderChaosDelta: 0.06, goodEvilDelta: 0.05 },
    },
  },
];

let questSeq = 1;

/** Instantiate a schema-conformant quest from a template. */
export function makeQuest(template, side = 'player') {
  return {
    questId: `${template.id}-${questSeq++}`,
    title: template.title,
    description: template.description,
    side,
    triggerCondition: { ...template.trigger },
    objectives: template.objectives.map((o) => ({ ...o, progress: 0 })),
    rewards: JSON.parse(JSON.stringify(template.rewards)),
    state: QUEST_STATE.DORMANT,
  };
}

// ---------------------------------------------------------------------------

export class QuestEngine {
  /**
   * @param {import('../game.js').Game} game
   */
  constructor(game, { templates = TEMPLATES } = {}) {
    this.game = game;
    this.templates = templates;
    /** @type {any[]} */
    this.quests = [];
    this.log = [];
    this.stats = { generated: 0, activated: 0, completed: 0, victoryPoints: { player: 0, enemy: 0 } };
  }

  /** Seed one quest per template for a side. */
  seed(side = 'player') {
    for (const t of this.templates) {
      this.quests.push(makeQuest(t, side));
      this.stats.generated++;
    }
    return this.quests;
  }

  /** Load quests straight from a mission manifest (Phase 6 story mode). */
  loadManifest(manifest, side = 'player') {
    for (const q of manifest.quests || []) {
      this.quests.push({
        ...q,
        side,
        objectives: (q.objectives || []).map((o) => ({ ...o, progress: 0 })),
        state: QUEST_STATE.DORMANT,
      });
      this.stats.generated++;
    }
    return this.quests;
  }

  /** Has this quest's trigger condition been met? */
  _triggerMet(quest) {
    const g = this.game;
    const t = quest.triggerCondition || {};
    const target = parseFloat(t.targetValue);
    switch (t.type) {
      case 'BiomeDesertified':
        return (g.ecology?.stats.desertified ?? 0) >= (Number.isFinite(target) ? target : 1);
      case 'PopulationReached':
        return g.popOf(quest.side) >= (Number.isFinite(target) ? target : 1);
      case 'AgeReached': {
        const want = ERAS.indexOf(String(t.targetValue));
        const have = ERAS.indexOf(eraOf(g.stateOf(quest.side).techs));
        return want >= 0 && have >= want;
      }
      case 'TerrainModified':
        return (g.terrain?.edits ?? 0) >= (Number.isFinite(target) ? target : 1);
      default:
        return false;
    }
  }

  /** Current progress toward a single objective. */
  _progressOf(quest, objective) {
    const g = this.game;
    switch (objective.type) {
      case 'RedirectRiver': return g.rivers?.moves ?? 0;
      case 'CraftTools': return g.civStats?.toolsCrafted ?? 0;
      case 'BuildRoad': return g.roads?.stats.cellsPaved ?? 0;
      case 'TameCompanions': return g.civStats?.tamed ?? 0;
      case 'CastSpell': return g.spellsCast ?? 0;
      case 'GatherFood': return g.stateOf(quest.side).ach.food || 0;
      case 'GrowPopulation': return g.popOf(quest.side);
      case 'ConvertSouls': return g.stateOf(quest.side).conversions || 0;
      default: return 0;
    }
  }

  /**
   * Advance every quest. Called on a slow timer — quests measure cumulative
   * counters, so per-frame resolution buys nothing.
   */
  tick() {
    for (const quest of this.quests) {
      if (quest.state === QUEST_STATE.COMPLETE || quest.state === QUEST_STATE.FAILED) continue;

      if (quest.state === QUEST_STATE.DORMANT) {
        if (!this._triggerMet(quest)) continue;
        quest.state = QUEST_STATE.ACTIVE;
        // Objectives measure progress *since activation*, otherwise a quest
        // can complete the instant it triggers off unrelated earlier work.
        for (const o of quest.objectives) o._base = this._progressOf(quest, o);
        this.stats.activated++;
        this.log.push({ t: this.game.elapsed, event: 'activated', questId: quest.questId, title: quest.title });
        this.game.msg?.(`Quest: ${quest.title}`);
        continue;
      }

      let done = true;
      for (const o of quest.objectives) {
        const raw = this._progressOf(quest, o);
        const absolute = o.absolute || o.type === 'GrowPopulation' || o.type === 'ConvertSouls';
        o.progress = absolute ? raw : Math.max(0, raw - (o._base || 0));
        if (o.progress < (o.targetAmount ?? 1)) done = false;
      }
      if (done) this.complete(quest);
    }
  }

  /** Apply a quest's rewards and retire it. */
  complete(quest) {
    if (quest.state === QUEST_STATE.COMPLETE) return;
    quest.state = QUEST_STATE.COMPLETE;
    this.stats.completed++;

    const g = this.game;
    const r = quest.rewards || {};

    if (r.victoryPoints) {
      this.stats.victoryPoints[quest.side] = (this.stats.victoryPoints[quest.side] || 0) + r.victoryPoints;
    }
    if (r.unlockedTech) g.stateOf(quest.side).techs[r.unlockedTech] = 1;
    if (r.weatherShift && r.weatherShift !== 'None') this.applyWeatherShift(r.weatherShift);
    if (r.alignmentImpact && quest.side === 'player') {
      nudge(g.alignment, {
        good: r.alignmentImpact.goodEvilDelta || 0,
        order: r.alignmentImpact.orderChaosDelta || 0,
      });
    }

    this.log.push({ t: g.elapsed, event: 'completed', questId: quest.questId, title: quest.title, vp: r.victoryPoints || 0 });
    g.msg?.(`Quest complete: ${quest.title} (+${r.victoryPoints || 0} VP)`);
  }

  /** Translate a manifest weather shift into the game's weather state. */
  applyWeatherShift(shift) {
    const cy = this.game.cycles;
    if (!cy) return;
    const map = { Rainstorm: 'storm', ClearSkies: 'sunny', Heatwave: 'heatwave' };
    const w = map[shift];
    if (!w) return;
    cy.weather = w;
    cy.weatherTimer = 30;
  }

  /** Quests currently shown in the HUD. */
  get active() { return this.quests.filter((q) => q.state === QUEST_STATE.ACTIVE); }
  get completed() { return this.quests.filter((q) => q.state === QUEST_STATE.COMPLETE); }

  /** Compact line for the purpose strip: first active quest + progress. */
  hudLine() {
    const q = this.active[0];
    if (!q) return '';
    const bits = q.objectives.map((o) => {
      const need = o.targetAmount ?? 1;
      const have = Math.min(Math.floor(o.progress || 0), need);
      return `${have}/${need}`;
    });
    return `${q.title} ${bits.join(' · ')}`;
  }

  /** Victory points earned from quests by a side. */
  vpFor(side) { return this.stats.victoryPoints[side] || 0; }
}
