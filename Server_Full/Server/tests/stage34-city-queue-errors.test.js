'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const env=require('../lib/environment-3127'),city=require('../lib/city-3127'),world=require('../lib/world');
const decor=require('../config/map2-city-objects-3127.json');
const {proto}=require('../lib/proto');

test('Stage36 removes all Stage34/35 temporary props while preserving original city structures',()=>{
 const native=require('../config/map2-verified-prefabs-3127.json').prefabs;
 assert.equal(decor.enabled,false);
 assert.equal(decor.objects.length,0);
 assert.equal(city.decorRecords.length,0);
 assert.equal(city.townRecords.length,36);
 assert.equal(native.filter(e=>e.kind==='decor').length,0);
 const all=city.entitiesFor('main',2);
 assert.equal(all.filter(e=>e.id>=50027001&&e.id<=50027040).length,0);
 assert.equal(all.filter(e=>e.id>=50026001&&e.id<=50026044).length,36);
 for(const e of all)assert.equal(proto.EntityInfo.verify(e),null);
});

test('initial mob-only entry packet is near bounded; has 3.12 creature metadata',()=>{
 const game={environments:new Map()};const state={world:{level:'main',room:'stage34a',mapId:2,entity:{physics:{x:0,y:0}}}};
 const first=env.initialMobs(game,state,1850,8);
 assert.ok(first.length<=8);assert.equal(first.filter(e=>e.monster?.active).length,first.length);
 assert.ok(state.world.environmentSeen.size<=8);
 for(const e of first){assert.deepEqual(e.pet,{pets:[]});assert.equal(e.tame?.ownerName,'');const roundTrip=proto.EntityInfo.decode(proto.EntityInfo.encode(e).finish());assert.equal(roundTrip.tame?.ownerName,'');assert.ok(e.miscInfo?.name);assert.deepEqual(e.buffer,{buffs:[]});assert.equal(proto.EntityInfo.verify(e),null);}
});

test('boss prefab bytes remain identical to Stage30 baseline',()=>{
 const fixture=require('./fixtures/stage30-boss-baseline.json');
 for(const b of fixture.bosses){const row=env.templates.find(r=>r.id===b.data.id);const h=crypto.createHash('sha256').update(Buffer.from(proto.EntityInfo.encode(env.entity({...row})).finish())).digest('hex');assert.equal(h,b.entityWireSha256);}
});

test('guard CID 3001..3005 remains unchanged and loaded into eligible city list',()=>{
 const guards=city.npcRecords.filter(r=>['gate-guard','safezone-guard'].includes(r.role));
 assert.equal(guards.length,12);
 assert.equal(guards.filter(x=>x.role==='gate-guard').length,8);
 assert.equal(guards.filter(x=>x.role==='safezone-guard').length,4);
 const eligible=city.entitiesFor('main',2);for(const g of guards){const e=eligible.find(e=>e.id===g.id);assert.ok(e,`guard missing ${g.name}`);assert.equal(e.cid,g.cid);assert.ok(e.buffer);assert.equal(e.tame?.ownerName,'');assert.equal(proto.EntityInfo.verify(e),null);}
});
