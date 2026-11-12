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
  let onFrame=()=>{};
  socket.onmessage=event=>{const r=JSON.parse(event.data);if(r.method==='Page.screencastFrame'){onFrame(r.params);return;}if(pending.has(r.id)){const p=pending.get(r.id);pending.delete(r.id);clearTimeout(p.timer);r.error?p.reject(Error(r.error.message)):p.resolve(r.result);}};
  const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;const timer=setTimeout(()=>{pending.delete(id);reject(Error(`Timeout: ${method} ${params.expression?.slice(0,110)||''}`));},20000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));});
  const evaluate=async expression=>{const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});assert(!r.exceptionDetails,'Browser JavaScript exception');return r.result.value;};
  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  try {
    await call('Page.enable');await call('Runtime.enable');
    await call('Emulation.setDeviceMetricsOverride',{width:960,height:640,deviceScaleFactor:1,mobile:false});
    await call('Page.navigate',{url:pathToFileURL(path.resolve('tests/preview.html')).href});
    for(let i=0;i<50;i++){await sleep(200);if((await evaluate("document.querySelector('#result')?.textContent"))?.startsWith('PASS'))break;}
    await evaluate(`(async()=>{const c=document.querySelector('hui-view').shadowRoot.querySelector('dashboard-weather-background');await c._assetsReady;c.setConfig({...c._config,brightness:.72,overlay_opacity:.18,preview:true,preview_interval:30,birds:false,balloons:false,planes:false});document.querySelector('#result').style.display='none';return true;})()`);
    const fs=require('node:fs'),dir='/tmp/lwb-publication/frames';fs.mkdirSync(dir,{recursive:true});
    const frames=[];let last=-Infinity;
    onFrame=frame=>{call('Page.screencastFrameAck',{sessionId:frame.sessionId}).catch(()=>{});const t=frame.metadata.timestamp;if(t-last<.095)return;last=t;const name=`frame-${String(frames.length).padStart(5,'0')}.jpg`;fs.writeFileSync(dir+'/'+name,Buffer.from(frame.data,'base64'));frames.push({name,t});};
    await call('Page.startScreencast',{format:'jpeg',quality:80,maxWidth:960,maxHeight:640,everyNthFrame:1});
    await sleep(30000);await call('Page.stopScreencast');onFrame=()=>{};
    assert(frames.length>30,'Too few rendered frames');
    const lines=['ffconcat version 1.0'];for(let i=0;i<frames.length;i++){lines.push(`file '${frames[i].name}'`);if(i<frames.length-1)lines.push(`duration ${frames[i+1].t-frames[i].t}`);}lines.push(`file '${frames.at(-1).name}'`);fs.writeFileSync(dir+'/frames.txt',lines.join('\n')+'\n');
    console.log('Demonstration video frames captured:',frames.length);
  } finally {socket.close();}
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
