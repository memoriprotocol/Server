'use strict';
// Native normalAttack(69) castPointTime. Contact sampling, cancellation and
// bounded reward retry are local policies, documented in STAGE58_MELEE.json.
const skills=new Map(require('../config/schemes/SkillScheme.json').Skill.filter(s=>s.level===1).map(s=>[s.ID,s]));
const assets=require('../config/projectile-assets-3127.json'),profiles=new Map();
for(const weapon of require('../config/schemes/WeaponScheme.json').Weapon){
 const skill=skills.get(weapon.skill);
 if(weapon.level===1&&skill?.skillType===69&&[1,3].includes(skill.skillRange)&&skill.castPointTime>0&&!assets[skill.ID]&&(require('./monster-skills-3127').argsOf(skill).num??1)===1)profiles.set(weapon.weaponID,{weapon,skill});
}
function plan(state,skill){const p=state.world.mapId===2&&profiles.get(state.world.entity.equip.currentItemID);return p&&p.skill.ID===skill?.ID?p:null;}
function hasCapacity(state){return (state.world.meleeAttackJobs?.length||0)<16;}
function schedule(state,p,time){
 if(!hasCapacity(state))return false;const w=state.world,release=time+p.skill.castPointTime;
 (w.meleeAttackJobs||=[]).push({profile:p,world:w,actor:w.entity,key:require('./weapon-primary-3127').identity(state),room:w.room,release,deadline:release+1000,contacts:null});return true;
}
function reset(state,events=[],event){const w=state.world;if(!w)return;if(event)for(const j of w.meleeAttackJobs||[])events.push(event(j.actor,'skillStop',{skillID:j.profile.skill.ID}));w.meleeAttackJobs=[];}
function valid(state,j,time){const w=state.world;return w===j.world&&w.entity===j.actor&&w.sceneReady&&!w.dead&&w.entity.property.HP>0&&w.mapId===2&&w.room===j.room&&require('./weapon-primary-3127').identity(state)===j.key&&time<=j.deadline&&!require('./player-skills-3127').blocked(state,time)&&!(w.monsterStatuses?.get(192)?.until>time)&&!require('./city-3127').safePoint(w.entity.physics.x,w.entity.physics.y,w.level,2);}
function life(target){return target.record?.spawnToken||target.record?.entity||target.other?.world?.entity||target.record;}
function contactValid(game,state,item,time){
 const t=item.target,r=t.record,city=require('./city-3127');if(life(t)!==item.life)return false;
 if(t.kind==='environment')return game.environments?.get(state.world.room)?.rows.get(t.id)===r&&!r.dead&&!r.depleted&&!(r.effectState?.hiddenUntil>time)&&!city.safePoint(r.x,r.y,state.world.level,2);
 if(t.kind==='building')return require('./actions-3127').roomStructures(game,state).includes(r)&&!city.safePoint(r.x,r.y,state.world.level,2);
 const w=t.other?.world;return w?.room===state.world.room&&w.sceneReady&&!w.dead&&w.entity?.property.HP>1&&!city.safePoint(w.entity.physics.x,w.entity.physics.y,state.world.level,2);
}
function tick(game,state,time,events,event,destroy){
 const w=state.world;if(!w)return;const keep=[],A=require('./actions-3127');
 for(const j of w.meleeAttackJobs||[]){const s=j.profile.skill;
  if(!valid(state,j,time)){events.push(event(j.actor,'skillStop',{skillID:s.ID}));continue;}
  if(time<j.release||time<(j.retryAt||0)){keep.push(j);continue;}
  if(j.contacts===null){
   j.angle=require('./combat-input-3127').aim(w);
   j.contacts=A.resolveTargets(game,state,j.profile.weapon,s,j.angle).map(target=>({target,life:life(target),settled:false}));
   events.push(event(j.actor,'skillCast',{skillID:s.ID,angle:j.angle,posX:j.actor.physics.x,posY:j.actor.physics.y,targetPos:require('./player-skills-3127').cursor(state,s,j.angle)}));
  }
  let retry=false;
  for(const item of j.contacts){if(item.settled||!contactValid(game,state,item,time))continue;
   let hits;try{hits=A.damageTargets(game,state,s,[item.target]);}
   catch(error){j.retryAt=time+250;retry=true;if(!j.lastFailureLog||time-j.lastFailureLog>=5000){j.lastFailureLog=time;console.warn('[MELEE REWARD RETRY]',error.message);}break;}
   item.settled=true;
   require('./combat-input-3127').appendHits(state,hits,s.ID,events,event,destroy,s,j.actor,{angle:j.angle});
  }
  if(retry)keep.push(j);else events.push(event(j.actor,'skillStop',{skillID:s.ID}));
 }
 w.meleeAttackJobs=keep;
}
module.exports={profiles,plan,hasCapacity,schedule,reset,valid,tick};
