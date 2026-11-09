'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fixture=require('./helpers/stage43-fixture');
const slime=require('../lib/slime-3127'),CI=require('../lib/combat-input-3127'),W=require('../lib/world'),PS=require('../lib/player-skills-3127');
const {commands,entityEvent}=require('../lib/proto'),EE=require('../CLIENT_ENUMS_3127.json').EntityEvent;
const native=require('../config/schemes/SkillScheme.json').Skill;
function setup(t,star=1){const f=fixture(t),old=Date.now;let now=100000;Date.now=()=>now;t.after(()=>Date.now=old);
 const e=f.state.world.entity;e.miscInfo.heroId=19;e.miscInfo.heroStar=star;e.miscInfo.curSkinId=1901;e.equip.curSkinID=1901;f.state.player.heroId=19;f.state.player.curSkinId=1901;
 f.state.player.battleStats={...require('../lib/life-3127').current(f.state),id:'slime-life'};CI.input(f.state.world);
 return {...f,now:()=>now,at:n=>now=n,active:native.find(s=>s.ID===6020&&s.level===star),passive:native.find(s=>s.ID===6021&&s.level===star)};
}
function eventsOf(events,type){return events.filter(e=>e.eventType===EE[type]).map(e=>entityEvent[type].decode(e.data));}
function cast(f){const ev=[];CI.handle(f.game,f.state,'useCareerSkill',commands.CommandUseCareerSkill.encode({skillID:6020}).finish(),ev,W.entityEventData,W.destroyEvent);return ev;}
test('original 2024 bindings: distinct active/passive, buff 273, acidMucus=1045, native prefab per star',()=>{
 for(const star of [1,2,3]){
  const a=native.find(s=>s.ID===6020&&s.level===star),p=native.find(s=>s.ID===6021&&s.level===star);
  assert.ok(slime.profile(a));assert.ok(p.isPassive);assert.equal(a.duration,5000);assert.equal(p.duration,5000);assert.equal(a.damaga,p.damaga);
  assert.equal(p.effectSize[0],[450,550,700][star-1]);
  if(star===2||star===3){assert.equal(p.onHitEnemyBuff[0],'100,slowDownPerSlim');assert.equal(PS.buffArgs(p.onHitEnemyBuffArgs[0]).propValue,star===2?25:35);}
  if(star===3)assert.equal(p.targetBuffID[0],'100,confused');
 }
 assert.equal(slime.ACTIVE_BUFF,273);assert.equal(slime.ENTITY_TYPE,1045);
 const fs=require('fs'),path=require('path');const ref=fs.readFileSync(path.join(__dirname,'../../retail/client-reference/stage82/CCSlimPassive.ts'),'utf8');
 assert.match(ref,/acidMucus/);assert.match(ref,/skillLv/);assert.match(ref,/skinID/);
});
for(const star of [1,2,3])test('Slime star '+star+': F disguises and does NOT damage directly; break spawns 5s acidMucus with native UD',t=>{
 const f=setup(t,star),hp=f.record.hp,ev=cast(f),w=f.state.world;
 assert.ok(slime.active(f.state));assert.equal(f.record.hp,hp);
 assert.deepEqual(eventsOf(ev,'buffAdd').filter(b=>b.type===273).map(b=>b.type),[273]);
 assert.equal(eventsOf(ev,'transformTo')[0].id,f.record.id);
 assert.equal(w.slimeDisguise.mimicID,f.record.id);
 const passiveCast=()=>CI.handle(f.game,f.state,'useCareerSkill',commands.CommandUseCareerSkill.encode({skillID:6021}).finish(),[],W.entityEventData,W.destroyEvent);
 assert.throws(passiveCast,/PASSIVE_CANNOT_BE_CAST/);
 f.at(100500);const end=[];slime.breakDisguise(f.game,f.state,f.now(),end,W.entityEventData,'weapon');
 assert.equal(slime.active(f.state),null);assert.equal(w.slimePools.length,1);
 assert.deepEqual(eventsOf(end,'buffRemove').map(b=>b.type),[273]);assert.equal(eventsOf(end,'transformEnd')[0].skillID,6020);
 const pool=w.slimePools[0];assert.equal(pool.row.entity.type,1045);assert.equal(JSON.parse(pool.row.entity.ud).skillLv,star);
 assert.equal(JSON.parse(pool.row.entity.ud).skinID,1901);assert.equal(pool.until,105500);
 assert.equal(f.record.hp,hp,'pool cannot apply damage on creation');
 f.at(101500);const effects=[];slime.tick(f.game,f.state,f.now(),effects,W.entityEventData);
 assert.ok(f.record.hp<hp,'passive tick hits nearby monster');assert.equal(w.slimePools.length,1);
 assert.ok(eventsOf(effects,'beHurt').some(b=>b.skillId===6021));
 if(star>=2)assert.ok(f.record.playerStatuses.has(275),'slow status must be native 275');
 f.at(105501);slime.tick(f.game,f.state,f.now(),effects,W.entityEventData);assert.equal(w.slimePools.length,0);
 assert.ok(!f.game.environments.get(w.room).rows.has(pool.row.id),'pool must be cleaned from environment');
});
test('Slime star3: 1.5s confusion only at disguise break, independent from tick slow',t=>{
 const f=setup(t,3);cast(f);f.at(100500);const ev=[];slime.breakDisguise(f.game,f.state,f.now(),ev,W.entityEventData,'manual');
 assert.deepEqual(eventsOf(ev,'buffAdd').filter(b=>b.type===192).map(b=>b.duration),[1500]);
 assert.ok(f.record.playerStatuses.has(192));
 const effects=[];f.at(101500);slime.tick(f.game,f.state,f.now(),effects,W.entityEventData);
 assert.ok(f.record.playerStatuses.has(275));assert.equal(eventsOf(effects,'buffAdd').some(b=>b.type===192),false,'do not repeatedly apply initial confusion');
});
test('Slime hurt breaks disguise and heals 15% maxHP only if alive',t=>{
 const f=setup(t,1);cast(f);const e=f.state.world.entity;e.property.HP=e.property.maxHP-500;
 const ev=[];const old=e.property.HP;slime.breakDisguise(f.game,f.state,100100,ev,W.entityEventData,'hurt');
 assert.equal(e.property.HP,Math.min(e.property.maxHP,old+Math.floor(e.property.maxHP*.15)));
 assert.equal(eventsOf(ev,'addHP').length,1);assert.equal(f.state.world.slimePools.length,1);
});
test('Slime nearest eligible object: no BOSS, no chest, no target means no cast/no cooldown',t=>{
 const f=setup(t,1),r=f.record;r.kind='boss';assert.equal(slime.mimic(f.game,f.state,f.active),null);
 r.kind='chest';assert.equal(slime.mimic(f.game,f.state,f.active),null);
 const ev=cast(f);assert.equal(f.state.world.slimeDisguise,undefined);assert.equal(ev.length,0);
 r.kind='tree';assert.equal(slime.mimic(f.game,f.state,f.active).id,r.id);
});
for(const kind of ['death','actor','room','map','star','hero','life'])test('Slime cleanup on '+kind+' prevents late damage and leaked VFX',t=>{
 const f=setup(t,2),w=f.state.world;cast(f);if(kind==='death')w.dead=true;
 if(kind==='actor')w.entity=structuredClone(w.entity);if(kind==='room')w.room='else';if(kind==='map')w.mapId=4;
 if(kind==='star')w.entity.miscInfo.heroStar=3;if(kind==='hero')w.entity.miscInfo.heroId=20;
 if(kind==='life')f.state.player.battleStats.id='new-life';
 const ev=[];slime.tick(f.game,f.state,101000,ev,W.entityEventData);
 assert.equal(w.slimeDisguise,null);assert.equal(w.slimePools?.length||0,0);
});
test('Slime interruption on weapon usage and hero switch are routed through server runtime',t=>{
 const f=setup(t,1);cast(f);
 const w=f.state.world,e=w.entity,ev=[];slime.clear(f.game,f.state,ev,W.entityEventData);
 assert.equal(w.slimeDisguise,null);assert.equal(eventsOf(ev,'buffRemove')[0].type,273);
 assert.ok(!(e.buffer.buffs||[]).some(b=>b.type===273));
});
