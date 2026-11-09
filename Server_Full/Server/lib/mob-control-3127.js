'use strict';
// Native status IDs/names and SkillScheme.isSkill. Restrictions, source lifetime
// and interruption policies are detailed in STAGE55_MOONSHARD_CONTROL.json.
const buffs=new Map(require('../config/schemes/BuffScheme.json').Buff.map(b=>[b.type,b]));
const skills=new Map(require('../config/schemes/SkillScheme.json').Skill.filter(s=>s.level===1).map(s=>[s.ID,s]));
const disarms=new Set([388,417,477,662,663]),silences=new Set([302,504,696]),sleepIDs=new Set([478,561]);
const moonshard=new Map();
for(const w of require('../config/schemes/WeaponScheme.json').Weapon){const basic=skills.get(w.skill),passive=skills.get(w.skill3);if(w.level===1&&basic?.skillType===547&&passive?.skillType===549)moonshard.set(basic.ID,{weaponID:w.weaponID,basic,passive});}
function classify(id,name){
 const cfg=buffs.get(id),disarm=disarms.has(id),silence=silences.has(id),banAll=id===205;
 return {control:!disarm&&!silence&&!banAll&&(!!cfg?.isBanSkill||/stun|frozen|sleep|confused/i.test(name||'')),root:/imprisoned|immobil|fetter|root/i.test(name||''),banBasic:disarm||banAll,banSkill:silence||banAll};
}
function sourceValid(s,r){
 if(s.spawnToken&&s.spawnToken!==r.spawnToken)return false;
 if(!s.source)return true;const w=s.source.world;
 return !!((!s.sourceHeroID||w?.entity?.miscInfo?.heroId===s.sourceHeroID)&&(s.sourceSkinID==null||w?.entity?.miscInfo?.curSkinId===s.sourceSkinID)&&(s.sourceStar==null||w?.entity?.miscInfo?.heroStar===s.sourceStar)&&(!s.sourceActor||w?.entity===s.sourceActor)&&(s.sourceLife==null||require('./monster-targets-3127').life(s.source)===s.sourceLife)&&w?.sceneReady&&!w.dead&&w.entity?.property?.HP>0&&(!s.sourceWorld||w===s.sourceWorld)&&(!s.room||w.room===s.room)&&(s.sourceMapId===undefined||w.mapId===s.sourceMapId));
}
function flags(r,time=Date.now()){
 const out={controlled:false,rooted:false,banBasic:false,banSkill:false,speed:1};
 for(const [id,s]of r.playerStatuses||[]){if(time>=s.until||!sourceValid(s,r))continue;const f=classify(id,s.name);
  out.controlled||=s.control??f.control;out.rooted||=s.root??f.root;out.banBasic||=s.banBasic??f.banBasic;out.banSkill||=s.banSkill??f.banSkill;out.speed=Math.min(out.speed,Number.isFinite(s.slow)?s.slow:1);
 }
 return out;
}
function allows(r,skill,time=Date.now()){const f=flags(r,time);return !f.controlled&&!(skill.isSkill?f.banSkill:f.banBasic);}
function interrupt(r,time,events,event){const p=r.skillRuntime?.pending;if(p&&!p.released&&!allows(r,p.skill,time))return require('./monster-skills-3127').cancel(r,events,event);return false;}
function extraOnHit(skill){
 const plan=moonshard.get(skill.ID);if(!plan)return [];
 const a=require('./monster-skills-3127').argsOf(plan.passive),basic=require('./monster-skills-3127').argsOf(skill),out=[{name:'disarm_2',chance:a.buffProb||0,duration:a.duration||0}];
 // Native561 is explicitly named enhanced Moonshard sleep. Binding these
 // enhanced-only stunBuff args to561 is a client-data inference, not server source.
 if(basic.stunBuffProb>0&&basic.stunBuffDuration>0)out.push({name:'stun_18',chance:basic.stunBuffProb,duration:basic.stunBuffDuration});
 return out;
}
module.exports={disarms,silences,sleepIDs,moonshard,classify,sourceValid,flags,allows,interrupt,extraOnHit};
