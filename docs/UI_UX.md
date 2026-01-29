# UI / UX

## Title screen

- Center title `Deus Ex Planetum`
- Start button (click animation + sound)
- Top-right: settings + exit
- Settings modal includes version (`0.01`) and basic sliders

## Game screen

- Countdown: 3 → 2 → 1 → Start!
- Top-right: gear icon opens menu
- Menu includes version, volume sliders, and **Exit to title**
- Camera: drag to pan, wheel to zoom

## Interaction rule

Every interaction should produce **an animation and a sound**.

Current implementation covers:
- hover/click sounds + button animations
- camera interaction sound + slight visual pulse
- countdown tick/sting

Next: unify this via an “interaction bus” so UI + world interactions share the same animation/sound contract.

