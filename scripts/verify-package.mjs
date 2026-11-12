import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const read=p=>fs.readFileSync(p,'utf8');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const pkg=JSON.parse(read('package.json')),hacs=JSON.parse(read('hacs.json'));
const dist=read('dist/live-weather-background.js'),engine=read('src/origami-engine.js'),card=read('src/dashboard-weather-background.js');
assert.equal(pkg.name,'lovelace-live-weather-background');assert.equal(pkg.license,'GPL-3.0-only');
assert.equal(hacs.filename,'live-weather-background.js');assert.equal(hacs.name,'Live Weather Background');
assert(card.includes(`VERSION = '${pkg.version}'`));assert(dist.includes(`Live Weather Background v${pkg.version}`));
assert(!/^import\s/m.test(dist));assert(!/^export\s/m.test(dist));
assert(dist.includes(engine.replace(/export\s*\{[^}]+\};\s*$/,'')));
assert(dist.includes(card.replace(/^import[^\n]+\n/,'')));
assert(read('LICENSE').includes('GNU GENERAL PUBLIC LICENSE'));assert(read('LICENSE').includes('Version 3, 29 June 2007'));
const upstream=JSON.parse(read('vendor/origami_weather/UPSTREAM.json'));
assert.equal(hash(fs.readFileSync('vendor/origami_weather/origami-weather.js')),upstream.bundle_sha256);
assert.equal(upstream.commit,'79d015b1de55d42da90db4808785e716eff813df');
for(const name of ['README.md','README.ru.md','THIRD_PARTY_NOTICES.md']){
 const text=read(name);assert(text.includes('https://github.com/hazymorning/origami_weather'));assert(text.includes('hazymorning'));assert(text.includes('GPL-3.0'));
}
assert(read('README.md').includes('inspired'));assert(read('README.ru.md').includes('вдохновила'));
for(const name of ['overview','day','sunset','night','rain','cloudy','snow']){
 const image=fs.readFileSync(`docs/images/${name}.png`);assert.equal(image.subarray(1,4).toString(),'PNG');assert(image.length>1000);
}
assert(fs.statSync('docs/day-night.mp4').size>10000);
assert(fs.readFileSync('docs/day-night.mp4').subarray(4,8).toString()==='ftyp');
for(const doc of ['README.md','README.ru.md','docs/configuration.md','docs/development.md']){
 const text=read(doc);
 for(const match of text.matchAll(/\]\(([^)]+)\)/g)){
  const target=match[1];if(/^(https?:|#)/.test(target))continue;
  assert(fs.existsSync(path.resolve(path.dirname(doc),target.split('#')[0])),`Broken link in ${doc}: ${target}`);
 }
}
assert.equal(read('SHA256SUMS').trim(),`${hash(dist)}  live-weather-background.js`);
const forbidden=[/SUPERVISOR_TOKEN/,/github_access_token/,/\/root\/config/,/\/homeassistant\//,/-----BEGIN [^-]*PRIVATE KEY-----/,/gh[pousr]_[A-Za-z0-9_]{30,}/,/github_pat_[A-Za-z0-9_]{30,}/];
const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.name==='.git'?[]:e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);
for(const file of walk('.')){
 assert(!['secrets.yaml','.env'].includes(path.basename(file)),`Private file: ${file}`);
 if(!file.endsWith('verify-package.mjs')&&/\.(?:js|mjs|cjs|py|md|yaml|yml|json)$/.test(file))for(const rule of forbidden)assert(!rule.test(read(file)),`Private runtime data in ${file}`);
}
console.log('Package and provenance verified');
