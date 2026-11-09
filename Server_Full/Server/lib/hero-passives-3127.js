'use strict';
// Descriptions in native 3.12.7 en/zh and SkillScheme. Multiplicative stacking
// with talents is a reconstruction policy, not recovered retail server code.
const rows=require('../config/schemes/SkillScheme.json').Skill;
const weaponRows=require('../config/schemes/WeaponScheme.json').Weapon,weaponSkills=new Set(weaponRows.flatMap(w=>[w.skill,w.skill2,w.skill3])),weapons=new Map(weaponRows.filter(w=>w.level===1).map(w=>[w.weaponID,w]));
function active(state,id){const w=state.world,e=w?.entity;return !!(w?.sceneReady&&!w.dead&&e?.property?.HP>0&&e.property.level>=10&&e.miscInfo.heroId===id);}
function definition(state,id){return rows.find(s=>s.ID===id&&s.level===Number(state.world?.entity?.miscInfo?.heroStar||1));}
function ninjaReduction(state,kind){
 if(!active(state,12)||Number(state.world.entity.property.level)<10)return 0;
 const row=definition(state,6014),i=row?.initSelfBuff?.indexOf(752)??-1;
 if(i<0)return 0;
 const args=require('./player-skills-3127').buffArgs(row.initSelfBuffArgs?.[i]);
 const value=Number(args[kind==='hero'?'heroSkillCD':'weaponSkillCD']);
 return Number.isFinite(value)?Math.max(0,Math.min(90,value)):0;
}
function heroCooldown(state,row){
 let cd=Number(row?.cd)||0;
 const talent=Math.min(90,require('./talents-3127').modifiers(state.player)[22]||0);
 cd*=1-talent/100;cd*=1-ninjaReduction(state,'hero')/100;
 return Math.max(0,Math.round(cd));
}
function weaponCooldown(state,weapon,row){let cd=Number(row?.cd)||0;const talent=Math.min(90,require('./talents-3127').modifiers(state.player)[17]||0);cd*=1-talent/100;cd*=1-ninjaReduction(state,'weapon')/100;cd*=1-Math.min(90,require('./hero-native-passives-3127').weaponReduction(state))/100;
 if(active(state,4)&&weapon?.weaponType===2){const cfg=definition(state,6004);if(cfg)cd*=1-require('./monster-skills-3127').argsOf(cfg).cdArgs/100;}
 if(active(state,25)){const cfg=definition(state,6031),count=swordCount(state);if(cfg&&count)cd*=1-require('./monster-skills-3127').argsOf(cfg).cdArgs*count/100;}
 return Math.max(0,Math.round(cd));
}
function lifesteal(state,hit,attacker,events,event){
 if(!active(state,3)||attacker?.id!==state.world.entity.id||hit.noBuff||!['mob','boss','environment'].includes(hit.kind)||!(hit.damage>0))return 0;
 const cfg=definition(state,6003);if(!cfg)return 0;const e=state.world.entity,p=e.property,rate=require('./monster-skills-3127').argsOf(cfg).healRate||0;
 const amount=Math.max(0,Math.min(p.maxHP-p.HP,Math.floor(hit.damage*rate/100)));if(amount){p.HP+=amount;events.push(event(e,'addHP',{changeHP:amount,currentHP:p.HP,maxHP:p.maxHP}));}return amount;
}
function swordCount(state){const equipped=require('./inventory').inventoryOf(state).filter(i=>i.bagType===2||i.uuid===state.world?.entity?.equip?.currentItemUUID),unique=new Set();for(const i of equipped)if(weapons.get(i.itemCfgId)?.weaponType===4)unique.add(i.uuid);return Math.min(3,unique.size);}
function afterWeaponCast(game,state,weapon,skill,time,events,event){
 const treant=require('./treant-3127').passive(game,state,time);if(!active(state,25)||weapon?.weaponType!==4)return treant;const cfg=definition(state,6031);if(!cfg)return false;const a=require('./monster-skills-3127').argsOf(cfg),w=state.world;
 for(const[type,name,value]of [[616,'swordsmanSpeed',a.speedUp],[617,'swordsmanAttackSpeed',a.atkSpeedArgs]]){w.selfSkillBuffs||=new Map();w.selfSkillBuffs.set(type,{type,name,args:{propValue:value},until:time+cfg.duration});require('./hero-vfx-3127').addBuff(state,type,cfg.duration,time,events,event);}
 require('./talents-3127').refresh(game,state);return true;
}
function damageMultiplier(state,skill,target,actor){if(!active(state,3)||actor.id!==state.world.entity.id||skill?.ID!==6003||target.kind!=='environment'||target.record?.kind!=='mob')return 1;const grade=require('./monster-skills-3127').cfgFor(target.record).Graded;return [1,2].includes(grade)?3:1;}
function healingAmount(state,amount,origin){if(!Number.isFinite(amount)||amount<0)throw Error('INVALID_HEAL');return Math.floor(amount*(active(state,2)&&['weapon','equipment'].includes(origin)?1.5:1));}
function origin(skill){return weaponSkills.has(skill?.ID)?'weapon':'hero';}
module.exports={active,definition,ninjaReduction,heroCooldown,weaponCooldown,lifesteal,swordCount,afterWeaponCast,damageMultiplier,healingAmount,origin};
