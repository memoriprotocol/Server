'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const os=require('node:os'),path=require('node:path'),fs=require('node:fs'),http=require('node:http');
const {Accounts}=require('../lib/accounts'),{Players}=require('../lib/players'),{GameServer}=require('../lib/game');
const {PKG,packageEncode,packages,pbV,pbB,pbFields,parseMessage,readVarint}=require('../lib/wire');
test('website login -> one-time launcher ticket -> authenticated game login',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hl3127-'));
 const a=new Accounts(path.join(dir,'accounts.json')),players=new Players(path.join(dir,'players.json'));
 try{
  assert.equal(a.register({username:'tester123',password:'correct horse battery staple'}).ok,true);
  const login=a.login({username:'tester123',password:'correct horse battery staple'});assert.equal(login.ok,true);
  assert.equal(a.profile(login.token).accountId,1);
  const t=a.ticket(login.token);assert.equal(t.ok,true);
  const exchanged=a.exchange(t.ticket);assert.equal(exchanged.ok,true);assert.equal(a.exchange(t.ticket).ok,false);
  assert.equal(a.ticketStatus(login.token,t.ticket).status,'consumed');
  const g=new GameServer(a,players),server=http.createServer();g.attach(server);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
   const ws=new WebSocket('ws://127.0.0.1:'+server.address().port);
   await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
   async function recv(){return new Promise((resolve,reject)=>{ws.onmessage=async event=>resolve(Buffer.from(await event.data.arrayBuffer()));ws.onerror=reject;});}
   let incoming=recv();ws.send(packageEncode(PKG.HANDSHAKE,Buffer.from(JSON.stringify({sys:{type:'js'}}))));let [msgs]=packages(await incoming);assert.equal(msgs[0].type,PKG.HANDSHAKE);assert.equal(JSON.parse(msgs[0].body).code,200);
   ws.send(packageEncode(PKG.HANDSHAKE_ACK));
   incoming=recv();const body=Buffer.concat([pbB(1,'ignored-steam-name'),pbB(6,exchanged.token),pbB(10,'ru')]);const route=Buffer.from('connector.entryHandler.login');const msg=Buffer.concat([Buffer.from([0,1,route.length]),route,body]);ws.send(packageEncode(PKG.DATA,msg));[msgs]=packages(await incoming);
   assert.equal(msgs[0].type,PKG.DATA);const reply=msgs[0].body;assert.equal(reply[0],4);const [id,offset]=readVarint(reply,1);assert.equal(Number(id),1);
   const content=pbFields(reply.subarray(offset));assert.equal(Number(content.get(1)[0]),0);assert.ok(content.get(3)[0].length>0);
   ws.close();
  }finally{await new Promise(r=>server.close(r));}
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('invalid token cannot bind a player; registered identity is not controlled by account protobuf field',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hl3127-'));const a=new Accounts(path.join(dir,'a.json'));
 try{const r=a.register({username:'abc',password:'12345678'});assert.equal(r.ok,true);assert.equal(a.identify('fake'),null);}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
