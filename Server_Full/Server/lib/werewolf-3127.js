'use strict';
// Hero 22. Native client uses CCWereWolf for skill types 481..483.
// The cosmetic model and four buff types are original 3.12.7 assets.
// The exact retail combat-server formula is not shipped in client: numerical
// property conversion below is a local reconstruction from SkillScheme.args.
const skins=new Map(require('../config/schemes/SkinScheme.json').Skin.map(s=>[s.ID,s]));
const buffs=new Map(require('../config/schemes/BuffScheme.json').Buff.map(s=>[s.type,s]));
const BUFF_FORM=410,BUFF_HP=411,BUFF_SPEED=412,BUFF_LEECH=413,BUFFS=[410,411,412,413];
function profile(skill){return skill?.ID===6026&&[481,482,483].includes(skill.skillType)&&[1,2,3].includes(skill.level);}
function forms(skin){const row=skins.get(Number(skin));if(!row||row.HeroId!==22)return null;
 const origin=skins.get(row.OriginSkinID),wolf=skins.get(row.OriginSkinID+1);
 if(!origin||!wolf||origin.HeroId!==22||wolf.HeroId!==22||origin.ID!==origin.OriginSkinID||wolf.OriginSkinID!==origin.ID)return null;
 return {origin:origin.ID,wolf:wolf.ID,scale:wolf.SkinScale};}
function valid(state,form){const w=state.world,e=w?.entity;
 return !!(form&&w===form.world&&e===form.actor&&w.sceneReady&&w.loadingFinished!==false&&!w.dead&&e.property.HP>0&&
  e.miscInfo.heroId===22&&e.miscInfo.heroStar===form.star&&e.miscInfo.curSkinId===form.wolf&&
  w.room===form.room&&w.mapId===form.mapId&&(state.player.battleStats?.id||null)===form.life);
}
function active(state){const form=state.world?.wolfForm;return valid(state,form)?form:null;}
function canStart(state,skill){return profile(skill)&&!!state.world?.entity&&!!forms(state.world.entity.miscInfo.curSkinId)&&(!state.world.wolfForm||!!active(state));}
function wireBuff(e,type,at,duration,propValue){return {type,group:0,duration,startTime:at,endTime:duration<0?0:at+duration,stackNum:1,maxStackNum:1,isValid:1,fromEntityType:e.type,fromEntitySkinID:e.miscInfo.curSkinId,...(propValue!==undefined?{propValue}: {})};}
function add(form,type,duration,at,events,event,propValue){const e=form.actor,b=wireBuff(e,type,at,duration,propValue);
 e.buffer||={};e.buffer.buffs||=[];e.buffer.buffs=e.buffer.buffs.filter(old=>old.type!==type);e.buffer.buffs.push(b);events.push(event(e,'buffAdd',b));form.activeBuffs.add(type);}
function remove(form,type,events,event){if(!form.activeBuffs.has(type))return;
 form.activeBuffs.delete(type);const e=form.actor;e.buffer.buffs=(e.buffer?.buffs||[]).filter(b=>b.type!==type);events.push(event(e,'buffRemove',{type}));}
function changeSkin(e,skin,events,event){const s=skins.get(skin);if(!s)return;
 e.miscInfo.curSkinId=skin;e.equip.curSkinID=skin;events.push(event(e,'changeSkin',{curSkinId:skin,scale:s.SkinScale}));}
