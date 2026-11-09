'use strict';
// Native6009/6023, scarabBomb1023/event123. Formation, movement, contacts,
// heal trigger and conflict resolution are explicit local policies (audit75).
const rows=require('../config/schemes/SkillScheme.json').Skill;
const skins=new Map(require('../config/schemes/SkinScheme.json').Skin.filter(s=>s.HeroId===7).map(s=>[s.ID,s]));
const binding=require('./monster-targets-3127'),W=()=>require('./world'),args=s=>require('./monster-skills-3127').argsOf(s);
const MAX=64;
function profile(skill){return skill?.ID===6009&&[336,337,338].includes(skill.skillType);}
function ready(s){const w=s?.world,e=w?.entity;return !!(w?.sceneReady&&w.loadingFinished&&!w.dead&&w.mapId===2&&e?.property?.HP>0&&e.property.level>=10&&e.miscInfo?.heroId===7&&skins.has(e.miscInfo.curSkinId));}
function bind(s){return {...binding.bind(s),skinID:s.world.entity.miscInfo.curSkinId};}
function valid(s,j){return ready(s)&&binding.matches(j,s)&&s.world.entity.miscInfo.curSkinId===j.skinID;}
function count(s,skill){return args(skill).num+Math.floor(Math.max(0,s.world.entity.property.maxHP)/1000);}
function available(s){const w=s.world;return MAX-(w.mummyBeetles?.length||0)-(w.mummyCasts||[]).reduce((n,j)=>n+j.count-j.index,0);}
function capacity(s,skill){const n=count(s,skill);return Number.isSafeInteger(n)&&n>0&&n<=available(s);}
function schedule(game,s,skill,time){if(!profile(skill)||!ready(s)||!capacity(s,skill))return false;(s.world.mummyCasts||=[]).push({...bind(s),skill,activeSkill:skill,mode:'active',count:count(s,skill),index:0,release:time+skill.castPointTime,deadline:time+skill.castPointTime+1000,started:false});return true;}
function onDamaged(game,s,damage,time=Date.now()){if(!ready(s)||s.world.entity.miscInfo.heroStar!==3||!(damage>0)||time<(s.world.mummyPassiveReadyAt||0)||available(s)<1)return false;
 const activeSkill=rows.find(r=>r.ID===6009&&r.level===3),skill=rows.find(r=>r.ID===6023&&r.level===3);s.world.mummyPassiveReadyAt=time+args(activeSkill).passiveCD;(s.world.mummyCasts||=[]).push({...bind(s),skill,activeSkill,mode:'passive',count:1,index:0,release:time,deadline:time+1000,started:false});return true;
}
function protectedPoint(s,p){return require('./city-3127').safePoint(p.x,p.y,s.world.level,2);}
function blocked(s,time){return require('./player-skills-3127').blocked(s,time)||s.world.monsterStatuses?.get(192)?.until>time;}
function spawn(game,s,j,index,time,events){const w=s.world,e=w.entity,rad=j.angle*Math.PI/180,ux=Math.cos(rad),uy=Math.sin(rad),width=j.skill.skillSize[0],offset=j.count>1?(index/(j.count-1)-.5)*width:0;
 let point={x:e.physics.x-uy*offset,y:e.physics.y+ux*offset};if(!require('./motion-3127').validPoint(2,point.x,point.y)||protectedPoint(s,point))point={x:e.physics.x,y:e.physics.y};
 const id=game.nextMummyID=Math.max(game.nextMummyID||910000000,910000000)+1,entity={id,uid:0,cid:0,type:1023,ownerID:e.id,camp:{campID:e.camp?.campID||e.id},ud:JSON.stringify({skinID:j.skinID}),physics:{...point,rotation:j.angle,direction:ux<0?-1:1},physics2:{angle:j.angle},property:{HP:1,maxHP:1,level:j.skill.level,property:{}},buffer:{buffs:[]}};
 const row={id,cid:0,type:1023,kind:'mummyScarab',entity,room:w.room,mapId:2,x:point.x,y:point.y,homeX:point.x,homeY:point.y,version:1,dead:false,noRespawn:true};
 const b={...bind(s),skill:j.skill,activeSkill:j.activeSkill,mode:j.mode,row,ux,uy,angle:j.angle,born:time,last:time,until:time+(j.mode==='active'?args(j.skill).existence:j.skill.duration),left:j.skill.maxDistance,damageActor:j.damageActor,phase:'flying',contacts:null,healDone:false};row.mummy=b;(w.mummyBeetles||=[]).push(b);require('./environment-3127').room(game,w.room).rows.set(id,row);events.push(W().spawnEvent([entity]));return true;
}
function remove(game,b,events){game.environments?.get(b.room)?.rows.delete(b.row.id);events.push(W().destroyEvent([b.row.id]));}
function candidates(game,s,time){return require('./environment-3127').records(game,s).filter(r=>!r.dead&&['mob','boss'].includes(r.kind)&&!(r.effectState?.hiddenUntil>time)&&!protectedPoint(s,r));}
function beginExplosion(b,time,events){if(b.phase==='exploding')return;b.phase='exploding';b.explodedAt=time;b.deadline=time+1000;b.removeAt=time+1000;events.push(W().entityEventData(b.row.entity,'moveStop',{}),W().entityEventData(b.row.entity,'scarabBomb',{}));}
function move(game,s,b,time,events){const from={x:b.row.x,y:b.row.y},dt=Math.max(0,Math.min(100,time-b.last))/1000,step=Math.min(b.left,b.skill.skillSpeed*dt),to={x:from.x+b.ux*step,y:from.y+b.uy*step};b.last=time;
 const radius=b.skill.skillSize[0]/2,A=require('./actions-3127'),G=require('./geometry-3127'),body=[...require('./city-3127').collidersFor(s.world.level,2),...A.roomStructures(game,s).map(r=>A.buildingCollider(r,radius)).filter(Boolean)];let fraction=G.firstCollision(from.x,from.y,to.x,to.y,body),hit=fraction!==null;
 for(const r of candidates(game,s,time)){const rr=radius+A.targetRadius({record:r}),f=Math.hypot(r.x-from.x,r.y-from.y)<=rr?0:G.circleEntry(from.x,from.y,to.x,to.y,r.x,r.y,rr);if(f!==null&&(fraction===null||f<fraction)){fraction=f;hit=true;}}
 const f=fraction===null?1:Math.max(0,fraction-.0001),x=from.x+(to.x-from.x)*f,y=from.y+(to.y-from.y)*f;
 if(!require('./motion-3127').validPoint(2,x,y)||protectedPoint(s,{x,y})){b.phase='arming';b.armingAt=Math.max(time,b.born+100);return;}
 Object.assign(b.row,{x,y});Object.assign(b.row.entity.physics,{x,y});b.left-=step*f;if(step)events.push(W().entityEventData(b.row.entity,'moveTo',{x,y,direction:b.ux<0?-1:1,frequency:1}));
 if(hit||b.left<=.01||time>=b.until){if(time<b.born+100){b.phase='arming';b.armingAt=b.born+100;}else beginExplosion(b,time,events);}
}
function explode(game,s,b,time,events,changed){if(!b.contacts)b.contacts=candidates(game,s,time).filter(r=>Math.hypot(r.x-b.row.x,r.y-b.row.y)<=b.skill.effectSize[0]+require('./actions-3127').targetRadius({record:r})).map(r=>({r,actor:r.entity,life:r.spawnToken,done:false}));
 for(const c of b.contacts){const r=c.r;if(c.done||r.dead||r.entity!==c.actor||r.spawnToken!==c.life||game.environments?.get(b.room)?.rows.get(r.id)!==r||protectedPoint(s,r))continue;let hits;
  try{hits=require('./actions-3127').damageTargets(game,s,b.skill,[{kind:'environment',id:r.id,x:r.x,y:r.y,record:r}],{actor:b.damageActor});}catch(error){b.retryAt=time+250;b.error=String(error.message).slice(0,120);return false;}
  c.done=true;changed.add(r);require('./combat-input-3127').appendHits(s,hits,b.skill.ID,events,W().entityEventData,W().destroyEvent,b.skill,b.damageActor);
 }
 if(!b.healDone){b.healDone=true;const a=args(b.skill),p=s.world.entity.property,base=Math.floor((a.damage/100+(b.damageActor.property.property.attack||0)*(a.atkArgs||0)/10000)*(a.healRate||0)/100),amount=Number.isFinite(base)?Math.max(0,Math.min(p.maxHP-p.HP,base)):0;if(amount){p.HP+=amount;events.push(W().entityEventData(s.world.entity,'addHP',{changeHP:amount,currentHP:p.HP,maxHP:p.maxHP}));changed.add(s);}}
 return true;
}
function queue(game,peer,target){let q=(game.mummyCorrections||=new Map()).get(peer);if(!q||!binding.matches(q.binding,peer))game.mummyCorrections.set(peer,q={binding:binding.bind(peer),rows:new Map()});const id=target.world?.entity?.id||target.id;if(q.rows.size>=128&&!q.rows.has(id))q.rows.delete(q.rows.keys().next().value);q.rows.set(id,target.world?{target,binding:binding.bind(target),room:target.world.room}:{target,actor:target.entity,life:target.spawnToken,room:target.room??peer.world.room});}
function publishRoom(game,room,events,changed,mapId=2){if(!events.length)return;for(const peer of [...(game.online||[])].filter(p=>p.world?.sceneReady&&p.world.room===room&&p.world.mapId===mapId))try{W().replicate(game,peer,events);}catch{for(const r of changed)queue(game,peer,r);}}
function cleanup(game,s,b,events){const out=[];remove(game,b,out);if(b.room===s.world.room&&b.mapId===s.world.mapId)events.push(...out);else publishRoom(game,b.room,out,new Set(),b.mapId);}
function flush(game,time){if(time<(game.nextMummyCorrection||0))return;game.nextMummyCorrection=time+250;for(const[peer,q]of game.mummyCorrections||[]){if(!game.online.has(peer)||!binding.matches(q.binding,peer)||!peer.world?.sceneReady){game.mummyCorrections.delete(peer);continue;}for(const[id,c]of q.rows){const t=c.target;if(peer.world.room!==c.room||t.world&&!binding.matches(c.binding,t)||!t.world&&(t.entity!==c.actor||t.spawnToken!==c.life||game.environments?.get(c.room)?.rows.get(id)!==t)){q.rows.delete(id);continue;}const e=t.world?.entity||t.entity,events=!t.world&&t.dead?[W().destroyEvent([id])]:[W().entityEventData(e,'setHP',{currentHP:e.property.HP,maxHP:e.property.maxHP})];try{W().replicate(game,peer,events);q.rows.delete(id);}catch{}}if(!q.rows.size)game.mummyCorrections.delete(peer);}}
function tickState(game,s,time){const w=s.world;if(!w?.entity)return;const events=[],changed=new Set(),casts=[];
 for(const j of w.mummyCasts||[]){if(!valid(s,j)||protectedPoint(s,w.entity.physics)||j.mode==='active'&&blocked(s,time)||time>j.deadline){if(binding.matches(j,s)&&j.mode==='active')events.push(W().entityEventData(j.actor,'skillStop',{skillID:6009}));continue;}if(time<j.release){casts.push(j);continue;}
  if(!j.started){j.started=true;j.angle=require('./combat-input-3127').aim(w);j.damageActor=structuredClone(w.entity);if(j.mode==='active')events.push(W().entityEventData(w.entity,'skillCast',{skillID:6009,angle:j.angle,posX:w.entity.physics.x,posY:w.entity.physics.y,targetPos:require('./player-skills-3127').cursor(s,j.skill,j.angle)}));}
  for(let n=0;n<6&&j.index<j.count;n++,j.index++)spawn(game,s,j,j.index,time,events);if(j.index<j.count){j.release=time+50;casts.push(j);}else if(j.mode==='active')events.push(W().entityEventData(j.actor,'skillStop',{skillID:6009}));
 }w.mummyCasts=casts;
 const beetles=[];for(const b of w.mummyBeetles||[]){if(!valid(s,b)||protectedPoint(s,w.entity.physics)){cleanup(game,s,b,events);continue;}
  if(b.phase==='flying')move(game,s,b,time,events);if(b.phase==='arming'&&time>=b.armingAt)beginExplosion(b,time,events);
  if(b.phase==='exploding'){if(time>b.deadline&&!b.settled){cleanup(game,s,b,events);continue;}if(!b.settled&&time>=(b.retryAt||0)){b.settled=explode(game,s,b,time,events,changed);if(b.settled)b.removeAt=Math.max(b.removeAt,time+200);}if(b.settled&&time>=b.removeAt){cleanup(game,s,b,events);continue;}}
  beetles.push(b);
 }w.mummyBeetles=beetles;publishRoom(game,w.room,events,changed,w.mapId);
}
function tick(game,time=Date.now()){for(const s of game.online||[])tickState(game,s,time);flush(game,time);}
function clear(game,s,events=[],event=W().entityEventData){const w=s.world;if(!w)return;for(const j of w.mummyCasts||[])if(binding.matches(j,s)&&j.mode==='active')events.push(event(j.actor,'skillStop',{skillID:6009}));for(const b of w.mummyBeetles||[])cleanup(game,s,b,events);w.mummyCasts=[];w.mummyBeetles=[];w.mummyPassiveReadyAt=0;}
module.exports={MAX,skins,profile,ready,bind,valid,count,available,capacity,schedule,onDamaged,beginExplosion,explode,tickState,tick,clear,flush};
