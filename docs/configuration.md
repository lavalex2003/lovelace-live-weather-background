# Configuration / Настройки

Configure the helper card with YAML. Required entities are read only; the card does not call services.
Настройка выполняется через YAML. Сущности используются только для чтения.

| Option / параметр | Default | Range / meaning |
| --- | --- | --- |
| `type` | required | `custom:dashboard-weather-background` |
| `weather_entity` | required | An existing `weather.*` entity / сущность погоды |
| `sun_entity` | required | An existing `sun.*` entity, normally `sun.sun` |
| `brightness` | `0.72` | `0.1–1.5`; atmospheric brightness, not solar-core brightness |
| `overlay_opacity` | `0.18` | `0–0.85`; atmospheric dimming |
| `sun_moon_size` | `100` | `24–250` CSS px; base light-source container; halo/rays extend beyond it |
| `fps` | `24` | `1–30`; animation frame cap |
| `clouds` | `true` | Cloud and fog layers / облака и туман |
| `stars` | `true` | Stars and meteors when dark / звёзды и метеоры ночью |
| `effects` | `true` | `false` freezes animation and removes precipitation; preview clock can still update |
| `birds` | `true` | Weather/daylight-dependent bird flights |
| `balloons` | `true` | Weather-dependent balloon flights |
| `planes` | `true` | Weather-dependent aircraft flights |
| `actor_scale` | `1` | `0.5–2`; decorative actor scale |
| `actor_density` | `1` | `0.25–2`; decorative actor frequency |
| `preview` | `false` | A renderer-only demo, without changing HA entities |
| `preview_interval` | `30` | `10–300` seconds; a full day per weather condition |

```yaml
type: custom:dashboard-weather-background
weather_entity: weather.home
sun_entity: sun.sun
brightness: 0.72
overlay_opacity: 0.18
sun_moon_size: 100
fps: 24
clouds: true
stars: true
effects: true
birds: true
balloons: true
planes: true
actor_scale: 1
actor_density: 1
preview: false
preview_interval: 30
```

## Weather / Погода

The renderer recognizes Home Assistant's `sunny`, `clear-night`, `partlycloudy`, `cloudy`, `windy`, `windy-variant`, `fog`, `rainy`, `pouring`, `lightning`, `lightning-rainy`, `hail`, `snowy-rainy`, `snowy` and `exceptional` states. `sunny` and `clear-night` normalize according to actual/simulated sunlight. Missing or unavailable weather falls back to the default scene; unavailable entities suppress decorative actor activity.

Ordinary cloudy conditions keep the source engine's light clouds. Rain, sleet, snow, hail and thunderstorms use denser, grey-tinted clouds; heavy rain and thunderstorms are darkest. This tint does not apply to precipitation. Fog keeps the original translucent, counter-drifting bands, including one band aligned with the light source.

Поддерживаются перечисленные выше стандартные состояния HA. Ясная погода соответствует времени суток. Для дождя, снега, мокрого снега, града и грозы добавлены серые тучи; обычная облачность остаётся светлой. Туман проходит перед светилом.

## Solar and lunar behavior / Солнце и Луна

Normal sky colors use `sun_entity.attributes.elevation`. Twilight continues below the horizon, down to −18°. Stars fade in between −4° and −16°, and the Moon fades in between −2° and −12°. The sun entity's state chooses the day/night scene and decorative activities, but does not switch the sky palette abruptly.

Normal solar/lunar paths are stylized; the Moon's phase is approximate and its position is not a lunar ephemeris. Preview uses a synthetic 55°-amplitude solar day with separate light-source arcs, starting at 06:00.

В обычном режиме цвет неба зависит от высоты солнца. В демо используется условный день с максимальной высотой 55°, начиная с 06:00. Это художественная визуализация, не астрономический расчёт положения Луны.

## Troubleshooting / Если что-то не работает

- **Unknown custom card:** verify the JS module resource and reload. Check the browser console for a failed JS request.
- **Nothing changes:** confirm the selected weather/sun entities exist. Enable `preview: true` to distinguish input data from rendering.
- **Popup blocked:** remove custom `isolation: isolate` or stacking contexts on the owning view that trap the popup below a global backdrop. The component itself keeps its helper/background non-interactive.
- **Duplicate version:** remove an older manual resource before switching to HACS. Avoid two background helpers in one view.
- **Slow device:** lower `fps`; disable birds, balloons and planes; keep preview off in everyday use.
- **Resource in YAML:** update its version query when manually upgrading. HACS manages its own cache tag.

Если видите старый вариант, проверьте дубли ресурсов, затем выполните жёсткое обновление страницы. Не перезапускайте HA только ради смены JS-файла.
