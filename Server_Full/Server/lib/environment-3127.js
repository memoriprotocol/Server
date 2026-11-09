'use strict';
const {randomInt,randomUUID}=require('node:crypto');
const city=require('./city-3127'),water=require('./water-3127'),inventory=require('./inventory');
const {encode}=require('./codec'),{proto,commands}=require('./proto');
const creatures=new Map(require('../config/schemes/CreatureScheme.json').Creature.map(r=>[r.ID,r]));
const props=require('../config/schemes/PropLevelsScheme.json').PropLevel;
const monsters=require('../config/schemes/MonsterContent.json').MonsterCfg;
const production=require('../config/schemes/MapProductionScheme.json').MapProduction.filter(r=>r.MapID===2);
const regions=require('../config/map2-spawn-regions-3127.json').areas;
const defaults=require('../config/world-content-3127.json');
const constants=new Map(require('../config/schemes/ConstantsScheme.json').Constants.map(r=>[r.name,r.content]));
const now=()=>Date.now();
const monsterSkills=require('./monster-skills-3127');
const brain=require('./monster-ai-3127');
const effects=require('./monster-effects-3127');
const progression=require('./progression-3127'),notices=require('./boss-notices-3127');
function inside(x,y,points){let hit=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const a=points[i],b=points[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])hit=!hit;}return hit;}
function rng(seed){let v=seed|0;return()=>{v=(Math.imul(v,1664525)+1013904223)|0;return(v>>>0)/4294967296;};}
function sample(parts,random,valid=()=>true){
 const points=parts.flat(),xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);const loX=Math.min(...xs),hiX=Math.max(...xs),loY=Math.min(...ys),hiY=Math.max(...ys);
 for(let i=0;i<1000;i++){const x=loX+random()*(hiX-loX),y=loY+random()*(hiY-loY);if(parts.some(p=>inside(x,y,p))&&valid(x,y))return{x,y};}
 return null;
}
function onLand(x,y){return !city.safePoint(x,y)&&!water.waterAt(x,y)&&!city.overlapsStatic(x,y,100);}
const modelCatalog=require('../config/monster-models-3127.json').models;
function model(cid,level=1){const cfg=monsters.find(m=>m.CreatureID===cid&&m.Level<=level&&m.MaxLevel>=level),form=Number(cfg?.Form)||1;return modelCatalog[cid]?.[form]||defaults.models[cid]||'';}
function templateRows(){
 const out=[],random=rng(312727);let id=60000000;
 for(const r of production){const cfg=creatures.get(r.CreatureID);if(!cfg||cfg.TypeGroup!==4||!regions[r.AreaID])continue;
  const crocodile=r.CreatureID===1226,kind=defaults.bossIds.includes(r.CreatureID)?'boss':'mob';
  const pos=sample(regions[r.AreaID],random,(x,y)=>!city.safePoint(x,y)&&(crocodile?!!water.waterAt(x,y):onLand(x,y)));
  if(pos)out.push({id:++id,cid:r.CreatureID,type:cfg.Typ,kind,...pos,level:r.Level,respawnMs:Math.max(10000,r.RefreshInterval*1000||60000),prefab:kind==='boss'?(defaults.models[r.CreatureID]||model(r.CreatureID,r.Level)):model(r.CreatureID,r.Level),areaId:r.AreaID});
 }
 // Static resource placements are local, reproducible and editable. Native
 // MapProduction defines mob regions; it does not contain the missing scene
 // placement export for trees/minerals/wells/statues.
 for(const [kind,config]of Object.entries(defaults.static))for(let i=0;i<config.count;i++){
  let pos=null;for(let n=0;n<1000;n++){const x=(random()*2-1)*24500,y=(random()*2-1)*25500;if(onLand(x,y)){pos={x,y};break;}}
  if(pos)out.push({id:++id,cid:config.cid,type:config.type,kind,...pos,level:1,respawnMs:config.respawnMs,prefab:config.prefab,rewardItem:config.rewardItem||0});
 }
 return out;
}
const templates=templateRows();
require('./placement-3127').relocate(templates,rng(3903127));
require('./placement-3127').arrangeStatues(templates);
const chestProduction=production.filter(r=>[10012,10032].includes(r.CreatureID));
function chestPosition(row){return require('./placement-3127').sampleProduction(row,()=>randomInt(1000000)/1000000,(x,y)=>!city.safePoint(x,y)&&!city.overlapsStatic(x,y,100)&&(row.CreatureID===10032?!!water.waterAt(x,y):!water.waterAt(x,y)));}
for(const row of chestProduction)for(let i=0;i<row.Num;i++){const pos=chestPosition(row);if(!pos)throw Error('NO_CHEST_PRODUCTION_POSITION '+row.AreaID);templates.push({id:62000000+templates.filter(r=>r.kind==='chest').length,cid:row.CreatureID,type:creatures.get(row.CreatureID).Typ,kind:'chest',...pos,level:row.Level,respawnMs:Math.max(1000,row.RefreshInterval*1000),prefab:row.CreatureID===10032?'arena_3d/scene_item/10032/drop_box':'arena_3d/scene_item_new/10012/main',areaId:row.AreaID,production:row});}

