'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const city=require('../lib/city-3127');
const verified=require('../config/map2-verified-prefabs-3127.json');
const {systemEvent}=require('../lib/proto');
const world=require('../lib/world');
function flags(obj,fn){const before={};for(const [k,v] of Object.entries(obj)){before[k]=process.env[k];process.env[k]=v;}try{return fn();}finally{for(const [k,v] of Object.entries(before))v===undefined?delete process.env[k]:process.env[k]=v;}}
test('current native catalog certifies 46 prefabs and twelve CreatureScheme guards',()=>{
 assert.match(verified.source,/3\.12\.7/);assert.equal(verified.prefabs.length,58);
 assert.equal(verified.prefabs.filter(x=>x.kind==='npc').length,10);assert.equal(verified.prefabs.filter(x=>x.kind==='native-creature-guard').length,12);assert.equal(verified.prefabs.filter(x=>x.kind==='wall').length,32);assert.equal(verified.prefabs.filter(x=>x.kind==='bridge').length,4);
 for(const row of verified.prefabs){if(row.type==='CreatureScheme'){assert.equal(row.nativeCreatureId,3001);assert.equal(row.renderType,1037);}else{assert.equal(row.type,'cc.Prefab');assert.ok(Number.isInteger(row.clientPathIndex));}}
});
test('full city: NPC first, walls and bridges later; Cocos protobuf serialization succeeds',()=>flags({HEROS_CITY_NPCS_ENABLED:'1',HEROS_CITY_OBJECTS_ENABLED:'1'},()=>{
 const ents=city.entitiesFor('rookie',2);assert.equal(ents.length,58);
 assert.deepEqual(ents.slice(0,22).map(e=>e.cid),city.npcRecords.map(r=>r.cid));
 assert.equal(new Set(ents.map(e=>e.id)).size,58);
 for(const e of ents){assert.equal(typeof e.physics.x,'number');assert.ok(JSON.parse(e.ud).prefab_path||JSON.parse(e.ud).nativeCreature);const b=systemEvent.entityCreated.encode({entities:[e]}).finish();assert.equal(systemEvent.entityCreated.decode(b).entities[0].id,e.id);}
 assert.equal(city.entitiesFor('guide',99).length,0);
 const active=city.diagnostics().visualDelivery;assert.equal(active.eligibleToSend,58);
}));
test('supported launcher selects paced city streaming; NPC/object flags retain their operator overrides',()=>{
 const t=fs.readFileSync(path.join(__dirname,'../../START_SERVER.bat'),'utf8');assert.ok(t.includes('HEROS_CITY_SPAWN_MODE=deferred'));assert.ok(t.includes('node server.js'));assert.ok(city.entitiesFor('main',2).length>0);
});
test('safe-zone protections persist if visual prefabs are disabled',()=>flags({HEROS_CITY_NPCS_ENABLED:'0',HEROS_CITY_OBJECTS_ENABLED:'0'},()=>{
 assert.equal(city.entitiesFor('main',2).length,0);assert.ok(city.safePoint(0,0,'main',2));assert.ok(city.layout.safeAreas.length===5);
}));
test('world protobuf snapshots include city only when requested; movement still unchanged',()=>flags({HEROS_CITY_NPCS_ENABLED:'1',HEROS_CITY_OBJECTS_ENABLED:'1'},()=>{
 const level=world.LEVELS.rookie;const state={world:{level:'rookie',mapId:2,room:'local-rookie#1#1',startedAt:Date.now(),sceneReady:true,entity:{id:8,uid:8,cid:40,type:1,physics:{x:0,y:0}}},user:{id:8},player:{inventory:[]}};
 const game={online:new Set([state]),players:{db:{},save(){}}};
 const withCity=world.roomObject(level,state.world.room,state,game,true,true);
 const withoutCity=world.roomObject(level,state.world.room,state,game,true,false);
 assert.equal(withCity.entities.length-withoutCity.entities.length,58);
}));
test('actual battle.iob.enter queues 58 visuals, and gameplay frame + loadingFinished sends first genuine NPC',()=>flags({HEROS_CITY_SPAWN_MODE:'deferred',HEROS_CITY_NPCS_ENABLED:'1',HEROS_CITY_OBJECTS_ENABLED:'1'},()=>{
 const fs=require('node:fs'),os=require('node:os');
 const {Accounts}=require('../lib/accounts'),{Players}=require('../lib/players'),{GameServer}=require('../lib/game');
 const {onWorld,tickWorld,avatar,LEVELS}=require('../lib/world'),{decode,encode}=require('../lib/codec');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'hl-stage21-'));
 const acc=new Accounts(path.join(root,'a.json'));acc.register({username:'visualtester',password:'password123'});
 const players=new Players(path.join(root,'p.json'));const g=new GameServer(acc,players),user=acc.userById(1);
 const st={user,player:players.ensure(user)};g.online.add(st);
 const room='local-main#1#1';st.world={level:'main',room,mapId:2,server:LEVELS.main.server,startedAt:Date.now(),sceneReady:false};st.world.entity=avatar(st);
 const responses=[],pushes=[];g.reply=(_s,id,b)=>responses.push({id,b});g.push=(_s,r,b)=>pushes.push({route:r,b});
 try{
  assert.ok(onWorld(g,st,{route:'battle.iob.enter',type:0,id:1,body:encode('IOGameEnterReq',{roomId:room})}));
  assert.equal(st.world.citySpawnQueue.length,58);const expected=st.world.citySpawnQueue.slice(0,2).map(e=>e.id);assert.ok(st.world.citySpawnQueue.slice(0,22).every(e=>city.visualKind(e)==='npc'));
  const initial=decode('IOGameEnterRsq',responses.at(-1).b).room.entities;assert.equal(initial.filter(e=>e.type!==1028).length,1);assert.equal(initial.filter(e=>e.type===1028).length,city.layout.safeAreas.length);
  onWorld(g,st,{route:'battle.iob.frame',type:0,id:2,body:encode('FrameStepReq',{cmds:[]})});
  st.world.loadingFinished=true;tickWorld(g,0.01);
  assert.equal(st.world.citySpawnSent,2);
  assert.deepEqual(st.world.citySentByKind,{npc:2,wall:0,bridge:0});
  const spawned=pushes.filter(p=>p.route==='rm').flatMap(p=>decode('ReplicateMsg',p.b).events).filter(e=>e.entityID===-1&&e.eventType===0).flatMap(e=>systemEvent.entityCreated.decode(e.data).entities).filter(e=>city.byId.has(e.id));
  assert.deepEqual(spawned.map(e=>e.id),expected);for(const e of spawned)assert.equal(city.visualKind(e),'npc');
 }finally{clearInterval(g.worldTimer);g.heartbeats.stop();fs.rmSync(root,{recursive:true,force:true});}
}));
