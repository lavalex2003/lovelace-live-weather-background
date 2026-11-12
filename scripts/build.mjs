import fs from 'node:fs';
import crypto from 'node:crypto';
const {version}=JSON.parse(fs.readFileSync('package.json','utf8'));
const engine=fs.readFileSync('src/origami-engine.js','utf8').replace(/export\s*\{[^}]+\};\s*$/,'');
const card=fs.readFileSync('src/dashboard-weather-background.js','utf8').replace(/^import[^\n]+\n/,'');
if(engine.includes('export {')||card.startsWith('import '))throw Error('Source structure changed; review bundling');
const banner=`/*! Live Weather Background v${version} | GPL-3.0-only
 * Copyright (c) 2026 Live Weather Background contributors.
 * Inspired by and containing the Origami Weather rendering engine and assets
 * by hazymorning: https://github.com/hazymorning/origami_weather
 * Source, modifications and license: https://github.com/lavalex2003/lovelace-live-weather-background
 * No warranty. See LICENSE and THIRD_PARTY_NOTICES.md in the source repository.
 */\n`;
fs.mkdirSync('dist',{recursive:true});
fs.writeFileSync('dist/live-weather-background.js',banner+"(()=>{\n'use strict';\n"+engine+'\n'+card+'\n})();\n');
fs.writeFileSync('SHA256SUMS',crypto.createHash('sha256').update(fs.readFileSync('dist/live-weather-background.js')).digest('hex')+'  live-weather-background.js\n');
console.log('Standalone distribution built');