function entity(r){
 const cfg=props.find(p=>p.PropID===r.cid&&p.Level<=r.level&&p.MaxLevel>=r.level)||props.find(p=>p.PropID===r.cid)||{};
 const hp=['mob','boss','chest'].includes(r.kind)?Math.max(r.transient?1:50,Number(cfg.HP)||500):(r.kind==='statue'?5:r.kind==='tree'?100:r.kind==='stone'||r.kind==='ore'?160:1);
 r.hp=hp;r.maxHP=hp;r.speed=Number.isFinite(cfg.Speed)?cfg.Speed:240;r.lastAttack=0;r.skillRuntime=null;r.effectState=null;r.brain=null;r.playerStatuses=null;r.displacement=null;r.spawnToken=randomUUID();r.deathLootPlan=null;r.leashRecovery=null;r.recoveryCorrections=null;r.relicCombatStartedAt=null;r.relicDeathRolls=null;
 const ordinaryMob=r.kind==='mob';
 return {id:r.id,uid:0,cid:r.cid,type:r.type,ownerID:0,
  ud:JSON.stringify({...(r.prefab?{prefab_path:r.prefab}:{}),unbreakable:['well','statue'].includes(r.kind),level:r.level,id:0,...(r.kind==='statue'?{isCoolDown:!(r.cooldownUntil>now())}:{})}),
  physics:{x:r.x,y:r.y,rotation:0,direction:1},physics2:{angle:0},
  property:{HP:hp,maxHP:hp,level:r.level,strength:100,maxStrength:100,property:{speed:r.speed,attack:Number(cfg.Attack)||100}},
  camp:{campID:0},monster:{isSleeping:false,active:['mob','boss'].includes(r.kind),type:'',stateType:0},buffer:{buffs:r.cid===1226&&water.waterAt(r.x,r.y)?[{type:181,group:0,duration:-1,startTime:Math.floor(now()/1000),endTime:0,stackNum:1,maxStackNum:1,isValid:1}]:[]},
  ...(ordinaryMob?{pet:{pets:[]},tame:{masterID:0,canTame:false,ownerName:''},miscInfo:{name:creatures.get(r.cid)?.Name||'',life:1}}:{}),
  ...(r.kind==='well'?{wellState:{state:0}}:{}),...(r.kind==='statue'?{streetLightState:{state:0}}:{})};
}
function room(game,roomId){
 game.environments ||=new Map();if(!game.environments.has(roomId)){
  const rows=new Map();for(const t of templates){const r={...t,room:roomId,homeX:t.x,homeY:t.y,dead:false,version:1,cooldownUntil:0};r.entity=entity(r);rows.set(r.id,r);}
  game.environments.set(roomId,{rows,lastTick:0});
 }return game.environments.get(roomId);
}
function records(game,state){const w=state.world;if(!w||w.level==='guide')return [];if(w.mapId===2)return [...room(game,w.room).rows.values()];return [...(game.environments?.get(w.room)?.rows.values()||[])];}
function acknowledge(game,state,events){
 const w=state.world,env=game.environments?.get(w?.room);if(!env)return;
 const {systemEvent}=require('./proto'),enums=require('../CLIENT_ENUMS_3127.json');w.environmentSeen||=new Map();
 for(const e of events){if(e.entityID!==-1||e.systemType!==enums.SystemType.entity)continue;
  if(e.eventType===enums.SystemEvent.entityCreated)for(const x of systemEvent.entityCreated.decode(e.data).entities){const r=env.rows.get(x.id);if(r&&!r.dead)w.environmentSeen.set(r.id,r.version);}
  if(e.eventType===enums.SystemEvent.entityDestroyed)for(const x of systemEvent.entityDestroyed.decode(e.data).entities)w.environmentSeen.delete(x.id);
 }
}
function broadcast(game,state,events){const {roomPeers}=require('./world');for(const p of roomPeers(game,state))game.push(p,'rm',encode('ReplicateMsg',{events}));}
function nearRows(game,state,radius=4800){const p=state.world.entity.physics;return records(game,state).filter(r=>!r.dead&&Math.hypot(r.x-p.x,r.y-p.y)<=radius);}
function initialMobs(game,state,radius=Infinity,limit=Infinity){
 if(!state.world||state.world.level==='guide')return [];
 const p=state.world.entity.physics, visible=records(game,state).filter(r=>!r.dead&&r.kind==='mob'&&Math.hypot(r.x-p.x,r.y-p.y)<=radius);
 visible.sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y));
 state.world.environmentSeen||=new Map();
 const selected=visible.slice(0,limit);for(const r of selected)state.world.environmentSeen.set(r.id,r.version);
 return selected.map(r=>r.entity);
}
function syncView(game,state){
 const w=state.world;if(w.level==='guide'||(!w.loadingFinished&&!w.cityLoadingFallbackLogged))return;
 w.environmentSeen ||=new Map();const nextSeen=new Map(w.environmentSeen);const current=new Map(nearRows(game,state).map(r=>[r.id,r]));const events=[],fresh=[];
 const {spawnEvent,destroyEvent}=require('./world');
 const gone=[...nextSeen.keys()].filter(id=>!current.has(id)||nextSeen.get(id)!==current.get(id).version);
 if(gone.length){events.push(destroyEvent(gone));for(const id of gone)nextSeen.delete(id);}
 // Prioritize nearest visible monsters rather than insertion order in MapProduction.
 // Keep each batch bounded: old 2024 clients are sensitive to mass entityCreated.
 const pending=[...current.values()].filter(r=>!nextSeen.has(r.id));
 pending.sort((a,b)=>Math.hypot(a.x-w.entity.physics.x,a.y-w.entity.physics.y)-Math.hypot(b.x-w.entity.physics.x,b.y-w.entity.physics.y));
 for(const r of pending.slice(0,6)){fresh.push(r.entity);nextSeen.set(r.id,r.version);}
 if(fresh.length){events.push(spawnEvent(fresh));for(const e of fresh){const r=current.get(e.id);if(r.kind==='mummyScarab'&&r.mummy?.phase==='exploding')events.push(require('./world').entityEventData(e,'scarabBomb',{}));if(r.effectState?.hiddenUntil>now())events.push(require('./world').entityEventData(e,'skillCast',{skillID:2257,angle:e.physics2?.angle||0,posX:r.x,posY:r.y}));}for(const e of fresh)if(e.cid===1226)water.waterEvents(e,true,events,require('./world').entityEventData);

 }
 if(events.length){try{game.push(state,'rm',encode('ReplicateMsg',{events}));}catch(error){w.environmentSendFailures=(w.environmentSendFailures||0)+1;return false;}w.environmentSeen=nextSeen;
  w.environmentSentCount ||= {mob:0,boss:0,tree:0,stone:0,ore:0,well:0,statue:0};
  for(const r of pending.slice(0,6))w.environmentSentCount[r.kind]=(w.environmentSentCount[r.kind]||0)+1;
  if(process.env.HEROS_ENV_VERBOSE==='1')console.info(`[ENV SEND] uid=${state.user?.id||0} near=${current.size} sent=${fresh.length} mob=${pending.slice(0,6).filter(r=>r.kind==='mob').length} boss=${pending.slice(0,6).filter(r=>r.kind==='boss').length} awaiting=${Math.max(0,pending.length-6)}`);
 }return true;
}
function reward(game,state,itemId,count){
 const before=inventory.inventoryOf(state),q=require('./quests-3127').planRecords(state,[{type:8,data:{itemID:itemId,count}}]),changes=[...q.changes];let after=before;
 if(itemId===109){const coin=Number(state.player.coin)||0;if(coin+count>2147483647)throw Error('CURRENCY_OVERFLOW');changes.push([state.player,'coin',coin+count]);}
 else{after=require('./commerce-3127').afterGrant(before,itemId,count);changes.push([state.player,'inventory',after]);}
 inventory.commit(game,changes,true);state.world.entity.item.items=after;
 return{deliver(){if(itemId===109)game.push(state,'updateCoin',encode('CoinUpdatePush',{coin:state.player.coin}));require('./world').inventoryPush(game,state,{privateEvents:inventory.resultEvents(before,after),publicEvents:[],created:[],destroyed:[]});if(q.events.length)require('./world').replicate(game,state,q.events);}};
}

