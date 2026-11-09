'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fixture=require('./helpers/stage43-fixture');
const C=require('../lib/chicken-3127'),CI=require('../lib/combat-input-3127'),PS=require('../lib/player-skills-3127'),W=require('../lib/world'),
 S=require('../config/schemes/SkillScheme.json').Skill,skins=require('../config/schemes/SkinScheme.json').Skin,
 buffs=require('../config/schemes/BuffScheme.json').Buff,{commands,entityEvent}=require('../lib/proto'),EE=require('../CLIENT_ENUMS_3127.json').EntityEvent;
function setup(t,star=1,skin=2301){const f=fixture(t),old=Date.now;let now=100000;Date.now=()=>now;t.after(()=>Date.now=old);
 f.state.player.heroId=23;f.state.player.curSkinId=skin;f.state.player.battleStats={...require('../lib/life-3127').current(f.state),id:'chicken-life'};
 Object.assign(f.state.world.entity.miscInfo,{heroId:23,heroStar:star,curSkinId:skin});f.state.world.entity.equip.curSkinID=skin;
 f.state.world.combatInput=CI.input(f.state.world);require('../lib/talents-3127').refresh(f.game,f.state,now);return {...f,now:()=>now,at(n){now=n;return n;},skill:S.find(s=>s.ID===6029&&s.level===star)};}
