'use strict';
// Hero's Land February 2024 client protocol. Input bindings are implemented
// client-side. The server distinguishes the commands instead of remapping keys:
// Native LMB/RMB both use CommandUseSkill (6), with skill/skill2 IDs.
// Hero F uses 10. CommandUseEquipSkill (11) is an equipment action.
// Neither attacks nor mouse aiming can alter WASD motion state.
const actions=require('./actions-3127');
const inventory=require('./inventory');
const city=require('./city-3127');
const {commands}=require('./proto');
const heroes=require('../config/schemes/HeroScheme.json').Hero;
const {Skill:skills}=require('../config/schemes/SkillScheme.json');
const AUTO_BUFF_ID=246;
const skillRows=new Map();
for(const row of skills)if(!skillRows.has(Number(row.ID))||Number(row.level)===1)skillRows.set(Number(row.ID),row);
const weapons=new Map();
for(const row of inventory.weapons)if(!weapons.has(Number(row.weaponID))||Number(row.level)===1)weapons.set(Number(row.weaponID),row);
const heroSkills=new Map(heroes.map(row=>[Number(row.ID),new Set((row.Skills||[]).map(Number))]));
const knownInputs=new Set(['attack','useSkill','useAttackSkill','unUseSkill','autoUseSkill',
 'useCareerSkill','useEquipSkill','useLeftLongTouchSkill','unUseLeftLongTouchSkill',
 'useRightLongTouchSkill','unUseRightLongTouchSkill','cannonRotateTo','syncSkillCD']);
