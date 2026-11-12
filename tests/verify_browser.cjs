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
    const palettes=new Set();
    for(const [scene,width,height] of [['day',1440,1000],['night',1440,1000],['rain',1440,1000],['night',390,844]]) {
      await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<600});
      const url=pathToFileURL(path.resolve('tests/preview.html'));
      url.searchParams.set('run',`${scene}-${width}-${Date.now()}`);url.hash=scene;
      await call('Page.navigate',{url:url.href});
      let result;
      for(let i=0;i<40;i++) {
        await sleep(200);
        result=await evaluate("document.querySelector('#result')?.textContent");
        if(result?.endsWith(scene)) break;
      }
      assert(result?.startsWith('PASS') && result.endsWith(scene),`Scene ${scene} did not initialize`);
      const metrics=await evaluate(`(() => {const root=document.querySelector('hui-view').shadowRoot;const card=root.querySelector('dashboard-weather-background');return {width:card._w,height:card._h,pixels:card._canvas.width*card._canvas.height,palette:getComputedStyle(card._skyBase).backgroundImage+card._sky.style.filter,sun:Number(card._sun.style.opacity),moon:Number(card._moon.style.opacity),recipe:card._recipe.precipitation,layers:root.querySelectorAll('[data-dashboard-weather]').length};})()`);
      assert.equal(metrics.width,width);assert.equal(metrics.height,height);assert.equal(metrics.layers,1);assert(metrics.pixels<=1203000);
      if(scene==='night'){assert.equal(metrics.sun,0);assert(metrics.moon>0);}else{assert(metrics.sun>0);assert.equal(metrics.moon,0);}
      if(scene==='rain')assert.equal(metrics.recipe,'rain');
      console.log(`Loaded ${scene} ${width}x${height}`);
      await evaluate(`(async () => {const c=document.querySelector('hui-view').shadowRoot.querySelector('dashboard-weather-background');await c._assetsReady;c._draw(performance.now(),0);return true;})()`);
      const clouds=await evaluate(`(() => {const c=document.querySelector('hui-view').shadowRoot.querySelector('dashboard-weather-background');return c._effects.cloud?.puffs.length||0;})()`);
      assert(clouds>0,'Reference engine must supply cloud layers');
      // Read the first rendered pixel: a negative-z scene would hide under
      // the fixture's opaque app-layout background (#080b10).
      const shot=Buffer.from((await call('Page.captureScreenshot',{format:'png'})).data,'base64');
      const chunks=[];for(let offset=8;offset<shot.length;){const size=shot.readUInt32BE(offset),type=shot.toString('ascii',offset+4,offset+8);if(type==='IDAT')chunks.push(shot.subarray(offset+8,offset+8+size));offset+=size+12;}
      const scanline=inflateSync(Buffer.concat(chunks));
      assert.notDeepEqual([...scanline.subarray(1,4)],[8,11,16],'Scene hidden under theme background');
      if(scene==='day') {
        await evaluate(`(() => {const c=document.querySelector('hui-view').shadowRoot.querySelector('dashboard-weather-background');window.previewSavedConfig={...c._config};window.previewSavedStates=JSON.stringify(c._hass.states);c.setConfig({...c._config,preview:true,preview_interval:30});if(c._previewLabel.hidden||c._sceneEntities().weather.state!=='sunny')throw Error('Demo did not start');c._previewStartedAt=Date.now()-29900;})()`);
        let advanced=false;
        for(let i=0;i<20;i++) {await sleep(200);advanced=await evaluate(`(() => {const c=document.querySelector('hui-view').shadowRoot.querySelector('dashboard-weather-background');return c._previewLabel.textContent.includes('Demo 2/15');})()`);if(advanced)break;}
        assert(advanced,'Demo timer must advance without HA updates');
        assert(await evaluate(`(() => {const c=document.querySelector('hui-view').shadowRoot.querySelector('dashboard-weather-background');const isolated=JSON.stringify(c._hass.states)===window.previewSavedStates;c.setConfig(window.previewSavedConfig);return isolated&&c._previewLabel.hidden&&c._refreshPeriod===60000;})()`),'Demo must leave real sources untouched and disable cleanly');
      }
      palettes.add(metrics.palette);
      console.log(`PASS ${scene} ${width}x${height}: scene, controls and pixel budget`);
    }
    assert.equal(palettes.size,3,'Day, night and rain must have different palettes');
    console.log('Browser weather scenes, stacking, controls and mobile sizing verified');
  } finally {socket.close();}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