function apply(property,state,time=Date.now()){
 const form=active(state);if(!form)return property;
 const next=structuredClone(property),p=next.property;
 // Native hpArgs denotes an increased max HP in transformed state. No healing is
 // applied by simply toggling the form; refresh() clamps current HP on revert.
 next.maxHP=Math.max(1,Math.floor(next.maxHP*(1+form.hpPercent/100)));
 if(time<form.speedUntil)p.speed=(p.speed||0)+form.speed;
 return next;
}
function start(game,state,skill,time,events,event){const w=state.world;if(!canStart(state,skill))return false;
 if(active(state)){clear(game,state,events,event);return true;}
 const e=w.entity,f=forms(e.miscInfo.curSkinId),a=require('./monster-skills-3127').argsOf(skill);
 if(!f||!(a.hpArgs>=0)||!(a.speedArgs>=0))return false;
 const form={world:w,actor:e,life:state.player.battleStats?.id||null,room:w.room,mapId:w.mapId,star:e.miscInfo.heroStar,
   origin:f.origin,wolf:f.wolf,hpPercent:a.hpArgs,speed:a.speedArgs,leechRate:Number(a.healRate)||0,
   speedUntil:time+(buffs.get(BUFF_SPEED)?.duration||4000),leechUntil:time+(buffs.get(BUFF_LEECH)?.duration||3000),
   activeBuffs:new Set()};
 w.wolfForm=form;
 add(form,BUFF_FORM,-1,time,events,event);
 add(form,BUFF_HP,-1,time,events,event,form.hpPercent);
 add(form,BUFF_SPEED,form.speedUntil-time,time,events,event,form.speed);
 if(form.leechRate>0)add(form,BUFF_LEECH,form.leechUntil-time,time,events,event,form.leechRate);
 changeSkin(e,form.wolf,events,event);
 require('./talents-3127').refresh(game,state,time);
 events.push(event(e,'setHP',{currentHP:e.property.HP,maxHP:e.property.maxHP}));
 return true;
}
function clear(game,state,events,event,{refresh=true,stopEvent=true}={}){
 const w=state.world,form=w?.wolfForm;if(!form)return false;
 w.wolfForm=null;const e=form.actor,attached=w.entity===e;
 // Orphaned actors must lose their buffs but never send a command to a new actor.
 for(const type of [...form.activeBuffs]){if(attached)remove(form,type,events,event);else {form.activeBuffs.delete(type);e.buffer.buffs=(e.buffer?.buffs||[]).filter(b=>b.type!==type);}}
 if(attached){if(e.miscInfo.heroId===22&&e.miscInfo.curSkinId===form.wolf)changeSkin(e,form.origin,events,event);
  if(stopEvent)events.push(event(e,'skillStop',{skillID:6026}));
  if(refresh&&!w.dead&&e.property.HP>0){require('./talents-3127').refresh(game,state);events.push(event(e,'setHP',{currentHP:e.property.HP,maxHP:e.property.maxHP}));}}
 return true;
}
function tick(game,state,time,events,event){const form=state.world?.wolfForm;if(!form)return;
 if(!valid(state,form)){clear(game,state,events,event,{refresh:!state.world.dead});return;}
 let refresh=false;if(time>=form.speedUntil&&form.activeBuffs.has(BUFF_SPEED)){remove(form,BUFF_SPEED,events,event);refresh=true;}
 if(time>=form.leechUntil)remove(form,BUFF_LEECH,events,event);
 if(refresh)require('./talents-3127').refresh(game,state,time);
}
function onDamage(state,hit,attacker,events,event,time=Date.now()){
 const form=active(state),e=state.world?.entity;
 if(!form||form.star!==3||!(form.leechRate>0)||!form.activeBuffs.has(BUFF_LEECH)||time>=form.leechUntil||
   attacker?.id!==e?.id||hit?.noBuff||!(hit?.damage>0)||!['mob','boss','player'].includes(hit.kind))return 0;
 const max=Math.max(0,e.property.maxHP-e.property.HP),gain=Math.max(0,Math.min(max,Math.floor(hit.damage*form.leechRate/100)));
 if(gain){e.property.HP+=gain;events.push(event(e,'addHP',{changeHP:gain,currentHP:e.property.HP,maxHP:e.property.maxHP}));}
 return gain;
}
module.exports={BUFFS,profile,forms,valid,active,canStart,apply,start,clear,tick,onDamage};
