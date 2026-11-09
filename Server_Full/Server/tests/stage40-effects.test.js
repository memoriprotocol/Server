'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fx=require('../lib/monster-effects-3127'),cast=require('../lib/monster-skills-3127'),env=require('../lib/environment-3127'),world=require('../lib/world');
const {fixture}=require('./stage40-fixture.cjs'),{proto,entityEvent}=require('../lib/proto'),E=require('../CLIENT_ENUMS_3127.json').EntityEvent;
function context(f,time=100000){const c=fx.context(f.game,f.runtime,[...f.game.online],time,[],world.entityEventData,env.entity,(cid,level)=>require('../config/monster-models-3127.json').models[cid]?.[level>=31?2:1]||'');c.random=()=>0.99;return c;}
function start(f,id,time=100000){const c=context(f,time),p={skill:fx.definition(id),origin:{x:f.r.x,y:f.r.y},target:{x:f.r.x+1000,y:f.r.y},angle:0,endAt:time};fx.start(c,f.r,p,time);return {c,p};}
const decoded=(c,name)=>c.events.filter(e=>e.eventType===E[name]).map(e=>entityEvent[name].decode(e.data));
test('base damage uses the client tooltip formula and support HP percentages',t=>{const f=fixture(t,1305),s=fx.definition(2086);assert.equal(fx.damageFor(f.r,s,()=>0.99).amount,Math.floor(35000/100+79100/100*1.25));});
test('boss sector hits outside legacy 220 radius, misses behind, and respects city protection',t=>{
 const f=fixture(t,1305);f.state.world.entity.property.HP=10000;f.state.world.entity.property.maxHP=10000;f.state.world.entity.physics.x=f.r.x+900;const c=context(f);
 fx.hitArea(c,f.r,fx.definition(2086),{x:f.r.x,y:f.r.y},0);assert.ok(f.state.world.entity.property.HP<10000);const hp=f.state.world.entity.property.HP;
 f.state.world.entity.physics.x=f.r.x-900;fx.hitArea(c,f.r,fx.definition(2086),{x:f.r.x,y:f.r.y},0);assert.equal(f.state.world.entity.property.HP,hp);
 f.state.world.entity.physics={x:0,y:0};assert.equal(fx.hitPlayer(c,f.r,f.state,fx.definition(2086)),false);
});
test('healing and shield are distinct ally effects; shield absorbs and expires without healing',t=>{
 const f=fixture(t),c=context(f);f.r.hp=100;f.r.entity.property.HP=100;fx.support(c,f.r,fx.definition(2236),c.time);assert.equal(f.r.hp,123);
 const hp=f.r.hp;fx.support(c,f.r,fx.definition(2235),c.time);assert.equal(f.r.hp,hp);assert.equal(f.r.entity.property.shield,38);
 const hit=env.hit(f.game,f.state,f.r,20);assert.equal(hit.damage,0);assert.equal(hit.shieldChange,-20);assert.equal(f.r.hp,hp);assert.equal(f.r.entity.property.shield,18);
 fx.expireBuffs(f.r,c.time+5000,c);assert.equal(f.r.entity.property.shield,0);assert.equal(f.r.hp,hp);
});
test('attack and critical buffs change server properties, refresh without stacking, and revert',t=>{
 const f=fixture(t),c=context(f),base=f.r.entity.property.property.attack;
 fx.support(c,f.r,fx.definition(2238),c.time);assert.equal(f.r.entity.property.property.attack,base+Math.floor(base*.13));
 fx.support(c,f.r,fx.definition(2238),c.time+100);assert.equal(f.r.entity.property.property.attack,base+Math.floor(base*.13));
 fx.support(c,f.r,fx.definition(2232),c.time);assert.equal(f.r.entity.property.property.crit,55);
 fx.expireBuffs(f.r,c.time+5100,c);assert.equal(f.r.entity.property.property.attack,base);assert.equal(f.r.entity.property.property.crit,0);
});
test('tauren summons four real level40 mobs with their own skills, lifetime, and no reward farming',t=>{
 const f=fixture(t,1305),{c}=start(f,2247);const units=[...f.runtime.rows.values()].filter(r=>r.summoned);assert.equal(units.length,4);
 for(const r of units){assert.equal(r.cid,1208);assert.equal(r.level,40);assert.equal(r.entity.ownerID,f.r.id);assert.equal(proto.EntityInfo.verify(r.entity),null);assert.deepEqual(cast.skillsFor(r).map(s=>s.ID),[2051]);env.hit(f.game,f.state,r,1e9);}
 assert.equal(f.state.player.exp,undefined);fx.tick(c,118000);assert.equal([...f.runtime.rows.values()].some(r=>r.summoned),false);
});
test('golem fan uses twelve native energy entities, advances them, and destroys expired missiles',t=>{
 const f=fixture(t,1306),{c}=start(f,2088);assert.equal(c.created.length,12);
 for(const row of c.created){assert.equal(row.type,9);assert.equal(JSON.parse(row.entity.ud).skillId,2088);assert.equal(proto.EntityInfo.verify(row.entity),null);}
 const initial=c.created[0].x;fx.tick(c,100500);assert.notEqual(c.created[0].x,initial);fx.tick(c,104000);assert.equal([...f.runtime.rows.values()].some(r=>r.kind==='effect'),false);assert.equal(f.runtime.effectRuntime.jobs.length,0);
});
test('projectile return is two swept legs, each target hit once per leg even across a delayed tick',t=>{
 const f=fixture(t,1307);f.state.world.entity.property.HP=10000;f.state.world.entity.property.maxHP=10000;f.state.world.entity.physics.x=f.r.x+1000;
 const {c}=start(f,2092);fx.tick(c,101600);assert.equal(decoded(c,'subHP').length,2);fx.tick(c,102000);assert.equal(decoded(c,'subHP').length,2);assert.equal(f.runtime.effectRuntime.jobs.length,0);
});
test('acid volley supplies the exact client user-data contract, lands before damage, and expires pools',t=>{
 const f=fixture(t,1302),{c}=start(f,2049);assert.equal(c.created.length,20);
 for(const row of c.created){assert.equal(row.type,87);const ud=JSON.parse(row.entity.ud);assert.ok(ud.initPos&&ud.targetPos&&ud.maxDist);assert.equal(proto.EntityInfo.verify(row.entity),null);}
 const hp=f.state.world.entity.property.HP;fx.tick(c,100100);assert.equal(f.state.world.entity.property.HP,hp);fx.tick(c,103000);assert.ok(decoded(c,'skillBoom').length>=20);fx.tick(c,109000);assert.equal([...f.runtime.rows.values()].some(r=>r.kind==='effect'),false);
});
test('dash and burrow end events clean effects; an old life cannot damage after respawn',t=>{
 const f=fixture(t,1306),{c}=start(f,2089);fx.tick(c,102000);assert.ok(decoded(c,'skillBoom').some(e=>e.skillID===2089));assert.ok(decoded(c,'moveStop').length);
 const s=start(f,2088,103000).c;f.r.version++;const hp=f.state.world.entity.property.HP;fx.tick(s,104000);assert.equal(f.state.world.entity.property.HP,hp);assert.equal(f.runtime.effectRuntime.jobs.length,0);
});
test('poison and confusion use native IDs and timed server state, not only client icons',t=>{
 const f=fixture(t,1226),c=context(f);c.random=()=>0;fx.hitPlayer(c,f.r,f.state,fx.definition(2067));assert.ok(f.state.world.monsterStatuses.has(146));const hp=f.state.world.entity.property.HP;
 fx.tick(c,101000);assert.ok(f.state.world.entity.property.HP<hp);fx.tick(c,106000);assert.equal(f.state.world.monsterStatuses.has(146),false);
});
test('every emitted effect event and entity passes the 3.12 protobuf codec',t=>{
 for(const cid of [1210,1211,1213,1227,1230,1235,1238,1232,1258,1260,1264,1302,1305,1306,1307]){
  const f=fixture(t,cid);for(const s of cast.skillsFor(f.r)){const c=context(f),p={skill:s,origin:{x:f.r.x,y:f.r.y},target:{x:f.r.x+1000,y:f.r.y},angle:0,endAt:100000};fx.start(c,f.r,p,100000);fx.tick(c,100500);assert.equal(proto.ReplicateMsg.verify({events:c.events}),null);for(const row of c.created)assert.equal(proto.EntityInfo.verify(row.entity),null);}
 }
});
test('native mushroom illusion hides its owner, creates three native clones and reveals on real-clone death',t=>{
 const f=fixture(t,1235),{c}=start(f,2257,Date.now()),children=c.created;
 assert.equal(children.length,3);assert.deepEqual(children.map(r=>r.cid),[1058,1057,1057]);
 assert.equal(env.hit(f.game,f.state,f.r,100),null);
 for(const r of children){assert.equal(r.maxHP,3);assert.equal(r.stationary,true);assert.equal(proto.EntityInfo.verify(r.entity),null);}
 env.hit(f.game,f.state,children[0],3);assert.equal(f.state.player.exp,undefined);
 fx.tick(c,c.time+250);assert.equal(f.r.effectState.hiddenUntil,0);assert.equal(children.some(r=>f.runtime.rows.has(r.id)),false);
 assert.ok(decoded(c,'skillBoom').some(e=>e.skillID===2257));assert.ok(env.hit(f.game,f.state,f.r,1));
});
test('illusion duration and a late observer restore native hide/reveal state',t=>{
 const f=fixture(t,1235),time=Date.now(),{c}=start(f,2257,time);f.state.world.environmentSeen.clear();env.syncView(f.game,f.state);
 const events=f.packets.flatMap(p=>require('../lib/codec').decode('ReplicateMsg',p.raw).events);
 assert.ok(events.some(e=>e.entityID===f.r.id&&e.eventType===E.skillCast&&entityEvent.skillCast.decode(e.data).skillID===2257));
 fx.tick(c,time+5000);assert.equal(f.r.effectState.hiddenUntil,0);assert.equal(f.runtime.effectRuntime.jobs.length,0);
});
test('gas has native radius, deals area damage for eight seconds and is removed at expiry',t=>{
 const f=fixture(t,1230),{c}=start(f,2255);f.state.world.entity.property.HP=20000;f.state.world.entity.property.maxHP=20000;
 assert.equal(c.created[0].type,1056);assert.equal(JSON.parse(c.created[0].entity.ud).radius,900);
 fx.tick(c,100999);assert.equal(decoded(c,'subHP').length,0);fx.tick(c,101000);assert.equal(decoded(c,'subHP').length,1);
 fx.tick(c,108000);assert.equal(decoded(c,'subHP').length,8);assert.equal(f.runtime.rows.has(c.created[0].id),false);
 fx.tick(c,109000);assert.equal(decoded(c,'subHP').length,8);
});
test('hurricane uses the verified native prefab and swept projectile collision',t=>{
 const f=fixture(t,1264),{c}=start(f,2268);assert.equal(c.created[0].type,1053);
 assert.equal(JSON.parse(c.created[0].entity.ud).prefab_path,'arena/skills/vultureHurriance/prefab/vultureHurriance');
 fx.tick(c,101100);assert.equal(decoded(c,'subHP').length,1);assert.equal(f.runtime.effectRuntime.jobs.length,0);
});
test('native flower keeps client level, HP and lifetime without fabricated skills or rewards',t=>{
 const f=fixture(t,1258),{c}=start(f,2297),r=c.created[0];assert.equal(r.cid,1259);assert.equal(r.type,1108);assert.equal(r.level,1);assert.equal(r.maxHP,2);assert.equal(r.stationary,true);assert.equal(r.expiresAt,120000);
 assert.deepEqual(cast.skillsFor(r),[]);fx.tick(c,119999);assert.ok(f.runtime.rows.has(r.id));fx.tick(c,120000);assert.equal(f.runtime.rows.has(r.id),false);assert.equal(f.state.player.exp,undefined);
});
test('environment sends transient spawns before their movement and removes effects after source death',t=>{
 const f=fixture(t,1306),time=Date.now(),{c}=start(f,2088,time);env.flushEffects(f.game,c);const moved=context(f,time+50);fx.tick(moved,time+50);env.flushEffects(f.game,moved);
 const all=f.packets.flatMap(p=>require('../lib/codec').decode('ReplicateMsg',p.raw).events),row=c.created[0];
 const spawn=all.findIndex(e=>e.entityID===-1&&e.eventType===require('../CLIENT_ENUMS_3127.json').SystemEvent.entityCreated&&require('../lib/proto').systemEvent.entityCreated.decode(e.data).entities.some(x=>x.id===row.id));
 const move=all.findIndex(e=>e.entityID===row.id&&e.eventType===E.moveTo);assert.ok(spawn>=0&&move>spawn);
 f.r.dead=true;const cleanup=context(f,time+500);fx.tick(cleanup,time+500);env.flushEffects(f.game,cleanup);
 assert.equal(f.runtime.effectRuntime.jobs.length,0);assert.equal([...f.runtime.rows.values()].filter(r=>r.transient).length,0);assert.equal(f.state.world.environmentSeen.has(row.id),false);
});
