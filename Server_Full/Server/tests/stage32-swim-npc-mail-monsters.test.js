"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const water=require('../lib/water-3127'),env=require('../lib/environment-3127'),city=require('../lib/city-3127');
const {entityEvent,proto}=require('../lib/proto'),world=require('../lib/world');
const {encode,decode}=require('../lib/codec');
test('3.12 water transitions drive native BuffScheme inWater=181 and exit removes it',()=>{
 const w={mapId:2},e={id:34,physics:{x:0,y:0}},ev=[],lake=water.zones.rects.find(r=>r[4]==='north-lake');
 assert.equal(water.SWIMMING_BUFF_ID,181);e.physics={x:lake[0],y:lake[1]};
 assert.equal(water.updateWater(w,e,ev,world.entityEventData),true);
 assert.deepEqual(ev.map(x=>x.eventType),[require('../CLIENT_ENUMS_3127.json').EntityEvent.interactWithWater,require('../CLIENT_ENUMS_3127.json').EntityEvent.buffAdd]);
 assert.equal(entityEvent.interactWithWater.decode(ev[0].data).enterOrExit,true);
 assert.equal(entityEvent.buffAdd.decode(ev[1].data).type,181);
 assert.equal(entityEvent.buffAdd.decode(ev[1].data).duration,-1);
 assert.equal(water.syncWaterState(w,e,ev,world.entityEventData,true),true);
 assert.equal(entityEvent.buffAdd.decode(ev.at(-1).data).type,181);
 e.physics={x:0,y:0};assert.equal(water.updateWater(w,e,ev,world.entityEventData),true);
 assert.equal(entityEvent.buffRemove.decode(ev.at(-1).data).type,181);
 assert.equal(water.syncWaterState(w,e,ev,world.entityEventData),false);
 assert.equal(proto.ReplicateMsg.verify({events:ev}),null);
});
test('each guard uses real 3.12 creature group4 id and monster component; mail remains 422',()=>{
 const npc=city.npcRecords;const guard=npc.filter(x=>x.role==='gate-guard'||x.role==='safezone-guard');
 assert.equal(guard.length,12);for(const r of guard){assert.ok(r.cid>=3001&&r.cid<=3005);assert.equal(r.type,1037);const ent=city.entitiesFor('main',2).find(x=>x.id===r.id);assert.ok(ent);assert.equal(ent.monster.active,true);assert.equal(proto.EntityInfo.verify(ent),null);}
 assert.equal(npc.find(x=>x.role==='mail').cid,422);assert.equal(npc.find(x=>x.role==='warehouse').cid,402);assert.equal(npc.find(x=>x.role==='god-of-war').cid,420);
});
test('all ordinary mobs load at entry while existing boss spawn protocol stays unchanged',()=>{
 const items=env.templates.filter(x=>x.kind==='mob');assert.equal(items.length,289);assert.equal(env.templates.filter(x=>x.kind==='boss').length,4);
 const game={environments:new Map()},state={world:{level:'main',mapId:2,room:'test',entity:{physics:{x:0,y:0}}}};
 const first=env.initialMobs(game,state);assert.equal(first.length,289);
 assert.equal(first.some(x=>env.templates.some(r=>r.kind==='boss'&&r.id===x.id)),false);
 for(const e of first){assert.equal(proto.EntityInfo.verify(e),null);assert.equal(e.monster.active,true);if(e.cid<1300){assert.equal(Object.hasOwn(JSON.parse(e.ud),'prefab_path'),true);}}
 const msg=encode('ReplicateMsg',{events:[world.spawnEvent(first)]});const out=decode('ReplicateMsg',msg);assert.equal(out.events.length,1);
 assert.equal(require('../lib/proto').systemEvent.entityCreated.decode(out.events[0].data).entities.length,289);
});

test('bosses stay identical to verified Stage30 baseline',()=>{
 const crypto=require('node:crypto'),original=require('./fixtures/stage30-boss-baseline.json');
 assert.equal(original.visibilityRadius,4800);
 const boss=r=>({id:r.id,cid:r.cid,type:r.type,kind:r.kind,x:r.x,y:r.y,level:r.level,respawnMs:r.respawnMs,prefab:r.prefab,areaId:r.areaId});
 assert.deepEqual(env.templates.filter(r=>r.kind==='boss').map(boss),original.bosses.map(b=>b.data));
 for(const row of env.templates.filter(r=>r.kind==='boss')){
  const a=env.entity({...row});
  const hash=crypto.createHash('sha256').update(Buffer.from(proto.EntityInfo.encode(a).finish())).digest('hex');
  assert.equal(hash,original.bosses.find(b=>b.data.id===row.id).entityWireSha256);
 }
 const g={environments:new Map()},p={world:{level:'main',mapId:2,room:'test-boss',entity:{physics:{x:0,y:0}}}};
 env.initialMobs(g,p);
 assert.equal([...p.world.environmentSeen.keys()].some(id=>env.templates.some(r=>r.kind==='boss'&&r.id===id)),false);
 const far=env.nearRows(g,p).filter(r=>r.kind==='boss');
 assert.equal(far.every(r=>Math.hypot(r.x,r.y)<=original.visibilityRadius),true);
});
