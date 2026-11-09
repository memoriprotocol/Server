'use strict';
// Native primary missile windup and replaceSkill_2 (290). Server scheduling
// policies/remaining compound mechanics are listed in STAGE56_PRIMARY_TIMING.json.
const skills=require('../config/schemes/SkillScheme.json').Skill,assets=require('../config/projectile-assets-3127.json');
const byID=new Map(skills.filter(s=>s.level===1).map(s=>[s.ID,s]));
const profiles=new Map();
for(const weapon of require('../config/schemes/WeaponScheme.json').Weapon){
 if(weapon.level!==1)continue;const base=byID.get(weapon.skill),i=base?.initSelfBuff?.indexOf(290)??-1;if(base?.skillType!==407||i<0)continue;
 const a=require('./player-skills-3127').buffArgs(base.initSelfBuffArgs[i]),strong=byID.get(a.tarSkillID);
 if(a.sourceSkillID!==base.ID||!Number.isInteger(a.maxCount)||a.maxCount<1||!strong||!assets[base.ID]||!assets[strong.ID])continue;
 profiles.set(weapon.weaponID,{weaponID:weapon.weaponID,base,strong,every:a.maxCount});
}
// Ordinary one-missile primaries already use these verified native missile paths.
// Do not infer the missing three-part pattern of skill3285 from num alone.
const timedProfiles=new Map(profiles),projectileSkills=new Map();
for(const weapon of require('../config/schemes/WeaponScheme.json').Weapon){
 if(weapon.level!==1||timedProfiles.has(weapon.weaponID))continue;const base=byID.get(weapon.skill),a=require('./monster-skills-3127').argsOf(base||{});
 if(!base||!assets[base.ID]||base.skillSpeed<=0||base.maxDistance<=0||(a.num??1)!==1)continue;
 timedProfiles.set(weapon.weaponID,{weaponID:weapon.weaponID,base,strong:null,every:0});
}
for(const p of timedProfiles.values())for(const s of [p.base,p.strong].filter(Boolean))projectileSkills.set(s.ID,s);
function identity(state){const w=state.world;return [w.entity.equip.currentItemID,w.entity.equip.currentItemUUID||w.currentWeaponUUID||state.player?.currentWeaponUUID||'',w.entity.miscInfo.heroId,w.room,w.mapId].join(':');}
function reset(state,events=[],event){require('./frozen-armor-3127').cancel(state,events,event);require('./wintertide-3127').cancel(state,events,event);require('./weapon-melee-3127').reset(state,events,event);const w=state.world;if(event)for(const j of w.primaryProjectileJobs||[])events.push(event(w.entity,'skillStop',{skillID:j.plan.definition.ID}));w.primaryWeaponCounter=null;w.primaryProjectileJobs=[];}
function plan(state,skill){
 const w=state.world,p=w.mapId===2&&timedProfiles.get(w.entity.equip.currentItemID);if(!p||p.base.ID!==skill?.ID)return null;
 const key=identity(state),previous=w.primaryWeaponCounter?.key===key?w.primaryWeaponCounter.count:0,count=p.every?previous+1:0,definition=p.every&&count>=p.every?p.strong:p.base,a=require('./monster-skills-3127').argsOf(definition);
 return {key,count:p.every&&count>=p.every?0:count,definition,primary:p.base.ID,num:Math.max(1,a.num||1),angle:a.angle||0,profile:p};
}
function liveBuffs(state,time){return [...(state.world.selfSkillBuffs?.values()||[])].filter(b=>b.until>time);}
function stamina(state,skill,time=Date.now()){
 if(liveBuffs(state,time).some(b=>['stamina_1','stamina_2'].includes(b.name)&&b.args.staminaSkillID===skill.ID))return 0;
 return Math.max(0,require('./monster-skills-3127').argsOf(skill).staminaCost||0);
}
function haste(state,skill,time=Date.now()){
 const values=liveBuffs(state,time).filter(b=>b.name==='reduceSkillCD_1'&&b.args.triggerSkillID===skill.ID).map(b=>Math.max(0,b.args.propValue||0));
 return values.length?Math.max(...values):0;
}
function hasCapacity(state,p){const w=state.world;return (w.primaryProjectileJobs?.length||0)<16&&(w.projectiles?.length||0)+(w.primaryProjectileJobs||[]).reduce((n,j)=>n+j.plan.num,0)+p.num<=64;}
function schedule(state,p,time){
 if(!hasCapacity(state,p))return false;const w=state.world,release=time+Math.max(0,p.definition.castPointTime||0);
 w.primaryProjectileJobs||=[];w.primaryProjectileJobs.push({plan:p,world:w,room:w.room,release,deadline:release+1000});w.primaryWeaponCounter=p.profile.every?{key:p.key,count:p.count}:null;return true;
}
function valid(state,j,time){const w=state.world;return w===j.world&&w.sceneReady&&!w.dead&&w.entity.property.HP>0&&w.mapId===2&&w.room===j.room&&identity(state)===j.plan.key&&time<=j.deadline&&!require('./player-skills-3127').blocked(state,time)&&!(w.monsterStatuses?.get(192)?.until>time)&&!require('./city-3127').safePoint(w.entity.physics.x,w.entity.physics.y,w.level,2);}
function tick(game,state,time,events,event){
 const w=state.world;if(!w)return;
 if(w.primaryWeaponCounter&&w.primaryWeaponCounter.key!==identity(state))w.primaryWeaponCounter=null;
 const keep=[];
 for(const j of w.primaryProjectileJobs||[]){
  if(!valid(state,j,time)){events.push(event(w.entity,'skillStop',{skillID:j.plan.definition.ID}));continue;}
  if(time<j.release){keep.push(j);continue;}
  const aim=require('./combat-input-3127').aim(w),angles=Array.from({length:j.plan.num},(_,i)=>aim+(i-(j.plan.num-1)/2)*j.plan.angle);
  const made=require('./projectiles-3127').launchPrimaryPattern(game,state,j.plan.definition,angles);
  if(made.length!==j.plan.num){keep.push(j);continue;}
  const s=j.plan.definition;
  events.push(event(w.entity,'skillCast',{skillID:s.ID,angle:aim,posX:w.entity.physics.x,posY:w.entity.physics.y,targetPos:require('./player-skills-3127').cursor(state,s,aim)}),require('./world').spawnEvent(made),event(w.entity,'skillStop',{skillID:s.ID}));
 }
 w.primaryProjectileJobs=keep;
}
module.exports={timedProfiles,projectileSkills,profiles,identity,reset,plan,stamina,haste,hasCapacity,schedule,tick};
