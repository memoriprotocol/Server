'use strict';
// Every expected buff and numeric parameter is taken from the original client
// SkillScheme/BuffScheme. The client DOES NOT prove that F purifies debuffs;
// this regression intentionally forbids introducing that speculative behavior.
const test=require('node:test'),assert=require('node:assert/strict');
const fixture=require('./helpers/stage43-fixture');
const C=require('../lib/chicken-3127'),W=require('../lib/world'),CI=require('../lib/combat-input-3127');
const skills=require('../config/schemes/SkillScheme.json').Skill;
const buffs=require('../config/schemes/BuffScheme.json').Buff;
const {commands,entityEvent}=require('../lib/proto');
const EE=require('../CLIENT_ENUMS_3127.json').EntityEvent;
function setup(t,star=1){const f=fixture(t),old=Date.now;let now=100000;Date.now=()=>now;t.after(()=>Date.now=old);
 f.state.player.heroId=23;f.state.player.curSkinId=2301;
 f.state.player.battleStats={...require('../lib/life-3127').current(f.state),id:'chicken-passive-life'};
 Object.assign(f.state.world.entity.miscInfo,{heroId:23,heroStar:star,curSkinId:2301});
 f.state.world.entity.equip.curSkinID=2301;f.state.world.combatInput=CI.input(f.state.world);
 return {...f,at:n=>{now=n;},now:()=>now};
}
function eventsOf(events,type){return events.filter(e=>e.eventType===EE[type]).map(e=>entityEvent[type].decode(e.data));}
function apply(f){const ev=[];C.syncPassive(f.state,f.now(),ev,W.entityEventData);return ev;}
for(const star of [1,2,3])test('Client-defined Chicken passive initSelfBuff 237 + 457 for '+star+' stars',t=>{
 const row=skills.find(s=>s.ID===6029&&s.level===star);assert.deepEqual(row.initSelfBuff,[237,457]);
 assert.ok(buffs.find(b=>b.type===237&&b.duration===-1));assert.ok(buffs.find(b=>b.type===457&&b.duration===-1));
 const f=setup(t,star),e=f.state.world.entity;const ev=apply(f);
 assert.deepEqual(eventsOf(ev,'buffAdd').map(b=>b.type),[237,457]);
 assert.deepEqual(e.buffer.buffs.filter(b=>[237,457].includes(b.type)).map(b=>b.type),[237,457]);
 for(const [i,id] of row.initSelfBuff.entries()){
  const got=e.buffer.buffs.find(b=>b.type===id),native=require('../lib/player-skills-3127').buffArgs(row.initSelfBuffArgs[i]);
  assert.equal(got.duration,-1);assert.deepEqual(JSON.parse(got.buffExJson),native);
 }
 const expected=[5,10,15][star-1],radius=[100,150,200][star-1];
 assert.deepEqual(JSON.parse(e.buffer.buffs.find(b=>b.type===457).buffExJson),{duration:-1,hunt:expected,dist:radius});
 const second=apply(f);assert.equal(eventsOf(second,'buffAdd').length,0,'no repeated network buff spam');
});
test('Chicken passive exists without casting F and does not expire with F',t=>{
 const f=setup(t),e=f.state.world.entity;apply(f);
 assert.equal(f.state.world.chickenForm,undefined);assert.equal(e.miscInfo.curSkinId,2301);
 const ev=[];const packet=commands.CommandUseCareerSkill.encode({skillID:6029}).finish();
 CI.handle(f.game,f.state,'useCareerSkill',packet,ev,W.entityEventData,W.destroyEvent);
 assert.equal(f.state.world.chickenForm.changed,2302);
 assert.deepEqual(eventsOf(ev,'buffAdd').map(x=>x.type),[458,459,460], '457 is a persistent init buff, not temporary');
 const until=f.state.world.chickenForm.until;f.at(until);const off=[];C.tick(f.game,f.state,f.now(),off,W.entityEventData);
 assert.deepEqual(eventsOf(off,'buffRemove').map(x=>x.type),[458,459,460]);
 assert.deepEqual(e.buffer.buffs.filter(b=>[237,457].includes(b.type)).map(b=>b.type),[237,457]);
});
test('Chicken F does not silently borrow Paladin debuff cleansing',t=>{
 const f=setup(t),e=f.state.world.entity;
 const debuff=buffs.find(b=>b.isDebuff&&b.canBePurify);assert.ok(debuff);
 e.buffer||={};e.buffer.buffs||=[];e.buffer.buffs.push({type:debuff.type,duration:5000,stackNum:1});
 f.state.world.monsterStatuses=new Map([[debuff.type,{until:f.now()+5000}]]);
 const ev=[];CI.handle(f.game,f.state,'useCareerSkill',commands.CommandUseCareerSkill.encode({skillID:6029}).finish(),ev,W.entityEventData,W.destroyEvent);
 assert.ok(e.buffer.buffs.some(b=>b.type===debuff.type));
 assert.equal(f.state.world.monsterStatuses.has(debuff.type),true);
 assert.ok(!eventsOf(ev,'buffRemove').some(x=>x.type===debuff.type));
});
test('Chicken passive updates star arguments and cleans old life',t=>{
 const f=setup(t),w=f.state.world;apply(f);
 w.entity.miscInfo.heroStar=3;const ev=apply(f);
 assert.deepEqual(eventsOf(ev,'buffRemove').map(x=>x.type),[237,457]);
 assert.deepEqual(eventsOf(ev,'buffAdd').map(x=>x.type),[237,457]);
 assert.equal(JSON.parse(w.entity.buffer.buffs.find(b=>b.type===457).buffExJson).hunt,15);
 w.dead=true;const off=[];C.tick(f.game,f.state,f.now(),off,W.entityEventData);
 assert.deepEqual(eventsOf(off,'buffRemove').map(x=>x.type),[237,457]);
 assert.ok(!w.entity.buffer.buffs.some(b=>[237,457].includes(b.type)));
});
test('No Chicken passive buff leaks across hero switch',t=>{
 const f=setup(t),w=f.state.world;apply(f);
 w.entity.miscInfo.heroId=22;const ev=apply(f);
 assert.deepEqual(eventsOf(ev,'buffRemove').map(x=>x.type),[237,457]);
 assert.equal(w.chickenPassive,null);
});