function hitStatue(game,state,r,damage){
 if(!Number.isFinite(damage)||damage<0)throw Error('INVALID_DAMAGE');if(damage===0)return null;const old=r.hp;r.hp=Math.max(0,old-1);r.entity.property.HP=r.hp;
 if(!r.hp){r.depleted=true;r.cooldownUntil=now()+Number(constants.get('stoneStatueCD')?.[0]||60000);const choices=defaults.statueBuffs;let roll=randomInt(choices.reduce((n,x)=>n+x.weight,0));const choice=choices.find(x=>(roll-=x.weight)<0),until=now()+choice.duration;state.world.environmentBuffs||=new Map();state.world.environmentBuffs.set(choice.id,{...choice,until,nextHealAt:now()+1000});const e=state.world.entity,buff={type:choice.id,group:0,duration:choice.duration,startTime:now(),endTime:until,stackNum:1,maxStackNum:1,isValid:1,propValue:choice.value};e.buffer||={};e.buffer.buffs=(e.buffer.buffs||[]).filter(b=>b.type!==choice.id);e.buffer.buffs.push(buff);broadcast(game,state,[require('./world').entityEventData(e,'buffAdd',buff)]);}
 return{kind:'statue',id:r.id,entity:r.entity,damage:old-r.hp,hp:r.hp,maxHP:r.maxHP,dead:false,depleted:!!r.depleted,noBuff:true};
}
function hit(game,state,r,damage,aggressor=null){
 if(r.dead||r.depleted||r.effectState?.hiddenUntil>now()||['well','effect'].includes(r.kind))return null;
 if(r.kind==='statue')return hitStatue(game,state,r,damage);
 if(!Number.isFinite(damage)||damage<0)throw Error('INVALID_DAMAGE');
 if(damage>0&&['mob','boss'].includes(r.kind)&&r.relicCombatStartedAt==null)r.relicCombatStartedAt=now();
 if(damage>0&&['mob','boss'].includes(r.kind))brain.provoke(r,aggressor||state);
 const old=r.hp,oldShield=r.entity.property.shield||0,oldEffectShield=r.effectState?.shield?{...r.effectState.shield}:null;
 const absorption=effects.absorbShield(r,damage);r.hp=Math.max(0,old-absorption.amount);r.entity.property.HP=r.hp;
 let grant=null;
 if(r.hp===0){
  try{
   if(['mob','boss','chest'].includes(r.kind))grant=progression.awardKill(game,state,r);
   else grant=reward(game,state,r.rewardItem,Math.round(20*(1+(state.world.environmentBuffs?.get(78)?.value||0)/10000+require('./food-effects-3127').gather(state)/10000)));
  }catch(e){r.hp=old;r.entity.property.HP=old;r.entity.property.shield=oldShield;if(r.effectState)r.effectState.shield=oldEffectShield;throw e;}

  r.dead=true;r.respawnAt=r.summoned||r.noRespawn?0:now()+r.respawnMs;r.version++;
  if(grant?.chests?.length){const env=room(game,state.world.room);for(const chest of grant.chests)env.rows.set(chest.id,chest);}
  try{grant?.deliver?.();}catch(e){console.warn('[REWARD PUSH] committed; delivery failed:',e.message);}
  if(r.kind==='boss')try{notices.killed(game,state,r);}catch(e){console.warn('[BOSS NOTICE]',e.message);}
 }
 const removedBuffs=old>r.hp?require('./player-skills-3127').wakeOnDamage(r):[];
 return{removedBuffs,kind:r.kind,id:r.id,entity:r.entity,damage:old-r.hp,hp:r.hp,maxHP:r.maxHP,dead:r.dead,shieldChange:absorption.absorbed?-absorption.absorbed:0,currentShield:absorption.currentShield,rewards:grant};
}
function nearestTarget(game,state,range,angle){
 const p=state.world.entity.physics,a=angle*Math.PI/180;
 return nearRows(game,state,range+300).filter(r=>['mob','boss','tree','stone','ore','chest','statue'].includes(r.kind)&&!(r.effectState?.hiddenUntil>now())).map(r=>({r,d:Math.hypot(r.x-p.x,r.y-p.y)})).filter(({r,d})=>d<=range&&Math.abs(Math.atan2(Math.sin(Math.atan2(r.y-p.y,r.x-p.x)-a),Math.cos(Math.atan2(r.y-p.y,r.x-p.x)-a)))<=Math.PI/3).sort((a,b)=>a.d-b.d)[0]?.r;
}
function interact(game,state,name,raw,events,event){
 if(name==='enterCollectMode'){const c=commands.CommandEnterCollectMode.decode(raw);state.world.collectMode=!!c.force||!state.world.collectMode;return true;}
 if(!['drinkWater','swordGodStatue'].includes(name))return false;
 const c=commands[name==='drinkWater'?'CommandDrinkWater':'CommandSwordGodStatue'].decode(raw);const id=Number(c.wellID||c.StatueID),r=room(game,state.world.room).rows.get(id);
 if(!r||r.dead||r.kind!==(name==='drinkWater'?'well':'statue'))throw Error('INVALID_WORLD_OBJECT');
 if(Math.hypot(r.x-state.world.entity.physics.x,r.y-state.world.entity.physics.y)>420)throw Error('OBJECT_TOO_FAR');
 if(r.kind==='statue')throw Error('ATTACK_BUFF_PILLAR');
 if(r.cooldownUntil>now())throw Error('OBJECT_COOLDOWN');
 if(name==='drinkWater'){
  r.cooldownUntil=now()+Number(constants.get('wellHealCD')?.[0]||60000);r.entity.wellState.state=1;
  const e=state.world.entity,healed=Math.min(e.property.maxHP-e.property.HP,Math.round(e.property.maxHP*Number(constants.get('wellHealRatio')?.[0]||0.5)));e.property.HP+=healed;
  events.push(event(r.entity,'updateWellState',{state:1}));events.push(event(e,'addHP',{changeHP:healed,currentHP:e.property.HP,maxHP:e.property.maxHP}));
 }else{
  r.cooldownUntil=now()+Number(constants.get('stoneStatueCD')?.[0]||60000);
  r.entity.ud=JSON.stringify({...JSON.parse(r.entity.ud),isCoolDown:false});events.push(event(r.entity,'updateUserdata',{ud:r.entity.ud}));
  const choices=defaults.statueBuffs;let roll=randomInt(choices.reduce((n,x)=>n+x.weight,0));const choice=choices.find(x=>(roll-=x.weight)<0),e=state.world.entity,until=now()+choice.duration;
  state.world.environmentBuffs ||=new Map();state.world.environmentBuffs.set(choice.id,{...choice,until,nextHealAt:now()+1000});
  events.push(event(e,'buffAdd',{type:choice.id,group:0,duration:choice.duration,startTime:now(),endTime:until,stackNum:1,maxStackNum:1,isValid:1,propValue:choice.value}));
 }
 return true;
}

