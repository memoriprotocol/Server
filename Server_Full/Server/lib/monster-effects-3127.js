'use strict';
// Authoritative effect state. Geometry/timing comes from this client's schemes;
// native rendering contracts are recorded in retail/client-reference/stage40.
// The tooltip base damage formula is recovered; retail mitigation is unresolved.
const {randomInt}=require('node:crypto');
const damageEngine=require('./damage-3127'),life=require('./life-3127');
const geometry=require('./geometry-3127'),city=require('./city-3127'),water=require('./water-3127');
const schemes=require('../config/schemes/SkillScheme.json').Skill;
const creatures=new Map(require('../config/schemes/CreatureScheme.json').Creature.map(r=>[r.ID,r]));
const props=require('../config/schemes/PropLevelsScheme.json').PropLevel;
const byId=new Map(schemes.filter(s=>s.level===1).map(s=>[s.ID,s]));
const MAX_TRANSIENT=256,MAX_SUMMONS=32;
const SUPPORT=new Map([[2236,'heal'],[2235,'shield'],[2238,'attack'],[2232,'crit']]);
const DASH=new Set([2074,2087,2089,2090]);
const ENERGY=new Set([2088,2092,2299]);
function args(s){const out={};for(const raw of s.args||[]){const i=raw.indexOf(':');const n=Number(raw.slice(i+1));if(i>0&&Number.isFinite(n))out[raw.slice(0,i)]=n;}return out;}
function state(r){return r.effectState||=( {buffs:new Map(),baseAttack:Number(r.entity.property.property?.attack)||0,baseCrit:Number(propRow(r)?.Crit)||0,baseCritHarm:Number(propRow(r)?.CritHarm)||150,shield:null} );}
function propRow(r){return props.find(p=>p.PropID===r.cid&&p.Level<=r.level&&p.MaxLevel>=r.level)||props.find(p=>p.PropID===r.cid);}
function runtime(env){return env.effectRuntime||=( {nextId:61000000,jobs:[],lastTime:null} );}
function queue(env,job){job.version=job.r.version;runtime(env).jobs.push(job);}
function definition(id){return byId.get(Number(id));}
function castRange(s){if(SUPPORT.has(s.ID))return s.maxDistance;return [69,70,119,318,370,601].includes(s.skillType)&&s.skillShape!==2?Math.min(s.maxDistance,Number(s.effectSize[0])||s.maxDistance):s.maxDistance;}
function eligible(p){const w=p?.world;return !!(w?.sceneReady&&w.loadingFinished&&!w.dead&&w.entity.property.HP>0&&!city.safePoint(w.entity.physics.x,w.entity.physics.y,w.level,w.mapId));}
function liveTargets(ctx){return [...ctx.peers,...require('./hero-summons-3127').targets(ctx.game,ctx.peers[0]?.world.room)].filter(p=>eligible(p)&&!(p.world.protectedUntil>ctx.time)&&!require('./player-skills-3127').invulnerable(p,ctx.time));}
function emit(ctx,e,name,data){ctx.events.push(ctx.event(e,name,data));}
function moveActor(ctx,r,x,y){r.x=x;r.y=y;r.entity.physics.x=x;r.entity.physics.y=y;emit(ctx,r.entity,'moveTo',{x,y,direction:1,frequency:1});}
function sameCamp(a,b){return a.entity.camp?.campID===b.entity.camp?.campID;}
function nativeBuff(r,id,value,duration,time,source,ctx){
 const st=state(r),old=st.buffs.get(id);if(old&&old.value>=value&&old.until>=time+duration)return;
 const buff={id,value,until:time+duration,source:source.id};st.buffs.set(id,buff);
 const wire={type:id,group:0,duration,startTime:time,endTime:time+duration,stackNum:1,maxStackNum:1,isValid:1,propValue:Math.round(value),fromEntityType:source.type};
 r.entity.buffer||={buffs:[]};r.entity.buffer.buffs=r.entity.buffer.buffs.filter(b=>b.type!==id);r.entity.buffer.buffs.push(wire);
 emit(ctx,r.entity,'buffAdd',wire);recompute(r,ctx);
}
function recompute(r,ctx){const st=state(r),attack=st.baseAttack+(st.buffs.get(54)?.value||0),crit=st.baseCrit+(st.buffs.get(176)?.value||0);const prop=r.entity.property.property;prop.attack=attack;prop.crit=crit;if(ctx)emit(ctx,r.entity,'propertyResult',{propRes:r.entity.property});}
function expireBuffs(r,time,ctx){
 if(!r.effectState)return;
 let changed=false;for(const [id,b]of r.effectState.buffs)if(time>=b.until){r.effectState.buffs.delete(id);r.entity.buffer.buffs=r.entity.buffer.buffs.filter(x=>x.type!==id);emit(ctx,r.entity,'buffRemove',{type:id});changed=true;}
 const sh=r.effectState.shield;if(sh&&time>=sh.until){r.effectState.shield=null;const old=r.entity.property.shield||0;r.entity.property.shield=0;if(old)emit(ctx,r.entity,'changeShield',{changeShield:-old,currentShield:0});}
 if(changed)recompute(r,ctx);
}
function damageFor(r,s,random,targetProperty=null){
 const st=state(r),property={...r.entity.property.property};
 property.crit??=st.baseCrit+(st.buffs.get(176)?.value||0);property.critHarm??=st.baseCritHarm;
 return damageEngine.calculate(property,s,{targetProperty,...(random?{rng:random}:{})});
}
function absorbShield(r,amount){const old=Math.max(0,Number(r.entity.property.shield)||0),absorbed=Math.min(old,amount);r.entity.property.shield=old-absorbed;if(r.effectState?.shield)r.effectState.shield.remaining=r.entity.property.shield;return {amount:amount-absorbed,absorbed,currentShield:r.entity.property.shield};}
function heal(ctx,r,amount){if(r.dead||r.hp<=0)return;const change=Math.max(0,Math.min(r.maxHP-r.hp,Math.floor(amount)));if(!change)return;r.hp+=change;r.entity.property.HP=r.hp;emit(ctx,r.entity,'addHP',{changeHP:change,currentHP:r.hp,maxHP:r.maxHP});}
function support(ctx,r,s,time){
 const a=args(s),kind=SUPPORT.get(s.ID),radius=Number(s.effectSize[0])||500;
 const allies=[...ctx.env.rows.values()].filter(x=>['mob','boss'].includes(x.kind)&&!x.dead&&sameCamp(r,x)&&Math.hypot(x.x-r.x,x.y-r.y)<=radius);
 allies.sort((x,y)=>kind==='heal'?(x.hp/x.maxHP-y.hp/y.maxHP):x.id===r.id?-1:y.id===r.id?1:x.id-y.id);
 const selected=allies.filter(x=>kind!=='heal'||x.hp<x.maxHP).slice(0,Math.max(1,a.num||1));
 for(const t of selected){
  if(kind==='heal')heal(ctx,t,r.maxHP*a.hpArgs/100);
  if(kind==='shield'){
   const amount=Math.max(0,Math.floor(r.maxHP*a.hpArgs/100)),st=state(t),old=t.entity.property.shield||0;
   if(amount>=old){st.shield={remaining:amount,until:time+a.duration};t.entity.property.shield=amount;emit(ctx,t.entity,'changeShield',{changeShield:amount-old,currentShield:amount});}
  }
  if(kind==='attack')nativeBuff(t,54,Math.floor(state(r).baseAttack*a.atkArgs/100),a.duration,time,r,ctx);
  if(kind==='crit')nativeBuff(t,176,a.critUp,a.duration,time,r,ctx);
 }
}
function hitPlayer(ctx,r,target,s,amount=null){
 if(!eligible(target)||target.world.protectedUntil>ctx.time||require('./player-skills-3127').invulnerable(target,ctx.time)||!target.world.environmentSeen?.has(r.id))return false;
 if(!target.battlePet&&!target.heroSummon&&amount===null&&(require('./rabbit-3127').evade(target,ctx.random,ctx.time)||require('./food-effects-3127').evade(target,ctx.random,ctx.time))){emit(ctx,target.world.entity,'subHP',{changeHP:0,currentHP:target.world.entity.property.HP,maxHP:target.world.entity.property.maxHP,dmgType:5,showChangeHP:0});return false;}
 const e=target.world.entity,computed=amount===null?damageFor(r,s,ctx.random,e.property.property):damageEngine.calculate({},s,{fixedAmount:amount});
 if(target.battlePet){const hit=require('./pets-3127').damage(ctx,r,target,s,computed.amount,computed.dmgType);if(hit&&!target.battlePet.dead)applyOnHit(ctx,r,target,s);return hit;}
 if(target.heroSummon){const hit=require('./hero-summons-3127').damage(ctx,r,target,s,computed.amount,computed.dmgType);if(hit&&!target.heroSummon.dead)applyOnHit(ctx,r,target,s);return hit;}
 require('./frozen-armor-3127').beforeHit(ctx.game,target,ctx.time,ctx.events,ctx.event);
 const heroReduction=Math.max(require('./hero-native-passives-3127').reduction(target),require('./hero-support-3127').reduction(target,ctx.time),require('./spartan-stance-3127').reduction(target,ctx.time),require('./food-effects-3127').reduction(target,ctx.time));
 const raw=require('./hero-summons-3127').reduceIncoming(ctx.game,target,require('./relics-3127').incoming(target,r,s,Math.floor(computed.amount*(1-Math.min(90,heroReduction)/100)))),oldHP=e.property.HP,oldShield=Number(e.property.shield)||0,absorbed=Math.min(oldShield,raw),share=require('./hero-summons-3127').sharePlan(ctx.game,target,raw-absorbed),damage=Math.min(oldHP,raw-absorbed-(share?.amount||0));
 let death=null;
 if(damage===oldHP){try{death=life.die(ctx.game,target,r,ctx.time);}catch(error){console.warn('[PLAYER DEATH SAVE]',error.message);return false;}}
 require('./hero-summons-3127').applyShare(ctx,r,s,share);
 if(absorbed){e.property.shield=oldShield-absorbed;emit(ctx,e,'changeShield',{changeShield:-absorbed,currentShield:e.property.shield});emit(ctx,e,'subHP',{changeHP:0,currentHP:oldHP,maxHP:e.property.maxHP,dmgType:damageEngine.TYPE.shieldResist,showChangeHP:absorbed});}
 emit(ctx,e,'beHurt',{skillId:s.ID,attacker:r.id,attackerCID:r.cid,attackerPos:{x:r.x,y:r.y},targetPos:{x:e.physics.x,y:e.physics.y},damageType:computed.dmgType,skillLevel:1});
 if(damage){e.property.HP=oldHP-damage;emit(ctx,e,'subHP',{changeHP:damage,currentHP:e.property.HP,maxHP:e.property.maxHP,dmgType:computed.dmgType,showChangeHP:damage});}
 if(death){
  for(const id of death.removed)emit(ctx,e,'buffRemove',{type:id});
  ctx.events.push(...life.deathEvents(target,death.pending,ctx.event));
  ctx.privateEvents.push({state:target,events:[ctx.event(e,'settleInfo',death.pending.data)]});
  ctx.privatePushes.push({state:target,route:'updateCoin',body:require('./codec').encode('CoinUpdatePush',{coin:target.player.coin})});
 }else if(e.property.HP>0){require('./frozen-armor-3127').absorbed(ctx.game,target,absorbed,ctx.time,ctx.events,ctx.event);applyOnHit(ctx,r,target,s);if(damage>0){require('./mummy-3127').onDamaged(ctx.game,target,damage,ctx.time);require('./slime-3127').breakDisguise(ctx.game,target,ctx.time,ctx.events,ctx.event,'hurt');}}
 return true;
}
function applyOnHit(ctx,r,target,s){
 for(let i=0;i<(s.onHitEnemyBuff||[]).length;i++){
  const [prob,name]=s.onHitEnemyBuff[i].split(',');if((ctx.random?.()??randomInt(10000)/10000)*100>=Number(prob))continue;
  const values={};for(const str of (s.onHitEnemyBuffArgs[i]||'').split(',')){const [k,v]=str.split(':');values[k]=Number(v);}
  const id={subHp_5:146,confused:192}[name];if(!id||id===192&&(target.heroSummon?.cid===2003||require('./food-effects-3127').immuneControl(target,ctx.time)))continue;
  const w=target.world;w.monsterStatuses||=new Map();const duration=id===192?require('./druid-3127').controlDuration(target,values.duration||0):values.duration||0;
  w.monsterStatuses.set(id,{id,source:r,skill:s,until:ctx.time+duration,nextTick:ctx.time+1000,damage:(values.buffDmgKey||0)/100});
  const buff={type:id,group:0,duration,startTime:ctx.time,endTime:ctx.time+duration,stackNum:1,maxStackNum:1,isValid:1,propValue:values.buffDmgKey||0};w.entity.buffer||={buffs:[]};w.entity.buffer.buffs=(w.entity.buffer.buffs||[]).filter(b=>b.type!==id);w.entity.buffer.buffs.push(buff);emit(ctx,w.entity,'buffAdd',buff);
 }
}
function clearStatuses(target,ctx){for(const id of target.world.monsterStatuses?.keys()||[])emit(ctx,target.world.entity,'buffRemove',{type:id});target.world.monsterStatuses?.clear();}
function tickStatuses(ctx,time){
 for(const p of [...ctx.peers,...require('./hero-summons-3127').targets(ctx.game,ctx.peers[0]?.world.room)]){for(const [id,status]of p.world.monsterStatuses||[]){
  if(!eligible(p)||status.source.dead){p.world.monsterStatuses.delete(id);emit(ctx,p.world.entity,'buffRemove',{type:id});continue;}
  let guard=0;while(status.damage>0&&status.nextTick<=time&&status.nextTick<=status.until&&guard++<8){status.nextTick+=1000;hitPlayer(ctx,status.source,p,{...status.skill,onHitEnemyBuff:[]},status.damage);if(!eligible(p))break;}
  if(time>=status.until){p.world.monsterStatuses.delete(id);p.world.entity.buffer.buffs=(p.world.entity.buffer.buffs||[]).filter(b=>b.type!==id);emit(ctx,p.world.entity,'buffRemove',{type:id});}
 }}
}
function segmentCircle(a,b,p,radius){const dx=b.x-a.x,dy=b.y-a.y,len=dx*dx+dy*dy,t=len?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/len)):0;return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy)<=radius;}
function circle(x,y,cx,cy,radius){return Math.hypot(x-cx,y-cy)<=radius;}
function sector(x,y,origin,angle,radius,arc){const dx=x-origin.x,dy=y-origin.y,d=Math.hypot(dx,dy);if(d>radius)return false;if(d<1e-9||arc>=360)return true;const delta=(Math.atan2(dy,dx)*180/Math.PI-angle+540)%360-180;return Math.abs(delta)<=arc/2;}
function hitArea(ctx,r,s,origin,angle,mode='scheme',hit=new Set()){
 const sizes=s.effectSize||[],radius=Number(sizes[0])||s.maxDistance;
 for(const t of liveTargets(ctx)){const p=t.world.entity.physics;if(hit.has(t.world)||!water.canMove(r.cid,origin.x,origin.y,p.x,p.y,r.mapId||ctx.env.mapId||2))continue;
  const inside=mode==='circle'||s.skillRange===2?circle(p.x,p.y,origin.x,origin.y,radius):s.skillRange===1?rectContains(p,origin,angle,sizes[0],sizes[1]):sector(p.x,p.y,origin,angle,radius,Number(sizes[1])||90);
  if(inside&&hitPlayer(ctx,r,t,s))hit.add(t.world);
 }
}
function rectContains(p,o,angle,length,width){const a=angle*Math.PI/180,dx=p.x-o.x,dy=p.y-o.y,forward=dx*Math.cos(a)+dy*Math.sin(a),lateral=-dx*Math.sin(a)+dy*Math.cos(a);return forward>=0&&forward<=length&&Math.abs(lateral)<=width/2;}
function allocate(ctx,r,s,type,x,y,ud,expiresAt,kind='effect'){
 const rt=runtime(ctx.env);if([...ctx.env.rows.values()].filter(x=>x.transient).length>=MAX_TRANSIENT)return null;
 const id=rt.nextId++;if(!Number.isSafeInteger(id)||id>=2147483647)throw Error('TRANSIENT_ID_EXHAUSTED');
 const row={id,cid:0,type,kind,x,y,homeX:x,homeY:y,transient:true,mapId:r.mapId||ctx.env.mapId||2,sourceId:r.id,sourceVersion:r.version,expiresAt,dead:false,version:1,skillId:s.ID};
 row.entity={id,uid:0,cid:0,type,ownerID:r.id,ud:JSON.stringify(ud),physics:{x,y,rotation:0,direction:1},physics2:{angle:ud.angle||0},camp:{campID:r.entity.camp?.campID||0},property:{HP:1,maxHP:1,level:r.level,property:{}},buffer:{buffs:[]}};
 ctx.env.rows.set(id,row);ctx.created.push(row);return row;
}
function destroy(ctx,row){if(!ctx.env.rows.has(row.id))return;ctx.env.rows.delete(row.id);ctx.destroyed.push(row.id);row.dead=true;}
function rayEnd(r,p,s){const range=s.maxDistance,d=Math.hypot(p.target.x-p.origin.x,p.target.y-p.origin.y),a=p.angle*Math.PI/180,len=Math.min(range,d);return{x:p.origin.x+Math.cos(a)*len,y:p.origin.y+Math.sin(a)*len};}
function projectile(ctx,r,p,time,angle=p.angle,type=9,range=p.skill.maxDistance,returning=false){
 const s=p.skill,a=angle*Math.PI/180,from={x:r.x,y:r.y},to={x:r.x+Math.cos(a)*range,y:r.y+Math.sin(a)*range},speed=Math.max(1,s.skillSpeed);
 const duration=range/speed*1000;const row=allocate(ctx,r,s,type,from.x,from.y,{skillId:s.ID,angle,...(type===1053?{prefab_path:'arena/skills/vultureHurriance/prefab/vultureHurriance'}:{}),...(type===87?{initPos:from,targetPos:to,maxDist:s.maxDistance}:{}),radius:s.skillSize[0]},time+duration*(returning?2:1)+500);
 if(!row)return;
 queue(ctx.env,{kind:'projectile',row,r,s,from,to,start:time,duration,returning,hitOut:new Set(),hitBack:new Set(),last:{...from},phase:0});
}
function directProjectile(ctx,r,p,time){
 // No validated network renderer has been recovered for ordinary fox/hamster
 // missiles. Their server collision/travel works; visual remains unverified.
 const s=p.skill,from=p.origin,to={x:from.x+Math.cos(p.angle*Math.PI/180)*s.maxDistance,y:from.y+Math.sin(p.angle*Math.PI/180)*s.maxDistance};
 queue(ctx.env,{kind:'projectile',row:null,r,s,from,to,start:time,duration:s.maxDistance/Math.max(1,s.skillSpeed)*1000,returning:false,hitOut:new Set(),hitBack:new Set(),last:{...from},phase:0});
}
function start(ctx,r,p,time){
 const s=p.skill,a=args(s),rt=runtime(ctx.env);
 if(SUPPORT.has(s.ID)){support(ctx,r,s,time);return;}
 if(DASH.has(s.ID)||s.ID===2050){
  const to=rayEnd(r,p,s),speed=s.ID===2050?s.skillSpeed:(a.buffSpeedUp||r.speed),duration=Math.max(1,Math.hypot(to.x-r.x,to.y-r.y)/Math.max(1,speed)*1000);
  const job={kind:'dash',r,s,from:{x:r.x,y:r.y},to,start:time,duration,last:{x:r.x,y:r.y},hit:new Set(),burrow:s.ID===2050,alert:null};
  if(job.burrow)job.alert=allocate(ctx,r,s,89,to.x,to.y,{radius:s.skillSize[0]},time+duration+500);
  queue(ctx.env,job);p.endAt=Math.max(p.endAt,time+duration+Math.max(0,a.skillBackswing||0));return;
 }
 if(s.ID===2088){const count=a.num||12,arc=s.effectSize[1]||75;for(let i=0;i<count;i++)projectile(ctx,r,p,time,p.angle-arc/2+arc*i/Math.max(1,count-1),9,s.maxDistance);return;}
 if(s.ID===2092||s.ID===2299){projectile(ctx,r,p,time,p.angle,9,s.maxDistance,!a.noNeedBack);return;}
 if(s.ID===2049){
  const count=a.num||20;for(let i=0;i<count;i++){const angle=p.angle+i*360/count,range=s.maxDistance*(0.5+0.5*((i*7%count)/Math.max(1,count-1)));projectile(ctx,r,p,time,angle,87,range);}return;
 }
 if(s.ID===2091){queue(ctx.env,{kind:'spin',r,s,start:time,end:time+s.duration,next:time,interval:a.interval||200});p.endAt=Math.max(p.endAt,time+s.duration+(a.skillBackswing||0));return;}
 if(s.ID===2247){summon(ctx,r,p,time);return;}
 if(s.ID===2268){projectile(ctx,r,p,time,p.angle,1053,s.maxDistance);return;}
 if(s.ID===2255){const row=allocate(ctx,r,s,1056,r.x,r.y,{radius:s.effectSize[0]},time+a.duration);if(row)queue(ctx.env,{kind:'gas',r,s,row,pos:{x:r.x,y:r.y},end:time+a.duration,next:time+1000});return;}
 if(s.ID===2257){
  const children=[];state(r).hiddenUntil=time+a.duration;p.endAt=Math.max(p.endAt,time+a.duration);
  for(let i=0;i<a.num;i++){const angle=(p.angle+i*360/a.num)*Math.PI/180,x=r.x+Math.cos(angle)*250,y=r.y+Math.sin(angle)*250,cid=i===0?1058:1057;
   if(city.safePoint(x,y,'main',r.mapId||2)||!water.canMove(r.cid,r.x,r.y,x,y,r.mapId||2))continue;
   const row=allocate(ctx,r,s,cid,x,y,{},time+a.duration,'mob');if(!row)break;
   Object.assign(row,{cid,type:cid,level:1,summoned:true,stationary:true,respawnMs:0,prefab:'arena_3d/monsters/monster_'+cid+'/monster'});row.entity=ctx.entityOf(row);row.entity.ownerID=r.id;row.entity.camp={campID:r.entity.camp?.campID||0};children.push(row);
  }
  queue(ctx.env,{kind:'illusion',r,s,children,end:time+a.duration});return;
 }
 if(s.ID===2297){
  const row=allocate(ctx,r,s,1108,r.x,r.y,{},time+a.duration,'mob');if(row){Object.assign(row,{cid:1259,type:1108,level:1,summoned:true,stationary:true,respawnMs:0,prefab:'arena_3d/monsters/monster_1259/monster'});row.entity=ctx.entityOf(row);row.entity.ownerID=r.id;row.entity.camp={campID:r.entity.camp?.campID||0};}return;
 }
 if(s.skillShape===2&&s.skillType===70){directProjectile(ctx,r,p,time);return;}
 if([69,70,119,318,370,601].includes(s.skillType)){hitArea(ctx,r,s,p.origin,p.angle);return;}
 // These special actors need their own native construction contracts. They
 // remain listed as unsupported instead of being replaced by generic damage.
 ctx.unsupported.push({cid:r.cid,skill:s.ID});
}
function summon(ctx,r,p,time){
 const a=args(p.skill),cid=a.summonUnits,level=a.summonLv,c=creatures.get(cid);if(!c)return;
 const count=Math.max(0,Math.min(16,a.num||0));
 for(let i=0;i<count;i++){
  if([...ctx.env.rows.values()].filter(x=>x.summoned).length>=MAX_SUMMONS)break;
  const angle=(p.angle+i*360/Math.max(1,count))*Math.PI/180;let pos=null;
  for(const radius of [220,350,100]){const x=r.x+Math.cos(angle)*radius,y=r.y+Math.sin(angle)*radius;if(!city.safePoint(x,y,'main',r.mapId||2)&&!city.overlapsStatic(x,y,80,'main',r.mapId||2)&&water.canMove(cid,r.x,r.y,x,y,r.mapId||2)){pos={x,y};break;}}
  if(!pos)continue;
  const row=allocate(ctx,r,p.skill,c.Typ,pos.x,pos.y,{},time+a.duration,'mob');if(!row)break;
  Object.assign(row,{cid,type:c.Typ,level,kind:'mob',summoned:true,respawnMs:0,rewardItem:0,speed:240,prefab:ctx.modelFor(cid,level)});
  row.entity=ctx.entityOf(row);row.entity.ownerID=r.id;row.entity.camp={campID:r.entity.camp?.campID||0};
 }
}
function endDash(ctx,j){emit(ctx,j.r.entity,'skillBoom',{skillID:j.s.ID,posX:j.r.x,posY:j.r.y});emit(ctx,j.r.entity,'moveStop',{});if(j.alert){emit(ctx,j.alert.entity,'skillBoom',{skillID:j.s.ID,posX:j.r.x,posY:j.r.y});destroy(ctx,j.alert);}if(j.burrow)hitArea(ctx,j.r,{...j.s,effectSize:[j.s.skillSize[0]],skillRange:2},{x:j.r.x,y:j.r.y},0,'circle');}
function tickJob(ctx,j,time){
 if(j.r.dead||!ctx.env.rows.has(j.r.id)||j.r.version!==j.version&&j.version!==undefined){if(j.kind==='dash')endDash(ctx,{...j,burrow:false});if(j.kind==='illusion'){state(j.r).hiddenUntil=0;emit(ctx,j.r.entity,'skillBoom',{skillID:j.s.ID,posX:j.r.x,posY:j.r.y});for(const row of j.children)destroy(ctx,row);}if(j.row)destroy(ctx,j.row);return false;}
 if(j.kind==='illusion'){
  if(time>=j.end||j.children.find(r=>r.cid===1058)?.dead){state(j.r).hiddenUntil=0;emit(ctx,j.r.entity,'skillBoom',{skillID:j.s.ID,posX:j.r.x,posY:j.r.y});for(const row of j.children)destroy(ctx,row);return false;}return true;
 }
 if(j.kind==='gas'){
  let guard=0;while(j.next<=time&&j.next<=j.end&&guard++<8){hitArea(ctx,j.r,j.s,j.pos,0,'circle');j.next+=1000;}
  if(time>=j.end){destroy(ctx,j.row);return false;}return true;
 }
 if(j.kind==='spin'){
  let guard=0;while(j.next<=time&&j.next<j.end&&guard++<8){hitArea(ctx,j.r,{...j.s,effectSize:[j.s.skillSize[0]],skillRange:2},{x:j.r.x,y:j.r.y},0,'circle');j.next+=j.interval;}
  if(time>=j.end){emit(ctx,j.r.entity,'skillBoom',{skillID:j.s.ID,posX:j.r.x,posY:j.r.y});return false;}return true;
 }
 if(j.kind==='dash'){
  const f=Math.max(0,Math.min(1,(time-j.start)/j.duration)),x=j.from.x+(j.to.x-j.from.x)*f,y=j.from.y+(j.to.y-j.from.y)*f;
  const radius=Number(j.s.skillSize[0])||100;
  if(city.safePoint(x,y,'main',j.r.mapId||2)||city.overlapsStatic(x,y,60,'main',j.r.mapId||2)||geometry.firstCollision(j.r.x,j.r.y,x,y,city.collidersFor('main',j.r.mapId||2))!==null||!water.canMove(j.r.cid,j.r.x,j.r.y,x,y,j.r.mapId||2)){endDash(ctx,j);return false;}
  if(!j.burrow)for(const t of liveTargets(ctx)){
   const p=t.world.entity.physics;
   if(!j.hit.has(t.world)&&segmentCircle(j.last,{x,y},p,radius)&&hitPlayer(ctx,j.r,t,j.s))j.hit.add(t.world);
  }
  moveActor(ctx,j.r,x,y);j.last={x,y};if(f>=1){endDash(ctx,j);return false;}return true;
 }
 if(j.kind==='projectile'){
  let progress=(time-j.start)/j.duration,phase=progress>=1&&j.returning?1:0;
  const total=j.returning?2:1,done=progress>=total;progress=Math.max(0,Math.min(total,progress));
  // Split the turnaround segment even when a delayed tick passes the end of
  // the outgoing leg. A straight last-to-current segment would miss its tip.
  const f=phase?Math.max(0,2-progress):Math.min(1,progress),pos={x:j.from.x+(j.to.x-j.from.x)*f,y:j.from.y+(j.to.y-j.from.y)*f};
  const segments=phase!==j.phase?[[j.last,j.to,0],[j.to,pos,1]]:[[j.last,pos,phase]];
  for(const [from,to,leg]of segments){
   // Acid is an arcing ground strike. Contact happens only at landing.
   if(j.row?.type===87)continue;
   const hit=leg?j.hitBack:j.hitOut;for(const t of liveTargets(ctx)){const p=t.world.entity.physics,radius=Number(j.s.skillSize[0])||100;
    if(hit.has(t.world))continue;
    if(segmentCircle(from,to,p,radius))if(hitPlayer(ctx,j.r,t,j.s))hit.add(t.world);
   }
  }
  if(j.row){j.row.x=pos.x;j.row.y=pos.y;j.row.entity.physics.x=pos.x;j.row.entity.physics.y=pos.y;emit(ctx,j.row.entity,'moveTo',{x:pos.x,y:pos.y,direction:1,frequency:1});}
  j.last=pos;j.phase=phase;
  if(done){
   if(j.row)emit(ctx,j.row.entity,'skillBoom',{skillID:j.s.ID,posX:pos.x,posY:pos.y});
   if(j.row?.type===87){hitArea(ctx,j.r,{...j.s,effectSize:[j.s.skillSize[0]],skillRange:2},pos,0,'circle');const a=args(j.s);queue(ctx.env,{kind:'acidPool',r:j.r,s:j.s,row:j.row,pos,start:time,end:time+a.buffTime,next:time+1000,damage:a.buffDam/100});j.row.expiresAt=time+a.buffTime+500;}
   else if(j.row)destroy(ctx,j.row);
   return false;
  }return true;
 }
 if(j.kind==='acidPool'){
  let guard=0;while(j.next<=time&&j.next<=j.end&&guard++<8){for(const t of liveTargets(ctx)){const p=t.world.entity.physics;if(circle(p.x,p.y,j.pos.x,j.pos.y,j.s.skillSize[0]))hitPlayer(ctx,j.r,t,j.s,j.damage);}j.next+=1000;}
  if(time>=j.end){destroy(ctx,j.row);return false;}return true;
 }
 return false;
}
function context(game,env,peers,time,events,event,entityOf,modelFor){return {game,env,peers,time,events,event,entityOf,modelFor,created:[],destroyed:[],privateEvents:[],privatePushes:[],unsupported:[],random:undefined};}
function tick(ctx,time){
 ctx.time=time;
 const rt=runtime(ctx.env),jobs=rt.jobs;rt.jobs=[];
 for(const j of jobs){j.version??=j.r.version;if(tickJob(ctx,j,time))rt.jobs.push(j);}
 for(const r of [...ctx.env.rows.values()]){
  if(r.transient&&(r.dead||time>=r.expiresAt||!ctx.env.rows.has(r.sourceId)||ctx.env.rows.get(r.sourceId).dead||ctx.env.rows.get(r.sourceId).version!==r.sourceVersion)){destroy(ctx,r);continue;}
  if(['mob','boss'].includes(r.kind))expireBuffs(r,time,ctx);
 }
 tickStatuses(ctx,time);rt.lastTime=time;
}
function status(s){if(s.ID===2268)return 'native-hurricane';if(s.ID===2255)return 'native-gas-local-tick-cadence';if(s.ID===2257)return 'PARTIAL_NATIVE_ILLUSION_CLONES';if(s.ID===2297)return 'PARTIAL_NATIVE_FLOWER_LIFETIME';if(SUPPORT.has(s.ID))return 'support-state';if(DASH.has(s.ID))return 'swept-dash';if(s.ID===2050)return 'burrow-emergence';if(ENERGY.has(s.ID))return 'native-energy-projectiles';if(s.ID===2049)return 'native-acid-projectiles-and-pools';if(s.ID===2091)return 'periodic-spin';if(s.ID===2247)return 'temporary-native-summons';if([69,70,119,318,370,601].includes(s.skillType))return s.skillShape===2?'projectile-collision-visual-unverified':'area-damage';return 'NOT_IMPLEMENTED';}
module.exports={SUPPORT,DASH,args,state,runtime,definition,castRange,damageFor,absorbShield,context,start,tick,status,sector,segmentCircle,rectContains,hitArea,hitPlayer,expireBuffs,support,clearStatuses};
