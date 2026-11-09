'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const skills=require('../lib/monster-skills-3127'),env=require('../lib/environment-3127');
const world=require('../lib/world'),{entityEvent,proto}=require('../lib/proto');
const EE=require('../CLIENT_ENUMS_3127.json').EntityEvent;
function row(cid=1307){const template=env.templates.find(r=>r.cid===cid),r={...template,dead:false};r.entity=env.entity(r);return r;}
function victim(r){return {world:{sceneReady:true,entity:{id:321,physics:{x:r.x+150,y:r.y},property:{HP:800,maxHP:800}}}};}
function data(events,name){return events.filter(e=>e.eventType===EE[name]).map(e=>entityEvent[name].decode(e.data));}
test('every map2 mob/boss activates only its own skill IDs with exact independent cooldowns',()=>{
 for(const cid of new Set(env.templates.filter(r=>['mob','boss'].includes(r.kind)).map(r=>r.cid))){
  const r=row(cid),t=victim(r),catalog=skills.skillsFor(r),seen=[];let time=100000;
  for(let n=0;n<catalog.length;n++){
   const ev=[];assert.ok(skills.begin(r,t,time,ev,world.entityEventData),String(cid));
   const use=data(ev,'useSkill')[0],cfg=catalog.find(s=>s.ID===use.skillID);assert.ok(cfg);assert.equal(use.skillCD,cfg.cd);assert.equal(use.skillLevel,1);assert.ok(!seen.includes(use.skillID));seen.push(use.skillID);
   assert.equal(r.skillRuntime.readyAt.get(use.skillID),time+cfg.cd);
   assert.equal(proto.ReplicateMsg.verify({events:ev}),null);
   time=r.skillRuntime.pending.endAt+1;skills.advance(r,[t],time,[],world.entityEventData,()=>false);
   time=Math.max(time,r.skillRuntime.nextActionAt);
  }
  assert.deepEqual(new Set(seen),new Set(catalog.map(s=>s.ID)));
 }
});
test('windup delays release, cast happens once, and backswing prevents movement/new cast',()=>{
 const r=row(),t=victim(r),ev=[],time=100000;skills.begin(r,t,time,ev,world.entityEventData);
 const pending=r.skillRuntime.pending,release=pending.releaseAt;
 assert.ok(release>time);assert.equal(data(ev,'moveStop').length,1);assert.equal(data(ev,'skillCastPoint').length,1);
 skills.advance(r,[t],release-1,ev,world.entityEventData,()=>false);assert.equal(data(ev,'skillCast').length,0);
 skills.advance(r,[t],release,ev,world.entityEventData,()=>false);assert.equal(data(ev,'skillCast').length,1);
 skills.advance(r,[t],release+1,ev,world.entityEventData,()=>false);assert.equal(data(ev,'skillCast').length,1);
 assert.equal(skills.begin(r,t,release+1,ev,world.entityEventData),false);
});
test('safe zone entry, scene replacement, disconnect and actor death cancel the pending cast',()=>{
 for(const kind of ['safe','replaced','left','dead']){
  const r=row(),t=victim(r),events=[];skills.begin(r,t,100000,events,world.entityEventData);const due=r.skillRuntime.pending.releaseAt;
  let targets=[t];if(kind==='left')targets=[];if(kind==='dead')r.dead=true;if(kind==='replaced')t.world={...t.world};
  const result=skills.advance(r,targets,due,events,world.entityEventData,()=>kind==='safe');
  assert.equal(result.cancelled,true);assert.equal(data(events,'skillCast').length,0);assert.equal(data(events,'skillStop').length,1);assert.equal(r.skillRuntime.pending,null);
 }
});
test('respawn does not retain cast state or cooldowns from the previous life',()=>{
 const r=row(),t=victim(r);skills.begin(r,t,100000,[],world.entityEventData);assert.ok(r.skillRuntime.pending);
 r.entity=env.entity(r);assert.equal(r.skillRuntime,null);assert.ok(skills.begin(r,t,100001,[],world.entityEventData));
});
test('special skills are not silently converted to a damaging melee attack',()=>{
 const r=row(1210),t=victim(r),ev=[];skills.runtime(r).index=1;skills.begin(r,t,100000,ev,world.entityEventData);
 assert.equal(r.skillRuntime.pending.skill.ID,2236);const result=skills.advance(r,[t],r.skillRuntime.pending.releaseAt,ev,world.entityEventData,()=>false);assert.equal(result.impact,null);
});
test('environment tick sends native skill packets only after spawn and delays contact damage',()=>{
 const original=Date.now;let time=100000;Date.now=()=>time;
 try{
  const r=row(1210),t=victim(r);r.homeX=r.x;r.homeY=r.y;r.version=1;
  Object.assign(t.world,{room:'skill-integration',mapId:2,level:'main',loadingFinished:true,motion:{x:t.world.entity.physics.x,y:t.world.entity.physics.y},environmentSeen:new Map([[r.id,1]])});
  const packets=[],g={online:new Set([t]),environments:new Map([['skill-integration',{rows:new Map([[r.id,r]]),lastTick:0}]]),push:(state,route,raw)=>packets.push(require('../lib/codec').decode('ReplicateMsg',raw))};
  require('../lib/monster-ai-3127').provoke(r,t,time);const hp=t.world.entity.property.HP;env.tick(g,0.25);assert.ok(r.skillRuntime.pending);assert.equal(t.world.entity.property.HP,hp);
  assert.ok(packets.some(p=>data(p.events,'useSkill').length));
  time+=500;env.tick(g,0.25);assert.ok(t.world.entity.property.HP<hp);
  assert.ok(packets.some(p=>data(p.events,'skillCast').length));
  r.entity=env.entity(r);t.world.environmentSeen.clear();packets.length=0;time+=1000;env.tick(g,0.25);
  assert.equal(r.skillRuntime?.pending,null);
  assert.ok(packets.every(p=>!data(p.events,'useSkill').length));
 }finally{Date.now=original;}
});
