'use strict';
// 3.12.7 original en/zh descriptions, SkillScheme and BuffScheme.
// Rounding/stack interaction policies are recorded in the Stage85 audit.
const skills=require('../config/schemes/SkillScheme.json').Skill;
const weapons=require('../config/schemes/WeaponScheme.json').Weapon.filter(w=>w.level===1);
const meleeSkills=new Set(weapons.filter(w=>w.attackType===1).flatMap(w=>[w.skill,w.skill2,w.skill3]).filter(Boolean));
const args=s=>require('./monster-skills-3127').argsOf(s||{});
function row(state,hero,skill,level){const w=state?.world,e=w?.entity;if(!w?.sceneReady||w.loadingFinished===false||w.dead||!e?.property||e.property.HP<=0||e.miscInfo?.heroId!==hero)return null;const r=skills.find(s=>s.ID===skill&&s.level===(e.miscInfo.heroStar||1));return r&&(level??e.property.level)>=Math.max(10,r.unlockLv||0)?r:null;}
function apply(property,state){const out=structuredClone(property);if(!row(state,20,6022,property.level))return out;const p=out.property,a=args(row(state,20,6022,property.level));p.fireIncrPer=(p.fireIncrPer||0)+(a.fireIncrDmg||0);// Fire RES +100 is already encoded in native PropLevels; do not add it twice.
return out;}
function monsterXP(state,amount,kind){const r=['mob','boss'].includes(kind)&&row(state,26,6033);return r?amount+Math.floor(amount*(args(r).exp||0)/100):amount;}
function weaponReduction(state){const r=row(state,21,6024),index=r?.initSelfBuff?.indexOf(343)??-1;return index<0?0:require('./player-skills-3127').buffArgs(r.initSelfBuffArgs[index]).propValue||0;}
function viking(state){const r=row(state,27,6039);if(!r)return{stacks:0,outgoing:0,incoming:0};const index=r.initSelfBuff.indexOf(724),a=require('./player-skills-3127').buffArgs(r.initSelfBuffArgs[index]),p=state.world.entity.property,missing=Math.max(0,100*(p.maxHP-p.HP)/p.maxHP);const stacks=Math.min(a.maxStack,Math.floor((missing+1e-9)/a.hpArgs));return{stacks,outgoing:stacks*a.incrHurt,incoming:stacks*a.incrDefense,max:a.maxStack};}
function outgoing(state,skill,actor){return actor?.id===state.world?.entity?.id&&meleeSkills.has(skill?.ID)?1+viking(state).outgoing/100:1;}
function reduction(state){return viking(state).incoming;}
function tick(game,state,time,events,event){const w=state.world;if(!w?.entity)return;const fairy=row(state,29,6042),B=require('./monster-targets-3127');
 if(fairy){const old=w.fairyRegen,same=old&&B.matches(old.binding,state)&&old.skin===w.entity.miscInfo.curSkinId&&old.star===fairy.level;
  if(!same)w.fairyRegen={binding:B.bind(state),skin:w.entity.miscInfo.curSkinId,star:fairy.level,next:time+1000};
  const j=w.fairyRegen;if(time>=j.next){j.next=time+1000;require('./player-skills-3127').heal(state,args(fairy).hpArgs,events,event,undefined,'hero');}
 }else w.fairyRegen=null;
 const b=w.entity.buffer?.buffs?.find(b=>b.type===724),v=viking(state);
 if(b&&row(state,27,6039)&&(b.stackNum!==v.stacks||b.maxStackNum!==v.max)){b.stackNum=v.stacks;b.maxStackNum=v.max;events.push(event(w.entity,'buffAdd',b));}
}
function clear(state){if(state.world)state.world.fairyRegen=null;}
module.exports={row,apply,monsterXP,weaponReduction,viking,outgoing,reduction,tick,clear,meleeSkills};
