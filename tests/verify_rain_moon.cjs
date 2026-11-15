// Requires a running headless Chromium with --remote-debugging-port=9223.
// No HA credentials; only the local preview fixture is opened.
const assert = require('node:assert/strict');
const trace=message=>console.log(message);
trace('Start');setTimeout(()=>{trace('Global test timeout');process.exit(1);},60000).unref();
const {pathToFileURL} = require('node:url');
const path = require('node:path');
const {inflateSync} = require('node:zlib');
(async () => {
  const tabs = await (await fetch(process.env.WEATHER_CDP || 'http://127.0.0.1:9223/json')).json();
  const tab = tabs.find(t=>t.type==='page'); assert(tab,'Chromium page required');
  trace('Tabs fetched');
  const socket = new WebSocket(tab.webSocketDebuggerUrl.replace('localhost','127.0.0.1'));
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('WebSocket open timeout')),10000);socket.onopen=()=>{clearTimeout(timer);resolve();};socket.onerror=reject;});
  trace('WebSocket opened');
  let seq=0;const pending=new Map();
  socket.onmessage=event=>{const r=JSON.parse(event.data);if(pending.has(r.id)){const p=pending.get(r.id);pending.delete(r.id);clearTimeout(p.timer);r.error?p.reject(Error(r.error.message)):p.resolve(r.result);}};
  const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;const timer=setTimeout(()=>{pending.delete(id);reject(Error(`Timeout: ${method} ${params.expression?.slice(0,110)||''}`));},20000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));});
  const evaluate=async expression=>{const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});assert(!r.exceptionDetails,'Browser JavaScript exception');return r.result.value;};
  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  try {
    trace('Browser connected');console.log('Browser connected');
    await call('Page.enable');trace('Page enabled');await call('Runtime.enable');
    await call('Emulation.setDeviceMetricsOverride',{width:640,height:400,deviceScaleFactor:1,mobile:false});
    await call('Page.navigate',{url:pathToFileURL(path.join(__dirname,'rain_moon.html')).href});
    for(let i=0;i<50;i++){await sleep(200);if(await evaluate('window.ready===true'))break;}
    assert(await evaluate('window.ready===true'),'Fixture failed');console.log('Fixture initialized');
    trace('Fixture ready');
    let regularCount;
    for(const weather of ['rainy','pouring']){
      const count=await evaluate(`scene('${weather}',35);card._draw(performance.now(),1/24);card._effects.rain.length`);
      if(weather==='rainy')regularCount=count;else assert(count>=regularCount*4);
      const visible=await call('Page.captureScreenshot',{format:'png'});
      await evaluate("card._rainCanvas.style.opacity='0'");
      const control=await call('Page.captureScreenshot',{format:'png'});
      await evaluate("card._rainCanvas.style.opacity='1'");
      const contrast=await evaluate(`(async()=>{const load=async data=>{const image=new Image();image.src='data:image/png;base64,'+data;await image.decode();const c=document.createElement('canvas');c.width=640;c.height=400;const ctx=c.getContext('2d');ctx.drawImage(image,0,0);return ctx.getImageData(0,0,640,400).data;};const a=await load('${visible.data}'),b=await load('${control.data}');let changed=0,max=0;for(let i=0;i<a.length;i+=4){const delta=((a[i]-b[i])+(a[i+1]-b[i+1])+(a[i+2]-b[i+2]))/3;max=Math.max(max,delta);if(delta>15)changed++;}return {changed,max};})()`);
      assert(contrast.changed>100&&contrast.max>30,'Day rain must contrast with dim clouds');console.log(weather,count,contrast);
      const folder=process.env.WEATHER_SCREENSHOTS||'test-artifacts';require('node:fs').mkdirSync(folder,{recursive:true});require('node:fs').writeFileSync(path.join(folder,weather+'.png'),Buffer.from(visible.data,'base64'));
    }
    const mask=await evaluate(`(async()=>{scene('clear-night',-24);const p=card._moon.querySelector('.moon-lit-path');if(p.getAttribute('transform')!=='rotate(-22 50 50)')throw Error('Missing tilt');p.setAttribute('d','M 50 2 A 48 48 0 0 1 50 98 Z');const svg=card._moon.querySelector('svg').cloneNode(true);svg.setAttribute('xmlns','http://www.w3.org/2000/svg');const image=new Image();image.src='data:image/svg+xml;base64,'+btoa(new XMLSerializer().serializeToString(svg));await image.decode();const c=document.createElement('canvas');c.width=c.height=200;const ctx=c.getContext('2d');ctx.drawImage(image,0,0,200,200);return {top:ctx.getImageData(100,50,1,1).data[3],bottom:ctx.getImageData(100,150,1,1).data[3],outside:ctx.getImageData(0,0,1,1).data[3]};})()`);
    assert(mask.top>220&&mask.bottom<20&&mask.outside===0,'Tilt must affect illumination inside a circular disc');
    console.log('Day rain contrast, pouring density and lunar tilt verified');
  } finally {socket.close();}
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
