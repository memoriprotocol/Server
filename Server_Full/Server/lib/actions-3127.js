'use strict';
// 2024 protocol-native attack animation and construction, with authoritative
// resource subtraction and persistent room structures. Not a full skill/AI engine.
const motion=require('./motion-3127');
const damageEngine=require('./damage-3127');
const geometry=require('./geometry-3127');
const city=require('./city-3127');
const inventory=require('./inventory');
const {commands}=require('./proto');
const builds=new Map();
for(const row of require('../config/schemes/BuildingScheme.json').Building){if(row.Level===1)builds.set(row.ID,row);}
const weaponById=new Map();for(const w of inventory.weapons){if(!weaponById.has(w.weaponID)||w.level===1)weaponById.set(w.weaponID,w);}
const environment=require('./environment-3127');
const skillsById=new Map();for(const s of require('../config/schemes/SkillScheme.json').Skill){if(!skillsById.has(s.ID)||s.level===1)skillsById.set(s.ID,s);}
function roomStructures(game,state){if(state.world.level==='guide')return state.world.structures||[];return [...game.online].filter(p=>p.world?.room===state.world.room&&!p.world.dead).flatMap(p=>p.world.structures||[]);}
function entityOf(b){return {id:b.id,uid:0,cid:b.buildID,type:b.buildID,ud:JSON.stringify({prefab_path:`arena/building_prefabs/${b.buildID}/1/building`,level:1,state:1,ownerUID:b.ownerId,ownerName:b.ownerName,buildID:b.buildID}),physics:{x:b.x,y:b.y,rotation:0,direction:1},property:{HP:b.hp??1000,maxHP:b.maxHp??1000,level:1,property:{}},buildingInfo:{ownerName:b.ownerName,ownerUID:b.ownerId,startMillis:b.createdAt},camp:{campID:b.ownerId},ownerID:b.ownerId};}
function buildingCollider(b,margin=0){const def=builds.get(b.buildID);return def?geometry.collider(b.x,b.y,def.CollideSize,margin):null;}
function costOf(row){return [[5,row.Wood],[7,row.Stone],[8,row.Iron]].filter(([,n])=>n>0);}
function inventoryAfterCost(before,row){const items=structuredClone(before);for(const [id,amount] of costOf(row)){if(items.filter(i=>i.itemCfgId===id).reduce((s,i)=>s+i.num,0)<amount)throw Error('insufficient-resources');}for(const [id,amount] of costOf(row)){let remaining=amount;for(let i=items.length-1;i>=0&&remaining>0;i--){const it=items[i];if(it.itemCfgId!==id)continue;const taken=Math.min(remaining,it.num);it.num-=taken;remaining-=taken;if(!it.num)items.splice(i,1);}}return items;}
function validateBuild(game,state,cmd){const w=state.world,e=w.entity,def=builds.get(cmd.buildID),map=motion.maps.get(w.mapId);if(!def)return {status:'invalid-building'};if(!map?.CanBuild)return {status:'cannot-build-here'};if(!motion.validPoint(w.mapId,cmd.x,cmd.y))return {status:'out-of-map'};if(city.safePoint(cmd.x,cmd.y,w.level,w.mapId))return {status:'town-safe-zone'};if(city.overlapsStatic(cmd.x,cmd.y,170,w.level,w.mapId))return {status:'town-static-object'};if(Math.hypot(cmd.x-e.physics.x,cmd.y-e.physics.y)>1100)return {status:'out-of-range'};
 const shape=geometry.collider(cmd.x,cmd.y,def.CollideSize);
 if(city.safeOverlapCollider(shape,w.level,w.mapId))return {status:'town-safe-zone'};
 for(const other of roomStructures(game,state)){
  const oldShape=buildingCollider(other);
  if(oldShape&&geometry.overlap(shape,oldShape,10))return {status:'blocked'};
 }
 if(roomStructures(game,state).filter(x=>x.ownerId===state.user.id&&x.buildID===def.ID).length>=Math.max(1,def.UpperCounts?.[0]||100))return {status:'limit'};
 if((e.property.level||1)<(def.UnlockLv||1))return {status:'level-too-low'};
 try{inventoryAfterCost(inventory.inventoryOf(state),def);}catch(e){return {status:e.message};}return {status:'can_build',def,shape};}
