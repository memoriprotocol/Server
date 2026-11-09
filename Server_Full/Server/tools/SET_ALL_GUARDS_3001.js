'use strict';
// Stage37: id-only, repeatable migration. Keep all manual NPC coordinates, rotations, and custom changes intact.
const fs = require('node:fs');
const path = require('node:path');
const base = path.resolve(__dirname, '..', 'config');
const rosterPath = path.join(base, 'map2-native-npcs-3127.json');
const verifiedPath = path.join(base, 'map2-verified-prefabs-3127.json');
const roster = JSON.parse(fs.readFileSync(rosterPath, 'utf8'));
const ids = new Set();
const guards = roster.npcs.filter(n => n.role === 'gate-guard' || n.role === 'safezone-guard');
if (guards.length !== 12 || guards.filter(n => n.role === 'safezone-guard').length !== 4 || guards.filter(n => n.role === 'gate-guard').length !== 8) {
  throw new Error(`Expected 8 city + 4 remote guards, found ${guards.length}. Original files left intact.`);
}
for (const g of guards) {
  if (!Number.isInteger(g.sourceId) || ids.has(g.sourceId)) throw new Error('Invalid/duplicate guard sourceId: ' + g.sourceId);
  ids.add(g.sourceId);
}
const verified = JSON.parse(fs.readFileSync(verifiedPath, 'utf8'));
const targetEntries = verified.prefabs.filter(x => ids.has(Number(x.entityId)-50000000));
if (targetEntries.length !== 12) throw new Error('Expected 12 verified guard entries; original files left intact.');
for(const g of guards){g.cid=3001;g.nativeCreatureId=3001;g.type=1037;}
for(const item of targetEntries){item.nativeCreatureId=3001;item.renderType=1037;}
function writeIfDifferent(filepath, obj){
  const current=fs.readFileSync(filepath,'utf8');
  const updated=JSON.stringify(obj,null,2)+'\n';
  if(JSON.stringify(JSON.parse(current))===JSON.stringify(obj)) return false;
  const backup=filepath+'.stage37.bak';
  if(!fs.existsSync(backup)) fs.copyFileSync(filepath,backup);
  const tmp=filepath+'.stage37.tmp';
  fs.writeFileSync(tmp,updated);
  fs.renameSync(tmp,filepath);
  return true;
}
const changed1=writeIfDifferent(rosterPath,roster);
const changed2=writeIfDifferent(verifiedPath,verified);
console.log('Guard 3001: city=8, remote safe zones=4; coords and angles left untouched.');
console.log('Modified:', changed1?'roster':'roster already correct', ',', changed2?'verification':'verification already correct');
console.log('Backup suffix: .stage37.bak (created only if a file changed).');
