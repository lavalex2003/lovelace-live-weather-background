# Live Weather Background 2.4.1

- Rain remains visible during daytime against grey cloud banks. Its lighting is independent of atmospheric dimming.
- Pouring rain is substantially denser: about four times regular rain at a typical fullscreen size (900 vs 213 drops in the regression fixture).
- Lunar illumination is tilted by −22° by default. Set `moon_tilt: 0` for a vertical boundary, or choose an angle from −90° to 90°. The lunar surface texture keeps its orientation.

Update through HACS and reload the dashboard. The default tilt needs no YAML change. Browser regression checks verify daylight rain contrast against a no-rain control and the actual rotated lunar mask.

Inspired by [Origami Weather](https://github.com/hazymorning/origami_weather) by hazymorning. Its original engine and artwork remain credited, preserved and GPL-3.0 licensed.

Русский: дождь теперь виден днём; ливень заметно плотнее; освещённая часть Луны наклонена на 22°. Угол регулируется параметром `moon_tilt`. Обновите карточку в HACS и перезагрузите страницу.
