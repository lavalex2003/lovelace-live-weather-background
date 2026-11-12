// Execute the actual vendored engine with a DOM/Canvas contract, not a substitute renderer.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
let Card,seq=0;const frames=new Map(),timers=new Set();
const gradient=()=>({addColorStop(){}});
function context(){const counts={};return new Proxy({counts,createRadialGradient:gradient,createLinearGradient:gradient,createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)})},{get:(o,k)=>o[k]||((...args)=>{counts[k]=(counts[k]||0)+1;})});}
class Element{
 constructor(name='card'){this.localName=name;this.style={setProperty(k,v){this[k]=v;}};this.dataset={};this.children=[];this.isConnected=true;this.attributes={};this.classList={toggle(){}};}
 attachShadow(){return this.shadowRoot=new Element('shadow');}
 set innerHTML(value){this.html=value;}
 querySelector(selector){if(selector==='[data-dashboard-weather]')return this.children.find(x=>x.dataset.dashboardWeather!==undefined)||null;return this.nodes?.[selector]||(this.nodes||={},this.nodes[selector]=new Element(selector));}
 setAttribute(k,v){this.attributes[k]=v;}getContext(){return this.ctx||=context();}
 prepend(...nodes){this.children.unshift(...nodes);for(const n of nodes)n.parentNode=this;}
 remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(x=>x!==this);}
 getBoundingClientRect(){return{width:1200,height:800};}
}
class MockImage{
 set src(value){this._src=value;this.naturalWidth=this.width=2560;this.naturalHeight=this.height=1024;if(value.startsWith('data:image/png;base64,')){const png=Buffer.from(value.split(',')[1],'base64');this.naturalWidth=this.width=png.readUInt32BE(16);this.naturalHeight=this.height=png.readUInt32BE(20);}this.onload?.();}
 get src(){return this._src;}
}
const document={hidden:false,createElement:n=>new Element(n),addEventListener(){},removeEventListener(){}};
const sandbox={HTMLElement:Element,Image:MockImage,document,window:{devicePixelRatio:2},customElements:{get:()=>Card,define:(name,c)=>Card=c},console,performance:{now:()=>1000},setTimeout,
 matchMedia:()=>({matches:false,addEventListener(){},removeEventListener(){}}),ResizeObserver:class{observe(){}disconnect(){this.closed=true;}},IntersectionObserver:class{observe(){}disconnect(){this.closed=true;}},
 requestAnimationFrame:fn=>{frames.set(++seq,fn);return seq;},cancelAnimationFrame:id=>frames.delete(id),setInterval:fn=>{timers.add(fn);return fn;},clearInterval:fn=>timers.delete(fn)};
