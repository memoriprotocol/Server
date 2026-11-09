'use strict';
// Native IDs, args, renderer and event contracts. Server motion/target policy
// inferences are listed in retail/audits/STAGE51_PETS.json.
const city=require('./city-3127'),water=require('./water-3127'),geometry=require('./geometry-3127');
const SUPPORTED=new Set([2226,2260,2268,2239,2349]),args=s=>require('./monster-skills-3127').argsOf(s),world=()=>require('./world');
function safe(s,r){return city.safePoint(r.x,r.y,s.world.level,r.mapId)||city.safePoint(s.world.entity.physics.x,s.world.entity.physics.y,s.world.level,r.mapId);}
function validOwner(s,r){return !r.dead&&!r.mounted&&s.world?.sceneReady&&!s.world.dead&&s.world.room===r.room&&s.world.mapId===r.mapId&&s.world.entity.property.HP>0;}
function candidates(game,s,r){return require('./environment-3127').records(game,s).filter(t=>!t.dead&&['mob','boss'].includes(t.kind)&&!(t.effectState?.hiddenUntil>Date.now())&&!city.safePoint(t.x,t.y,s.world.level,r.mapId));}
function blockers(game,s){return [...city.collidersFor(s.world.level,s.world.mapId),...require('./actions-3127').roomStructures(game,s).map(b=>require('./actions-3127').buildingCollider(b,35)).filter(Boolean)];}
function clearLine(game,s,a,b){return geometry.firstCollision(a.x,a.y,b.x,b.y,blockers(game,s))===null;}
function canMove(game,s,r,a,b){const map=r.mapId||s.world.mapId;return require('./motion-3127').validPoint(map,b.x,b.y)&&!city.overlapsStatic(b.x,b.y,40,s.world.level,map)&&water.canMove(r.cid,a.x,a.y,b.x,b.y,map)&&clearLine(game,s,a,b);}
function state(r,next,events,event){const moving=[2,4,5,7].includes(next),ud=JSON.parse(r.entity.ud||'{}');if(ud.isMoving!==moving){ud.isMoving=moving;r.entity.ud=JSON.stringify(ud);events.push(event(r.entity,'updateUserdata',{ud:r.entity.ud}));}require('./monster-skills-3127').setState(r,next,events,event);}
function stop(r,events,event){state(r,1,events,event);events.push(event(r.entity,'moveStop',{}));}
function cancel(r,events,event){const id=r.petAction?.skill.ID||r.cast?.skill?.ID;if(id)events.push(event(r.entity,'skillStop',{skillID:id}));r.petAction=null;r.cast=null;r.recoveryUntil=0;}
function hitBatch(game,s,r,job,targets,events,event){for(const target of targets){if(job.hit.has(target))continue;if(target.dead){job.hit.add(target);continue;}const hits=require('./actions-3127').damageTargets(game,s,job.skill,[{kind:'environment',id:target.id,x:target.x,y:target.y,record:target}],{actor:r.entity,aggressor:r.view});job.hit.add(target);require('./combat-input-3127').appendHits(s,hits,job.skill.ID,events,event,world().destroyEvent,job.skill,r.entity);}}
function finish(r,j,time,events,event){events.push(event(r.entity,'skillBoom',{skillID:j.skill.ID,posX:r.x,posY:r.y}),event(r.entity,'skillStop',{skillID:j.skill.ID}));r.petAction=null;r.recoveryUntil=time+Math.max(0,args(j.skill).skillBackswing||0);stop(r,events,event);}
function start(game,s,r,c,time,events,event){
 const sk=c.skill;if(!SUPPORTED.has(sk.ID))return false;if(!validOwner(s,r)||safe(s,r))return true;const t=c.target;if(!t||t.dead||!game.environments.get(r.room)?.rows.has(t.id))return true;if(sk.ID!==2226&&Math.hypot(t.x-r.x,t.y-r.y)>sk.maxDistance)return true;
 if(sk.ID===2268){const made=require('./projectiles-3127').launchPetHurricanes(game,s,r,sk,c.angle);if(made.length)events.push(world().spawnEvent(made));r.recoveryUntil=time+(args(sk).skillBackswing||0);return true;}
 const j={skill:sk,angle:c.angle,start:time,hit:new Set(),retryAt:0,origin:{x:r.x,y:r.y}};
 if(sk.ID===2226){const a=args(sk),distance=Math.min(sk.maxDistance,Math.hypot(t.x-r.x,t.y-r.y)),rad=c.angle*Math.PI/180;Object.assign(j,{kind:'dash',to:{x:r.x+Math.cos(rad)*distance,y:r.y+Math.sin(rad)*distance},left:distance,speed:a.buffSpeedUp||r.speed,radius:sk.skillSize[0],last:{x:r.x,y:r.y}});}
 else if(sk.ID===2260)Object.assign(j,{kind:'suction',end:time+2000,lastTime:time});
 else Object.assign(j,{kind:'point',origin:{x:t.x,y:t.y},end:time});
 r.petAction=j;state(r,3,events,event);return true;
}
function advance(game,s,r,time,dt,events,event){
 const j=r.petAction;if(!j)return false;if(!validOwner(s,r)||safe(s,r)||r.view.world.monsterStatuses?.get(192)?.until>time){cancel(r,events,event);stop(r,events,event);return true;}if(time<j.retryAt)return true;
 try{
  if(j.kind==='dash'){
   if(!j.segment){const distance=Math.min(j.left,j.speed*Math.max(0,Math.min(.1,dt))),rad=j.angle*Math.PI/180,from={x:r.x,y:r.y},to={x:r.x+Math.cos(rad)*distance,y:r.y+Math.sin(rad)*distance};if(!canMove(game,s,r,from,to)){finish(r,j,time,events,event);return true;}const targets=candidates(game,s,r).filter(t=>require('./projectiles-3127').segmentDistance(t.x,t.y,from,to)<=j.radius+require('./actions-3127').targetRadius({record:t})&&clearLine(game,s,from,t));j.segment={from,to,distance,targets};}
   const segment=j.segment;hitBatch(game,s,r,j,segment.targets,events,event);r.x=segment.to.x;r.y=segment.to.y;Object.assign(r.entity.physics,segment.to);events.push(event(r.entity,'moveTo',{...segment.to,direction:1,frequency:1}));j.left-=segment.distance;j.last=segment.to;j.segment=null;if(j.left<=.001)finish(r,j,time,events,event);return true;
  }
  if(j.kind==='suction'&&time<j.end){
   const seconds=Math.min(.1,Math.max(0,(time-j.lastTime)/1000));j.lastTime=time;const a=args(j.skill),fx=require('./monster-effects-3127');
   for(const t of candidates(game,s,r)){if(t.kind==='boss'||(t.entity.buffer?.buffs||[]).some(b=>[125,256,274,393,441,442,720].includes(b.type)))continue;if(!fx.sector(t.x,t.y,j.origin,j.angle,j.skill.effectSize[0],j.skill.effectSize[1])||!clearLine(game,s,j.origin,t))continue;const distance=Math.hypot(t.x-j.origin.x,t.y-j.origin.y);if(distance<=60)continue;const speed=(a.minSuction||0)+((a.maxSuction||0)-(a.minSuction||0))*Math.min(1,distance/j.skill.effectSize[0]),step=Math.min(distance-60,speed*seconds),to={x:t.x+(j.origin.x-t.x)/distance*step,y:t.y+(j.origin.y-t.y)/distance*step};if(!canMove(game,s,t,t,to)||city.safePoint(to.x,to.y,s.world.level,r.mapId))continue;require('./monster-ai-3127').provoke(t,r.view,time);require('./monster-skills-3127').cancel(t,events,event);t.x=to.x;t.y=to.y;Object.assign(t.entity.physics,to);events.push(event(t.entity,'moveTo',{...to,direction:1,frequency:1}));}return true;
  }
  if(!j.impactTargets){const fx=require('./monster-effects-3127');j.impactTargets=candidates(game,s,r).filter(t=>clearLine(game,s,j.origin,t)&&(j.kind==='point'?Math.hypot(t.x-j.origin.x,t.y-j.origin.y)<=j.skill.effectSize[0]:fx.sector(t.x,t.y,j.origin,j.angle,j.skill.effectSize[0],j.skill.effectSize[1])));}
  hitBatch(game,s,r,j,j.impactTargets,events,event);finish(r,j,time,events,event);return true;
 }catch(error){j.retryAt=time+250;if(!j.lastFailureLog||time-j.lastFailureLog>=5000){j.lastFailureLog=time;console.warn('[PET ACTION RETRY]',error.message);}return true;}
}
module.exports={SUPPORTED,state,stop,cancel,start,advance,hitBatch,canMove,clearLine};
