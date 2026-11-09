'use strict';
// Native 6022 / impSkillEffect1055 / burnHell297. Tooltip: meteor delay1500ms,
// fire resistance is already in PropLevels. Retail timing-edge and PvP remain
// explicit reconstruction limits; this module implements authoritative PvE.
const B=require('./monster-targets-3127'),W=()=>require('./world');
const skills=require('../config/schemes/SkillScheme.json').Skill;
const buffs=require('../config/schemes/BuffScheme.json').Buff;
const METEOR_DELAY=1500,TYPE=1055;
function profile(skill){return skill?.ID===6022&&[410,411,412].includes(skill.skillType);}
function ready(s){const w=s?.world,e=w?.entity;return !!(B.physical(s)&&!['guide'].includes(w.level)&&e.property.level>=10&&e.miscInfo.heroId===20);}
function capacity(s){return (s.world?.devilMeteors?.length||0)<4;}
function schedule(game,s,skill,time){if(!profile(skill)||!ready(s)||!capacity(s))return false;const w=s.world,e=w.entity;(w.devilMeteors||=[]).push({...B.bind(s),skill,skin:e.miscInfo.curSkinId,star:e.miscInfo.heroStar,release:time+(skill.castPointTime||0),deadline:time+(skill.castPointTime||0)+1000,phase:'cast'});return true;}
function valid(s,j){const e=s.world?.entity;return ready(s)&&B.matches(j,s)&&e.miscInfo.curSkinId===j.skin&&e.miscInfo.heroStar===j.star;}
function release(game,s,j,time,events,event){const w=s.world,angle=require('./combat-input-3127').aim(w),point=require('./player-skills-3127').cursor(s,j.skill,angle);if(!require('./motion-3127').validPoint(w.mapId,point.x,point.y)||require('./city-3127').safePoint(point.x,point.y,w.level,w.mapId))return false;
 const id=game.nextDevilID=Math.max(game.nextDevilID||930000000,930000000)+1,reference=skills.find(r=>r.ID===6022&&r.level===3);
 const entity={id,uid:0,cid:0,type:TYPE,ownerID:w.entity.id,camp:{campID:w.entity.camp?.campID||w.entity.id},physics:{...point,rotation:0,direction:1},ud:JSON.stringify({skinID:j.skin,duration:j.skill.duration,hitDuration:METEOR_DELAY,createTick:time,radius:j.skill.effectSize[0],star3Size:reference.effectSize[0]})};
 Object.assign(j,{id,entity,point,phase:'fall',hitAt:time+METEOR_DELAY,until:time+j.skill.duration,damageActor:structuredClone(w.entity),contacts:null});
 const row={id,cid:0,type:TYPE,kind:'heroEffect',mapId:w.mapId,room:w.room,entity,x:point.x,y:point.y,homeX:point.x,homeY:point.y,dead:false,noRespawn:true,version:1};j.row=row;require('./environment-3127').room(game,j.room).rows.set(id,row);
 events.push(event(w.entity,'skillCast',{skillID:6022,angle,posX:w.entity.physics.x,posY:w.entity.physics.y,targetPos:point}),W().spawnEvent([entity]));return true;
}
function enemy(game,s,j,r,time){return game.environments?.get(j.room)?.rows.get(r.id)===r&&!r.dead&&['mob','boss'].includes(r.kind)&&!(r.effectState?.hiddenUntil>time)&&!require('./city-3127').safePoint(r.x,r.y,s.world.level,j.mapId)&&Math.hypot(r.x-j.point.x,r.y-j.point.y)<=j.skill.effectSize[0]+require('./actions-3127').targetRadius({record:r});}
function impact(game,s,j,time,events,event){if(!j.contacts)j.contacts=require('./environment-3127').records(game,s).filter(r=>enemy(game,s,j,r,time)).slice(0,128).map(r=>({r,actor:r.entity,life:r.spawnToken,done:false}));
 for(const c of j.contacts){const r=c.r;if(c.done||r.entity!==c.actor||r.spawnToken!==c.life||!enemy(game,s,j,r,time))continue;let hits;
  try{hits=require('./actions-3127').damageTargets(game,s,j.skill,[{kind:'environment',id:r.id,x:r.x,y:r.y,record:r}],{actor:j.damageActor});}catch{j.retryAt=time+250;return false;}
  c.done=true;require('./combat-input-3127').appendHits(s,hits,6022,events,event,W().destroyEvent,j.skill,j.damageActor);
  const burn=r.playerStatuses?.get(297);if(burn&&hits.some(h=>!h.dead&&!h.noBuff&&h.id===r.id)){Object.assign(burn,{damage:1,damageMode:'devil-burn',damageActor:j.damageActor,sourceActor:j.actor,sourceLife:j.life,sourceHeroID:20,sourceSkinID:j.skin,sourceStar:j.star,attackPercent:50});}
 }
 return true;
}
function burnDamage(r,status){const attackPercent=require('./player-skills-3127').buffArgs(status.skill.onHitEnemyBuffArgs[status.skill.onHitEnemyBuff.indexOf('100,burnHell')]).propValue;
 return require('./damage-3127').calculate(status.damageActor.property.property,{ID:6022,attribute:2,canCrit:false,args:['damage:0','atkArgs:'+attackPercent]},{allowCrit:false,targetProperty:require('./actions-3127').targetProperties(r)}).amount;
}
function remove(game,s,j,events){if(!j.id)return;game.environments?.get(j.room)?.rows.delete(j.id);const event=W().destroyEvent([j.id]);if(s.world?.room===j.room&&s.world.mapId===j.mapId)events.push(event);else for(const p of game.online||[])if(p.world?.sceneReady&&p.world.room===j.room&&p.world.mapId===j.mapId)try{W().replicate(game,p,[event]);}catch{}}
function tick(game,s,time,events,event){const w=s.world;if(!w)return;const keep=[];
 for(const j of w.devilMeteors||[]){if(!valid(s,j)){remove(game,s,j,events);continue;}
  if(j.phase==='cast'){if(time>j.deadline||require('./player-skills-3127').blocked(s,time)||w.monsterStatuses?.get(192)?.until>time){events.push(event(w.entity,'skillStop',{skillID:6022}));continue;}if(time<j.release){keep.push(j);continue;}if(!release(game,s,j,time,events,event))continue;}
  if(j.phase==='fall'&&time>=j.hitAt&&time>=(j.retryAt||0)){if(time>j.hitAt+1000){remove(game,s,j,events);continue;}if(impact(game,s,j,time,events,event)){j.phase='spent';events.push(event(w.entity,'skillStop',{skillID:6022}));}}
  if(time>=j.until){remove(game,s,j,events);continue;}keep.push(j);
 }w.devilMeteors=keep;
}
function clear(game,s,events=[]){const w=s.world;if(!w)return;for(const j of w.devilMeteors||[])remove(game,s,j,events);w.devilMeteors=[];}
module.exports={TYPE,METEOR_DELAY,profile,ready,capacity,schedule,valid,release,enemy,impact,burnDamage,tick,clear};
