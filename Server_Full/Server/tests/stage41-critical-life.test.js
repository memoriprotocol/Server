'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {fixture}=require('./stage40-fixture.cjs');
const damage=require('../lib/damage-3127'),life=require('../lib/life-3127'),fx=require('../lib/monster-effects-3127'),environment=require('../lib/environment-3127'),world=require('../lib/world'),progress=require('../lib/progression-3127'),combat=require('../lib/combat-input-3127'),inventory=require('../lib/inventory');
const {encode,decode}=require('../lib/codec'),{entityEvent,commands,proto}=require('../lib/proto'),enums=require('../CLIENT_ENUMS_3127.json'),{pbFields}=require('../lib/wire');
const skill={args:['damage:0','atkArgs:100'],canCrit:true};
function context(f,time=Date.now()) {return fx.context(f.game,f.runtime,[...f.game.online],time,[],world.entityEventData,environment.entity,()=>null);}
function decoded(events,name){return events.filter(e=>e.systemType===enums.SystemType.entity&&e.eventType===enums.EntityEvent[name]).map(e=>entityEvent[name].decode(e.data));}
function packets(f){return f.packets.filter(p=>p.route==='rm').flatMap(p=>decode('ReplicateMsg',p.raw).events);}
function call(f,route,type,data={}){let response;f.game.reply=(_s,_id,body)=>{response=body;};const body=encode(type,data);f.game.unhandled||=new Map();world.onWorld(f.game,f.state,{route,body,id:1,type:0},pbFields(body));return response;}
test('native critical rate uses percent boundaries, clamps chance and honors canCrit',()=>{
 assert.equal(damage.critical({crit:5},true,()=>.049999),true);assert.equal(damage.critical({crit:5},true,()=>.05),false);
 assert.equal(damage.critical({crit:1000},true,()=>.999999),true);assert.equal(damage.critical({crit:-1},true),false);
 assert.equal(damage.critical({crit:100},false,()=>{throw Error('must not roll');}),false);
 assert.throws(()=>damage.critical({crit:5},true,()=>1),/INVALID_COMBAT_RANDOM/);
 let n=0;for(let i=0;i<10000;i++)if(damage.critical({crit:5},true,()=>i/10000))n++;assert.equal(n,500);
});
test('critical multiplier comes from actual stats; fixed DOT never rerolls or multiplies',()=>{
 assert.deepEqual(damage.calculate({attack:10000,crit:100,critHarm:175},skill,{rng:()=>0}),{amount:175,critical:true,dmgType:2});
 assert.deepEqual(damage.calculate({attack:10000,crit:100,critHarm:175},{...skill,canCrit:false}),{amount:100,critical:false,dmgType:1});
 assert.deepEqual(damage.calculate({crit:100},skill,{fixedAmount:50,rng:()=>{throw Error('must not roll');}}),{amount:50,critical:false,dmgType:3});
});
test('real equipment crit/critHarm bonuses affect the calculation',()=>{
 for(const [id,key]of [[39,'crit'],[40,'critHarm']]){
  const cfg=[...inventory.equipment.values()].find(e=>e.isValid&&e.PropertyIDs.includes(id));assert.ok(cfg);
  const base=progress.stats(1),derived=inventory.equipmentProperty(base,[{itemCfgId:cfg.ItemID,bagType:4}]);
  assert.equal(derived.property[key],base.property[key]+cfg.PropertyValues[cfg.PropertyIDs.indexOf(id)]);
 }
});
test('hero basic strike applies critical damage and sends native critical hit and number types',t=>{
 const f=fixture(t);Object.assign(f.state.world.entity.property.property,{attack:10000,crit:100,critHarm:150});f.state.world.motion.angle=180;
 const events=[],hp=f.r.hp;combat.handle(f.game,f.state,'attack',commands.CommandAttack.encode({}).finish(),events,world.entityEventData,world.destroyEvent);
 const hit=decoded(events,'beHurt').find(e=>e.attacker===2),sub=decoded(events,'subHP').find(e=>e.changeHP>0);assert.ok(hit&&sub);assert.equal(hit.damageType,2);assert.equal(sub.dmgType,2);assert.equal(f.r.hp,hp-sub.changeHP);assert.equal(sub.showChangeHP,sub.changeHP);
});
test('monster critical uses the same rolled result for HP, hit effect and floating number',t=>{
 const f=fixture(t),c=context(f);c.random=()=>0;Object.assign(f.r.entity.property.property,{crit:100,critHarm:200});
 const result=fx.damageFor(f.r,skill,()=>0);fx.hitPlayer(c,f.r,f.state,skill);
 assert.equal(decoded(c.events,'beHurt')[0].damageType,2);assert.equal(decoded(c.events,'subHP')[0].dmgType,2);assert.equal(decoded(c.events,'subHP')[0].changeHP,result.amount);
});
test('fully absorbed critical displays shield absorption instead of an HP critical zero',t=>{
 const f=fixture(t),c=context(f);Object.assign(f.r.entity.property.property,{crit:100,critHarm:200});f.state.world.entity.property.shield=1000;
 const hp=f.state.world.entity.property.HP,amount=fx.damageFor(f.r,skill,()=>0).amount;c.random=()=>0;fx.hitPlayer(c,f.r,f.state,skill);
 assert.equal(f.state.world.entity.property.HP,hp);assert.equal(f.state.world.entity.property.shield,1000-amount);
 const numbers=decoded(c.events,'subHP');assert.equal(numbers.length,1);assert.equal(numbers[0].changeHP,0);assert.equal(numbers[0].dmgType,7);assert.equal(numbers[0].showChangeHP,amount);
});
test('partial shield shows absorption separately and critical only for actual HP lost',t=>{
 const f=fixture(t),c=context(f);Object.assign(f.r.entity.property.property,{crit:100,critHarm:200});f.state.world.entity.property.shield=10;c.random=()=>0;
 const amount=fx.damageFor(f.r,skill,()=>0).amount;fx.hitPlayer(c,f.r,f.state,skill);const numbers=decoded(c.events,'subHP');
 assert.equal(numbers[0].dmgType,7);assert.equal(numbers[0].showChangeHP,10);assert.equal(numbers[1].dmgType,2);assert.equal(numbers[1].changeHP,amount-10);
});
test('poison ticks retain native poison type even when source has guaranteed crit',t=>{
 const f=fixture(t),c=context(f);f.r.entity.property.property.crit=100;fx.hitPlayer(c,f.r,f.state,skill,50);const sub=decoded(c.events,'subHP')[0];assert.equal(sub.dmgType,3);assert.equal(sub.changeHP,50);
});
test('lethal hit leaves a dead body and sends death publicly, settlement only to its owner',t=>{
 const f=fixture(t),peer=f.player(3),c=context(f),at={...f.state.world.entity.physics};
 Object.assign(f.state.world,{rotationDirection:1,combatInput:{auto:true,left:true,right:true},monsterStatuses:new Map([[146,{}]])});f.state.world.motion.moving=true;
 fx.hitPlayer(c,f.r,f.state,skill,10000);assert.equal(f.state.world.dead,true);assert.equal(f.state.world.entity.property.HP,0);assert.equal(f.state.world.entity.physics.x,at.x);assert.equal(f.state.world.entity.physics.y,at.y);assert.equal(f.state.world.motion.moving,false);assert.equal(f.state.world.combatInput.auto,false);
 environment.flushEffects(f.game,c);assert.equal(decoded(packets(f),'death').length,2);
 const privateSettle=f.packets.filter(p=>p.route==='rm'&&decoded(decode('ReplicateMsg',p.raw).events,'settleInfo').length);assert.equal(privateSettle.length,1);assert.equal(privateSettle[0].state,f.state);assert.notEqual(privateSettle[0].state,peer);
 assert.equal(JSON.parse(fs.readFileSync(f.players.file))[2].pendingDeath.id,f.state.player.pendingDeath.id);assert.equal(f.state.player.deathCount,1);
 assert.equal(fx.hitPlayer(c,f.r,f.state,skill,10000),false);assert.equal(f.state.player.deathCount,1);
});
test('settlement converts only XP earned in this segment, using main/rookie constants',t=>{
 for(const level of ['main','rookie']){
  const f=fixture(t),c=context(f);f.state.world.level=level;f.state.player.coin=1050;f.state.player.exp=1000000;f.state.player.battleStats={...life.current(f.state),xpEarned:110000,coinEarned:1050,bossKills:1};
  fx.hitPlayer(c,f.r,f.state,skill,10000);const data=f.state.player.pendingDeath.data,factor=level==='rookie'?.5:1;
  assert.equal(data.totalExp,110000);assert.equal(data.killBossCount,1);assert.equal(data.expCoin,220*factor);assert.equal(data.titleExp,550*factor);assert.equal(data.reputationExp,1100*factor);assert.equal(f.state.player.coin,1050+220*factor);assert.equal(f.state.player.exp,1000000);
 }
});
test('death persistence failure leaves HP, shield, buffs and account state intact before retry',t=>{
 const f=fixture(t),c=context(f),hp=f.state.world.entity.property.HP,save=f.players.save.bind(f.players);f.state.world.entity.property.shield=10;f.state.world.monsterStatuses=new Map([[146,{}]]);f.players.save=()=>{throw Error('DISK_FULL');};
 assert.equal(fx.hitPlayer(c,f.r,f.state,skill,10000),false);assert.equal(f.state.world.entity.property.HP,hp);assert.equal(f.state.world.entity.property.shield,10);assert.equal(f.state.world.monsterStatuses.has(146),true);assert.equal(f.state.player.pendingDeath,undefined);assert.equal(c.events.length,0);
 f.players.save=save;assert.equal(fx.hitPlayer(c,f.r,f.state,skill,10000),true);assert.equal(f.state.player.deathCount,1);
});
test('continue keeps ceil(half level), charges quoted coins once and uses native spawn/protection',t=>{
 const f=fixture(t),time=Date.now();f.state.world.entity.property=progress.stats(1,45);f.state.player.coin=100;life.die(f.game,f.state,f.r,time);
 const reply=decode('IOGameEnterRsq',call(f,'battle.iob.reEnter','IOGameEnterReq',{roomId:f.state.world.room,enterType:1,uid:2}));assert.equal(reply.code,0);assert.equal(f.state.player.level,23);assert.equal(f.state.player.coin,80);assert.equal(f.state.player.exp,progress.totalForLevel(23));assert.equal(f.state.world.entity.property.HP,f.state.world.entity.property.maxHP);assert.deepEqual([f.state.world.entity.physics.x,f.state.world.entity.physics.y],[-28,-132]);
 assert.equal(f.state.player.battleStats.continues,1);assert.equal(f.state.player.battleStats.xpEarned,0);assert.ok(f.state.world.protectedUntil>=time+10000);assert.ok(decoded(packets(f),'relive').length);assert.ok(decoded(packets(f),'buffAdd').some(b=>b.type===28));
 assert.equal(decode('IOGameEnterRsq',call(f,'battle.iob.reEnter','IOGameEnterReq',{enterType:1})).code,1);assert.equal(f.state.player.coin,80);
});
test('insufficient coins, continuation cap, forged UID and invalid mode fail without mutation',t=>{
 const f=fixture(t);life.die(f.game,f.state,f.r);const before=structuredClone(f.state.player);
 assert.equal(decode('IOGameEnterRsq',call(f,'battle.iob.reEnter','IOGameEnterReq',{enterType:1})).code,9);assert.deepEqual(f.state.player,before);
 assert.equal(decode('IOGameEnterRsq',call(f,'battle.iob.reEnter','IOGameEnterReq',{enterType:3,uid:999})).code,1);assert.deepEqual(f.state.player,before);
 assert.equal(decode('IOGameEnterRsq',call(f,'battle.iob.reEnter','IOGameEnterReq',{enterType:99})).code,1);assert.deepEqual(f.state.player,before);
 f.state.player.battleStats.continues=3;assert.equal(decode('IOGameEnterRsq',call(f,'battle.iob.reEnter','IOGameEnterReq',{enterType:1})).code,28);assert.equal(f.state.world.dead,true);
 assert.equal(decode('IOGameEnterRsq',call(f,'battle.iob.reEnter','IOGameEnterReq',{enterType:3})).code,0);assert.equal(f.state.player.level,1);assert.equal(f.state.player.exp,0);assert.equal(f.state.player.battleStats.continues,0);
});
test('respawn save failure preserves the death, XP, money and position for retry',t=>{
 const f=fixture(t);f.state.player.coin=100;life.die(f.game,f.state,f.r);const before=structuredClone(f.state.player),at={...f.state.world.entity.physics},save=f.players.save.bind(f.players);f.players.save=()=>{throw Error('DISK_FULL');};
 assert.equal(decode('IOGameEnterRsq',call(f,'battle.iob.reEnter','IOGameEnterReq',{enterType:1})).code,1);assert.deepEqual(f.state.player,before);assert.equal(f.state.world.dead,true);assert.deepEqual(f.state.world.entity.physics,at);
 f.players.save=save;assert.equal(decode('IOGameEnterRsq',call(f,'battle.iob.reEnter','IOGameEnterReq',{enterType:1})).code,0);assert.equal(f.state.player.coin,80);
});
test('dead players cannot move, attack, pick up, drink or rotate; heartbeat/load still work',t=>{
 const f=fixture(t);life.die(f.game,f.state,f.r);const at={...f.state.world.entity.physics};
 for(const name of ['moveStart','rotateStart','attack','useCareerSkill','pickUpItem','drinkWater']){const codec=commands['Command'+name[0].toUpperCase()+name.slice(1)],raw=codec.encode({}).finish();const rsp=decode('FrameStepResp',call(f,'battle.iob.frame','FrameStepReq',{cmds:[{type:enums.CommandType[name],data:raw}]}));assert.equal(rsp.message,'PLAYER_DEAD',name);}
 world.tickWorld(f.game,.1);assert.deepEqual(f.state.world.entity.physics,at);assert.equal(f.state.world.entity.property.HP,0);
 assert.equal(decode('FrameStepResp',call(f,'battle.iob.frame','FrameStepReq',{cmds:[{type:enums.CommandType.loginLoadingFinish,data:Buffer.alloc(0)}]})).code,0);
});
test('Stage42 new login/reselection resets battle level and death while keeping settled currency',t=>{
 const f=fixture(t);life.die(f.game,f.state,f.r);const coin=f.state.player.coin;
 call(f,'game.gameHandler.enterBattle','IOGameLoginReq',{id:'battle-local-main'});
 assert.equal(f.state.world.dead,false);assert.equal(f.state.world.entity.property.level,1);assert.equal(f.state.player.exp,0);assert.equal(f.state.player.pendingDeath,null);assert.equal(f.state.player.coin,coin);
 call(f,'battle.iob.enter','IOGameEnterReq',{});assert.ok(f.state.world.entity.property.HP>0);
});

