'use strict';
// Hero 24 (Hamster): client SkillScheme 6030 (stars 1..3) explicitly gives
// initSelfBuff [237,536], where 536 is max-HP percentage (+3/6/10).
// This is a permanent hero passive, not an effect of casting F.
const skills=require('../config/schemes/SkillScheme.json').Skill.filter(s=>s.ID===6030);
const buffs=new Map(require('../config/schemes/BuffScheme.json').Buff.map(b=>[b.type,b]));
const buffArgs=require('./player-skills-3127').buffArgs;
const BUFFS=Object.freeze([237,536]);
function rowFor(star){return skills.find(s=>s.level===Number(star)&&[583,584,585].includes(s.skillType));}
function percent(state,level){
 const w=state?.world,e=w?.entity;
 if(!e||Number(e.miscInfo?.heroId)!==24||Number(level??e.property?.level)<10)return 0;
 const row=rowFor(e.miscInfo.heroStar),idx=row?.initSelfBuff?.indexOf(536);
 if(idx==null||idx<0||buffs.get(536)?.duration!==-1)return 0;
 const value=buffArgs(row.initSelfBuffArgs[idx]).propValue;
 return Number.isFinite(value)&&value>=0&&value<=100?value:0;
}
function apply(property,state){
 const rate=percent(state,property.level);if(!rate)return property;
 const next=structuredClone(property),oldMax=Math.max(1,Number(next.maxHP)||1),oldHP=Math.max(0,Number(next.HP)||0);
 next.maxHP=Math.max(1,Math.round(oldMax*(100+rate)/100));
 next.HP=Math.min(next.maxHP,oldHP>=oldMax?next.maxHP:oldHP);
 return next;
}
function valid(state){const w=state?.world,e=w?.entity;
 return !!(w?.sceneReady&&!w.dead&&e?.property?.HP>0&&Number(e.miscInfo?.heroId)===24&&Number(e.property.level)>=10&&rowFor(e.miscInfo.heroStar));
}
function clear(state,events,event){
 const w=state?.world,p=w?.hamsterPassive;if(!p)return false;
 w.hamsterPassive=null;const e=p.actor;
 e.buffer||={buffs:[]};e.buffer.buffs=(e.buffer.buffs||[]).filter(b=>!BUFFS.includes(b.type));
 if(e===w.entity)for(const type of BUFFS)events.push(event(e,'buffRemove',{type}));
 return true;
}
function sync(game,state,time,events,event){
 const w=state?.world;if(!w)return false;
 if(!valid(state)){clear(state,events,event);return false;}
 const e=w.entity,row=rowFor(e.miscInfo.heroStar),life=state.player.battleStats?.id||null,p=w.hamsterPassive;
 if(!row||!Array.isArray(row.initSelfBuff)||!BUFFS.every(x=>row.initSelfBuff.includes(x)))return false;
 const same=p&&p.world===w&&p.actor===e&&p.star===row.level&&p.room===w.room&&p.mapId===w.mapId&&p.life===life;
 if(p&&!same)clear(state,events,event);
 e.buffer||={buffs:[]};e.buffer.buffs||=[];
 for(const type of BUFFS){
  const i=row.initSelfBuff.indexOf(type),parsed=buffArgs(row.initSelfBuffArgs[i]);
  if(same&&e.buffer.buffs.some(b=>b.type===type))continue;
  const duration=parsed.duration??buffs.get(type)?.duration??-1;
  const cfg={type,group:0,duration,startTime:time,endTime:duration<0?0:time+duration,stackNum:1,maxStackNum:1,isValid:1,
   fromEntityType:e.type,fromEntitySkinID:e.miscInfo.curSkinId,propValue:parsed.propValue||0,buffExJson:JSON.stringify(parsed)};
  e.buffer.buffs=e.buffer.buffs.filter(b=>b.type!==type);e.buffer.buffs.push(cfg);events.push(event(e,'buffAdd',cfg));
 }
 w.hamsterPassive={world:w,actor:e,life,room:w.room,mapId:w.mapId,star:row.level};
 // On a star/life transition, recompute using the unmodified base stats,
 // never multiply the previous already-buffed maximum HP.
 if(p&&!same&&!w.dead)require('./talents-3127').refresh(game,state,time);
 return true;
}
module.exports={BUFFS,rowFor,percent,apply,valid,clear,sync};
