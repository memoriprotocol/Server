'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const city=require('../lib/city-3127'),geometry=require('../lib/geometry-3127');
const roster=require('../config/map2-native-npcs-3127.json');
const {encode,decode}=require('../lib/codec');
const {step,createMotion,start,rotate}=require('../lib/motion-3127');
const z=city.layout.safeAreas[0],cx=(z.minX+z.maxX)/2,cy=(z.minY+z.maxY)/2;
test('Map2 city has 32 fences, four bridges, and 22 operator NPC placements',()=>{
 const counts=city.visualCounts(city.entitiesFor('main',2));assert.equal(counts.wall,32);assert.equal(counts.bridge,4);assert.equal(counts.npc,22);
 assert.deepEqual(roster.npcs.slice(0,6).map(x=>x.cid),[408,425,423,424,414,415]);
 assert.equal(city.entitiesFor('guide',99).length,0);
 for(const r of city.townRecords){assert.equal(r.angle,0);assert.doesNotMatch(r.prefab_path,/map10/);}
 for(const b of city.townRecords.filter(r=>r.placementKind==='bridge'))assert.match(b.prefab_path,/安全区护城河\/LD_hchq_(001|002-2)$/);
});
test('fence collision intervals leave each gate free of the two intruding prefabs',()=>{
 for(const side of ['north','south','east','west']){
  const h=side==='north'||side==='south',rows=city.townRecords.filter(r=>r.side===side&&r.placementKind==='wall');
  assert.equal(rows.length,8);
  const spans=rows.map(r=>{assert.equal(h?r.y:r.x,side==='north'?z.maxY:side==='south'?z.minY:side==='west'?z.minX:z.maxX);const value=h?r.x:r.y,span=r.colliderSize[h?0:1];return [value-span/2,value+span/2]}).sort((a,b)=>a[0]-b[0]);
  const lo=h?z.minX:z.minY,hi=h?z.maxX:z.maxY,center=h?cx:cy,gap=h?city.layout.manualLayout.horizontalGateWidth:city.layout.manualLayout.verticalGateWidth;
  assert.ok(Math.abs(spans[0][0]-lo)<0.001);assert.ok(Math.abs(spans.at(-1)[1]-hi)<0.001);
  for(let i=1;i<spans.length;i++){if(i===4){assert.ok(spans[i-1][1]<center-gap/2);assert.ok(spans[i][0]>center+gap/2);}else assert.ok(Math.abs(spans[i][0]-spans[i-1][1])<0.001,'no unintended fence gap');}
 }
});
test('all four gate centers are open while adjacent fence sections stop swept player motion',()=>{
 const obstacles=city.collidersFor('main',2);
 for(const [x,y,angle]of [[cx,z.maxY-250,90],[cx,z.minY+250,270],[z.minX+250,cy,180],[z.maxX-250,cy,0]]){
  const m=createMotion({physics:{x,y}});start(m,true,100);rotate(m,angle);
  for(let i=0;i<10;i++)step(m,2,0.1,750,obstacles);
  assert.ok(Math.hypot(m.x-x,m.y-y)>700,'gate traversable');
 }
 const m=createMotion({physics:{x:z.minX+390,y:z.maxY-250}});start(m,true,100);rotate(m,90);
 for(let i=0;i<10;i++)step(m,2,0.1,750,obstacles);
 assert.ok(m.y<z.maxY,'fence blocks movement');
});
test('bridges line up with their gate axes and span the native moat bank estimates',()=>{
 for(const b of city.townRecords.filter(x=>x.placementKind==='bridge')){
  if(['north','south'].includes(b.side)){assert.ok(Math.abs(b.x-cx)<0.001);assert.equal(b.prefab_path.split('/').at(-1),'LD_hchq_001');assert.ok(b.walkSize[1]>1000);}
  else{assert.ok(Math.abs(b.y-cy)<0.001);assert.equal(b.prefab_path.split('/').at(-1),'LD_hchq_002-2');assert.ok(b.walkSize[0]>1000);}
  assert.equal(city.overlapsStatic(b.x,b.y,75),false);
 }
});
test('city records survive native entity replication; NPC ring stays on land inside the moat',()=>{
 const entities=city.entitiesFor('main',2);
 const {spawnEvent}=require('../lib/world'),{proto,systemEvent}=require('../lib/proto');
 const decoded=decode('ReplicateMsg',encode('ReplicateMsg',{events:[spawnEvent(entities)]}));
 const roundTrip=systemEvent.entityCreated.decode(decoded.events[0].data).entities;
 assert.equal(roundTrip.length,58);
 for(const e of entities)assert.equal(proto.EntityInfo.verify(e),null);
 for(let i=0;i<entities.length;i++){assert.equal(roundTrip[i].id.toString(),String(entities[i].id));assert.equal(JSON.parse(roundTrip[i].ud).prefab_path,JSON.parse(entities[i].ud).prefab_path);}
 for(const r of city.npcRecords){assert.equal(city.safePoint(r.x,r.y),true);assert.equal(city.overlapsStatic(r.x,r.y,1),true);}
});
