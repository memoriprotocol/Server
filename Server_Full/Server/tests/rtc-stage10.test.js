'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {LocalRtcSignaling}=require('../lib/rtc-signaling');
function sleep(ms){return new Promise(resolve=>setTimeout(resolve,ms));}
async function waitFor(fn,ms=1500){const until=Date.now()+ms;while(Date.now()<until){const v=fn();if(v)return v;await sleep(10);}throw Error('RTC_WAIT_TIMEOUT');}
function client(url){const ws=new WebSocket(url),msgs=[];ws.addEventListener('message',e=>{try{msgs.push(JSON.parse(String(e.data)))}catch{}});return {ws,msgs};}
test('authenticated local RTC signals only within same active room; not a GME audio server',async()=>{
 const members=[{user:{id:2},world:{room:'one',sceneReady:true}},{user:{id:3},world:{room:'one',sceneReady:true}},{user:{id:4},world:{room:'two',sceneReady:true}}];
 const accounts={identify(token){return {'session2':{id:2},'session3':{id:3},'session4':{id:4}}[token]||null;}};
 const rtc=new LocalRtcSignaling(accounts,{online:new Set(members)});
 const server=http.createServer((req,res)=>{res.statusCode=404;res.end();});rtc.attach(server);
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const url=`ws://127.0.0.1:${server.address().port}/rtc/signal`,a=client(url),b=client(url),c=client(url),clients=[a,b,c];
 try{
  await Promise.all(clients.map(x=>new Promise((resolve,reject)=>{x.ws.addEventListener('open',resolve,{once:true});x.ws.addEventListener('error',reject,{once:true});})));
  a.ws.send(JSON.stringify({type:'offer',to:3,data:{sdp:'not-authorized'}}));await waitFor(()=>a.msgs.find(x=>x.type==='error'&&x.code==='AUTH_REQUIRED'));
  for(const [x,token] of [[a,'session2'],[b,'session3'],[c,'session4']]){x.ws.send(JSON.stringify({type:'auth',token}));await waitFor(()=>x.msgs.find(z=>z.type==='ready'));}
  a.ws.send(JSON.stringify({type:'offer',to:3,data:{sdp:'sample'}}));const offered=await waitFor(()=>b.msgs.find(z=>z.type==='offer'));
  assert.equal(offered.from,2);assert.equal(offered.data.sdp,'sample');
  await waitFor(()=>a.msgs.find(z=>z.type==='delivered'&&z.signal==='offer'));
  const prior=c.msgs.length;
  a.ws.send(JSON.stringify({type:'ice',to:4,data:{candidate:'blocked'}}));await waitFor(()=>a.msgs.find(z=>z.type==='error'&&z.code==='NOT_IN_SAME_ROOM'));assert.equal(c.msgs.length,prior);
  assert.equal(rtc.status().gmeVoiceAvailable,false);assert.ok(rtc.status().stats.relayed>=1);
 }finally{for(const x of clients)x.ws.close();await new Promise(r=>server.close(r));}
});
