'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const roster=require('../config/map2-native-npcs-3127.json');
const city=require('../lib/city-3127');
test('Stage38: 3 west guards face opposite previous direction with 3001, all other guard angles unchanged',()=>{
 const guards=roster.npcs.filter(n=>['gate-guard','safezone-guard'].includes(n.role));
 assert.equal(guards.length,12);
 const west=guards.filter(g=>g.side==='west');
 assert.deepEqual(west.map(g=>g.sourceId).sort((a,b)=>a-b),[26605,26606,26613]);
 assert.equal(west.filter(g=>g.role==='gate-guard').length,2);
 assert.equal(west.filter(g=>g.role==='safezone-guard').length,1);
 for(const g of guards){
  assert.equal(g.cid,3001); assert.equal(g.nativeCreatureId,3001);
  assert.equal(g.angle, g.side==='west'?90:({north:180,south:0,east:90})[g.side]);
  const entity=city.entitiesFor('main',2).find(e=>e.id===50000000+g.sourceId);
  assert.ok(entity); assert.equal(entity.physics.rotation,g.angle);assert.equal(entity.physics2.angle,g.angle);
 }
});
