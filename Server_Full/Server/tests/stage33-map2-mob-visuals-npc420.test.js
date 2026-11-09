"use strict";
const {test}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const env=require('../lib/environment-3127'),city=require('../lib/city-3127'),world=require('../lib/world');
const {proto}=require('../lib/proto');
const rows=require('../config/schemes/MapProductionScheme.json').MapProduction;
const creatures=new Map(require('../config/schemes/CreatureScheme.json').Creature.map(c=>[c.ID,c]));
const models=require('../config/world-content-3127.json').models;
test('God of War replaces only Officer 412 with native Map6 entrance NPC420; remains at operator position',()=>{
 const g=city.npcRecords.find(x=>x.role==='god-of-war');
 assert.equal(g.id,50026526);assert.equal(g.cid,420);assert.equal(g.type,420);
 assert.equal(g.prefab_path,'arena/npc/420/npc-0');assert.equal(g.x,1300);assert.equal(g.y,-500);
 assert.equal(creatures.get(420).Name,'不死之地入口');
 const entity=city.entitiesFor('main',2).find(e=>e.id===g.id);assert.equal(entity.cid,420);
 assert.equal(JSON.parse(entity.ud).prefab_path,g.prefab_path);
 assert.equal(city.npcRecords.find(x=>x.role==='mail').cid,422);
});
test('each ordinary Map2 creature has prefab_path in first wire snapshot; no other creature changed',()=>{
 const expected=new Set(rows.filter(r=>r.MapID===2 && creatures.get(r.CreatureID)?.TypeGroup===4 && ![1302,1305,1306,1307].includes(r.CreatureID)).map(r=>r.CreatureID));
 assert.equal(expected.size,13);assert.equal(env.templates.filter(x=>x.kind==='mob').length,289);
 const game={environments:new Map()},state={world:{level:'main',mapId:2,room:'stage33',entity:{physics:{x:0,y:0}}}};
 const initial=env.initialMobs(game,state);
 assert.equal(initial.length,289);
 const actual=new Set();
 for(const e of initial){actual.add(e.cid);assert.ok(expected.has(e.cid));const data=JSON.parse(e.ud);
  const cfg=require('../config/schemes/MonsterContent.json').MonsterCfg.find(r=>r.CreatureID===e.cid&&r.Level<=e.property.level&&r.MaxLevel>=e.property.level);assert.equal(data.prefab_path,require('../config/monster-models-3127.json').models[e.cid][cfg.Form],`native form missing for ${e.cid} level ${e.property.level}`);
  assert.equal(e.monster.active,true);assert.equal(proto.EntityInfo.verify(e),null);
 }
 assert.deepEqual([...actual].sort((a,b)=>a-b),[...expected].sort((a,b)=>a-b));
});
test('boss templates and complete wire serialization IDENTICAL to Stage30/Stage32',()=>{
 const fixture=require('./fixtures/stage30-boss-baseline.json');
 assert.equal(env.templates.filter(r=>r.kind==='boss').length,fixture.bosses.length);
 for(const b of fixture.bosses){const row=env.templates.find(r=>r.id===b.data.id);
  assert.deepEqual({id:row.id,cid:row.cid,type:row.type,kind:row.kind,x:row.x,y:row.y,level:row.level,respawnMs:row.respawnMs,prefab:row.prefab,areaId:row.areaId},b.data);
  const result=crypto.createHash('sha256').update(Buffer.from(proto.EntityInfo.encode(env.entity({...row})).finish())).digest('hex');
  assert.equal(result,b.entityWireSha256,`boss modified ${row.cid}`);
 }
});