function build(game,state,cmd){const check=validateBuild(game,state,cmd);if(cmd.check)return {check:check.status};if(check.status!=='can_build')throw Error(check.status);
 if(Date.now()-(state.world.lastBuildAt||0)<500)throw Error('BUILD_COOLDOWN');
 const world=state.world,owner=world.level==='guide'?world:state.player,before=inventory.inventoryOf(state),after=inventoryAfterCost(before,check.def);
 const structures=roomStructures(game,state),id=game.nextStructureID=Math.max(game.nextStructureID||20000000,...structures.map(b=>b.id))+1;
 const record={id,room:world.room,ownerId:state.user.id,ownerName:state.player.name||state.user.username,buildID:cmd.buildID,x:cmd.x,y:cmd.y,hp:1000,maxHp:1000,createdAt:Date.now()};
 inventory.commit(game,[[owner,'inventory',after],[world,'structures',[...(world.structures||[]),record]]],world.level!=='guide');
 world.entity.item.items=after;world.lastBuildAt=Date.now();return {record,changes:inventory.resultEvents(before,after)};
}
function destroy(game,state,cmd){const world=state.world,owner=world,record=(owner.structures||[]).find(b=>b.id===cmd.buildID&&b.room===world.room);if(!record)throw Error('BUILDING_NOT_OWNED');if(Math.hypot(world.entity.physics.x-record.x,world.entity.physics.y-record.y)>1100)throw Error('BUILDING_TOO_FAR');inventory.commit(game,[[owner,'structures',owner.structures.filter(x=>x!==record)]],false);return record;}
// Client CommandAttack has NO target coordinates. A strike is a fixed-radius arc
// from the current character position and facing, never a moveTo/chase command.
// This is deliberately a conservative combat slice: real buffs, armor, PVP
// settlement, projectiles and drops must be added using this client's schemas.
function resolveTargets(game,state,weapon,def,aimAngle){
 const e=state.world.entity,origin=e.physics,angle=(Number.isFinite(aimAngle)?aimAngle:(state.world.motion?.angle??e.physics2?.angle??0))*Math.PI/180;
 const maxDistance=Math.max(1,Number(def?.skillRange)?Number(def?.effectSize?.[0])||Number(def?.maxDistance)||320:Number(def?.maxDistance)||320);
 // Protected regions disable damage even if experimental PvP was enabled.
 if(city.safePoint(origin.x,origin.y,state.world.level,state.world.mapId))return [];
 const candidates=[];
 // Player-built structures are the first supported destructible targets.
 for(const building of roomStructures(game,state)){
  if(building.ownerId===state.user.id||city.safePoint(building.x,building.y,state.world.level,state.world.mapId))continue;
  candidates.push({kind:'building',id:building.id,x:building.x,y:building.y,record:building});
 }
 for(const r of environment.nearRows(game,state,maxDistance+1000))if(['mob','boss','tree','stone','ore','chest','statue'].includes(r.kind)&&!(r.effectState?.hiddenUntil>Date.now()))candidates.push({kind:'environment',id:r.id,x:r.x,y:r.y,record:r});
 // PVP is disabled by default until the authentic safe-zone polygons and team
 // rules are restored. Opt-in for private controlled combat tests only.
 if(process.env.HEROS_EXPERIMENTAL_PVP==='1' && !['guide','fuben'].includes(state.world.level)){
  for(const other of game.online||[]){
   if(other===state||other.world?.room!==state.world.room||!other.world.sceneReady||!other.world.entity||other.world.entity.property.HP<=1)continue;
   if(city.safePoint(origin.x,origin.y,state.world.level,state.world.mapId)||city.safePoint(other.world.entity.physics.x,other.world.entity.physics.y,other.world.level,other.world.mapId))continue;
   candidates.push({kind:'player',id:other.world.entity.id,x:other.world.entity.physics.x,y:other.world.entity.physics.y,other});
  }
 }
 const found=[];
 for(const target of candidates){
  const dx=target.x-origin.x,dy=target.y-origin.y,distance=Math.hypot(dx,dy);
  const radius=targetRadius(target),forward=dx*Math.cos(angle)+dy*Math.sin(angle),side=Math.abs(-dx*Math.sin(angle)+dy*Math.cos(angle));
  if(distance>maxDistance+radius)continue;
  // Overlapping hitboxes remain hittable even when their centres cross the cursor.
  if(distance>radius+25){
   const shape=Number(def?.skillRange)||1;
   if(shape===1){const width=Number(def?.effectSize?.[1]||def?.skillSize?.[0]||80);if(forward< -radius||forward>maxDistance+radius||side>width/2+radius)continue;}
   else if(shape===3){const diff=Math.abs(Math.atan2(Math.sin(Math.atan2(dy,dx)-angle),Math.cos(Math.atan2(dy,dx)-angle))),arc=(Number(def?.effectSize?.[1])||120)*Math.PI/360;if(diff>arc+Math.asin(Math.min(1,radius/distance)))continue;}
  }
  found.push({...target,distance});
 }
 return found.sort((a,b)=>a.distance-b.distance).slice(0,def?.skillRange?32:1);
}
function targetProperties(r){const cfg=require('../config/schemes/PropLevelsScheme.json').PropLevel.find(c=>c.PropID===r.cid&&c.Level<=r.level&&c.MaxLevel>=r.level)||{};return Object.fromEntries(['PhysicalResistance','FireResistance','PoisonResistance','ThunderResistance','IceResistance','DivineResistance'].map(k=>[k[0].toLowerCase()+k.slice(1),Number(cfg[k])||0]));}
function targetRadius(target){
 const r=target.record;if(!r)return 65;
 const c=require('../config/schemes/MonsterContent.json').MonsterCfg.find(c=>c.CreatureID===r.cid&&c.Level<=r.level&&c.MaxLevel>=r.level);
 const size=c?.HurtCollideSize||[];return Math.max(30,Math.min(600,Math.max(...size.map(Number),60)/2));
}
function damageTargets(game,state,def,targets,options={}){
 const world=state.world,e=options.actor||world.entity;
 const attackProperty={attack:10000,...e.property.property};
 const hits=[];
 for(const target of targets){
  const resource=target.kind==='environment'&&['tree','stone','ore'].includes(target.record.kind);
  const computed=damageEngine.calculate(attackProperty,def||{damaga:0,atkargs:100,canCrit:true},{...(Number.isFinite(options.fixedAmount)?{fixedAmount:options.fixedAmount,fixedType:options.fixedType??damageEngine.TYPE.normal}:{}),allowCrit:!resource,targetProperty:resource?null:target.record?targetProperties(target.record):target.other?.world?.entity?.property?.property,...(options.random?{rng:options.random}:{})});
  const multiplier=options.damageMultiplier??1;if(!Number.isFinite(multiplier)||multiplier<0||multiplier>10)throw Error('INVALID_DAMAGE_MULTIPLIER');
  const heroMultiplier=require('./hero-passives-3127').damageMultiplier(state,def,target,e)*require('./hero-native-passives-3127').outgoing(state,def,e);
  const damage=Math.max(options.minimumDamage??1,Math.floor(computed.amount*multiplier*heroMultiplier*(target.kind==='environment'?require('./relics-3127').outgoing(state,def,target.record):1))+(options.ignoreFlatModifier?0:environment.modifiers(state).damage));
  if(target.kind==='environment'){const result=environment.hit(game,state,target.record,damage,options.aggressor);if(result)hits.push({...result,critical:computed.critical,dmgType:['tree','stone','ore'].includes(result.kind)?damageEngine.TYPE.resCollect:computed.dmgType});
  }else if(target.kind==='building'){
   const b=target.record,holder=[...game.online].map(s=>s.world).find(w=>(w?.structures||[]).includes(b));
   // Do not damage structures if their owner cannot be identified persistently.
   if(!holder)continue;
   const oldHP=Number(b.hp??1000),hp=Math.max(0,oldHP-damage);
   b.hp=hp; if(hp===0)holder.structures=holder.structures.filter(x=>x!==b);
   hits.push({kind:'building',id:b.id,entity:entityOf({...b,hp}),damage:oldHP-hp,hp,maxHP:Number(b.maxHp??1000),dead:hp===0,critical:computed.critical,dmgType:computed.dmgType});
  }else if(target.kind==='player'){
   const victim=target.other.world.entity,oldHP=victim.property.HP;
   // Keep a live avatar until death/respawn is implemented; do not fake drops.
   victim.property.HP=Math.max(1,oldHP-damage);
   hits.push({kind:'player',id:victim.id,entity:victim,damage:oldHP-victim.property.HP,hp:victim.property.HP,maxHP:victim.property.maxHP,dead:false,critical:computed.critical,dmgType:computed.dmgType});
  }
 }
 return hits;
}
function attack(game,state,options={}){
 const world=state.world,e=world.entity;
 const weapon=weaponById.get(e.equip.currentItemID)||weaponById.get(601000);
 const chosenSkill=Number(options.skillId)>0?Number(options.skillId):Number(weapon?.skill)||0;
 const primary=require('./weapon-primary-3127'),base=skillsById.get(chosenSkill),proposal=!options.instant&&primary.plan(state,base),def=proposal?.definition||base,now=Date.now(),haste=proposal?primary.haste(state,base,now):0,cd=Math.max(150,Math.min(3000,Number(base?.cd)||600))/(1+(Math.max(0,Number(e.property.property?.attackSpeed)||0)+haste)/100);
 if(now-(world.lastAttackAt||0)<cd/environment.modifiers(state).attackRate)return {allowed:false,type:'cooldown',hits:[]};
 if(e.property.HP<=0)return {allowed:false,type:'dead',hits:[]};
 if(city.safePoint(e.physics.x,e.physics.y,world.level,world.mapId))return {allowed:false,type:'safe-zone',hits:[]};
 const winter=require('./wintertide-3127'),winterPlan=!options.instant&&winter.plan(state,base);
 if(winterPlan&&!winter.capacity(state))return{allowed:false,type:'ground-capacity',hits:[]};
 const melee=require('./weapon-melee-3127'),meleePlan=!options.instant&&melee.plan(state,base);
 if(meleePlan&&!melee.hasCapacity(state))return{allowed:false,type:'melee-capacity',hits:[]};
 if(proposal&&!primary.hasCapacity(state,proposal))return{allowed:false,type:'projectile-capacity',hits:[]};
 const stamina=proposal?primary.stamina(state,def,now):Math.max(0,require('./monster-skills-3127').argsOf(def||{}).staminaCost||0);if((e.property.strength||0)<stamina)return{allowed:false,type:'stamina',hits:[]};e.property.strength-=stamina;
 // Never mutate motion.x, motion.y, motion.target, or avatar physics here.
 world.lastAttackAt=now;world.attackCount=(world.attackCount||0)+1;
 if(proposal){primary.schedule(state,proposal,now);return{allowed:true,skillID:def.ID,cd,hits:[],propertyChanged:stamina>0,created:[],scheduled:true};}
 if(winterPlan){winter.schedule(state,winterPlan,now);return{allowed:true,skillID:def.ID,cd,hits:[],propertyChanged:stamina>0,created:[],scheduled:true};}
 if(meleePlan){melee.schedule(state,meleePlan,now);return{allowed:true,skillID:def.ID,cd,hits:[],propertyChanged:stamina>0,created:[],scheduled:true};}
 const projectile=!options.instant&&require('./projectiles-3127').launch(game,state,def,options.aimAngle);
 const hits=projectile?[]:damageTargets(game,state,def,resolveTargets(game,state,weapon,def,options.aimAngle),options);

 return {allowed:true,skillID:chosenSkill,cd,hits,propertyChanged:stamina>0,created:projectile||[]};
}
function clearStructures(game,state){
 const w=state.world;if(!w?.structures?.length)return [];
 const ids=w.structures.map(b=>b.id);w.structures=[];
 const {destroyEvent,roomPeers}=require('./world'),{encode}=require('./codec');
 const bytes=encode('ReplicateMsg',{events:[destroyEvent(ids)]});
 for(const peer of roomPeers(game,state))try{game.push(peer,'rm',bytes);}catch(e){console.warn('[BUILD CLEANUP]',e.message);}
 return ids;
}
module.exports={clearStructures,builds,roomStructures,buildingCollider,entityOf,costOf,inventoryAfterCost,validateBuild,build,destroy,attack,resolveTargets,damageTargets,targetRadius,targetProperties};
