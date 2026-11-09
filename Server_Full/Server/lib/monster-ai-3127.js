'use strict';
// Native MonsterCfg limits/enums. Scheduling and paths are server reconstruction.
const {randomInt}=require('node:crypto'),water=require('./water-3127'),city=require('./city-3127'),geometry=require('./geometry-3127'),skills=require('./monster-skills-3127');
const contacts=require('./monster-targets-3127');
const STATE={sleep:0,idle:1,patrol:2,attack:3,walk:4,chase:5,flee:6,fastback:7,relax:8,reset:9};
function runtime(r,time){return r.brain||={targetUid:0,hateUntil:0,returning:false,destination:null,nextPatrol:time,wakeAt:time+(Number(skills.cfgFor(r).SleepTime)||0),moving:false};}
function guardFor(r,cfg=skills.cfgFor(r)){
 if((r.mapId||2)!==2)return Number(cfg.GuardRange)||Number(cfg.FixedRange)||Number(cfg.WalkRange)||2000;
 // WalkRange is a walking/patrol field, not evidence of a combat leash.
 return Number(cfg.GuardRange)>0?Number(cfg.GuardRange):Number(cfg.FixedRange)>0?Number(cfg.FixedRange):Math.max(2000,Number(cfg.SeekRange)||0,Number(cfg.ChaseRange)||0);
}
function provoke(r,state,time=Date.now()){
 const b=runtime(r,time),cfg=skills.cfgFor(r),ttl=Math.max(1000,cfg.HateTime||10000);
 if((r.mapId||2)!==2){require('./monster-recovery-3127').stop(r);b.targetUid=contacts.uid(state);b.hateUntil=time+ttl;b.wakeAt=time;b.destination=null;return true;}
 if(!available(r,state,false))return false;
 // A hit outside the home leash must not repeatedly reset recovery or restart a cast.
 if(Math.hypot(r.x-r.homeX,r.y-r.homeY)>guardFor(r,cfg)){contacts.clear(b);b.returning=true;b.lastReturnReason='home-leash';return false;}
 contacts.remember(b,state,time,ttl);
 const old=b.targetBinding;
 if(!old||!contacts.matches(old,b.targetState)||!available(r,b.targetState,false)){contacts.lock(b,state,time,ttl);b.targetState=state;}
 else if(b.targetUid===contacts.uid(state))contacts.refresh(b,time,ttl);
 require('./monster-recovery-3127').stop(r);b.wakeAt=time;b.destination=null;b.returning=false;return true;
}
function available(r,p,requireSeen=true){const w=p?.world,e=w?.entity;return !!(contacts.physical(p)&&w.loadingFinished&&contacts.inRoom(r,p)&&(!requireSeen||w.environmentSeen?.has(r.id))&&!city.safePoint(e.physics.x,e.physics.y,w.level,w.mapId));}
function validMove(r,x,y){return require('./motion-3127').validPoint(r.mapId||2,x,y)&&!city.safePoint(x,y,'main',r.mapId||2)&&!city.overlapsStatic(x,y,50,'main',r.mapId||2)&&water.canMove(r.cid,r.x,r.y,x,y,r.mapId||2)&&!(r.cid===1226&&!water.waterAt(x,y));}
function patrolPoint(r,cfg){const radius=Math.max(0,Math.min(cfg.PatrolRange||cfg.WalkRange||0,(cfg.GuardRange||Infinity)*.8));if(!radius)return null;for(let i=0;i<24;i++){const a=randomInt(1000000)/1000000*Math.PI*2,d=Math.sqrt(randomInt(1000000)/1000000)*radius,x=r.homeX+Math.cos(a)*d,y=r.homeY+Math.sin(a)*d;if(validMove(r,x,y))return{x,y};}return null;}
function decide(r,peers,time){
 const b=runtime(r,time),cfg=skills.cfgFor(r),home={x:r.homeX,y:r.homeY},homeDistance=Math.hypot(r.x-home.x,r.y-home.y),guard=guardFor(r,cfg);
 const eligible=peers.filter(p=>available(r,p)),map2=(r.mapId||2)===2,ttl=Math.max(1000,cfg.HateTime||10000);
 let lostTarget=false,target=(map2?peers.filter(p=>available(r,p,false)):eligible).find(p=>contacts.uid(p)===b.targetUid&&(!map2||!b.targetBinding||contacts.matches(b.targetBinding,p)));
 if(map2&&target&&Math.hypot(target.world.entity.physics.x-r.x,target.world.entity.physics.y-r.y)<=Math.max(0,Number(cfg.SeekRange)||0,Number(cfg.ChaseRange)||0))contacts.refresh(b,time,ttl);
 if(map2)contacts.prune(b,peers,time,p=>available(r,p,false));
 if(target&&time>b.hateUntil){lostTarget=true;target=null;b.targetUid=0;b.targetBinding=null;b.returning=true;b.lastReturnReason='hate-expired';}
 if(b.targetUid&&!target){lostTarget=true;b.targetUid=0;b.targetBinding=null;b.returning=true;b.lastReturnReason='target-unavailable';}
 if(map2&&homeDistance>guard&&(target||b.returning||b.contacts?.size)){contacts.clear(b);b.returning=true;target=null;b.lastReturnReason='home-leash';}
 else if(target&&homeDistance>guard){b.targetUid=0;b.returning=true;target=null;b.lastReturnReason='home-leash';}
 // Retarget a recent combat participant before returning home. Peaceful mobs
 // only use provokers; automatic acquisition still follows native AiType.
 if(map2&&!target&&homeDistance<=guard){
  target=contacts.replacement(b,peers,r);
  if(!target&&(!b.returning||(lostTarget&&b.lastReturnReason!=='home-leash'))&&time>=b.wakeAt&&[1,4,6,7,9].includes(cfg.AiType))target=eligible.filter(p=>Math.hypot(p.world.entity.physics.x-r.x,p.world.entity.physics.y-r.y)<=Math.max(0,cfg.SeekRange||0)).sort((a,c)=>Math.hypot(a.world.entity.physics.x-r.x,a.world.entity.physics.y-r.y)-Math.hypot(c.world.entity.physics.x-r.x,c.world.entity.physics.y-r.y)||contacts.uid(a)-contacts.uid(c))[0];
  if(target){contacts.lock(b,target,time,ttl);b.targetState=target;require('./monster-recovery-3127').stop(r);}
 }

 if(b.returning){if(homeDistance>60)return{state:STATE.fastback,destination:home,target:null,reset:false};b.returning=false;b.destination=null;b.nextPatrol=time+Math.max(0,cfg.RelaxTime||0);return{state:STATE.reset,destination:null,target:null,reset:true};}
 if(!map2&&!target&&time>=b.wakeAt&&[1,4,6,7,9].includes(cfg.AiType)){
  target=eligible.filter(p=>Math.hypot(p.world.entity.physics.x-r.x,p.world.entity.physics.y-r.y)<=Math.max(0,cfg.SeekRange||0)).sort((a,c)=>Math.hypot(a.world.entity.physics.x-r.x,a.world.entity.physics.y-r.y)-Math.hypot(c.world.entity.physics.x-r.x,c.world.entity.physics.y-r.y)||(a.user?.id||a.world.entity.id)-(c.user?.id||c.world.entity.id))[0];
  if(target){b.targetUid=target.user?.id||target.world.entity.id;b.hateUntil=time+Math.max(1000,cfg.HateTime||10000);b.destination=null;}
 }
 if(target){const p=target.world.entity.physics;if(cfg.AiType===3){const d=Math.max(1,Math.hypot(r.x-p.x,r.y-p.y)),distance=Math.min(guard,Math.max(300,cfg.WalkRange||600));return{state:STATE.flee,target:null,destination:{x:r.x+(r.x-p.x)/d*distance,y:r.y+(r.y-p.y)/d*distance}};}
  if(Math.hypot(p.x-r.x,p.y-r.y)<=(cfg.SeekRange||1000)){if(map2)contacts.refresh(b,time,ttl);else b.hateUntil=time+ttl;}
  const ranges=skills.skillsFor(r).filter(s=>!s.isPassive).map(s=>require('./monster-effects-3127').castRange(s)).filter(x=>x>0),nearestRange=Math.max(10,ranges.length?Math.min(...ranges):200);
  return{state:STATE.chase,target,destination:Math.hypot(p.x-r.x,p.y-r.y)>nearestRange*.8?p:null};
 }
 if(time<b.wakeAt)return{state:STATE.sleep,target:null,destination:null};if(time<b.nextPatrol)return{state:STATE.idle,target:null,destination:null};
 if(!b.destination){b.destination=patrolPoint(r,cfg);b.patrolEnd=time+Math.max(500,cfg.PatrolTime||cfg.WalkTime||3000);}
 if(!b.destination||time>=b.patrolEnd||Math.hypot(r.x-b.destination.x,r.y-b.destination.y)<40){b.destination=null;b.nextPatrol=time+Math.max(250,cfg.IdleTime||cfg.RelaxTime||1000);return{state:STATE.idle,target:null,destination:null};}
 return{state:cfg.PatrolRange?STATE.patrol:STATE.walk,target:null,destination:b.destination};
}
function step(r,destination,dt,fast=false){if(!destination)return null;const d=Math.hypot(destination.x-r.x,destination.y-r.y);if(d<2)return null;const angle=Math.atan2(destination.y-r.y,destination.x-r.x),speed=Math.max(1,r.speed)*(fast?1.8:1),distance=Math.min(d,speed*dt),blockers=city.collidersFor('main',r.mapId||2);for(const turn of [0,Math.PI/6,-Math.PI/6,Math.PI/3,-Math.PI/3,Math.PI/2,-Math.PI/2]){const a=angle+turn,x=r.x+Math.cos(a)*distance,y=r.y+Math.sin(a)*distance;if(validMove(r,x,y)&&geometry.firstCollision(r.x,r.y,x,y,blockers)===null)return{x,y,angle:a*180/Math.PI};}return null;}
module.exports={STATE,runtime,guardFor,provoke,available,validMove,patrolPoint,decide,step};
