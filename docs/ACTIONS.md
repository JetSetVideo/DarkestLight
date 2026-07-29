# Unit Actions & Interactions

Exhaustive list of what each unit type can do with the world, each other, fauna, flora, buildings and holdables.
Source of truth: `src/actions.js`.

## Status icons (above head)

| State | Icon | Notes |
|---|---|---|
| Sleeping | `z` (rhythmic fade) | Night rest by campfire |
| Lovers meeting | `♥` | Mating pair near home |
| Panic | `!` | Sprint away, arms raised |
| Alert | `⚠` | Threat nearby |
| Hunting | `🏹` | Chasing animal |
| Gathering | `🌿` | Picking bushes |
| Chopping | `🪓` | Harvesting trees |
| Mining | `⛏` | Rock / metal |
| Fishing | `🎣` | Catching fish |
| Building | `🔨` | Working a construction site |
| Praying | `✝` | At temple |
| Thinking | `?` | Philosopher / shaman |
| Depositing | `📦` | Returning to camp |
| Exploring | `👁` | Scouting fog |
| Holding | `✋` | Carrying a stick / object |
| Shaman rite | `✦` | Shaman channel |

## By role

### Gatherer / Farmer / Worker
- Walk, sprint, sleep, explore, retreat, panic
- Chop trees, pick bushes, pick sticks, quarry rock, mine ore, fish
- Deposit at campfire, join construction sites
- Chat with kin, mate when adult

### Hunter
- Hunt animals for food, fish, pick sticks
- Fight monsters / enemies when alert
- Patrol near home, deposit kills at campfire
- Sleep, explore, panic, retreat

### Shaman
- Pray / channel at temple or open ground (`✦`)
- Inspire nearby kin (+belief)
- Ponder for Divine Points
- Explore fog, sleep, chat, mate

### Knight / Warrior
- Attack enemies & monsters, patrol
- Hunt when idle and hungry
- No night sleep (night watch)
- Panic only if fearless techs absent

### King / Queen
- Lead from campfire (wander near hearth)
- Inspire devotion passively via titles

### Princess
- Inspire nearby kin
- Mate, sleep, chat

### Philosopher / Sage
- Ponder near home → Divine Points
- Sleep, chat, mate

### Monk
- Pray at temple → DP + belief
- Converted from devout adults at temple

### God (player)
- Grab / throw / shake creatures, animals, monsters, trees, rocks
- Cast rain / lightning / fireball (faith-scaled)
- Plant trees, terraform, place buildings
- Inspect any entity

## Cross-entity interactions

| Actor → Target | Interaction |
|---|---|
| Adult M + Adult F (same side, near home) | Mate → birth (DNA mix) |
| Temple → devout adult | Convert → Monk |
| Barracks → Farmer | Train → Knight |
| Forge | Rock → Metal over time |
| Monster → Creature | Hunt / damage / fear |
| Snake → Creature | Bite + fear |
| Creature → Fish | Fish catch |
| Creature → Stick | Pick up, carry to camp → wood |
| God fireball → Creatures | Panic flee away from blast |
| Construction site → Workers | Multiple workers speed build |

## Holdable objects

| Object | Found | Held effect | Deposit |
|---|---|---|---|
| Wood stick | Under / near trees | Shown in hand | +1–2 wood at campfire |
| Rock chunk | From quarry (future) | — | rock stockpile |
| Berry | From bush (carried as food) | — | food stockpile |
