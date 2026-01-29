# Modules (target decomposition)

This document enumerates the **canonical subsystems**, their responsibilities, and the function-level factoring we should converge toward.

## Runtime orchestration

### `App` (composition root)
- Owns long-lived services: audio, settings, asset registry, telemetry.
- Controls screen transitions and global lifecycle.

### `Screen` contract
- `mount(): void | Promise<void>`: allocate DOM/canvases, bind input, start loops.
- `destroy(): void`: tear down listeners, stop animation frames, release GPU/audio resources.

## Engine core

### Time / scheduling
- `Clock`: frame delta, fixed-step accumulator (for deterministic simulation).
- `Transport`: musical clock (BPM, bar/beat/step), event scheduling window.

### Input
- `PointerRouter`: normalizes mouse/touch/pen into pointer events.
- `PanZoom`: camera navigation; later: inertial panning, edge scrolling, minimap sync.
- `Selection`: hit-testing, selection box, multi-select semantics.

### State & configuration
- `SettingsStore`: local persistence + runtime observers.
- `SessionState`: current run (seed, difficulty, scenario modifiers, player profile).
- `SaveSystem`: JSON snapshot versioning + compression (future).

## Rendering

### Title renderer
- `TitleRenderer`: single-pass scene; background shader + planet shader + halo.
- **Responsibilities**: viewport-fit composition, GPU resource lifetime, quality scaling.

### Game renderer (lowpoly)
- `TerrainMesher`: heightfield → lowpoly mesh (chunked).
- `MaterialSystem`: biome/material palette, lighting model, post FX budget.
- `RenderGraph`: explicit passes (shadow, main, post, UI), stable ordering.

## World generation

### `MapGenerator`
- Inputs: `seed`, `size`, `scenario params`.
- Outputs: `WorldMap` (height, moisture, biomes, hydrology, decorations, spawn).

### Planned factoring
- `HeightField.generate(seed, params): HeightField`
- `Hydrology.solve(height, params): RiversLakesSea`
- `Climate.solve(height, lat, params): TemperatureMoisture`
- `Biomes.classify(height, climate, params): BiomeMap`
- `Decorations.scatter(biomes, rivers, params): Instances`
- `Spawn.pick(world, constraints): SpawnPoint`

## Audio

### `AudioEngine`
- Buses: master / music / sfx.
- `startMusic()`, `stopMusic()`, `setTempoBpm()`, `setMusicEnabled()`.
- SFX: UI interaction events + future positional world SFX.

### Planned factoring
- `SfxRouter.play(eventId, params)`
- `MusicDirector.setMood(moodId, intensity)`
- `MusicSynth.scheduleStep(transportStep)`

