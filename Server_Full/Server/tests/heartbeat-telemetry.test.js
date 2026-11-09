'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {HeartbeatTelemetry}=require('../lib/heartbeat');
const {GameServer,quietRoutes}=require('../lib/game');
const {PKG,packageEncode,packages,pbV,readVarint,pbFields}=require('../lib/wire');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {Accounts}=require('../lib/accounts'),{Players}=require('../lib/players');

test('heartbeats are only aggregated, tokenless, and RTT requires matching pong',()=>{
 let nano=0n;const log=[];const t=new HeartbeatTelemetry({autostart:false,now:()=>nano,logger:x=>log.push(x)});
 const state={user:{id:2},handshake:true,ws:{ping:data=>{state.ping=Buffer.from(data);return true;}}};
 t.register(state);for(let n=0;n<37;n++)t.heartbeat(state);
 for(let n=0;n<5000;n++)t.frame(state,24);
 t.probe();assert.ok(state.ping.length===8);
 assert.equal(t.pong(state,Buffer.alloc(8)),false);
 nano=34500000n;assert.equal(t.pong(state,state.ping),true);
 const snap=t.snapshot();assert.equal(snap.length,1);assert.equal(snap[0].heartbeats,37);assert.equal(snap[0].frames,5000);assert.equal(snap[0].frameBytes,120000);assert.equal(snap[0].avgPingMs,34.5);assert.equal(snap[0].pingSamples,1);
 t.report();assert.match(log[0],/uid=2 count=37 ping=34\.5 ms/);assert.match(log[0],/frames=5000 frameBytes=120000/);assert.equal(t.snapshot().length,0);
 t.unregister(state);t.stop();
});
test('without a WebSocket pong show no RTT, not an invented 0 ms ping',()=>{
 const lines=[],t=new HeartbeatTelemetry({autostart:false,logger:x=>lines.push(x)}),state={user:{id:5}};
 t.heartbeat(state);t.report();assert.match(lines[0],/нет данных RTT/);assert.doesNotMatch(lines[0],/ping=0/);t.stop();
});
test('actual WS Pong from 2024-style client measures server RTT and heartbeat route stays quiet',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hlhb-'));const acc=new Accounts(path.join(dir,'accounts.json'));
 const players=new Players(path.join(dir,'players.json'));const game=new GameServer(acc,players),logs=[];
 game.heartbeats.stop();game.heartbeats.logger=x=>logs.push(x);
 const server=http.createServer();game.attach(server);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const ws=new WebSocket(`ws://127.0.0.1:${server.address().port}`);
 try{
  await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
  const recv=new Promise((resolve,reject)=>{ws.onmessage=async e=>resolve(Buffer.from(await e.data.arrayBuffer()));ws.onerror=reject;});
  ws.send(packageEncode(PKG.HANDSHAKE,Buffer.from('{}')));
  const [p]=packages(await recv);assert.equal(p[0].type,PKG.HANDSHAKE);
  ws.send(packageEncode(PKG.HANDSHAKE_ACK));
  const state=[...game.online][0];state.user={id:2};
  const route=Buffer.from('connector.entryHandler.heartbeat');
  const req=Buffer.concat([Buffer.from([0,1,route.length]),route,pbV(1,123456)]);
  const hb=new Promise((resolve,reject)=>{ws.onmessage=async e=>resolve(Buffer.from(await e.data.arrayBuffer()));ws.onerror=reject;});
  ws.send(packageEncode(PKG.DATA,req));const [frames]=packages(await hb);assert.equal(frames[0].type,PKG.DATA);
  game.heartbeats.probe();await new Promise((resolve,reject)=>{const deadline=Date.now()+2000;function poll(){if(game.heartbeats.snapshot()[0]?.pingSamples)return resolve();if(Date.now()>=deadline)return reject(Error('native WebSocket did not pong'));setTimeout(poll,10);}poll();});
  assert.equal(game.heartbeats.snapshot()[0].heartbeats,1);assert.ok(game.heartbeats.snapshot()[0].avgPingMs>=0);
  game.heartbeats.report();assert.match(logs[0],/count=1 ping=.*ms/);
 }finally{ws.close();await new Promise(resolve=>server.close(resolve));game.heartbeats.stop();fs.rmSync(dir,{recursive:true,force:true});}
});

test('frame input is quiet in GAME ROUTE logs but counted alongside 5-minute RTT heartbeat summary',()=>{
 assert.equal(quietRoutes.has('battle.iob.frame'),true);
 assert.equal(quietRoutes.has('battle.iob.heartbeat'),true);
 assert.equal(quietRoutes.has('connector.entryHandler.heartbeat'),true);
 const lines=[],telemetry=new HeartbeatTelemetry({autostart:false,logger:line=>lines.push(line)});
 const client={user:{id:9}};for(let i=0;i<60;i++){telemetry.frame(client,24);telemetry.heartbeat(client,'battle');}
 const stat=telemetry.snapshot()[0];assert.equal(stat.frames,60);assert.equal(stat.frameBytes,1440);assert.equal(stat.battleHeartbeats,60);
 telemetry.report();assert.equal(lines.length,1);assert.match(lines[0],/uid=9/);assert.match(lines[0],/frames=60 frameBytes=1440/);telemetry.stop();
});
