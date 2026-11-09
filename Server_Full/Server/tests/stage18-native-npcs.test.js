'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const city=require('../lib/city-3127');
const {encode}=require('../lib/codec');
const {systemEvent}=require('../lib/proto');
const source=require('../config/map2-native-npcs-3127.json');
function withNpcEnabled(fn){const old=process.env.HEROS_CITY_NPCS_ENABLED;try{process.env.HEROS_CITY_NPCS_ENABLED='1';return fn();}finally{if(old===undefined)delete process.env.HEROS_CITY_NPCS_ENABLED;else process.env.HEROS_CITY_NPCS_ENABLED=old;}}
test('Map2 uses ten verified NPC prefabs and twelve native-creature guards, not every cross-map NPC',()=>{
 const rows=require('../config/schemes/CreatureScheme.json').Creature,npcIds=new Set(rows.filter(x=>x.TypeGroup===5).map(x=>x.ID));
 assert.equal(npcIds.size,27);assert.equal(city.npcRecords.length,22);
 const guards=city.npcRecords.filter(n=>n.renderSource==='native-creature'),npcs=city.npcRecords.filter(n=>n.renderSource!=='native-creature');
 assert.equal(guards.length,12);assert.equal(npcs.length,10);for(const n of npcs)assert.ok(npcIds.has(n.cid));for(const n of guards)assert.ok(rows.some(r=>r.ID===n.cid));
 assert.equal(new Set(city.npcRecords.map(n=>n.id)).size,22);assert.equal(new Set(npcs.map(n=>n.prefab_path)).size,10);assert.equal(source.mapId,2);assert.ok(city.npcRecords.every(n=>n.placementStatus==='operator-maincity-layout'));
});
test('all manually placed NPCs stand within genuine map2 central safe area, away from player spawn and walls',()=>{
 for(const n of city.npcRecords){assert.ok(city.safePoint(n.x,n.y),n.cid+' safe area');assert.ok(Math.hypot(n.x+28,n.y+132)>350,n.cid+' spawn separation');}
 assert.equal(city.layout.safeAreas.length,5);
});
test('NPC are never spawned on guide map; opt-in mode isolates them from city walls',()=>withNpcEnabled(()=>{
 const old=process.env.HEROS_CITY_OBJECTS_ENABLED;
 try{
 process.env.HEROS_CITY_OBJECTS_ENABLED='0';
 const entities=city.entitiesFor('main',2);
 assert.equal(entities.length,22);
 assert.equal(city.entitiesFor('rookie',2).length,22);
 assert.equal(city.entitiesFor('guide',99).length,0);
 for(const e of entities){assert.ok(e.id>50000000);assert.equal(e.uid,0);assert.equal(e.ownerID,0);assert.ok(e.physics);}
 process.env.HEROS_CITY_OBJECTS_ENABLED='1';
 assert.equal(city.entitiesFor('main',2).length,58);
 }finally{if(old===undefined)delete process.env.HEROS_CITY_OBJECTS_ENABLED;else process.env.HEROS_CITY_OBJECTS_ENABLED=old;}
}));
test('all 22 NPC and guard entity snapshots encode and decode in authentic 2024 ReplicateMsg protobuf',()=>withNpcEnabled(()=>{
 const original=process.env.HEROS_CITY_OBJECTS_ENABLED;process.env.HEROS_CITY_OBJECTS_ENABLED='0';
 try{
 for(const e of city.entitiesFor('main',2)){
  const event={entityID:-1,systemType:0,eventType:0,data:Buffer.from(systemEvent.entityCreated.encode({entities:[e]}).finish())};
  const payload=encode('ReplicateMsg',{events:[event]});assert.ok(payload.length>0);
  const round=systemEvent.entityCreated.decode(event.data);assert.equal(round.entities[0].id,e.id);
 }
 }finally{if(original===undefined)delete process.env.HEROS_CITY_OBJECTS_ENABLED;else process.env.HEROS_CITY_OBJECTS_ENABLED=original;}
}));
test('NPC dialog uses authentic NPC talk group and verifies distance',()=>withNpcEnabled(()=>{
 const id=414,n=city.npcRecords.find(r=>r.cid===id),group=n.talkGroups[0];assert.ok(Number.isInteger(group));
 assert.equal(city.resolveTalk('main',2,n.x,n.y,id,group).ok,true);
 assert.equal(city.resolveTalk('main',2,n.x+1000,n.y,id,group).ok,false);
 assert.equal(city.resolveTalk('guide',99,n.x,n.y,id,group).ok,false);
 assert.equal(city.resolveTalk('main',2,n.x,n.y,id,999999).ok,false);
}));
test('legacy safe mode can disable all NPCs without disabling five real safe zones',()=>{
 const old=process.env.HEROS_CITY_NPCS_ENABLED;
 try{
 process.env.HEROS_CITY_NPCS_ENABLED='0';
 assert.equal(city.diagnostics().npcCount,22);assert.equal(city.diagnostics().activeNpcCount,0);
 assert.equal(city.safePoint(0,0),true);
 }finally{if(old===undefined)delete process.env.HEROS_CITY_NPCS_ENABLED;else process.env.HEROS_CITY_NPCS_ENABLED=old;}
});
