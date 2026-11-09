'use strict';
// Native 6013: toggle, 1500ms pulses, 15 stamina, stun and third-star reduction.
// First pulse after interval, no catch-up, source lifetime and retry are local policies.
function profile(skill){return skill?.ID===6013&&[351,352,353].includes(skill.skillType);}
function stop(state,time,events,event){const w=state.world,j=w?.spartanStance;if(!j)return false;w.spartanStance=null;
 for(const id of [586,705])require('./hero-vfx-3127').removeBuff(state,id,events,event);
 const ci=require('./combat-input-3127').input(w);ci.lastHeroSkillAt[6013]=time;(ci.lastHeroSkillCD||={})[6013]=j.skill.cd;
 events.push(event(w.entity,'useSkill',{skillID:6013,skillCD:j.skill.cd,skillLevel:j.skill.level,toggleState:false,curMillis:time}),event(w.entity,'skillStop',{skillID:6013}));require('./skill-cooldowns-3127').update(w.entity,6013,time,j.skill.cd,j.skill.level,events,event);return true;
}
function start(game,state,skill,time,events,event){const w=state.world,a=require('./player-skills-3127').args(skill);w.spartanStance={skill,args:a,world:w,actor:w.entity,room:w.room,mapId:w.mapId,heroID:w.entity.miscInfo.heroId,next:time+a.interval,contacts:null};
 require('./hero-vfx-3127').start(game,state,skill,w.entity.physics,2147483647,events,event);
 return true;
}
function valid(state,j,time){const w=state.world;return w===j.world&&w.entity===j.actor&&w.sceneReady&&!w.dead&&w.entity.property.HP>0&&w.room===j.room&&w.mapId===j.mapId&&w.entity.miscInfo.heroId===j.heroID&&!require('./city-3127').safePoint(w.entity.physics.x,w.entity.physics.y,w.level,w.mapId);}
function reduction(state,time=Date.now()){const j=state.world?.spartanStance;return j&&valid(state,j,time)?j.args.defence||0:0;}
function eligible(game,state,r,time){const w=state.world,p=w.entity.physics;return game.environments?.get(w.room)?.rows.get(r.id)===r&&!r.dead&&!r.depleted&&['mob','boss'].includes(r.kind)&&!(r.effectState?.hiddenUntil>time)&&!require('./city-3127').safePoint(r.x,r.y,w.level,w.mapId)&&Math.hypot(r.x-p.x,r.y-p.y)<=(w.spartanStance.skill.effectSize[0]||0)+require('./actions-3127').targetRadius({record:r});}
function tick(game,state,time,events,event){const w=state.world,j=w?.spartanStance;if(!j)return;if(!valid(state,j,time)){stop(state,time,events,event);return;}if(time<j.next||time<(j.retryAt||0))return;
 const S=require('./player-skills-3127'),C=require('./combat-input-3127'),A=require('./actions-3127');
 if(j.contacts===null){const cost=j.args.physicalBurn||0;if(w.entity.property.strength<cost){stop(state,time,events,event);return;}w.entity.property.strength-=cost;events.push(event(w.entity,'propertyResult',{propRes:w.entity.property}));
  const p=w.entity.physics;j.contacts=require('./environment-3127').records(game,state).filter(r=>eligible(game,state,r,time)).slice(0,128).map(r=>({r,life:r.spawnToken||r.entity,settled:false}));
 }
 for(const c of j.contacts){if(c.settled||(c.r.spawnToken||c.r.entity)!==c.life||!eligible(game,state,c.r,time))continue;
  let hits;try{hits=A.damageTargets(game,state,j.skill,[{kind:'environment',id:c.r.id,x:c.r.x,y:c.r.y,record:c.r}]);}catch{j.retryAt=time+250;return;}c.settled=true;C.appendHits(state,hits,j.skill.ID,events,event,require('./world').destroyEvent,j.skill,w.entity);
 }
 j.contacts=null;j.retryAt=0;j.next=time+j.args.interval;
}
module.exports={profile,start,stop,valid,reduction,tick};
