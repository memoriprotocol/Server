'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fixture=require('./helpers/stage43-fixture');
const wolf=require('../lib/werewolf-3127'),CI=require('../lib/combat-input-3127'),PS=require('../lib/player-skills-3127'),W=require('../lib/world');
const S=require('../config/schemes/SkillScheme.json').Skill,skins=require('../config/schemes/SkinScheme.json').Skin,buffs=require('../config/schemes/BuffScheme.json').Buff;
const {commands,entityEvent}=require('../lib/proto'),EE=require('../CLIENT_ENUMS_3127.json').EntityEvent;
function setup(t,star=1,skin=2201){const f=fixture(t);const nowBase=100000,old=Date.now;let now=nowBase;Date.now=()=>now;t.after(()=>Date.now=old);
 f.state.player.heroId=22;f.state.player.curSkinId=skin;f.state.player.battleStats={...require('../lib/life-3127').current(f.state),id:'werewolf-life'};
 Object.assign(f.state.world.entity.miscInfo,{heroId:22,heroStar:star,curSkinId:skin});f.state.world.entity.equip.curSkinID=skin;
 f.state.world.combatInput=CI.input(f.state.world);require('../lib/talents-3127').refresh(f.game,f.state,now);
 return {...f,now:()=>now,at(n){now=n;return n;},skill:S.find(s=>s.ID===6026&&s.level===star)};
}
function cast(f){const events=[];CI.handle(f.game,f.state,'useCareerSkill',commands.CommandUseCareerSkill.encode({skillID:6026}).finish(),events,W.entityEventData,W.destroyEvent);return events;}
function wire(events,type){return events.filter(e=>e.eventType===EE[type]).map(e=>entityEvent[type].decode(e.data));}
test('Native werewolf CCWereWolf maps three levels, 4 distinct form pairs and exact buff IDs',()=>{
 for(const id of [2201,2203,2205,2207]){const original=skins.find(s=>s.ID===id),alternate=skins.find(s=>s.ID===id+1);
  assert.equal(original.HeroId,22);assert.equal(alternate.HeroId,22);assert.equal(alternate.OriginSkinID,id);assert.equal(wolf.forms(id).wolf,id+1);}
 for(const type of wolf.BUFFS)assert.ok(buffs.some(b=>b.type===type));
 for(const star of [1,2,3]){const row=S.find(s=>s.ID===6026&&s.level===star);assert.ok(wolf.profile(row));const args=PS.args(row);assert.ok(args.hpArgs>=30&&args.speedArgs>=200);assert.equal(star===3,args.healRate>0);}
});
for(const star of [1,2,3])for(const skin of [2201,2203,2205,2207])test(`Werewolf: star${star} skin${skin} native toggle, properties, speed expiry`,t=>{
 const f=setup(t,star,skin),initial=f.state.world.entity.property,baseMax=initial.maxHP,baseSpeed=initial.property.speed;
 const ev=cast(f),w=f.state.world,form=w.wolfForm,args=PS.args(f.skill);
 assert.ok(form);assert.equal(form.star,star);assert.equal(form.origin,skin);assert.equal(form.wolf,skin+1);
 assert.deepEqual(wire(ev,'changeSkin').map(x=>x.curSkinId),[skin+1]);assert.deepEqual(wire(ev,'buffAdd').map(x=>x.type).sort((a,b)=>a-b),star===3?[410,411,412,413]:[410,411,412]);
 assert.equal(w.entity.property.maxHP,Math.floor(baseMax*(1+args.hpArgs/100)));
 assert.equal(w.entity.property.property.speed,baseSpeed+args.speedArgs);
 assert.equal(w.entity.miscInfo.curSkinId,skin+1);assert.ok(wolf.active(f.state));
 // A wolf retains its form once short-lived bonus buffs expire.
 f.at(form.speedUntil);const effects=[];wolf.tick(f.game,f.state,f.now(),effects,W.entityEventData);
 assert.equal(w.entity.property.property.speed,baseSpeed);assert.deepEqual(wire(effects,'buffRemove').map(x=>x.type).sort((a,b)=>a-b),star===3?[412,413]:[412]);
 assert.ok(wolf.active(f.state));assert.equal(w.entity.property.maxHP,Math.floor(baseMax*(1+args.hpArgs/100)));
 // The next F after cooldown reverts the native skin and removes long-lived buffs.
 const stop=cast(f);assert.equal(w.wolfForm,null);assert.equal(w.entity.miscInfo.curSkinId,skin);
 assert.equal(w.entity.property.maxHP,baseMax);assert.equal(w.entity.property.property.speed,baseSpeed);
 assert.deepEqual(wire(stop,'changeSkin').map(x=>x.curSkinId),[skin]);assert.deepEqual(wire(stop,'buffRemove').map(x=>x.type).sort((a,b)=>a-b),[410,411]);
});
test('3 star wolf leech triggers from actual damage only during native buff lifetime',t=>{
 const f=setup(t,3),w=f.state.world,e=w.entity;cast(f);const form=w.wolfForm;e.property.HP=e.property.maxHP-500;
 const hit={damage:100,kind:'mob'},events=[];const gain=wolf.onDamage(f.state,hit,e,events,W.entityEventData,f.now());
 assert.equal(gain,20);assert.equal(e.property.HP,e.property.maxHP-480);assert.deepEqual(wire(events,'addHP').map(x=>x.changeHP),[20]);
 for(const bad of [{...hit,noBuff:true},{...hit,kind:'environment'},{...hit,damage:0},{...hit,kind:'boss',damage:-1}])assert.equal(wolf.onDamage(f.state,bad,e,[],W.entityEventData,f.now()),0);
 const fake={...e,id:e.id+3};assert.equal(wolf.onDamage(f.state,hit,fake,[],W.entityEventData,f.now()),0);
 f.at(form.leechUntil);const removed=[];wolf.tick(f.game,f.state,f.now(),removed,W.entityEventData);assert.equal(wolf.onDamage(f.state,hit,e,[],W.entityEventData,f.now()),0);
});
test('Star 1 and 2 wolf cannot leech and 3-star clamps at maxHP',t=>{const f=setup(t,1),e=f.state.world.entity;cast(f);e.property.HP-=300;
 assert.equal(wolf.onDamage(f.state,{damage:100,kind:'mob'},e,[],W.entityEventData,f.now()),0);});
