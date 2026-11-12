# Inspiration, attribution and third-party source

**This project was inspired by [Origami Weather](https://github.com/hazymorning/origami_weather), by [hazymorning](https://github.com/hazymorning). Its animated sky is what inspired us to turn the idea into an independent, fullscreen Home Assistant dashboard background.**

This is a derivative project, not an independent invention of the original weather rendering engine. We thank hazymorning for the original work. This project is not affiliated with or endorsed by Origami Weather, Home Assistant or Apple.

## Origami Weather

- Repository: https://github.com/hazymorning/origami_weather
- Exact upstream commit: `79d015b1de55d42da90db4808785e716eff813df`
- License: GNU General Public License, version 3; a copy is in `LICENSE` and `vendor/origami_weather/LICENSE`.
- Copyright in the original source and artwork remains with its respective authors.
- A matching upstream bundle, preferred source files, package metadata and lockfile are preserved in `vendor/origami_weather/`.
- The exact upstream bundle SHA-256 and extracted block hashes are recorded in `vendor/origami_weather/UPSTREAM.json` and `src/origami-source.json`.

The unmodified extracted rendering engine includes cloud/fog textures, birds, balloons, aircraft, lunar surface, precipitation, lightning, stars and astronomical helpers. `python3 scripts/vendor_origami.py` verifies the extraction against the preserved upstream bundle. The unused Lit/card/editor runtime is not part of our installed distribution; the original bundle is preserved only as source/provenance material, with its original embedded notices intact.

## Our modifications

The adapter and packaging add a view-scoped fullscreen background; configurable weather and sun entities; continuous elevation-based daylight, dawn and twilight; a softened lunar terminator; a luminous solar core, halo and altitude/weather-dependent rays; denser grey storm clouds rendered separately from precipitation; a 24-hour-per-weather preview; motion/lifecycle controls; canvas limits; and card-picker discovery. Original engine code and embedded assets remain unchanged.

The combined project is distributed under GPL-3.0-only. No additional restrictions on recipients' rights are imposed. It is available without charge and without warranty. The software runs locally in the browser and does not require a hosted service.
