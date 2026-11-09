'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fixture=require('./helpers/stage43-fixture');
const T=require('../lib/treant-3127'),W=require('../lib/world');
const H=require('../lib/hero-summons-3127'),CI=require('../lib/combat-input-3127');
const enums=require('../CLIENT_ENUMS_3127.json').EntityEvent;
const {entityEvent}=require('../lib/proto');
function setup(t,skin=903){
 const f=fixture(t),old=Date.now;let now=100000;Date.now=()=>now;t.after(()=>Date.now=old);
 f.state.player.heroId=9;f.state.player.battleStats={...require('../lib/life-3127').current(f.state),id:'caster-life'};
 Object.assign(f.state.world.entity.miscInfo,{heroId:9,heroStar:3,curSkinId:skin});
 f.state.world.entity.property.HP=800;f.state.world.entity.property.maxHP=1000;
 const peer={user:{id:2},player:{battleStats:{id:'ally-life'}},world:{...f.state.world,entity:structuredClone(f.state.world.entity)}};
 peer.world.entity.id=2;peer.world.entity.miscInfo.heroId=5;peer.world.entity.miscInfo.curSkinId=501;
 peer.world.entity.physics.x+=300;peer.world.entity.property.HP=1000;peer.world.entity.property.maxHP=1000;
 peer.world.entity.camp.campID=f.state.world.entity.camp.campID;
 peer.world.petActors=new Map();peer.world.environmentSeen=new Map();f.game.online.add(peer);
 return {...f,peer,now:()=>now,tick(n){now=n;T.tick(f.game,n);},events(){return f.pushes.filter(p=>p.route==='rm').flatMap(p=>require('../lib/codec').decode('ReplicateMsg',p.body).events);}};
}
function unit(f,kind,cid=1001){
 const owner=f.peer,e=structuredClone(owner.world.entity),id=kind==='battlePet'?885001:875001;
 e.id=id;e.physics={x:owner.world.entity.physics.x+100,y:6000,rotation:0,direction:1};
 e.property.HP=150;e.property.maxHP=1000;
 let r;
 if(kind==='battlePet'){
  r={id,cid,kind,owner,entity:e,hp:150,maxHP:1000,room:owner.world.room,mapId:2,dead:false,mounted:false};
  owner.world.petActors.set(cid,r);
 }else{
  r=H.entity(f.game,owner,2001,{x:e.physics.x,y:e.physics.y},100000,100000);
  r.hp=150;r.maxHP=1000;r.entity.property.HP=150;r.entity.property.maxHP=1000;
  owner.heroSummonRooms=new Set([owner.world.room]);
 }
 f.game.environments.get(owner.world.room).rows.set(r.id,r);
 return r;
}
function ev(f,name){return f.events().filter(x=>x.eventType===enums[name]).map(x=>({id:x.entityID,data:entityEvent[name].decode(x.data)}));}
for(const kind of ['battlePet','heroSummon']){
 test('native6028 leaf targets and heals living allied '+kind+' on projectile contact, with native VFX',t=>{
  const f=setup(t),r=unit(f,kind);assert.equal(T.passive(f.game,f.state,100000),true);f.tick(100199);
  assert.equal(r.hp,150);assert.equal(f.state.world.treantLeaves?.length||0,0);
  f.tick(100200);const leaf=f.state.world.treantLeaves.find(j=>j.target===r);
  assert.ok(leaf);assert.equal(leaf.targetKind,'unit');assert.equal(leaf.row.entity.type,8);
  assert.deepEqual(Object.entries(JSON.parse(leaf.row.entity.ud)).filter(([k])=>['skillId','skinID','skillLv'].includes(k)).sort(),[['skillId',6028],['skillLv',3],['skinID',903]].sort());
  assert.ok(f.events().some(e=>e.entityID===leaf.row.id&&e.eventType===enums.moveStop)===false);
  assert.equal(r.hp,150);
  for(let n=100250;n<=101200;n+=50){f.tick(n);if(r.hp>150)break;}
  assert.equal(r.hp,250);assert.equal(r.entity.property.HP,250);
  assert.equal(ev(f,'addHP').filter(x=>x.id===r.id).length,2); // one event per room peer
  assert.equal(f.state.world.treantLeaves.some(j=>j.target===r),false);
  f.tick(101500);assert.equal(r.hp,250);
 });
 test('leaf cancels '+kind+' heal when the actor disappears before contact',t=>{
  const f=setup(t),r=unit(f,kind);T.passive(f.game,f.state,100000);f.tick(100200);
  if(kind==='battlePet')f.peer.world.petActors.delete(r.cid);
  else r.dead=true;
  f.tick(100500);assert.equal(r.hp,150);assert.equal(f.state.world.treantLeaves.some(j=>j.target===r),false);
 });
 test('leaf never heals a replacement '+kind+' sharing the old entity ID',t=>{
  const f=setup(t),r=unit(f,kind);T.passive(f.game,f.state,100000);f.tick(100200);
  const actor=r.entity;r.entity=structuredClone(actor);f.tick(100500);
  assert.equal(r.hp,150);assert.equal(f.state.world.treantLeaves.some(j=>j.target===r),false);
 });
}
test('native Treant weapon-passive is not an enemy-hit lifesteal or ordinary attack effect',t=>{
 const f=setup(t),r=unit(f,'battlePet'),enemy={user:{id:3},player:{battleStats:{id:'other'}},world:{...f.peer.world,entity:structuredClone(f.peer.world.entity)}};
 enemy.world.entity.id=3;enemy.world.entity.physics.x=6050;enemy.world.entity.camp.campID=777;
 enemy.world.entity.property.HP=15;enemy.world.entity.property.maxHP=1000;f.game.online.add(enemy);
 assert.equal(f.state.world.treantLeafCasts,undefined);
 const weapon=require('../lib/inventory').weapons.find(w=>w.level===1&&w.skill2&&require('../config/schemes/SkillScheme.json').Skill.some(s=>s.ID===w.skill2&&s.level===1));
 f.state.world.entity.equip.currentItemID=weapon.weaponID;
 assert.equal(CI.castWeapon(f.state,[],W.entityEventData,weapon.skill2,f.game),true);
 f.tick(100200);assert.ok(f.state.world.treantLeaves.some(j=>j.target===r));
 assert.equal(f.state.world.treantLeaves.some(j=>j.target===enemy),false);
 assert.equal(enemy.world.entity.property.HP,15);
 });

