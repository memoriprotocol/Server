'use strict';
// Native 3.12.7 collection and entity contracts. AI/timing inferences are
// recorded in retail/audits/STAGE50_PETS.json, not presented as retail parity.
const inventory=require('./inventory'),{commands}=require('./proto');
const cfgs=require('../config/schemes/PetContent.json').PetCfg,byId=new Map(cfgs.map(c=>[c.PetID,c]));
const creatures=new Map(require('../config/schemes/CreatureScheme.json').Creature.map(c=>[c.ID,c]));
const props=require('../config/schemes/PropLevelsScheme.json').PropLevel,models=require('../config/schemes/MonsterContent.json').MonsterCfg,skills=require('../config/schemes/SkillScheme.json').Skill;
const constants=new Map(require('../config/schemes/ConstantsScheme.json').Constants.map(c=>[c.name,c.content]));
const city=require('./city-3127'),water=require('./water-3127'),petActions=require('./pet-actions-3127');
const value=(k,d)=>Number(constants.get(k)?.[0]??d),mods=p=>require('./talents-3127').modifiers(p),event=(...a)=>require('./world').entityEventData(...a);
const SUPPORT=new Set([2236,2235,2238,2232]),MELEE=new Set([70,213,318,334,370,564]),pactImplemented=new Set([2292,2348,2362,2975]);
function record(p,cid){return (p.pets||[]).find(r=>r.petId===cid);}
function star(p,cid){return require('./collection-3127').petStars(cid,record(p,cid)?.affection||0).lv;}
function runtime(s){return s.world.petActors||=new Map();}
function rows(s){return s?.world?[...runtime(s).values()].filter(r=>!r.dead):[];}
function maxLife(s){return value('petInitLife',3)+(mods(s.player)[23]||0);}
function life(s,cid){return Math.max(0,maxLife(s)-(s.world.petDeaths?.[cid]||0));}
function cooldown(s,cid,time=Date.now()){return Math.max(0,(record(s.player,cid)?.dieTime||0)+value('petDeadCD',3)*1000*(1-(mods(s.player)[25]||0)/100)-time);}
function stats(p,cid){
 const level=Math.min(104,Math.max(1,record(p,cid)?.level||1)+(mods(p)[26]||0)),n=Math.max(1,star(p,cid)),row=props.find(r=>r.PropID===cid&&r.Star===n&&r.Level<=level&&r.MaxLevel>=level);
 if(!row)throw Error('PET_STATS_MISSING');const m=mods(p),d=level-row.Level,hp=Math.floor((row.HP+d*row.HpGrowth)*(1+(m[27]||0)/100)),property={};
 for(const k of ['Crit','CritHarm','Defence','PhysicalResistance','FireResistance','PoisonResistance','ThunderResistance','IceResistance','DivineResistance'])property[k[0].toLowerCase()+k.slice(1)]=row[k]||0;
 property.attack=Math.floor((row.Attack+d*row.AtkGrowth)*(1+(m[30]||0)/100));property.speed=Math.floor((row.Speed+d*row.SpeedGrowth)*(1+(m[45]||0)/100));
 return {HP:hp,maxHP:hp,level,star:n,property};
}
function model(cid,level){const m=models.find(r=>r.CreatureID===cid&&r.Level<=level&&r.MaxLevel>=level);if(!m)throw Error('PET_MODEL_FORM_MISSING');return `arena_3d/monsters/monster_${cid}/${['','c','b','a'][m.Form]}/monster`;}
function snapshot(s){return cfgs.filter(c=>record(s.player,c.PetID)).map(c=>{const rec=record(s.player,c.PetID),r=rows(s).find(r=>r.cid===c.PetID),p=stats(s.player,c.PetID);p.HP=r?r.hp:Math.min(p.maxHP,s.world.petStoredHP?.[c.PetID]??p.maxHP);return {id:r&&!r.mounted?r.id:0,cid:c.PetID,property:p,affection:rec.affection||0,lastDeadTime:rec.dieTime||0,life:life(s,c.PetID),maxLife:maxLife(s),isFighting:!!r,dbDieTime:rec.dieTime||0,dbDieCount:rec.dieCount||0};});}
function mountedSnapshot(s){return rows(s).filter(r=>r.mounted).map(r=>({cid:r.cid,level:r.level,life:life(s,r.cid),maxLife:maxLife(s),hpPercent:r.hp/r.maxHP}));}
function syncMounted(s){s.world.entity.pet={pets:mountedSnapshot(s)};}
function panel(s,events){events.push(event(s.world.entity,'allPets',{pets:snapshot(s)}));}
function deliver(game,s,events){if(!events.length)return;for(const peer of require('./world').roomPeers(game,s))try{require('./world').replicate(game,peer,events);}catch{peer.world.environmentSendFailures=(peer.world.environmentSendFailures||0)+1;}}
function sendPanel(game,s){const ev=[];panel(s,ev);try{require('./world').replicate(game,s,ev);s.world.petRefreshPending=false;}catch{s.world.petRefreshPending=true;}}
function applyCompanionBuffs(r){r.entity.property.property={...r.baseStats};for(const b of r.supportBuffs.values())r.entity.property.property[b.field]+=b.value;}
function refresh(game,s){
 if(!s.world?.sceneReady)return;const events=[];let pactChanged=false;
 for(const r of rows(s)){const p=stats(s.player,r.cid),old=r.level,oldStar=r.star;if(old===p.level&&r.star===star(s.player,r.cid)&&p.maxHP===r.maxHP&&JSON.stringify(p.property)===JSON.stringify(r.baseStats))continue;
  p.HP=Math.min(p.maxHP,r.hp+Math.max(0,p.maxHP-r.maxHP));r.hp=p.HP;r.maxHP=p.maxHP;r.level=p.level;r.star=star(s.player,r.cid);r.speed=p.property.speed;r.baseStats={...p.property};if(r.entity.property.shield)p.shield=r.entity.property.shield;r.entity.property=p;applyCompanionBuffs(r);
  const ud=JSON.parse(r.entity.ud),path=model(r.cid,r.level);if(ud.prefab_path!==path){r.version++;r.entity.ud=JSON.stringify({...ud,prefab_path:path,level:r.level});}
  if(!r.mounted){events.push(event(r.entity,'propertyResult',{propRes:p}));if(oldStar!==r.star)events.push(event(r.entity,'petUpgradeStar',{originStar:oldStar,currentStar:r.star,cid:r.cid}));if(old!==p.level)events.push(event(r.entity,'upgradeLevel',{originLevel:old,currentLevel:p.level,cid:r.cid}));}else if(old!==p.level){for(const isMounted of [false,true])events.push(event(s.world.entity,'toggleMountState',{petID:r.cid,isMounted,entityId:0,level:r.level,x:r.x,y:r.y}));}pactChanged||=r.mounted;
 }
 syncMounted(s);if(pactChanged)require('./talents-3127').refresh(game,s);deliver(game,s,events);sendPanel(game,s);
}
function valid(s){const w=s.world;if(!w?.sceneReady||w.dead||w.entity.property.HP<=0)throw Error('PLAYER_DEAD');if(w.mapId!==2)throw Error('PET_MAP_NOT_RESTORED');}
function plan(s,cid,game){
 valid(s);if(!byId.has(cid)||!record(s.player,cid)||!star(s.player,cid))throw Error('PET_LOCKED');if(rows(s).some(r=>r.cid===cid))throw Error('PET_ALREADY_IN_BATTLE');if(rows(s).length>=value('maxTameNum',3))throw Error('MAX_BATTLE_PETS');if(!life(s,cid))throw Error('PET_NO_LIFE');if(cooldown(s,cid))throw Error('PET_SUMMON_COOLDOWN');
 const w=s.world,at=w.entity.physics;if(w.inWater||water.waterAt(at.x,at.y,w.mapId))throw Error('PET_CANNOT_SUMMON_IN_WATER');let pos;
 for(const radius of [160,240,80,0]){const x=at.x+radius,y=at.y;if(!require('./motion-3127').validPoint(w.mapId,x,y)||city.overlapsStatic(x,y,40,w.level,w.mapId)||!water.canMove(cid,at.x,at.y,x,y,w.mapId)||require('./geometry-3127').firstCollision(at.x,at.y,x,y,city.collidersFor(w.level,w.mapId))!==null)continue;pos={x,y};break;}
 if(!pos)throw Error('PET_POSITION_BLOCKED');const p=stats(s.player,cid),id=game.nextBattlePetID=Math.max(game.nextBattlePetID||880000000,880000000)+1;p.HP=Math.min(p.maxHP,w.petStoredHP?.[cid]??p.maxHP);
 const e={id,cid,type:101,uid:0,ownerID:w.entity.id,ud:JSON.stringify({prefab_path:model(cid,p.level),level:p.level}),physics:{...pos,rotation:0,direction:1},physics2:{angle:0},property:p,camp:{campID:w.entity.camp.campID},monster:{isSleeping:false,active:true,stateType:1},tame:{masterID:w.entity.id,canTame:false,ownerName:s.player.name||s.user.username},miscInfo:{name:byId.get(cid).Name,life:1},pet:{pets:[]},buffer:{buffs:[]},skill:{}};
 const r={id,cid,type:101,kind:'battlePet',owner:s,room:w.room,mapId:w.mapId,entity:e,level:p.level,star:star(s.player,cid),hp:p.HP,maxHP:p.maxHP,speed:p.property.speed,baseStats:{...p.property},supportBuffs:new Map(),x:pos.x,y:pos.y,homeX:pos.x,homeY:pos.y,dead:false,mounted:false,mode:0,version:1,ready:new Map(),cast:null,lastCombatAt:0};
 r.view={battlePet:r,user:{id},world:{level:w.level,mapId:w.mapId,room:w.room,entity:e,sceneReady:true,loadingFinished:true,environmentSeen:w.environmentSeen}};return r;
}
function add(game,s,r,events){runtime(s).set(r.cid,r);require('./environment-3127').room(game,r.room).rows.set(r.id,r);events.push(require('./world').spawnEvent([r.entity]),event(s.world.entity,'summonPet',{petID:r.id,petCID:r.cid,petLevel:r.level}));}
function clearShots(game,s,r,events){s.world.projectiles=(s.world.projectiles||[]).filter(shot=>{if(shot.sourceRecord!==r)return true;require('./projectiles-3127').unregister(game,shot);events.push(require('./world').destroyEvent([shot.entity.id]));return false;});}
function remove(game,s,r,events,death=false){
 petActions.cancel(r,events,event);r.dead=true;r.cast=null;r.view.world.dead=true;runtime(s).delete(r.cid);game.environments?.get(r.room)?.rows.delete(r.id);s.world.petStoredHP||={};if(death)delete s.world.petStoredHP[r.cid];else s.world.petStoredHP[r.cid]=r.hp;
 // A dead pet's missiles are destroyed by the ordinary projectile tick; do not
 // discard their destroy messages into the private death transaction.
 if(!death)clearShots(game,s,r,events);
 if(r.mounted)events.push(event(s.world.entity,'toggleMountState',{petID:r.cid,isMounted:false,entityId:0,level:r.level,x:r.x,y:r.y}));else if(!death)events.push(require('./world').destroyEvent([r.id]));syncMounted(s);
}
function withdraw(game,s,r,events){const mounted=r.mounted;remove(game,s,r,events);events.push(event(s.world.entity,'recyclePet',{petCID:r.cid,petID:r.id}));if(mounted)require('./talents-3127').refresh(game,s);}
function clear(game,s){if(!s.world)return;const ev=[];for(const r of rows(s)){remove(game,s,r,ev);ev.push(event(s.world.entity,'recyclePet',{petCID:r.cid,petID:r.id}));}deliver(game,s,ev);}
function targets(game,room){return [...(game.online||[])].filter(s=>s.world?.room===room&&s.world.sceneReady&&!s.world.dead).flatMap(s=>rows(s).filter(r=>!r.mounted).map(r=>{Object.assign(r.view.world,{environmentSeen:s.world.environmentSeen,loadingFinished:s.world.loadingFinished,level:s.world.level});return r.view;}));}
function damage(ctx,attacker,target,skill,amount,dmgType){
 const r=target.battlePet,s=r?.owner;if(!r||r.dead||r.mounted)return false;
 const raw=Math.max(0,Math.floor(amount*(1-Math.min(100,mods(s.player)[29]||0)/100))),shield=r.entity.property.shield||0,absorbed=Math.min(shield,raw),change=Math.min(r.hp,raw-absorbed),dies=change>=r.hp;
 if(dies){const pets=structuredClone(s.player.pets),rec=pets.find(p=>p.petId===r.cid);rec.dieTime=ctx.time;rec.dieCount=(rec.dieCount||0)+1;try{inventory.commit(ctx.game,[[s.player,'pets',pets]],true);}catch(error){if(!r.lastDeathLog||ctx.time-r.lastDeathLog>=5000){r.lastDeathLog=ctx.time;console.warn('[PET DEATH RETRY]',error.message);}return false;}}
 if(absorbed){r.entity.property.shield=shield-absorbed;ctx.events.push(event(r.entity,'changeShield',{changeShield:-absorbed,currentShield:shield-absorbed}),event(r.entity,'subHP',{changeHP:0,currentHP:r.hp,maxHP:r.maxHP,dmgType:require('./damage-3127').TYPE.shieldResist,showChangeHP:absorbed}));}
 r.hp-=change;r.entity.property.HP=r.hp;r.lastCombatAt=ctx.time;ctx.events.push(event(r.entity,'beHurt',{skillId:skill.ID,attacker:attacker.id,attackerCID:attacker.cid,damageType:dmgType,attackerPos:{x:attacker.x,y:attacker.y},targetPos:{x:r.x,y:r.y}}));
 if(change)ctx.events.push(event(r.entity,'subHP',{changeHP:change,currentHP:r.hp,maxHP:r.maxHP,dmgType,showChangeHP:change}));
 if(dies){s.world.petDeaths||={};s.world.petDeaths[r.cid]=(s.world.petDeaths[r.cid]||0)+1;ctx.events.push(event(r.entity,'death',{}));remove(ctx.game,s,r,[],true);ctx.destroyed.push(r.id);ctx.privateEvents.push({state:s,events:[event(s.world.entity,'updatePetLife',{cid:r.cid,life:life(s,r.cid)}),event(s.world.entity,'petDead',{petID:r.id,petBagIdx:r.cid,isWaterRecycle:false,lastDeadTime:ctx.time}),event(s.world.entity,'petCDPush',{petCID:r.cid,lastDeadTime:ctx.time})]});s.world.petRefreshPending=true;}
 return true;
}
function handle(game,s,name,raw,events,privateEvents=events){
 if(!['getAllPets','oneClickPet','summonPet','recyclePet','changePetsMode','gatherPets','toggleMountPet'].includes(name))return false;
 const req=commands['Command'+name[0].toUpperCase()+name.slice(1)].decode(raw||Buffer.alloc(0));if(name==='getAllPets'){panel(s,privateEvents);return true;}valid(s);
 if(name==='summonPet')add(game,s,plan(s,Number(req.petID),game),events);
 else if(name==='recyclePet'){const r=runtime(s).get(Number(req.petID));if(!r)throw Error('PET_NOT_IN_BATTLE');withdraw(game,s,r,events);}
 else if(name==='changePetsMode'){const r=rows(s).find(r=>r.id===Number(req.petID));if(!r||![0,1,2].includes(req.petMode))throw Error('INVALID_PET_MODE');r.mode=req.petMode;petActions.cancel(r,events,event);petActions.stop(r,events,event);events.push(event(r.entity,'moveStop',{}));}
 else if(name==='gatherPets'){for(const r of rows(s)){r.mode=0;petActions.cancel(r,events,event);}}
 else if(name==='oneClickPet'){
  if(rows(s).length)for(const r of rows(s))withdraw(game,s,r,events);
  else{const sorted=cfgs.filter(c=>star(s.player,c.PetID)>0&&life(s,c.PetID)>0&&!cooldown(s,c.PetID)).sort((a,b)=>star(s.player,b.PetID)-star(s.player,a.PetID)||(record(s.player,b.PetID).level||1)-(record(s.player,a.PetID).level||1));const planned=sorted.slice(0,value('maxTameNum',3)).map(c=>plan(s,c.PetID,game));for(const r of planned)add(game,s,r,events);}
 }else toggle(game,s,Number(req.petID),!!req.mount,events);
 syncMounted(s);panel(s,privateEvents);return true;
}
function toggle(game,s,cid,mount,events){
 const r=runtime(s).get(cid),cfg=byId.get(cid);if(!r||!cfg?.MountSkill)throw Error('PET_HAS_NO_PACT');if(!pactImplemented.has(cfg.MountSkill))throw Error('PET_PACT_NOT_RESTORED');if(r.mounted===mount)return;if(r.lastToggle!==undefined&&Date.now()-r.lastToggle<value('petMountCD',5)*1000)throw Error('PET_PACT_COOLDOWN');
 petActions.cancel(r,events,event);r.lastToggle=Date.now();r.mounted=mount;r.cast=null;clearShots(game,s,r,events);if(mount){game.environments.get(r.room).rows.delete(r.id);events.push(require('./world').destroyEvent([r.id]));}else{const at=s.world.entity.physics;r.x=at.x;r.y=at.y;Object.assign(r.entity.physics,at);game.environments.get(r.room).rows.set(r.id,r);events.push(require('./world').spawnEvent([r.entity]));}
 syncMounted(s);events.push(event(s.world.entity,'toggleMountState',{petID:cid,isMounted:mount,entityId:mount?0:r.id,level:r.level,x:r.x,y:r.y}));require('./talents-3127').refresh(game,s);
}
function apply(property,s){
 const p=structuredClone(property);for(const b of s.world?.petSupportBuffs?.values()||[])if(b.until>Date.now())p.property[b.field]=(p.property[b.field]||0)+b.value;
 for(const r of rows(s).filter(r=>r.mounted)){const id=byId.get(r.cid).MountSkill,sk=skills.find(s=>s.ID===id&&s.level===r.star),a=require('./monster-skills-3127').argsOf(sk);
  if(id===2292)p.property.attack+=(a.addAttr||0)+(a.addLv||0)*r.level;
  // Native property.attackSpeed is integer percentage points. Flooring the
  // fractional pet bonus is a local quantization policy, recorded in audit.
  if(id===2348)p.property.attackSpeed=(p.property.attackSpeed||0)+Math.floor((a.buffAttackSpeed||0)+(a.addAttackSpeedPerLv||0)*r.level);
  if(id===2362)p.maxHP+=(a.addAttr||0)+(a.addLv||0)*r.level;
 }p.HP=Math.min(p.HP,p.maxHP);return p;
}
function attack(game,s,r,c,time,events,eventFn){
 const sk=c.skill;if(s.world.dead||r.dead||city.safePoint(r.x,r.y,s.world.level,r.mapId)||city.safePoint(s.world.entity.physics.x,s.world.entity.physics.y,s.world.level,r.mapId))return;
 if(SUPPORT.has(sk.ID)){events.push(eventFn(r.entity,'skillCast',{skillID:sk.ID,angle:c.angle,posX:r.x,posY:r.y}));support(game,s,r,sk,time,events);return;}
 const t=c.target;if(!t||t.dead||!game.environments.get(r.room).rows.has(t.id))return;
 events.push(eventFn(r.entity,'skillCast',{skillID:sk.ID,angle:c.angle,posX:[2239,2349].includes(sk.ID)?t.x:r.x,posY:[2239,2349].includes(sk.ID)?t.y:r.y,targetPos:{x:t.x,y:t.y}}));if(petActions.start(game,s,r,c,time,events,eventFn))return;const shots=require('./projectiles-3127').launch(game,s,sk,c.angle,{actor:r.entity,sourceRecord:r,force:true});if(shots){if(shots.length)events.push(require('./world').spawnEvent(shots));return;}
 if(!MELEE.has(sk.skillType)||sk.skillShape===2){s.world.petUnsupportedSkills||=new Set();s.world.petUnsupportedSkills.add(sk.ID);return;}
 const fx=require('./monster-effects-3127'),size=sk.effectSize||[],radius=size[0]||sk.maxDistance,targets=require('./environment-3127').records(game,s).filter(t=>{
  if(t.dead||!['mob','boss'].includes(t.kind)||city.safePoint(t.x,t.y,s.world.level,r.mapId)||t.effectState?.hiddenUntil>time||!water.canMove(r.cid,r.x,r.y,t.x,t.y,r.mapId))return false;
  return sk.skillRange===1?fx.rectContains(t,r,c.angle,radius,size[1]||100):fx.sector(t.x,t.y,r,c.angle,radius,sk.skillRange===2?360:size[1]||90);
 }).map(t=>({kind:'environment',id:t.id,x:t.x,y:t.y,record:t}));
 const hits=require('./actions-3127').damageTargets(game,s,sk,targets,{actor:r.entity,aggressor:r.view});require('./combat-input-3127').appendHits(s,hits,sk.ID,events,eventFn,require('./world').destroyEvent,sk,r.entity);
}
function support(game,s,r,sk,time,events){
 const a=require('./monster-skills-3127').argsOf(sk),team=game.teams?.teamFor(s.user.id),ids=new Set([s.user.id,...(team?.members||[])]),allies=[];
 for(const peer of game.online||[]){if(!ids.has(peer.user.id)||!peer.world?.sceneReady||peer.world.room!==r.room||peer.world.dead)continue;allies.push({entity:peer.world.entity,state:peer});for(const pet of rows(peer))if(!pet.mounted)allies.push({entity:pet.entity,record:pet});}
 const selected=allies.filter(t=>t.entity.property.HP>0&&Math.hypot(t.entity.physics.x-r.x,t.entity.physics.y-r.y)<=sk.effectSize[0]&&(sk.ID!==2236||t.entity.property.HP<t.entity.property.maxHP)).sort((a,b)=>a.entity.property.HP/a.entity.property.maxHP-b.entity.property.HP/b.entity.property.maxHP).slice(0,a.num||1);
 for(const t of selected){const p=t.entity.property;
  if(sk.ID===2236){const gain=Math.min(p.maxHP-p.HP,Math.floor(r.maxHP*a.hpArgs/100));if(gain){p.HP+=gain;if(t.record)t.record.hp=p.HP;events.push(event(t.entity,'addHP',{changeHP:gain,currentHP:p.HP,maxHP:p.maxHP}));}}
  else if(sk.ID===2235){const amount=Math.floor(r.maxHP*a.hpArgs/100),old=p.shield||0;if(amount>=old){if(t.state)require('./frozen-armor-3127').drop(t.state,events,event,false);p.shield=amount;if(t.record)t.record.shieldUntil=time+a.duration;else t.state.world.playerShield={until:time+a.duration};events.push(event(t.entity,'changeShield',{changeShield:amount-old,currentShield:amount}));}}
  else{const id=sk.ID===2238?54:176,field=sk.ID===2238?'attack':'crit',value=sk.ID===2238?Math.floor(r.baseStats.attack*a.atkArgs/100):a.critUp,b={field,value,until:time+a.duration},buffs=t.record?t.record.supportBuffs:(t.state.world.petSupportBuffs||=new Map()),old=buffs.get(id);if(old&&old.value>=value&&old.until>=b.until)continue;buffs.set(id,b);
   const wire={type:id,group:0,duration:a.duration,startTime:time,endTime:time+a.duration,propValue:value,stackNum:1,maxStackNum:1,isValid:1};t.entity.buffer.buffs=(t.entity.buffer.buffs||[]).filter(x=>x.type!==id);t.entity.buffer.buffs.push(wire);events.push(event(t.entity,'buffAdd',wire));if(t.record)applyCompanionBuffs(t.record);else require('./talents-3127').refresh(game,t.state);events.push(event(t.entity,'propertyResult',{propRes:t.entity.property}));
  }
 }
}
function expireSupport(game,s,time,events){let changed=false;for(const [id,b]of s.world.petSupportBuffs||[]){if(time<b.until)continue;s.world.petSupportBuffs.delete(id);s.world.entity.buffer.buffs=(s.world.entity.buffer.buffs||[]).filter(x=>x.type!==id);events.push(event(s.world.entity,'buffRemove',{type:id}));changed=true;}if(changed)require('./talents-3127').refresh(game,s);}
function tickPact(game,s,r,time,events){
 if(byId.get(r.cid).MountSkill!==2975||time<(r.nextHealAt||(r.nextHealAt=time+20000)))return;r.nextHealAt=time+20000;
 const sk=skills.find(s=>s.ID===2975&&s.level===r.star),a=require('./monster-skills-3127').argsOf(sk),allies=require('./player-skills-3127').allies(game,s,sk).sort((a,b)=>a.world.entity.property.HP/a.world.entity.property.maxHP-b.world.entity.property.HP/b.world.entity.property.maxHP),t=allies[0];
 if(t){const p=t.world.entity.property,owner=s.world.entity.property,gain=Math.min(p.maxHP-p.HP,Math.floor((a.addHP+a.addLv2*r.level)*(owner.HP/owner.maxHP<a.hpPer/100?1+(a.beHealBonus+a.addLv*r.level)/100:1)));if(gain){p.HP+=gain;events.push(event(t.world.entity,'addHP',{changeHP:gain,currentHP:p.HP,maxHP:p.maxHP}));}}
}
function tick(game,s,time,dt,events,eventFn){
 const w=s.world;if(!w)return;if(w.petRefreshPending)sendPanel(game,s);expireSupport(game,s,time,events);
 for(const r of rows(s)){
  for(const [id,b]of r.supportBuffs)if(time>=b.until){r.supportBuffs.delete(id);r.entity.buffer.buffs=r.entity.buffer.buffs.filter(x=>x.type!==id);applyCompanionBuffs(r);events.push(eventFn(r.entity,'buffRemove',{type:id}),eventFn(r.entity,'propertyResult',{propRes:r.entity.property}));}
  if(w.dead){remove(game,s,r,events);continue;}
  if(w.inWater||water.waterAt(w.entity.physics.x,w.entity.physics.y,w.mapId)){withdraw(game,s,r,events);events.push(event(w.entity,'petDead',{petID:r.id,petBagIdx:r.cid,isWaterRecycle:true,lastDeadTime:0}));continue;}
  if(r.mounted){tickPact(game,s,r,time,events);continue;}
  if(petActions.advance(game,s,r,time,dt,events,eventFn))continue;
  if(r.view.world.monsterStatuses?.get(192)?.until>time){petActions.cancel(r,events,eventFn);petActions.stop(r,events,eventFn);continue;}
  if(time<(r.recoveryUntil||0))continue;
  if(r.entity.property.shield&&time>=r.shieldUntil){const amount=r.entity.property.shield;r.entity.property.shield=0;events.push(eventFn(r.entity,'changeShield',{changeShield:-amount,currentShield:0}));}
  if(r.cast){if(time>=r.cast.releaseAt){const c=r.cast;r.cast=null;try{attack(game,s,r,c,time,events,eventFn);}catch(error){r.cast={...c,releaseAt:time+250};if(!r.lastFailureLog||time-r.lastFailureLog>=5000){r.lastFailureLog=time;console.warn('[PET REWARD RETRY]',error.message);}}}continue;}
  const cfg=models.find(m=>m.CreatureID===r.cid&&m.Level<=r.level&&m.MaxLevel>=r.level),at=w.entity.physics,near=require('./environment-3127').records(game,s).filter(t=>!t.dead&&['mob','boss'].includes(t.kind)&&Math.hypot(t.x-at.x,t.y-at.y)<=(cfg?.GuardRange||1500)&&!city.safePoint(t.x,t.y,w.level,w.mapId)&&!(t.effectState?.hiddenUntil>time)).sort((a,b)=>Math.hypot(a.x-r.x,a.y-r.y)-Math.hypot(b.x-r.x,b.y-r.y)),target=near[0],safe=city.safePoint(at.x,at.y,w.level,w.mapId);
  if(!target&&time-r.lastCombatAt>=value('petOufOfFightTime',3000)&&time>=(r.nextRegenAt||(r.nextRegenAt=time+1000))){r.nextRegenAt=time+1000;const gain=Math.min(r.maxHP-r.hp,mods(s.player)[28]||0);if(gain>0){r.hp+=gain;r.entity.property.HP=r.hp;events.push(eventFn(r.entity,'addHP',{changeHP:gain,currentHP:r.hp,maxHP:r.maxHP}));}}
  const defs=creatures.get(r.cid).SkillIDs.map(id=>skills.find(s=>s.ID===id&&s.level===r.star)||skills.find(s=>s.ID===id&&s.level===1)).filter(sk=>sk&&!sk.isPassive&&sk.ID!==byId.get(r.cid).MountSkill);
  if(target&&!safe&&r.mode!==2)for(const sk of defs){if(time<(r.ready.get(sk.ID)||0)||Math.hypot(target.x-r.x,target.y-r.y)>sk.maxDistance)continue;const angle=Math.atan2(target.y-r.y,target.x-r.x)*180/Math.PI;r.entity.physics2.angle=angle;r.entity.skill={lastUseSkillID:sk.ID,lastUseSkillMillis:time};r.ready.set(sk.ID,time+Math.max(100,sk.cd)*(1-(defs.indexOf(sk)>0?(mods(s.player)[24]||0)/100:0)));r.cast={skill:sk,target,angle,releaseAt:time+sk.castPointTime};r.lastCombatAt=time;petActions.state(r,3,events,eventFn);events.push(eventFn(r.entity,'moveStop',{}),eventFn(r.entity,'rotateTo',{angle,rotation:angle}),eventFn(r.entity,'useSkill',{skillID:sk.ID,skillCD:sk.cd,skillLevel:r.star,curMillis:time}),eventFn(r.entity,'skillCastPoint',{skillID:sk.ID}));break;}
  if(!r.cast&&r.mode!==2){const reach=defs[0]?.effectSize?.[0]||300,goal=target&&!safe&&Math.hypot(target.x-r.x,target.y-r.y)>reach?target:at,from={x:r.x,y:r.y};if(Math.hypot(goal.x-r.x,goal.y-r.y)>(goal===at?180:reach*.8))require('./hero-summons-3127').move(game,s,r,goal,dt,events,eventFn);petActions.state(r,r.x!==from.x||r.y!==from.y?(goal===at?4:5):1,events,eventFn);}
 }
}
function planRelocation(s,x,y){
 if(!s.world||s.world.mapId!==2)return [];
 return rows(s).map((r,index)=>{let position;for(const radius of [160,240,80,0]){for(const direction of [0,1,2,3]){const angle=(direction+index)*Math.PI/2,p={x:x+Math.cos(angle)*radius,y:y+Math.sin(angle)*radius};if(!require('./motion-3127').validPoint(s.world.mapId,p.x,p.y)||city.overlapsStatic(p.x,p.y,40,s.world.level,s.world.mapId)||water.waterAt(p.x,p.y,s.world.mapId))continue;position=p;break;}if(position)break;}return {r,position};});
}
function relocate(game,s,plans,events,eventFn){
 for(const {r,position}of plans){if(r.dead||!rows(s).includes(r))continue;petActions.cancel(r,events,eventFn);clearShots(game,s,r,events);if(!position){withdraw(game,s,r,events);s.world.petRefreshPending=true;continue;}Object.assign(r,{x:position.x,y:position.y,homeX:position.x,homeY:position.y,mode:0});Object.assign(r.entity.physics,position);if(!r.mounted){petActions.stop(r,events,eventFn);events.push(eventFn(r.entity,'moveTo',{...position,direction:1,frequency:1}),eventFn(r.entity,'transportEnd',position));}}syncMounted(s);
}
module.exports={planRelocation,relocate,cfgs,byId,record,star,rows,stats,model,life,cooldown,snapshot,mountedSnapshot,syncMounted,refresh,deliver,plan,add,clear,targets,damage,handle,tick,apply,pactImplemented,support,expireSupport,attack};
