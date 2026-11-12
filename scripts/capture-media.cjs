// Requires a running headless Chromium with --remote-debugging-port=9223.
// No HA credentials; only the local preview fixture is opened.
const assert = require('node:assert/strict');
const {pathToFileURL} = require('node:url');
const path = require('node:path');
const {inflateSync} = require('node:zlib');
(async () => {
  const tabs = await (await fetch(process.env.WEATHER_CDP || 'http://localhost:9223/json')).json();
  const tab = tabs.find(t=>t.type==='page'); assert(tab,'Chromium page required');
  const socket = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
  let seq=0;const pending=new Map();
  socket.onmessage=event=>{const r=JSON.parse(event.data);if(pending.has(r.id)){const p=pending.get(r.id);pending.delete(r.id);clearTimeout(p.timer);r.error?p.reject(Error(r.error.message)):p.resolve(r.result);}};
  const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;const timer=setTimeout(()=>{pending.delete(id);reject(Error(`Timeout: ${method} ${params.expression?.slice(0,110)||''}`));},20000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));});
  const evaluate=async expression=>{const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});assert(!r.exceptionDetails,'Browser JavaScript exception');return r.result.value;};
  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  try {
    await call('Page.enable');await call('Runtime.enable');
    await call('Emulation.setDeviceMetricsOverride',{width:1200,height:800,deviceScaleFactor:1,mobile:false});
    await call('Page.navigate',{url:pathToFileURL(path.resolve('tests/preview.html')).href});
    for(let i=0;i<50;i++){await sleep(200);if((await evaluate("document.querySelector('#result')?.textContent"))?.startsWith('PASS'))break;}
    await evaluate(`(async()=>{window.card=document.querySelector('hui-view').shadowRoot.querySelector('dashboard-weather-background');await card._assetsReady;card.setConfig({...card._config,brightness:.72,overlay_opacity:.18,birds:false,balloons:false,planes:false});cancelAnimationFrame(card._raf);card._visible=false;card._layer.classList.toggle('paused',true);return true;})()`);
    const cases=[['day','sunny',35,'Clear daylight'],['sunset','sunny',2,'Warm horizon'],['night','clear-night',-24,'Moonlit night'],['cloudy','cloudy',35,'Cloudy'],['rain','rainy',35,'Rain'],['snow','snowy',35,'Snow']];
    for(const [name,weather,elevation,label] of cases){
      await evaluate(`(()=>{const now=Date.now();card.hass={states:{'weather.preview':{state:'${weather}',attributes:{}},'sun.preview':{state:${elevation}>=0?'above_horizon':'below_horizon',attributes:{elevation:${elevation},next_noon:new Date(now-3600000).toISOString(),next_midnight:new Date(now-3600000).toISOString(),next_setting:new Date(now+14400000).toISOString(),next_rising:new Date(now+14400000).toISOString()}}}};card._skyBase.style.transition='none';card._draw(performance.now(),0);document.querySelector('hui-view').shadowRoot.querySelector('#condition').textContent='${label}';document.querySelector('#result').style.display='none';return true;})()`);
      await sleep(200);const shot=await call('Page.captureScreenshot',{format:'png'});require('node:fs').writeFileSync('docs/images/'+name+'.png',Buffer.from(shot.data,'base64'));
    }
    const photos=cases.map(([name,,,label])=>({label,data:'data:image/png;base64,'+require('node:fs').readFileSync('docs/images/'+name+'.png').toString('base64')}));
    const overview=await evaluate(`(async()=>{const photos=${JSON.stringify(photos)};const c=document.createElement('canvas');c.width=1500;c.height=756;const x=c.getContext('2d');x.fillStyle='#0b1728';x.fillRect(0,0,c.width,c.height);for(let i=0;i<photos.length;i++){const img=new Image();img.src=photos[i].data;await img.decode();const left=(i%3)*500,top=Math.floor(i/3)*378;x.drawImage(img,left,top,500,333);x.fillStyle='#0b1728';x.fillRect(left,top+333,500,45);x.fillStyle='#edf5ff';x.font='20px sans-serif';x.fillText(photos[i].label,left+18,top+362);}return c.toDataURL('image/png').split(',')[1];})()`);
    require('node:fs').writeFileSync('docs/images/overview.png',Buffer.from(overview,'base64'));
    console.log('Public preview media captured');
  } finally {socket.close();}
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
