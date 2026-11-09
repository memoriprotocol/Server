'use strict';
const assets=require('../config/projectile-assets-3127.json');
// skillRange describes damage geometry; it is not a projectile discriminator.
const primarySkills=new Set(require('../config/schemes/WeaponScheme.json').Weapon.map(w=>w.skill));
function register(game,state,shot){
 if(state.world.mapId!==2||shot.nativeRow)return;
 const p=shot.entity.physics,e=shot.entity,row={id:e.id,cid:e.cid||0,type:e.type,kind:'projectile',mapId:2,room:shot.room,x:p.x,y:p.y,homeX:p.x,homeY:p.y,entity:e,dead:false,noRespawn:true,version:1};
 require('./environment-3127').room(game,shot.room).rows.set(e.id,row);shot.nativeRow=row;
}
function createShot(game,state,skill,angle,{actor:source,sourceRecord=null,pierce=false}={}){
 const w=state.world,actor=source||w.entity,a=angle*Math.PI/180,id=game.nextProjectileID=Math.max(game.nextProjectileID||800000000,800000000)+1;
 const entity={id,uid:0,cid:0,type:8,ownerID:actor.id,camp:{campID:actor.camp?.campID||actor.id},ud:JSON.stringify({skillId:skill.ID,skillID:skill.ID,skinID:actor.miscInfo?.curSkinId||w.entity.miscInfo?.curSkinId||0,angle,flip:false,playSound:true}),physics:{x:actor.physics.x,y:actor.physics.y,rotation:angle,direction:1},physics2:{angle}};
 const shot={entity,skill,actor,sourceRecord,ux:Math.cos(a),uy:Math.sin(a),speed:skill.skillSpeed,left:skill.maxDistance,room:w.room,...(pierce?{pierce:true,struck:new Set()}: {})};
 if(sourceRecord?.kind==='heroSummon')shot.blockedByTerrain=true;
 require('./returning-projectiles-3127').attach(shot,state);
 w.projectiles||=[];w.projectiles.push(shot);register(game,state,shot);return entity;
}
function launch(game,state,skill,angle,{actor:source,sourceRecord=null,force=false}={}){
 if(!skill||(!force&&skill.skillRange!==0&&!primarySkills.has(skill.ID))||!assets[skill.ID]||!skill.skillSpeed||!skill.maxDistance)return null;
 if((state.world.projectiles?.length||0)>=64)return [];
 return [createShot(game,state,skill,Number(angle)||0,{actor:source,sourceRecord})];
}
function launchPrimaryPattern(game,state,skill,angles){
 const p=require('./weapon-primary-3127').projectileSkills.get(skill?.ID),a=require('./monster-skills-3127').argsOf(skill||{}),count=Math.max(1,a.num||1);
 if(!p||!Array.isArray(angles)||angles.length!==count||count>3||angles.some(a=>!Number.isFinite(a))||!skill.skillSpeed||!skill.maxDistance||(state.world.projectiles?.length||0)+count>64)return [];
 return angles.map(angle=>createShot(game,state,skill,angle));
}
function launchVolley(game,state,skill,angles,{pierce=false}={}){
 const p=require('./weapon-projectiles-3127').profile(skill);
 if(!p||!Array.isArray(angles)||angles.length<1||angles.length>p.count||angles.some(a=>!Number.isFinite(a))||!skill.skillSpeed||!skill.maxDistance)return [];
 if((state.world.projectiles?.length||0)+angles.length>p.capacity)return [];
 return angles.map(angle=>createShot(game,state,skill,angle,{pierce}));
}
function launchNinja(game,state,skill,angle){
 if(!require('./hero-vfx-3127').plan(state,skill))return [];
 const w=state.world,actor=w.entity,args=require('./monster-skills-3127').argsOf(skill),created=[];w.projectiles||=[];
 for(let i=0;i<Math.min(16,args.num||0)&&w.projectiles.length<64;i++){
  const direction=angle+i*(args.angle||360/args.num),rad=direction*Math.PI/180,id=game.nextProjectileID=Math.max(game.nextProjectileID||800000000,800000000)+1;
  const entity={id,uid:0,cid:0,type:1048,ownerID:actor.id,camp:{campID:actor.camp?.campID||actor.id},ud:JSON.stringify({skinID:actor.miscInfo.curSkinId,angle:direction}),physics:{x:actor.physics.x,y:actor.physics.y,rotation:direction,direction:1},physics2:{angle:direction}};
  const shot={entity,skill,actor,sourceRecord:null,ux:Math.cos(rad),uy:Math.sin(rad),speed:skill.skillSpeed,left:skill.maxDistance,room:w.room,pierce:true,struck:new Set(),healPercent:args.hpArgs||0};w.projectiles.push(shot);register(game,state,shot);created.push(entity);
 }return created;
}
function launchPetHurricanes(game,state,r,skill,angle){
 const w=state.world;if(skill.ID!==2268||r.kind!=='battlePet'||r.cid!==1464||r.dead||r.mounted||w.dead||w.mapId!==2)return [];
 w.projectiles||=[];if(w.projectiles.length>62)return [];
 const rad=angle*Math.PI/180,ux=Math.cos(rad),uy=Math.sin(rad),made=[],env=require('./environment-3127').room(game,w.room);
 for(const side of [-1,1]){const x=r.x-uy*side*skill.skillSize[0]/2,y=r.y+ux*side*skill.skillSize[0]/2,id=game.nextProjectileID=Math.max(game.nextProjectileID||800000000,800000000)+1;
  const entity={id,cid:0,uid:0,type:1053,ownerID:r.id,ud:JSON.stringify({skillId:skill.ID,angle,prefab_path:'arena/skills/vultureHurriance/prefab/vultureHurriance'}),physics:{x,y,rotation:angle,direction:1},physics2:{angle},camp:{campID:r.entity.camp.campID},property:{HP:1,maxHP:1,level:r.level,property:{}}};
  const row={id,cid:0,type:1053,kind:'petProjectile',mapId:w.mapId,room:w.room,x,y,homeX:x,homeY:y,entity,dead:false,noRespawn:true,version:1};env.rows.set(id,row);
  w.projectiles.push({entity,skill,actor:r.entity,sourceRecord:r,ux,uy,speed:skill.skillSpeed,left:skill.maxDistance,room:w.room,pierce:true,struck:new Set(),nativeRow:row,blockedByTerrain:true});made.push(entity);
 }return made;
}
function unregister(game,shot){if(shot.nativeRow)game.environments?.get(shot.room)?.rows.delete(shot.entity.id);}
function segmentDistance(x,y,a,b){const dx=b.x-a.x,dy=b.y-a.y,len=dx*dx+dy*dy,t=len?Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy)/len)):0;return Math.hypot(x-a.x-t*dx,y-a.y-t*dy);}
function tick(game,state,dt,events,event,emitHits){
 const w=state.world;if(!w?.projectiles?.length)return;
 const actions=require('./actions-3127'),env=require('./environment-3127'),city=require('./city-3127'),remaining=[],now=Date.now();
 for(const shot of w.projectiles){
  if(shot.returnFlight){if(require('./returning-projectiles-3127').tick(game,state,shot,dt,events,event,emitHits))remaining.push(shot);continue;}
  if(w.dead||w.room!==shot.room||shot.sourceRecord?.dead||(shot.sourceRecord?.kind==='heroSummon'&&!require('./hero-summons-3127').validSource(game,shot.sourceRecord))||!require('./swordsman-3127').shotValid(state,shot)){unregister(game,shot);events.push(require('./world').destroyEvent([shot.entity.id]));continue;}
  if(now<(shot.retryAt||0)){remaining.push(shot);continue;}
  const a={...shot.entity.physics},step=Math.min(shot.left,shot.speed*dt),b={x:a.x+shot.ux*step,y:a.y+shot.uy*step},radius=Math.max(10,Number(shot.skill.skillSize?.[0])||20)/2;
  let terrainEnd=false;
  if(shot.blockedByTerrain){const bodies=[...city.collidersFor(w.level,w.mapId),...actions.roomStructures(game,state).map(b=>actions.buildingCollider(b,0)).filter(Boolean)],fraction=require('./geometry-3127').firstCollision(a.x,a.y,b.x,b.y,bodies);if(fraction!==null){b.x=a.x+(b.x-a.x)*Math.max(0,fraction-.0001);b.y=a.y+(b.y-a.y)*Math.max(0,fraction-.0001);terrainEnd=true;}}
  const targets=env.records(game,state).filter(r=>!r.dead&&!shot.struck?.has(r.id)&&(shot.swordsman||['battlePet','heroSummon'].includes(shot.sourceRecord?.kind)?['mob','boss']:['mob','boss','tree','stone','ore','chest','statue']).includes(r.kind)&&!(r.effectState?.hiddenUntil>now)&&!city.safePoint(r.x,r.y,w.level,w.mapId)).map(r=>({kind:'environment',id:r.id,x:r.x,y:r.y,record:r})).filter(t=>segmentDistance(t.x,t.y,a,b)<=radius+actions.targetRadius(t)&&(!shot.blockedByTerrain||require('./pet-actions-3127').clearLine(game,state,a,t))).sort((t,u)=>Math.hypot(t.x-a.x,t.y-a.y)-Math.hypot(u.x-a.x,u.y-a.y));
  let impacted=false,failed=false;
  for(const target of (shot.pierce?targets:targets.slice(0,1))){
   let hits;
   try{hits=actions.damageTargets(game,state,shot.skill,[target],{actor:shot.actor,aggressor:shot.sourceRecord?.view,damageMultiplier:require('./swordsman-3127').multiplier(shot,target.record)});}
   catch(error){
    shot.retryAt=now+250;failed=true;
    if(!shot.lastFailureLog||now-shot.lastFailureLog>=5000){shot.lastFailureLog=now;console.warn('[PROJECTILE REWARD RETRY]',error.message);}
    break;
   }
   for(const h of hits){shot.struck?.add(h.id);if(h.damage>0&&shot.healPercent)require('./player-skills-3127').heal(state,shot.healPercent,events,event,undefined,require('./hero-passives-3127').origin(shot.skill));}
   require('./hero-summons-3127').onHit(game,shot.sourceRecord,hits,events,event);
   emitHits(hits,shot.skill.ID,shot.skill,shot.actor,{angle:Math.atan2(shot.uy,shot.ux)*180/Math.PI,sourceRecord:shot.sourceRecord});impacted||=hits.length>0;
  }
  if(failed){remaining.push(shot);continue;}
  shot.retryAt=0;Object.assign(shot.entity.physics,b);if(shot.nativeRow)Object.assign(shot.nativeRow,b);shot.left-=step;events.push(event(shot.entity,'moveTo',{...b,direction:1,frequency:1}));
  if(impacted&&!shot.pierce){unregister(game,shot);events.push(require('./world').destroyEvent([shot.entity.id],0));}
  else if(shot.left<=0||terrainEnd){unregister(game,shot);events.push(require('./world').destroyEvent([shot.entity.id]));}
  else remaining.push(shot);
 }
 w.projectiles=remaining;
}
function clear(game,state){const w=state.world;if(!w?.projectiles?.length)return;const ids=w.projectiles.map(p=>{unregister(game,p);return p.entity.id;});w.projectiles=[];const {roomPeers,destroyEvent}=require('./world'),{encode}=require('./codec');for(const peer of roomPeers(game,state))try{game.push(peer,'rm',encode('ReplicateMsg',{events:[destroyEvent(ids)]}));}catch{}}
module.exports={launchPrimaryPattern,register,launchVolley,launchPetHurricanes,unregister,primarySkills,launch,launchNinja,tick,clear,segmentDistance};
