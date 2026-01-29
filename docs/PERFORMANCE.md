# Performance engineering (targets + methodology)

## Targets (to confirm)

- **Device classes**: laptop/desktop, integrated GPU, mobile.
- **Frame budget**: 16.6ms @ 60fps (or 33.3ms @ 30fps fallback).
- **GPU budget**: minimal overdraw, limited post-processing, controlled shader ALU.

## Principles

- **Chunk everything**: terrain mesh, props, navigation data.
- **No per-frame allocations**: reuse typed arrays, object pools.
- **Deterministic generation**: seeded RNG; generation should be cacheable/replayable.
- **Quality tiers**: reduce resolution, LOD distance, shader complexity.

## Rendering strategy (lowpoly)

- Static terrain chunks: merged geometry per chunk (or instanced).
- Vegetation: GPU instancing or impostors.
- Shadows: optional per quality tier.

## Audio strategy

- Avoid unbounded synth nodes.
- Schedule with lookahead window; reuse noise buffers.
- Stop music graph when muted.

## Tooling (later)

- FPS + frame time overlay.
- Memory and allocation tracking.
- Seeded replay for performance regression tests.

