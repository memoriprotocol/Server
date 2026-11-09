'use strict';
// Native repel distance and BuffScheme duration; trajectory/collision/replacement
// policies are server reconstruction, detailed in STAGE53_DISPLACEMENT.json.
const geometry=require('./geometry-3127'),city=require('./city-3127'),water=require('./water-3127');
const buffs=new Map(require('../config/schemes/BuffScheme.json').Buff.map(b=>[b.type,b]));
const immuneControl=new Set([125,256,274,393,441,658,695,720,829]);
const immuneDebuff=new Set([256,274,720]);
function activeBuffs(r,time){return (r.entity.buffer?.buffs||[]).filter(b=>b.isValid!==0&&!(b.endTime>0&&b.endTime<=time));}
function immune(r,id,time=Date.now()){
 const cfg=buffs.get(id),types=activeBuffs(r,time).map(b=>b.type);
 return !!((cfg?.isCtrl||id===32)&&types.some(t=>immuneControl.has(t))||cfg?.isDebuff&&types.some(t=>immuneDebuff.has(t))||[249,261].includes(id)&&types.includes(442)||id===450&&types.includes(451));
}
function radius(r){const size=require('./monster-skills-3127').cfgFor(r).CollideSize||[80];return Math.max(1,Math.min(600,Math.max(...size)/2));}
function start(state,r,skill,id,parsed,context,time,events,event){
 const w=state.world,game=w?.gameRef,distance=Number(parsed.distance),duration=Number(parsed.duration||buffs.get(id)?.duration);
 if(!game||w.mapId!==2||!w.sceneReady||w.dead||w.entity.property.HP<=0||game.environments?.get(w.room)?.rows.get(r.id)!==r||!['mob','boss'].includes(r.kind)||r.dead||r.stationary||id===261&&r.kind==='boss'||!Number.isFinite(distance)||distance<=0||distance>20000||!Number.isFinite(duration)||duration<=0||immune(r,id,time))return false;
 const actor=context.actor||w.entity,dx=r.x-actor.physics.x,dy=r.y-actor.physics.y;
 const angle=Number.isFinite(context.angle)?context.angle:Math.hypot(dx,dy)>.001?Math.atan2(dy,dx)*180/Math.PI:require('./combat-input-3127').aim(w);
 if(!Number.isFinite(angle))return false;
 // Repeated knockback replaces remaining travel; never accumulates an unbounded push.
 if(r.displacement&&r.displacement.id!==id)remove(r,events,event);
 const a=angle*Math.PI/180;
 r.displacement={id,skillID:skill.ID,source:state,world:w,sourceRecord:context.sourceRecord||null,room:w.room,spawnToken:r.spawnToken,start:time,last:time,end:time+duration,duration,distance,ux:Math.cos(a),uy:Math.sin(a)};
 require('./monster-skills-3127').cancel(r,events,event);
 require('./monster-skills-3127').setState(r,1,events,event);
 events.push(event(r.entity,'moveStop',{}));return true;
}
function remove(r,events,event){const j=r.displacement;if(!j)return;r.displacement=null;r.playerStatuses?.delete(j.id);r.entity.buffer.buffs=(r.entity.buffer.buffs||[]).filter(b=>b.type!==j.id);events.push(event(r.entity,'buffRemove',{type:j.id}),event(r.entity,'moveStop',{}));}
function blockers(game,state,r){const margin=radius(r);return [...city.collidersFor(state.world.level,2),...require('./actions-3127').roomStructures(game,state).map(b=>require('./actions-3127').buildingCollider(b,0)).filter(Boolean)].map(b=>b.shape==='rect'?{...b,halfW:b.halfW+margin,halfH:b.halfH+margin}:{...b,radius:b.radius+margin});}
function valid(r,from,to,level){return require('./motion-3127').validPoint(2,to.x,to.y)&&!city.safeOverlapCollider({shape:'circle',...to,radius:radius(r)},level,2)&&water.canMove(r.cid,from.x,from.y,to.x,to.y,2);}
function travel(game,state,r,to){
 const from={x:r.x,y:r.y},fraction=geometry.firstCollision(from.x,from.y,to.x,to.y,blockers(game,state,r));
 const limit=fraction===null?1:Math.max(0,fraction-.00001);let last=from,blocked=fraction!==null;
 const distance=Math.hypot(to.x-from.x,to.y-from.y),steps=Math.max(1,Math.ceil(distance*limit/20));
 for(let i=1;i<=steps;i++){
  const f=limit*i/steps,next={x:from.x+(to.x-from.x)*f,y:from.y+(to.y-from.y)*f};
  if(!valid(r,last,next,state.world.level)){
   let lo=0,hi=1;for(let k=0;k<12;k++){const mid=(lo+hi)/2,p={x:last.x+(next.x-last.x)*mid,y:last.y+(next.y-last.y)*mid};if(valid(r,last,p,state.world.level))lo=mid;else hi=mid;}
   last={x:last.x+(next.x-last.x)*lo,y:last.y+(next.y-last.y)*lo};blocked=true;break;
  }last=next;
 }
 return {...last,blocked};
}
function advance(game,r,time,events,event){
 const j=r.displacement;if(!j)return false;const s=j.source,w=s.world;
 if(r.dead||r.spawnToken!==j.spawnToken||w!==j.world||!w?.sceneReady||w.dead||w.entity.property.HP<=0||w.room!==j.room||w.mapId!==2||j.sourceRecord?.dead||j.sourceRecord?.mounted||(j.sourceRecord&&game.environments?.get(j.room)?.rows.get(j.sourceRecord.id)!==j.sourceRecord)||immune(r,j.id,time)||!r.playerStatuses?.has(j.id)||city.safePoint(w.entity.physics.x,w.entity.physics.y,w.level,2)){
  remove(r,events,event);return true;
 }
 const at=Math.min(time,j.end),dt=Math.max(0,at-j.last);j.last=Math.max(j.last,at);
 if(dt){const step=j.distance*dt/j.duration,to=travel(game,s,r,{x:r.x+j.ux*step,y:r.y+j.uy*step});r.x=to.x;r.y=to.y;Object.assign(r.entity.physics,{x:r.x,y:r.y});events.push(event(r.entity,'moveTo',{x:r.x,y:r.y,direction:1,frequency:1}));if(to.blocked){remove(r,events,event);return true;}}
 if(time>=j.end)remove(r,events,event);return true;
}
function snapshot(r,event){const ev=[event(r.entity,'moveTo',{x:r.x,y:r.y,direction:1,frequency:1})],j=r.displacement;
 for(const type of [249,261]){const b=j?.id===type?r.entity.buffer.buffs.find(b=>b.type===type):null;ev.push(b?event(r.entity,'buffAdd',b):event(r.entity,'buffRemove',{type}));}
 if(!j)ev.push(event(r.entity,'moveStop',{}));return ev;
}
function tick(game,env,peers,time,event){
 const changed=[];
 for(const r of env.rows.values())if(r.displacement){const events=[];advance(game,r,time,events,event);if(events.length)changed.push(r);}
 for(const peer of peers){const w=peer.world;w.displacementPending||=new Map();
  for(const r of changed)if(!r.dead&&w.environmentSeen?.has(r.id))w.displacementPending.set(r.id,{r,token:r.spawnToken});
  for(const [id,p]of w.displacementPending){if(!w.environmentSeen?.has(id)||env.rows.get(id)!==p.r||p.r.spawnToken!==p.token||p.r.dead){w.displacementPending.delete(id);continue;}
   try{game.push(peer,'rm',require('./codec').encode('ReplicateMsg',{events:snapshot(p.r,event)}));w.displacementPending.delete(id);}catch{w.environmentSendFailures=(w.environmentSendFailures||0)+1;}
  }
 }
}
module.exports={immune,activeBuffs,radius,start,remove,travel,advance,tick};
