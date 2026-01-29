# Audio

`src/engine/audio/AudioEngine.ts` provides:

- A **tempo-synced electro/rock generative score** (WebAudio synth drums + bass + chord stabs)
- Synth UI sounds (hover/click)
- Countdown tick + start sting

## Constraints

Browsers require a **user gesture** before starting audio, so audio is initialized on the Start click.

## Controls

- Music enabled (mute): stops the music scheduler to save CPU.
- Music volume: scales the music bus gain.
- Tempo (BPM): controls the musical transport (16th-note grid).

## Next improvements

- Event-driven SFX routing from a JSON mapping (`data/sfx.json`)
- Mixing bus: master/music/sfx + limiter
- Mood system (tension, exploration, combat) with harmonic re-orchestration
- Spatial audio for world interactions (distance attenuation + occlusion)

