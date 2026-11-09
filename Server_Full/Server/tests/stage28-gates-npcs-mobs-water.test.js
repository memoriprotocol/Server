'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const city=require('../lib/city-3127'),water=require('../lib/water-3127'),env=require('../lib/environment-3127');
const {encode,decode}=require('../lib/codec'),{proto,systemEvent}=require('../lib/proto'),world=require('../lib/world');
const npc=require('../config/map2-native-npcs-3127.json');
const npcCatalog=require('../../retail/npcs/ALL_NPCS_3127.json');
const verified=require('../config/map2-verified-prefabs-3127.json').prefabs;
test('eight gate-adjacent intruding fence sections are removed, south bridge raised',()=>{
 const removed=new Set([26005,26006,26015,26016,26025,26026,26035,26036]);
 for(const r of city.townRecords)assert.equal(removed.has(r.sourceId),false);
 const c=city.visualCounts(city.entitiesFor('main',2));assert.deepEqual(c,{npc:22,wall:32,bridge:4,other:0,total:58});
 const south=city.townRecords.find(r=>r.sourceId===26042);assert.ok(Math.abs(south.y-(-3235.064))<1e-3);
 assert.equal(city.collidersFor('main',2).length,32);
});
test('four requested central NPCs, two per exit and one in each external safe zone',()=>{
 assert.equal(npc.npcs.length,22);
 for(const role of ['warehouse','mail','change-hero','god-of-war'])assert.equal(npc.npcs.filter(n=>n.role===role).length,1);
 assert.equal(npc.npcs.filter(n=>n.role==='gate-guard').length,8);
 for(const side of ['north','south','west','east'])assert.equal(npc.npcs.filter(n=>n.role==='gate-guard'&&n.side===side).length,2);
 const remote=npc.npcs.filter(n=>n.role==='safezone-guard');assert.equal(remote.length,4);
 assert.deepEqual(new Set(remote.map(n=>n.safeZoneId)),new Set(city.layout.safeAreas.slice(1).map(a=>a.id)));
 for(const n of npc.npcs){assert.equal(city.safePoint(n.x,n.y),true);assert.ok(verified.some(v=>v.entityId===city.nativeId(n.sourceId)&&['cc.Prefab','CreatureScheme'].includes(v.type)));}
 assert.ok(npcCatalog.npcs.length>=27);assert.equal(npcCatalog.totalPlacedInstances,22);
});
test('all sent NPCs use valid Cocos proxy serialization, including guards',()=>{
 for(const e of city.entitiesFor('main',2))assert.equal(proto.EntityInfo.verify(e),null);
 const events=[world.spawnEvent(city.entitiesFor('main',2))];const decoded=decode('ReplicateMsg',encode('ReplicateMsg',{events}));
 assert.equal(systemEvent.entityCreated.decode(decoded.events[0].data).entities.length,58);
});
test('mobs are active and spawn on nearest-first AOI after loading; boss and statics remain',()=>{
 const t=env.templates.find(r=>r.kind==='mob');assert.ok(t);assert.equal(env.entity({...t}).monster.active,true);
 const pushes=[];const state={user:{id:7},world:{mapId:2,level:'main',room:'test',loadingFinished:true,sceneReady:true,entity:{id:7,physics:{x:t.x,y:t.y}}}};
 const game={online:new Set([state]),push:(s,route,b)=>pushes.push({route,b})};
 env.syncView(game,state);assert.ok(pushes.length>0);const msg=decode('ReplicateMsg',pushes[0].b),sp=msg.events.filter(e=>e.eventType===require('../CLIENT_ENUMS_3127.json').SystemEvent.entityCreated);
 assert.ok(sp.length);const created=systemEvent.entityCreated.decode(sp[0].data).entities;assert.ok(created.some(e=>e.cid===t.cid));
 assert.ok(state.world.environmentSentCount.mob>=1);assert.equal(state.world.environmentSeen.size,created.length);
});
test('swimming state resynchronizes after loading without false land events',()=>{
 const r=water.zones.rects.find(z=>z[4]==='north-lake');const w={mapId:2},e={id:30,physics:{x:r[0],y:r[1]}},events=[];
 assert.equal(water.syncWaterState(w,e,events,world.entityEventData,true),true);
 assert.equal(w.inWater,true);assert.equal(events.length,2);
 assert.equal(water.syncWaterState(w,e,events,world.entityEventData,true),true);assert.equal(events.length,4);
 e.physics={x:0,y:0};water.syncWaterState(w,e,events,world.entityEventData);
 assert.equal(w.inWater,false);assert.equal(events.length,6);
});
