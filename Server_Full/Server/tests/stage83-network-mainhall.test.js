'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http');
const {GameServer}=require('../lib/game'),{Players}=require('../lib/players'),{Accounts}=require('../lib/accounts');
const {encode,decode}=require('../lib/codec');
const {PKG,packageEncode,packages,parseMessage,varint}=require('../lib/wire');
const E=require('../CLIENT_ENUMS_3127.json');
async function connect(port){
 const ws=new WebSocket(`ws://127.0.0.1:${port}`);ws.binaryType='arraybuffer';const queue=[],waiting=[];let id=0;
 function push(item){const i=waiting.findIndex(w=>w.predicate(item));if(i<0)queue.push(item);else{const w=waiting.splice(i,1)[0];clearTimeout(w.timer);w.resolve(item);}}
 ws.onmessage=e=>{const [packets]=packages(Buffer.from(e.data));for(const p of packets)push(p.type===PKG.DATA?{...p,msg:parseMessage(p.body)}:p);};
 function wait(predicate){const i=queue.findIndex(predicate);if(i>=0)return Promise.resolve(queue.splice(i,1)[0]);return new Promise((resolve,reject)=>{const entry={predicate,resolve,timer:setTimeout(()=>{const ix=waiting.indexOf(entry);if(ix>=0)waiting.splice(ix,1);reject(Error('WEBSOCKET_TIMEOUT'));},4000)};waiting.push(entry);});}
 await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
 ws.send(packageEncode(PKG.HANDSHAKE,Buffer.from('{}')));await wait(p=>p.type===PKG.HANDSHAKE);ws.send(packageEncode(PKG.HANDSHAKE_ACK));
 function send(route,type,data,notify=false){const r=Buffer.from(route),body=Buffer.concat([notify?Buffer.from([2]):Buffer.concat([Buffer.from([0]),varint(++id)]),Buffer.from([r.length]),r,encode(type,data)]);ws.send(packageEncode(PKG.DATA,body));return notify?Promise.resolve():wait(p=>p.msg?.type===2&&p.msg.id===id).then(p=>p.msg.body);}
 return {ws,wait,send};
}
test('real 2024 WS protocol: death -> exitBattle -> restart -> Play -> reconnect preserves player and streams mobs',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hl83ws-')),accounts=new Accounts(path.join(dir,'a.json')),players=new Players(path.join(dir,'p.json'));
 accounts.register({username:'stage83net',password:'password123'});const token=accounts.login({username:'stage83net',password:'password123'}).token;players.ensure(accounts.userById(1));
 const game=new GameServer(accounts,players),httpServer=http.createServer(),clients=[];clearInterval(game.worldTimer);game.attach(httpServer);await new Promise(r=>httpServer.listen(0,'127.0.0.1',r));
 try{
  const c=await connect(httpServer.address().port);clients.push(c);
  assert.equal(decode('LoginResp',await c.send('connector.entryHandler.login','LoginReq',{token})).code,0);
  const first=decode('IOGameLoginRsp',await c.send('game.gameHandler.enterBattle','IOGameLoginReq',{id:'battle-local-main'}));
  assert.equal(first.code,0);
  const entering=decode('IOGameEnterRsq',await c.send('battle.iob.enter','IOGameEnterReq',{roomId:first.room.roomId}));
  assert.ok(entering.room.entities.some(e=>e.id===1&&e.type===1));
  const before=[...game.online].find(s=>s.user?.id===1);assert.ok(before.world);
  assert.equal(decode('FrameStepResp',await c.send('battle.iob.frame','FrameStepReq',{cmds:[{type:E.CommandType.loginLoadingFinish,data:Buffer.alloc(0)}]})).code,0);
  require('../lib/life-3127').die(game,before,{cid:1305,x:0,y:0});assert.ok(before.player.pendingDeath);
  assert.equal(decode('IOGameLogoutRsp',await c.send('game.gameHandler.exitBattle','IOGameLogoutReq',{})).code,0);
  await c.send('game.gameHandler.onPlayerRestartGame','IOGameRestartNty',{},true);
  assert.equal(before.world,null);assert.equal(before.player.pendingDeath,null);
  assert.equal(decode('IOGameLoginRsp',await c.send('game.gameHandler.enterBattle','IOGameLoginReq',{id:'battle-local-main'})).code,0);
  const second=decode('IOGameEnterRsq',await c.send('battle.iob.enter','IOGameEnterReq',{}));
  assert.ok(second.room.entities.some(e=>e.id===1&&e.type===1));
  assert.ok(second.room.entities.some(e=>e.type===1028),'new scene has native maincity portals');
  assert.equal(before.world.dead,false);
  assert.equal(decode('FrameStepResp',await c.send('battle.iob.frame','FrameStepReq',{cmds:[{type:E.CommandType.loginLoadingFinish,data:Buffer.alloc(0)}]})).code,0);
  assert.equal(before.world.loadingFinished,true);
  // On maincity spawn there are no monsters within initial 1850 units;
  // stream them when the restored avatar reaches the map2 wilderness.
  const environment=require('../lib/environment-3127'),world=require('../lib/world');
  const mob=environment.records(game,before).find(r=>r.kind==='mob'&&!r.dead);assert.ok(mob);
  before.world.entity.physics.x=mob.x+50;before.world.entity.physics.y=mob.y+50;
  before.world.motion.x=mob.x+50;before.world.motion.y=mob.y+50;
  const freshPackets=c.wait(p=>p.msg?.route==='rm'&&decode('ReplicateMsg',p.msg.body).events.some(e=>e.entityID===-1&&e.eventType===E.SystemEvent.entityCreated&&require('../lib/proto').systemEvent.entityCreated.decode(e.data).entities.some(x=>x.id===mob.id)));
  environment.syncView(game,before);
  await freshPackets;
  assert.ok(before.world.environmentSeen.has(mob.id),'wilderness mob delivered after lobby roundtrip');
  // Reconnecting the authenticated account must also be a new scene, never a dead actor replay.
  const replacement=await connect(httpServer.address().port);clients.push(replacement);
  const close=new Promise(r=>c.ws.addEventListener('close',r,{once:true}));
  assert.equal(decode('LoginResp',await replacement.send('connector.entryHandler.login','LoginReq',{token})).code,0);await close;
  assert.equal(decode('IOGameLoginRsp',await replacement.send('game.gameHandler.enterBattle','IOGameLoginReq',{id:'battle-local-main'})).code,0);
  const third=decode('IOGameEnterRsq',await replacement.send('battle.iob.enter','IOGameEnterReq',{}));
  assert.ok(third.room.entities.some(e=>e.id===1&&e.type===1));
  assert.ok(third.room.entities.some(e=>e.type===1028));
  const live=[...game.online].find(s=>s.user?.id===1);assert.equal(live.world.dead,false);assert.equal(live.world.sceneReady,true);
 }finally{
  await Promise.all(clients.map(c=>new Promise(resolve=>{if(c.ws.readyState===WebSocket.CLOSED){resolve();return;}c.ws.addEventListener('close',resolve,{once:true});c.ws.close();})));
  await new Promise(r=>httpServer.close(r));game.heartbeats.stop();fs.rmSync(dir,{recursive:true,force:true});
 }
});
