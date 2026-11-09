'use strict';
// Native Wintertide basic: castPoint200ms, point alert, delay500ms, circle hit.
// Limits, target sampling and cancellation policy: STAGE59_WINTERTIDE.json.
const skills=new Map(require('../config/schemes/SkillScheme.json').Skill.filter(s=>s.level===1).map(s=>[s.ID,s])),profiles=new Map();
for(const weapon of require('../config/schemes/WeaponScheme.json').Weapon){const skill=skills.get(weapon.skill);if(weapon.level===1&&skill?.skillType===422&&skill.skillRange===2&&skill.maxDistance>0)profiles.set(weapon.weaponID,{weapon,skill,args:require('./monster-skills-3127').argsOf(skill)});}
const ENTITY_TYPE=1062,PREFAB='arena/skills/bingjinglingfazhang/prefab/attack';
function plan(state,skill){const p=state.world.mapId===2&&profiles.get(state.world.entity.equip.currentItemID);return p&&p.skill.ID===skill?.ID?p:null;}
function capacity(state){const w=state.world;return (w.wintertideCasts?.length||0)<16&&(w.wintertideCasts?.length||0)+(w.wintertideFields?.length||0)<32;}
function schedule(state,p,time){if(!capacity(state))return false;const w=state.world,release=time+p.skill.castPointTime;(w.wintertideCasts||=[]).push({p,world:w,actor:w.entity,room:w.room,key:require('./weapon-primary-3127').identity(state),release,deadline:release+1000});return true;}
function alive(state,j){const w=state.world;return w===j.world&&w.entity===j.actor&&w.mapId===2&&w.room===j.room&&w.sceneReady&&!w.dead&&w.entity.property.HP>0;}
function ready(state,j,time){const w=state.world;return alive(state,j)&&time<=j.deadline&&require('./weapon-primary-3127').identity(state)===j.key&&!require('./player-skills-3127').blocked(state,time)&&!(w.monsterStatuses?.get(192)?.until>time)&&!require('./city-3127').safePoint(w.entity.physics.x,w.entity.physics.y,w.level,2);}
function cancel(state,events=[],event){const w=state.world;if(!w)return;for(const j of w.wintertideCasts||[])if(event)events.push(event(j.actor,'skillStop',{skillID:j.p.skill.ID}));w.wintertideCasts=[];}
function erase(game,f,events){game.environments?.get(f.room)?.rows.delete(f.entity.id);events.push(require('./world').destroyEvent([f.entity.id]));}
function clear(game,state){const w=state.world;if(!w)return;cancel(state);const events=[];for(const f of w.wintertideFields||[])erase(game,f,events);w.wintertideFields=[];if(events.length){const body=require('./codec').encode('ReplicateMsg',{events});for(const p of require('./world').roomPeers(game,state))try{game.push(p,'rm',body);}catch(error){}}}
function release(game,state,j,time,events,event){
 const w=state.world,angle=require('./combat-input-3127').aim(w),point=require('./player-skills-3127').cursor(state,j.p.skill,angle),city=require('./city-3127');
 if(!require('./motion-3127').validPoint(2,point.x,point.y)||city.safePoint(point.x,point.y,w.level,2)){events.push(event(j.actor,'skillStop',{skillID:j.p.skill.ID}));return;}
 const delay=Math.max(0,j.p.args.delayTime||0),id=game.nextWintertideID=Math.max(game.nextWintertideID||860000000,860000000)+1;
 const entity={id,uid:0,cid:0,type:ENTITY_TYPE,ownerID:j.actor.id,camp:{campID:j.actor.camp?.campID||j.actor.id},ud:JSON.stringify({skillID:j.p.skill.ID,scale:j.p.args.scale||1,delayTime:delay}),physics:{x:point.x,y:point.y,rotation:angle,direction:1},physics2:{angle},property:{HP:1,maxHP:1,level:1,property:{}},buffer:{buffs:[]}};
 const row={id,cid:0,type:ENTITY_TYPE,kind:'weaponGround',mapId:2,room:w.room,x:point.x,y:point.y,homeX:point.x,homeY:point.y,entity,dead:false,noRespawn:true,version:1};
 require('./environment-3127').room(game,w.room).rows.set(id,row);
 (w.wintertideFields||=[]).push({...j,entity,row,point,angle,impactAt:time+delay,until:time+Math.max(delay,j.p.skill.duration||0),contacts:null,done:false});
 events.push(event(j.actor,'skillCast',{skillID:j.p.skill.ID,angle,posX:j.actor.physics.x,posY:j.actor.physics.y,targetPos:point}),require('./world').spawnEvent([entity]),event(j.actor,'skillStop',{skillID:j.p.skill.ID}));
}
function token(r){return r.spawnToken||r.entity;}
function eligible(state,r,time){return !r.dead&&!r.depleted&&['mob','boss','tree','stone','ore','chest','statue'].includes(r.kind)&&!(r.effectState?.hiddenUntil>time)&&!require('./city-3127').safePoint(r.x,r.y,state.world.level,2);}
function targets(game,state,f,time){const A=require('./actions-3127');return require('./environment-3127').records(game,state).filter(r=>eligible(state,r,time)&&Math.hypot(r.x-f.point.x,r.y-f.point.y)<=f.p.skill.effectSize[0]+A.targetRadius({record:r})).sort((a,b)=>Math.hypot(a.x-f.point.x,a.y-f.point.y)-Math.hypot(b.x-f.point.x,b.y-f.point.y)).map(r=>({r,life:token(r),settled:false}));}
function tick(game,state,time,events,event,destroy){
 const w=state.world;if(!w)return;const casts=[];
 for(const j of w.wintertideCasts||[]){if(!ready(state,j,time)){events.push(event(j.actor,'skillStop',{skillID:j.p.skill.ID}));continue;}if(time<j.release){casts.push(j);continue;}release(game,state,j,time,events,event);}w.wintertideCasts=casts;
 const fields=[];
 for(const f of w.wintertideFields||[]){
  if(!alive(state,f)||time>f.until||game.environments?.get(f.room)?.rows.get(f.entity.id)!==f.row){erase(game,f,events);continue;}
  // Newly streamed observers should see the remaining warning, not restart500ms.
  f.entity.ud=JSON.stringify({...JSON.parse(f.entity.ud),delayTime:Math.max(0,f.impactAt-time)});
  if(!f.done&&time>=f.impactAt&&time>=(f.retryAt||0)){
   f.contacts??=targets(game,state,f,time);let retry=false;
   for(const item of f.contacts){const r=item.r;if(item.settled||token(r)!==item.life||!eligible(state,r,time)||game.environments?.get(f.room)?.rows.get(r.id)!==r)continue;
    let hits;try{hits=require('./actions-3127').damageTargets(game,state,f.p.skill,[{kind:'environment',id:r.id,x:r.x,y:r.y,record:r}],{actor:f.actor});}
    catch(error){retry=true;f.retryAt=time+250;if(!f.lastFailureLog||time-f.lastFailureLog>=5000){f.lastFailureLog=time;console.warn('[WINTERTIDE REWARD RETRY]',error.message);}break;}
    item.settled=true;require('./combat-input-3127').appendHits(state,hits,f.p.skill.ID,events,event,destroy,f.p.skill,f.actor,{angle:f.angle});
   }
   f.done=!retry;
  }
  if(time>=f.until)erase(game,f,events);else fields.push(f);
 }w.wintertideFields=fields;
}
module.exports={profiles,ENTITY_TYPE,PREFAB,plan,capacity,schedule,cancel,clear,targets,tick};
