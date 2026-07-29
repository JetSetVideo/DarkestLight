// The six launch civilizations. Each has a color code, skin/cloth palette,
// its own animal + monster, and flavour used by the gallery and spawner.

export const CIVS = {
  chinese: {
    key: 'chinese', name: 'Chinese', color: 0xd7263d, accent: 0xf5c518,
    skin: 0xe8c39e, cloth: 0xb01f33,
    animal: 'panda', monster: 'dragon',
    desc: 'Disciplined jade empire. Balanced stats, philosophers research faster.',
    bonus: { intelligence: 0.10 },
  },
  vikings: {
    key: 'vikings', name: 'Vikings', color: 0x2e6fb7, accent: 0xcfd8e3,
    skin: 0xf0d5b8, cloth: 0x27547f,
    animal: 'wolf', monster: 'troll',
    desc: 'Storm-hardened raiders of the fjords. Strong, resilient, cold-proof.',
    bonus: { strength: 0.12 }, night: 0.15,
  },
  franks: {
    key: 'franks', name: 'Franks', color: 0x3b7a3b, accent: 0xd9c66a,
    skin: 0xeccdaa, cloth: 0x2f6330,
    animal: 'boar', monster: 'griffin',
    desc: 'Feudal knights of the green marches. Faithful and well organised.',
    bonus: { resilience: 0.10 },
  },
  orcs: {
    key: 'orcs', name: 'Orcs', color: 0x5c8a2e, accent: 0x3a2b1e,
    skin: 0x6f8f3f, cloth: 0x4a3826,
    animal: 'warg', monster: 'ogre',
    desc: 'Brutal war-clans. Reproduce fast, age fast, hit hard.',
    bonus: { strength: 0.18, longevity: -0.15 }, night: 0.3,
  },
  elves: {
    key: 'elves', name: 'Elves', color: 0x27b3a4, accent: 0xe6f2d8,
    skin: 0xf2e3cd, cloth: 0x1d8a7f,
    animal: 'deer', monster: 'ent',
    desc: 'Ageless keepers of the forest. Long-lived, wise, slow to breed.',
    bonus: { longevity: 0.30, intelligence: 0.12 }, night: 0.4,
  },
  aztecs: {
    key: 'aztecs', name: 'Aztecs', color: 0xe0842c, accent: 0x37c8ab,
    skin: 0xc98a5b, cloth: 0xbf6d1f,
    animal: 'jaguar', monster: 'serpent',
    desc: 'Sun-blooded priests of the fifth age. Devotion generates extra favor.',
    bonus: { responsivity: 0.12 },
  },
};

export const CIV_KEYS = Object.keys(CIVS);

export const CLASSES = {
  // original stone-age archetypes
  gatherer:    { name: 'Gatherer',    role: 'gather',  baseStr: 0.85, baseInt: 0.95, hp: 38 },
  hunter:      { name: 'Hunter',      role: 'hunt',    baseStr: 1.35, baseInt: 0.95, hp: 55 },
  shaman:      { name: 'Shaman',      role: 'shaman',  baseStr: 0.55, baseInt: 1.7,  hp: 42 },
  // specialised / later roles
  farmer:      { name: 'Farmer',      role: 'gather',  baseStr: 0.9,  baseInt: 0.9,  hp: 40 },
  knight:      { name: 'Knight',      role: 'fight',   baseStr: 1.6,  baseInt: 0.8,  hp: 90 },
  king:        { name: 'King',        role: 'lead',    baseStr: 1.1,  baseInt: 1.3,  hp: 70 },
  queen:       { name: 'Queen',       role: 'lead',    baseStr: 0.9,  baseInt: 1.4,  hp: 60 },
  princess:    { name: 'Princess',    role: 'inspire', baseStr: 0.7,  baseInt: 1.1,  hp: 45 },
  philosopher: { name: 'Philosopher', role: 'think',   baseStr: 0.6,  baseInt: 1.8,  hp: 40 },
  monk:        { name: 'Monk',        role: 'pray',    baseStr: 0.5,  baseInt: 1.6,  hp: 45 },
};

