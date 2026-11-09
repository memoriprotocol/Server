'use strict';
// Native6010/6028/216/1030. Selection, contact geometry, queues and arrival
// decisions are reconstructed server policies; see STAGE73_TREANT.json.
const rows=require('../config/schemes/SkillScheme.json').Skill;
const skins=new Map(require('../config/schemes/SkinScheme.json').Skin.filter(s=>s.HeroId===9).map(s=>[s.ID,s]));
const bindings=require('./monster-targets-3127'),W=()=>require('./world');
const args=s=>require('./monster-skills-3127').argsOf(s);
function profile(s){return s?.ID===6010&&[340,341,342].includes(s.skillType);}
function alive(s){const w=s?.world;return !!(w?.sceneReady&&w.loadingFinished&&!w.dead&&w.entity?.property?.HP>0);}
function ready(s){const w=s?.world;return alive(s)&&w.mapId===2&&w.entity.miscInfo?.heroId===9&&w.entity.property.level>=10&&skins.has(w.entity.miscInfo.curSkinId);}
function bind(s){return {...bindings.bind(s),skinID:s.world.entity.miscInfo.curSkinId};}
function valid(s,j){return ready(s)&&bindings.matches(j,s)&&s.world.entity.miscInfo.curSkinId===j.skinID;}
function capacity(s){return(s.world?.treantCasts?.length||0)<4;}
function schedule(game,s,skill,time){if(!profile(skill)||!ready(s)||!capacity(s))return false;const w=s.world;(w.treantCasts||=[]).push({...bind(s),skill,release:time+skill.castPointTime,deadline:time+skill.castPointTime+1000,index:0,point:null,contacts:null});return true;}
function friendly(game,a,b){return require('./bard-3127').friendly(game,a,b);}
function passive(game,s,time){if(!ready(s))return false;const w=s.world,skill=rows.find(r=>r.ID===6028&&r.level===w.entity.miscInfo.heroStar);if(!skill||time<(w.treantPassiveReadyAt||0)||(w.treantLeaves?.length||0)+(w.treantLeafCasts?.length||0)*4>60)return false;
 w.treantPassiveReadyAt=time+skill.cd;(w.treantLeafCasts||=[]).push({...bind(s),skill,release:time+skill.castPointTime,deadline:time+skill.castPointTime+1000});return true;
}
function record(game,s,entity,kind){const p=entity.physics,r={id:entity.id,cid:0,type:entity.type,kind,entity,mapId:s.world.mapId,room:s.world.room,x:p.x,y:p.y,homeX:p.x,homeY:p.y,version:1,dead:false,noRespawn:true};require('./environment-3127').room(game,r.room).rows.set(r.id,r);return r;}
function remove(game,r,events){game.environments?.get(r.room)?.rows.delete(r.id);events.push(W().destroyEvent([r.id]));}
function entity(game,s,type,point,ud){const e=s.world.entity,id=game.nextTreantID=Math.max(game.nextTreantID||890000000,890000000)+1;return {id,uid:0,cid:0,type,ownerID:e.id,camp:{campID:e.camp?.campID||e.id},physics:{...point,rotation:0,direction:1},physics2:{angle:0},ud:JSON.stringify(ud)};}
function spawnThorns(game,s,j,time,events){const e=entity(game,s,1030,j.point,{skinID:j.skinID,skillLv:j.skill.level});const r=record(game,s,e,'treantThorns');(s.world.treantVisuals||=[]).push({row:r,until:time+(j.skill.level===3?2100:2000),...bind(s)});events.push(W().spawnEvent([e]));}
function protectedSource(s,time){const w=s.world,p=w.entity.physics;return require('./city-3127').safePoint(p.x,p.y,w.level,w.mapId)||require('./player-skills-3127').blocked(s,time)||w.monsterStatuses?.get(192)?.until>time;}
function root(s,r,skill,time,events){const duration=args(skill).duration;if(skill.level<2||!duration||r.dead||require('./displacement-3127').immune(r,216,time))return;
 const e=s.world.entity,buff={type:216,group:0,duration,startTime:time,endTime:time+duration,stackNum:1,maxStackNum:1,isValid:1,fromEntityType:e.type,fromEntitySkinID:e.miscInfo.curSkinId};
 r.playerStatuses||=new Map();r.playerStatuses.set(216,{id:216,name:'imprisoned_2',source:s,sourceWorld:s.world,sourceActor:e,sourceLife:bindings.life(s),room:s.world.room,sourceMapId:s.world.mapId,spawnToken:r.spawnToken,skill,until:time+duration,damage:0,root:true,control:false,slow:1});
 r.entity.buffer.buffs=(r.entity.buffer.buffs||[]).filter(b=>b.type!==216);r.entity.buffer.buffs.push(buff);events.push(W().entityEventData(r.entity,'buffAdd',buff));
}
function contacts(game,s,j,time){return require('./environment-3127').records(game,s).filter(r=>!r.dead&&['mob','boss'].includes(r.kind)&&!(r.effectState?.hiddenUntil>time)&&!require('./city-3127').safePoint(r.x,r.y,s.world.level,2)&&Math.hypot(r.x-j.point.x,r.y-j.point.y)<=j.skill.effectSize[0]+require('./actions-3127').targetRadius({record:r})).map(r=>({r,life:r.spawnToken,actor:r.entity,done:false}));}
function wave(game,s,j,time,events,changed){if(!j.contacts)j.contacts=contacts(game,s,j,time);for(const c of j.contacts){const r=c.r;if(c.done||r.dead||r.entity!==c.actor||r.spawnToken!==c.life||game.environments?.get(j.room)?.rows.get(r.id)!==r||require('./city-3127').safePoint(r.x,r.y,s.world.level,2))continue;
  let hits;try{hits=require('./actions-3127').damageTargets(game,s,j.skill,[{kind:'environment',id:r.id,x:r.x,y:r.y,record:r}],{actor:j.damageActor});}catch(error){j.retryAt=time+250;j.lastError=String(error.message).slice(0,120);return false;}
  c.done=true;changed.add(r);require('./combat-input-3127').appendHits(s,hits,j.skill.ID,events,W().entityEventData,W().destroyEvent,j.skill,j.damageActor);if(hits.some(h=>h.damage>0&&!h.dead))root(s,r,j.skill,time,events);
 }return true;}
