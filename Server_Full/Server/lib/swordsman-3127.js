'use strict';
// 3.12.7 Skill6031, CCSwordQi and native entityType1208. Backstep ordering,
// collision sweep and missing-HP scaling are explicit reconstruction policies.
const skins=new Map(require('../config/schemes/SkinScheme.json').Skin.filter(s=>s.HeroId===25).map(s=>[s.ID,s]));
function profile(skill){return skill?.ID===6031&&[634,635,636].includes(skill.skillType);}
function capacity(state){return(state.world?.swordsmanCasts?.length||0)<4;}
function schedule(game,state,skill,time,events,event){const w=state.world;if(!profile(skill)||w.mapId!==2||!capacity(state))return false;
 const a=require('./monster-skills-3127').argsOf(skill),angle=require('./combat-input-3127').aim(w),rad=angle*Math.PI/180;
 const j={skill,args:a,world:w,actor:w.entity,room:w.room,mapId:w.mapId,heroID:25,start:time,last:time,backUntil:time+a.moveDuration,next:time+a.moveDuration,index:0,deadline:time+a.moveDuration+a.interval*(a.num-1)+1000,ux:-Math.cos(rad),uy:-Math.sin(rad),moved:0};
 (w.swordsmanCasts||=[]).push(j);w.swordsmanBackstepUntil=j.backUntil;if(w.motion)require('./motion-3127').stop(w.motion);events.push(event(w.entity,'moveStop',{}));return true;
}
function valid(state,j,time){const w=state.world;return w===j.world&&w.entity===j.actor&&w.sceneReady&&!w.dead&&w.entity.property.HP>0&&w.room===j.room&&w.mapId===j.mapId&&w.entity.miscInfo.heroId===25&&time<=j.deadline&&!require('./city-3127').safePoint(w.entity.physics.x,w.entity.physics.y,w.level,w.mapId);}
function clear(game,state,events=[],event){const w=state.world;if(!w)return;const ids=[];
 w.projectiles=(w.projectiles||[]).filter(p=>{if(!p.swordsman)return true;ids.push(p.entity.id);require('./projectiles-3127').unregister(game,p);return false;});
 if(event){for(const j of w.swordsmanCasts||[])events.push(event(j.actor,'skillStop',{skillID:j.skill.ID}));if(ids.length)events.push(require('./world').destroyEvent(ids));}
 w.swordsmanCasts=[];w.swordsmanBackstepUntil=0;
}
function move(game,state,j,time,events,event){const at=Math.min(time,j.backUntil),desired=j.args.moveDistance*Math.max(0,at-j.start)/j.args.moveDuration,step=Math.max(0,desired-j.moved);j.moved=desired;j.last=at;if(!step||j.blocked)return;
 const S=require('./player-skills-3127'),p=state.world.entity.physics,point={x:p.x+j.ux*step,y:p.y+j.uy*step},angle=Math.atan2(j.uy,j.ux)*180/Math.PI,result=S.dash(game,state,point,step,angle,events,event);
 if(Math.hypot(result.end.x-result.origin.x,result.end.y-result.origin.y)<step-.01)j.blocked=true;
}
function launch(game,state,j,time,events,event){const w=state.world,angle=require('./combat-input-3127').aim(w),rad=angle*Math.PI/180,e=w.entity,index=j.index;
 if(index===0)require('./hero-vfx-3127').addBuff(state,629,1000,time,events,event);
 const skin=skins.get(e.miscInfo.curSkinId);if(!skin){w.unresolvedHeroVfx||=new Set();w.unresolvedHeroVfx.add('6031:'+j.skill.level+':'+e.miscInfo.curSkinId);return false;}
 const id=game.nextProjectileID=Math.max(game.nextProjectileID||800000000,800000000)+1,entity={id,uid:0,cid:0,type:1208,ownerID:e.id,camp:{campID:e.camp?.campID||e.id},ud:JSON.stringify({skinID:skin.ID,index,skillLv:j.skill.level,angle}),physics:{x:e.physics.x,y:e.physics.y,rotation:angle,direction:1},physics2:{angle}};
 const shot={entity,skill:j.skill,actor:e,sourceRecord:null,ux:Math.cos(rad),uy:Math.sin(rad),speed:j.skill.skillSpeed,left:j.skill.maxDistance,room:w.room,pierce:true,struck:new Set(),swordsman:{world:w,actor:e,mapId:w.mapId,heroID:25,dtHP:j.args.dtHP},blockedByTerrain:true};
 (w.projectiles||=[]).push(shot);require('./projectiles-3127').register(game,state,shot);events.push(require('./world').spawnEvent([entity]));return true;
}
function tick(game,state,time,events,event){const w=state.world;if(!w)return;const keep=[];
 for(const j of w.swordsmanCasts||[]){if(!valid(state,j,time)){events.push(event(j.actor,'skillStop',{skillID:j.skill.ID}));continue;}move(game,state,j,time,events,event);
  if(time<j.next){keep.push(j);continue;}if((w.projectiles?.length||0)>=64){keep.push(j);continue;}
  if(!launch(game,state,j,time,events,event))continue;j.index++;j.next=time+j.args.interval;
  if(j.index<j.args.num)keep.push(j);else events.push(event(j.actor,'skillStop',{skillID:j.skill.ID}));
 }w.swordsmanCasts=keep;if(time>=w.swordsmanBackstepUntil||!keep.length)w.swordsmanBackstepUntil=0;
}
function shotValid(state,shot){const j=shot.swordsman,w=state.world;return !j||w===j.world&&w.entity===j.actor&&w.mapId===j.mapId&&w.entity.miscInfo.heroId===j.heroID&&w.sceneReady&&!require('./city-3127').safePoint(w.entity.physics.x,w.entity.physics.y,w.level,w.mapId);}
function multiplier(shot,r){if(!shot.swordsman||!r||!Number.isFinite(r.hp)||!Number.isFinite(r.maxHP)||r.maxHP<=0)return 1;const missing=1-Math.min(1,Math.max(0,r.hp/r.maxHP));return 1+missing*(shot.swordsman.dtHP||0)/100;}
module.exports={profile,capacity,schedule,valid,clear,move,launch,tick,shotValid,multiplier};
