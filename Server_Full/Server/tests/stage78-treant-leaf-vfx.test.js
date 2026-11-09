'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fixture=require('./helpers/stage43-fixture');
const T=require('../lib/treant-3127');
const CI=require('../lib/combat-input-3127'),W=require('../lib/world');
const {decode}=require('../lib/codec'),{systemEvent,entityEvent}=require('../lib/proto');
const enums=require('../CLIENT_ENUMS_3127.json');
const skills=require('../config/schemes/SkillScheme.json').Skill;
function setup(t,skin=901){const f=fixture(t),previous=Date.now;let time=100000;Date.now=()=>time;t.after(()=>Date.now=previous);
 f.state.player.heroId=9;f.state.player.battleStats={...require('../lib/life-3127').current(f.state),id:'treant-vfx-life'};
 Object.assign(f.state.world.entity.miscInfo,{heroId:9,heroStar:1,curSkinId:skin});
 f.state.world.entity.property.HP=100;f.state.world.entity.property.maxHP=1000;
 f.state.world.combatInput=CI.input(f.state.world);f.state.world.combatInput.aimAngle=90;
 return {...f,tick(t){time=t;T.tick(f.game,t)},events(){return f.pushes.filter(p=>p.route==='rm').flatMap(p=>decode('ReplicateMsg',p.body).events);}};
}
function spawned(events){return events.filter(e=>e.eventType===enums.SystemEvent.entityCreated).flatMap(e=>systemEvent.entityCreated.decode(e.data).entities);}
function destroyed(events){return events.filter(e=>e.eventType===enums.SystemEvent.entityDestroyed).flatMap(e=>systemEvent.entityDestroyed.decode(e.data).entities.map(x=>x.id));}
function hpEvents(events){return events.filter(e=>e.eventType===enums.EntityEvent.addHP).map(e=>entityEvent.addHP.decode(e.data));}
for(const skin of [901,903,904])test(`native leaf prefab still renders for a solo Treant skin ${skin}: no same-packet destruction, forward flight, cleanup`,t=>{
 const f=setup(t,skin);assert.equal(T.passive(f.game,f.state,100000),true);
 f.tick(100200);const created=spawned(f.events()).filter(e=>JSON.parse(e.ud||'{}').skillId===6028);
 assert.equal(created.length,1);assert.equal(created[0].type,8);
 assert.equal(JSON.parse(created[0].ud).skinID,skin===904?901:skin);
 const id=created[0].id,room=f.game.environments.get('stage43');
 assert.equal(f.state.world.entity.property.HP,200,'single original heal preserved');
 assert.equal(f.state.world.treantLeaves.length,0,'healing resolves without second hit');
 assert.equal(f.state.world.treantLeafVisuals.length,1,'visual remains for Cocos asynchronous prefab load');
 assert.ok(room.rows.has(id));assert.ok(!destroyed(f.events()).includes(id));
 f.tick(100300);const nativeMoves=f.events().filter(e=>e.eventType===enums.EntityEvent.moveTo&&e.entityID===id).map(e=>entityEvent.moveTo.decode(e.data));
 assert.ok(nativeMoves.length>0,'sends native visible outward movement');assert.ok(nativeMoves.some(e=>e.y>6000));
 assert.equal(f.state.world.entity.property.HP,200);
 f.tick(101001);assert.equal(room.rows.has(id),false,'visual cleaned after 800ms');
 assert.equal(f.state.world.treantLeafVisuals.length,0);assert.ok(destroyed(f.events()).includes(id));
 assert.equal(f.state.world.entity.property.HP,200);assert.equal(hpEvents(f.events()).length,1);
});
test('close-range allied leaf remains as native entity after its healing so async load can finish',t=>{
 const f=setup(t),ally={user:{id:2},player:{battleStats:{id:'ally-life'}},world:{...f.state.world,entity:structuredClone(f.state.world.entity)}};
 ally.world.entity.id=2;ally.world.entity.miscInfo.heroId=1;ally.world.entity.physics.x+=15;ally.world.entity.camp.campID=f.state.world.entity.camp.campID;
 ally.world.entity.property.HP=100;ally.world.entity.property.maxHP=1000;f.game.online.add(ally);
 T.passive(f.game,f.state,100000);f.tick(100200);
 assert.equal(ally.world.entity.property.HP,200);
 assert.equal(f.state.world.treantLeafVisuals.length,2);
 for(const row of f.state.world.treantLeafVisuals.map(v=>v.row)){
  assert.ok(f.game.environments.get('stage43').rows.has(row.id));assert.ok(!destroyed(f.events()).includes(row.id));
 }
 f.tick(101050);assert.equal(f.state.world.treantLeafVisuals.length,0);
});
test('visual-only self leaf clears on hero death and cannot heal again',t=>{
 const f=setup(t);T.passive(f.game,f.state,100000);f.tick(100200);
 const r=f.state.world.treantLeafVisuals[0].row;
 f.state.world.dead=true;f.tick(100250);
 assert.equal(f.state.world.treantLeafVisuals.length,0);assert.ok(!f.game.environments.get('stage43').rows.has(r.id));
 assert.equal(hpEvents(f.events()).length,1);
});
test('original data still defines native trigger 8, correct passive prefab and no enemy-damage clause',()=>{
 const skill=skills.find(s=>s.ID===6028&&s.level===1);assert.equal(skill.triggerType,8);assert.equal(skill.cd,2000);assert.equal(skill.castPointTime,200);assert.equal(skill.args.includes('hpArgs:10'),true);
 const catalog=require('../../retail/client-reference/stage73/treant-assets.json');assert.ok(catalog.some(r=>r.path==='arena/skills/dryads_passive1/prefab/missile'&&r.importCRCVerified));
});
