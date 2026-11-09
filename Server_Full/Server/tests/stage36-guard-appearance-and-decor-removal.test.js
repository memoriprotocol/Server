"use strict";
const {test}=require('node:test'),assert=require('node:assert/strict');
const roster=require('../config/map2-native-npcs-3127.json');
const decor=require('../config/map2-city-objects-3127.json');
const verified=require('../config/map2-verified-prefabs-3127.json').prefabs;
const city=require('../lib/city-3127');
const {proto}=require('../lib/proto');
const crypto=require('node:crypto');
const env=require('../lib/environment-3127');

test('all twelve guards have identical creature appearance and outward gate/safe-area direction',()=>{
 const facing={north:180,south:0,west:90,east:90};
 const guards=roster.npcs.filter(n=>n.role==='gate-guard'||n.role==='safezone-guard');
 assert.equal(guards.length,12);
 assert.equal(guards.filter(n=>n.role==='gate-guard').length,8);
 assert.equal(guards.filter(n=>n.role==='safezone-guard').length,4);
 assert.deepEqual(Object.keys(facing).sort(),[...new Set(guards.map(g=>g.side))].sort());
 for(const side of Object.keys(facing)){
  assert.equal(guards.filter(g=>g.role==='gate-guard'&&g.side===side).length,2);
  assert.equal(guards.filter(g=>g.role==='safezone-guard'&&g.side===side).length,1);
 }
 for(const g of guards){
  assert.equal(g.cid,3001);assert.equal(g.nativeCreatureId,3001);assert.equal(g.type,1037);assert.equal(g.angle,facing[g.side]);
  const native=verified.find(e=>e.entityId===50000000+g.sourceId);
  assert.equal(native.nativeCreatureId,3001);
  const e=city.entitiesFor('main',2).find(e=>e.id===50000000+g.sourceId);
  assert.ok(e);assert.equal(e.cid,3001);assert.equal(e.physics.rotation,facing[g.side]);assert.equal(e.physics2.angle,facing[g.side]);
  assert.equal(proto.EntityInfo.verify(e),null);
 }
});

test('old decor is completely absent but city geometry and all normal NPCs remain',()=>{
 assert.equal(decor.enabled,false);assert.deepEqual(decor.objects,[]);
 assert.equal(city.decorRecords.length,0);
 assert.equal(verified.filter(x=>x.kind==='decor').length,0);
 assert.equal(city.townRecords.length,36);
 const ids=city.entitiesFor('main',2).map(x=>x.id);
 assert.equal(ids.length,58);
 for(let i=27101;i<=27109;i++)assert.equal(ids.includes(50000000+i),false);
 const others=roster.npcs.filter(n=>!['gate-guard','safezone-guard'].includes(n.role));
 assert.equal(others.length,10);
 for(const n of others)assert.ok(ids.includes(50000000+n.sourceId));
});

test('four boss wire records remain identical to Stage30 baseline',()=>{
 const baseline=require('./fixtures/stage30-boss-baseline.json');
 for(const b of baseline.bosses){
  const row=env.templates.find(r=>r.id===b.data.id);
  const hash=crypto.createHash('sha256').update(Buffer.from(proto.EntityInfo.encode(env.entity({...row})).finish())).digest('hex');
  assert.equal(hash,b.entityWireSha256);
 }
});
