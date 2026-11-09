'use strict';
// Native6015/6032, buffs656/657/238 and CCBard1035. Selection, stacking,
// lifetime and delivery policies are documented in STAGE70_BARD_SUPPORT.json.
const {encode}=require('./codec');
const skills=require('../config/schemes/SkillScheme.json').Skill;
const activeRows=new Map(skills.filter(s=>s.ID===6015).map(s=>[s.level,s]));
const passive=skills.find(s=>s.ID===6032&&s.level===1);
const buffRows=new Map(require('../config/schemes/BuffScheme.json').Buff.map(b=>[b.type,b]));
const W=()=>require('./world'),V=()=>require('./hero-vfx-3127');
function alive(s){const w=s?.world;return !!(w?.sceneReady&&w.loadingFinished&&!w.dead&&w.entity?.property?.HP>0);}
function profile(s){if(!alive(s)||s.world.level==='guide'||s.world.entity.miscInfo?.heroId!==13||s.world.entity.property.level<passive.unlockLv)return null;return activeRows.get(s.world.entity.miscInfo.heroStar)||null;}
function friendly(game,a,b){if(a===b)return true;const ca=a.world.entity.camp?.campID,cb=b.world.entity.camp?.campID;if(ca>0&&ca===cb)return true;return !!game.teams?.teamFor(a.user.id)?.members?.includes(b.user.id);}
function nearby(game,source,radius,friends=true){const w=source.world,p=w.entity.physics;return [...(game.online||[])].filter(s=>alive(s)&&s.world.room===w.room&&s.world.mapId===w.mapId&&friendly(game,source,s)===friends&&Math.hypot(s.world.entity.physics.x-p.x,s.world.entity.physics.y-p.y)<=radius);}
function generation(w){return w.bardGeneration||(w.bardGeneration=Symbol('bard-life'));}
function binding(source,until){const w=source.world;return {source,world:w,actor:w.entity,room:w.room,mapId:w.mapId,generation:generation(w),until};}
function valid(j,target,time){const w=j.source.world;return time<j.until&&w===j.world&&w.entity===j.actor&&w.room===j.room&&w.mapId===j.mapId&&generation(w)===j.generation&&!!profile(j.source)&&alive(target)&&target.world.room===j.room&&target.world.mapId===j.mapId;}
function bound(source,p){const w=source.world;return !!(p&&profile(source)&&p.world===w&&p.actor===w.entity&&p.room===w.room&&p.mapId===w.mapId&&p.generation===generation(w));}
function performance(source,time){const p=source.world?.bardPerformance;return bound(source,p)&&time<p.until?p:null;}
function speedValid(j,target,time){const p=performance(j.source,time);return valid(j,target,time)&&p?.token===j.token&&Math.hypot(target.world.entity.physics.x-j.actor.physics.x,target.world.entity.physics.y-j.actor.physics.y)<=p.radius;}
function dancing(s,time=Date.now()){for(const j of s.world?.bardDanceSources?.values()||[])if(valid(j,s,time))return true;return false;}
function modifiers(s,time=Date.now()){let attack=0,speed=0;for(const j of s.world?.bardAttackSources?.values()||[])if(valid(j,s,time))attack=Math.max(attack,j.value);for(const j of s.world?.bardSpeedSources?.values()||[])if(speedValid(j,s,time))speed=Math.max(speed,j.value);return {attack,speed};}
function apply(property,s,time=Date.now()){const next=structuredClone(property),m=modifiers(s,time);if(next.property){next.property.attack=Math.floor((next.property.attack||0)*(1+m.attack/100));next.property.speed=(next.property.speed||0)+m.speed;}return next;}
function lease(s,key,source,record){(s.world[key]||=new Map()).set(source,record);}
function current(s,type,time){const key={656:'bardAttackSources',657:'bardSpeedSources',238:'bardDanceSources'}[type];const rows=[...(s.world?.[key]?.values()||[])].filter(j=>(type===657?speedValid:valid)(j,s,time));if(!rows.length)return null;rows.sort((a,b)=>(b.value||0)-(a.value||0)||b.until-a.until);return {...rows[0],until:Math.max(...rows.map(j=>j.until))};}
function wire(s,type,time,events,event){const r=current(s,type,time),w=s.world,e=w.entity;w.bardWires||=new Map();const old=w.bardWires.get(type);
 if(!r){if(!old)return;w.bardWires.delete(type);e.buffer.buffs=(e.buffer?.buffs||[]).filter(b=>b.type!==type);events.push(event(e,'buffRemove',{type}));w.bardNeedsDelivery=true;return;}
 if(old&&old.value===(r.value||0)&&Math.abs(r.until-old.until)<500)return;
 const b={type,group:0,duration:r.until-time,startTime:time,endTime:r.until,stackNum:1,maxStackNum:1,isValid:1,propValue:r.value||0,fromEntityType:r.actor.type,fromEntitySkinID:r.actor.miscInfo.curSkinId};
 e.buffer||={};e.buffer.buffs=(e.buffer.buffs||[]).filter(b=>b.type!==type);e.buffer.buffs.push(b);w.bardWires.set(type,{value:r.value||0,until:r.until});events.push(event(e,'buffAdd',b));w.bardNeedsDelivery=true;
}
function stopPerformance(s,events,event){const w=s.world;if(!w?.bardPerformance)return;w.bardPerformance=null;w.playerSkillJobs=(w.playerSkillJobs||[]).filter(j=>j.kind!=='bard');const gone=(w.heroVfx||[]).filter(v=>v.skillID===6015);if(gone.length){w.heroVfx=w.heroVfx.filter(v=>v.skillID!==6015);events.push(W().destroyEvent(gone.map(v=>v.entity.id)));}}
function start(game,s,skill,time,events,event){if(skill.ID!==6015||!profile(s))return false;const w=s.world,a=require('./monster-skills-3127').argsOf(skill),p={...binding(s,time+a.duration),token:Symbol('performance'),skill,radius:skill.effectSize[0],nextHeal:time+a.interval};w.bardPerformance=p;w.playerSkillJobs=(w.playerSkillJobs||[]).filter(j=>j.kind!=='bard');w.playerSkillJobs.push({kind:'bard',skill,next:p.nextHeal,until:p.until,interval:a.interval});
 V().start(game,s,skill,w.entity.physics,a.duration,events,event);
 for(const target of nearby(game,s,p.radius))lease(target,'bardSpeedSources',s,{...binding(s,p.until),token:p.token,value:a.speedArgs});
 // Native description specifies enemy heroes. Default PvP remains unchanged.
 if(skill.level===3&&process.env.HEROS_EXPERIMENTAL_PVP==='1'){
  const duration=Number(String(skill.onHitEnemyBuffArgs[0]).split(':')[1]);
  for(const target of nearby(game,s,p.radius,false)){
   const tw=target.world,at=tw.entity.physics;if(tw.protectedUntil>time||require('./city-3127').safePoint(at.x,at.y,tw.level,tw.mapId))continue;
   lease(target,'bardDanceSources',s,{...binding(s,time+duration),value:0});
   const ci=tw.combatInput;if(ci){ci.auto=false;ci.left=false;ci.right=false;ci.heldSkill=0;}
  }
 }
 updateAll(game,time);return true;
}
function updateTarget(game,s,time){const w=s.world;if(!w?.entity)return;const events=[],event=W().entityEventData;
 for(const [key,predicate]of [['bardAttackSources',valid],['bardSpeedSources',speedValid],['bardDanceSources',valid]])for(const [source,j]of w[key]||[])if(!predicate(j,s,time)||(key==='bardDanceSources'?friendly(game,j.source,s):!friendly(game,j.source,s)))w[key].delete(source);
 for(const id of [656,657,238])wire(s,id,time,events,event);
 const m=modifiers(s,time),signature=m.attack+':'+m.speed;
 if(signature!==(w.bardPropertySignature||'0:0')){w.bardPropertySignature=signature;w.bardNeedsDelivery=true;try{require('./talents-3127').refresh(game,s,time);}catch{}}
 if(events.length)broadcast(game,s,events);
 if(w.bardNeedsDelivery&&time-(w.bardLastDelivery??-Infinity)>=250){w.bardLastDelivery=time;const snapshot=[];for(const id of [656,657,238]){const b=(w.entity.buffer?.buffs||[]).find(b=>b.type===id);snapshot.push(event(w.entity,b?'buffAdd':'buffRemove',b||{type:id}));}snapshot.push(event(w.entity,'propertyResult',{propRes:w.entity.property}));if(broadcast(game,s,snapshot))w.bardNeedsDelivery=false;}
}
function broadcast(game,s,events){if(!events.length)return true;const body=encode('ReplicateMsg',{events});let ok=true;for(const peer of W().roomPeers(game,s))try{game.push(peer,'rm',body);}catch{ok=false;}if(!ok&&s.world)s.world.bardNeedsDelivery=true;return ok;}
function updateAll(game,time){for(const s of game.online||[])if(s.world?.entity)updateTarget(game,s,time);}
function tick(game,time=Date.now()){if(time<(game.nextBardTick||0))return;game.nextBardTick=time+passive.cd;
 for(const s of game.online||[]){const cfg=profile(s),w=s.world;if(!cfg){if(w?.bardPerformance){const ev=[];stopPerformance(s,ev,W().entityEventData);broadcast(game,s,ev);}continue;}const a=require('./monster-skills-3127').argsOf(cfg);
  for(const target of nearby(game,s,passive.effectSize[0]))lease(target,'bardAttackSources',s,{...binding(s,time+buffRows.get(656).duration),value:a.attackArgs});
  const p=w.bardPerformance;if(!p)continue;const pa=require('./monster-skills-3127').argsOf(p.skill);
  const at=w.entity.physics;
  if(!bound(s,p)||time>p.until+250||require('./city-3127').safePoint(at.x,at.y,w.level,w.mapId)||dancing(s,time)){const ev=[];stopPerformance(s,ev,W().entityEventData);broadcast(game,s,ev);continue;}
  const targets=nearby(game,s,p.radius);if(time<p.until)for(const target of targets)lease(target,'bardSpeedSources',s,{...binding(s,p.until),token:p.token,value:pa.speedArgs});
  // Fixed schedule gives ten normal pulses. A stalled tick never repays a burst;
  // <=250ms delivery jitter is allowed, including the last scheduled pulse.
  if(time>=p.nextHeal&&p.nextHeal<=p.until){if(time-p.nextHeal<=250){p.nextHeal+=pa.interval;for(const target of targets){const ev=[];require('./player-skills-3127').heal(target,pa.hpArgs,ev,W().entityEventData);broadcast(game,target,ev);}}else p.nextHeal+=(Math.floor((time-p.nextHeal)/pa.interval)+1)*pa.interval;}
  if(time>=p.until&&p.nextHeal>p.until){const ev=[];stopPerformance(s,ev,W().entityEventData);broadcast(game,s,ev);}
 }
 updateAll(game,time);
}
function clear(game,s,events=[],event=W().entityEventData){const w=s.world;if(!w)return;const changed=modifiers(s).attack>0||modifiers(s).speed>0;generation(w);w.bardGeneration=Symbol('bard-life');stopPerformance(s,events,event);for(const key of ['bardAttackSources','bardSpeedSources','bardDanceSources'])w[key]?.clear();for(const id of [656,657,238])wire(s,id,Date.now(),events,event);w.bardPropertySignature='';
 for(const target of game.online||[])if(target!==s&&target.world?.entity){for(const key of ['bardAttackSources','bardSpeedSources','bardDanceSources'])target.world[key]?.delete(s);updateTarget(game,target,Date.now());}return changed;
}
module.exports={alive,profile,friendly,nearby,binding,valid,performance,dancing,modifiers,apply,start,tick,clear,updateAll};
