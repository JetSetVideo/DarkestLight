# Darkest Light

A minimalist 3D real-time-strategy god game — **Spore × Black & White 1/2 × Godus** — built **exclusively with Three.js** (one local module, zero other dependencies). Every 3D model and its mechanics are procedurally generated.

## Run

Any static file server works:

```bash
python3 -m http.server 8123
# or: npx serve .
```

Then open http://localhost:8123

## The game

- **Two civilizations** spawn at the stone age on opposite sides of a procedurally generated island split by a river — you are one god, an **AI god** controls the other. **Convert or exterminate** them before the **20-minute timer** ends (score decides otherwise), then review the **end-of-game recap** with a population chart and full statistics for both sides.
- **Six civilizations**: Chinese, Vikings, Franks, Orcs, Elves, Aztecs — each with its own color code, stat bonus, roaming animal (panda, wolf, boar, warg, deer, jaguar) and monster (dragon, troll, griffin, ogre, ent, serpent).
- **Creatures** have DNA (9 genes incl. night sight) mixed from both parents with mutation when babies are born. Age applies stat maluses (monsters are mythical and don't age). Jobs — worker, warrior, sage, royals — each run their own decision tree, and individuals **accumulate titles** on top of them: royal blood makes Warrior Princes, the best worker becomes the Worker Chief (aura for nearby peers).
- **Awareness**: workers claim resource nodes so nobody doubles up, threatened creatures spread **alert** to nearby kin, groups walk **side by side** thanks to separation steering, and everyone but the night watch **sleeps by the fire** after dusk.
- **Belief**: every intelligent creature fears/loves/respects/hates each god on the map. Temples, princes(ses), rain and terror shift belief; at high enough devotion, enemies **convert**.
- **Economy & tech**: food + wood gathering, the **campfire is the tribe's heart** — click it for a full tribe report, and its flame size & color show how the tribe is doing. A **branching tech tree** (trunk → subsistence/war/faith branches with either/or choices, plus one capstone unique to each civilization) gated by **achievements** and paid in **Divine Points**, plus purchasable **god favors**.
- **World simulation**: polygonal islands (square, hexagon, octagon, round) with **6 terraced ground layers**, thermal erosion, tides, and paths worn visually into the ground where creatures walk. Day/night with a **sun/moon clock and weather icon** in the HUD (Warcraft-3 style); the moon rises 2 nights in 3 and extends your units' vision by their night-sight. Weather machine: sunny, cloudy, rain, **storms with wild lightning strikes**, snow, blizzard, heatwave — with wind that sways trees and slants the rain.
- **Fog of war remembers**: enemy structures and monsters remain visible as grey **ghosts** where your units last saw them, until the area is scouted again.
- A collapsible **chronicle log** on the left records every event — click an entry to jump the camera to where it happened.

## Controls

| Input | Action |
|---|---|
| Left click | Inspect creature / building (institution intents) |
| Left drag (Hand) | Grab creature, animal, monster, tree or rock |
| Fast release | Throw it |
| Wiggle while holding | Shake it (trees drop wood, creatures tremble) |
| Spell tool + drag | Draw ◯ = rain · straight line = lightning · zigzag = fireball |
| Plant / Dig / Raise | Terraform and reforest (costs ✦ in battle mode) |
| Build | Place structures |
| WASD / arrows | Pan camera |
| Right-drag | Rotate camera |
| Scroll | Zoom |

## Menu

- **Battle mode** — timed match vs the AI god (divine actions cost ✦: throw 3, shake 1, plant 5, terraforming drains ✦)
- **Construction mode** — free sandbox, no timer, every divine action is free
- **Story mode** — placeholder, coming later
- **Lexicon** — every generated 3D model rendered into filterable cards (3 per row) with its statistics
- **Settings** — shadows, rain particles, fog of war, camera speed, match length

## Structure

```
index.html        UI shell (menu, HUD, gallery, panels)
style.css
lib/three.module.js
src/util.js       PRNG, value noise, spell shape recognition
src/civs.js       civilizations, classes, buildings, techs, favors
src/models.js     procedural model factory + gallery catalog
src/world.js      terrain, biomes, geomorphing, cycles, weather, fog of war
src/entities.js   DNA, creatures, decision trees, animals, monsters, buildings
src/game.js       economy, belief, conversion, tech, AI god, score, win/lose
src/cursor.js     divine hand + camera rig
src/ui.js         menus, HUD, inspection, tech panel, gallery
src/main.js       bootstrap (`?auto=battle&civ=franks` auto-starts a match)
```

## Dev: headless balance simulation

The simulation layer has no DOM dependency, so a full match can be run in Node
(population, economy, deaths and outcome are printed per minute):

```bash
node scripts/simulate.mjs franks orcs
```

