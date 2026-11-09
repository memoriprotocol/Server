'use strict';
const test=require('node:test'), assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'../..');
const runtime=path.join(root,'Server');
test('stage30: clean outer root and internal runtime/retail',()=>{
 for(const d of ['lib','config','data','local-update','tools','tests'])assert.ok(fs.statSync(path.join(runtime,d)).isDirectory(),d);
 for(const f of ['server.js','START_SERVER.bat','ADMIN_PANEL.bat','GRANT_ITEMS.bat','SHOW_ACCOUNTS.bat','MIGRATE_STAGE30.bat','package.json'])assert.ok(fs.statSync(path.join(root,f)).isFile(),f);
 for(const d of ['lib','config','data','local-update','tools','tests'])assert.equal(fs.existsSync(path.join(root,d)),false,'old root '+d);
 assert.ok(fs.existsSync(path.join(root,'retail/README_RU.txt')));
});
test('stage30: core runtime assets and admin tools resolve in their new locations',()=>{
 for(const f of ['CLIENT_CONTRACT_3127.json','CLIENT_ENUMS_3127.json','CLIENT_ROUTES_3127.json','config/schemes/ItemScheme.json','config/city-main-3127.json','config/map2-native-npcs-3127.json','local-update/project.manifest','tools/admin-access.js','tools/grant-items.js'])assert.ok(fs.existsSync(path.join(runtime,f)),f);
 const {catalog}=require('../lib/protocol-3127');assert.ok(catalog);
 const city=require('../lib/city-3127');assert.ok(city.townRecords.length);
 const script=fs.readFileSync(path.join(root,'ADMIN_PANEL.bat'),'utf8');assert.ok(script.includes('Server\\tools\\admin-access.js'));
});
test('stage30: worker can load full auth, admin and game backend from root entrypoint',()=>{
 const data=fs.mkdtempSync(path.join(os.tmpdir(),'hl-stage30-'));
 try{
  const env={...process.env,HEROS_SERVER_WORKER:'1',HEROS_DATA_DIR:data};
  const code='const s=require('+JSON.stringify(path.join(root,'server.js'))+'); if(!s.accounts||!s.players||!s.game||!s.authServer)throw Error("UNAVAILABLE"); clearInterval(s.game.worldTimer);s.game.heartbeats.stop();s.authServer.close();s.gameServer.close();';
  const r=spawnSync(process.execPath,['-e',code],{encoding:'utf8',env,timeout:15000,cwd:os.tmpdir()});
  assert.equal(r.status,0,r.stderr||r.stdout);
  assert.ok(fs.existsSync(path.join(data,'accounts.json')));
 }finally{fs.rmSync(data,{force:true,recursive:true});}
});