// Original catalog has no dryads_passive1_904. Use the existing base leaf for
// that skin only; do not ask the native loader for a missing prefab.
// 3.12.7 calls these "friendly units" (友方单位), not only other heroes.
// Treat a pet/summon as a separate native recipient, tied to its live actor.
// The original skill has no enemy-hit requirement: weapon SKILL cast -> leaves
// -> contact with living friends -> healing. Enemy impacts never heal.
function friendUnits(game,s,radius){
 const w=s.world,p=w.entity.physics,out=[];
 for(const peer of game.online||[]){
  if(!alive(peer)||peer.world.room!==w.room||peer.world.mapId!==w.mapId||!friendly(game,s,peer))continue;
  const units=[...require('./pets-3127').rows(peer).filter(r=>!r.mounted),...require('./hero-summons-3127').rows(game,peer)];
  for(const unit of units){
   const e=unit.entity;
   if(unit.dead||!e||e.property?.HP<=0||!e.physics||Math.hypot(e.physics.x-p.x,e.physics.y-p.y)>radius)continue;
   out.push({kind:'unit',unit,owner:peer,entity:e,id:e.id,property:e.property});
  }
 }
 return out;
}
// Cocos loads the original native leaf prefab asynchronously. When the leaf
// targets its own spawn point the healing may resolve immediately; retain the
// visual entity after healing so it can render and fly visibly.
const LEAF_VISUAL_MIN_MS=800,LEAF_SELF_DRIFT_SPEED=950,LEAF_SELF_DRIFT_DISTANCE=500;
function launchLeaves(game,s,j,time,events){const w=s.world,a=args(j.skill),p=w.entity.physics;
 const players=[...(game.online||[])].filter(t=>t!==s&&alive(t)&&t.world.room===w.room&&t.world.mapId===w.mapId&&friendly(game,s,t)&&Math.hypot(t.world.entity.physics.x-p.x,t.world.entity.physics.y-p.y)<=j.skill.effectSize[0]).map(t=>({kind:'player',target:t,entity:t.world.entity,id:t.user.id,property:t.world.entity.property}));
 const candidates=[...players,...friendUnits(game,s,j.skill.effectSize[0])];
 const distance=x=>Math.hypot(x.entity.physics.x-p.x,x.entity.physics.y-p.y);
 const ratio=x=>x.property.HP/Math.max(1,x.property.maxHP);
 const selected=candidates.sort((x,y)=>ratio(x)-ratio(y)||distance(x)-distance(y)||x.id-y.id).slice(0,a.num);
 for(const choice of [{kind:'player',target:s,entity:w.entity},...selected]){
  const to=choice.entity.physics,angle=choice.target===s?require('./combat-input-3127').aim(w):Math.atan2(to.y-p.y,to.x-p.x)*180/Math.PI;
  const e=entity(game,s,8,{x:p.x,y:p.y},{skillId:6028,skillID:6028,skinID:j.skinID===904?901:j.skinID,skillLv:j.skill.level,angle});
  e.physics.rotation=angle;e.physics2.angle=angle;
  const r=record(game,s,e,'treantLeaf'),unit=choice.kind==='unit'?choice.unit:null;
  (w.treantLeaves||=[]).push({...j,row:r,target:unit||choice.target,targetKind:choice.kind,targetActor:choice.entity,targetBinding:bindings.bind(choice.owner||choice.target),targetOwner:choice.owner||choice.target,baseHP:w.entity.property.maxHP,born:time,last:time,until:time+a.flyingTime});
  events.push(W().spawnEvent([e]));
 }
}
function targetValid(game,s,j,time){
 const t=j.target;
 if(j.targetKind==='unit'){
  const owner=j.targetOwner;
  if(!alive(owner)||!bindings.matches(j.targetBinding,owner)||!game.online?.has(owner)||owner.world.room!==j.room||owner.world.mapId!==j.mapId||!friendly(game,s,owner))return false;
  if(t.dead||t.entity!==j.targetActor||t.hp<=0||t.entity.property?.HP<=0||game.environments?.get(j.room)?.rows.get(t.id)!==t)return false;
  if(t.kind==='battlePet')return !t.mounted&&require('./pets-3127').rows(owner).includes(t);
  return t.kind==='heroSummon'&&require('./hero-summons-3127').validSource(game,t,time);
 }
 return alive(t)&&bindings.matches(j.targetBinding,t)&&t.world.room===j.room&&t.world.mapId===j.mapId&&friendly(game,s,t)&&game.online?.has(t);
}
function leafHeal(j,a,events,changed){
 if(j.targetKind!=='unit'){
  const target=j.target,hp=target.world.entity.property.HP;
  require('./player-skills-3127').heal(target,a.hpArgs,events,W().entityEventData,j.baseHP,'hero');
  if(hp!==target.world.entity.property.HP)changed.add(target);
  return;
 }
 const unit=j.target,prop=unit.entity.property;
 const delta=Math.min(Math.max(0,prop.maxHP-prop.HP),Math.floor(j.baseHP*a.hpArgs/100));
 if(!delta)return;
 prop.HP+=delta;unit.hp=prop.HP;events.push(W().entityEventData(unit.entity,'addHP',{changeHP:delta,currentHP:prop.HP,maxHP:prop.maxHP}));changed.add(unit);
}
function moveLeaf(game,s,j,time,events,changed){if(!valid(s,j)||!targetValid(game,s,j,time)||time>=j.until){remove(game,j.row,events);return false;}
 const p=j.row.entity.physics,to=j.targetActor.physics,a=args(j.skill),distance=Math.hypot(to.x-p.x,to.y-p.y),radius=j.skill.skillSize[0]/2;
 const dt=Math.max(0,Math.min(100,time-j.last))/1000,speed=j.skill.skillSpeed+a.acceleration*Math.max(0,time-j.born-a.accelerationTime)/1000,step=speed*dt;j.last=time;
 if(distance<=radius+step){leafHeal(j,a,events,changed);
  // Prevent entityCreated + entityDestroyed in one ReplicateMsg: the native
  // CCAsyncBulletEntity would otherwise be released before loadNodeAsync.
  if(time-j.born<LEAF_VISUAL_MIN_MS){(s.world.treantLeafVisuals||=[]).push({...bind(s),row:j.row,born:time,last:time,until:j.born+LEAF_VISUAL_MIN_MS,angle:j.row.entity.physics2.angle||0,drift:j.target===s,distance:0});}
  else remove(game,j.row,events);return false;}
 if(step){const x=p.x+(to.x-p.x)/distance*step,y=p.y+(to.y-p.y)/distance*step;Object.assign(p,{x,y});Object.assign(j.row,{x,y});const angle=Math.atan2(to.y-p.y,to.x-p.x)*180/Math.PI;j.row.entity.physics.rotation=angle;j.row.entity.physics2.angle=angle;
  events.push(W().entityEventData(j.row.entity,'moveTo',{x,y,direction:1,frequency:1}),W().entityEventData(j.row.entity,'rotateTo',{angle,rotation:angle}));}
 return true;
}
function tickLeafVisual(game,s,v,time,events){
 if(!valid(s,v)||time>=v.until){remove(game,v.row,events);return false;}
 if(!v.drift)return true;
 // This only animates the already-healed *self* leaf. Healing remains bound to
 // the original contact, not to the visual lifetime or its outbound movement.
 const dt=Math.max(0,Math.min(100,time-v.last))/1000;v.last=time;
 const step=Math.min(LEAF_SELF_DRIFT_DISTANCE-v.distance,LEAF_SELF_DRIFT_SPEED*dt);
 if(step>0){const p=v.row.entity.physics,rad=v.angle*Math.PI/180,x=p.x+Math.cos(rad)*step,y=p.y+Math.sin(rad)*step;
  v.distance+=step;Object.assign(p,{x,y});Object.assign(v.row,{x,y});
  events.push(W().entityEventData(v.row.entity,'moveTo',{x,y,direction:1,frequency:1}));}
 return true;
}
function correction(game,peer,target,time){game.treantCorrections||=new Map();let q=game.treantCorrections.get(peer);if(!q||!bindings.matches(q.binding,peer))game.treantCorrections.set(peer,q={world:peer.world,binding:bindings.bind(peer),rows:new Map()});if(q.rows.size>=128&&!q.rows.has(target.world?.entity?.id||target.id))q.rows.delete(q.rows.keys().next().value);q.rows.set(target.world?.entity?.id||target.id,target.world?{target,binding:bindings.bind(target),room:target.world.room}:{target,actor:target.entity,life:target.spawnToken,room:target.room??peer.world.room});}
function publish(game,s,events,changed,time){if(!events.length)return;for(const peer of W().roomPeers(game,s))try{W().replicate(game,peer,events);}catch{for(const target of changed)correction(game,peer,target,time);}}
function flush(game,time){if(time<(game.nextTreantCorrection||0))return;game.nextTreantCorrection=time+250;for(const[peer,q]of game.treantCorrections||[]){if(!game.online?.has(peer)||!bindings.matches(q.binding,peer)||!peer.world?.sceneReady){game.treantCorrections.delete(peer);continue;}for(const[id,c]of q.rows){const t=c.target,events=[];if(peer.world.room!==c.room||t.world&&!bindings.matches(c.binding,t)||!t.world&&(t.entity!==c.actor||t.spawnToken!==c.life||game.environments?.get(c.room)?.rows.get(id)!==t)){q.rows.delete(id);continue;}
   const e=t.world?.entity||t.entity;if(!t.world&&t.dead)events.push(W().destroyEvent([id]));else{events.push(W().entityEventData(e,'setHP',{currentHP:e.property.HP,maxHP:e.property.maxHP}));if(!t.world){const b=e.buffer.buffs.find(b=>b.type===216&&b.endTime>time);events.push(W().entityEventData(e,b?'buffAdd':'buffRemove',b||{type:216}));}}
   try{W().replicate(game,peer,events);q.rows.delete(id);}catch{} }if(!q.rows.size)game.treantCorrections.delete(peer);}}
