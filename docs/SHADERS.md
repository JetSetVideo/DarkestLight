# Shaders

Title screen shaders live in `src/render/shaders/title.ts`:

- Background: procedural nebula + starfield
- Planet: procedural land/sea, two opposing lights to fake inner opposing shadows, rim/atmosphere
- Halo: additive glow + ring + slow pulse

## Next improvements

- Signed-distance field atmosphere with proper scattering approximation
- Better planet surface: domain-warped fbm + polar caps + cloud layer
- Post effects: bloom, vignette, subtle film grain

