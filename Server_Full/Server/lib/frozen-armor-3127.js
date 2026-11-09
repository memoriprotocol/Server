'use strict';
// Native Wintertide423: shield from caster maxHP,3s, absorbed-damage ice burst.
// Party radius, slot replacement, flicker/retries are local; see Stage60 audit.
const {randomUUID}=require('node:crypto'),skills=new Map(require('../config/schemes/SkillScheme.json').Skill.filter(s=>s.level===1).map(s=>[s.ID,s])),profiles=new Map();
for(const w of require('../config/schemes/WeaponScheme.json').Weapon){const skill=skills.get(w.skill2);if(w.level===1&&skill?.skillType===423)profiles.set(skill.ID,{weaponID:w.weaponID,skill,args:require('./monster-skills-3127').argsOf(skill)});}
function profile(skill){return profiles.get(skill?.ID)||null;}
function capacity(state){const w=state.world,j=w.frozenArmorCast;return !j||j.world!==w||j.actor!==w.entity||j.key!==require('./weapon-primary-3127').identity(state);}
function sourceValid(f){const w=f.source.world;return w===f.sourceWorld&&w?.entity===f.actor&&w.sceneReady&&!w.dead&&w.entity.property.HP>0&&w.mapId===2&&w.room===f.room;}
function recipientValid(state,f){const w=state.world;return w===f.recipientWorld&&w?.entity===f.recipient&&w.sceneReady&&!w.dead&&w.entity.property.HP>0&&w.mapId===2&&w.room===f.room;}
function schedule(game,state,skill,time,events,event){const p=profile(skill),w=state.world;if(!p||w.mapId!==2)return false;if(!capacity(state))return false;cancel(state,events,event);w.frozenArmorCast={p,world:w,actor:w.entity,room:w.room,key:require('./weapon-primary-3127').identity(state),release:time+skill.castPointTime,deadline:time+skill.castPointTime+1000};return true;}
function cancel(state,events=[],event){const w=state.world;if(!w?.frozenArmorCast)return;if(event)events.push(event(w.entity,'skillStop',{skillID:w.frozenArmorCast.p.skill.ID}));w.frozenArmorCast=null;}
function removeBuff(state,id,events,event){const e=state.world.entity;if(e.buffer?.buffs?.some(b=>b.type===id)){e.buffer.buffs=e.buffer.buffs.filter(b=>b.type!==id);events.push(event(e,'buffRemove',{type:id}));}}
function drop(state,events,event,removeShield=true){const w=state.world,f=w?.frozenArmor;if(!f)return null;w.frozenArmor=null;if(w.playerShield===f.slot){w.playerShield=null;if(removeShield){const old=w.entity.property.shield||0;w.entity.property.shield=0;if(old)events.push(event(w.entity,'changeShield',{changeShield:-old,currentShield:0}));}}removeBuff(state,324,events,event);removeBuff(state,323,events,event);return f;}
function addBuff(state,id,time,until,scale,events,event,f){const b={type:id,group:0,duration:Math.max(0,until-time),startTime:time,endTime:until,stackNum:1,maxStackNum:1,isValid:1,fromEntityType:f.actor.type,fromEntitySkinID:f.actor.miscInfo?.curSkinId||0,buffExJson:JSON.stringify({scale})},e=state.world.entity;e.buffer||={buffs:[]};e.buffer.buffs=(e.buffer.buffs||[]).filter(x=>x.type!==id);e.buffer.buffs.push(b);events.push(event(e,'buffAdd',b));}
function recipients(game,state,p){const w=state.world,ids=new Set([state.user.id,...(game.teams?.teamFor(state.user.id)?.members||[])]);return [...new Set([state,...game.online])].filter(s=>ids.has(s.user?.id)&&s.world?.sceneReady&&!s.world.dead&&s.world.entity?.property.HP>0&&s.world.mapId===2&&s.world.room===w.room&&Math.hypot(s.world.entity.physics.x-w.entity.physics.x,s.world.entity.physics.y-w.entity.physics.y)<=p.skill.maxDistance);}
function grant(game,source,target,p,time,events,event){
 const w=target.world,e=w.entity,amount=Math.floor(source.world.entity.property.maxHP*p.args.hpArgs/100),old=e.property.shield||0;
 if(amount<old||amount<=0||(w.frozenArmorBursts?.length||0)>=32)return false;
 drop(target,events,event,false);require('./hero-vfx-3127').removeBuff(target,271,events,event);w.gameRef=game;
 const slot={kind:'frozenArmor',token:randomUUID(),until:time+p.args.remainTime};
 const f={p,source,sourceWorld:source.world,actor:source.world.entity,room:w.room,recipientWorld:w,recipient:e,slot,capacity:amount,remaining:amount,absorbed:0,until:slot.until,flicker:false};
 w.playerShield=slot;w.frozenArmor=f;e.property.shield=amount;events.push(event(e,'changeShield',{changeShield:amount-old,currentShield:amount}));addBuff(target,323,time,f.until,p.args.scale||1,events,event,f);return true;
}
function finish(game,state,time,events,event){
 const f=drop(state,events,event);if(!f)return;
 const at=f.recipient.physics;
 if(!sourceValid(f)||!recipientValid(state,f)||require('./city-3127').safePoint(at.x,at.y,state.world.level,2))return;
 (state.world.frozenArmorBursts||=[]).push({f,point:{x:at.x,y:at.y},until:time+1000,contacts:null,definition:{...f.p.skill,damaga:f.absorbed*f.p.args.atkArgs,atkargs:0,args:['damage:'+f.absorbed*f.p.args.atkArgs,'atkArgs:0'],buffTargetType:3,targetBuffID:['100,stun_12'],targetBuffArgs:['duration:'+f.p.args.freezeTime],onHitEnemyBuff:[],onHitEnemyBuffArgs:[]}});
}
// Called before a real PvE hit and after committed shield absorption respectively.
function beforeHit(game,state,time,events,event){const w=state.world,f=w?.frozenArmor;if(!f)return;if(w.playerShield!==f.slot){drop(state,events,event,false);return;}if(!sourceValid(f)||!recipientValid(state,f)){drop(state,events,event);return;}if(time>=f.until)finish(game,state,time,events,event);}
function absorbed(game,state,amount,time,events,event){const f=state.world?.frozenArmor;if(!f||state.world.playerShield!==f.slot||amount<=0)return;f.absorbed+=Math.min(f.remaining,amount);f.remaining=Math.max(0,state.world.entity.property.shield||0);if(f.remaining===0)finish(game,state,time,events,event);}
function token(r){return r.spawnToken||r.entity;}
function eligible(f,r,time){return ['mob','boss'].includes(r.kind)&&!r.dead&&!r.depleted&&!(r.effectState?.hiddenUntil>time)&&!require('./city-3127').safePoint(r.x,r.y,f.source.world.level,2);}
function burst(game,state,j,time,events,event,destroy){
 const f=j.f;if(time>j.until||!sourceValid(f)||!recipientValid(state,f))return false;
 if(time<(j.retryAt||0))return true;
 j.contacts??=require('./environment-3127').records(game,f.source).filter(r=>eligible(f,r,time)&&Math.hypot(r.x-j.point.x,r.y-j.point.y)<=f.p.args.size+require('./actions-3127').targetRadius({record:r})).map(r=>({r,life:token(r),settled:false}));
 const actor={...f.actor,physics:{...f.actor.physics,...j.point}};
 for(const item of j.contacts){const r=item.r;if(item.settled||token(r)!==item.life||!eligible(f,r,time)||game.environments?.get(f.room)?.rows.get(r.id)!==r)continue;
  let hits=[];
  if(f.absorbed>0){try{hits=require('./actions-3127').damageTargets(game,f.source,j.definition,[{kind:'environment',id:r.id,x:r.x,y:r.y,record:r}],{actor:f.actor,minimumDamage:0,ignoreFlatModifier:true});}catch(error){j.retryAt=time+250;if(!j.lastFailureLog||time-j.lastFailureLog>=5000){j.lastFailureLog=time;console.warn('[FROZEN ARMOR REWARD RETRY]',error.message);}return true;}}
  else{require('./monster-ai-3127').provoke(r,f.source,time);hits=[{kind:r.kind,id:r.id,entity:r.entity,damage:0,hp:r.hp,maxHP:r.maxHP,dead:false,dmgType:1}];}
  item.settled=true;require('./combat-input-3127').appendHits(f.source,hits,f.p.skill.ID,events,event,destroy,j.definition,actor);
 }return false;
}
function tick(game,state,time,events,event,destroy){
 const w=state.world;if(!w)return;
 const j=w.frozenArmorCast;
 if(j){const valid=w===j.world&&w.entity===j.actor&&w.sceneReady&&!w.dead&&w.entity.property.HP>0&&w.mapId===2&&w.room===j.room&&require('./weapon-primary-3127').identity(state)===j.key&&time<=j.deadline&&!require('./player-skills-3127').blocked(state,time)&&!(w.monsterStatuses?.get(192)?.until>time)&&!require('./city-3127').safePoint(w.entity.physics.x,w.entity.physics.y,w.level,2);
  if(!valid)cancel(state,events,event);else if(time>=j.release){w.frozenArmorCast=null;const angle=require('./combat-input-3127').aim(w);events.push(event(w.entity,'skillCast',{skillID:j.p.skill.ID,angle,posX:w.entity.physics.x,posY:w.entity.physics.y,targetPos:{x:w.entity.physics.x,y:w.entity.physics.y}}));for(const t of recipients(game,state,j.p))grant(game,state,t,j.p,time,events,event);events.push(event(w.entity,'skillStop',{skillID:j.p.skill.ID}));}
 }
 beforeHit(game,state,time,events,event);
 const f=w.frozenArmor;if(f&&w.entity.property.shield<=0)finish(game,state,time,events,event);else if(f&&!f.flicker&&time>=f.until-1000){f.flicker=true;addBuff(state,324,time,f.until,f.p.args.scale||1,events,event,f);}
 w.frozenArmorBursts=(w.frozenArmorBursts||[]).filter(j=>burst(game,state,j,time,events,event,destroy));
}
function clear(game,state){
 const world=require('./world'),event=world.entityEventData;
 for(const s of new Set([state,...game.online])){const w=s.world;if(!w)continue;const events=[];if(s===state){cancel(s,events,event);w.frozenArmorBursts=[];}if(w.frozenArmor&&(s===state||w.frozenArmor.source===state))drop(s,events,event);if(events.length){const body=require('./codec').encode('ReplicateMsg',{events});for(const peer of world.roomPeers(game,s))try{game.push(peer,'rm',body);}catch(error){}}}
}
module.exports={profiles,profile,capacity,schedule,cancel,sourceValid,recipients,grant,drop,finish,beforeHit,absorbed,tick,clear};