function tickState(game,s,time){const w=s.world;if(!w)return;const events=[],changed=new Set(),casts=[];
 for(const j of w.treantCasts||[]){if(!valid(s,j)||protectedSource(s,time)||time>j.deadline){events.push(W().entityEventData(j.actor,'skillStop',{skillID:6010}));continue;}if(time<j.release||time<(j.retryAt||0)){casts.push(j);continue;}
  if(!j.point){j.angle=require('./combat-input-3127').aim(w);j.point=require('./player-skills-3127').cursor(s,j.skill,j.angle);if(!require('./motion-3127').validPoint(w.mapId,j.point.x,j.point.y)||require('./city-3127').safePoint(j.point.x,j.point.y,w.level,w.mapId)){events.push(W().entityEventData(j.actor,'skillStop',{skillID:6010}));continue;}j.damageActor=structuredClone(w.entity);spawnThorns(game,s,j,time,events);events.push(W().entityEventData(j.actor,'skillCast',{skillID:6010,angle:j.angle,posX:j.actor.physics.x,posY:j.actor.physics.y,targetPos:j.point}));}
  if(!wave(game,s,j,time,events,changed)){casts.push(j);continue;}j.index++;j.contacts=null;if(j.index<(j.skill.level===3?2:1)){j.release=time+100;casts.push(j);}else events.push(W().entityEventData(j.actor,'skillStop',{skillID:6010}));
 }w.treantCasts=casts;
 const leafCasts=[];for(const j of w.treantLeafCasts||[]){if(!valid(s,j)||time>j.deadline)continue;if(time<j.release){leafCasts.push(j);continue;}launchLeaves(game,s,j,time,events);}w.treantLeafCasts=leafCasts;
 w.treantLeaves=(w.treantLeaves||[]).filter(j=>moveLeaf(game,s,j,time,events,changed));
 w.treantLeafVisuals=(w.treantLeafVisuals||[]).filter(v=>tickLeafVisual(game,s,v,time,events));
 w.treantVisuals=(w.treantVisuals||[]).filter(v=>{if(!valid(s,v)||time>=v.until){remove(game,v.row,events);return false;}return true;});publish(game,s,events,changed,time);
}
function tick(game,time=Date.now()){for(const s of game.online||[])tickState(game,s,time);flush(game,time);}
function clear(game,s,events=[],event=W().entityEventData){const w=s.world;if(!w)return;for(const j of w.treantCasts||[])events.push(event(j.actor,'skillStop',{skillID:6010}));for(const j of [...(w.treantLeaves||[]),...(w.treantLeafVisuals||[]),...(w.treantVisuals||[])])remove(game,j.row,events);w.treantCasts=[];w.treantLeafCasts=[];w.treantLeaves=[];w.treantLeafVisuals=[];w.treantVisuals=[];w.treantPassiveReadyAt=0;}
module.exports={skins,profile,ready,capacity,schedule,passive,valid,root,tickState,tick,clear,flush};