// Buildings: costs, role (what the institution does), and construction effort.
export const BUILDINGS = {
  campfire: { name: 'Campfire', wood: 0,  rock: 0, metal: 0, dp: 0,  hp: 120, buildTime: 0,  footprint: 3.2,
    role: 'hearth', desc: 'Heart of the tribe. Storage, warmth, reproduction hub.', intent: 'Keep the tribe fed, warm and growing.' },
  hut:      { name: 'Hut',      wood: 25, rock: 5, metal: 0, dp: 0,  hp: 180, buildTime: 18, footprint: 2.8,
    role: 'shelter', desc: '+6 population cap. Race-shaped dwellings.', intent: 'Shelter families and raise children.' },
  farm:     { name: 'Farm',     wood: 30, rock: 0, metal: 0, dp: 0,  hp: 140, buildTime: 22, footprint: 3.5, tech: 'agriculture',
    role: 'food', desc: 'Renewable food source for farmers.', intent: 'Turn soil and seasons into steady food.' },
  barracks: { name: 'Barracks', wood: 40, rock: 15, metal: 5, dp: 20, hp: 280, buildTime: 28, footprint: 3.8, tech: 'warcraft',
    role: 'war', desc: 'Train farmers into knights.', intent: 'Forge warriors to defend and conquer.' },
  temple:   { name: 'Temple',   wood: 50, rock: 20, metal: 0, dp: 40, hp: 260, buildTime: 32, footprint: 4.0, tech: 'mysticism',
    role: 'faith', desc: 'Generates Divine Points. Converts visitors into monks.', intent: 'Spread the word of the god above.' },
  forge:    { name: 'Forge',    wood: 35, rock: 25, metal: 10, dp: 30, hp: 220, buildTime: 30, footprint: 3.2, tech: 'masonry',
    role: 'craft', desc: 'Smelts ore into metal stockpiles.', intent: 'Hammer stone and fire into civilization.' },
  bridge:   { name: 'Bridge',   wood: 25, rock: 10, metal: 0, dp: 0,  hp: 200, buildTime: 16, footprint: 2.0, tech: 'masonry',
    role: 'path', desc: 'Crosses water. Creatures path over it.', intent: 'Join what the river divided.' },
};

// Spells shown in the Lexicon. Power scales with tribal faith.
export const SPELLS = [
  { key: 'rain', shape: 'circle', name: 'Rain of Life', glyph: '◯', cost: 30,
    cast: 'Draw a closed circle on the ground',
    desc: 'Heals the flock, grows bushes, raises devotion. Radius & heal scale with Faith.' },
  { key: 'lightning', shape: 'line', name: 'Lightning', glyph: '|', cost: 40,
    cast: 'Draw a straight line across the sky',
    desc: 'Smites along the line. Damage & width scale with Faith.' },
  { key: 'fireball', shape: 'zigzag', name: 'Fireball', glyph: '∿', cost: 50,
    cast: 'Draw a zigzag (at least 3 turns)',
    desc: 'A falling fireball scorches a blast radius. Size & power scale with Faith.' },
];

