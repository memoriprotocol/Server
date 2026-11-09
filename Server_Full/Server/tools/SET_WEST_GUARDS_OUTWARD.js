'use strict';
// Stage38: only flip the western guards, without touching NPC coordinates,
// guard appearance, any other angle or non-guard records.
const fs = require('node:fs');
const path = require('node:path');
const configPath = path.resolve(__dirname, '../config/map2-native-npcs-3127.json');
const wanted = new Set([26605, 26606, 26613]);
const source = fs.readFileSync(configPath, 'utf8');
const roster = JSON.parse(source);
if (!roster || !Array.isArray(roster.npcs)) throw Error('Invalid NPC roster, not modified.');
const west = roster.npcs.filter(n => wanted.has(Number(n.sourceId)));
if (west.length !== 3 || new Set(west.map(n => Number(n.sourceId))).size !== 3) {
  throw Error('Expected exactly 3 western guard IDs, not modified.');
}
for (const guard of west) {
  if (!['gate-guard', 'safezone-guard'].includes(guard.role) || guard.side !== 'west' || Number(guard.cid) !== 3001 || Number(guard.nativeCreatureId) !== 3001) {
    throw Error('Unexpected western guard record '+guard.sourceId+'; not modified.');
  }
}
let changed = 0;
for (const guard of west) {
  if (guard.angle !== 90) {guard.angle = 90; changed++;}
}
if (!changed) {
 console.log('Stage38: western guard angles already 90 degrees. No changes.');
 process.exit(0);
}
const backupPath = configPath + '.stage38.bak';
if (!fs.existsSync(backupPath)) fs.copyFileSync(configPath, backupPath);
const next = JSON.stringify(roster, null, 2) + '\n';
const temp = configPath + '.stage38.tmp';
try {fs.writeFileSync(temp, next, 'utf8'); fs.renameSync(temp, configPath);} catch (error) {
  try {fs.unlinkSync(temp);} catch {}
  throw error;
}
console.log('Stage38: west gate guards 26605 and 26606, remote safezone guard 26613 => 90 degrees.');
console.log('All coordinates, appearance IDs (3001), other 9 guards, NPCs, mobs, bosses, walls and saves unchanged.');
console.log('Backup: ' + backupPath);
