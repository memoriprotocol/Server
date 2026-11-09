'use strict';
// Native6040: caster-following cloud1315 effectType0, one nearest enemy per
// onceTime, lightning1315 effectType1. Selection radius, pulse edges and short
// lightning entity retention are reconstruction policies, not retail source.
const B=require('./monster-targets-3127'),W=()=>require('./world');
function profile(s){return s?.ID===6040&&[780,781,782].includes(s.skillType);}
function ready(s){return B.physical(s)&&s.world.level!=='guide'&&s.world.entity.miscInfo.heroId===28&&s.world.entity.property.level>=10;}
function capacity(s){return !s.world?.dragonCloud;}
function schedule(game,s,skill,time){if(!profile(skill)||!ready(s)||!capacity(s))return false;const e=s.world.entity;s.world.dragonCloud={...B.bind(s),skill,skin:e.miscInfo.curSkinId,star:e.miscInfo.heroStar,release:time+skill.castPointTime,deadline:time+skill.castPointTime+1000,phase:'cast',bolts:[]};return true;}
function valid(s,j){return ready(s)&&B.matches(j,s)&&s.world.entity.miscInfo.curSkinId===j.skin&&s.world.entity.miscInfo.heroStar===j.star;}
function spawn(game,s,j,type,pos,extra,events){const id=game.nextDragonPrinceID=Math.max(game.nextDragonPrinceID||940000000,940000000)+1,entity={id,uid:0,cid:0,type:1315,ownerID:j.actor.id,camp:{campID:j.actor.camp?.campID||j.actor.id},physics:{x:pos.x,y:pos.y,rotation:0,direction:1},ud:JSON.stringify({skinID:j.skin,sourceID:j.actor.id,effectType:type,...extra})};const row={id,cid:0,type:1315,kind:'heroEffect',mapId:j.mapId,room:j.room,x:pos.x,y:pos.y,homeX:pos.x,homeY:pos.y,entity,version:1,dead:false,noRespawn:true};require('./environment-3127').room(game,j.room).rows.set(id,row);events.push(W().spawnEvent([entity]));return row;}
function remove(game,s,j,row,events){if(!row)return;game.environments?.get(j.room)?.rows.delete(row.id);const ev=W().destroyEvent([row.id]);if(s.world?.room===j.room&&s.world.mapId===j.mapId)events.push(ev);else for(const p of game.online||[])if(p.world?.sceneReady&&p.world.room===j.room&&p.world.mapId===j.mapId)try{W().replicate(game,p,[ev]);}catch{}}
function eligible(game,s,j,r,time){const at=s.world.entity.physics;return game.environments?.get(j.room)?.rows.get(r.id)===r&&!r.dead&&['mob','boss'].includes(r.kind)&&!(r.effectState?.hiddenUntil>time)&&!require('./city-3127').safePoint(r.x,r.y,s.world.level,j.mapId)&&Math.hypot(r.x-at.x,r.y-at.y)<=j.skill.effectSize[0]+require('./actions-3127').targetRadius({record:r});}
function tick(game,s,time,events,event){const w=s.world,j=w?.dragonCloud;if(!j)return;if(!valid(s,j)){clear(game,s,events);return;}
 if(j.phase==='cast'){if(time>j.deadline||require('./player-skills-3127').blocked(s,time)||w.monsterStatuses?.get(192)?.until>time){clear(game,s,events);return;}if(time<j.release)return;
  j.row=spawn(game,s,j,0,w.entity.physics,{},events);j.phase='cloud';j.until=time+j.skill.duration;j.interval=require('./monster-skills-3127').argsOf(j.skill).onceTime;j.next=time+j.interval;j.pulses=0;events.push(event(w.entity,'skillCast',{skillID:6040,angle:require('./combat-input-3127').aim(w),posX:w.entity.physics.x,posY:w.entity.physics.y,targetPos:{x:w.entity.physics.x,y:w.entity.physics.y}}));
 }
 for(const b of j.bolts.filter(b=>time>=b.until))remove(game,s,j,b.row,events);j.bolts=j.bolts.filter(b=>time<b.until);
 const p=w.entity.physics,at=j.row.entity.physics;if(p.x!==at.x||p.y!==at.y){Object.assign(j.row,{x:p.x,y:p.y});Object.assign(at,{x:p.x,y:p.y});events.push(event(j.row.entity,'moveTo',{x:p.x,y:p.y,direction:1,frequency:1}));}
 if(time>=j.next&&j.next<=j.until&&time<=j.until&&time>=(j.retryAt||0)&&!require('./city-3127').safePoint(p.x,p.y,w.level,w.mapId)){
  if(!j.target){const r=require('./environment-3127').records(game,s).filter(r=>eligible(game,s,j,r,time)).sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y)||a.id-b.id)[0];if(r)j.target={r,actor:r.entity,life:r.spawnToken};}
  const c=j.target;
  if(c&&c.r.entity===c.actor&&c.r.spawnToken===c.life&&eligible(game,s,j,c.r,time)){let hits;try{hits=require('./actions-3127').damageTargets(game,s,j.skill,[{kind:'environment',id:c.r.id,x:c.r.x,y:c.r.y,record:c.r}]);}catch{j.retryAt=time+250;return;}
   const bolt=spawn(game,s,j,1,j.row.entity.physics,{targetID:c.r.id,targetPosX:c.r.x,targetPosY:c.r.y},events);j.bolts.push({row:bolt,until:time+Math.min(1000,j.interval)});require('./combat-input-3127').appendHits(s,hits,6040,events,event,W().destroyEvent,j.skill);
  }
  j.pulses++;j.target=null;j.retryAt=0;j.next=time+j.interval;
 }
 if(time>=j.until)clear(game,s,events);
}
function clear(game,s,events=[]){const w=s.world,j=w?.dragonCloud;if(!j)return;remove(game,s,j,j.row,events);for(const b of j.bolts)remove(game,s,j,b.row,events);w.dragonCloud=null;}
module.exports={profile,ready,capacity,schedule,valid,spawn,eligible,tick,clear};
