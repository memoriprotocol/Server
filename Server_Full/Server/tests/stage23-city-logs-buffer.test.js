'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const path=require('node:path');
const city=require('../lib/city-3127');
const world=require('../lib/world');

function withFlags(values,run){const old={};for(const [k,v] of Object.entries(values)){old[k]=process.env[k];process.env[k]=v;}try{return run();}finally{for(const [k,v] of Object.entries(old))old[k]===undefined?delete process.env[k]:process.env[k]=old[k];}}

test('protobuf bytes decoder accepts empty binary command under --throw-deprecation',()=>{
 const child=spawnSync(process.execPath,['--throw-deprecation','-e',`
 const {encode,decode}=require('./lib/codec');
 const input=encode('FrameStepReq',{cmds:[{type:48,data:Buffer.alloc(0)}]});
 const decoded=decode('FrameStepReq',input);
 if(decoded.cmds.length!==1||decoded.cmds[0].data.length!==0)process.exit(2);
 const populated=encode('FrameStepReq',{cmds:[{type:48,data:Buffer.from([1,2,3])}]});
 if(decode('FrameStepReq',populated).cmds[0].data.length!==3)process.exit(3);
 `],{cwd:path.resolve(__dirname,'..'),encoding:'utf8'});
 assert.equal(child.status,0,child.stderr);
 assert.doesNotMatch(child.stderr,/DEP0005|DeprecationWarning/);
});

test('Map2 runtime visual catalogue counts 22 NPC/guards, 32 fences and four bridges',()=>withFlags({HEROS_CITY_NPCS_ENABLED:'1',HEROS_CITY_OBJECTS_ENABLED:'1'},()=>{
 const counted=city.visualCounts(city.entitiesFor('main',2));
 assert.deepEqual(counted,{npc:22,wall:32,bridge:4,other:0,total:58});
 assert.deepEqual(city.visualCounts(city.entitiesFor('guide',99)),{npc:0,wall:0,bridge:0,other:0,total:0});
}));

test('world counters distinguish catalogued, transmitted and Cocos-rendered (unknown)',()=>{
 const w={mapId:2,citySpawnPlanned:{npc:27,wall:8,bridge:4,other:0,total:39},citySpawnQueue:[1,2,3],citySpawnSent:36,citySentByKind:{npc:27,wall:7,bridge:2},cityFrameSeq:12,cityLastSendFrame:11,clientFrameSeen:true};
 const d=world.cityWorldStats(w);
 assert.equal(d.configured.npc,27);
 assert.equal(d.sent.total,36);
 assert.equal(d.pending,3);
 assert.equal(d.framesAfterLastSend,1);
 assert.equal(d.clientRendered,'UNVERIFIED_NO_CLIENT_RENDER_ACK');
 const lines=[];const old=console.info;
 try{console.info=(x)=>lines.push(x);world.logCityWorld(w,2,'diagnostic');}finally{console.info=old;}
 assert.match(lines[0],/npc=27/);
 assert.match(lines[0],/transmitted=36/);
 assert.match(lines[0],/remaining=3/);
 assert.match(lines[0],/render=UNVERIFIED/);
});
