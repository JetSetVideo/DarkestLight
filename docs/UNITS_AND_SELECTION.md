# Units & selection

## Current behavior (prototype)

- A single controllable character spawns at the world spawn point.
- **Left click on character**:
  - selects the unit
  - plays a selection sound
  - triggers a small acknowledge animation
  - shows a selection ring slightly above the ground
  - updates the HUD with portrait + stats
- **Right click anywhere**:
  - deselects the unit (if selected)
  - plays a confirmation noise

Implementation:
- Character mesh: `src/render/game3d/CharacterRig.ts`
- Hit testing: hidden `hit` proxy mesh + raycaster in `src/render/game3d/GameRenderer3D.ts`
- HUD: minimal panel in `src/screens/game/GameScreen.ts`

## Target factoring (next)

### Selection system
- `SelectionState`: selected entity ids
- `SelectionController`: input → selection intent
- `SelectionRenderer`: rings/outlines/healthbars

### Unit data model
- `UnitDefinition` (JSON): name, archetype, base stats, portrait style.
- `UnitInstance`: runtime state (hp, cooldowns, location, animation state).

### Interaction feedback contract

Every player interaction emits:
- an **audio event** (SFX id + parameters)
- a **visual event** (UI animation, ring pulse, outline flash, etc.)

