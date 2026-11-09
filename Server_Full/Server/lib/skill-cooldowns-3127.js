'use strict';
// CCSkillCDComp.updateCDModule unconditionally reads chargeInfo. Sending only
// useSkill.skillCD does not update its fixedSkillCDMap or the native countdown.
function update(entity,id,time,cd,level,events,event,charge){events.push(event(entity,'skillCDUpdate',{
 skillID:id,useMillis:time,reduceCD:0,extReduceCD:0,
 chargeInfo:charge||{skillID:id,useSkillMillisArr:time?[time]:[],chargeNum:time?0:1,lastChargeMillis:time},
 fixedInfo:{skillID:id,fixedCD:Math.max(0,Math.round(cd))},skillLv:level||1,talentReduceCD:0,noEffect:0
}));}
function prune(j,time){const before=j.used.length;j.used=j.used.filter(c=>time<c.time+c.cd);return before!==j.used.length;}
function reserve(ci,field,row,cd,time){
 const max=Math.max(1,row.chargeNum||1);if(max===1)return null;
 ci.chargeStates||={};const key=field+':'+row.ID,j=ci.chargeStates[key]||={field,id:row.ID,level:row.level,max,used:[],last:0,cd};prune(j,time);j.max=max;
 if(j.used.length>=max||j.last&&time-j.last<200)return false;
 j.used.push({time,cd});j.last=time;j.cd=cd;ci[field][row.ID]=time;return time;
}
function charge(ci,field,row,time=Date.now()){
 const max=Math.max(1,row.chargeNum||1),j=ci.chargeStates?.[field+':'+row.ID];if(max===1)return null;if(!j)return{skillID:row.ID,useSkillMillisArr:[],chargeNum:max,lastChargeMillis:0};prune(j,time);
 return{skillID:row.ID,useSkillMillisArr:j.used.map(c=>c.time),chargeNum:Math.max(0,max-j.used.length),lastChargeMillis:j.last};
}
function tick(state,time,events,event){const w=state.world,ci=w?.combatInput;if(!ci)return;for(const j of Object.values(ci.chargeStates||{}))if(prune(j,time))update(w.entity,j.id,j.last,j.cd,j.level,events,event,{skillID:j.id,useSkillMillisArr:j.used.map(c=>c.time),chargeNum:Math.max(0,j.max-j.used.length),lastChargeMillis:j.last});}
module.exports={update,prune,reserve,charge,tick};
