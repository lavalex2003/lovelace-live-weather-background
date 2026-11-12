First public release of **Live Weather Background** — a living sky across an entire Home Assistant dashboard.

Inspired by [Origami Weather](https://github.com/hazymorning/origami_weather) by **hazymorning**, whose original rendering engine and graphics made this project possible. Upstream source, license and our modifications are preserved and credited in the repository.

- Continuous daylight, dawn, twilight and night from solar elevation.
- Bright Sun, broad halo and soft rays that weaken near the horizon and under clouds.
- Textured Moon, stars, decorative sky actors and original weather effects.
- Denser grey clouds for rain, sleet, snow, hail and thunderstorms; separate precipitation coloring.
- A full day per weather condition in preview, 30 seconds by default.
- One self-contained JS file; no separate Origami Weather installation required.

**Install manually:** download `live-weather-background.js`, copy it to `/config/www/`, and register `/local/live-weather-background.js?v=2.4.0` as a JavaScript module. Add a `custom:dashboard-weather-background` helper with your `weather_entity` and `sun_entity`.

**HACS:** this project is prepared as a custom Dashboard repository. It is not yet included in the default Marketplace catalog. See the English/Russian README for details.

The 2.4.0 number continues the version reached during local development. The project is available without charge under **GPL-3.0-only**, without warranty.

Русское описание и примеры установки: [README.ru.md](https://github.com/lavalex2003/lovelace-live-weather-background/blob/main/README.ru.md).
