# Data schema (JSON-first)

No database for now: we treat `data/*.json` as authoritative content and configuration.

## Versioning

- `data/version.json`: human version tag.
- `public/data/version.json`: runtime-served version tag (currently duplicated).

## Settings

- `data/settings.defaults.json`
- Local persistence key: `darkestlight.settings.v1` (browser localStorage)

### `Settings` shape

```json
{
  "musicEnabled": true,
  "musicVolume": 0.6,
  "sfxVolume": 0.7,
  "musicTempoBpm": 118,
  "graphicsQuality": "high"
}
```

## Tiles & decorations

- `data/tiles.json`: enumerations and labels

Planned extension:
- material parameters (albedo/roughness), minimap color, movement cost, build constraints.

## SFX registry

- `data/sfx.json`: event ids → sound design mapping (currently placeholder).

Planned extension:
- synthesizer patch parameters
- asset paths for sampled SFX
- mixing (bus, gain, limiter)

