'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http');
const {GameServer}=require('../lib/game'),{Players}=require('../lib/players'),{Accounts}=require('../lib/accounts');
const {encode,decode}=require('../lib/codec'),{commands}=require('../lib/proto');
const {PKG,packageEncode,packages,parseMessage,varint}=require('../lib/wire');
async function connect(port){
 const ws=new WebSocket('ws://127.0.0.1:'+port);ws.binaryType='arraybuffer';
 const queue=[],waiting=[];let id=0;const push=packet=>{const index=waiting.findIndex(x=>x.predicate(packet));if(index<0)queue.push(packet);else{const [w]=waiting.splice(index,1);clearTimeout(w.timer);w.resolve(packet);}};
 ws.onmessage=e=>{const [list]=packages(Buffer.from(e.data));for(const p of list)push(p.type===PKG.DATA?{...p,message:parseMessage(p.body)}:p);};
 const wait=predicate=>{const index=queue.findIndex(predicate);if(index>=0)return Promise.resolve(queue.splice(index,1)[0]);return new Promise((resolve,reject)=>{const waiter={predicate,resolve,timer:setTimeout(()=>{waiting.splice(waiting.indexOf(waiter),1);reject(Error('WS response timeout'));},3000)};waiting.push(waiter);});};
 await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
 ws.send(packageEncode(PKG.HANDSHAKE,Buffer.from('{}')));await wait(p=>p.type===PKG.HANDSHAKE);ws.send(packageEncode(PKG.HANDSHAKE_ACK));
 return {ws,wait,async request(route,type,data){const requestId=++id,r=Buffer.from(route);const body=Buffer.concat([Buffer.from([0]),varint(requestId),Buffer.from([r.length]),r,encode(type,data)]);ws.send(packageEncode(PKG.DATA,body));return (await wait(p=>p.message?.type===2&&p.message.id===requestId)).message.body;}};
}
test('real WebSocket login -> client-filtered lobby -> scene -> item frame -> reconnect snapshot',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'world-ws7-')),accounts=new Accounts(path.join(dir,'a.json')),players=new Players(path.join(dir,'p.json'));
 accounts.register({username:'networker',password:'password123'});const token=accounts.login({username:'networker',password:'password123'}).token;
 const user=accounts.userById(1),player=players.ensure(user);player.inventory=[{uuid:'network-item',itemCfgId:5,num:6,bagType:8,bagPos:0,extInfo:{}}];players.save();
 const game=new GameServer(accounts,players),server=http.createServer();game.attach(server);await new Promise(r=>server.listen(0,'127.0.0.1',r));const clients=[];
 try{
  const c=await connect(server.address().port);clients.push(c);
  assert.equal(decode('LoginResp',await c.request('connector.entryHandler.login','LoginReq',{token})).code,0);
  const list=decode('ServersRsp',await c.request('game.gameHandler.getServers','ServersReq',{}));const main=list.battles.filter(x=>x.id.startsWith('battle')).find(x=>x.mode===0);assert.ok(main);
  const login=decode('IOGameLoginRsp',await c.request('game.gameHandler.enterBattle','IOGameLoginReq',{id:main.id,roomId:main.roomId,player:{uid:999}}));assert.equal(login.room.mapId,2);
  const snapshot=decode('IOGameEnterRsq',await c.request('battle.iob.enter','IOGameEnterReq',{roomId:main.roomId,uid:999}));assert.equal(snapshot.room.entities[0].uid,1);
  // Stage63: resources are gathered during this run, not imported from the previous one.
  require('../lib/inventory').grantItems(game,player,5,6);player.inventory.find(i=>i.itemCfgId===5).uuid='network-item';players.save();[...game.online].find(s=>s.user?.id===1).world.entity.item.items=require('../lib/inventory').inventoryOf([...game.online].find(s=>s.user?.id===1));
  const reply=decode('FrameStepResp',await c.request('battle.iob.frame','FrameStepReq',{sender:999,cmds:[{type:47,data:Buffer.from(commands.CommandDropItem.encode({bagType:8,uuid:'network-item',num:2}).finish())}]}));assert.equal(reply.code,0);
  const again=decode('IOGameEnterRsq',await c.request('battle.iob.reEnter','IOGameEnterReq',{roomId:main.roomId}));assert.equal(again.room.entities.filter(x=>x.type===100).length,1);assert.equal(again.room.entities.find(x=>x.type===1).item.items[0].num,4);
  const replacement=await connect(server.address().port);clients.push(replacement);const close=new Promise(r=>c.ws.addEventListener('close',r,{once:true}));await replacement.request('connector.entryHandler.login','LoginReq',{token});await close;assert.equal([...game.online].filter(s=>s.user?.id===1).length,1);
  await replacement.request('game.gameHandler.enterBattle','IOGameLoginReq',{id:main.id,roomId:main.roomId});const restored=decode('IOGameEnterRsq',await replacement.request('battle.iob.enter','IOGameEnterReq',{roomId:main.roomId}));assert.equal(restored.room.entities.filter(x=>x.type===100).length,1);
 }finally{for(const c of clients)c.ws.close();await new Promise(r=>server.close(r));clearInterval(game.worldTimer);game.heartbeats.stop();fs.rmSync(dir,{recursive:true,force:true});}
});
test('Stage41 real WebSocket carries critical numbers, private death settlement and native relive',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'world-ws41-')),accounts=new Accounts(path.join(dir,'a.json')),players=new Players(path.join(dir,'p.json'));
 accounts.register({username:'networkcrit',password:'password123'});const token=accounts.login({username:'networkcrit',password:'password123'}).token;players.ensure(accounts.userById(1));
 const game=new GameServer(accounts,players),server=http.createServer();clearInterval(game.worldTimer);game.attach(server);await new Promise(r=>server.listen(0,'127.0.0.1',r));let c;
 const env=require('../lib/environment-3127'),world=require('../lib/world'),fx=require('../lib/monster-effects-3127'),{entityEvent}=require('../lib/proto'),E=require('../CLIENT_ENUMS_3127.json').EntityEvent;
 const includes=(packet,name)=>packet.message?.route==='rm'&&decode('ReplicateMsg',packet.message.body).events.some(e=>e.entityID!==-1&&e.eventType===E[name]);
 try{
  c=await connect(server.address().port);await c.request('connector.entryHandler.login','LoginReq',{token});await c.request('game.gameHandler.enterBattle','IOGameLoginReq',{id:'battle-local-main'});await c.request('battle.iob.enter','IOGameEnterReq',{});
  await c.request('battle.iob.frame','FrameStepReq',{cmds:[{type:require('../CLIENT_ENUMS_3127.json').CommandType.loginLoadingFinish,data:Buffer.alloc(0)}]});
  const state=[...game.online].find(s=>s.user?.id===1),runtime=game.environments.get(state.world.room),r=[...runtime.rows.values()].find(r=>r.kind==='mob'&&r.cid===1210);
  state.world.entity.physics.x=r.x+100;state.world.entity.physics.y=r.y;state.world.motion.x=r.x+100;state.world.motion.y=r.y;state.world.motion.angle=180;
  Object.assign(state.world.entity.property.property,{crit:100,critHarm:150,attack:10000});env.syncView(game,state);assert.ok(state.world.environmentSeen.has(r.id));const hp=r.hp;
  const attack=decode('FrameStepResp',await c.request('battle.iob.frame','FrameStepReq',{cmds:[{type:require('../CLIENT_ENUMS_3127.json').CommandType.attack,data:commands.CommandAttack.encode({}).finish()}]}));assert.equal(attack.code,0);
  const hitPacket=await c.wait(p=>includes(p,'subHP'));const hitEvents=decode('ReplicateMsg',hitPacket.message.body).events;
  const sub=entityEvent.subHP.decode(hitEvents.find(e=>e.eventType===E.subHP&&e.entityID===r.id).data);assert.equal(sub.dmgType,2);assert.equal(r.hp,hp-sub.changeHP);
  const ctx=fx.context(game,runtime,[state],Date.now(),[],world.entityEventData,env.entity,()=>null);fx.hitPlayer(ctx,r,state,fx.definition(2051),100000);env.flushEffects(game,ctx);
  const death=await c.wait(p=>includes(p,'settleInfo'));assert.equal(entityEvent.settleInfo.decode(decode('ReplicateMsg',death.message.body).events.find(e=>e.eventType===E.settleInfo).data).killerCID,1210);
  assert.equal(state.world.entity.property.HP,0);assert.ok(state.player.pendingDeath);
  const relive=decode('IOGameEnterRsq',await c.request('battle.iob.reEnter','IOGameEnterReq',{enterType:3,uid:1}));assert.equal(relive.code,0);await c.wait(p=>includes(p,'relive'));
  assert.equal(state.world.dead,false);assert.equal(state.player.pendingDeath,null);assert.equal(new Players(players.file).db[1].deathCount,1);
 }finally{c?.ws.close();await new Promise(r=>server.close(r));game.heartbeats.stop();fs.rmSync(dir,{recursive:true,force:true});}
});