function input(world){return world.combatInput ||= {
 auto:false,left:false,right:false,aimAngle:null,autoSkill:0,heldSkill:0,
 lastHeroSkillAt:Object.create(null),lastWeaponSkillAt:Object.create(null)
};}
function inSafeZone(world){const e=world?.entity;return !!(e&&city.safePoint(e.physics?.x,e.physics?.y,world.level,world.mapId));}
function activeWeapon(world){return weapons.get(Number(world.entity?.equip?.currentItemID));}
function skillFor(world){return Number(activeWeapon(world)?.skill)||0;}
function weaponSkillFor(world){return Number(activeWeapon(world)?.skill2)||0;}
function heroSkillFor(world,state){
 const heroId=Number(world.entity?.miscInfo?.heroId||state?.player?.heroId||1);
 return [...(heroSkills.get(heroId)||new Set())][0]||0;
}
function aim(world){const value=input(world).aimAngle;return Number.isFinite(value)?value:Number(world.motion?.angle)||0;}
function eventSkill(id,now=Date.now(),cooldown,level=1){
 const row=skillRows.get(id);
 return {skillID:id,skillCD:Math.max(0,Number(cooldown??row?.cd)||0),skillLevel:level,toggleState:false,curMillis:now};
}
function autoState(world,next,events,event){
 const ci=input(world);if(ci.auto===!!next)return;
 ci.auto=!!next;ci.autoSkill=ci.auto?skillFor(world):0;
 events.push(event(world.entity,'autoUseSkill',{enterOrExit:ci.auto}));
 if(ci.auto){const now=Date.now();events.push(event(world.entity,'buffAdd',{
  type:AUTO_BUFF_ID,group:0,duration:2147483647,startTime:now,endTime:now+86400000,
  stackNum:1,maxStackNum:1,isValid:1
 }));}
 else events.push(event(world.entity,'buffRemove',{type:AUTO_BUFF_ID}));
}
function basicAttack(game,state,events,event,destroy,{viaSkill=false}={}){
 const world=state.world,entity=world?.entity;if(world)world.gameRef=game;
 if(!world?.sceneReady||!entity||Number(entity.property?.HP)<=0||inSafeZone(world)||require('./player-skills-3127').blocked(state))return false;
 const normalSkill=skillFor(world);
 if(viaSkill&&!normalSkill)return false;
 require('./mounts-3127').dismount(game,state,events,event);
 const hit=actions.attack(game,state,{aimAngle:aim(world),skillId:normalSkill});
 if(!hit.allowed)return false;
 require('./slime-3127').breakDisguise(game,state,Date.now(),events,event,'weapon');
 require('./fishing-3127').stop(state,events,event);
 if(viaSkill||hit.scheduled)events.push(event(entity,'useSkill',eventSkill(hit.skillID,Date.now(),hit.scheduled?hit.cd:undefined)));
 else events.push(event(entity,'startAttack',{}));
 if(hit.scheduled)events.push(event(entity,'skillCastPoint',{skillID:hit.skillID}));
 if(hit.propertyChanged)events.push(event(entity,'propertyResult',{propRes:entity.property}));
 if(hit.created?.length)events.push(require('./world').spawnEvent(hit.created));
 appendHits(state,hit.hits,hit.skillID,events,event,destroy);
 return true;
}
function appendHits(state,hits,normalSkill,events,event,destroy,definition=skillRows.get(normalSkill),attacker=null,impact={}){const entity=attacker||state.world.entity;
 for(const item of hits){
  for(const type of item.removedBuffs||[])events.push(event(item.entity,'buffRemove',{type}));
  if(!item.dead&&!item.noBuff&&['environment','mob','boss'].includes(item.kind)){const r=state.world.gameRef?.environments?.get(state.world.room)?.rows.get(item.id);if(r)require('./player-skills-3127').applyBuffs(state,r,definition||{},events,event,{...impact,actor:entity});}
  if(item.shieldChange){events.push(event(item.entity,'changeShield',{changeShield:item.shieldChange,currentShield:item.currentShield}));events.push(event(item.entity,'subHP',{changeHP:0,currentHP:item.hp+item.damage,maxHP:item.maxHP,dmgType:7,showChangeHP:-item.shieldChange}));}
  events.push(event(item.entity,'beHurt',{
   skillId:normalSkill,attacker:entity.id,
   attackerPos:{x:entity.physics.x,y:entity.physics.y},
   targetPos:{x:item.entity.physics.x,y:item.entity.physics.y},damageType:item.dmgType||1,
   skillLevel:definition?.level||1,attackerCID:entity.cid,attackerSkinID:entity.miscInfo?.curSkinId||0
  }));
  require('./food-effects-3127').onHit(state,item,entity,events,event);
  require('./hero-passives-3127').lifesteal(state,item,entity,events,event);
  require('./werewolf-3127').onDamage(state,item,entity,events,event);
  const healPercent=require('./monster-skills-3127').argsOf(definition||{}).attackBlood||0;if(item.damage>0&&healPercent>0&&['mob','boss','player'].includes(item.kind)){const hp=entity.property,gain=Math.min(hp.maxHP-hp.HP,require('./hero-passives-3127').healingAmount(state,item.damage*healPercent/100,entity.id===state.world.entity.id?require('./hero-passives-3127').origin(definition):'other'));if(gain>0){hp.HP+=gain;events.push(event(entity,'addHP',{changeHP:gain,currentHP:hp.HP,maxHP:hp.maxHP}));}}
  if(item.damage>0)events.push(event(item.entity,'subHP',{
   changeHP:item.damage,currentHP:item.hp,maxHP:item.maxHP,dmgType:item.dmgType||1,showChangeHP:item.damage
  }));
  if(item.depleted){events.push(event(item.entity,'death',{}));}
  if(item.dead){events.push(event(item.entity,'death',{posX:item.entity.physics.x,posY:item.entity.physics.y,killPosX:entity.physics.x,killPosY:entity.physics.y,isSettle:false}));events.push(destroy([item.id],0));}
 }
}
function requireStamina(state,row){const cost=Math.max(0,require('./monster-skills-3127').argsOf(row).staminaCost||0);if((Number(state.world.entity.property.strength)||0)<cost)throw Error('NOT_ENOUGH_STAMINA');return cost;}
function spendStamina(state,cost,events,event){if(cost){state.world.entity.property.strength-=cost;events.push(event(state.world.entity,'propertyResult',{propRes:state.world.entity.property}));}}
function independentCooldown(ci,field,id,cd,row){
 const now=Date.now(),prev=Number(ci[field][id])||0;
 const charged=require('./skill-cooldowns-3127').reserve(ci,field,row,cd,now);if(charged!==null)return charged;
 const saved=ci[field==='lastHeroSkillAt'?'lastHeroSkillCD':'lastWeaponSkillCD']?.[id];
 if(now-prev<Math.max(200,Number(saved??cd)||0))return false;
 ci[field][id]=now;return now;
}
// F: career / HERO skill (CommandUseCareerSkill=10), NEVER weapon skill or auto attack.
function castHero(state,events,event,id,game){
 const world=state.world,ci=input(world);if((Number(world.entity?.property?.level)||1)<10)throw Error('HERO_SKILL_REQUIRES_LEVEL_10');if(inSafeZone(world)||require('./player-skills-3127').blocked(state))return false;
 const heroId=Number(world.entity?.miscInfo?.heroId||state.player?.heroId||1);
 if(!heroSkills.get(heroId)?.has(id))throw Error('HERO_SKILL_NOT_OWNED');
 const row=skills.find(s=>s.ID===id&&s.level===Number(world.entity.miscInfo.heroStar||1))||skillRows.get(id);if(!row)throw Error('HERO_SKILL_NOT_IN_2024_SCHEME');if(row.isPassive)throw Error('HERO_PASSIVE_CANNOT_BE_CAST');
 const dragon=require('./dragon-prince-3127');if(dragon.profile(row)&&!dragon.capacity(state))return false;
 const devil=require('./devil-3127');if(devil.profile(row)&&!devil.capacity(state))return false;
 const mummy=require('./mummy-3127');if(world.mapId===2&&mummy.profile(row)&&!mummy.capacity(state,row))return false;
 const witch=require('./witch-3127');if(world.mapId===2&&witch.profile(row)&&!witch.capacity(state))return false;
 const treant=require('./treant-3127');if(world.mapId===2&&treant.profile(row)&&!treant.capacity(state))return false;
 const chicken=require('./chicken-3127');if(chicken.profile(row)&&!chicken.canStart(state,row))return false;
 const wolf=require('./werewolf-3127');if(wolf.profile(row)&&!wolf.canStart(state,row))return false;
 const slime=require('./slime-3127');if(game&&slime.profile(row)&&(!slime.eligible(state)||slime.active(state)||!slime.mimic(game,state,row)))return false;
 const chef=require('./chef-pots-3127');if(world.mapId===2&&chef.profile(row)&&!chef.capacity(state))return false;
 const swordsman=require('./swordsman-3127');if(world.mapId===2&&swordsman.profile(row)&&!swordsman.capacity(state))return false;
 const stance=require('./spartan-stance-3127');if(stance.profile(row)&&world.spartanStance){stance.stop(state,Date.now(),events,event);return true;}
 const storm=require('./storm-skills-3127');if(world.mapId===2&&storm.profile(row)&&!storm.capacity(state))return false;
 const cost=requireStamina(state,row),cd=require('./hero-passives-3127').heroCooldown(state,row),now=independentCooldown(ci,'lastHeroSkillAt',id,cd,row);if(!now)return false;(ci.lastHeroSkillCD||={})[id]=cd;spendStamina(state,cost,events,event);
 require('./fishing-3127').stop(state,events,event);
 require('./mounts-3127').dismount(game,state,events,event);
 ci.heroCasts=(ci.heroCasts||0)+1;
 const entity=world.entity,a=aim(world);
 events.push(event(entity,'useSkill',{...eventSkill(id,now,cd,row.level),toggleState:id===6013||(id===6026&&!require('./werewolf-3127').active(state))}));
 require('./skill-cooldowns-3127').update(entity,id,now,cd,row.level,events,event,require('./skill-cooldowns-3127').charge(ci,'lastHeroSkillAt',row,now));
 events.push(event(entity,'skillCastPoint',{skillID:id}));
 if(game&&stance.profile(row)){events.push(event(entity,'skillCast',{skillID:id,angle:a,posX:entity.physics.x,posY:entity.physics.y,targetPos:require('./player-skills-3127').cursor(state,row,a)}));stance.start(game,state,row,now,events,event);events.push(event(entity,'useHeroSkill',{id}));return true;}
 if(game&&dragon.schedule(game,state,row,now)){events.push(event(entity,'useHeroSkill',{id}));return true;}
 if(game&&devil.schedule(game,state,row,now)){events.push(event(entity,'useHeroSkill',{id}));return true;}
 if(game&&mummy.schedule(game,state,row,now)){events.push(event(entity,'useHeroSkill',{id}));return true;}
 if(game&&witch.schedule(game,state,row,now)){events.push(event(entity,'useHeroSkill',{id}));return true;}
 if(game&&treant.schedule(game,state,row,now)){events.push(event(entity,'useHeroSkill',{id}));return true;}
 if(game&&chef.schedule(game,state,row,now,events,event)){events.push(event(entity,'useHeroSkill',{id}));return true;}
 if(game&&require('./support-casts-3127').schedule(game,state,row,now)){events.push(event(entity,'useHeroSkill',{id}));return true;}
 if(game&&storm.schedule(game,state,row,now,events,event)){events.push(event(entity,'useHeroSkill',{id}));return true;}
 events.push(event(entity,'skillCast',{
  skillID:id,angle:a,posX:entity.physics.x,posY:entity.physics.y,
  targetPos:require('./player-skills-3127').cursor(state,row,a)
 }));
 events.push(event(entity,'useHeroSkill',{id}));
 if(game)require('./player-skills-3127').cast(game,state,row,a,events,event);
 return true;
}
// Native RMB arrives as CommandUseSkill with the equipped weapon skill2.
// The command-11 alias is retained for older local integrations.
function castWeapon(state,events,event,id,game,{equipmentEvent=true}={}){
 const world=state.world,ci=input(world);if(inSafeZone(world)||require('./player-skills-3127').blocked(state))return false;
 const weapon=activeWeapon(world);
 if(!weapon||!Number(weapon.skill2)||id!==Number(weapon.skill2))throw Error('WEAPON_ACTIVE_SKILL_NOT_OWNED');
 const row=skillRows.get(id);if(!row)throw Error('WEAPON_ACTIVE_SKILL_NOT_IN_2024_SCHEME');
 const storm=require('./storm-skills-3127');if(world.mapId===2&&storm.profile(row)&&!storm.capacity(state))return false;
 const frozen=require('./frozen-armor-3127');if(game&&world.mapId===2&&frozen.profile(row)&&!frozen.capacity(state))return false;
 const cost=requireStamina(state,row),cd=require('./hero-passives-3127').weaponCooldown(state,weapon,row),now=independentCooldown(ci,'lastWeaponSkillAt',id,cd,row);if(!now)return false;require('./slime-3127').breakDisguise(game,state,now,events,event,'weapon');(ci.lastWeaponSkillCD||={})[id]=cd;spendStamina(state,cost,events,event);
 require('./fishing-3127').stop(state,events,event);
 require('./mounts-3127').dismount(game,state,events,event);
 if(game)require('./hero-passives-3127').afterWeaponCast(game,state,weapon,row,now,events,event);
 ci.weaponCasts=(ci.weaponCasts||0)+1;
 const entity=world.entity,a=aim(world);
 if(equipmentEvent)events.push(event(entity,'useEquipSkill',{
  skillID:id,useTime:now,isTwiceState:false,twiceSkillSpaceTime:0
 }));
 events.push(event(entity,'useSkill',eventSkill(id,now,cd,row.level)));
 require('./skill-cooldowns-3127').update(entity,id,now,cd,row.level,events,event,require('./skill-cooldowns-3127').charge(ci,'lastWeaponSkillAt',row,now));
 events.push(event(entity,'skillCastPoint',{skillID:id}));
 if(game&&storm.schedule(game,state,row,now,events,event)){require('./quests-3127').record(game,state,19,{},events,event);return true;}
 if(game&&frozen.schedule(game,state,row,now,events,event)){require('./quests-3127').record(game,state,19,{},events,event);return true;}
 if(game&&require('./weapon-projectiles-3127').schedule(game,state,row,now,events,event)){require('./quests-3127').record(game,state,19,{},events,event);return true;}
 events.push(event(entity,'skillCast',{
  skillID:id,angle:a,posX:entity.physics.x,posY:entity.physics.y,targetPos:require('./player-skills-3127').cursor(state,row,a)
 }));
 if(game){require('./player-skills-3127').cast(game,state,row,a,events,event);require('./quests-3127').record(game,state,19,{},events,event);}
 return true;
}
function handle(game,state,name,data,events,event,destroy){
 if(state.world)state.world.gameRef=game;
 if(!knownInputs.has(name))return false;
 const world=state.world,ci=input(world);
 const codec=commands['Command'+name[0].toUpperCase()+name.slice(1)];
 if(!codec)throw Error('UNKNOWN_2024_COMBAT_COMMAND '+name);
 const payload=codec.decode(data||Buffer.alloc(0));
 if(name==='syncSkillCD'){const id=Number(payload.skillID)||heroSkillFor(world,state),hero=heroSkills.get(Number(world.entity.miscInfo.heroId))?.has(id),row=hero?skills.find(s=>s.ID===id&&s.level===Number(world.entity.miscInfo.heroStar||1)):skillRows.get(id);if(!row||!hero&&id!==weaponSkillFor(world))throw Error('SKILL_NOT_OWNED');const last=(hero?ci.lastHeroSkillAt:ci.lastWeaponSkillAt)[id]||0,actualCD=(hero?ci.lastHeroSkillCD:ci.lastWeaponSkillCD)?.[id]??(hero?require('./hero-passives-3127').heroCooldown(state,row):require('./hero-passives-3127').weaponCooldown(state,activeWeapon(world),row));const wire=eventSkill(id,last,actualCD,hero?world.entity.miscInfo.heroStar:1);if(hero&&id===6013)wire.toggleState=!!world.spartanStance;events.push(event(world.entity,'useSkill',wire));require('./skill-cooldowns-3127').update(world.entity,id,last,actualCD,wire.skillLevel,events,event,require('./skill-cooldowns-3127').charge(ci,hero?'lastHeroSkillAt':'lastWeaponSkillAt',{...row,level:wire.skillLevel},Date.now()));return true;}

 const isRelease=['unUseSkill','unUseLeftLongTouchSkill','unUseRightLongTouchSkill'].includes(name);if(require('./player-skills-3127').blocked(state)&&!isRelease&&!(name==='cannonRotateTo'&&(world.swordsmanBackstepUntil>Date.now()||require('./bard-3127').dancing(state))&&!(world.heroChannelUntil>Date.now())&&!world.peaceCast)){events.push(event(world.entity,'cantAttack',{type:'banAttack'}));return true;}
 if(name==='cannonRotateTo'){
  if(!Number.isFinite(payload.angle))throw Error('INVALID_MOUSE_AIM');
  ci.aimAngle=payload.angle;if(Object.hasOwn(payload,'dist')&&Number.isFinite(payload.dist))ci.aimDistance=Math.max(0,payload.dist);ci.headTurnPackets=(ci.headTurnPackets||0)+1;
  events.push(event(world.entity,'cannonRotateTo',{angle:ci.aimAngle}));return true;
 }
 // A protected Map2 area forbids skill activation itself, not merely damage.
 // Mouse aim and release commands still work, so users cannot get stuck in hold mode.
 const release=new Set(['unUseSkill','unUseLeftLongTouchSkill','unUseRightLongTouchSkill']);
 if(world.monsterStatuses?.get(192)?.until>Date.now()&&!release.has(name)&&name!=='cannonRotateTo'){events.push(event(world.entity,'cantAttack',{type:'confused'}));return true;}
 if(inSafeZone(world)&&!release.has(name)){
  if(ci.auto)autoState(world,false,events,event);
  ci.left=false;ci.right=false;ci.heldSkill=0;
  ci.safeBlocked=(ci.safeBlocked||0)+1;
  // Client-native rejection event; do not emit startAttack/useSkill/skillCast.
  events.push(event(world.entity,'cantAttack',{type:'safeZone'}));
  return true;
 }
 if(name==='attack'){basicAttack(game,state,events,event,destroy);return true;}
 if(name==='useSkill'){
  const id=Number(payload.id)||0,normal=skillFor(world);
  if(ci.aimAngle===null&&Object.hasOwn(payload,'angle')&&Number.isFinite(payload.angle)&&payload.angle>=0)ci.aimAngle=payload.angle;
  if(id>0&&id===weaponSkillFor(world)){castWeapon(state,events,event,id,game,{equipmentEvent:false});return true;}
  if(id>0&&id!==normal)throw Error('WEAPON_SKILL_NOT_OWNED');
  basicAttack(game,state,events,event,destroy,{viaSkill:true});return true;
 }
 if(name==='autoUseSkill'){
  const id=Number(payload.id)||0,normal=skillFor(world);
  if(id>0&&id!==normal)throw Error('AUTO_ATTACK_MUST_USE_NORMAL_WEAPON_SKILL');
  autoState(world,id>0?true:!ci.auto,events,event);
  if(ci.auto)basicAttack(game,state,events,event,destroy,{viaSkill:true});return true;
 }
 if(name==='useCareerSkill'){
  const id=Number(payload.skillID)||heroSkillFor(world,state);
  castHero(state,events,event,id,game);return true;
 }
 if(name==='useEquipSkill'){
  const id=Number(payload.skillID)||weaponSkillFor(world);
  if(!id)throw Error('WEAPON_NO_ACTIVE_SKILL');
  castWeapon(state,events,event,id,game);return true;
 }
 if(name==='useAttackSkill'){
  const id=Number(payload.skillID)||0;
  // 2024 has a separate command for explicitly selected weapon attack skills.
  // Do not reinterpret it as hero F or as the normal E-auto state.
  castWeapon(state,events,event,id,game);return true;
 }
 if(name==='unUseSkill'){
  ci.left=false;ci.right=false;ci.heldSkill=0;return true;
 }
 if(name==='useLeftLongTouchSkill'){
  const id=Number(payload.skillID)||0,normal=skillFor(world);
  if(id>0&&id!==normal)throw Error('LEFT_HOLD_NOT_NORMAL_ATTACK');
  ci.left=true;ci.heldSkill=normal;
  basicAttack(game,state,events,event,destroy,{viaSkill:true});return true;
 }
 if(name==='unUseLeftLongTouchSkill'){
  ci.left=false;if(!ci.right)ci.heldSkill=0;return true;
 }
 if(name==='useRightLongTouchSkill'){
  const id=Number(payload.skillID)||weaponSkillFor(world);
  if(!id||id!==weaponSkillFor(world))throw Error('RIGHT_HOLD_NOT_WEAPON_SKILL');
  ci.right=true;ci.heldSkill=id;
  castWeapon(state,events,event,id,game);return true;
 }
 if(name==='unUseRightLongTouchSkill'){
  ci.right=false;if(!ci.left)ci.heldSkill=0;return true;
 }
 return false;
}
function enterSafe(state,events,event){const world=state.world,ci=input(world);if(ci.auto)autoState(world,false,events,event);ci.left=false;ci.right=false;ci.heldSkill=0;}
function tick(game,state,events,event,destroy){
 if(state.world)state.world.gameRef=game;require('./player-skills-3127').tick(game,state,Date.now(),events,event);
 require('./weapon-primary-3127').tick(game,state,Date.now(),events,event);
 require('./weapon-melee-3127').tick(game,state,Date.now(),events,event,destroy);
 require('./wintertide-3127').tick(game,state,Date.now(),events,event,destroy);
 require('./frozen-armor-3127').tick(game,state,Date.now(),events,event,destroy);
 require('./weapon-projectiles-3127').tick(game,state,Date.now(),events,event);
 require('./projectiles-3127').tick(game,state,.05,events,event,(hits,id,definition,attacker,impact)=>appendHits(state,hits,id,events,event,destroy,definition,attacker,impact));
 const world=state.world;if(!world?.sceneReady||!world.entity)return;
 require('./skill-cooldowns-3127').tick(state,Date.now(),events,event);
 const ci=input(world);
 if(require('./player-skills-3127').blocked(state)){ci.auto=false;ci.left=false;ci.right=false;return;}
 if(inSafeZone(world)){
  enterSafe(state,events,event);return;
 }
 if(ci.left)basicAttack(game,state,events,event,destroy,{viaSkill:true});
 else if(ci.right){
  if(weaponSkillFor(world)!==ci.heldSkill){ci.right=false;ci.heldSkill=0;}
  else castWeapon(state,events,event,ci.heldSkill,game);
 }
 else if(ci.auto){
  if(skillFor(world)!==ci.autoSkill){autoState(world,false,events,event);return;}
  basicAttack(game,state,events,event,destroy,{viaSkill:true});
 }
}
module.exports={aim,enterSafe,appendHits,inSafeZone,input,handle,tick,skillFor,weaponSkillFor,heroSkillFor,basicAttack,castHero,castWeapon};
