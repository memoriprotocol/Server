'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const city=require('../lib/city-3127');
const geometry=require('../lib/geometry-3127');
const actions=require('../lib/actions-3127');
const zone=city.layout.safeAreas[0],centerX=(zone.minX+zone.maxX)/2,centerY=(zone.minY+zone.maxY)/2;
function subject(x,y){return {user:{id:1},player:{},world:{level:'main',mapId:2,room:'local-main#1#1',entity:{id:1,physics:{x,y,rotation:0},physics2:{angle:0},property:{HP:800},equip:{currentItemID:601000}}}};}
function ownerRecord(state,x,y,ownerId=2){return {id:22110000,room:state.world.room,ownerId,ownerName:'another',buildID:312,x,y,hp:200,maxHp:200};}
function fakeGame(buildings){return {online:new Set([{world:{room:buildings[0]?.room,structures:buildings}}]),players:{db:{other:{structures:[]}},save(){}}};}

test('original 5 safe rectangles are active on Map2 and never on guide map',()=>{
 assert.equal(city.layout.safeAreas.length,5);
 for(const z of city.layout.safeAreas){const x=(z.minX+z.maxX)/2,y=(z.minY+z.maxY)/2;assert.equal(city.safePoint(x,y,'main',2),true);assert.equal(city.safePoint(x,y,'rookie',2),true);assert.equal(city.safePoint(x,y,'guide',99),false);assert.equal(city.safeAreaAt(x,y,'main',2)?.id,z.id);}
});
test('a building footprint touching a safe zone boundary is rejected even when its center is outside',()=>{
 const e={shape:'rect',x:zone.maxX+80,y:centerY,halfW:130,halfH:100};
 assert.equal(city.safePoint(e.x,e.y),false);
 assert.equal(city.safeOverlapCollider(e),true);
 assert.equal(city.safeOverlapCollider({...e,x:zone.maxX+150}),false);
 assert.equal(city.safeOverlapCollider(e,'guide',99),false);
});
test('safe zone prevents attacking protected buildings and attacks fired from city at outsiders',()=>{
 let st=subject(centerX,centerY),b=ownerRecord(st,zone.maxX+200,centerY),g=fakeGame([b]);
 assert.equal(actions.resolveTargets(g,st,null,{maxDistance:1000},0).length,0,'cannot shoot out of safety');
 st=subject(zone.maxX+500,centerY);b=ownerRecord(st,zone.maxX-100,centerY);g=fakeGame([b]);
 assert.equal(actions.resolveTargets(g,st,null,{maxDistance:1000},180).length,0,'cannot shoot into safety');
 const bOutside=ownerRecord(st,zone.maxX+600,centerY);g=fakeGame([bOutside]);
 assert.equal(actions.resolveTargets(g,st,null,{maxDistance:1000},0).length,1,'ordinary combat outside safety remains');
});
test('current fence segments block walls while all four configured gates remain traversable',()=>{
 assert.equal(city.collidersFor('main',2).length,32);
 const b=city.collidersFor('main',2);
 for(const [x,y] of [[centerX,zone.maxY],[centerX,zone.minY],[zone.minX,centerY],[zone.maxX,centerY]]){
  assert.equal(city.overlapsStatic(x,y,75),false,'cardinal gate '+x+','+y);
 }
 for(const [x,y] of [[zone.minX+400,zone.maxY],[zone.maxX-400,zone.maxY],[zone.minX,zone.minY+400],[zone.maxX,zone.maxY-400]]){
  assert.equal(city.overlapsStatic(x,y,75),true,'solid wall at '+x+','+y);
 }
 assert.equal(geometry.firstCollision(centerX,zone.maxY-500,centerX,zone.maxY+500,b),null,'no collision through north gate');
 assert.notEqual(geometry.firstCollision(zone.minX+300,zone.maxY-500,zone.minX+300,zone.maxY+500,b),null,'collision into north wall');
});
test('safezones remain active even when city prefabs are disabled to avoid Cocos crash',()=>{
 const prev=process.env.HEROS_CITY_OBJECTS_ENABLED,prevNpc=process.env.HEROS_CITY_NPCS_ENABLED;
 try{process.env.HEROS_CITY_OBJECTS_ENABLED='0';process.env.HEROS_CITY_NPCS_ENABLED='0';assert.equal(city.entitiesFor('main',2).length,0);assert.equal(city.safePoint(centerX,centerY),true);}
 finally{if(prev===undefined)delete process.env.HEROS_CITY_OBJECTS_ENABLED;else process.env.HEROS_CITY_OBJECTS_ENABLED=prev;prevNpc===undefined?delete process.env.HEROS_CITY_NPCS_ENABLED:process.env.HEROS_CITY_NPCS_ENABLED=prevNpc;}
});

test('actual build validation rejects a native safe zone even with enough materials',()=>{
 const x=zone.maxX+25,y=centerY;
 const st=subject(x+400,y);st.player.inventory=[{uuid:'wood',itemCfgId:5,num:500,bagType:8,bagPos:0,extInfo:{}}];
 const g=fakeGame([]);
 // Build 312 has a 100-unit radius; its center is outside but its footprint crosses the line.
 const result=actions.validateBuild(g,st,{buildID:312,x,y});
 assert.equal(result.status,'town-safe-zone');
});
test('attack resolution never subtracts HP inside a safe zone, including structures',()=>{
 const st=subject(centerX,centerY),record=ownerRecord(st,centerX+150,centerY),g=fakeGame([record]);
 const before=record.hp;
 const attack=actions.attack(g,st,{aimAngle:0});
 assert.equal(attack.allowed,false);
 assert.deepEqual(attack.hits,[]);
 assert.equal(record.hp,before);
});
test('experimental PvP remains forbidden across boundaries of any of the five zones',()=>{
 const prev=process.env.HEROS_EXPERIMENTAL_PVP;process.env.HEROS_EXPERIMENTAL_PVP='1';
 try{
  const st=subject(zone.maxX+350,centerY),victim=subject(zone.maxX-100,centerY);
  victim.user.id=2;victim.world.entity.id=2;victim.world.sceneReady=true;
  const g=fakeGame([]);g.online=new Set([st,victim]);
  assert.equal(actions.resolveTargets(g,st,null,{maxDistance:1000},180).length,0);
 }finally{if(prev===undefined)delete process.env.HEROS_EXPERIMENTAL_PVP;else process.env.HEROS_EXPERIMENTAL_PVP=prev;}
});
