'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {Accounts}=require('../lib/accounts'),{Players}=require('../lib/players'),{GameServer}=require('../lib/game');
const world=require('../lib/world'),life=require('../lib/life-3127'),environment=require('../lib/environment-3127');
const {encode,decode}=require('../lib/codec'),{pbFields}=require('../lib/wire');
const {CommandType}=require('../CLIENT_ENUMS_3127.json');
function harness(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hl83-'));
 const accounts=new Accounts(path.join(dir,'account.json'));assert.equal(accounts.register({username:'stage83test',password:'password123'}).ok,true);
 const players=new Players(path.join(dir,'players.json')),game=new GameServer(accounts,players),user=accounts.userById(1);
 const state={user,player:players.ensure(user)};game.online.add(state);
 const replies=[],pushes=[];game.reply=(_s,id,b)=>replies.push({id,body:b});game.push=(_s,route,b)=>pushes.push({route,body:b});
 t.after(()=>{clearInterval(game.worldTimer);game.heartbeats.stop();fs.rmSync(dir,{recursive:true,force:true});});
 function request(route,type,data,kind=0){const body=type?encode(type,data):Buffer.alloc(0),m={route,type:kind,id:replies.length+1,body};assert.equal(world.onWorld(game,state,m,pbFields(body)),true);return replies.at(-1);}
 function enter(){const chosen=request('game.gameHandler.enterBattle','IOGameLoginReq',{id:'battle-local-main'});assert.equal(decode('IOGameLoginRsp',chosen.body).code,0);
  const r=request('battle.iob.enter','IOGameEnterReq',{roomId:state.world.room});const result=decode('IOGameEnterRsq',r.body);assert.equal(result.code,0);assert.ok(result.room.entities.some(e=>e.id===user.id&&e.type===1),'local actor in room snapshot');return result;}
 function load(){const response=request('battle.iob.frame','FrameStepReq',{cmds:[{type:CommandType.loginLoadingFinish,data:Buffer.alloc(0)}]});assert.equal(decode('FrameStepResp',response.body).code,0);assert.equal(state.world.loadingFinished,true);}
 return {dir,game,user,players,state,pushes,replies,request,enter,load};
}
function seeMonster(f){
 const record=environment.records(f.game,f.state).find(r=>r.kind==='mob'&&!r.dead);
 assert.ok(record);
 f.state.world.entity.physics.x=record.x+50;f.state.world.entity.physics.y=record.y+50;
 f.state.world.motion.x=record.x+50;f.state.world.motion.y=record.y+50;
 f.state.world.environmentSeen=new Map();
 environment.syncView(f.game,f.state);
 assert.equal(f.state.world.environmentSeen.has(record.id),true,'fresh session receives native monsters');
 assert.ok(f.pushes.filter(x=>x.route==='rm').flatMap(x=>decode('ReplicateMsg',x.body).events).some(e=>e.entityID===-1),'entity-created packets available');
}
test('death -> client exitBattle -> restart notification -> mainHall -> fresh Play creates actor, monsters and clean session',t=>{
 const f=harness(t);f.enter();f.load();const oldWorld=f.state.world;
 seeMonster(f);const h=f.state.player.heroId;
 life.die(f.game,f.state,{cid:1305,x:0,y:0});assert.ok(f.state.player.pendingDeath);assert.equal(f.state.world.dead,true);
 const beforePush=f.pushes.length;
 const exited=f.request('game.gameHandler.exitBattle','IOGameLogoutReq',{});
 assert.equal(decode('IOGameLogoutRsp',exited.body).code,0);
 assert.equal(f.state.world,null);assert.equal(f.state.player.pendingDeath,null);assert.equal(f.state.player.battleStats,null);
 assert.equal(f.state.player.lastWorld,null);assert.equal(f.state.player.lastRoom,'');
 assert.equal(f.pushes.slice(beforePush).filter(p=>p.route==='toMain').length,0,'original 2024 client handles its own scene release');
 const n=f.replies.length;f.request('game.gameHandler.onPlayerRestartGame',null,null,1);
 assert.equal(f.replies.length,n,'native restart is notification, not a request');
 assert.equal(f.pushes.slice(beforePush).filter(p=>p.route==='toMain').length,0);
 f.enter();assert.notStrictEqual(f.state.world,oldWorld);assert.equal(f.state.world.dead,false);
 assert.equal(f.state.world.entity.property.HP>0,true);assert.equal(f.state.world.entity.miscInfo.life>0,true);
 assert.equal(f.state.world.sceneReady,true);assert.equal(f.state.world.clientFrameSeen,false);
 assert.equal(f.state.world.environmentSeen.size>=0,true);
 f.load();seeMonster(f);
 assert.equal(f.state.player.heroId,h);
});
test('onPlayerRestartGame without preceding exitBattle tears down the old battle once',t=>{
 const f=harness(t);f.enter();f.load();f.state.player.battleStats.xpEarned=10000;
 f.request('game.gameHandler.onPlayerRestartGame',null,null,1);
 assert.equal(f.state.world,null);assert.equal(f.state.player.battleStats,null);
 assert.equal(f.state.player.lastWorld,null);
 assert.equal(f.pushes.some(p=>p.route==='toMain'),false);
 const coin=f.state.player.coin,title=f.state.player.titleExp;
 f.request('game.gameHandler.exitBattle','IOGameLogoutReq',{});
 assert.equal(f.state.player.coin,coin);assert.equal(f.state.player.titleExp,title,'late exit cannot double-pay');
 f.request('game.gameHandler.onPlayerRestartGame',null,null,1);
 f.enter();f.load();assert.equal(f.state.world.dead,false);seeMonster(f);
});
test('client-driven leave and server-driven tutorial skip differ: guide retains toMain, battle does not',t=>{
 const f=harness(t);f.enter();f.request('game.gameHandler.exitBattle','IOGameLogoutReq',{});
 assert.equal(f.pushes.some(p=>p.route==='toMain'),false);
 f.request('game.gameHandler.enterGuide','IOGameLoginReq',{id:'local-tutorial'});
 f.request('battle.iob.enter','IOGameEnterReq',{roomId:f.state.world.room});
 world.detachWorld(f.game,f.state);
 // Explicit local skip via frame still needs a native push in the real guide flow.
 f.request('game.gameHandler.enterGuide','IOGameLoginReq',{id:'local-tutorial'});
 f.request('battle.iob.enter','IOGameEnterReq',{roomId:f.state.world.room});
 f.request('battle.iob.frame','FrameStepReq',{cmds:[{type:CommandType.exitGuide,data:Buffer.alloc(0)}]});
 assert.ok(f.pushes.some(p=>p.route==='toMain'));
});
test('restart followed by reconnect starts from a fresh server-side session with no death replay',t=>{
 const f=harness(t);f.enter();f.load();life.die(f.game,f.state,{cid:1305});
 f.request('game.gameHandler.onPlayerRestartGame',null,null,1);
 const snapshot=new Players(f.players.file).db[f.user.id];assert.equal(snapshot.pendingDeath,null);assert.equal(snapshot.lastWorld,null);
 const state={user:f.user,player:snapshot};f.game.online.delete(f.state);f.game.online.add(state);
 // For the second WebSocket use the durable player record as if login called players.ensure.
 const fake={...f,state};const body=encode('IOGameLoginReq',{id:'battle-local-main'});
 const sent=[];f.game.reply=(_s,id,b)=>sent.push(b);
 assert.equal(world.onWorld(f.game,state,{route:'game.gameHandler.enterBattle',type:0,id:1,body},pbFields(body)),true);
 assert.equal(decode('IOGameLoginRsp',sent.at(-1)).code,0);
 const enter=encode('IOGameEnterReq',{roomId:state.world.room});assert.equal(world.onWorld(f.game,state,{route:'battle.iob.enter',type:0,id:2,body:enter},pbFields(enter)),true);
 const result=decode('IOGameEnterRsq',sent.at(-1));assert.ok(result.room.entities.some(e=>e.id===f.user.id));
 assert.equal(state.world.dead,false);assert.equal(state.world.sceneReady,true);
 assert.equal(state.player.pendingDeath,null);
});
test('hero passive VFX/buff sync after fresh battle targets the new actor, never stale dead scene',t=>{
 const f=harness(t);f.enter();f.load();
 const original=f.state.world.entity;original.miscInfo.heroId=12;original.miscInfo.heroStar=1;original.property.level=10;
 const passives=require('../lib/hero-init-passives-3127');const events=[];
 assert.equal(passives.sync(f.state,Date.now(),events,world.entityEventData),true);
 assert.ok(original.buffer.buffs.some(b=>b.type===752),'Ninja native passive is present before death');
 life.die(f.game,f.state,{cid:1305});f.request('game.gameHandler.exitBattle','IOGameLogoutReq',{});
 f.request('game.gameHandler.onPlayerRestartGame',null,null,1);
 f.enter();f.load();const next=f.state.world.entity;
 assert.notStrictEqual(next,original);
 next.miscInfo.heroId=12;next.miscInfo.heroStar=1;next.property.level=10;
 const fresh=[];assert.equal(passives.sync(f.state,Date.now(),fresh,world.entityEventData),true);
 assert.ok(fresh.some(e=>e.entityID===next.id&&e.eventType===require('../CLIENT_ENUMS_3127.json').EntityEvent.buffAdd));
 assert.ok(next.buffer.buffs.some(b=>b.type===752));
 assert.notStrictEqual(f.state.world.heroInitPassives.actor,original);
});
test('restart notifications are idempotent even when the client sends them repeatedly after hall entry',t=>{
 const f=harness(t);f.enter();f.load();f.request('game.gameHandler.exitBattle','IOGameLogoutReq',{});
 const before=f.pushes.length,coin=f.state.player.coin;
 for(let i=0;i<4;i++)f.request('game.gameHandler.onPlayerRestartGame',null,null,1);
 assert.equal(f.state.world,null);assert.equal(f.pushes.length,before);
 assert.equal(f.state.player.coin,coin);
 f.enter();f.load();assert.ok(f.state.world.entity.property.HP>0);seeMonster(f);
});
