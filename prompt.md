# DarkestLight — Master Game Prompt

## Vision & Influences

Create a 3D minimalist real-time strategy game mixing:
- **Spore** (creature/civilization evolution, DNA, procedural life)
- **Black & White 1 & 2** (god-hand interaction, belief, moral influence over tribes)
- **Godus** (divine terrain shaping, settlement growth, godly presence over the land)
- **Warcraft** (building, structures, units, spells, technology)
- **Civilization** (building, structures, units, spells, technology)
- **Age of Empires** (building, structures, units, spells, technology)
- **Sid Meier's Civilization** (building, structures, units, spells, technology)
- **Civilization VI** (building, structures, units, spells, technology)
- **Civilization VII** (building, structures, units, spells, technology)
- **Civilization VIII** (building, structures, units, spells, technology)
- **Civilization IX** (building, structures, units, spells, technology)
- **Dwarf Fortress** (building, structures, units, spells, technology)
- **Minecraft** (building, structures, units, spells, technology)
- **Terraria** (building, structures, units, spells, technology)
- **Stardew Valley** (building, structures, units, spells, technology)
- **The Sims** (building, structures, units, spells, technology)
- **The Elder Scrolls** (building, structures, units, spells, technology)
- **The Fallout Shelter** (building, structures, units, spells, technology)

The tone is heroic fantasy crossed with real-world civilizations, expressed through clear color codes per faction, biome, and flora.

---

## Technical Constraints

- Built **exclusively in Three.js**
- Write your own functions and systems
- **Do not import anything other than Three.js**
- Procedurally **generate 3D models** and the **game mechanics** tied to those models
- Custom **GLSL shaders** allowed for ground, socle, and similar world presentation (still Three.js only)
- Minimalist 3D visual language (readable silhouettes, strong color coding, no asset-pack dependency)

---

## Core Game Loop

1. Two civilizations spawn at the **base / stone age**, each on opposite sides of the map.
2. One civilization belongs to the **player**; the other is controlled by the **AI**.
3. Victory: **convert** or **exterminate** the enemy civilization.
4. Each match has a **maximum timer of 20 minutes** and a **score system**.
5. The world advances through **cycles**: day/night, seasons, rain/sun — which affect longevity, strength, gathering, and behavior.
6. Progress is gated by **achievements** and costs **Divine Points** to unlock (tech, favors, tools, structures, spells, etc.).

---

## Main Menu & Modes

Provide a simple main menu with:
- **Settings** (graphics, camera speed, match length, **remappable keybindings**, platform banner, **user report download**)
- **Battle mode** (conflict / conversion / extermination focused)
- **Construction mode** (building, terraforming, institutional planning focused)
- **Story mode** (stub / chronicles)
- **Lexicon (Models & Stats gallery)** — filterable cards, **3 per row** (civilization, class, creature type, flora, buildings, spells, objects)

### Launch detection
On boot, detect **language**, **hardware hints** (e.g. Mac / Apple Silicon), and **keyboard layout** (French locale → **AZERTY** defaults: ZQSD pan). Persist remaps in localStorage. Offer a lightweight **anonymous user report** (platform + keybinds + settings) for support.

---

## Player Interaction (God Cursor)

The player interacts with the world map through the **mouse cursor** (god hand), which can:
- **Grab / throw / shake** living things and trees
- **Plant** trees
- **Draw / make shapes** to cast **spells**
- **Dig / raise** terrain (geomorphing)
- **Place buildings** with a **phantom footprint** (green = valid, red = invalid)

Camera:
- **Hold left mouse + drag** pans the map (grab-the-map: drag opposite to desired camera motion)
- Right / middle mouse rotates; wheel zooms
- Keyboard pan uses remappable binds (WASD or AZERTY ZQSD)

Building validation must reject sites that are:
- Partly on **water** (except bridges)
- On **shafts / sinkholes**
- Overlapping existing structures or blocking trees/rocks
- Too steep

On successful place: **level and flatten** a pad slightly larger than the building footprint, then spawn the construction site / structure.

---

## World Creation Pipeline

Sea level is **altitude 0**. The map is a closed polygonal island (`square` / `hexagon` / `octagon` / `round`).

### Climate fields (per vertex)
| Variable | Range / meaning |
|---|---|
| **Altitude** | World Y; sea = `0` |
| **Humidity** | `0..1` (orographic + river + dry-front adversaries) |
| **Temperature** | `0..1` cold→hot (latitude-like + lapse rate + volcanic heat) |
| **Biome id** | Soft-classified from the three frames above |
| **Deposits** | sand, clay, silt, loam, peat, gravel, limestone, basalt, ash |

### Adversarial generation steps
1. **Macro relief** — continental FBM vs **ridge adversary** vs **valley cutter**; island falloff; sine river corridor; volcanic cone hotspot; rare shafts.
2. **Temperature** — north cooler, altitude lapse, volcanic warming.
3. **Humidity** — moist FBM vs **arid dry-front**; windward orographic boost; river/shore moisture; cold air holds less water.
4. **Biome classification** — competing soft membership scores across biome frames; volcano / shore / seabed special cases.
5. **Geological deposits** — biome frame baselines × real-world-inspired equations (alluvial silt near rivers, aeolian sand in arid basins, peat in wetlands, limestone shelves, colluvial gravel on highs, basalt/ash around volcanoes). Thermal + light hydraulic erosion redistribute heights and silt/clay downhill.
6. **Surface terracing** — only a few **surface layers** (deep useless stacks removed); sharpness follows biome (rock hard, wetlands soft).
7. **Socle** — polygonal pedestal under the map, **slightly larger** than the land footprint, slate color + marble/strata **shader** (visually distinct from living ground). Closes the underside aesthetically.
8. **Ground shaders** — grass blade stipple + sway on green biomes; **wind-ripple waves** on sand; rock strata bands on high stone.