const scope=vm.createContext(sandbox);
vm.runInContext(fs.readFileSync('src/origami-engine.js','utf8').replace(/export\s*\{[^}]+\};\s*$/,''),scope);
vm.runInContext(fs.readFileSync('src/dashboard-weather-background.js','utf8').replace(/^import[^\n]+\n/,''),scope);
assert.equal(Card.version,'2.4.0');assert.equal(Card.getStubConfig({states:{'weather.example':{}}}).weather_entity,'weather.example');const card=new Card(),config={weather_entity:'weather.home',sun_entity:'sun.sun'};
assert.throws(()=>card.setConfig({weather_entity:'sensor.bad',sun_entity:'sun.sun'}));assert.throws(()=>card.setConfig({...config,fps:'bad'}));
card.setConfig(config);const view=new Element('hui-view');view.attachShadow();card.parentNode=view;card.hass={states:{}};card.connectedCallback();
assert.equal(view.shadowRoot.children.length,2);assert.equal(timers.size,1);assert(card._canvas.width*card._canvas.height<=1203000);assert.equal(card._sun.style.opacity,0);
function state(weather,elevation=35){card.hass={states:{'weather.home':{state:weather,attributes:{}},'sun.sun':{state:elevation>0?'above_horizon':'below_horizon',attributes:{elevation,next_noon:new Date(Date.now()-3600000).toISOString(),next_setting:new Date(Date.now()+18000000).toISOString()}}}};}
state('sunny');const day=card._skyBase.style.background;assert(card._sun.style.opacity>0);assert.equal(card._moon.style.opacity,0);
state('clear-night',-28);assert.notEqual(day,card._skyBase.style.background);assert.equal(card._sun.style.opacity,0);assert(card._moon.style.opacity>0);
assert(card._moon.querySelector('.moon-image').attributes.href.startsWith('data:image/webp'));
assert(card._moon.querySelector('.moon-lit-path').attributes.d.startsWith('M 50 2'));
for(const weather of ['partlycloudy','cloudy','rainy']){state(weather,-28);assert(card._moon.style.opacity>0&&card._moon.style.opacity<1);assert.equal(card._sun.style.opacity,0);assert(card._effects.cloud.puffs.length>0);}
for(const weather of ['partlycloudy','cloudy','rainy','pouring','lightning','lightning-rainy','snowy','snowy-rainy','hail','fog','windy','windy-variant','exceptional','unknown','unavailable']){state(weather);card._draw(1000,.04);assert(card._effects.cloud?.puffs.length>0,'Reference clouds exist in '+weather);}
// Regression: crossing the HA horizon state must not switch the atmosphere.
let previous;
for(let elevation=-20;elevation<=40;elevation+=0.05){
 state('sunny',elevation);
 const colors=card._skyColors.flat();
 if(previous)assert(Math.max(...colors.map((v,i)=>Math.abs(v-previous[i])))<=4,'Abrupt sky change near elevation '+elevation);
 previous=colors;
}
state('sunny',35);const clearSky=JSON.stringify(card._skyColors);
card.hass={...card._hass,themes:{darkMode:true}};
assert.equal(JSON.stringify(card._skyColors),clearSky,'Dashboard theme must not darken the daylight atmosphere');
assert(card._skyColors[0][2]>card._skyColors[0][0]*3,'Clear daytime zenith should be blue');
state('sunny',-0.01);const justAfter=card._skyColors.flat();
state('sunny',0.01);assert(Math.max(...card._skyColors.flat().map((v,i)=>Math.abs(v-justAfter[i])))<=2);
state('sunny',-6);assert(card._starlight>0&&card._starlight<1);assert.equal(card._sun.style.opacity,0);assert(card._moon.style.opacity>0&&card._moon.style.opacity<1);
console.log('Continuous horizon, blue daylight, theme independence and twilight verified');
state('cloudy');const whiteCount=card._effects.cloud.puffs.length;assert(!card._cloudCanvas.style.filter.includes('grayscale'));
for(const weather of ['rainy','pouring','lightning','lightning-rainy','snowy','snowy-rainy','hail']){
 state(weather);const field=card._effects.cloud,count=field.puffs.length;
 assert(count>=card._cloudFields.get(field).original.length*2,'Storm cloud cover must at least double: '+weather);
 assert(card._cloudCanvas.style.filter.includes('grayscale(.92)'));
 assert(!card._canvas.style.filter.includes('grayscale'),'Precipitation keeps its own color');
 for(let i=0;i<10;i++){card._snapshot=null;card._update();}assert.equal(field.puffs.length,count,'Cloud enhancement must not accumulate');
}
state('cloudy');assert.equal(card._effects.cloud.puffs.length,whiteCount);assert(!card._cloudCanvas.style.filter.includes('grayscale'));
assert(card._cloudCanvas.width*card._cloudCanvas.height<=1203000);
console.log('Dense grey storm clouds, white fair clouds, independent precipitation color and bounded field verified');
state('rainy');assert.equal(card._effects.rainKey,'rain');const rainCount=card._effects.rain.length;assert(card._effects.cloud.puffs.some(p=>p.band<3));
state('pouring');assert.equal(card._effects.rainKey,'pour');assert(card._effects.rain.length>rainCount);assert(card._effects.cloud.puffs.some(p=>p.band<3));
state('fog');assert(card._effects.cloud.puffs.every(p=>p.band===3));assert(card._effects.cloud.puffs.some(p=>p.speed<0)&&card._effects.cloud.puffs.some(p=>p.speed>0));
state('lightning');for(let i=0;i<130;i++)card._draw(i*50,.05);assert(card._effects.flash.strokes.length>=2,'Reference storm flashes illuminate cloud clusters');
const darkFilter=card._cloudCanvas.style.filter;
Object.assign(card._effects.flash,{age:0,dur:1,strokes:[{start:0,on:1,peak:1}],puffs:[card._effects.cloud.puffs.find(p=>p.band<3)]});
card._draw(7900,.04);assert.notEqual(card._cloudCanvas.style.filter,darkFilter,'Lightning must illuminate dark clouds');
state('pouring');card._draw(8000,.05);assert.equal(card._effects.flash,null,'Pouring does not flash');
state('sunny');for(const group of [card._effects.birds,card._effects.balloon,card._effects.planes])group.next=-1;
card._draw(9000,.05);assert(card._effects.birds.list.length);assert(card._effects.balloon.list.length);assert(card._effects.planes.list.length);
const birdX=card._effects.birds.list[0].x;card._draw(9050,.05);assert.notEqual(card._effects.birds.list[0].x,birdX);assert(card._ctx.counts.drawImage>0);
for(const kind of ['birds','balloons','planes']){card.setConfig({...config,birds:false,balloons:false,planes:false,[kind]:true});assert.equal(!!card._effects.birds,kind==='birds');assert.equal(!!card._effects.balloon,kind==='balloons');assert.equal(!!card._effects.planes,kind==='planes');}
card.setConfig(config);state('clear-night',-28);assert(!card._effects.birds);assert(card._effects.stars);state('lightning');assert(!card._effects.birds&&!card._effects.balloon&&!card._effects.planes);
card.setConfig({...config,effects:false});const frozen=card._sceneTime;card._motion();assert.equal(card._sceneTime,frozen);assert.equal(frames.size,0);
card.setConfig(config);card._reduced.matches=true;card._motion();assert.equal(frames.size,0);assert.equal(card._sceneTime,frozen);card._reduced.matches=false;card._schedule();
console.log('Sky actors, weather gating, independent toggles and motion verified');
const realStates=JSON.stringify(card._hass.states),expected=['sunny','clear-night','partlycloudy','cloudy','windy','windy-variant','fog','rainy','pouring','lightning','lightning-rainy','hail','exceptional','snowy-rainy','snowy'];
card.setConfig({...config,preview:true,preview_interval:30});const start=card._previewStartedAt;assert.equal(card._refreshPeriod,100);assert.equal(timers.size,1);
assert.equal(card._sceneEntities(start+29999).weather.state,'sunny');assert.equal(card._sceneEntities(start+30000).weather.state,'clear-night');
for(let i=0;i<expected.length;i++){
 card._previewStartedAt=start;
 for(const [fraction,elevation] of [[0,0],[.25,55],[.5,0],[.75,-55]]){
  const scene=card._sceneEntities(start+i*30000+fraction*30000);
  assert.equal(scene.weather.state,expected[i]);assert(Math.abs(scene.sun.attributes.elevation-elevation)<.001);
 }
 card._previewStartedAt=Date.now()-i*30000-7500;card._snapshot=null;card._update();assert(!card._night);assert(card._previewLabel.textContent.includes(`Demo ${i+1}/15`));assert(card._sun.style.opacity>0);
 card._previewStartedAt=Date.now()-i*30000-22500;card._update();assert(card._night);assert(card._moon.style.opacity>0);assert(Math.abs(parseFloat(card._moon.style.left)-50)<1);
}
card._previewStartedAt=start;assert.equal(card._sceneEntities(start+450000).weather.state,'sunny');assert.equal(JSON.stringify(card._hass.states),realStates);
card.hass={...card._hass,locale:{language:'ru'}};assert(card._previewLabel.textContent.startsWith('Демо'));card.hass={...card._hass,locale:{language:'en'}};assert(card._previewLabel.textContent.startsWith('Demo'));
card.setConfig({...config,preview:false});assert.equal(card._refreshPeriod,60000);assert.equal(timers.size,1);assert.strictEqual(card._sceneEntities().weather,card._hass.states['weather.home']);assert(card._previewLabel.hidden);
console.log('All 15 weather scenes cover sunrise, noon, sunset and midnight; real sources preserved');
document.hidden=true;card._visibility();assert.equal(frames.size,0);document.hidden=false;card._visibility();assert.equal(frames.size,1);
card.disconnectedCallback();assert.equal(frames.size,0);assert.equal(timers.size,0);assert.equal(view.shadowRoot.children.length,0);assert(card._resize.closed&&card._observer.closed);
card.connectedCallback();assert.equal(view.shadowRoot.children.length,2);card.disconnectedCallback();
console.log('Weather scene state, effects, lifecycle and canvas budget verified');
console.log('Reference cloud textures, lunar surface, actor sprites and storm recipes verified');
