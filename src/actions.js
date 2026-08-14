// Exhaustive catalogue of unit actions & interactions with the world,
// other units, animals, monsters, buildings and holdable objects.
// Used by AI decision trees, the Lexicon, and status-icon mapping.

export const STATUS_ICONS = {
  sleep:   { glyph: 'z', color: '#9ec9ff', bob: true,  fade: true },
  love:    { glyph: '♥', color: '#ff6b8a', bob: true,  fade: false },
  panic:   { glyph: '!', color: '#ff4444', bob: false, fade: false },
  alert:   { glyph: '⚠', color: '#f5c518', bob: true,  fade: false },
  hunt:    { glyph: '🏹', color: '#c9a06a', bob: false, fade: false },
  gather:  { glyph: '🌿', color: '#6dbf5b', bob: false, fade: false },
  chop:    { glyph: '🪓', color: '#8a6f47', bob: false, fade: false },
  mine:    { glyph: '⛏', color: '#8a8578', bob: false, fade: false },
  fish:    { glyph: '🎣', color: '#6aa7c8', bob: false, fade: false },
  build:   { glyph: '🔨', color: '#e8c064', bob: false, fade: false },
  pray:    { glyph: '✝', color: '#c9a0e8', bob: true,  fade: false },
  think:   { glyph: '?', color: '#a0c4e8', bob: true,  fade: false },
  deposit: { glyph: '📦', color: '#d9c66a', bob: false, fade: false },
  explore: { glyph: '👁', color: '#a8b0c0', bob: false, fade: false },
  retreat: { glyph: '↩', color: '#b08060', bob: false, fade: false },
  hold:    { glyph: '✋', color: '#e8e4d8', bob: false, fade: false },
  eat:     { glyph: '🍖', color: '#d7263d', bob: true,  fade: false },
  chat:    { glyph: '…', color: '#e8e4d8', bob: true,  fade: true },
  shaman:  { glyph: '✦', color: '#37c8ab', bob: true,  fade: false },
  tame:    { glyph: '🐾', color: '#c9a06a', bob: false, fade: false },
  work:    { glyph: '⚒', color: '#d9c66a', bob: false, fade: false },
  drown:   { glyph: '💧', color: '#6aa7c8', bob: true,  fade: true },
  companion:{ glyph: '♡', color: '#e8a9c9', bob: true,  fade: false },
};

/**
 * Action matrix: who can do what with what.
 * Each entry: { id, actorRoles, targets, needs, result, icon }
 */
