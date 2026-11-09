'use strict';
// Native parameter recovery; pulse edge convention and vortex interval remain
// explicit local reconstruction policies, not recovered retail server code.
const {randomUUID}=require('node:crypto');
const skills=require('../config/schemes/SkillScheme.json').Skill,weaponIDs=new Set(require('../config/schemes/WeaponScheme.json').Weapon.filter(w=>w.level===1).map(w=>w.skill2));
function profile(skill){if(!skill)return null;if(skill.ID===6004&&[306,307,308].includes(skill.skillType))return{kind:'snowstorm',skill,args:require('./monster-skills-3127').argsOf(skill)};if(skill.level===1&&skill.skillType===426&&weaponIDs.has(skill.ID))return{kind:'vortex',skill,args:require('./monster-skills-3127').argsOf(skill)};return null;}
function capacity(state){return(state.world?.stormCasts?.length||0)+(state.world?.stormFields?.length||0)<8;}
function schedule(game,state,skill,time,events,event){
 const p=profile(skill),w=state.world;if(!p||!w?.sceneReady||w.mapId!==2||w.dead||!capacity(state))return false;
 w.gameRef=game;(w.stormCasts||=[]).push({p,world:w,actor:w.entity,room:w.room,mapId:w.mapId,heroID:w.entity.miscInfo.heroId,weaponID:w.entity.equip.currentItemID,release:time+Math.max(0,skill.castPointTime||0),deadline:time+Math.max(0,skill.castPointTime||0)+1000});return true;
}
function valid(state,f,time,pending=false){const w=state.world,at=w?.entity?.physics;return w===f.world&&w.entity===f.actor&&w.sceneReady&&!w.dead&&w.entity.property.HP>0&&w.room===f.room&&w.mapId===f.mapId&&w.entity.miscInfo.heroId===f.heroID&&(!pending||f.p.kind!=='vortex'||w.entity.equip.currentItemID===f.weaponID)&&!require('./city-3127').safePoint(at.x,at.y,w.level,w.mapId)&&(!pending||time<=f.deadline&&!require('./player-skills-3127').blocked(state,time)&&!(w.monsterStatuses?.get(192)?.until>time));}
function clearState(state,events,event){const w=state.world;if(!w)return;for(const f of [...(w.stormCasts||[]),...(w.stormFields||[])])if(event)events.push(event(w.entity,'skillStop',{skillID:f.p.skill.ID}));const ids=new Set((w.stormFields||[]).flatMap(f=>f.visualIDs||[]));if(ids.size&&event){w.heroVfx=(w.heroVfx||[]).filter(v=>!ids.has(v.entity.id));if(event)events.push(require('./world').destroyEvent([...ids]));}w.stormCasts=[];w.stormFields=[];}
function release(game,state,j,time,events,event){
 const S=require('./player-skills-3127'),aim=require('./combat-input-3127').aim(state.world),point=S.cursor(state,j.p.skill,aim),duration=j.p.args.duration||j.p.skill.duration,interval=j.p.kind==='snowstorm'?j.p.args.hitCd:1000;
 const old=new Set((state.world.heroVfx||[]).map(v=>v.entity.id));
 events.push(event(j.actor,'skillCast',{skillID:j.p.skill.ID,angle:aim,posX:j.actor.physics.x,posY:j.actor.physics.y,targetPos:point}));
 if(j.p.kind==='snowstorm')require('./hero-vfx-3127').start(game,state,j.p.skill,point,duration,events,event);else require('./weapon-vfx-3127').start(game,state,j.p.skill,point,events);
 const visualIDs=(state.world.heroVfx||[]).filter(v=>!old.has(v.entity.id)).map(v=>v.entity.id);
 const f={...j,id:randomUUID(),angle:aim,point,started:time,until:time+duration,next:time,interval,duration,visualIDs,contacts:null,stacks:new Map()};(state.world.stormFields||=[]).push(f);return f;
}
function eligible(game,state,f,r,time){return ['mob','boss'].includes(r.kind)&&!r.dead&&!r.depleted&&!(r.effectState?.hiddenUntil>time)&&game.environments?.get(f.room)?.rows.get(r.id)===r&&!require('./city-3127').safePoint(r.x,r.y,state.world.level,f.mapId)&&Math.hypot(r.x-f.point.x,r.y-f.point.y)<=Number(f.p.skill.effectSize[0])+require('./actions-3127').targetRadius({record:r});}
function life(r){return r.spawnToken||r.entity;}
function pulse(game,state,f,time,events,event){
 if(time<(f.retryAt||0))return;
 const A=require('./actions-3127'),C=require('./combat-input-3127');f.contacts??=require('./environment-3127').records(game,state).filter(r=>eligible(game,state,f,r,time)).slice(0,128).map(r=>({r,life:life(r),settled:false}));
 for(const c of f.contacts){if(c.settled||life(c.r)!==c.life||!eligible(game,state,f,c.r,time))continue;let hits;
  try{const boss=c.r.kind==='boss',amount=f.p.kind==='vortex'?Math.min(boss?f.p.args.bossMaxHp:f.p.args.maxHp,Math.floor(c.r.maxHP*(boss?f.p.args.bossHpArgs:f.p.args.hpArgs)/100)):null;hits=A.damageTargets(game,state,f.p.skill,[{kind:'environment',id:c.r.id,x:c.r.x,y:c.r.y,record:c.r}],f.p.kind==='vortex'?{fixedAmount:amount,fixedType:4,minimumDamage:0,ignoreFlatModifier:true}:{});}
  catch(error){f.retryAt=time+250;return;}
  c.settled=true;
  C.appendHits(state,hits,f.p.skill.ID,events,event,require('./world').destroyEvent,f.p.skill,f.actor,{angle:f.angle});
  if(f.p.kind==='snowstorm'&&hits.some(h=>h.id===c.r.id&&!h.dead&&!h.noBuff))require('./wizard-frost-3127').onHit(state,c.r,f.p.skill,time,events,event);
 }
 f.contacts=null;f.retryAt=0;f.pulses=(f.pulses||0)+1;f.next=time+f.interval;
}
function tick(game,state,time,events,event){
 const w=state.world;if(!w)return;const casts=[];
 for(const j of w.stormCasts||[]){if(!valid(state,j,time,true)){events.push(event(j.actor,'skillStop',{skillID:j.p.skill.ID}));continue;}if(time<j.release){casts.push(j);continue;}release(game,state,j,time,events,event);}w.stormCasts=casts;
 const keep=[];for(const f of w.stormFields||[]){if(!valid(state,f,time)||time>=f.until){const ids=new Set(f.visualIDs);if(ids.size&&event){w.heroVfx=(w.heroVfx||[]).filter(v=>!ids.has(v.entity.id));events.push(require('./world').destroyEvent([...ids]));}events.push(event(f.actor,'skillStop',{skillID:f.p.skill.ID}));continue;}
  // Follow variant is explicitly marked by the native skill args. Other fields
  // keep their release-point; no guessed moving/suction path is substituted.
  if(f.p.kind==='vortex'&&f.p.args.follow){f.point={x:w.entity.physics.x,y:w.entity.physics.y};for(const v of w.heroVfx||[])if(f.visualIDs.includes(v.entity.id)){Object.assign(v.entity.physics,f.point);events.push(event(v.entity,'moveTo',{...f.point,direction:1,frequency:1}));}}
  if(time>=f.next)pulse(game,state,f,time,events,event);keep.push(f);
 }w.stormFields=keep;
}
module.exports={profile,capacity,schedule,valid,clearState,release,eligible,pulse,tick};
