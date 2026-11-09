'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const environment=require('../lib/environment-3127'),{proto}=require('../lib/proto');
const models=require('../config/monster-models-3127.json').models,configs=require('../config/schemes/MonsterContent.json').MonsterCfg;
test('all original Map2 mob levels select their exact native form, not a forced first form',()=>{
 const counts={};let changed=0;
 for(const r of environment.templates.filter(r=>r.kind==='mob')){
  const cfg=configs.find(x=>x.CreatureID===r.cid&&x.Level<=r.level&&x.MaxLevel>=r.level);assert.ok(cfg);
  assert.equal(r.prefab,models[r.cid][cfg.Form]);counts[cfg.Form]=(counts[cfg.Form]||0)+1;if(cfg.Form>1)changed++;
  const entity=environment.entity({...r});assert.equal(JSON.parse(entity.ud).prefab_path,models[r.cid][cfg.Form]);assert.equal(proto.EntityInfo.verify(entity),null);
 }
 assert.ok(changed>100);assert.ok(counts[1]&&counts[2]&&counts[3]);
});
test('room creation and timed respawn preserve the selected native variant',()=>{
 const game={environments:new Map(),online:new Set()},runtime=environment.room(game,'models'),r=[...runtime.rows.values()].find(r=>r.kind==='mob'&&r.level===75);
 const expected=models[r.cid][3];assert.equal(JSON.parse(r.entity.ud).prefab_path,expected);r.entity=environment.entity(r);assert.equal(JSON.parse(r.entity.ud).prefab_path,expected);
});
test('all four original boss packets and IDs retain the exact fixture bytes',()=>{
 const baseline=require('./fixtures/stage30-boss-baseline.json');
 for(const b of baseline.bosses){const row=environment.templates.find(r=>r.id===b.data.id);assert.deepEqual(row,b.data);const hash=crypto.createHash('sha256').update(proto.EntityInfo.encode(environment.entity({...row})).finish()).digest('hex');assert.equal(hash,b.entityWireSha256);}
});
