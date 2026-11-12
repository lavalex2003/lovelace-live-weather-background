import {WeatherEffects, _weatherTuning, _HAZE_PALETTE, _HAZE_TUNING, MOON_SURFACE, OriginalAstronomy, SKY_STYLES, assetsReady} from "./origami-engine.js?v=2.0.0";
/** Dashboard Weather Background v2.4.0 — fullscreen adapter for the vendored Origami rendering engine.
 * CSS atmosphere + Canvas 2D weather. Settings live on the Lovelace helper card.
 */
(() => {
  'use strict';
  const VERSION = '2.4.0';
  const clamp = (n, a = 0, b = 1) => Math.max(a, Math.min(b, n));
  const smooth = (a, b, value) => { const t = clamp((value-a)/(b-a)); return t*t*(3-2*t); };
  const mix = (a, b, t) => a.map((v,i) => v+(b[i]-v)*t);
  // Elevation keyframes: astronomical night, blue hour, warm horizon, clear daylight.
  // Both sunrise and sunset traverse the same continuous atmosphere in reverse.
  const SKY = [
    [-18, [[3,8,23],[8,17,39],[14,27,50]]],
    [-12, [[8,17,43],[19,35,68],[40,52,83]]],
    [-6,  [[22,43,86],[65,81,120],[151,116,133]]],
    [-2,  [[39,76,127],[112,139,171],[235,168,131]]],
    [2,   [[47,113,175],[133,177,209],[255,203,150]]],
    [9,   [[34,127,199],[104,177,225],[204,226,237]]],
    [25,  [[22,116,194],[76,164,223],[183,218,240]]],
    [60,  [[17,108,189],[65,157,218],[175,216,240]]]
  ];
  const skyColors = elevation => {
    let i=1; while(i<SKY.length-1 && elevation>SKY[i][0]) i++;
    const t=smooth(SKY[i-1][0],SKY[i][0],elevation);
    return SKY[i-1][1].map((color,j)=>mix(color,SKY[i][1][j],t));
  };
  const STORM_CLOUDS = {
    rainy:{density:2.1,light:.67},pouring:{density:2.8,light:.48},
    lightning:{density:2.7,light:.48},'lightning-rainy':{density:3,light:.43},
    snowy:{density:2.25,light:.72},'snowy-rainy':{density:2.5,light:.62},
    hail:{density:2.7,light:.54}
  };
  const valid = e => e && !['unknown', 'unavailable'].includes(e.state);
  const PREVIEW_STATES = ['sunny','clear-night','partlycloudy','cloudy','windy','windy-variant',
    'fog','rainy','pouring','lightning','lightning-rainy','hail','exceptional','snowy-rainy','snowy'];
  const WEATHER_NAMES = {sunny:'Ясно', 'clear-night':'Ясная ночь', partlycloudy:'Переменная облачность',
    cloudy:'Облачно', windy:'Ветрено', 'windy-variant':'Ветер и облака', fog:'Туман', rainy:'Дождь',
    pouring:'Ливень', lightning:'Гроза', 'lightning-rainy':'Гроза с дождём', hail:'Град',
    exceptional:'Необычная погода', 'snowy-rainy':'Снег с дождём', snowy:'Снег'};
  const WEATHER_NAMES_EN = {sunny:'Clear', 'clear-night':'Clear night', partlycloudy:'Partly cloudy',
    cloudy:'Cloudy',windy:'Windy','windy-variant':'Wind and clouds',fog:'Fog',rainy:'Rain',pouring:'Heavy rain',
    lightning:'Thunderstorm','lightning-rainy':'Thunderstorm and rain',hail:'Hail',exceptional:'Exceptional weather',
    'snowy-rainy':'Sleet',snowy:'Snow'};
  class DashboardWeatherBackground extends HTMLElement {
    static get version() { return VERSION; }
    static getStubConfig(hass) {
      return {weather_entity:Object.keys(hass?.states||{}).find(id=>id.startsWith('weather.'))||'weather.home',sun_entity:'sun.sun'};
    }
    constructor() {
      super();
      // Registered colors interpolate gradients between HA elevation updates.
      if (typeof CSS !== 'undefined' && CSS.registerProperty) {
        for (const [i,value] of ['#16283e','#16283e','#16283e'].entries()) {
          try { CSS.registerProperty({name:`--dashboard-sky-${i}`,syntax:'<color>',inherits:false,initialValue:value}); } catch (_) { /* Already registered by another view. */ }
        }
      }
      this._effects = WeatherEffects.create();
      this._actorSizes = new WeakMap();
      this._demoActors = new WeakSet();
      this._fogFields = new WeakSet();
      this._cloudFields = new WeakMap();
      this.attachShadow({mode: 'open'}).innerHTML = '<style>:host{display:none!important}</style>';
      this._visibility = () => this._schedule();
      this._motion = () => { this._draw(performance.now(), 0); this._schedule(); };
      this._tick = now => {
        this._raf = null;
        if (!this._active()) return;
        if (now - (this._lastFrame || 0) >= 1000 / this._config.fps) {
          const dt = Math.min(0.08, (now - (this._lastFrame || now)) / 1000);
          this._lastFrame = now;
          this._draw(now, dt);
        }
        this._raf = requestAnimationFrame(this._tick);
      };
    }
    setConfig(config) {
      if (!config.weather_entity?.startsWith('weather.')) throw new Error('weather_entity must be a weather entity');
      if (!config.sun_entity?.startsWith('sun.')) throw new Error('sun_entity must be a sun entity');
      const number = (key, fallback, min, max) => {
        const n = Number(config[key] ?? fallback);
        if (!Number.isFinite(n)) throw new Error(`${key} must be numeric`);
        return clamp(n, min, max);
      };
      const previousPreview = this._config?.preview, previousInterval = this._config?.preview_interval;
      this._config = {...config, fps: number('fps', 24, 1, 30),
        brightness: number('brightness', 0.72, 0.1, 1.5),
        overlay_opacity: number('overlay_opacity', 0.18, 0, 0.85),
        sun_moon_size: number('sun_moon_size', 100, 24, 250),
        effects: config.effects !== false, stars: config.stars !== false,
        clouds: config.clouds !== false,
        birds: config.birds !== false, balloons: config.balloons !== false, planes: config.planes !== false,
        actor_scale: number('actor_scale', 1, 0.5, 2),
        actor_density: number('actor_density', 1, 0.25, 2),
        preview: config.preview === true, preview_interval: number('preview_interval', 30, 10, 300)};
      if (this._config.preview && (!previousPreview || previousInterval !== this._config.preview_interval)) this._previewStartedAt = Date.now();
      this._snapshot = null;
      if (this._layer) this._update();
      if (this.isConnected && this._layer) { this._syncRefreshTimer(); this._schedule(); }
    }
    set hass(hass) { this._hass = hass; if (this._layer) this._update(); }
    getCardSize() { return 0; }
    connectedCallback() {
      // Find the owning view across shadow boundaries; never attach to document.body.
      let node = this;
      while (node && node.localName !== 'hui-view') node = node.parentNode || node.host;
      if (!node) { console.warn('Weather background: owning hui-view not found'); return; }
      this._view = node;
      const root = node.shadowRoot || node;
      if (root.querySelector('[data-dashboard-weather]')) return;
      this._style = document.createElement('style');
      // Keep content positioned without a stacking context: Bubble popups must escape.
      this._style.textContent = ':host{background:transparent!important} grid-layout,hui-masonry-view,hui-sections-view,hui-panel-view{position:relative}';
      this._layer = document.createElement('div');
      this._layer.dataset.dashboardWeather = '';
      this._layer.dataset.weatherVersion = VERSION;
      this._layer.setAttribute('aria-hidden', 'true');
      this._layer.style.cssText = 'position:fixed;inset:0;z-index:0;pointer-events:none;overflow:hidden;contain:strict;background:#16283e';
      this._layer.innerHTML = `<style>
        ${SKY_STYLES}
        .sky,.shade,canvas{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}
        .sky{z-index:0;overflow:hidden}.sky-base,.horizon-light{position:absolute;inset:0;transition:opacity 8s linear}.sky-base{background:linear-gradient(180deg,var(--dashboard-sky-0) 0%,var(--dashboard-sky-1) 58%,var(--dashboard-sky-2) 100%)}.sky-base.ready{transition:--dashboard-sky-0 60s linear,--dashboard-sky-1 60s linear,--dashboard-sky-2 60s linear}.sky-haze{transition:opacity 8s linear}.orb{transition:opacity 8s linear}.stars{transition:opacity 8s linear}
        .preview .orb{transition:opacity .2s linear,left .15s linear,top .15s linear}
        .preview .stars,.preview .sky-haze{transition:opacity .2s linear}
        .stars{z-index:1}.clouds{z-index:3}.weather{z-index:4}.shade{z-index:1}.preview-label{z-index:5}
        .orb{position:absolute;z-index:2;border-radius:50%;transform:translate(-50%,-50%);pointer-events:none}
        /* Optical bloom obscures the daytime rim; unequal rays fade into the sky. */
        .sun .sun-disc{inset:17%;background:radial-gradient(circle,var(--solar-core) 0%,var(--solar-core) 30%,var(--solar-edge) 52%,color-mix(in srgb,var(--solar-edge) 60%,transparent) 63%,transparent 73%);box-shadow:none;transform:scaleY(var(--solar-flatten,1));filter:blur(.6px)}
        .sun .sun-disc::before,.sun .sun-disc::after{content:none;animation:none}
        .sun .sun-glow{width:1000%;height:1000%;filter:none;animation:none;background:radial-gradient(circle,color-mix(in srgb,var(--solar-halo) 40%,transparent) 0%,color-mix(in srgb,var(--solar-halo) 24%,transparent) 8%,color-mix(in srgb,var(--solar-halo) 10%,transparent) 20%,color-mix(in srgb,var(--solar-halo) 3%,transparent) 40%,transparent 72%)}
        .sun-bloom,.sun-rays{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);pointer-events:none}
        .sun-bloom{width:340%;height:340%;opacity:var(--solar-bloom);background:radial-gradient(circle,var(--solar-core) 0%,color-mix(in srgb,var(--solar-core) 95%,transparent) 9%,color-mix(in srgb,var(--solar-halo) 60%,transparent) 18%,color-mix(in srgb,var(--solar-halo) 20%,transparent) 34%,color-mix(in srgb,var(--solar-halo) 4%,transparent) 55%,transparent 72%)}
        .sun-rays{width:650%;height:650%;overflow:visible;opacity:calc(var(--solar-rays)*.6);filter:blur(7px)}
        .moon-disc{width:100%;height:100%}
        .paused *{animation-play-state:paused!important;transition:none!important}
        .preview-label{position:absolute;right:14px;bottom:14px;padding:8px 12px;border-radius:12px;background:rgba(7,16,30,.8);color:#eef5ff;font:13px/1.4 system-ui;pointer-events:none}
        .shade{background:radial-gradient(ellipse at 55% 25%,transparent 20%,rgba(2,8,20,.2) 100%)}
      </style><div class="sky"><div class="sky-base"></div><div class="horizon-light"></div><div class="sky-haze"><div class="haze-layer h1"></div><div class="haze-layer h2"></div><div class="haze-layer h3"></div></div></div><canvas class="stars"></canvas><div class="orb sun"><div class="sun-glow"></div><svg class="sun-rays" viewBox="-450 -450 900 900" aria-hidden="true"><defs><radialGradient id="dashboard-solar-rays" gradientUnits="userSpaceOnUse" cx="0" cy="0" r="390"><stop offset="0" stop-color="var(--solar-core)" stop-opacity=".75"/><stop offset=".18" stop-color="var(--solar-halo)" stop-opacity=".42"/><stop offset=".45" stop-color="var(--solar-halo)" stop-opacity=".14"/><stop offset=".75" stop-color="var(--solar-halo)" stop-opacity=".035"/><stop offset="1" stop-color="var(--solar-halo)" stop-opacity="0"/></radialGradient></defs>${[[3,370,7],[34,210,12],[68,290,7],[101,180,15],[127,340,6],[157,230,10],[184,310,9],[219,390,6],[250,190,14],[278,280,7],[307,350,8],[337,210,12]].map(([angle,length,width])=>`<ellipse cx="0" cy="${-length/2}" rx="${width*.55}" ry="${length/2}" transform="rotate(${angle})" fill="url(#dashboard-solar-rays)"/>`).join('')}</svg><div class="sun-bloom"></div><div class="sun-disc"></div></div><div class="orb moon"><div class="moon-glow"></div><svg class="moon-disc" viewBox="0 0 100 100" aria-hidden="true"><defs><radialGradient id="dashboard-moon-surface" cx="38%" cy="34%" r="78%"><stop offset="0%" stop-color="#eef0f4"/><stop offset="45%" stop-color="#dce0e8"/><stop offset="100%" stop-color="#b8bcc6"/></radialGradient><clipPath id="dashboard-moon-disc"><circle cx="50" cy="50" r="48"/></clipPath><filter id="dashboard-moon-terminator" x="-10%" y="-10%" width="120%" height="120%" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="0.85"/></filter><mask id="dashboard-moon-lit" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100" style="mask-type:luminance"><path class="moon-lit-path" d="" fill="white" filter="url(#dashboard-moon-terminator)"/></mask></defs><g clip-path="url(#dashboard-moon-disc)"><g mask="url(#dashboard-moon-lit)"><circle class="moon-surface" cx="50" cy="50" r="48" fill="url(#dashboard-moon-surface)"/><image class="moon-image" x="2" y="2" width="96" height="96" preserveAspectRatio="xMidYMid slice"/></g></g></svg></div><canvas class="clouds"></canvas><canvas class="weather"></canvas><div class="shade"></div><div class="preview-label" hidden></div>`;
      root.prepend(this._style, this._layer);
      this._previewLabel = this._layer.querySelector('.preview-label');
      this._sky = this._layer.querySelector('.sky');
      this._skyBase = this._layer.querySelector('.sky-base');
      this._sun = this._layer.querySelector('.sun');
      this._moon = this._layer.querySelector('.moon');
      this._canvas = this._layer.querySelector('.weather');
      this._stars = this._layer.querySelector('.stars');
      this._cloudCanvas = this._layer.querySelector('.clouds');
      this._cloudCtx = this._cloudCanvas.getContext('2d');
      this._ctx = this._canvas.getContext('2d');
      this._starCtx = this._stars.getContext('2d');
      this._reduced = matchMedia('(prefers-reduced-motion: reduce)');
      this._reduced.addEventListener('change', this._motion);
      document.addEventListener('visibilitychange', this._visibility);
      this._resize = new ResizeObserver(() => this._size());
      this._resize.observe(this._layer);
      this._observer = new IntersectionObserver(entries => { this._visible = entries[0].isIntersecting; this._schedule(); });
      this._observer.observe(this._view);
      this._visible = true;
      this._syncRefreshTimer();
      this._size();
      this._update();
      this._assetsReady = assetsReady().then(() => new Promise(resolve => setTimeout(resolve,0))).then(() => {
        if (this._layer) this._draw(performance.now(),0);
      }).catch(error => console.warn('Dashboard weather assets:', error.message));
    }
    disconnectedCallback() {
      cancelAnimationFrame(this._raf); this._raf = null;
      clearInterval(this._timer); this._timer = null;
      this._resize?.disconnect(); this._observer?.disconnect();
      this._reduced?.removeEventListener('change', this._motion);
      document.removeEventListener('visibilitychange', this._visibility);
      this._layer?.remove(); this._style?.remove();
      this._layer = null; this._view = null; this._snapshot = null; this._skyReady = false;
      this._effects = WeatherEffects.create(); this._demoActors = new WeakSet(); this._actorSizes = new WeakMap(); this._fogFields = new WeakSet(); this._cloudFields = new WeakMap();
    }
    _active() { return this.isConnected && this._layer && this._visible && !document.hidden && !this._reduced?.matches && this._config?.effects; }
    _schedule() {
      if (this._raf != null) cancelAnimationFrame(this._raf);
      this._raf = null; this._lastFrame = 0;
      this._layer?.classList.toggle('paused', !this._active());
      if (this._active()) this._raf = requestAnimationFrame(this._tick);
    }
    _size() {
      if (!this._layer) return;
      const {width, height} = this._layer.getBoundingClientRect();
      if (!width || !height) return;
      this._w = width; this._h = height;
      this._snapshot = null;
      const scale = Math.min(window.devicePixelRatio || 1, 1.5, Math.sqrt(1200000 / (width * height)));
      this._renderScale = scale;
      for (const canvas of [this._canvas, this._stars, this._cloudCanvas]) {
        canvas.width = Math.round(width * scale); canvas.height = Math.round(height * scale);
        canvas.getContext('2d').setTransform(scale, 0, 0, scale, 0, 0);
      }
      this._update();
    }
    _syncRefreshTimer() {
      const period = this._config.preview ? 100 : 60000;
      if (this._timer && this._refreshPeriod === period) return;
      clearInterval(this._timer);
      this._refreshPeriod = period;
      this._timer = setInterval(() => {
        if(!this._config.preview || (!document.hidden && this._visible))this._update();
      }, period);
    }
    _sceneEntities(now = Date.now()) {
      const states = this._hass?.states || {};
      const sun = states[this._config.sun_entity], weather = states[this._config.weather_entity];
      if (!this._config.preview) return {sun, weather, index: -1};
      const interval = this._config.preview_interval * 1000;
      const elapsed = Math.max(0, now - this._previewStartedAt);
      const index = Math.floor(elapsed / interval) % PREVIEW_STATES.length;
      const state = PREVIEW_STATES[index];
      const phase = (elapsed % interval) / interval;
      const elevation = 55*Math.sin(phase*Math.PI*2);
      const minutes = Math.floor((360+phase*1440)%1440);
      const clock = `${String(Math.floor(minutes/60)).padStart(2,'0')}:${String(minutes%60).padStart(2,'0')}`;
      // Only this renderer receives an accelerated solar day. HA entities are untouched.
      return {index,phase,clock,remaining:Math.ceil((interval-elapsed%interval)/1000),
        weather:{state,attributes:weather?.attributes||{}},
        sun:{state:elevation>=0?'above_horizon':'below_horizon',attributes:{
          ...sun?.attributes,elevation,rising:Math.cos(phase*Math.PI*2)>0}}};
    }
    _update() {
      if (!this._layer || !this._config) return;
      const {sun, weather, index, remaining, phase, clock} = this._sceneEntities();
      this._previewLabel.hidden = !this._config.preview;
      if (this._config.preview) {
        const ru=(this._hass?.locale?.language||this._hass?.language||'en').startsWith('ru');
        const name=(ru?WEATHER_NAMES:WEATHER_NAMES_EN)[weather.state];
        this._previewLabel.textContent=ru
          ? `Демо ${index+1}/${PREVIEW_STATES.length} · ${name} · ${clock} · смена через ${remaining} с`
          : `Demo ${index+1}/${PREVIEW_STATES.length} · ${name} · ${clock} · next in ${remaining}s`;
      }
      this._layer.classList.toggle('preview',this._config.preview);
      const snapshot = [phase,sun?.state, sun?.attributes?.elevation, sun?.attributes?.next_rising,
        sun?.attributes?.next_setting, sun?.attributes?.next_noon, sun?.attributes?.next_midnight,
        weather?.state, !!this._hass?.themes?.darkMode, Math.floor(Date.now() / 60000)].join('|');
      if (snapshot === this._snapshot) return;
      this._snapshot = snapshot;
      const sunOK = valid(sun), weatherOK = valid(weather);
      const measured = sunOK ? Number(sun.attributes?.elevation) : NaN;
      const elevation = Number.isFinite(measured) ? measured : sunOK ? (sun.state === 'above_horizon' ? 30 : -20) : -12;
      this._day = clamp((elevation + 12) / 24);
      this._night = sunOK ? sun.state === 'below_horizon' : elevation < -1;
      this._actorsAvailable = !!(sunOK && weatherOK);
      let weatherState = weatherOK ? weather.state : 'default';
      if (this._night && weatherState === 'sunny') weatherState = 'clear-night';
      if (!this._night && weatherState === 'clear-night') weatherState = 'sunny';
      this._weatherState = weatherState;
      this._recipe = _weatherTuning(weatherState);
      this._layer.classList.toggle('is-astro-night',this._night);
      this._layer.classList.toggle('is-astro-day',!this._night);
      const colors = skyColors(elevation);
      const overcast = clamp(this._recipe.cloudDarkness || 0);
      // Cloud cover reduces chroma and light without bleaching a clear blue sky.
      const sky = colors.map(c => {
        const gray = c[0]*0.2126+c[1]*0.7152+c[2]*0.0722;
        return c.map(v => Math.round((v+(gray-v)*overcast*0.65)*(1-overcast*0.24)));
      });
      this._skyColors = sky;
      this._elevation = elevation;
      this._starlight = 1-smooth(-16,-4,elevation);
      this._moonlight = 1-smooth(-12,-2,elevation);
      // The original atlas caches tinted sprites by RGB. Bound that cache to 17 levels.
      const tint = Math.round(smooth(-16,12,elevation)*16)/16;
      const backgroundRGB = mix([16,32,60],[130,181,218],tint).map(Math.round);
      if(String(backgroundRGB)!==String(this._backgroundRGB))this._backgroundRGB=backgroundRGB;
      this._skyBase.style.transitionDuration = this._config.preview ? '0.15s' : '60s';
      sky.forEach((color,i)=>this._skyBase.style.setProperty(`--dashboard-sky-${i}`,`rgb(${color})`));
      if (typeof CSS === 'undefined' || !CSS.registerProperty) {
        this._skyBase.style.background = `linear-gradient(180deg,rgb(${sky[0]}) 0%,rgb(${sky[1]}) 58%,rgb(${sky[2]}) 100%)`;
      }
      // First paint is immediate; subsequent minute updates blend for a full minute.
      if (!this._skyReady) {
        this._skyReady=true;
        this._skyBase.getBoundingClientRect();
        this._skyBase.classList.toggle('ready',true);
      }
      // Localized amber scattering near the solar horizon; muted under heavy cloud.
      const warmth = smooth(-10,-2,elevation)*(1-smooth(2,14,elevation))*(1-overcast*0.85);
      this._sky.style.filter = `brightness(${this._config.brightness})`;
      this._updateHaze(weatherState);
      this._layer.querySelector('.sky-haze').style.opacity = String((0.12+overcast*0.55)*smooth(-18,6,elevation));
      this._stars.style.opacity = String(this._starlight);
      // Dim the atmosphere, not the luminous source. The shade stays below the Sun
      // and the weather canvas stays above it, preserving cloud occlusion.
      this._layer.style.filter = 'none';
      this._stars.style.filter = `brightness(${this._config.brightness})`;
      this._layer.querySelector('.shade').style.filter = `brightness(${this._config.brightness})`;
      const ambient = this._config.brightness*(1-this._config.overlay_opacity);
      this._canvas.style.filter = this._moon.style.filter = `brightness(${ambient})`;
      this._layer.querySelector('.shade').style.backgroundColor = `rgba(3,8,20,${this._config.overlay_opacity})`;
      const attrs = sun?.attributes || {};
      const end = Date.parse(this._night ? attrs.next_rising : attrs.next_setting);
      let mid = Date.parse(this._night ? attrs.next_midnight : attrs.next_noon);
      if (mid - Date.now() > 43200000) mid -= 86400000;
      const half = (end - mid) % 86400000;
      const progress = half > 0 ? clamp(0.5 + (Date.now() - mid) / (2 * half)) : 0.5;
      const x = 7 + progress * 86;
      const solarProgress = this._config.preview ? clamp(phase*2) : null;
      const lunarProgress = this._config.preview ? clamp(((phase+0.5)%1)*2) : null;
      const solarX = this._config.preview ? 7+solarProgress*86 : this._night ? (attrs.rising ? 7 : 93) : x;
      this._layer.querySelector('.horizon-light').style.background = `radial-gradient(ellipse 70% 48% at ${solarX}% 105%,rgba(255,165,93,${(warmth*0.32).toFixed(3)}),transparent 100%)`;
      // Moon follows a stylized night arc; its position is not a lunar ephemeris.
      const heightProgress = clamp(this._night ? -elevation / 24 : elevation / 60);
      const y = Math.max((this._config.sun_moon_size/2+6)/(this._h||1000)*100,100-heightProgress*86);
      this._orbX = x/100; this._orbY = y/100;
      for (const orb of [this._sun, this._moon]) {
        orb.style.left = `${x}%`; orb.style.top = `${y}%`;
        orb.style.width = orb.style.height = `${this._config.sun_moon_size}px`;
      }
      // During the last sliver of sunset keep the Sun at its own horizon,
      // rather than moving it to the Moon's newly selected arc.
      this._sun.style.left = `${solarX}%`;
      this._sun.style.top = `${Math.max((this._config.sun_moon_size/2+6)/(this._h||1000)*100,100-clamp(elevation/60)*86)}%`;
      if(this._config.preview){
        this._sun.style.top = `${100-Math.sin(solarProgress*Math.PI)*86}%`;
        this._moon.style.left = `${7+lunarProgress*86}%`;
        this._moon.style.top = `${100-Math.sin(lunarProgress*Math.PI)*86}%`;
        this._orbX = (this._night?7+lunarProgress*86:solarX)/100;
        this._orbY = (100-Math.sin((this._night?lunarProgress:solarProgress)*Math.PI)*86)/100;
      }
      const tuning = this._recipe;
      const visibility = sunOK ? tuning.sunVisibility : 0;
      const warm = 1-smooth(0,18,elevation);
      const solar = (day, sunset) => `rgb(${mix(day,sunset,warm).map(Math.round)})`;
      this._sun.style.setProperty('--solar-core',solar([255,255,255],[255,202,128]));
      this._sun.style.setProperty('--solar-edge',solar([255,254,246],[251,133,66]));
      this._sun.style.setProperty('--solar-halo',solar([255,251,241],[255,163,88]));
      this._solarRayStrength = smooth(2,25,elevation)*Math.pow(1-clamp(tuning.cloudDarkness||0),1.6);
      this._sun.style.setProperty('--solar-rays',String(this._solarRayStrength));
      this._sun.style.setProperty('--solar-bloom',String(0.5+0.5*smooth(0,30,elevation)));
      this._sun.style.setProperty('--solar-flatten',String(1-0.06*warm));
      this._sun.style.setProperty('--origami-sun-moon-glow-opacity',String(visibility));
      this._moon.style.setProperty('--origami-sun-moon-glow-opacity',String(visibility));
      this._sun.style.opacity = visibility*smooth(-1.5,0.5,elevation);
      this._moon.style.opacity = visibility*this._moonlight;
      this._paintMoon(); this._syncEffects();
      this._draw(performance.now(),0);
    }
    _updateHaze(state) {
      const scheme = 'light';
      const ht = (_HAZE_TUNING[state] || _HAZE_TUNING.default)[scheme];
      const pal = _HAZE_PALETTE[scheme];
      const toned=(c,a)=>`rgba(${[0,1,2].map(i=>Math.round(c[i]+(ht.tone[i]-c[i])*ht.mix)).join(',')},${Math.min(1,c[3]*a).toFixed(3)})`;
      for(let i=0;i<pal.length;i++){
        this._sky.style.setProperty(`--origami-haze${i+1}-c`,toned(pal[i].c,ht.alpha));
        this._sky.style.setProperty(`--origami-haze${i+1}-core`,toned(pal[i].core||pal[i].c,ht.alpha*(pal[i].core?ht.core:1)));
      }
      this._sky.style.setProperty('--origami-haze-scale',String(ht.scale));
    }
    _paintMoon() {
      const phase = Math.round(OriginalAstronomy._moonPhase()*200)/200;
      this._moon.querySelector('.moon-lit-path').setAttribute('d',OriginalAstronomy._moonLitPath(phase)||'');
      this._moon.querySelector('.moon-image').setAttribute('href',MOON_SURFACE);
      this._moon.style.setProperty('--origami-moon-phase-glow',String(Math.round(Math.sin(phase*Math.PI)*100)/100));
    }
    _syncEffects() {
      if (!this._w) return;
      const cfg=this._config, state=this._weatherState, tuning=this._recipe;
      const actor=(kind,allowed,activity)=>allowed&&cfg[kind]&&this._actorsAvailable&&activity>0 ? {activity,state,density:cfg.actor_density}:null;
      const birds=actor('birds',!this._night,WeatherEffects.birdActivity(state));
      const balloons=actor('balloons',true,WeatherEffects.balloonActivity(state));
      const planes=actor('planes',true,WeatherEffects.planeActivity(state));
      this._actorVisibility={birds:!!birds,balloons:!!balloons,planes:!!planes};
      const stars=cfg.stars&&this._starlight>0&&tuning.starCount>0 ? {count:tuning.starCount,opacity:tuning.starOpacity}:null;
      WeatherEffects.set(this._effects,cfg.effects?tuning.precipitation:null,this._w,this._h,
        cfg.clouds&&WeatherEffects.hasClouds(state)?state:null,stars,birds,balloons,planes);
      // Fullscreen framing: one original mist band crosses the light source.
      // Texture, alpha, drift speed and all other puffs remain the reference's.
      const field=this._effects.cloud;
      this._adaptClouds(field,state);
      if(state==='fog'&&field&&!this._fogFields.has(field)){
        const mist=field.puffs.find(p=>p.speed<0)||field.puffs[0];
        if(mist){mist.x=this._orbX+0.15;mist.y=this._orbY;}
        this._fogFields.add(field);
      }
      if (cfg.preview) for(const actor of [this._effects.birds,this._effects.balloon,this._effects.planes]) {
        if(actor&&!actor.list.length) actor.next=-1;
      }
    }
    _adaptClouds(field,state) {
      const profile=STORM_CLOUDS[state];
      const ambient=this._config.brightness*(1-this._config.overlay_opacity);
      this._cloudTone={ambient,gray:!!profile,light:profile?profile.light:1};
      this._paintCloudTone();
      if(!field)return;
      let saved=this._cloudFields.get(field);
      if(!saved){saved={original:field.puffs.map(p=>({...p})),state:null};this._cloudFields.set(field,saved);}
      if(saved.state===state)return;
      saved.state=state;
      field.puffs=saved.original.map(p=>({...p}));
      if(!profile)return;
      const originals=saved.original,extra=Math.ceil(originals.length*(profile.density-1));
      for(let i=0;i<extra;i++){
        const puff=originals[i%originals.length],pass=1+Math.floor(i/originals.length);
        field.puffs.push({...puff,
          x:(puff.x+0.381966*pass+(i%5)*.073)%1,
          y:.04+((puff.y+pass*.217+(i%3)*.083)%1)*.88,
          size:puff.size*(1.06+(i%3)*.035),
          alpha:Math.min(.96,puff.alpha*1.16),
          flip:i%2===0?!puff.flip:puff.flip,bobPh:puff.bobPh+pass*1.7});
      }
    }
    _paintCloudTone(flash=0) {
      const tone=this._cloudTone;
      if(!tone)return;
      // Let lightning illuminate the darkened bank instead of dimming its flash.
      const light=tone.ambient*(tone.light+flash*1.2);
      this._cloudCanvas.style.filter=`${tone.gray?'grayscale(.92) ':''}brightness(${light})`;
    }
    _adaptActors() {
      for(const [kind,group] of [['birds',this._effects.birds],['balloons',this._effects.balloon],['planes',this._effects.planes]]) {
        if(!group)continue;
        for(const actor of group.list){
          if(!this._actorSizes.has(actor))this._actorSizes.set(actor,actor.px);
          const target=this._actorSizes.get(actor)*this._config.actor_scale;
          if(actor.px!==target){actor.px=target;if(kind==='balloons')actor.sprite=null;}
          // Demo-only pre-roll along the original trajectories, so a 20s scene
          // can show the atlas instead of waiting through the original long gaps.
          if(this._config.preview&&!this._demoActors.has(actor)){
            if(kind==='birds')actor.x+=actor.dir*actor.sp*8;
            else if(kind==='planes')actor.d=0.4;
            else {actor.x+=actor.vx*25;actor.y+=actor.vy*25;}
            this._demoActors.add(actor);
          }
        }
      }
    }
    _draw(now,dt) {
      if(!this._w||!this._recipe)return;
      const moving=this._config.effects&&!this._reduced?.matches;
      const step=moving?dt:0;
      this._sceneTime=(this._sceneTime||0)+step;
      if(!moving)this._effects.flash=null;
      this._adaptActors();
      const size=this._config.sun_moon_size,x=this._orbX*this._w,y=this._orbY*this._h;
      const visible=Number(this._night?this._moon.style.opacity:this._sun.style.opacity);
      const env={schemeDark:this._night,night:this._night,backgroundRGB:this._backgroundRGB,
        glow:visible>0.05?{x,y,r2:(size*2.4)**2,s:0.55*visible*(this._night?0.5:1)}:null,
        moon:this._night&&visible>0?{x,y,r:size/2}:null};
      // Draw the original clouds independently so tinting never greys the snow
      // or rain. The engine and its textures remain unchanged.
      const cloud=this._effects.cloud;
      const cloudScene={...this._effects,key:null,stars:null,birds:null,balloon:null,planes:null,rain:null,snow:null,hail:null};
      WeatherEffects.frame(cloudScene,this._cloudCtx,this._w,this._h,this._renderScale,step,this._sceneTime,env,null);
      this._effects.flash=cloudScene.flash;
      const flash=cloudScene.flash;
      const peak=flash?.age>=0&&flash.strokes
        ? Math.max(0,...flash.strokes.map(s=>flash.age>=s.start&&flash.age<s.start+s.on?s.peak:0)):0;
      this._paintCloudTone(peak);
      this._effects.cloud=null;
      try {
        WeatherEffects.frame(this._effects,this._ctx,this._w,this._h,this._renderScale,step,this._sceneTime,env,this._starCtx);
      } finally {this._effects.cloud=cloud;}
      this._adaptActors();
    }

  }
  if (!customElements.get('dashboard-weather-background')) customElements.define('dashboard-weather-background', DashboardWeatherBackground);
})();

// Home Assistant card-picker discovery; configuration remains YAML-based.
window.customCards = window.customCards || [];
if (!window.customCards.some(card => card.type === 'dashboard-weather-background')) {
  window.customCards.push({type:'dashboard-weather-background',name:'Live Weather Background',
    description:'Animated fullscreen sky driven by weather and sun entities. Configure with YAML.',preview:false});
}
