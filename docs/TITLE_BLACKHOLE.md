# Title black-hole “planet” (shader spec)

## Goals

- The central circle is **perfectly centered** and **responsive** to viewport size.
- A stylized black-hole look:
  - near-black core (absorptive)
  - tight photon ring
  - animated accretion disk (swirling bands + turbulence)
  - subtle lens-like glow

## Current implementation

- `src/render/shaders/title.ts`
  - `PLANET_FRAG`: dark core + photon ring
  - `HALO_FRAG`: accretion disk + lens glow (additive)
- `src/render/TitleRenderer.ts`
  - responsive scaling: planet size is computed as a fraction of the visible world height

## Next improvements

- Proper screen-space “lensing” distortion in the background shader near the black hole.
- Chromatic aberration on the photon ring (separate RGB radii).
- Disk thickness varying with angle and time; Doppler-like color shift (approaching side warms).
- Post: subtle bloom (cheap Kawase blur) behind the ring/disk.

