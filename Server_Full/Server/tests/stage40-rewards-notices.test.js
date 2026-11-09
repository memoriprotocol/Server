'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./stage40-fixture.cjs'),env=require('../lib/environment-3127'),progress=require('../lib/progression-3127'),notices=require('../lib/boss-notices-3127'),inv=require('../lib/inventory');
const {proto,systemEvent,entityEvent}=require('../lib/proto'),{decode}=require('../lib/codec'),enums=require('../CLIENT_ENUMS_3127.json');
function events(f){return f.packets.filter(p=>p.route==='rm').flatMap(p=>decode('ReplicateMsg',p.raw).events);}
function messages(f){return events(f).filter(e=>e.systemType===enums.SystemType.msg&&e.eventType===enums.SystemEvent.systemMsg).map(e=>systemEvent.systemMsg.decode(e.data));}
test('all Map2 actors have resolvable client drop graphs; missing exact rows are explicitly marked',()=>{
 for(const r of env.templates.filter(r=>['mob','boss'].includes(r.kind))){for(const random of [()=>0,n=>n-1]){const p=progress.plan(r,2,random);assert.ok(p.rewards.every(x=>inv.items.has(x.itemId)&&Number.isSafeInteger(x.count)&&x.count>0));if(p.fallback)assert.deepEqual([r.cid,r.level,p.sourceLevel],[1210,75,60]);}}
 assert.throws(()=>progress.rollGroup(-1),/MISSING_DROP_GROUP/);
});
test('independent nested draws preserve repeated groups and use exact client quantities',()=>{
 const p=progress.plan({cid:1302,level:105},2,()=>0);
 assert.equal(p.rewards.find(x=>x.itemId===4).count,110000);
 assert.equal(p.rewards.find(x=>x.itemId===109).count,1050);
 assert.equal(p.fallback,false);
});
test('monster kill grants XP, crosses several levels, updates real stats and persists once',t=>{
 const f=fixture(t);f.r.deathLootPlan=progress.plan(f.r,2,()=>0);const expectedXP=f.r.deathLootPlan.rewards.find(x=>x.itemId===4).count;
 const before=f.state.world.entity.property.maxHP;const result=env.hit(f.game,f.state,f.r,1e9);assert.ok(result.dead);
 assert.equal(f.state.player.exp,expectedXP);assert.ok(f.state.player.level>1);assert.ok(f.state.world.entity.property.maxHP>before);
 assert.equal(f.state.world.entity.property.property.attack,progress.stats(1,f.state.player.level).property.attack);
 const saved=JSON.parse(require('node:fs').readFileSync(f.players.file));assert.equal(saved[2].exp,expectedXP);
 const n=f.state.player.groundDrops.length;assert.ok(n>0);assert.equal(env.hit(f.game,f.state,f.r,1e9),null);assert.equal(f.state.player.exp,expectedXP);assert.equal(f.state.player.groundDrops.length,n);
 const expEvents=events(f).filter(e=>e.eventType===enums.EntityEvent.addExp);assert.equal(expEvents.length,1);assert.equal(entityEvent.addExp.decode(expEvents[0].data).addedExp,expectedXP);
 assert.equal(progress.initial(f.state,f.state.world.entity).maxHP,progress.stats(1,f.state.player.level).maxHP);
});
test('death save failure rolls back XP, drops, kill and HP; retry keeps the same loot roll',t=>{
 const f=fixture(t),hp=f.r.hp,save=f.players.save.bind(f.players);f.r.deathLootPlan=progress.plan(f.r,2,()=>0);const plan=f.r.deathLootPlan;
 f.players.save=()=>{throw Error('DISK_FULL')};assert.throws(()=>env.hit(f.game,f.state,f.r,1e9),/PERSISTENCE_FAILED/);
 assert.equal(f.r.hp,hp);assert.equal(f.r.dead,false);assert.equal(f.state.player.exp,undefined);assert.equal(f.state.player.groundDrops,undefined);assert.equal(messages(f).length,0);assert.equal(f.r.deathLootPlan,plan);
 f.players.save=save;env.hit(f.game,f.state,f.r,1e9);assert.equal(f.state.player.exp,plan.rewards.find(x=>x.itemId===4).count);
});
test('team XP is conserved, personal XP stays with killer, distant and other-room peers are excluded',t=>{
 const f=fixture(t,1302),peer=f.player(3),far=f.player(4),other=f.player(5);far.world.entity.physics.x+=6000;other.world.room='elsewhere';f.game.teams={teamFor:()=>({members:[2,3,4,5]})};f.r.deathLootPlan=progress.plan(f.r,2,()=>0);env.hit(f.game,f.state,f.r,1e9);
 assert.equal(f.state.player.exp,90000);assert.equal(peer.player.exp,20000);assert.equal(far.player.exp,undefined);assert.equal(other.player.exp,undefined);assert.equal(f.state.player.exp+peer.player.exp,110000);
 assert.equal(messages(f).filter(x=>x.type==='kill_boss').length,4); // notices are server-wide; XP is still room/range limited
});
test('boss death and respawn use the 3.12 envelopes, once per life, across rooms',t=>{
 const f=fixture(t,1305),outsider=f.player(3);outsider.world.room='elsewhere';f.r.deathLootPlan=progress.plan(f.r,2,()=>0);env.hit(f.game,f.state,f.r,1e9);
 const kill=messages(f).find(x=>x.type==='kill_boss');assert.ok(kill);assert.equal(JSON.parse(kill.data).bossID,1305);assert.equal(events(f).find(e=>e.eventType===enums.SystemEvent.systemMsg&&e.entityID===-1).systemType,22);assert.notEqual(enums.SystemType.msg,25);
 notices.killed(f.game,f.state,f.r);assert.equal(messages(f).filter(x=>x.type==='kill_boss').length,2);
 notices.respawnSoon(f.game,'stage40',f.r,f.r.respawnAt-30000);notices.respawnSoon(f.game,'stage40',f.r,f.r.respawnAt-1);assert.equal(messages(f).filter(x=>x.type==='boss_alert').length,2);
 const oldToken=f.r.spawnToken;f.r.entity=env.entity(f.r);f.r.dead=false;notices.respawn(f.game,'stage40',f.r);notices.respawn(f.game,'stage40',f.r);assert.notEqual(f.r.spawnToken,oldToken);
 const spawn=events(f).filter(e=>e.systemType===enums.SystemType.mapResources&&e.eventType===enums.SystemEvent.createBoss);assert.equal(spawn.length,2);const data=systemEvent.createBoss.decode(spawn[0].data);assert.equal(data.cid,1305);assert.equal(data.asNew,true);
 assert.equal(f.packets.filter(p=>p.state===outsider).length,3);
});
test('rainbow/mythic boss-loot notice fires only after a committed pickup, not on drop or failure',t=>{
 const f=fixture(t,1302),id=[...inv.items.keys()].find(id=>notices.rarity(id)>=6),drop={id:1000000001,room:f.state.world.room,ownerId:2,item:{uuid:'rare-drop',itemCfgId:id,num:1,extInfo:{},bagType:1,bagPos:0},x:f.state.world.entity.physics.x,y:f.state.world.entity.physics.y,createdAt:Date.now(),sourceBossCID:1302};
 f.state.player.groundDrops=[drop];f.players.save();assert.equal(messages(f).length,0);
 const save=f.players.save.bind(f.players);f.players.save=()=>{throw Error('DISK_FULL')};assert.throws(()=>inv.runInventory(f.game,f.state,'pickUpItem',{id:drop.id}),/PERSISTENCE_FAILED/);assert.equal(messages(f).length,0);assert.equal(f.state.player.groundDrops.length,1);
 f.players.save=save;inv.runInventory(f.game,f.state,'pickUpItem',{id:drop.id});const valuable=messages(f).filter(x=>x.type==='get_valuable');assert.equal(valuable.length,1);assert.equal(JSON.parse(valuable[0].data).itemId,id);assert.equal(f.state.player.groundDrops.length,0);
 assert.throws(()=>inv.runInventory(f.game,f.state,'pickUpItem',{id:drop.id}),/DROP_NOT_FOUND/);assert.equal(messages(f).filter(x=>x.type==='get_valuable').length,1);
});
test('actual environment respawn timer warns once, restores the boss and emits native createBoss once',t=>{
 const f=fixture(t,1305),original=Date.now;let clock=original();Date.now=()=>clock;t.after(()=>{Date.now=original;});
 f.r.deathLootPlan=progress.plan(f.r,2,()=>0);env.hit(f.game,f.state,f.r,1e9);const token=f.r.spawnToken;
 clock=f.r.respawnAt-30000;env.tick(f.game,.25);clock+=250;env.tick(f.game,.25);assert.equal(messages(f).filter(x=>x.type==='boss_alert').length,1);
 clock=f.r.respawnAt;env.tick(f.game,.25);assert.equal(f.r.dead,false);assert.equal(f.r.hp,f.r.maxHP);assert.notEqual(f.r.spawnToken,token);
 clock+=250;env.tick(f.game,.25);assert.equal(events(f).filter(e=>e.systemType===enums.SystemType.mapResources&&e.eventType===enums.SystemEvent.createBoss).length,1);
});
test('XP is conserved at every level boundary and totals above int32 use the unsigned native event',t=>{
 for(const row of progress.levelRows()){const total=progress.totalForLevel(row.level);assert.equal(progress.progress(total).level,row.level);if(row.level>1)assert.equal(progress.progress(total-1).level,row.level-1);}
 const f=fixture(t),total=progress.totalForLevel(200);f.state.player.exp=total;f.state.player.progressionVersion=40;
 const snapshot=progress.initial(f.state,f.state.world.entity);assert.equal(snapshot.level,200);assert.equal(Object.hasOwn(snapshot,'totalExp'),false);assert.equal(proto.EntityInfo.verify({...f.state.world.entity,property:snapshot}),null);
 const codec=entityEvent.updateTotalExp;assert.equal(codec.decode(codec.encode({totalExp:total}).finish()).totalExp,total);
 f.r.deathLootPlan=progress.plan(f.r,2,()=>0);env.hit(f.game,f.state,f.r,1e9);const wire=events(f).find(e=>e.eventType===enums.EntityEvent.updateTotalExp);assert.equal(codec.decode(wire.data).totalExp,f.state.player.exp);assert.ok(f.state.player.exp>2147483647);
});
test('category drops respect client Weight and exclude zero-weight universal jewels',()=>{
 const jewels=require('../config/schemes/JewelScheme.json').Jewel;
 for(let grade=1;grade<=7;grade++)for(const type of [6,11,13]){const rows=progress.candidateRows(type,grade);assert.ok(rows.every(r=>r.weight>0));assert.equal(new Set(rows.map(r=>r.itemId)).size,rows.length);}
 for(const j of jewels.filter(j=>j.Weight===0))assert.equal(progress.candidates(13,j.Star).includes(j.ID),false);
});
test('a socket delivery failure after saving never grants the same kill twice',t=>{
 const f=fixture(t);f.r.deathLootPlan=progress.plan(f.r,2,()=>0);f.game.push=()=>{throw Error('SOCKET_CLOSED');};const result=env.hit(f.game,f.state,f.r,1e9),xp=f.state.player.exp;
 assert.equal(result.dead,true);assert.equal(env.hit(f.game,f.state,f.r,1e9),null);assert.equal(f.state.player.exp,xp);assert.equal(f.state.player.mobKills,1);
 assert.equal(JSON.parse(require('node:fs').readFileSync(f.players.file))[2].exp,xp);
});
test('rare manual drops and ordinary boss items do not trigger valuable-loot announcements',t=>{
 const f=fixture(t),id=[...inv.items.keys()].find(id=>notices.rarity(id)>=6);
 assert.equal(notices.pickup(f.game,f.state,{item:{itemCfgId:id}}),false);assert.equal(notices.pickup(f.game,f.state,{sourceBossCID:1302,item:{itemCfgId:5}}),false);assert.equal(messages(f).length,0);
});
test('one disconnected player cannot suppress boss announcements to other room members',t=>{
 const f=fixture(t,1305),peer=f.player(3),push=f.game.push;f.game.push=(s,...args)=>{if(s===f.state)throw Error('SOCKET_CLOSED');push(s,...args);};f.r.deathLootPlan=progress.plan(f.r,2,()=>0);
 env.hit(f.game,f.state,f.r,1e9);assert.equal(f.r.dead,true);assert.equal(f.state.player.bossKills,1);
 const delivered=f.packets.filter(p=>p.state===peer&&p.route==='rm').flatMap(p=>decode('ReplicateMsg',p.raw).events).filter(e=>e.systemType===22&&e.eventType===20).map(e=>systemEvent.systemMsg.decode(e.data));
 assert.equal(delivered.filter(m=>m.type==='kill_boss').length,1);notices.killed(f.game,f.state,f.r);assert.equal(messages(f).filter(m=>m.type==='kill_boss').length,1);
});
