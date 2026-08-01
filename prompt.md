# DarkestLight — Master Game Prompt / GDD

Systemic god-game combining the tactile physics of **Black & White**, the deep genetic ecosystem of **Equilinox** (ThinMatrix), and cultural generation of **Ultima Ratio**.

---

## Vision

The player is a deity. The **Hand** (cursor) grabs, levitates, pets, slaps, scoops, and throws with physics. Civilizations grow from campfires under climate-driven biomes. Every individual carries an expanded **XX/YY DNA genome**. Time runs **slow by default** so the world can be observed.

**Influences:** Spore · Black & White · Godus · Equilinox · Ultima Ratio · Civilization / AoE / Warcraft · Dwarf Fortress

**Tech constraints:** Three.js only (plus custom GLSL). Procedural models. Minimalist readable silhouettes with faction color codes.

---

## Core Loop

1. Two stone-age civs spawn opposite sides (player vs AI).
2. Victory: **convert** or **exterminate**.
3. Match timer ≤ 20 minutes + score.
4. Cycles: day/night, seasons, weather, wind — affect gathering, longevity, throws, spells.
5. Progress: achievements + **Divine Points** (tech, favors, spells, fauna invoke).

---

## Time Control

- Default simulation scale **×0.45** (slow / Equilinox-style observation).
- Top HUD: **Pause / Play / Fast / Faster** (`❚❚ ▶ ≫ ⋙`) + live `×scale` label.
- Shortcuts: **Space** pause/resume · **[** / **]** slower / faster.
- Camera always real-time; simulation uses `dt * timeScale`.
- **Focus Mode:** while paused, spells / invoke / plant / build queue; resume flushes the batch.

---

## 1. The Hand (Cursor) & Tactile Physics

| Action | Behavior |
|--------|----------|
| **Hold 1s** on unit | Levitate; unit follows cursor; **flail** limb animation |
| **Throw** | Release while moving — velocity × mass × wind / drag + gravity arc |
| **Slap** | Fast swipe over unit → fear, discipline (−belief) |
| **Pet** | Gentle circle → love, heal, +belief |
| **Shake** | Wiggle while held → harvest tree / terror |
| **Scoop** | Tool scoops wood/food/**water bubble**; drop at camp or nourish land |
| **Plant paint** | Drag plant tool to seed flora |
| **Pan** | LMB drag on empty ground (grab-the-map) |
| **Miracles** | RMB draw shapes (or Spell tool LMB) |

---

## 2. Genetics, AI & Populations

### XX/YY DNA (`src/dna.js`)
- ~**27 traits** (3× original): speed, intelligence, resilience, strength, responsivity, interactivity, emotion, longevity, nightsight, mass, height, reach, windDrag, swim, climb, curiosity, aggression, loyalty, fertility, faithAffinity, skinTone, hairTone, coatPattern, hornSize, heat/cold/moisture tolerance.
- Each trait = **4 numbers 0–9**: XX from one parent, YY from the other.
- Phenotype = **0.55×average + 0.45×median** → live gameplay stats.
- Unique genome **ID** + compact string: `DL-XXXX·race·S9I8… · spe[45\|67] ski[…] fer[…]` (`H` suffix = hybrid).
- Inspect shows full XX/YY loci table + phenotypes.
- **Race mixing:** opposite-race mates preferred; hybrid `civA+civB` offspring; biome adaptation mutations (heat/cold/moisture).
- **Fertility** gene gates birth chance.
- Evolutionary drift toward extreme biomes across generations.

### Fauna invoke
- Tool **Invoke** + HUD **🐾 Invoke**.
- Costs ✦ + faith (battle); construction free.
- Pool from `INVOKE_FAUNA[civ]`; biome filters; **water → fish**.
- **Avatar:** oversized pet of the player civ’s animal; follows camp; learns diet/combat/moral (stub → kin imprint).

### Group AI
- Idle adults form respectful arcs before kings/queens; kneel; ranks hold hands.
- Sensitivity / flocking / influence auras merge or oppose.

---

## 3. God Powers (Miracles & Spells)

**Lexicon tabs:** All · Units · Fauna · **Spells** · Buildings · Flora · Divine

| Shape | Spell |
|-------|--------|
| Large ◯ | Rain of Life (heal + grow + devotion) |
| Small soft ◯ | **Healing Aura** (cure panic, HP, energy) |
| RMB firm ◯ | Shield Bubble |
| Line \| | Lightning (electrifies water) |
| Spiral | Tempest |
| Zigzag | Fireball (long = Earthquake) |
| Star | Meteor crater + shockwave |

- Alignment skins VFX: Benevolent (golden light) · Balanced · Wrathful (brimstone).
- Pets / heals / rain → benevolent; slaps / meteors / fire → wrathful.
- Elemental notes: lightning×water, meteor vs shield, dry flora ignites.

---

## 4. Environment & Weather

- Altitude 0 = sea; humidity, temperature, biomes, geological deposits, socle, ground shaders.
- **Wind lines:** white sinusoidal ribbons; push rain/snow; affect throws; seed propagation.
- Fog of war, path wear, building pads, geomorphing.
- Seasonal tint; storm lightning; fertility stamps from rain / water scoops.

---

## 5. UI & Ledgers

- Resources · DP · time controls · clock · weather · season · score.
- **Ledger** (DNA/eco medians) · **Influence** overlay · Tech · Chronicle · Inspect.
- Settings: shadows, particles, fog, camera, match length, **remappable keys**, AZERTY detect, **user report**.

---

## Civilizations & Classes

Chinese · Vikings · Franks · Orcs · Elves · Aztecs

Classes: Gatherer, Hunter, Shaman, Farmer, Knight, King, Queen, Princess, Philosopher, Monk + titles.

Status icons: sleep `z`, love `♥`, hunt, hold, panic, …

---

## Modes

Battle · Construction · Story (stub) · Lexicon · Settings

---

## Implementation Map

| System | Files |
|--------|--------|
| Time / Focus | `src/main.js`, `src/systems.js` FocusQueue |
| DNA / culture | `src/dna.js`, `src/systems.js`, `src/entities.js` |
| Hand | `src/cursor.js`, flail in `entities.js` |
| Spells / alignment | `src/game.js` cast*, `src/systems.js` spellPalette |
| Invoke / scoop / Avatar | `src/game.js`, cursor tools |
| Influence / ledger | `src/systems.js`, `src/ui.js`, `index.html` |
| Wind / seeds | `src/world.js`, `seedPropagationTick` |
| Lexicon | `index.html` tabs, `src/ui.js`, `models.js` catalog |
| Worldgen | `src/world.js` |

---

## Roadmap (remaining polish)

1. Richer ledger charts (population sparkline in-panel)
2. Avatar combat abilities unlocked by learned traits
3. More elemental synergies (water×fire → steam fog)
4. Drown death / rescue by high-swim kin
5. Clothing mesh variants from median culture DNA
6. Frozen lakes in winter; deciduous leaf drop

---

## Non-Goals

- No libraries other than Three.js
- No external asset packs — procedural meshes
- Minimalist presentation, deep systems underneath
