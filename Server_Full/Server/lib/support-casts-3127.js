'use strict';
// Nun's native 200ms cast point. Latest cursor at release, lifetime identity,
// cancellation and 1000ms maximum late release are reconstruction policies.
function schedule(game,state,skill,time){if(skill.ID!==6006||!state.world?.sceneReady)return false;const w=state.world;(w.supportCasts||=[]).push({skill,world:w,actor:w.entity,room:w.room,mapId:w.mapId,heroID:w.entity.miscInfo.heroId,release:time+skill.castPointTime});return true;}
function tick(game,state,time,events,event){const w=state.world;if(!w)return;const keep=[];
 for(const j of w.supportCasts||[]){
  if(w!==j.world||w.entity!==j.actor||w.room!==j.room||w.mapId!==j.mapId||w.entity.miscInfo.heroId!==j.heroID||!w.sceneReady||w.dead||w.entity.property.HP<=0||require('./city-3127').safePoint(w.entity.physics.x,w.entity.physics.y,w.level,w.mapId)||time>j.release+1000||require('./player-skills-3127').blocked(state,time)||w.monsterStatuses?.get(192)?.until>time){events.push(event(j.actor,'skillStop',{skillID:j.skill.ID}));continue;}
  if(time<j.release){keep.push(j);continue;}const S=require('./player-skills-3127'),angle=require('./combat-input-3127').aim(w);
  events.push(event(w.entity,'skillCast',{skillID:j.skill.ID,angle,posX:w.entity.physics.x,posY:w.entity.physics.y,targetPos:S.cursor(state,j.skill,angle)}));S.cast(game,state,j.skill,angle,events,event,time);
 }w.supportCasts=keep;
}
module.exports={schedule,tick};