const cast=f=>{const ev=[];CI.handle(f.game,f.state,'useCareerSkill',commands.CommandUseCareerSkill.encode({skillID:6029}).finish(),ev,W.entityEventData,W.destroyEvent);return ev;};
const wire=(events,type)=>events.filter(e=>e.eventType===EE[type]).map(e=>entityEvent[type].decode(e.data));
for(const star of [1,2,3])for(const skin of [2301,2307,2305,2303])test('Chicken star'+star+' skin'+skin+' native form, speed, buffs, expiry',t=>{
 const f=setup(t,star,skin),a=PS.args(f.skill),before=f.state.world.entity.property.property.speed,events=cast(f),form=f.state.world.chickenForm;
 assert.ok(form);assert.equal(form.until-f.now(),a.duration);assert.equal(form.speed,a.speedUp);assert.equal(form.origin,skin);assert.equal(form.changed,skin+1);
 assert.equal(f.state.world.entity.miscInfo.curSkinId,skin+1);assert.equal(f.state.world.entity.equip.curSkinID,skin+1);
 assert.deepEqual(wire(events,'buffAdd').map(x=>x.type).sort((a,b)=>a-b),[237,457,458,459,460]);
 assert.deepEqual(wire(events,'changeSkin').map(x=>x.curSkinId),[skin+1]);
 assert.equal(wire(events,'skillCast')[0].skillID,6029);
 assert.equal(f.state.world.entity.property.property.speed,before+a.speedUp);
 assert.ok(C.active(f.state));assert.ok(PS.invulnerable(f.state));assert.ok(PS.blocked(f.state));
 assert.equal(f.state.world.entity.buffer.buffs.filter(b=>C.BUFFS.includes(b.type)).length,4);assert.ok(f.state.world.entity.buffer.buffs.some(b=>b.type===237));
 f.at(form.until-1);const beforeEv=[];C.tick(f.game,f.state,f.now(),beforeEv,W.entityEventData);assert.equal(beforeEv.length,0);
 f.at(form.until);const after=[];C.tick(f.game,f.state,f.now(),after,W.entityEventData);assert.equal(f.state.world.chickenForm,null);
 assert.equal(f.state.world.entity.miscInfo.curSkinId,skin);assert.equal(f.state.world.entity.property.property.speed,before);
 assert.deepEqual(wire(after,'buffRemove').map(x=>x.type).sort((a,b)=>a-b),[458,459,460]);
 assert.deepEqual(wire(after,'changeSkin').map(x=>x.curSkinId),[skin]);assert.equal(wire(after,'skillStop')[0].skillID,6029);
 assert.equal(!!C.active(f.state),false);assert.equal(PS.invulnerable(f.state),false);assert.equal(PS.blocked(f.state),false);
 assert.ok(!f.state.world.entity.buffer.buffs.some(b=>C.FORM_BUFFS.includes(b.type)));assert.ok(C.PASSIVE_BUFFS.every(id=>f.state.world.entity.buffer.buffs.some(b=>b.type===id)));
});
test('Native 3.12.7 tables prove 4 normal/alternate skin pairs and 4 buff identifiers',()=>{
 for(const base of [2301,2303,2305,2307]){
 const a=skins.find(s=>s.ID===base),b=skins.find(s=>s.ID===base+1);
 assert.equal(a.HeroId,23);assert.equal(a.OriginSkinID,base);assert.equal(b.HeroId,23);assert.equal(b.OriginSkinID,base);
 assert.equal(C.forms(base).changed,base+1);
 }
 for(const type of C.BUFFS)assert.ok(buffs.some(b=>b.type===type));
 for(const star of [1,2,3]){const row=S.find(s=>s.ID===6029&&s.level===star);assert.ok(C.profile(row));assert.ok(PS.args(row).duration>0);assert.ok(PS.args(row).speedUp>0);}
});
test('Chicken form blocks weapon and basic attacks but keeps movement state',t=>{const f=setup(t);f.state.world.combatInput.auto=true;f.state.world.combatInput.left=true;f.state.world.combatInput.right=true;
 const events=cast(f);const w=f.state.world;assert.equal(w.combatInput.auto,false);assert.equal(w.combatInput.left,false);assert.equal(w.combatInput.right,false);
 assert.equal(w.motion!==null,true);assert.deepEqual(wire(events,'autoUseSkill').map(x=>x.enterOrExit),[false]);
 assert.equal(CI.basicAttack(f.game,f.state,[],W.entityEventData,W.destroyEvent),false);
 assert.equal(CI.castWeapon(f.state,[],W.entityEventData,0,f.game),false);
 assert.equal(w.chickenForm.origin,2301);
});
test('Chicken cannot double-cast or spend another charge during form',t=>{const f=setup(t),ev1=cast(f),last=f.state.world.combatInput.lastHeroSkillAt[6029],count=f.state.world.combatInput.heroCasts;
 const ev2=cast(f);assert.equal(f.state.world.combatInput.heroCasts,count);assert.equal(f.state.world.combatInput.lastHeroSkillAt[6029],last);assert.equal(wire(ev2,'skillCast').length,0);
});
test('Native level gate rejects Chicken F before cooldown',t=>{const f=setup(t);f.state.world.entity.property.level=9;assert.throws(()=>cast(f),/LEVEL/);assert.equal(f.state.world.chickenForm,undefined);assert.equal(f.state.world.combatInput.lastHeroSkillAt[6029],undefined);});
for(const reason of ['death','hero','skin','room','map','life','actor','loading'])test('Chicken form invalidates on '+reason,t=>{
 const f=setup(t),w=f.state.world,form=cast(f)&&w.chickenForm;assert.ok(form);
 if(reason==='death')w.dead=true;if(reason==='hero')w.entity.miscInfo.heroId=2;if(reason==='skin')w.entity.miscInfo.curSkinId=2305;
 if(reason==='room')w.room='another';if(reason==='map')w.mapId=6;if(reason==='life')f.state.player.battleStats.id='new';
 if(reason==='actor')w.entity=structuredClone(w.entity);if(reason==='loading')w.sceneReady=false;
 assert.equal(!!C.active(f.state),false);
 const events=[];C.tick(f.game,f.state,f.now(),events,W.entityEventData);
 assert.equal(w.chickenForm,null);assert.ok(!form.actor.buffer.buffs.some(b=>C.FORM_BUFFS.includes(b.type)));
 if(reason==='actor')assert.equal(w.entity.miscInfo.curSkinId,2302); // do not touch a replacement actor
});
test('Chicken cleanup on hero switch retains no transformed buff or native visual',t=>{const f=setup(t),w=f.state.world;cast(f);W.entityEventData(w.entity,'buffRemove',{type:457});
 require('../lib/hero-vfx-3127').clear(f.game,f.state);assert.equal(w.chickenForm,null);assert.equal(w.entity.miscInfo.curSkinId,2301);
 assert.equal(w.entity.buffer.buffs.filter(b=>C.BUFFS.includes(b.type)).length,0);assert.ok(!w.entity.buffer.buffs.some(b=>b.type===237));
});
test('Chicken no fabricated visual entity, projectile or direct damage',t=>{const f=setup(t),hp=f.record.hp;cast(f);
 assert.equal(f.record.hp,hp);assert.equal(f.state.world.projectiles?.length||0,0);assert.equal(f.state.world.heroVfx?.length||0,0);
 assert.equal(f.game.environments.get('stage43').rows.size,1);
});