function flushEffects(game,ctx){
 const {spawnEvent,destroyEvent}=require('./world'),players=new Set(ctx.peers.map(p=>p.world.entity.id));
 for(const p of ctx.peers){
  p.world.environmentSeen||=new Map();const seen=p.world.environmentSeen,at=p.world.entity.physics;
  const created=ctx.created.filter(r=>ctx.env.rows.has(r.id)&&!seen.has(r.id)&&Math.hypot(r.x-at.x,r.y-at.y)<=4800);
  for(let i=0;i<created.length;i+=6){const batch=created.slice(i,i+6);try{game.push(p,'rm',encode('ReplicateMsg',{events:[spawnEvent(batch.map(r=>r.entity))]}));for(const r of batch)seen.set(r.id,r.version);}catch(error){p.world.environmentSendFailures=(p.world.environmentSendFailures||0)+1;}}
  const events=ctx.events.filter(e=>players.has(e.entityID)||seen.has(e.entityID));
  const destroyed=ctx.destroyed.filter(id=>seen.has(id));if(destroyed.length){events.push(destroyEvent(destroyed));}
  if(events.length)try{game.push(p,'rm',encode('ReplicateMsg',{events}));for(const id of destroyed)seen.delete(id);}catch(error){p.world.environmentSendFailures=(p.world.environmentSendFailures||0)+1;}
  for(const item of ctx.privateEvents||[])if(item.state===p)game.push(p,'rm',encode('ReplicateMsg',{events:item.events}));
  for(const item of ctx.privatePushes||[])if(item.state===p)game.push(p,item.route,item.body);
 }
}
function tick(game,dt){
 const {entityEventData:event,destroyEvent}=require('./world');const time=now();
 for(const [key,env]of game.environments||[]){
  const peers=[...game.online].filter(s=>s.world?.room===key&&s.world.sceneReady&&s.world.loadingFinished);if(!peers.length){for(const r of env.rows.values())require('./monster-recovery-3127').pause(r,time);for(const r of env.rows.values())if(r.displacement)require('./displacement-3127').remove(r,[],event);if(env.effectRuntime){env.effectRuntime.jobs=[];for(const r of env.rows.values()){if(r.transient)env.rows.delete(r.id);if(r.effectState?.hiddenUntil){r.effectState.hiddenUntil=0;r.skillRuntime=null;}}}continue;}
  require('./displacement-3127').tick(game,env,peers,time,event);
  if(time-env.lastTick<250)continue;const delta=Math.min(0.5,(time-env.lastTick)/1000||0.25);env.lastTick=time;
  const fx=effects.context(game,env,peers,time,[],event,entity,model);effects.tick(fx,time);
  for(const r of env.rows.values()){
   require('./monster-recovery-3127').flush(game,r,peers,event);
   if(r.dead){if(!r.noRespawn)notices.respawnSoon(game,key,r,time);if(!r.summoned&&!r.noRespawn&&time>=r.respawnAt){r.dead=false;if(r.kind==='chest'){const pos=chestPosition(r.production);if(pos){r.homeX=pos.x;r.homeY=pos.y;}}r.x=r.homeX;r.y=r.homeY;r.entity=entity(r);r.version++;notices.respawn(game,key,r);}continue;}
   if(r.kind==='statue'&&r.depleted&&time>=r.cooldownUntil){r.depleted=false;r.cooldownUntil=0;r.hp=r.maxHP;r.entity.property.HP=r.hp;for(const p of peers)if(p.world.environmentSeen?.has(r.id))game.push(p,'rm',encode('ReplicateMsg',{events:[event(r.entity,'setHP',{currentHP:r.hp,maxHP:r.maxHP}),event(r.entity,'relive',{})]}));}
   if(r.kind==='well'&&r.cooldownUntil&&time>=r.cooldownUntil){r.cooldownUntil=0;r.entity.wellState.state=0;for(const p of peers)if(p.world.environmentSeen?.has(r.id))game.push(p,'rm',encode('ReplicateMsg',{events:[event(r.entity,'updateWellState',{state:0})]}));}
   if(r.kind==='statue'&&r.cooldownUntil&&time>=r.cooldownUntil){r.cooldownUntil=0;r.entity.ud=JSON.stringify({...JSON.parse(r.entity.ud),isCoolDown:true});for(const p of peers)if(p.world.environmentSeen?.has(r.id))game.push(p,'rm',encode('ReplicateMsg',{events:[event(r.entity,'updateUserdata',{ud:r.entity.ud})]}));}
   if(!['mob','boss'].includes(r.kind))continue;
   const skillEvents=[],status=require('./player-skills-3127').tickMonster(game,r,time,skillEvents,event);
   if(r.dead){if(skillEvents.length)for(const peer of peers)if(peer.world.environmentSeen?.has(r.id))game.push(peer,'rm',encode('ReplicateMsg',{events:skillEvents}));continue;}
   if(r.displacement){monsterSkills.cancel(r,skillEvents,event);if(skillEvents.length)for(const peer of peers)if(peer.world.environmentSeen?.has(r.id))game.push(peer,'rm',encode('ReplicateMsg',{events:skillEvents}));continue;}
   const targets=[...peers,...require('./hero-summons-3127').targets(game,key)],decision=brain.decide(r,targets,time),target=decision.target;
   if(status.controlled||decision.state===brain.STATE.fastback||decision.reset)monsterSkills.cancel(r,skillEvents,event);
   if((r.mapId||2)===2){const recovery=require('./monster-recovery-3127'),gain=recovery.update(r,decision,time);recovery.publish(game,r,peers,gain,event);}
   else if(decision.reset){r.hp=r.maxHP;r.entity.property.HP=r.hp;skillEvents.push(event(r.entity,'setHP',{currentHP:r.hp,maxHP:r.maxHP}));}
   const progressed=status.controlled||decision.state===brain.STATE.fastback||decision.reset?{busy:false}:monsterSkills.advance(r,targets,time,skillEvents,event,(x,y)=>city.safePoint(x,y,'main',r.mapId||2),(actor,cast,at)=>effects.start(fx,actor,cast,at));
   if(!status.controlled&&!progressed.busy&&target)monsterSkills.begin(r,target,time,skillEvents,event);
   if(!r.skillRuntime?.pending)monsterSkills.setState(r,decision.state,skillEvents,event);
   if(!status.controlled&&!status.rooted&&!r.stationary&&!(r.effectState?.hiddenUntil>time)&&!r.skillRuntime?.pending&&!progressed.impact){
    const move=brain.step(r,decision.destination,delta*status.speed,decision.state===brain.STATE.fastback);
    if(move){r.x=move.x;r.y=move.y;r.entity.physics.x=r.x;r.entity.physics.y=r.y;r.entity.physics2.angle=move.angle;skillEvents.push(event(r.entity,'moveTo',{x:r.x,y:r.y,direction:1,frequency:1}),event(r.entity,'rotateTo',{angle:move.angle,rotation:move.angle}));}
   }
   for(const peer of peers)if(peer.world.environmentSeen?.has(r.id)&&skillEvents.length)game.push(peer,'rm',encode('ReplicateMsg',{events:skillEvents}));
  }
  flushEffects(game,fx);
  for(const p of peers){
   if(p.world.dead||p.world.entity.property.HP<=0)continue;
   for(const [id,b]of p.world.environmentBuffs||[]){if(id===16&&time<b.until&&time>=(b.nextHealAt||(b.nextHealAt=time+1000))){b.nextHealAt=time+1000;const hp=p.world.entity.property,amount=Math.min(hp.maxHP-hp.HP,b.value);if(amount>0){hp.HP+=amount;game.push(p,'rm',encode('ReplicateMsg',{events:[event(p.world.entity,'addHP',{changeHP:amount,currentHP:hp.HP,maxHP:hp.maxHP})]}));}}if(time>=b.until){p.world.environmentBuffs.delete(id);p.world.entity.buffer.buffs=(p.world.entity.buffer.buffs||[]).filter(b=>b.type!==id);game.push(p,'rm',encode('ReplicateMsg',{events:[event(p.world.entity,'buffRemove',{type:id})]}));}}
   syncView(game,p);
  }
 }
}
function modifiers(state){const buffs=state.world?.environmentBuffs;return {speed:buffs?.get(152)?.value||0,damage:0,attackRate:1};}
module.exports={acknowledge,modifiers,templates,room,records,entity,nearRows,nearestTarget,hit,interact,tick,flushEffects,syncView,initialMobs,onLand,inside};
