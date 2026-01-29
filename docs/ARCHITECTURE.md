# Architecture

This prototype is structured as a **small engine + screens**:

- `src/runtime/`: app bootstrap + screen lifecycle
- `src/screens/`: top-level screens (title, game)
- `src/render/`: GPU rendering (Three.js + custom shaders)
- `src/mapgen/`: procedural world generation + map rendering
- `src/engine/`: input, audio, persistent settings
- `src/ui/`: DOM helpers + modal UI
- `data/`: JSON “database” for content/config (no DB yet)

## Screen lifecycle

Each screen implements `Screen`:

- `mount()`: build DOM, attach listeners, start loops
- `destroy()`: remove listeners, stop loops, free GPU resources

## Data strategy (no database yet)

- Put **editable content** in `data/*.json`.
- Runtime reads live assets from `public/` (e.g. `public/data/version.json`).
- Later we’ll add a build step to copy `data/ → public/data/` automatically.

