'use strict';
// Client-derived cast/animation scheduler; effect state lives in monster-effects.
// Skill choice remains local AI, and retail mitigation is not yet recovered.
const creatures=new Map(require('../config/schemes/CreatureScheme.json').Creature.map(r=>[r.ID,r]));
const definitions=require('../config/schemes/SkillScheme.json').Skill;
const monsterCfg=require('../config/schemes/MonsterContent.json').MonsterCfg;
const byId=new Map();
for(const s of definitions){if(!byId.has(s.ID))byId.set(s.ID,[]);byId.get(s.ID).push(s);}
const effects=require('./monster-effects-3127');
const targetLife=require('./monster-targets-3127');
const STATE={idle:1,patrol:2,attack:3,chase:5,fastback:7};
function cfgFor(r){return monsterCfg.find(c=>c.CreatureID===r.cid&&c.Level<=r.level&&c.MaxLevel>=r.level)||monsterCfg.find(c=>c.CreatureID===r.cid)||{};}
function skillsFor(r){
 // CCSkillFactory creates non-hero skills at level 1. Monster body forms are
 // selected independently by MonsterContent; they are not a skill level.
 return (creatures.get(r.cid)?.SkillIDs||[]).map(id=>(byId.get(id)||[]).find(s=>s.level===1)).filter(Boolean);
}
function runtime(r){return r.skillRuntime||=( {readyAt:new Map(),index:0,nextActionAt:0,pending:null} );}
function setState(r,next,events,event){r.entity.monster.isSleeping=next===0;if(r.entity.monster.stateType===next)return;r.entity.monster.stateType=next;events.push(event(r.entity,'state',{state:next}));}
function argsOf(skill){const out={};for(const entry of skill.args||[]){const raw=String(entry).replace(/：/g,':');const i=raw.indexOf(':');if(i<0)continue;const n=Number(raw.slice(i+1));if(Number.isFinite(n))out[raw.slice(0,i)]=n;}return out;}
function select(r,distance,time){
 const rt=runtime(r),rows=skillsFor(r);
 if(time<rt.nextActionAt||rt.pending)return null;
 for(let n=0;n<rows.length;n++){
  const index=(rt.index+n)%rows.length,s=rows[index];
  if(s.isPassive||!require('./mob-control-3127').allows(r,s,time)||time<(rt.readyAt.get(s.ID)||0)||distance>Number(effects.castRange(s)||0))continue;
  rt.index=(index+1)%rows.length;return s;
 }
 return null;
}
function targetValid(r,target){return targetLife.physical(target)&&targetLife.inRoom(r,target);}
function cancel(r,events,event){const rt=runtime(r);if(!rt.pending)return false;events.push(event(r.entity,'skillStop',{skillID:rt.pending.skill.ID}));rt.pending=null;setState(r,STATE.idle,events,event);return true;}
function begin(r,target,time,events,event){
 const rt=runtime(r);if(!targetValid(r,target))return false;
 const p=target.world.entity.physics,s=select(r,Math.hypot(p.x-r.x,p.y-r.y),time);if(!s)return false;
 const angle=Math.atan2(p.y-r.y,p.x-r.x)*180/Math.PI;
 const castMs=Math.max(0,Number(s.castPointTime)||0),args=argsOf(s);
 rt.readyAt.set(s.ID,time+Math.max(0,Number(s.cd)||0));
 rt.nextActionAt=time+Math.max(0,Number(creatures.get(r.cid)?.attackCD)||0);
 rt.pending={skill:s,targetId:target.world.entity.id,targetWorld:target.world,targetBinding:targetLife.bind(target),origin:{x:r.x,y:r.y},target:{x:p.x,y:p.y},angle,releaseAt:time+castMs,endAt:time+castMs+Math.max(0,args.skillBackswing||Number(s.shakeAfterMillis)||0),released:false};
 r.entity.physics2.angle=angle;r.entity.physics.rotation=angle;r.lastAttack=time;
 setState(r,STATE.attack,events,event);
 events.push(event(r.entity,'moveStop',{}));
 events.push(event(r.entity,'rotateTo',{angle,rotation:angle}));
 events.push(event(r.entity,'useSkill',{skillID:s.ID,skillCD:s.cd,skillLevel:1,toggleState:false,curMillis:time,useMillisArr:[time]}));
 events.push(event(r.entity,'skillCastPoint',{skillID:s.ID}));
 if(castMs>0)events.push(event(r.entity,'skillWarn',{skillID:s.ID,angle,posX:r.x,posY:r.y,duration:castMs}));
 return true;
}
function advance(r,targets,time,events,event,protectedPoint,onRelease){
 const rt=runtime(r),p=rt.pending;if(!p)return {busy:false};
 const target=targets.find(t=>t.world===p.targetWorld&&t.world.entity.id===p.targetId);
 if(r.dead||(!p.released&&!require('./mob-control-3127').allows(r,p.skill,time))||!targetValid(r,target)||!targetLife.matches(p.targetBinding,target)||protectedPoint(target.world.entity.physics.x,target.world.entity.physics.y)){
  cancel(r,events,event);return {busy:false,cancelled:true};
 }
 let impact=null;
 if(time>=p.releaseAt&&!p.released){
  p.released=true;
  events.push(event(r.entity,'skillCast',{skillID:p.skill.ID,angle:p.angle,posX:p.origin.x,posY:p.origin.y,targetPos:p.target}));
  // The environment supplies authoritative effects. The optional contact result
  // remains for callers that only inspect cast timing.
  if(onRelease)onRelease(r,p,p.releaseAt);else if(!p.skill.isSkill)impact={target,skill:p.skill,angle:p.angle,origin:p.origin};
 }
 if(time>=p.endAt){rt.pending=null;setState(r,STATE.idle,events,event);}
 return {busy:!!rt.pending,impact};
}
function audit(rows){return [...new Set(rows.filter(r=>['mob','boss'].includes(r.kind)).map(r=>r.cid))].map(cid=>({cid,skills:skillsFor({cid,level:1}).map(s=>({id:s.ID,type:s.skillType,animationIndex:creatures.get(cid).SkillIDs.indexOf(s.ID),cd:s.cd,castPointTime:s.castPointTime,casting:'native-events',effects:effects.status(s),damageFormula:'CLIENT_TOOLTIP_BASE_FORMULA_MITIGATION_UNRESOLVED'}))}));}
module.exports={STATE,cfgFor,skillsFor,runtime,setState,argsOf,select,begin,advance,cancel,audit};
