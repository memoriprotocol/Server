'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{fork}=require('node:child_process');
test('Ctrl+R shortcut gracefully saves worker and reloads JS/JSON in a fresh process',{timeout:10000},async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hl-restart-'));
 const modulePath=path.resolve(__dirname,'../lib/server-restart.js'),file=path.join(dir,'runner.js');
 fs.writeFileSync(path.join(dir,'value.json'),'{"value":1}');
 fs.writeFileSync(file,`
 const {supervise,installWorkerShutdown}=require(${JSON.stringify(modulePath)});
 const fs=require('node:fs');
 if(process.env.HEROS_SERVER_WORKER==='1'){
  const value=require('./value.json').value;
  console.log('WORKER:'+process.pid+':'+value);
  const mark=(type)=>fs.appendFileSync(__dirname+'/saved.txt',process.pid+':'+type+'\\n');
  installWorkerShutdown({accounts:{flush(){mark('accounts')}},players:{save(){mark('players')}},game:{worldTimer:setInterval(()=>{},1000),heartbeats:{stop(){}},online:new Set()},rtc:{peers:new Set()},authServer:{close(){}},gameServer:{close(){}}});
 }else{
  const input=new (require('node:stream').PassThrough)();input.isTTY=true;input.setRawMode=function(v){this.isRaw=v};
  supervise(__filename,{input});
  process.on('message',m=>{if(m.key)input.emit('keypress','',{ctrl:true,name:m.key});});
 }
 `);
 const child=fork(file,[],{stdio:['ignore','pipe','pipe','ipc']});let output='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);
 async function waitFor(check){const deadline=Date.now()+5000;while(!check()){if(Date.now()>deadline)throw Error('timeout: '+output);await new Promise(r=>setTimeout(r,20));}}
 try{
  await waitFor(()=>/WORKER:\d+:1/.test(output));
  const first=output.match(/WORKER:(\d+):1/)[1];
  fs.writeFileSync(path.join(dir,'value.json'),'{"value":2}');child.send({key:'r'});
  await waitFor(()=>/WORKER:\d+:2/.test(output));const second=output.match(/WORKER:(\d+):2/)[1];assert.notEqual(first,second);
  assert.match(fs.readFileSync(path.join(dir,'saved.txt'),'utf8'),new RegExp(first+':players\\n'+first+':accounts'));
  const closed=new Promise(r=>child.once('exit',r));child.send({key:'c'});const code=await closed;assert.equal(code,0);
  assert.match(fs.readFileSync(path.join(dir,'saved.txt'),'utf8'),new RegExp(second+':players\\n'+second+':accounts'));
 }finally{if(child.exitCode===null)child.kill('SIGTERM');fs.rmSync(dir,{recursive:true,force:true});}
});
