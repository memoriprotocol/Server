'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fixture=require('./helpers/stage43-fixture');
const H=require('../lib/hero-init-passives-3127'),P=require('../lib/hero-passives-3127');
const W=require('../lib/world'),CI=require('../lib/combat-input-3127');
const {entityEvent}=require('../lib/proto'),EE=require('../CLIENT_ENUMS_3127.json').EntityEvent;
const heroes=require('../config/schemes/HeroScheme.json').Hero;
const skillRows=require('../config/schemes/SkillScheme.json').Skill;
function setHero(f,id,star=1){const w=f.state.world;f.state.player.heroId=id;w.entity.miscInfo.heroId=id;w.entity.miscInfo.heroStar=star;w.entity.property.level=10;w.dead=false;w.sceneReady=true;return w.entity;}
function get(events,type){return events.filter(e=>e.eventType===EE[type]).map(e=>entityEvent[type].decode(e.data));}
function sync(f,time=100000){const events=[];H.sync(f.state,time,events,W.entityEventData);return events;}
for(const hero of heroes)for(const star of [1,2,3])test('native initSelfBuff for hero '+hero.ID+' star '+star+' excludes dedicated 23/24',t=>{
 const f=fixture(t),e=setHero(f,hero.ID,star),events=sync(f),expected=H.profile(hero.ID,star);
 const types=expected.map(p=>p.type);
 assert.deepEqual(get(events,'buffAdd').map(b=>b.type),types);
 assert.deepEqual((e.buffer?.buffs||[]).filter(b=>types.includes(b.type)).map(b=>b.type),types);
 for(const item of expected){const b=e.buffer.buffs.find(v=>v.type===item.type);assert.deepEqual(JSON.parse(b.buffExJson),item.parsed);assert.equal(b.duration,item.duration);}
 assert.equal(get(sync(f),'buffAdd').length,0,'no repeat frames on steady state');
});
test('init buffs are actor/life/star/room scoped and wiped after death, hero change, then reapplied',t=>{
 const f=fixture(t),e=setHero(f,12,1),start=sync(f);
 assert.deepEqual(get(start,'buffAdd').map(x=>x.type),[237,752]);
 e.miscInfo.heroStar=3;let changed=sync(f);assert.deepEqual(get(changed,'buffRemove').map(x=>x.type),[237,752]);
 assert.equal(JSON.parse(e.buffer.buffs.find(x=>x.type===752).buffExJson).heroSkillCD,70);
 f.state.world.room='different';changed=sync(f);assert.equal(get(changed,'buffAdd').length,2);
 f.state.world.dead=true;changed=sync(f);assert.deepEqual(get(changed,'buffRemove').map(x=>x.type),[237,752]);
 f.state.world.dead=false;e.miscInfo.heroId=26;changed=sync(f);assert.deepEqual(get(changed,'buffAdd').map(x=>x.type),[237,673]);
});
test('all hero init statuses must be actual native 3.12.7 BuffScheme IDs and exact SkillScheme arguments',()=>{
 const buffIds=new Set(require('../config/schemes/BuffScheme.json').Buff.map(b=>b.type));
 for(const h of heroes)for(const star of [1,2,3]){
  const p=H.profile(h.ID,star);for(const b of p){assert.ok(buffIds.has(b.type));assert.ok(h.Skills.includes(b.skillID));
   const r=skillRows.find(x=>x.ID===b.skillID&&x.level===star);assert.equal(b.parsed.propValue??0,Number(require('../lib/player-skills-3127').buffArgs(r.initSelfBuffArgs[r.initSelfBuff.indexOf(b.type)]).propValue)||0);
  }
 }
});
for(const star of [1,2,3])test('Ninja passive buff752 reduces hero AND weapon cooldown by client args: star'+star,t=>{
 const f=fixture(t);setHero(f,12,star);
 const row=skillRows.find(x=>x.ID===6014&&x.level===star),args=require('../lib/player-skills-3127').buffArgs(row.initSelfBuffArgs[1]);
 assert.equal(args.heroSkillCD,[30,50,70][star-1]);assert.equal(args.weaponSkillCD,[30,50,70][star-1]);
 assert.equal(P.ninjaReduction(f.state,'hero'),args.heroSkillCD);
 assert.equal(P.ninjaReduction(f.state,'weapon'),args.weaponSkillCD);
 assert.equal(P.heroCooldown(f.state,row),Math.round(row.cd*(1-args.heroSkillCD/100)));
 const basic={ID:3090,cd:10000},weapon={weaponType:1};
 assert.equal(P.weaponCooldown(f.state,weapon,basic),Math.round(10000*(1-args.weaponSkillCD/100)));
 setHero(f,1);assert.equal(P.ninjaReduction(f.state,'hero'),0);assert.equal(P.heroCooldown(f.state,row),row.cd);
});
test('Ninja weapon cooldown and hero cooldown do not activate when level < 10 or character dead',t=>{
 const f=fixture(t),e=setHero(f,12,3),row=skillRows.find(x=>x.ID===6014&&x.level===3);
 e.property.level=9;assert.equal(P.ninjaReduction(f.state,'weapon'),0);
 e.property.level=10;f.state.world.dead=true;assert.equal(P.ninjaReduction(f.state,'weapon'),0);
 f.state.world.dead=false;assert.equal(P.ninjaReduction(f.state,'weapon'),70);
});
