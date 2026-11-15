# Changelog

## 2.4.1

- Make rain visible during daylight using luminous streak sprites on a separately lit canvas.
- Increase pouring rain substantially: about four times as many drops as regular rain at the usual fullscreen size.
- Tilt lunar illumination by −22° by default; add `moon_tilt` (−90° to 90°) without rotating the lunar texture.
- Preserve the original weather engine and assets; add regression and pixel-level browser checks.

## 2.4.0 — first public release

This release retains the version reached during development on a Home Assistant dashboard.

- Independent fullscreen background driven by a weather entity and `sun.sun`.
- Clear blue daylight, continuous dawn/twilight and gradual stars/moon visibility.
- Bright solar core, wide halo and soft, unequal rays that weaken near the horizon and under cloud cover.
- Origami Weather cloud textures, actors and precipitation; denser grey storm banks for rain, sleet, snow, hail and thunderstorms.
- Separate cloud tinting preserves the colors of precipitation; lightning illuminates dark banks.
- Weather preview: one full solar day per condition, 30 seconds by default.
- Single-file distribution with all image assets embedded; no runtime Origami Weather installation needed.
- GPL-3.0-only licensing with explicit upstream attribution and reproducible extraction/build.
