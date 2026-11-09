'use strict';
// Native6012,1027,1059,401,210,305. Server cadence, selection, impacts and
// derived-stat composition are reconstructed policies, not recovered retail AI.
const skills=require('../config/schemes/SkillScheme.json').Skill;
const skins=new Map(require('../config/schemes/SkinScheme.json').Skin.filter(s=>s.HeroId===11).map(s=>[s.ID,s]));
const weapons=new Map(require('../config/schemes/WeaponScheme.json').Weapon.filter(w=>w.level===1).map(w=>[w.weaponID,w]));
const binding=require('./monster-targets-3127'),W=()=>require('./world'),PS=()=>require('./player-skills-3127');
const args=s=>require('./monster-skills-3127').argsOf(s);
function profile(skill){return skill?.ID===6012&&[346,347,348].includes(skill.skillType);}
function ready(s){const w=s?.world,e=w?.entity;return !!(w?.sceneReady&&w.loadingFinished&&!w.dead&&w.mapId===2&&e?.property?.HP>0&&e.property.level>=10&&e.miscInfo?.heroId===11&&skins.has(e.miscInfo.curSkinId));}
function bind(s){return {...binding.bind(s),skinID:s.world.entity.miscInfo.curSkinId};}
function valid(s,j){return ready(s)&&binding.matches(j,s)&&s.world.entity.miscInfo.curSkinId===j.skinID;}
function capacity(s){const w=s.world;return(w?.witchCasts?.length||0)+(w?.witchStoves?.length||0)<4;}
function schedule(game,s,skill,time){if(!profile(skill)||!ready(s)||!capacity(s))return false;(s.world.witchCasts||=[]).push({...bind(s),skill,release:time+skill.castPointTime,deadline:time+skill.castPointTime+1000});return true;}
function poisonCount(s,context={}){const list=context.inventory||require('./inventory').inventoryOf(s),current=context.currentWeaponUUID??s.world?.entity?.equip?.currentItemUUID,ids=new Set();for(const i of list)if((i.bagType===2||i.uuid===current)&&weapons.get(i.itemCfgId)?.attribute===4)ids.add(i.uuid);return Math.min(3,ids.size);}
function bonus(s,context){return ready(s)&&s.world.entity.miscInfo.heroStar===3?poisonCount(s,context)*10:0;}
function apply(property,s,context){const value=bonus(s,context);if(!value)return property;const out=structuredClone(property);out.property.attack=Math.floor((out.property.attack||0)*(1+value/100));return out;}
function record(game,s,type,point,ud,kind){const e=s.world.entity,id=game.nextWitchID=Math.max(game.nextWitchID||900000000,900000000)+1;
 const entity={id,uid:0,cid:0,type,ownerID:e.id,camp:{campID:e.camp?.campID||e.id},physics:{...point,rotation:0,direction:1},physics2:{angle:0},property:{HP:1,maxHP:1,level:ud.skillLevel,property:{}},buffer:{buffs:[]},ud:JSON.stringify(ud)};
 const row={id,cid:0,type,entity,kind,room:s.world.room,mapId:2,x:point.x,y:point.y,homeX:point.x,homeY:point.y,version:1,dead:false,noRespawn:true};require('./environment-3127').room(game,row.room).rows.set(id,row);return row;
}
function remove(game,row,events){game.environments?.get(row.room)?.rows.delete(row.id);events.push(W().destroyEvent([row.id]));}
function protectedSource(s,time){const w=s.world,p=w.entity.physics;return require('./city-3127').safePoint(p.x,p.y,w.level,w.mapId)||PS().blocked(s,time)||w.monsterStatuses?.get(192)?.until>time;}
function spawn(game,s,j,time,events){const w=s.world,angle=require('./combat-input-3127').aim(w),point=PS().cursor(s,j.skill,angle);if(!require('./motion-3127').validPoint(2,point.x,point.y)||require('./city-3127').safePoint(point.x,point.y,w.level,2))return false;
 const a=args(j.skill),row=record(game,s,1027,point,{skinID:j.skinID,skillLevel:j.skill.level},'witchStove');(w.witchStoves||=[]).push({...j,row,args:a,until:time+a.duration,nextFire:time+a.numTime});events.push(W().entityEventData(w.entity,'skillCast',{skillID:6012,angle,posX:w.entity.physics.x,posY:w.entity.physics.y,targetPos:point}),W().spawnEvent([row.entity]));return true;
}
function candidates(game,s,point,radius,time){return require('./environment-3127').records(game,s).filter(r=>!r.dead&&['mob','boss'].includes(r.kind)&&!(r.effectState?.hiddenUntil>time)&&!require('./city-3127').safePoint(r.x,r.y,s.world.level,2)&&Math.hypot(r.x-point.x,r.y-point.y)<=radius).sort((a,b)=>Math.hypot(a.x-point.x,a.y-point.y)-Math.hypot(b.x-point.x,b.y-point.y)||a.id-b.id);}
function fire(game,s,stove,time,events){const w=s.world,targets=candidates(game,s,stove.row,stove.args.size,time).slice(0,stove.args.num);if(!targets.length)return;
 events.push(W().entityEventData(stove.row.entity,'witchStoveCastFire',{}));for(const r of targets){if((w.witchShots?.length||0)>=64)break;const point={x:r.x,y:r.y},row=record(game,s,1059,point,{skinID:stove.skinID,skillLevel:stove.skill.level,stovePos:{x:stove.row.x,y:stove.row.y},stoveDamageInterval:stove.args.numTime},'witchShot');
  (w.witchShots||=[]).push({...bind(s),skill:stove.skill,row,point,release:time+1300,deadline:time+2300,contacts:null,damageActor:structuredClone(w.entity)});events.push(W().spawnEvent([row.entity]));}
}
function statusActive(s,r,j,type){const st=r.playerStatuses?.get(type);return st?.witchToken===j.token&&require('./mob-control-3127').sourceValid(st,r);}
function installPoison(s,r,skill,damageActor,time){if(skill.level<2||r.dead)return;const first=r.playerStatuses?.get(210),second=r.playerStatuses?.get(305);if(first?.source!==s&&second?.source!==s)return;
 const poisonArgs=PS().buffArgs(skill.onHitEnemyBuffArgs[0]),drainArgs=PS().buffArgs(skill.onHitEnemyBuffArgs[1]),duration=Math.max(poisonArgs.duration,drainArgs.duration);const token=Symbol('witch-poison'),j={...bind(s),r,targetActor:r.entity,spawnToken:r.spawnToken,skill,damageActor,token,poisonArgs,drainArgs,next:time+1000,until:time+duration,deadline:time+duration+1000};
 for(const[type,st]of [[210,first],[305,second]])if(st?.source===s){Object.assign(st,{witchToken:token,sourceActor:s.world.entity,sourceLife:binding.life(s),until:j.until,damage:0});const wire=r.entity.buffer.buffs.find(b=>b.type===type);if(wire){wire.fromEntityType=s.world.entity.type;wire.fromEntitySkinID=j.skinID;}}
 (s.world.witchDots||=[]).push(j);
}
function impact(game,s,j,time,events,changed){if(!j.contacts)j.contacts=candidates(game,s,j.point,j.skill.effectSize[0]+600,time).filter(r=>Math.hypot(r.x-j.point.x,r.y-j.point.y)<=j.skill.effectSize[0]+require('./actions-3127').targetRadius({record:r})).map(r=>({r,actor:r.entity,life:r.spawnToken,done:false}));
 for(const c of j.contacts){const r=c.r;if(c.done||r.dead||r.entity!==c.actor||r.spawnToken!==c.life||game.environments?.get(j.room)?.rows.get(r.id)!==r||require('./city-3127').safePoint(r.x,r.y,s.world.level,2))continue;
  let hits;try{hits=require('./actions-3127').damageTargets(game,s,j.skill,[{kind:'environment',id:r.id,x:r.x,y:r.y,record:r}],{actor:j.damageActor});}catch(error){j.retryAt=time+250;j.error=String(error.message).slice(0,120);return false;}
  c.done=true;changed.add(r);require('./combat-input-3127').appendHits(s,hits,6012,events,W().entityEventData,W().destroyEvent,j.skill,j.damageActor);if(hits.some(h=>h.damage>0&&!h.dead))installPoison(s,r,j.skill,j.damageActor,time);
 }return true;
}
function removeStatuses(j,events){const r=j.r;for(const type of [210,305])if(r.playerStatuses?.get(type)?.witchToken===j.token){r.playerStatuses.delete(type);r.entity.buffer.buffs=(r.entity.buffer.buffs||[]).filter(b=>b.type!==type);events.push(W().entityEventData(r.entity,'buffRemove',{type}));}}
function dot(game,s,j,time,events,changed){const r=j.r;if(!valid(s,j)||r.dead||r.entity!==j.targetActor||r.spawnToken!==j.spawnToken||game.environments?.get(j.room)?.rows.get(r.id)!==r||time>j.deadline||require('./city-3127').safePoint(r.x,r.y,s.world.level,2)){removeStatuses(j,events);changed.add(r);return false;}
 const poisoned=statusActive(s,r,j,210),drained=statusActive(s,r,j,305);if(!poisoned&&!drained)return false;if(time<j.next||time<(j.retryAt||0))return true;
 if(j.next>j.until){removeStatuses(j,events);changed.add(r);return false;}
 if(time-j.next>250){j.next+=Math.ceil((time-j.next)/1000)*1000;if(j.next>j.until){removeStatuses(j,events);changed.add(r);return false;}return true;}
 if(poisoned){const p=require('./actions-3127').targetProperties(r),def={...j.skill,canCrit:false,args:['damage:0','atkArgs:'+j.poisonArgs.args],damaga:0,atkargs:j.poisonArgs.args},amount=require('./damage-3127').calculate(j.damageActor.property.property,def,{targetProperty:p}).amount;let hits;
  try{hits=require('./actions-3127').damageTargets(game,s,def,[{kind:'environment',id:r.id,x:r.x,y:r.y,record:r}],{actor:j.damageActor,fixedAmount:amount,fixedType:3,ignoreFlatModifier:true});}catch(error){j.retryAt=time+250;return true;}
  changed.add(r);for(const h of hits)h.noBuff=true;require('./combat-input-3127').appendHits(s,hits,6012,events,W().entityEventData,W().destroyEvent,j.skill,j.damageActor);
 }
 if(drained&&!r.dead){const amount=j.drainArgs.propValue,p=r.entity.property;p.strength=Math.max(0,(p.strength||0)-amount);events.push(W().entityEventData(r.entity,'propertyResult',{propRes:p}));changed.add(r);}
 j.next+=1000;j.retryAt=0;if(r.dead||j.next>j.until){removeStatuses(j,events);changed.add(r);return false;}return true;
}
function queue(game,peer,target){let q=(game.witchCorrections||=new Map()).get(peer);if(!q||!binding.matches(q.binding,peer))game.witchCorrections.set(peer,q={binding:binding.bind(peer),rows:new Map()});const id=target.world?.entity?.id||target.id;if(q.rows.size>=128&&!q.rows.has(id))q.rows.delete(q.rows.keys().next().value);q.rows.set(id,target.world?{target,binding:binding.bind(target),room:target.world.room}:{target,actor:target.entity,life:target.spawnToken,room:target.room??peer.world.room});}
function publishRoom(game,room,events,changed,mapId=2){if(!events.length)return;for(const peer of [...(game.online||[])].filter(p=>p.world?.sceneReady&&p.world.room===room&&p.world.mapId===mapId))try{W().replicate(game,peer,events);}catch{for(const r of changed)queue(game,peer,r);}}
function publish(game,s,events,changed){publishRoom(game,s.world.room,events,changed,s.world.mapId);}
function cancelJob(game,s,j,events,changed,kind){const out=[],targets=new Set();if(kind==='cast'){if(binding.matches(j,s))out.push(W().entityEventData(j.actor,'skillStop',{skillID:6012}));}else if(kind==='dot'){removeStatuses(j,out);targets.add(j.r);}else remove(game,j.row,out);if(j.room===s.world.room){events.push(...out);for(const r of targets)changed.add(r);}else publishRoom(game,j.room,out,targets);}
function flush(game,time){if(time<(game.nextWitchCorrection||0))return;game.nextWitchCorrection=time+250;for(const[peer,q]of game.witchCorrections||[]){if(!game.online.has(peer)||!binding.matches(q.binding,peer)||!peer.world?.sceneReady){game.witchCorrections.delete(peer);continue;}
  for(const[id,c]of q.rows){const t=c.target;if(peer.world.room!==c.room||t.world&&!binding.matches(c.binding,t)||!t.world&&(t.entity!==c.actor||t.spawnToken!==c.life||game.environments?.get(c.room)?.rows.get(id)!==t)){q.rows.delete(id);continue;}
   const e=t.world?.entity||t.entity,events=[];if(!t.world&&t.dead)events.push(W().destroyEvent([id]));else{events.push(W().entityEventData(e,'setHP',{currentHP:e.property.HP,maxHP:e.property.maxHP}),W().entityEventData(e,'propertyResult',{propRes:e.property}));for(const type of t.world?[401]:[210,305]){const b=e.buffer.buffs.find(b=>b.type===type&&(!(b.endTime>0)||b.endTime>time));events.push(W().entityEventData(e,b?'buffAdd':'buffRemove',b||{type}));}}
   try{W().replicate(game,peer,events);q.rows.delete(id);}catch{} }if(!q.rows.size)game.witchCorrections.delete(peer);}
}
function passive(game,s,time,events,changed){const w=s.world,active=ready(s)&&w.entity.miscInfo.heroStar===3,value=bonus(s),signature=active?String(value):'inactive';if(signature===w.witchPassiveSignature)return;
 const old=w.witchPassiveBonus||0;w.witchPassiveSignature=signature;w.witchPassiveBonus=value;if(value||old)try{require('./talents-3127').refresh(game,s,time);}catch{queue(game,s,s);}
 if(active){const b={type:401,group:0,duration:-1,startTime:time,endTime:0,stackNum:1,maxStackNum:1,isValid:1,propValue:value,fromEntityType:w.entity.type,fromEntitySkinID:w.entity.miscInfo.curSkinId,buffExJson:JSON.stringify({attribute:4,atkAgrs:10,weaponNum:value/10})};w.entity.buffer.buffs=(w.entity.buffer.buffs||[]).filter(b=>b.type!==401);w.entity.buffer.buffs.push(b);w.witchPassiveWired=true;events.push(W().entityEventData(w.entity,'buffAdd',b));changed.add(s);}
 else if(w.witchPassiveWired){w.witchPassiveWired=false;w.entity.buffer.buffs=(w.entity.buffer.buffs||[]).filter(b=>b.type!==401);events.push(W().entityEventData(w.entity,'buffRemove',{type:401}));changed.add(s);}
}
function tickState(game,s,time){const w=s.world;if(!w?.entity)return;const events=[],changed=new Set();passive(game,s,time,events,changed);
 const casts=[];for(const j of w.witchCasts||[]){if(!valid(s,j)||protectedSource(s,time)||time>j.deadline){cancelJob(game,s,j,events,changed,'cast');continue;}if(time<j.release){casts.push(j);continue;}spawn(game,s,j,time,events);events.push(W().entityEventData(j.actor,'skillStop',{skillID:6012}));}w.witchCasts=casts;
 const stoves=[];for(const j of w.witchStoves||[]){if(!valid(s,j)||time>=j.until||require('./city-3127').safePoint(w.entity.physics.x,w.entity.physics.y,w.level,2)){cancelJob(game,s,j,events,changed,'row');continue;}if(time>=j.nextFire){if(time-j.nextFire<=250)fire(game,s,j,time,events);j.nextFire+=(Math.floor((time-j.nextFire)/j.args.numTime)+1)*j.args.numTime;}stoves.push(j);}w.witchStoves=stoves;
 const shots=[];for(const j of w.witchShots||[]){if(!valid(s,j)||time>j.deadline){cancelJob(game,s,j,events,changed,'row');continue;}if(time<j.release||time<(j.retryAt||0)){shots.push(j);continue;}if(!impact(game,s,j,time,events,changed)){shots.push(j);continue;}remove(game,j.row,events);}w.witchShots=shots;
 w.witchDots=(w.witchDots||[]).filter(j=>{if(j.room!==w.room){cancelJob(game,s,j,events,changed,'dot');return false;}return dot(game,s,j,time,events,changed);});publish(game,s,events,changed);
}
function tick(game,time=Date.now()){for(const s of game.online||[])tickState(game,s,time);flush(game,time);}
function clear(game,s,events=[],event=W().entityEventData){const w=s.world;if(!w)return;const changed=new Set();for(const j of w.witchCasts||[])cancelJob(game,s,j,events,changed,'cast');for(const j of [...(w.witchStoves||[]),...(w.witchShots||[])])cancelJob(game,s,j,events,changed,'row');for(const j of w.witchDots||[])cancelJob(game,s,j,events,changed,'dot');w.witchCasts=[];w.witchStoves=[];w.witchShots=[];w.witchDots=[];if(w.witchPassiveWired){w.entity.buffer.buffs=(w.entity.buffer.buffs||[]).filter(b=>b.type!==401);events.push(event(w.entity,'buffRemove',{type:401}));}w.witchPassiveWired=false;w.witchPassiveSignature=null;w.witchPassiveBonus=0;}
module.exports={skins,profile,ready,bind,valid,capacity,schedule,poisonCount,bonus,apply,spawn,candidates,fire,impact,installPoison,dot,tickState,tick,clear,flush};
