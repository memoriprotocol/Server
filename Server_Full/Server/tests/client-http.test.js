'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http');
const {clientHttp}=require('../lib/client-http');
test('local gateway authenticates launcher token; notices, version and telemetry have bounded local endpoints',async()=>{const server=http.createServer((req,res)=>clientHttp(req,res,new URL(req.url,'http://localhost'),{identify:t=>t==='valid-token'?{id:2}:null},{gamePort:11000}));await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;try{
 let r=await fetch(base+'/client/gateway',{method:'POST',body:JSON.stringify({account:'2',token:'valid-token'})});assert.equal(r.status,200);assert.deepEqual((await r.json()).data,{host:'127.0.0.1',port:11000});
 r=await fetch(base+'/client/gateway',{method:'POST',body:JSON.stringify({account:'3',token:'valid-token'})});assert.equal(r.status,401);
 for(const mode of ['in_game','out_game','marquee']){r=await fetch(base+'/client/notices/'+mode+'/221110010/index.json');assert.equal(r.status,200);assert.deepEqual(await r.json(),{});}
 r=await fetch(base+'/client/telemetry',{method:'OPTIONS',headers:{Origin:'null'}});assert.equal(r.status,204);assert.equal(r.headers.get('access-control-allow-origin'),'*');
 for(const route of ['ping','telemetry']){r=await fetch(base+'/client/'+route,{method:'POST',body:'SDK payload'});assert.equal(r.status,200);assert.equal((await r.json()).code,0);}
 r=await fetch(base+'/local-update/remote_version.json');assert.equal((await r.json()).version,'3.12.7');
 }finally{await new Promise(r=>server.close(r));}});
