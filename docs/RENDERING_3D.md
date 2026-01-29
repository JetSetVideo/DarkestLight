# 3D rendering (lowpoly terrain)

## Current implementation

- `src/render/game3d/GameRenderer3D.ts`
  - Three.js renderer + scene + side camera (yaw/pitch + target + distance).
  - Lighting: hemisphere + directional key light.
  - Fog: exponential for depth separation.
- `src/render/game3d/TerrainMesh.ts`
  - Heightfield → plane geometry displacement.
  - Vertex colors from biome/tile classification.
  - `toNonIndexed()` for **crisp faceting**.
  - Water plane at sea level.

## Camera

Targeted RTS camera:

- **Orbit parameters**: yaw, pitch, distance
- **Pan**: translate target in ground plane using camera right/forward vectors
- **Zoom**: scale distance with clamped bounds

Planned improvements:

- Edge scrolling (screen borders)
- Smooth inertial panning
- Minimap synchronization
- Camera bounds derived from map extents

## Terrain pipeline (next)

- Chunking: split terrain into NxN chunks for frustum culling + LOD.
- Mesh decimation / geomorphing for far chunks.
- Props instancing: trees/rocks via `InstancedMesh`.
- River/water: shoreline foam + river ribbons.

