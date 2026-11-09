'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const placement=require('../lib/placement-3127'),env=require('../lib/environment-3127');
test('all trees and wells have dry footprints outside boss arenas and protected city',()=>{
 const rows=env.templates,placed=[];
 for(const row of rows){if(['tree','well'].includes(row.kind))assert.ok(placement.valid(row.kind,row.x,row.y,placed),JSON.stringify(row));placed.push(row);}
 assert.equal(rows.filter(r=>r.kind==='tree').length,160);
 assert.equal(rows.filter(r=>r.kind==='well').length,24);
});
test('well spacing is enforced for every pair; room creation and respawn homes use corrected positions',()=>{
 const g={},room=env.room(g,'placement'),wells=[...room.rows.values()].filter(r=>r.kind==='well');
 for(let i=0;i<wells.length;i++)for(let j=0;j<i;j++)assert.ok(Math.hypot(wells[i].x-wells[j].x,wells[i].y-wells[j].y)>=placement.policy.wellMinDistance);
 for(const r of room.rows.values()){assert.equal(r.homeX,r.x);assert.equal(r.homeY,r.y);assert.equal(r.entity.physics.x,r.x);assert.equal(r.entity.physics.y,r.y);}
});
test('full water footprint is checked even when center is dry',()=>{
 const water=require('../lib/water-3127');
 const r=water.zones.rects.find(r=>r[2]>100&&r[3]>100),x=r[0]+r[2]/2+10,y=r[1];
 assert.ok(placement.overlapsWater(x,y,180));
 assert.equal(placement.valid('tree',x,y),false);
});
test('boss spawn polygons and their edges exclude trees and wells',()=>{
 for(const poly of placement.bossAreas){const x=poly.reduce((n,p)=>n+p[0],0)/poly.length,y=poly.reduce((n,p)=>n+p[1],0)/poly.length;
  assert.ok(placement.inBossArena(x,y));assert.equal(placement.valid('well',x,y),false);
  assert.ok(placement.inBossArena(poly[0][0],poly[0][1],180));
 }
});
test('entire client-exported mine arena bounds are clear including corners far from the spawn',()=>{
 assert.ok(placement.arenaFootprints.length);
 for(const r of placement.arenaFootprints)for(const dx of [-1,0,1])for(const dy of [-1,0,1]){
  const x=r.x+dx*r.w/2,y=r.y+dy*r.h/2;
  assert.ok(placement.inBossArena(x,y,180));assert.equal(placement.valid('tree',x,y),false);
 }
});
