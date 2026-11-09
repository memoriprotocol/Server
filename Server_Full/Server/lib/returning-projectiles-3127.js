'use strict';
// Native missile IDs/speed/range and return-hit descriptions. Trajectory,
// per-leg contacts and lifetime rules are reconstructed; see STAGE57_RETURNS.json.
const skills=new Map(require('../config/schemes/SkillScheme.json').Skill.filter(s=>s.level===1).map(s=>[s.ID,s]));
const assets=require('../config/projectile-assets-3127.json'),profiles=new Map();
for(const w of require('../config/schemes/WeaponScheme.json').Weapon){
 if(w.level!==1||![614600,619700].includes(w.oriWeaponID))continue;
 for(const id of [w.skill,w.skill2]){const s=skills.get(id);if(s&&[156,164,542].includes(s.skillType)&&assets[id]&&s.skillSpeed>0&&s.maxDistance>0)profiles.set(id,{skill:s,weaponID:w.weaponID});}
}
function attach(shot,state){
 if(state.world.mapId!==2||shot.actor!==state.world.entity||shot.sourceRecord||!profiles.has(shot.skill.ID))return;
 shot.returnFlight={world:state.world,mapId:2,phase:0,range:shot.skill.maxDistance,outUsed:0,returnUsed:0,returnLimit:shot.skill.maxDistance*2,hits:[new Map(),new Map()],segment:null,until:Date.now()+Math.max(5000,3*shot.skill.maxDistance/shot.speed*1000+3000)};
}
function token(r){return r.spawnToken||r.entity;}
function valid(state,shot){const w=state.world,f=shot.returnFlight;return w===f.world&&w.sceneReady&&!w.dead&&w.entity===shot.actor&&w.entity.property.HP>0&&w.mapId===2&&w.room===shot.room;}
function remove(game,shot,events){require('./projectiles-3127').unregister(game,shot);events.push(require('./world').destroyEvent([shot.entity.id]));return false;}
function targets(game,state,shot,from,to,now){
 const env=require('./environment-3127'),actions=require('./actions-3127'),city=require('./city-3127'),radius=Math.max(10,Number(shot.skill.skillSize?.[0])||20)/2,seen=shot.returnFlight.hits[shot.returnFlight.phase];
 return env.records(game,state).filter(r=>!r.dead&&!r.depleted&&seen.get(r)!==token(r)&&['mob','boss','tree','stone','ore','chest','statue'].includes(r.kind)&&!(r.effectState?.hiddenUntil>now)&&!city.safePoint(r.x,r.y,state.world.level,2)&&require('./projectiles-3127').segmentDistance(r.x,r.y,from,to)<=radius+actions.targetRadius({record:r})).sort((a,b)=>Math.hypot(a.x-from.x,a.y-from.y)-Math.hypot(b.x-from.x,b.y-from.y)).map(r=>({record:r,token:token(r)}));
}
function plan(game,state,shot,budget,now){
 const f=shot.returnFlight,from={x:shot.entity.physics.x,y:shot.entity.physics.y};let ux=shot.ux,uy=shot.uy,distance,catchOwner=false;
 if(f.phase===0)distance=Math.min(budget,f.range-f.outUsed);
 else{const at=shot.actor.physics,dx=at.x-from.x,dy=at.y-from.y,d=Math.hypot(dx,dy);if(d<=.001)return null;ux=dx/d;uy=dy/d;distance=Math.min(budget,d,f.returnLimit-f.returnUsed);catchOwner=distance>=d-.001;}
 const to={x:from.x+ux*distance,y:from.y+uy*distance};
 return {from,to,distance,ux,uy,catchOwner,phase:f.phase,targets:targets(game,state,shot,from,to,now)};
}
function tick(game,state,shot,dt,events,event,emitHits){
 const f=shot.returnFlight,now=Date.now();if(!valid(state,shot)||now>f.until)return remove(game,shot,events);
 if(now<(shot.retryAt||0))return true;
 let budget=shot.speed*(Number.isFinite(dt)?Math.max(0,dt):0),guard=0;
 do{
  const seg=f.segment||(f.segment=plan(game,state,shot,budget,now));if(!seg)return remove(game,shot,events);
  for(const item of seg.targets){const r=item.record,seen=f.hits[seg.phase];if(r.dead||r.depleted||token(r)!==item.token||seen.get(r)===item.token||game.environments?.get(shot.room)?.rows.get(r.id)!==r)continue;
   let hits;try{hits=require('./actions-3127').damageTargets(game,state,shot.skill,[{kind:'environment',id:r.id,x:r.x,y:r.y,record:r}],{actor:shot.actor});}
   catch(error){shot.retryAt=now+250;if(!shot.lastFailureLog||now-shot.lastFailureLog>=5000){shot.lastFailureLog=now;console.warn('[RETURN MISSILE REWARD RETRY]',error.message);}return true;}
   if(hits.length)seen.set(r,item.token);
   emitHits(hits,shot.skill.ID,shot.skill,shot.actor,{angle:Math.atan2(seg.uy,seg.ux)*180/Math.PI,sourceRecord:null});
  }
  shot.retryAt=0;f.segment=null;budget-=seg.distance;shot.ux=seg.ux;shot.uy=seg.uy;
  if(seg.phase===0)f.outUsed+=seg.distance;else f.returnUsed+=seg.distance;
  const angle=Math.atan2(seg.uy,seg.ux)*180/Math.PI;Object.assign(shot.entity.physics,{...seg.to,rotation:angle});shot.entity.physics2.angle=angle;
  shot.entity.ud=JSON.stringify({...JSON.parse(shot.entity.ud),angle});if(shot.nativeRow)Object.assign(shot.nativeRow,seg.to);
  events.push(event(shot.entity,'rotateTo',{angle,rotation:angle}),event(shot.entity,'moveTo',{...seg.to,direction:1,frequency:1}));
  if(seg.phase===1&&(seg.catchOwner||f.returnUsed>=f.returnLimit-.001))return remove(game,shot,events);
  if(seg.phase===0&&f.outUsed>=f.range-.001)f.phase=1;
  shot.left=f.phase===0?f.range-f.outUsed:f.returnLimit-f.returnUsed;
  // There are only two legs. A long frame can cross the turn and return without
  // skipping either swept collision path; retry preserves the frozen segment.
 }while(budget>.001&&++guard<3);
 return true;
}
module.exports={profiles,attach,valid,targets,plan,tick};
