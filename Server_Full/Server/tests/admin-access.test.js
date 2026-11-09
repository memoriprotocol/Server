'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const {spawnSync}=require('node:child_process');
const original=fs.readFileSync(path.resolve(__dirname,'../tools/admin-access.js'),'utf8');
function fixture(){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hl-admin-test-'));fs.mkdirSync(path.join(dir,'tools'));fs.mkdirSync(path.join(dir,'data'));
 fs.writeFileSync(path.join(dir,'tools/admin-access.js'),original);
 const accounts=[{id:1,username:'papa',role:'user',admin:false,permissions:[],status:'active',permissionVersion:0,passwordHash:'do-not-touch'},{id:2,username:'test',role:'user',admin:false,permissions:[],status:'active',permissionVersion:0,passwordHash:'do-not-touch-too'}];
 fs.writeFileSync(path.join(dir,'data/accounts.json'),JSON.stringify({accounts,sessions:{},tickets:{},usedTickets:{},audit:[],nextId:3}));
 const exec=(...args)=>spawnSync(process.execPath,[path.join(dir,'tools/admin-access.js'),...args],{encoding:'utf8',env:{...process.env,HEROS_AUTH_PORT:'61229',HEROS_HOST:'127.0.0.1'}});
 return {dir,exec,read:()=>JSON.parse(fs.readFileSync(path.join(dir,'data/accounts.json'),'utf8')),cleanup:()=>fs.rmSync(dir,{recursive:true,force:true})};}
test('grants developer to existing account and website permissions become eligible',()=>{const f=fixture();try{
 const r=f.exec('grant','papa');assert.equal(r.status,0,r.stderr);const db=f.read();assert.equal(db.accounts[0].role,'developer');assert.equal(db.accounts[0].admin,true);assert.deepEqual(db.accounts[0].permissions,['*']);assert.equal(db.accounts[0].passwordHash,'do-not-touch');assert.equal(db.accounts[1].role,'user');assert.equal(db.audit.length,1);assert.equal(fs.readdirSync(path.join(f.dir,'data/admin-backups')).length,1);
 const second=f.exec('grant','papa');assert.equal(second.status,0);assert.equal(f.read().audit.length,1);
 }finally{f.cleanup();}});
test('does not allow deleting only developer',()=>{const f=fixture();try{assert.equal(f.exec('grant','papa').status,0);const r=f.exec('revoke','papa');assert.notEqual(r.status,0);assert.match(r.stderr,/последнего разработчика/);assert.equal(f.read().accounts[0].role,'developer');}finally{f.cleanup();}});
test('rejects invalid account and leaves file intact',()=>{const f=fixture();try{const old=fs.readFileSync(path.join(f.dir,'data/accounts.json'),'utf8');const r=f.exec('grant','nonexisting');assert.notEqual(r.status,0);assert.equal(fs.readFileSync(path.join(f.dir,'data/accounts.json'),'utf8'),old);}finally{f.cleanup();}});