test('protection blocks damage outside town, expires, and does not accumulate buffs',t=>{
 const f=fixture(t),time=Date.now();life.die(f.game,f.state,f.r,time);life.respawn(f.game,f.state,3,time);f.state.world.entity.physics={x:f.r.x+100,y:f.r.y};
 const c=context(f,time+1000);assert.equal(fx.hitPlayer(c,f.r,f.state,skill,10),false);const events=[];life.protection(f.state,time+1000,events,world.entityEventData);life.protection(f.state,time+2000,events,world.entityEventData);assert.equal(decoded(events,'buffAdd').length,1);
 life.protection(f.state,time+10000,events,world.entityEventData);assert.equal(decoded(events,'buffRemove').length,1);assert.equal(f.state.world.entity.buffer.buffs.some(b=>b.type===28),false);
 c.time=time+10000;assert.equal(fx.hitPlayer(c,f.r,f.state,skill,10),true);
});
test('native resource collection does not become a critical strike',t=>{
 const f=fixture(t),r={...environment.templates.find(r=>r.kind==='tree'),dead:false,version:1};r.entity=environment.entity(r);f.runtime.rows=new Map([[r.id,r]]);f.state.world.entity.physics={x:r.x+100,y:r.y};f.state.world.motion.angle=180;Object.assign(f.state.world.entity.property.property,{crit:100,critHarm:1000});
 const result=require('../lib/actions-3127').attack(f.game,f.state,{aimAngle:180,random:()=>{throw Error('resource must not roll crit');}});assert.equal(result.hits[0].critical,false);assert.equal(result.hits[0].dmgType,6);
});
test('all emitted life and combat envelopes verify against original 3.12 schemas',t=>{
 const f=fixture(t),c=context(f);fx.hitPlayer(c,f.r,f.state,skill,10000);environment.flushEffects(f.game,c);
 for(const event of packets(f))assert.equal(proto.ReplicateMsg.verify({events:[event]}),null);
 assert.equal(proto.EntityInfo.verify(f.state.world.entity),null);
});
test('real mob XP, loot gold and kill counters feed the persisted battle segment exactly once',t=>{
 const f=fixture(t,1302);f.r.deathLootPlan=progress.plan(f.r,2,()=>0);environment.hit(f.game,f.state,f.r,1e9);
 assert.equal(f.state.player.battleStats.xpEarned,110000);assert.equal(f.state.player.battleStats.coinEarned,1050);assert.equal(f.state.player.battleStats.bossKills,1);
 environment.hit(f.game,f.state,f.r,1e9);assert.equal(f.state.player.battleStats.xpEarned,110000);
 life.die(f.game,f.state,{cid:1305,x:0,y:0});assert.equal(f.state.player.coin,1270);assert.equal(f.state.player.titleExp,550);assert.equal(f.state.player.reputation,1100);
 const inv=structuredClone(f.state.player.inventory),drops=structuredClone(f.state.player.groundDrops);life.respawn(f.game,f.state,1);
 assert.deepEqual(f.state.player.inventory,inv);assert.deepEqual(f.state.player.groundDrops,drops);
 const before=f.state.player.coin;life.die(f.game,f.state,{cid:1305});assert.equal(f.state.player.pendingDeath.data.totalExp,0);assert.equal(f.state.player.coin,before);assert.equal(f.state.player.titleExp,550);
});
test('finish converts an alive segment once; finishing an already settled death never pays twice',t=>{
 const f=fixture(t);f.state.player.battleStats={...life.current(f.state),xpEarned:10000,coinEarned:0};f.state.player.exp=10000;
 life.finish(f.game,f.state);assert.equal(f.state.player.coin,20);assert.equal(f.state.player.titleExp,50);assert.equal(f.state.player.exp,0);assert.equal(f.state.player.level,1);life.finish(f.game,f.state);assert.equal(f.state.player.coin,20);
 f.state.player.battleStats={...life.current(f.state),xpEarned:1000};life.die(f.game,f.state,f.r);const coin=f.state.player.coin,title=f.state.player.titleExp;life.finish(f.game,f.state);assert.equal(f.state.player.coin,coin);assert.equal(f.state.player.titleExp,title);assert.equal(f.state.player.pendingDeath,null);
});
test('reconnect retains the original protection deadline instead of extending or losing it',t=>{
 const f=fixture(t),time=Date.now();life.die(f.game,f.state,f.r,time);life.respawn(f.game,f.state,3,time);
 const deadline=f.state.player.rebornUntil;assert.equal(deadline,time+10000);f.state.world.protectedUntil=0;life.attach(f.state,time+1000);assert.equal(f.state.world.protectedUntil,deadline);life.attach(f.state,time+10000);assert.equal(f.state.world.protectedUntil,0);
 assert.equal(JSON.parse(fs.readFileSync(f.players.file))[2].rebornUntil,deadline);
});
test('account title XP is separate from hero XP and high unsigned hero XP never wraps in PlayerInfo',t=>{
 const f=fixture(t),profile=require('../lib/profile').profile;f.state.player.exp=progress.totalForLevel(200);f.state.player.titleExp=12345;
 const data=profile(f.state.user,f.state.player,f.state.world);assert.equal(data.titleExp,12345);assert.equal(Object.hasOwn(data,'totalExp'),false);assert.equal(decode('PlayerInfo',encode('PlayerInfo',data)).titleExp,12345);
 f.state.player.battleStats={...life.current(f.state),xpEarned:progress.totalForLevel(200)};life.die(f.game,f.state,f.r);assert.equal(f.state.player.pendingDeath.data.totalExp,progress.totalForLevel(200));assert.ok(f.state.player.pendingDeath.data.titleExp>0);
});
test('leaving view uses native leave reason; a killed monster uses dead reason after its death event',t=>{
 const {systemEvent}=require('../lib/proto');assert.equal(systemEvent.entityDestroyed.decode(world.destroyEvent([42]).data).entities[0].typ,1);
 const f=fixture(t);f.r.hp=1;f.r.entity.property.HP=1;f.state.world.motion.angle=180;f.state.world.entity.property.property.crit=0;const events=[];
 combat.handle(f.game,f.state,'attack',commands.CommandAttack.encode({}).finish(),events,world.entityEventData,world.destroyEvent);
 const death=events.findIndex(e=>e.entityID===f.r.id&&e.eventType===enums.EntityEvent.death),destroyed=events.findIndex(e=>e.entityID===-1&&e.eventType===enums.SystemEvent.entityDestroyed);
 assert.ok(death>=0&&destroyed>death);assert.equal(systemEvent.entityDestroyed.decode(events[destroyed].data).entities[0].typ,0);
});
test('hero critical absorbed by a monster shield does not emit a fake critical zero',t=>{
 const f=fixture(t);f.state.world.entity.property.property.crit=100;f.state.world.motion.angle=180;f.r.entity.property.shield=1000000;const hp=f.r.hp,events=[];
 combat.handle(f.game,f.state,'attack',commands.CommandAttack.encode({}).finish(),events,world.entityEventData,world.destroyEvent);
 const numbers=decoded(events,'subHP');assert.equal(f.r.hp,hp);assert.equal(numbers.length,1);assert.equal(numbers[0].dmgType,7);assert.equal(numbers[0].changeHP,0);assert.ok(numbers[0].showChangeHP>0);
});
