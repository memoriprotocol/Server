'use strict';
// Native SkinScheme has an origin plus three bear skins (801..804, 805..808).
// The active changes only world state; never grant/persist a transformation skin.
const skins=new Map(require('../config/schemes/SkinScheme.json').Skin.map(s=>[s.ID,s]));
const skills=require('../config/schemes/SkillScheme.json').Skill;
const BUFF=481;
function active(state,time=Date.now()){const w=state.world,t=w?.druid;return t&&!w.dead&&time<t.until&&w.entity.miscInfo.heroId===8?t:null;}
function apply(property,state,time=Date.now()){
 const t=active(state,time);if(!t)return property;
 const next=structuredClone(property),base=require('./progression-3127').stats(8,next.level,state.world.entity.miscInfo.heroStar||1);
 next.maxHP+=Math.floor(base.maxHP*t.hpPercent/100);next.HP=Math.min(next.HP,next.maxHP);
 next.property.speed=(next.property.speed||0)+t.speed;return next;
}
function skin(state,id,events,event){const e=state.world.entity;e.miscInfo.curSkinId=id;e.equip.curSkinID=id;events.push(event(e,'changeSkin',{curSkinId:id,scale:skins.get(id).SkinScale}));}
function start(game,state,skill,events,event){
 if(skill.ID!==6008)return false;const w=state.world,e=w.entity,origin=skins.get(e.miscInfo.curSkinId)?.OriginSkinID,star=skill.level||1,target=skins.get(origin+star);
 if(![801,805].includes(origin)||!target||target.OriginSkinID!==origin)throw Error('DRUID_SKIN_NOT_IN_NATIVE_SCHEME');
 const a=require('./player-skills-3127').args(skill),time=Date.now();
 w.druid={origin,skinID:target.ID,until:time+a.duration,hpPercent:a.hpArgs,speed:a.speedArgs};
 require('./hero-vfx-3127').addBuff(state,BUFF,a.duration,time,events,event,origin);
 skin(state,target.ID,events,event);require('./talents-3127').refresh(game,state);
 events.push(event(e,'setHP',{currentHP:e.property.HP,maxHP:e.property.maxHP}));return true;
}
function clear(game,state,events,event,{refresh=true}={}){
 const w=state.world,t=w?.druid;if(!t)return false;w.druid=null;
 require('./hero-vfx-3127').removeBuff(state,BUFF,events,event);
 skin(state,t.origin,events,event);
 if(refresh&&!w.dead){require('./talents-3127').refresh(game,state);events.push(event(w.entity,'setHP',{currentHP:w.entity.property.HP,maxHP:w.entity.property.maxHP}));}
 return true;
}
function tick(game,state,time,events,event){const t=state.world?.druid;if(t&&(!active(state,time)||state.world.entity.property.HP<=0))clear(game,state,events,event);}
function controlDuration(state,duration){
 const w=state.world;if(w?.entity.miscInfo.heroId!==8)return duration;
 const skill=skills.find(s=>s.ID===6008&&s.level===(w.entity.miscInfo.heroStar||1));
 const percent=require('./player-skills-3127').args(skill||{}).druidCtrlReduce||0;
 return Math.max(0,Math.floor(duration*(1-percent/100)));
}
module.exports={BUFF,active,apply,start,clear,tick,controlDuration};