### Complete biome list (value frames)
Ice desert · Tundra · Boreal forest · Temperate forest · Tropical forest · Swamp · Mangrove · Desert · Ice cap / snowfields · Plains · Savanna · Chaparral / scrub · Hills · High mountains · Alpine meadow · Volcano · Shore / beach · Seabed

Each biome stores altitude / humidity / temperature ranges, default deposit mixes, base color, and pattern tag (`grass` / `sand` / `moss` / `rock` / `ice` / `none`).

### Runtime world systems
- Fog of war, path wear, building dirt stamps, leveled pads
- Day / night + moon, seasons, weather machine (sunny, cloudy, rain, storm, snow, blizzard, heatwave) with wind
- Flora placement biased by biome / humidity / altitude
- Geomorphing remains available to the god hand

---

## Structures & Institutions

- Start from a **campfire** (hearth, storage, reproduction hub)
- Buildings: hut, farm, barracks, temple, forge, bridge — with footprints, costs, build times
- **Huts** are soft dwelling forms with **doors** (no decorative roof spikes)
- Workers clear / finish construction sites; Construction mode can accelerate sandbox builds
- Institutions expose intents and dependent creatures on inspect

---

## Special Objects, Holdables & Technology

- **Holdables** (e.g. wood sticks near trees) — units pick up, carry, deposit at camp for wood
- Relics and special objects on the map
- Branching **technology trees**; unlocks cost achievements + Divine Points
- Spell lexicon cards; faith-scaled spells (rain, lightning, fireball, etc.)

---

## Civilizations (Launch Set)

1. **Chinese** · 2. **Vikings** · 3. **Franks** · 4. **Orcs** · 5. **Elves** · 6. **Aztecs**

Each has color code, aesthetic, animal, monster, and cultural flavor.

### Starting Age Rules
- All start in the **stone age** with fast reproduction
- Primary needs: **food** and **wood** (also rock / metal as tech opens)
- Limited early environmental agency; expands with tools / tech / god powers

---

## Creatures, Classes & Behavior

### Intelligent classes (decision trees)
Original / core types include:
- **Gatherer**, **Hunter**, **Shaman**
- Farmer, Knight, King, Queen, Princess, Philosopher, Monk

Statuses show **icons above heads** (rhythmic `z` while sleeping, `♥` for lovers meeting, hunt / gather / pray / hold / panic / alert, etc.). Exhaustive action matrix lives in `docs/ACTIONS.md` / `src/actions.js`.

Unit move speed is intentionally **~30% slower** than early prototypes for readability.

### Animals & Monsters
Roam by civ / biome; higher-detail procedural meshes (ears, teeth, tails, joints). Snakes and fish included.

### Belief & Emotion Toward Gods
Creatures fear/love/respect/hate gods/players/AIs. Belief feeds conversion, loyalty, unrest, and the Divine Point economy.

---

## Character Stats & DNA

Track at least: age, speed, intelligence, resilience, strength, responsivity, interactivity, emotions, energy (sprint / panic), night sight.

- DNA mixes with partners when creating babies; inheritance varies generations
- Age maluses over lifespan (except some mythical beings)
- God favors can raise stats (unlockable)

---

## Inspection & Feedback UX

- Click creature → stats, DNA, class, titles, emotions, allegiance
- Click building → institutional intents, needs, dependents
- Side **chronicle log**; end-game recap
- HUD: resources, population, Divine Points, timer, day/night clock, weather
- Lexicon gallery from the menu (filterable, 3-column cards)

---

## Procedural Content Mandate

The game must:
- **Generate 3D models** for civs, classes, animals, monsters, flora, structures, holdables, spells
- **Generate matching mechanics** (stats, behaviors, costs, unlocks)
- Prefer higher polygon detail on individuals (shoulders, elbows, knees) and animals while staying minimalist and faction-readable

---

## Design Priorities (Implementation Order Hint)

1. Three.js bootstrap, camera (LMB drag-pan), god cursor, AZERTY/keybind settings
2. Menu: Settings, Battle, Construction, Lexicon, report system
3. Climate worldgen (altitude / humidity / temperature), biomes, deposits, socle, ground shaders, fog, weather
4. Two opposing stone-age civs, campfire start, food/wood/stick loop
5. Gatherer / hunter / shaman + other classes, DNA, aging, status icons
6. Belief, conversion vs extermination
7. Structures with phantom validation + ground leveling, geomorphing, bridges
8. Tech trees, special objects, achievements, Divine Points, spells
9. Score + 20-minute timer + chronicle / end recap
10. Procedural model + mechanic generation feeding the Lexicon

---

## Non-Goals / Hard Limits

- No libraries other than **Three.js**
- No external 3D asset pipelines — prefer **generated** models
- Keep presentation **minimalist** while systems (climate, geology, belief, AI) stay deep
