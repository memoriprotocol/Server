'use strict';
// Stage82 / Feb-2024 native client anchors:
// 6020 active (SkillScheme 397..399), 6021 passive (400..402), buff 273
// CCSlimComp.transformSlim/unTransformSlim, CCSlimPassive acidMucus=0x415.
// The original retail SERVER's disguise AI and target cadence are unavailable.
// This bounded server reconstruction preserves original numbers and prefab IDs.
const skills=require('../config/schemes/SkillScheme.json').Skill;
const {bind,matches}=require('./monster-targets-3127');
const W=()=>require('./world');
const passiveRows=new Map(skills.filter(r=>r.ID===6021).map(r=>[r.level,r]));
const ACTIVE_BUFF=273,ENTITY_TYPE=1045;
function profile(row){return row?.ID===6020&&[397,398,399].includes(row.skillType)&&[1,2,3].includes(row.level);}
function passive(star){return passiveRows.get(Number(star));}
function eligible(state){const w=state?.world,e=w?.entity;return !!(w?.sceneReady&&w.loadingFinished!==false&&!w.dead&&e?.property?.HP>0&&e.property.level>=10&&e.miscInfo?.heroId===19);}
function current(state){return state?.world?.slimeDisguise||null;}
function valid(state,j){return !!(eligible(state)&&j&&matches(j.binding,state)&&state.world.entity.miscInfo.heroStar===j.star&&j.actor===state.world.entity);}
function active(state){const j=current(state);return valid(state,j)?j:null;}
// Client: nearest resource or REGULAR monster; never bosses/chests/statues.
function mimic(game,state,skill){const w=state.world,p=w.entity.physics,range=Number(skill.effectSize?.[0])||1000;
 return require('./environment-3127').records(game,state).filter(r=>!r.dead&&['tree','stone','ore','mob'].includes(r.kind)&&r.entity&&!(r.effectState?.hiddenUntil>Date.now())&&Math.hypot(r.x-p.x,r.y-p.y)<=range).sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y)||a.id-b.id)[0]||null;
}
function addBuff(state,j,time,events,event){const e=j.actor;e.buffer||={};e.buffer.buffs||=[];
 const wire={type:ACTIVE_BUFF,group:0,duration:j.duration,startTime:time,endTime:time+j.duration,stackNum:1,maxStackNum:1,isValid:1,
  fromEntityType:e.type,fromEntitySkinID:e.miscInfo.curSkinId};
 e.buffer.buffs=e.buffer.buffs.filter(b=>b.type!==ACTIVE_BUFF);e.buffer.buffs.push(wire);events.push(event(e,'buffAdd',wire));
}
function start(game,state,skill,time,events,event){if(!profile(skill)||!eligible(state)||active(state))return false;
 const target=mimic(game,state,skill);if(!target)return false;
 const w=state.world,actor=w.entity,passiveRow=passive(skill.level);if(!passiveRow)return false;
 const duration=Number(skill.duration)||5000;
 const j={binding:bind(state),actor,star:skill.level,skill,passiveRow,room:w.room,mapId:w.mapId,skinID:actor.miscInfo.curSkinId,
  started:time,until:time+duration,duration,mimicID:target.id,mimicType:target.type};
 w.slimeDisguise=j;addBuff(state,j,time,events,event);
 // The native EntityEvent.transformTo carries just an integer 'id'. Binding
 // it to the chosen native entity is a protocol hypothesis, not proven retail.
 events.push(event(actor,'transformTo',{id:target.id}));
 return true;
}
function createPool(game,state,j,time,events){const w=state.world,point={x:j.actor.physics.x,y:j.actor.physics.y},id=game.nextSlimeEntityID=Math.max(game.nextSlimeEntityID||870000000,870000000)+1;
 const entity={id,uid:0,cid:0,type:ENTITY_TYPE,ownerID:j.actor.id,camp:{campID:j.actor.camp?.campID||j.actor.id},physics:{x:point.x,y:point.y,rotation:0,direction:1},physics2:{angle:0},property:{HP:1,maxHP:1,level:j.star,property:{}},buffer:{buffs:[]},ud:JSON.stringify({skillLv:j.star,skinID:j.skinID,sourceID:j.actor.id})};
 const row={id,cid:0,type:ENTITY_TYPE,entity,kind:'slimePool',room:w.room,mapId:w.mapId,x:point.x,y:point.y,homeX:point.x,homeY:point.y,version:1,dead:false,noRespawn:true};
 require('./environment-3127').room(game,w.room).rows.set(id,row);
 const duration=Number(j.passiveRow.duration)||5000;
 const pool={...j,row,point,started:time,until:time+duration,nextTick:time+1000};
 (w.slimePools||=[]).push(pool);events.push(W().spawnEvent([entity]));
 return pool;
}
function breakDisguise(game,state,time,events,event,reason='manual'){
 const j=current(state);if(!j)return false;
 const w=state.world;w.slimeDisguise=null;
 j.actor.buffer||={};j.actor.buffer.buffs=(j.actor.buffer.buffs||[]).filter(b=>b.type!==ACTIVE_BUFF);
 if(w.entity===j.actor){events.push(event(j.actor,'buffRemove',{type:ACTIVE_BUFF}));events.push(event(j.actor,'transformEnd',{skillID:6020}));}
 if(!valid(state,j)||!game||reason==='cleanup')return true;
 const pool=createPool(game,state,j,time,events);
 // Original third-star 'targetBuffID=100,confused' is applied once when the
 // disguise breaks, not on each damage tick. Other stars have no such field.
 if(j.passiveRow.targetBuffID?.length){for(const r of candidates(game,state,pool))require('./player-skills-3127').applyBuffs(state,r,{...j.passiveRow,onHitEnemyBuff:[],onHitEnemyBuffArgs:[]},events,event);}
 if(reason==='hurt'&&w.entity.property.HP>0){const percent=require('./player-skills-3127').args(j.skill).hpArgs||0;
  require('./player-skills-3127').heal(state,percent,events,event,undefined,'hero');}
 return true;
}
function candidates(game,state,pool){const r=pool.passiveRow,point=pool.point,radius=Number(r.effectSize?.[0])||0;
 return require('./environment-3127').records(game,state).filter(x=>!x.dead&&['mob','boss'].includes(x.kind)&&!(x.effectState?.hiddenUntil>Date.now())&&Math.hypot(x.x-point.x,x.y-point.y)<=radius+require('./actions-3127').targetRadius({record:x})&& !require('./city-3127').safePoint(x.x,x.y,state.world.level,state.world.mapId));
}
function remove(game,pool,events){game?.environments?.get(pool.room)?.rows.delete(pool.row.id);events.push(W().destroyEvent([pool.row.id]));}
function tick(game,state,time,events,event){const w=state?.world;if(!w)return;
 const j=w.slimeDisguise;if(j&&(!valid(state,j)||time>=j.until))breakDisguise(game,state,time,events,event,valid(state,j)?'timeout':'cleanup');
 const remaining=[];
 for(const pool of w.slimePools||[]){if(!valid(state,pool)||time>pool.until||!game?.environments?.get(pool.room)?.rows.has(pool.row.id)){remove(game,pool,events);continue;}
  if(time>=pool.nextTick&&pool.nextTick<=pool.until){
   const targets=candidates(game,state,pool).map(r=>({kind:'environment',id:r.id,x:r.x,y:r.y,record:r}));
   if(targets.length){const perTick={...pool.passiveRow,targetBuffID:[],targetBuffArgs:[]};
    const hits=require('./actions-3127').damageTargets(game,state,perTick,targets);
    require('./combat-input-3127').appendHits(state,hits,6021,events,event,W().destroyEvent,perTick,pool.actor);}
   pool.nextTick+=1000;
   if(time-pool.nextTick>1000)pool.nextTick=time+1000;
  }
  remaining.push(pool);
 }w.slimePools=remaining;
}
function clear(game,state,events=[],event=W().entityEventData){const w=state?.world;if(!w)return;
 if(w.slimeDisguise)breakDisguise(game,state,Date.now(),events,event,'cleanup');
 for(const pool of w.slimePools||[])remove(game,pool,events);w.slimePools=[];
}
module.exports={ACTIVE_BUFF,ENTITY_TYPE,profile,passive,eligible,current,active,mimic,start,breakDisguise,candidates,tick,clear};
