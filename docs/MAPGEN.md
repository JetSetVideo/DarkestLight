# Map generation

Current implementation (`src/mapgen/MapGenerator.ts`) generates:

- Height field using **fBm value-noise**
- Island falloff so a sea is always present
- A single **river** traced from a high point down to sea level
- Tile classification: sea/river/sand/grass/rock/mountain/snow
- Tree decoration probability biased toward moist grass near water

## Next improvements

- Multi-river drainage basins + tributaries
- Hydraulic + thermal erosion pass
- More robust moisture model: evaporation/precipitation
- Temperature model: latitude + altitude + seasonal variation
- Feature placement: settlements, resource nodes, ruins