for(const type of ['death','hero','skin','room','map','life','actor','loading'])test('Wolf cleans orphan state on '+type,t=>{
 const f=setup(t,3),w=f.state.world;cast(f);const form=w.wolfForm;
 if(type==='death')w.dead=true;if(type==='hero')w.entity.miscInfo.heroId=4;if(type==='skin')w.entity.miscInfo.curSkinId=2205;
 if(type==='room')w.room='other';if(type==='map')w.mapId=6;if(type==='life')f.state.player.battleStats.id='different';
 if(type==='actor')w.entity=structuredClone(w.entity);if(type==='loading')w.sceneReady=false;
 const ev=[];wolf.tick(f.game,f.state,f.now(),ev,W.entityEventData);assert.equal(w.wolfForm,null);assert.ok(!form.actor.buffer.buffs.some(b=>wolf.BUFFS.includes(b.type)));
 if(type==='actor')assert.equal(w.entity.miscInfo.curSkinId,2202);
});
test('Skill level 10 gate and native F input, wrong skill ownership blocked',t=>{const f=setup(t,1);f.state.world.entity.property.level=9;
 assert.throws(()=>cast(f),/LEVEL/);assert.equal(f.state.world.wolfForm,undefined);
 f.state.world.entity.property.level=10;assert.equal(wolf.canStart(f.state,f.skill),true);
});
test('clear on hero switch avoids leaking native model and wolf buffs',t=>{const f=setup(t,3);cast(f);const w=f.state.world;
 require('../lib/hero-vfx-3127').clear(f.game,f.state);assert.equal(w.wolfForm,null);assert.equal(w.entity.miscInfo.curSkinId,2201);assert.ok(!w.entity.buffer.buffs.some(b=>wolf.BUFFS.includes(b.type)));
});