// ---------------------------------------------------------------------------
// Branching tech tree. `req` = parent techs, `excludes` = the other branch of
// an either/or choice (picking one locks the other), `civ` = civ-exclusive.
// Tier is the column in the tree UI.
// ---------------------------------------------------------------------------
export const TECHS = [
  // trunk
  { key: 'toolmaking',  tier: 0, name: 'Toolmaking',  dp: 50,  req: [],
    desc: '+30% gathering speed.', ach: 'wood50', achDesc: 'Gather 50 wood' },

  // subsistence branch — choice
  { key: 'agriculture', tier: 1, name: 'Agriculture', dp: 80,  req: ['toolmaking'], excludes: 'herbalism',
    desc: 'Unlocks the Farm.', ach: 'pop12', achDesc: 'Reach 12 population' },
  { key: 'herbalism',   tier: 1, name: 'Herbalism',   dp: 70,  req: ['toolmaking'], excludes: 'agriculture',
    desc: 'Bushes yield +60%, rain regrows twice as much.', ach: 'food80', achDesc: 'Gather 80 food' },

  // construction branch
  { key: 'masonry',     tier: 1, name: 'Masonry',     dp: 60,  req: ['toolmaking'],
    desc: 'Buildings +100% HP, unlocks the Bridge.', ach: 'wood100', achDesc: 'Stockpile 100 wood' },

  // war branch
  { key: 'warcraft',    tier: 2, name: 'Warcraft',    dp: 80,  req: ['masonry'],
    desc: 'Unlocks the Barracks, warriors +50% strength.', ach: 'pop15', achDesc: 'Reach 15 population' },
  { key: 'berserk',     tier: 3, name: 'Berserk',     dp: 90,  req: ['warcraft'], excludes: 'discipline',
    desc: 'Warriors +30% strength, +15% speed.', ach: 'kills5', achDesc: 'Slay 5 foes' },
  { key: 'discipline',  tier: 3, name: 'Discipline',  dp: 90,  req: ['warcraft'], excludes: 'berserk',
    desc: 'Warriors +40% health, spread alerts further.', ach: 'warriors5', achDesc: 'Muster 5 warriors' },

  // faith branch
  { key: 'mysticism',   tier: 2, name: 'Mysticism',   dp: 100, req: ['toolmaking'],
    desc: 'Spells cost 30% less, unlocks the Temple.', ach: 'spells5', achDesc: 'Cast 5 spells' },
  { key: 'stormcalling',tier: 3, name: 'Stormcalling',dp: 110, req: ['mysticism'], excludes: 'lifebloom',
    desc: 'Lightning and fire deal +50% damage.', ach: 'spells10', achDesc: 'Cast 10 spells' },
  { key: 'lifebloom',   tier: 3, name: 'Lifebloom',   dp: 110, req: ['mysticism'], excludes: 'stormcalling',
    desc: 'Rain heals twice as much and doubles devotion gained.', ach: 'births10', achDesc: '10 children born' },

  // civilization capstones (tier 4)
  { key: 'celestial_bureaucracy', tier: 4, civ: 'chinese', name: 'Celestial Bureaucracy', dp: 120, req: ['mysticism'],
    desc: 'Philosophers produce double Divine Points.', ach: 'pop20', achDesc: 'Reach 20 population' },
  { key: 'runestones',  tier: 4, civ: 'vikings', name: 'Runestones', dp: 120, req: ['warcraft'],
    desc: 'Warriors are fearless and +10% strength.', ach: 'pop20', achDesc: 'Reach 20 population' },
  { key: 'chivalry',    tier: 4, civ: 'franks', name: 'Chivalry', dp: 120, req: ['warcraft'],
    desc: 'Your flock gains devotion 50% faster.', ach: 'pop20', achDesc: 'Reach 20 population' },
  { key: 'bloodrage',   tier: 4, civ: 'orcs', name: 'Bloodrage', dp: 120, req: ['warcraft'],
    desc: 'Warrior kills feed the tribe (+5 food), +20% strength.', ach: 'kills8', achDesc: 'Slay 8 foes' },
  { key: 'moonsight',   tier: 4, civ: 'elves', name: 'Moonsight', dp: 120, req: ['mysticism'],
    desc: 'Your creatures see as far at night as by day.', ach: 'pop20', achDesc: 'Reach 20 population' },
  { key: 'sun_rituals', tier: 4, civ: 'aztecs', name: 'Sun Rituals', dp: 120, req: ['mysticism'],
    desc: '+50% Divine Point income.', ach: 'spells8', achDesc: 'Cast 8 spells' },
];

// Titles stack on top of a class/job: a knight with the 'prince' title is a
// "Warrior Prince", a farmer with 'chief' is a "Worker Chief".
export const TITLES = {
  king:     { name: 'King',     desc: 'Sovereign of the tribe. Leads from the campfire.' },
  queen:    { name: 'Queen',    desc: 'Sovereign of the tribe. Leads from the campfire.' },
  prince:   { name: 'Prince',   desc: 'Royal blood. Inspires devotion in nearby kin.' },
  princess: { name: 'Princess', desc: 'Royal blood. Inspires devotion in nearby kin.' },
  chief:    { name: 'Chief',    desc: 'Best of their trade. Nearby peers work 20% faster.' },
};
export const JOB_LABEL = {
  gatherer: 'Gatherer', hunter: 'Hunter', shaman: 'Shaman',
  farmer: 'Worker', knight: 'Warrior', philosopher: 'Sage', monk: 'Monk',
  king: 'King', queen: 'Queen', princess: 'Maiden',
};

export const FAVORS = [
  { key: 'vigor',   name: 'Favor of Vigor',   dp: 60, desc: 'All creatures +25% speed & strength for 60s.' },
  { key: 'harvest', name: 'Favor of Harvest', dp: 50, desc: 'Instant +80 food, bushes regrow.' },
  { key: 'youth',   name: 'Favor of Youth',   dp: 90, desc: 'Halves age maluses for 90s.' },
];
