# Lowpoly visual style (target spec)

Goal: a **low-poly**, high-readability aesthetic where geometric simplicity is compensated by **strong lighting**, **material separation**, and **macro-forms** driven by multi-variable procedural equations.

## Geometry

### Terrain representation
- Base: continuous scalar field \(h(x,y)\) (height).
- Derivatives: slope \(\|\nabla h\|\), curvature (Laplacian), flow accumulation.
- Mesh: **chunked triangulated surface** with level-of-detail.

### Meshing options
- **Grid triangles** (fastest): 2 triangles per cell. Very stable; style comes from shading + quantization.
- **Vertex clustering / quantization**: snap vertices in world space for faceted look.
- **Delaunay triangulation** (best lowpoly feel): sample points + triangulate; heavier but stylish.

## Shading & lighting

### Lighting model (pragmatic)
- Directional key light + fill light + ambient term.
- Optional rim light for silhouettes.
- Shadowing (later): cascaded directional shadows per chunk.

### Faceting
- Enforce flat normals per triangle (hard edges) or per “cluster”.
- Material-dependent roughness and specular response (low cost).

## Procedural equations (multi-variable)

We will treat every “look” as a function with explicit inputs:

### Height synthesis
\[
h = f_{\text{fbm}}(x,y,seed) \cdot w_1 + f_{\text{ridge}}(x,y) \cdot w_2 + f_{\text{warp}}(x,y)\cdot w_3 - f_{\text{falloff}}(x,y)\cdot w_4
\]

### Climate
- Temperature: \(T = T_0 - \alpha \cdot h - \beta \cdot |lat|\)
- Moisture: \(M = g(\text{distanceToWater}, \text{wind}, \text{orographicLift})\)

### Biome classification
Biome is a discrete function of continuous variables:
\[
\text{biome} = \mathrm{argmax}_k\; S_k(h, T, M, slope, flow)
\]

### Material palette
Each biome maps to:
- base color (HSV ranges)
- roughness
- specular
- vegetation density
- prop distribution rules

## Props (trees, rocks, cliffs)

Use deterministic sampling:
- Blue noise / Poisson disk (better spacing than RNG scatter)
- Density is a function \(d = d(\text{biome}, slope, soil, moisture)\)

## Performance constraints (design)

- Chunked meshes with frustum culling.
- Avoid per-frame allocations.
- Keep shader complexity bounded and parameterized by quality settings.

