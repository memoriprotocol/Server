'use strict';
// Stage82: native SkillScheme.initSelfBuff replication for the complete 2024
// hero roster. The server transmits buff IDs/args to the ORIGINAL client;
// unknown effect formulae are intentionally not invented. Dedicated Chicken
// and Hamster implementations own their buffs and must not be duplicated here.
const heroes=new Map(require('../config/schemes/HeroScheme.json').Hero.map(h=>[Number(h.ID),h]));
const skillRows=require('../config/schemes/SkillScheme.json').Skill;
const buffRows=new Map(require('../config/schemes/BuffScheme.json').Buff.map(b=>[Number(b.type),b]));
const dedicated=new Set([23,24]);
function profile(heroID,star){
 const hero=heroes.get(Number(heroID));if(!hero||dedicated.has(Number(heroID)))return [];
 const result=new Map();
 for(const skillID of hero.Skills||[]){
  const row=skillRows.find(s=>s.ID===skillID&&s.level===Number(star));if(!row)continue;
  for(let i=0;i<(row.initSelfBuff||[]).length;i++){
   const type=Number(row.initSelfBuff[i]),native=buffRows.get(type);if(!native)continue;
   const parsed=require('./player-skills-3127').buffArgs(row.initSelfBuffArgs?.[i]);
   const duration=Number(parsed.duration??native.duration);
   // Native initSelfBuff is a persistent actor state, not a timed F effect.
   if(!Number.isFinite(duration))continue;
   result.set(type,{type,parsed,duration:duration<0?-1:duration,skillID});
  }
 }
 return [...result.values()];
}
function valid(state){const w=state?.world,e=w?.entity;return !!(w?.sceneReady&&!w.dead&&e?.property?.HP>0&&e?.property?.level>=10&&!dedicated.has(Number(e.miscInfo?.heroId)));}
function clear(state,events,event){
 const w=state?.world,p=w?.heroInitPassives;if(!p)return false;
 w.heroInitPassives=null;const e=p.actor;
 if(e?.buffer)e.buffer.buffs=(e.buffer.buffs||[]).filter(b=>!p.types.includes(Number(b.type)));
 if(w.entity===e)for(const type of p.types)events.push(event(e,'buffRemove',{type}));
 return true;
}
function sync(state,time,events,event){
 const w=state?.world;if(!w)return false;
 if(!valid(state)){clear(state,events,event);return false;}
 const e=w.entity,id=Number(e.miscInfo.heroId),star=Number(e.miscInfo.heroStar)||1,items=profile(id,star),old=w.heroInitPassives;
 const life=state.player?.battleStats?.id||null;
 const same=!!(old&&old.world===w&&old.actor===e&&old.heroId===id&&old.star===star&&old.room===w.room&&old.mapId===w.mapId&&old.life===life);
 if(old&&!same)clear(state,events,event);
 e.buffer||={};e.buffer.buffs||=[];
 for(const item of items){
  const existing=e.buffer.buffs.find(b=>b.type===item.type);
  if(same&&existing)continue;
  const {type,parsed,duration}=item;
  const wire={type,group:0,duration,startTime:time,endTime:duration<0?0:time+duration,
   stackNum:1,maxStackNum:1,isValid:1,fromEntityType:e.type,
   fromEntitySkinID:e.miscInfo.curSkinId,propValue:parsed.propValue||0,buffExJson:JSON.stringify(parsed)};
  e.buffer.buffs=e.buffer.buffs.filter(b=>b.type!==type);
  e.buffer.buffs.push(wire);events.push(event(e,'buffAdd',wire));
 }
 w.heroInitPassives={world:w,actor:e,heroId:id,star,room:w.room,mapId:w.mapId,life,types:items.map(i=>i.type)};
 return items.length>0;
}
module.exports={profile,valid,clear,sync};