test('native6028 creates self leaf and at most three allies, with count growing by recipients',t=>{
 const f=setup(t),p1=f.peer;
 const p2={user:{id:5},player:{battleStats:{id:'ally-5'}},world:{...p1.world,entity:structuredClone(p1.world.entity)}};
 p2.world.entity.id=5;p2.world.entity.physics.x=f.state.world.entity.physics.x+100;
 p2.world.entity.camp.campID=f.state.world.entity.camp.campID;p2.world.petActors=new Map();
 f.game.online.add(p2);
 const pet=unit(f,'battlePet');const summon=unit(f,'heroSummon');
 f.state.world.entity.property.HP=400;
 assert.equal(T.passive(f.game,f.state,100000),true);
 f.tick(100200);
 const leaves=f.state.world.treantLeaves;
 assert.equal(leaves.length,3); // no leaf for healthy p1/p2 beyond 3 available friendly units
 assert.equal(leaves.filter(j=>j.target===f.state).length,0); // self leaf resolves instantly
 assert.equal(leaves.filter(j=>j.target===pet).length,1);
 assert.equal(leaves.filter(j=>j.target===summon).length,1);
 assert.equal(leaves.filter(j=>j.target===p1).length+leaves.filter(j=>j.target===p2).length,1);
 assert.equal(f.state.world.entity.property.HP,500);
});

test('allied summon and pet leaves must not heal after the owner changes team in flight',t=>{
 const f=setup(t);
 const r1=unit(f,'battlePet'),r2=unit(f,'heroSummon');
 T.passive(f.game,f.state,100000);f.tick(100200);
 assert.ok(f.state.world.treantLeaves.some(j=>j.target===r1));
 assert.ok(f.state.world.treantLeaves.some(j=>j.target===r2));
 f.peer.world.entity.camp.campID=7777;
 f.tick(100400);
 assert.equal(f.state.world.treantLeaves.some(j=>j.target===r1||j.target===r2),false);
 assert.equal(r1.hp,150);assert.equal(r2.hp,150);
});
