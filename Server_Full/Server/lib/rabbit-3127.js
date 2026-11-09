'use strict';
// Native6017/317/346/482. Two charges are owned by skill-cooldowns.
// Native max speed and miss curve; PvE aura contact/pulse edges are local policy.
const B=require('./monster-targets-3127'),W=()=>require('./world');
const constants=new Map(require('../config/schemes/ConstantsScheme.json').Constants.map(r=>[r.name,r.content]));
function profile(skill){return skill?.ID===6017&&[372,373,374].includes(skill.skillType);}
function active(s,time=Date.now()){const w=s?.world,j=w?.rabbitRush,e=w?.entity;return j&&B.matches(j,s)&&B.physical(s)&&e.property.level>=10&&e.miscInfo.heroId===15&&e.miscInfo.heroStar===j.star&&e.miscInfo.curSkinId===j.skin&&time<j.until?j:null;}
function apply(property,s,time=Date.now()){const j=active(s,time);if(!j)return property;const p=structuredClone(property);p.property.speed=Number(constants.get('diggerSpeedMax')[0]);p.property.miss=(p.property.miss||0)+j.args.missArgs;return p;}
function add(s,type,time,duration,events,event,value=0){const e=s.world.entity,b={type,group:0,duration,startTime:time,endTime:time+duration,stackNum:1,maxStackNum:1,isValid:1,fromEntityType:e.type,fromEntitySkinID:e.miscInfo.curSkinId,propValue:value};e.buffer||={buffs:[]};e.buffer.buffs=(e.buffer.buffs||[]).filter(x=>x.type!==type);e.buffer.buffs.push(b);events.push(event(e,'buffAdd',b));}
function start(game,s,skill,time,events,event){const w=s.world,e=w.entity;if(!profile(skill)||!B.physical(s)||e.miscInfo.heroId!==15||e.property.level<10)return false;const args=require('./monster-skills-3127').argsOf(skill);w.rabbitRush={...B.bind(s),skill,args,skin:e.miscInfo.curSkinId,star:e.miscInfo.heroStar,until:time+args.duration,next:time+(args.interval||1000),contacts:null,pulses:0};
 for(const[type,value]of[[317,0],[602,0],[346,0],[482,args.missArgs]])add(s,type,time,args.duration,events,event,value);
 require('./talents-3127').refresh(game,s,time);return true;
}
function evade(s,rng=()=>require('node:crypto').randomInt(1000000)/1000000,time=Date.now()){const j=active(s,time);if(!j)return false;const [scale,cap]=constants.get('missExpression').map(Number),chance=Math.min(cap,j.args.missArgs/(scale+j.args.missArgs)),roll=rng();if(!Number.isFinite(roll)||roll<0||roll>=1)throw Error('INVALID_COMBAT_RANDOM');return roll<chance;}
function tick(game,s,time,events,event){const w=s.world,j=w?.rabbitRush;if(!j)return;const e=w.entity;
 if(!B.matches(j,s)||!B.physical(s)||e.property.level<10||e.miscInfo.heroId!==15||e.miscInfo.heroStar!==j.star||e.miscInfo.curSkinId!==j.skin){clear(game,s,events,event);return;}
 if(j.star>=2&&time>=j.next&&j.next<=j.until&&time<=j.until&&time>=(j.retryAt||0)&&!require('./city-3127').safePoint(e.physics.x,e.physics.y,w.level,w.mapId)){
  j.contacts??=require('./player-skills-3127').targets(game,s,j.skill,0,e.physics).filter(t=>['mob','boss'].includes(t.record?.kind)).map(t=>({t,actor:t.record.entity,life:t.record.spawnToken,done:false}));
  for(const c of j.contacts){const r=c.t.record;if(c.done||r.dead||r.entity!==c.actor||r.spawnToken!==c.life||game.environments?.get(j.room)?.rows.get(r.id)!==r||require('./city-3127').safePoint(r.x,r.y,w.level,w.mapId))continue;let hits;try{hits=require('./actions-3127').damageTargets(game,s,j.skill,[c.t]);}catch{j.retryAt=time+250;return;}c.done=true;require('./combat-input-3127').appendHits(s,hits,6017,events,event,W().destroyEvent,j.skill);}
  j.contacts=null;j.retryAt=0;j.pulses++;j.next=time+(j.args.interval||1000);
 }
 if(time>=j.until)clear(game,s,events,event);
}
function clear(game,s,events=[],event=W().entityEventData,{refresh=true}={}){const w=s.world,j=w?.rabbitRush;if(!j)return false;w.rabbitRush=null;const attached=w.entity===j.actor;j.actor.buffer.buffs=(j.actor.buffer?.buffs||[]).filter(b=>![317,602,346,482].includes(b.type));if(attached){for(const type of[317,602,346,482])events.push(event(w.entity,'buffRemove',{type}));if(refresh&&!w.dead&&w.entity.property.HP>0)require('./talents-3127').refresh(game,s);events.push(event(w.entity,'skillStop',{skillID:6017}));}return true;}
module.exports={profile,active,apply,start,evade,tick,clear};