export const ACTIONS = [
  // —— World / terrain ——
  { id: 'walk',        actor: ['*'],              target: 'ground',     needs: [],           result: 'move to point', icon: null },
  { id: 'sprint',      actor: ['*'],              target: 'ground',     needs: ['energy'],   result: 'fast move, drains energy', icon: 'panic' },
  { id: 'sleep',       actor: ['gather','inspire','think','pray','hunt','shaman','lead'], target: 'campfire', needs: ['night'], result: 'heal + energy', icon: 'sleep' },
  { id: 'explore',     actor: ['gather','hunt','shaman'], target: 'fog', needs: [],         result: 'reveal fog of war', icon: 'explore' },

  // —— Flora ——
  { id: 'chop_tree',   actor: ['gather','farmer'], target: 'tree',       needs: [],           result: '+wood', icon: 'chop' },
  { id: 'shake_tree',  actor: ['god'],             target: 'tree',       needs: [],           result: 'drop wood/stick', icon: 'chop' },
  { id: 'pick_bush',   actor: ['gather','farmer','gatherer'], target: 'bush', needs: [],    result: '+food', icon: 'gather' },
  { id: 'pick_stick',  actor: ['gather','gatherer','farmer','hunter'], target: 'stick', needs: [], result: 'hold stick', icon: 'hold' },
  { id: 'plant_tree',  actor: ['god'],             target: 'ground',     needs: ['dp'],       result: 'sapling', icon: null },

  // —— Minerals ——
  { id: 'quarry_rock', actor: ['gather','farmer'], target: 'rock',       needs: [],           result: '+rock', icon: 'mine' },
  { id: 'mine_ore',    actor: ['gather','farmer'], target: 'metal',      needs: [],           result: '+metal', icon: 'mine' },

  // —— Fauna ——
  { id: 'hunt',        actor: ['hunt','hunter','knight'], target: 'animal', needs: [],      result: '+food, kill animal', icon: 'hunt' },
  { id: 'fish',        actor: ['gather','gatherer','hunter'], target: 'fish', needs: ['water'], result: '+food', icon: 'fish' },
  { id: 'flee_monster',actor: ['*'],               target: 'monster',    needs: [],           result: 'panic away', icon: 'panic' },
  { id: 'fight_monster',actor: ['fight','knight','hunter'], target: 'monster', needs: [],   result: 'damage monster', icon: 'alert' },

  // —— Social ——
  { id: 'mate',        actor: ['adult'],           target: 'adult_other_sex', needs: ['home','food'], result: 'birth', icon: 'love' },
  { id: 'chat',        actor: ['*'],               target: 'kin',        needs: [],           result: '+devotion', icon: 'chat' },
  { id: 'inspire',     actor: ['inspire','princess','shaman'], target: 'kin', needs: [],     result: '+belief', icon: 'love' },
  { id: 'convert',     actor: ['temple'],          target: 'adult',      needs: ['belief'],   result: 'become monk', icon: 'pray' },
  { id: 'train',       actor: ['barracks'],        target: 'farmer',     needs: ['food'],     result: 'become knight', icon: 'alert' },

  // —— Buildings ——
  { id: 'deposit',     actor: ['gather','gatherer','hunter','farmer'], target: 'campfire', needs: ['carry'], result: 'stockpile', icon: 'deposit' },
  { id: 'build',       actor: ['gather','farmer','gatherer'], target: 'site', needs: [],     result: 'advance construction', icon: 'build' },
  { id: 'pray',        actor: ['pray','monk','shaman'], target: 'temple', needs: [],        result: '+dp +belief', icon: 'pray' },
  { id: 'ponder',      actor: ['think','philosopher','shaman'], target: 'home', needs: [],  result: '+dp', icon: 'think' },
  { id: 'smelt',       actor: ['forge'],           target: 'rock',       needs: [],           result: 'rock→metal', icon: 'mine' },

  // —— Combat ——
  { id: 'attack',      actor: ['fight','knight','hunter'], target: 'enemy', needs: [],       result: 'damage', icon: 'alert' },
  { id: 'patrol',      actor: ['fight','knight'],  target: 'home',       needs: [],           result: 'guard radius', icon: 'alert' },
  { id: 'retreat',     actor: ['*'],               target: 'campfire',   needs: ['wounded'],  result: 'run home', icon: 'retreat' },
  { id: 'panic',       actor: ['*'],               target: 'threat',     needs: ['fear'],     result: 'sprint away arms up', icon: 'panic' },

  // —— Holdables ——
  { id: 'hold_item',   actor: ['*'],               target: 'holdable',   needs: [],           result: 'carry in hand', icon: 'hold' },
  { id: 'drop_item',   actor: ['*'],               target: 'holdable',   needs: ['holding'],  result: 'drop at feet', icon: null },
  { id: 'offer_stick', actor: ['gather','gatherer'], target: 'campfire', needs: ['stick'],   result: '+wood', icon: 'deposit' },

  // —— God hand ——
  { id: 'grab',        actor: ['god'],             target: 'grabbable',  needs: [],           result: 'lift entity', icon: null },
  { id: 'throw',       actor: ['god'],             target: 'held',       needs: ['dp'],       result: 'airborne impact', icon: null },
  { id: 'shake',       actor: ['god'],             target: 'held',       needs: ['dp'],       result: 'tree drops / fear', icon: null },
  { id: 'inspect',     actor: ['god'],             target: 'any',        needs: [],           result: 'open panel', icon: null },
  { id: 'spell_rain',  actor: ['god'],             target: 'ground',     needs: ['dp','faith'], result: 'heal + grow', icon: null },
  { id: 'spell_bolt',  actor: ['god'],             target: 'ground',     needs: ['dp','faith'], result: 'smite line', icon: null },
  { id: 'spell_fire',  actor: ['god'],             target: 'ground',     needs: ['dp','faith'], result: 'blast', icon: null },
  { id: 'terraform',   actor: ['god'],             target: 'ground',     needs: ['dp'],       result: 'raise/lower', icon: null },
  { id: 'tame',        actor: ['gather','hunter','shaman'], target: 'animal', needs: ['willpower'], result: 'companion', icon: 'tame' },
  { id: 'scoop_deposit',actor: ['god'],            target: 'campfire',   needs: ['scoop'],    result: 'stockpile wood/food/water', icon: 'deposit' },
  { id: 'invoke',      actor: ['god'],             target: 'ground',     needs: ['dp','faith'], result: 'summon fauna', icon: 'tame' },
  { id: 'heal_aura',   actor: ['god'],             target: 'kin',        needs: ['dp','faith'], result: 'heal + clear panic', icon: null },
  { id: 'work',        actor: ['gather','farmer','gatherer'], target: 'site', needs: ['schedule'], result: 'scheduled labor', icon: 'work' },
  { id: 'pave',        actor: ['gather','farmer'], target: 'road',       needs: ['era'],      result: 'pave path', icon: 'work' },
];

