'use strict';
// Hero 23 (Chicken Man), native CCChickenMan skill 6029 (types 534..536).
// Native assets are selected by the regular changeSkin/buff handlers, not a
// fabricated projectile or prefab_path. Buffs 457..460 come from BuffScheme.
// The authoritative timing/speed are the three SkillScheme.args rows.
const skins=new Map(require('../config/schemes/SkinScheme.json').Skin.map(s=>[s.ID,s]));
const BUFFS=[457,458,459,460];
const FORM_BUFFS=[458,459,460],PASSIVE_BUFFS=[237,457];
const skillRows=require('../config/schemes/SkillScheme.json').Skill.filter(s=>s.ID===6029);
const buffArgs=require('./player-skills-3127').buffArgs;
function profile(skill){return skill?.ID===6029&&[534,535,536].includes(skill.skillType)&&[1,2,3].includes(skill.level);}
function forms(skinID){
 const original=skins.get(Number(skinID));if(!original||original.HeroId!==23)return null;
 const base=skins.get(original.OriginSkinID),form=skins.get(original.OriginSkinID+1);
 if(!base||!form||base.HeroId!==23||form.HeroId!==23||form.OriginSkinID!==base.ID||base.ID!==base.OriginSkinID)return null;
 return {origin:base.ID,changed:form.ID,scale:form.SkinScale};
}
function canStart(state,skill){return profile(skill)&&!!state.world?.entity&&!!forms(state.world.entity.miscInfo.curSkinId)&&!state.world?.chickenForm;}
function valid(state,form,time=Date.now()){
 const w=state.world;
 return !!(form&&w===form.world&&w.entity===form.actor&&!w.dead&&w.sceneReady&&w.loadingFinished!==false&&w.entity.property.HP>0&&
  w.entity.miscInfo.heroId===23&&w.entity.miscInfo.heroStar===form.star&&w.entity.miscInfo.curSkinId===form.changed&&
  w.room===form.room&&w.mapId===form.mapId&&(state.player.battleStats?.id||null)===form.life&&time<form.until);
}
function active(state,time=Date.now()){const form=state.world?.chickenForm;return valid(state,form,time)?form:null;}
function apply(property,state,time=Date.now()){
 const form=active(state,time);if(!form)return property;
 const next=structuredClone(property);next.property.speed=(next.property.speed||0)+form.speed;return next;
}
function skin(state,id,events,event){
 const e=state.world.entity,r=skins.get(id);if(!r)return false;
 e.miscInfo.curSkinId=id;e.equip.curSkinID=id;
 events.push(event(e,'changeSkin',{curSkinId:id,scale:r.SkinScale}));return true;
}
// Hero native initSelfBuff is separate from F: keep 237/457 while alive as
// Chicken Man, and restore on snapshot/hero-star changes. No fabricated bonus:
// propValue/hunt/dist are copied from SkillScheme and are client-provided data.
function passiveProfile(state){
 const w=state.world,e=w?.entity,star=Number(e?.miscInfo?.heroStar);
 return !!(w?.sceneReady&&!w.dead&&e?.property?.HP>0&&Number(e.miscInfo.heroId)===23&&
  Number(e.property.level)>=10&&[1,2,3].includes(star));
}
function removePassive(state,events,event){
 const w=state.world,p=w?.chickenPassive;if(!p)return false;
 w.chickenPassive=null;const e=p.actor;
 e.buffer||={buffs:[]};e.buffer.buffs=(e.buffer.buffs||[]).filter(b=>!PASSIVE_BUFFS.includes(b.type));
 if(w.entity===e)for(const type of PASSIVE_BUFFS)events.push(event(e,'buffRemove',{type}));
 return true;
}
function syncPassive(state,time,events,event){
 const w=state.world;if(!w)return false;
 if(!passiveProfile(state)){removePassive(state,events,event);return false;}
 const e=w.entity,row=skillRows.find(s=>s.level===Number(e.miscInfo.heroStar));
 if(!row||!row.initSelfBuff?.length)return false;
 const p=w.chickenPassive,life=state.player.battleStats?.id||null;
 const matches=p&&p.world===w&&p.actor===e&&p.star===row.level&&p.room===w.room&&p.mapId===w.mapId&&p.life===life;
 if(!matches)removePassive(state,events,event);
 const mustSend=!matches;
 e.buffer||={buffs:[]};e.buffer.buffs||=[];
 for(let i=0;i<row.initSelfBuff.length;i++){
  const type=row.initSelfBuff[i];if(!PASSIVE_BUFFS.includes(type))continue;
  const parsed=buffArgs(row.initSelfBuffArgs[i]);
  const present=e.buffer.buffs.find(b=>b.type===type);
  if(!mustSend&&present)continue;
  const cfg={type,group:0,duration:-1,startTime:time,endTime:0,stackNum:1,maxStackNum:1,isValid:1,
   fromEntityType:e.type,fromEntitySkinID:e.miscInfo.curSkinId,propValue:parsed.propValue||0,
   buffExJson:JSON.stringify(parsed)};
  e.buffer.buffs=e.buffer.buffs.filter(b=>b.type!==type);e.buffer.buffs.push(cfg);events.push(event(e,'buffAdd',cfg));
 }
 w.chickenPassive={world:w,actor:e,star:row.level,room:w.room,mapId:w.mapId,life};return true;
}
function start(game,state,skill,time,events,event){
 if(!canStart(state,skill))return false;
 syncPassive(state,time,events,event);
 const w=state.world,e=w.entity,p=forms(e.miscInfo.curSkinId),a=require('./monster-skills-3127').argsOf(skill),duration=Number(a.duration)||0,speed=Number(a.speedUp)||0;
 if(!p||duration<=0||speed<0)return false;
 const form={world:w,actor:e,life:state.player.battleStats?.id||null,room:w.room,mapId:w.mapId,star:e.miscInfo.heroStar,
   origin:p.origin,changed:p.changed,speed,until:time+duration};
 w.chickenForm=form;
 const ci=w.combatInput;if(ci){if(ci.auto){ci.auto=false;events.push(event(e,'autoUseSkill',{enterOrExit:false}));}ci.left=false;ci.right=false;ci.heldSkill=0;}
 // Keep the original four native buff identifiers in the actor's snapshot.
 e.buffer||={buffs:[]};e.buffer.buffs||=[];
 for(const type of FORM_BUFFS){
  const buff={type,group:0,duration,startTime:time,endTime:time+duration,stackNum:1,maxStackNum:1,isValid:1,
    fromEntityType:e.type,fromEntitySkinID:p.origin,...(type===460?{propValue:speed}:{})};
  e.buffer.buffs=e.buffer.buffs.filter(b=>b.type!==type);e.buffer.buffs.push(buff);events.push(event(e,'buffAdd',buff));
 }
 skin(state,p.changed,events,event);
 require('./talents-3127').refresh(game,state,time);
 events.push(event(e,'setHP',{currentHP:e.property.HP,maxHP:e.property.maxHP}));
 return true;
}
function clear(game,state,events,event,{refresh=true,stopEvent=true}={}){
 const w=state.world,form=w?.chickenForm;if(!form)return false;
 w.chickenForm=null;
 const e=form.actor; // drop orphaned native buffs even if the actor was replaced
 e.buffer||={buffs:[]};e.buffer.buffs=(e.buffer.buffs||[]).filter(b=>!FORM_BUFFS.includes(b.type));
 if(w.entity!==e)return true; // never send changes to a replacement actor
 for(const type of FORM_BUFFS)events.push(event(e,'buffRemove',{type}));
 if(e.miscInfo.heroId===23&&e.miscInfo.curSkinId===form.changed)skin(state,form.origin,events,event);
 if(stopEvent)events.push(event(e,'skillStop',{skillID:6029}));
 if(refresh&&!w.dead&&e.property.HP>0){
  require('./talents-3127').refresh(game,state);
  events.push(event(e,'setHP',{currentHP:e.property.HP,maxHP:e.property.maxHP}));
 }
 return true;
}
function tick(game,state,time,events,event){const form=state.world?.chickenForm;if(form&&!valid(state,form,time))clear(game,state,events,event,{refresh:!state.world.dead});syncPassive(state,time,events,event);}
module.exports={BUFFS,FORM_BUFFS,PASSIVE_BUFFS,profile,forms,canStart,valid,active,apply,passiveProfile,syncPassive,removePassive,start,clear,tick};
