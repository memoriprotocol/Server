"use strict";
const test = require('node:test'), assert = require('node:assert/strict'), fs=require('node:fs'), path=require('node:path');
const root=path.join(__dirname,'../..');
const manifest=require('../../retail/FILE_MANIFEST.json');

test('retail contains all reference-only files, with no stale root copies',()=>{
  assert.equal(manifest.moved.length,14);
  for(const e of manifest.moved){
    assert.equal(fs.existsSync(path.join(root,e.oldPath)),false,e.oldPath);
    assert.equal(fs.existsSync(path.join(root,e.newPath)),true,e.newPath);
  }
});
test('runtime contracts and editable NPC / map configs still live at their original paths',()=>{
  for(const f of ['CLIENT_CONTRACT_3127.json','CLIENT_ENUMS_3127.json','CLIENT_ROUTES_3127.json',
  'config/map2-native-npcs-3127.json','config/city-main-3127.json','config/map2-verified-prefabs-3127.json']){
    assert.equal(fs.existsSync(path.join(root,'Server',f)),true,f);
  }
  assert.ok(require('../lib/city-3127').townRecords.length>0);
});
