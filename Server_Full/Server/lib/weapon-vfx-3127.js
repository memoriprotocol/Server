'use strict';
const catalog=require('../config/weapon-vfx-3127.json');
function plan(skill){const p=catalog.plans[skill.skillType];return p?.verified&&catalog.coverage.some(r=>r.skillID===skill.ID)?p:null;}
function start(game,state,skill,point,events){
 const p=plan(skill);if(!p)return false;const w=state.world,e=w.entity,a=require('./monster-skills-3127').argsOf(skill),time=Date.now(),duration=Math.max(1,a.duration||skill.duration||skill.castPointTime||1),at=skill.targetType===1?e.physics:point;
 const originPos={x:e.physics.x,y:e.physics.y},targetPos={x:at.x,y:at.y},ud={};
 if(p.handler==='CCWitchPotion')Object.assign(ud,{ownerX:originPos.x,ownerY:originPos.y,radius:skill.effectSize?.[0]||0});
 if(p.handler==='CCIcicle')Object.assign(ud,{duration,campID:e.camp.campID});
 if(['CCIcespearWind','CCPoisonDart'].includes(p.handler))ud.scale=p.handler==='CCIcespearWind'?(a.scale||1):1;
 if(p.handler==='CCCactusWeaponSkill')Object.assign(ud,{originPos,targetPos});
 if(p.handler==='CCCrabClaws')Object.assign(ud,{originPos,targetPos,moveTime:Math.max(1,Math.hypot(targetPos.x-originPos.x,targetPos.y-originPos.y)/Math.max(1,skill.skillSpeed)*1000),isMiss:false});
 if(p.handler==='CCGuardianSwordSkill')Object.assign(ud,{skillStage:1,scale:1,isFull:false});
 if(p.handler==='CCChristmasTree')Object.assign(ud,{ownerID:e.id,radius:skill.effectSize?.[0]||0});
 const id=game.nextHeroVfxID=Math.max(game.nextHeroVfxID||850000000,850000000)+1,entity={id,uid:0,cid:0,type:p.entityType,ownerID:e.id,ud:JSON.stringify(ud),physics:{x:at.x,y:at.y,rotation:0,direction:1},physics2:{angle:0},camp:{campID:e.camp.campID},property:{HP:1,maxHP:1,level:1,property:{}},buffer:{buffs:[]},monster:{isSleeping:false,active:false,stateType:0}};
 w.heroVfx||=[];w.heroVfx.push({entity,skillID:skill.ID,follow:skill.targetType===1,until:time+duration,room:w.room});events.push(require('./world').spawnEvent([entity]));return true;
}
module.exports={catalog,plan,start};