/** God drop-next-to interactions: place a follower beside something. */
export const DROP_INTERACT = [
  { id: 'tree_wood',   near: 'tree',      task: 'harvest', note: 'Chop wood' },
  { id: 'tree_fruit',  near: 'bush',      task: 'harvest', note: 'Pick fruit' },
  { id: 'rock_mine',   near: 'rock',      task: 'harvest', note: 'Gather stone' },
  { id: 'ore_mine',    near: 'metal',     task: 'harvest', note: 'Dig ore' },
  { id: 'shore_fish',  near: 'fresh',     task: 'fish',    note: 'Fish the shallows' },
  { id: 'shore_water', near: 'fresh',     task: 'water',   note: 'Fetch drinking water' },
  { id: 'hearth',      near: 'campfire',  task: 'deposit', note: 'Offer what they carry' },
  { id: 'well',        near: 'well',      task: 'water',   note: 'Draw water' },
  { id: 'farm',        near: 'farm',      task: 'work',    note: 'Tend the field' },
  { id: 'build_site',  near: 'construct', task: 'build',   note: 'Join the builders' },
  { id: 'hunt',        near: 'animal',    task: 'hunt',    note: 'Hunt the beast' },
  { id: 'tame',        near: 'animal',    task: 'tame',    note: 'Try to tame' },
  { id: 'attack',      near: 'enemy',     task: 'attack',  note: 'Strike' },
  { id: 'social',      near: 'kin',       task: 'wander',  note: 'Stand with kin' },
  { id: 'stick',       near: 'holdable',  task: 'pickup',  note: 'Pick up wood' },
];

/** Map a creature's current task → status icon key. */
export function iconForTask(task, extra = {}) {
  if (extra.sleeping || task === 'sleep') return 'sleep';
  if (extra.loving || task === 'mate') return 'love';
  if (task === 'panic') return 'panic';
  if (task === 'hunt') return 'hunt';
  if (task === 'harvest' && extra.yields === 'food') return 'gather';
  if (task === 'harvest' && extra.yields === 'wood') return 'chop';
  if (task === 'harvest' && (extra.yields === 'rock' || extra.yields === 'metal')) return 'mine';
  if (task === 'fish') return 'fish';
  if (task === 'water') return 'fish';
  if (task === 'build') return 'build';
  if (task === 'level') return 'build';
  if (task === 'work' || task === 'pave') return 'work';
  if (task === 'tame') return 'tame';
  if (extra.drowning || task === 'drown') return 'drown';
  if (extra.companion) return 'companion';
  if (task === 'pray') return 'pray';
  if (task === 'ponder' || task === 'think') return 'think';
  if (task === 'deposit') return 'deposit';
  if (task === 'explore') return 'explore';
  if (task === 'retreat' || task === 'flee') return 'retreat';
  if (task === 'attack' || task === 'patrol') return 'alert';
  if (extra.holding) return 'hold';
  if (extra.alert) return 'alert';
  if (extra.shaman) return 'shaman';
  if (extra.chat) return 'chat';
  return null;
}

export function actionsForRole(role) {
  return ACTIONS.filter(a => a.actor.includes('*') || a.actor.includes(role) || a.actor.includes('adult'));
}
