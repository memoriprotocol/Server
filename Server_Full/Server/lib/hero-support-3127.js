'use strict';
const buffs=new Map(require('../config/schemes/BuffScheme.json').Buff.map(b=>[b.type,b]));
function clean(state,time,events,event){const w=state.world,e=w.entity,removed=[];
 const ids=new Set([...(e.buffer?.buffs||[]).map(b=>b.type),...(w.monsterStatuses?.keys()||[]),...(w.selfSkillBuffs?.keys()||[])]);
 for(const id of ids){const cfg=buffs.get(id);if(!cfg?.canBePurify||!cfg.isDebuff&&!cfg.isCtrl)continue;removed.push(id);w.monsterStatuses?.delete(id);w.selfSkillBuffs?.delete(id);w.heroVisualBuffs?.delete(id);if(id===238){w.bardDanceSources?.clear();w.bardWires?.delete(id);}}
 if(removed.length){e.buffer.buffs=(e.buffer.buffs||[]).filter(b=>!removed.includes(b.type));for(const type of removed)events.push(event(e,'buffRemove',{type}));}return removed;
}
function paladin(game,state,skill,time,events,event){const S=require('./player-skills-3127'),V=require('./hero-vfx-3127'),a=S.args(skill),duration=a.duration||skill.duration;
 for(const ally of S.allies(game,state,skill)){if(skill.level>=2)clean(ally,time,events,event);if(S.shield(ally,a.hpArgs||0,duration,time,events,event,state.world.entity.property.maxHP))V.addBuff(ally,271,duration,time,events,event,state.world.entity.miscInfo.curSkinId);}
 if(skill.level===3){state.world.paladinInvulnerableUntil=time+duration;V.addBuff(state,272,duration,time,events,event);}
 return true;
}
function nunDefence(game,state,skill,time,events,event){if(skill.ID!==6006||skill.level!==3)return;const S=require('./player-skills-3127'),a=S.args(skill),w=state.world;
 for(const ally of S.allies(game,state,skill)){
  ally.world.supportDefences||=new Map();const source=state.world.entity.id;
  ally.world.supportDefences.set(source,{source:state,world:w,actor:w.entity,room:w.room,mapId:w.mapId,heroID:2,until:time+(a.duration||skill.duration),percent:a.defence||0});
  const until=Math.max(...[...ally.world.supportDefences.values()].filter(j=>valid(j,ally,time)).map(j=>j.until));
  require('./hero-vfx-3127').addBuff(ally,403,until-time,time,events,event,w.entity.miscInfo.curSkinId);
 }
}
function valid(j,state,time){const w=j.source.world;return time<j.until&&w===j.world&&w.entity===j.actor&&w.sceneReady&&!w.dead&&w.entity.property.HP>0&&w.room===j.room&&w.mapId===j.mapId&&w.entity.miscInfo.heroId===j.heroID&&state.world?.room===j.room&&state.world?.mapId===j.mapId;}
function reduction(state,time=Date.now()){let percent=0;for(const j of state.world?.supportDefences?.values()||[])if(valid(j,state,time))percent=Math.max(percent,j.percent);return percent;}
function tick(state,time,events,event){const w=state.world;if(!w)return;for(const[id,j]of w.supportDefences||[])if(w.dead||!valid(j,state,time))w.supportDefences.delete(id);
 if(w.supportDefences?.size===0)require('./hero-vfx-3127').removeBuff(state,403,events,event);
}
module.exports={clean,paladin,nunDefence,valid,reduction,tick};
