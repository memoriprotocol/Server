'use strict';
const {randomUUID}=require('node:crypto');
const inventory=require('./inventory'),motion=require('./motion-3127');
const {proto}=require('./proto'),{encode}=require('./codec');
const constants=new Map(require('../config/schemes/ConstantsScheme.json').Constants.map(r=>[r.name,r.content]));
const maps=require('../config/schemes/MapScheme.json').Map;
const integer=(n)=>Number.isSafeInteger(n)&&n>=0&&n<=2147483647;
function value(name,fallback){const n=Number(constants.get(name)?.[0]);return Number.isFinite(n)?n:fallback;}
function xpNumber(n){if(!Number.isSafeInteger(n)||n<0||n>0xffffffff)throw Error('INVALID_LIFE_XP');return n;}
function number(n){if(!integer(n))throw Error('INVALID_LIFE_COUNTER');return n;}
function current(state,time=Date.now()){
 const old=state.player.battleStats;
 if(old)return {...old};
 return {id:randomUUID(),startedAt:time,xpEarned:0,coinEarned:0,bossKills:0,mobKills:0,playerKills:0,continues:0};
}
function rewardStats(state,xp,coin=0,kind=null){
 const next=current(state);next.xpEarned=xpNumber(next.xpEarned+xp);next.coinEarned=number(next.coinEarned+coin);
 if(kind==='boss')next.bossKills=number(next.bossKills+1);else if(kind==='mob')next.mobKills=number(next.mobKills+1);
 return next;
}
function replayPrice(used){
 // ConstantsManager.getReliveCost(max, remaining) = 2^(max-remaining-1)*lifeCost.
 // Passing remaining after consuming a continuation gives 20,40,80. The
 // caller/remaining-count convention is a local inference, recorded in audit.
 const price=value('lifeCost',20)*2**used;if(!integer(price))throw Error('INVALID_REPLAY_PRICE');return price;
}
function conversion(state,stats){
 const suffix=state.world.level==='rookie'?'NewbieServer':'';
 const xp=xpNumber(stats.xpEarned),coin=Math.floor(xp*value('expToCoinRatio'+suffix,0)),title=Math.floor(xp*value('expToTitleRatio'+suffix,0)),reputation=Math.floor(xp*value('expToReputationRatio'+suffix,0));
 return {coin:number(coin),title:number(title),reputation:number(reputation)};
}
function settlement(state,source,stats,time,self=false){
 const p=state.player,w=state.world,e=w.entity,gain=conversion(state,stats),used=number(stats.continues||0),cap=value('reliveCount',3);
 const dan=require('./dan-3127').plan(p,stats,e?.miscInfo?.heroId||p.heroId,time),newScore=dan.score;
 const data={name:p.name||state.user.username||'',killerName:source?.kind==='player'?(source.name||''):'',killerCID:Number(source?.cid)||0,
  killCount:stats.playerKills||0,killBossCount:stats.bossKills||0,survivalTime:Math.max(0,Math.floor((time-stats.startedAt)/1000)),coin:stats.coinEarned||0,expCoin:gain.coin,
  canRespawn:false,reliveCount:Math.max(0,cap-used),reputationExp:gain.reputation,totalReputationExp:number((p.reputation||0)+gain.reputation),
  titleExp:gain.title,totalTitleExp:number((p.titleExp||0)+gain.title),totalExp:stats.xpEarned||0,life:0,vipType:0,
  oldScore:require('./dan-3127').score(p,time),newScore,replayCoin:used<cap?replayPrice(used):0,settleSelf:self};
 const err=require('./proto').entityEvent.settleInfo.verify(data);if(err)throw Error('INVALID_SETTLEMENT '+err);
 const coin=number((Number(p.coin)||0)+gain.coin);
 return {data,changes:[...dan.changes,[p,'coin',coin],[p,'titleExp',data.totalTitleExp],[p,'reputation',data.totalReputationExp],[p,'score',newScore]]};
}
function attach(state,time=Date.now()){
 const w=state.world;if(w.level==='guide')return;
 const pending=state.player.pendingDeath;
 if(!state.player.battleStats)state.player.battleStats=current(state,time);
 w.dead=!!pending;w.protectedUntil=!pending&&Number(state.player.rebornUntil)>time?Number(state.player.rebornUntil):0;w.protectionBuffSent=false;
 if(pending){if(pending.mapId===w.mapId&&motion.validPoint(w.mapId,pending.position.x,pending.position.y)){w.entity.physics.x=pending.position.x;w.entity.physics.y=pending.position.y;w.motion=motion.createMotion(w.entity);}w.entity.property.HP=0;w.entity.miscInfo.life=0;w.entity.miscInfo.reliveCount=pending.data.reliveCount;w.entity.settle={...pending.data};delete w.entity.settle.totalExp;}
}
function stop(state){
 const w=state.world;if(w.motion)motion.stop(w.motion);w.rotationDirection=0;
 if(w.combatInput){w.combatInput.auto=false;w.combatInput.left=false;w.combatInput.right=false;w.combatInput.heldSkill=0;}
 require('./weapon-primary-3127').reset(state);w.selfSkillBuffs?.clear();
 w.weaponProjectileJob=null;w.playerSkillJobs=[];w.playerShield=null;w.heroChannelUntil=0;w.heroInvulnerableUntil=0;w.fishing=null;w.peaceCast=null;w.isMounted=false;if(w.entity.mount)w.entity.mount.isMount=false;
 w.petSupportBuffs?.clear();w.monsterStatuses?.clear();w.environmentBuffs?.clear();w.entity.buffer={buffs:[]};
}
function die(game,state,source,time=Date.now(),self=false){
 const p=state.player,w=state.world;
 if(w.dead||p.pendingDeath)return null;
 const stats=current(state,time),planned=settlement(state,source,stats,time,self),e=w.entity;
 const pending={id:randomUUID(),runId:stats.id,room:w.room,mapId:w.mapId,at:time,level:e.property.level||1,sourceCID:source?.cid||0,
  position:{x:e.physics.x,y:e.physics.y},killerPosition:{x:source?.x??e.physics.x,y:source?.y??e.physics.y},data:planned.data};
 inventory.commit(game,[...planned.changes,[p,'pendingDeath',pending],[p,'battleStats',stats],[p,'deathCount',number((p.deathCount||0)+1)],[p,'rebornUntil',0]],w.level!=='guide');
 const removed=[...new Set([...(w.monsterStatuses?.keys()||[]),...(w.environmentBuffs?.keys()||[]),...(e.buffer?.buffs||[]).map(b=>b.type)])];
 require('./pets-3127').clear(game,state);require('./projectiles-3127').clear(game,state);require('./hero-vfx-3127').clear(game,state);
 require('./actions-3127').clearStructures(game,state);
 stop(state);w.dead=true;w.protectedUntil=0;e.property.HP=0;e.miscInfo||={};e.miscInfo.life=0;e.miscInfo.reliveCount=planned.data.reliveCount;
 e.settle={...planned.data};delete e.settle.totalExp;w.deathReplayShown=self?null:pending.id;
 return {pending,removed};
}
function deliverOffline(game,state){
 const w=state.world,pending=state.player?.pendingDeath;if(!w?.offlinePending)return;
 if(!pending||pending.id!==w.offlinePending){delete w.offlinePending;return;}
 try{require('./world').replicate(game,state,[require('./world').entityEventData(w.entity,'settleInfo',pending.data)]);w.deathReplayShown=pending.id;delete w.offlinePending;}catch(error){/* Durable result; next world tick retries without rewarding again. */}
}
function deathEvents(state,pending,event){
 const e=state.world.entity,p=pending.position,k=pending.killerPosition;
 return [event(e,'moveStop',{}),event(e,'death',{posX:p.x,posY:p.y,killPosX:k.x,killPosY:k.y,isSettle:false})];
}
function respawn(game,state,enterType,time=Date.now()){
 const p=state.player,w=state.world,pending=p.pendingDeath;
 if(!w.dead||!pending)throw Error('PLAYER_NOT_DEAD');
 if(w.level==='guide'||![1,3].includes(enterType))throw Error('INVALID_RESPAWN_MODE');
 const stats=current(state,time),used=stats.continues||0,replay=enterType===1;
 if(replay&&used>=value('reliveCount',3))throw Object.assign(Error('NO_RELIVES'),{code:proto.ErrorCode.NO_LIFE});
 const price=replay?pending.data.replayCoin:0;
 if(!integer(price))throw Error('INVALID_REPLAY_PRICE');
 if((p.coin||0)<price)throw Object.assign(Error('INSUFFICIENT_COIN'),{code:proto.ErrorCode.COIN_NOT_ENOUGH});
 const progression=require('./progression-3127'),mode=w.level==='rookie'?1:0,level=replay?Math.max(1,Math.ceil(pending.level/2)):1;
 const exp=progression.totalForLevel(level,mode),base={...require('./talents-3127').apply(progression.stats(w.entity.miscInfo.heroId||p.heroId||1,level,w.entity.miscInfo.heroStar||1),p),exp:0};
 const derived=require('./hamster-3127').apply(inventory.equipmentProperty(base,inventory.inventoryOf(state)),state);derived.HP=derived.maxHP;
 const born=maps.find(m=>m.ID===w.mapId)?.Born;if(!born)throw Error('MISSING_RESPAWN_POINT');
 const next={id:randomUUID(),startedAt:time,xpEarned:0,coinEarned:0,bossKills:0,mobKills:0,playerKills:0,continues:replay?used+1:0};
 inventory.commit(game,[[p,'coin',number((p.coin||0)-price)],[p,'level',level],[p,'exp',exp],[p,'levelExp',0],[p,'progressionVersion',40],[p,'pendingDeath',null],[p,'battleStats',next],[p,'rebornUntil',time+value('rebornProtectTime',10)*1000]],true);
 stop(state);w.petDeaths={};w.petStoredHP={};w.dead=false;w.deathReplayShown=null;w.baseProperty=base;w.entity.property=derived;w.entity.settle={killCount:0,killBossCount:0,life:1,canRespawn:false};
 w.entity.miscInfo.life=value('singleGameLife',1);w.entity.miscInfo.reliveCount=Math.max(0,value('reliveCount',3)-next.continues);
 w.entity.physics.x=born[2];w.entity.physics.y=born[3];w.motion=motion.createMotion(w.entity);w.lastAttackAt=0;w.combatInput=null;
 w.protectedUntil=p.rebornUntil;w.protectionBuffSent=false;
 return {price,exp,level,property:derived};
}
function protection(state,time,events,event){
 const w=state.world;if(!w||w.dead)return;
 if(w.protectedUntil>time&&!w.protectionBuffSent){
  const buff={type:28,group:0,duration:w.protectedUntil-time,startTime:time,endTime:w.protectedUntil,stackNum:1,maxStackNum:1,isValid:1};
  w.entity.buffer||={buffs:[]};w.entity.buffer.buffs||=[];w.entity.buffer.buffs.push(buff);events.push(event(w.entity,'buffAdd',buff));w.protectionBuffSent=true;
 }else if(w.protectionBuffSent&&time>=w.protectedUntil){w.protectedUntil=0;w.protectionBuffSent=false;w.entity.buffer.buffs=w.entity.buffer.buffs.filter(b=>b.type!==28);events.push(event(w.entity,'buffRemove',{type:28}));}
}
function finish(game,state,time=Date.now()){
 const w=state.world,p=state.player;if(!w||w.level==='guide')return;
 const planned=p.pendingDeath?null:settlement(state,null,current(state,time),time,true);
 inventory.commit(game,[...(planned?.changes||[]),[p,'pendingDeath',null],[p,'battleStats',null],[p,'exp',0],[p,'level',1],[p,'levelExp',0],[p,'progressionVersion',40],[p,'rebornUntil',0]],true);
}
function restoreEvents(state,event){const pending=state.player.pendingDeath;if(!pending||state.world.deathReplayShown===pending.id)return [];state.world.deathReplayShown=pending.id;const at=state.world.entity.physics,replay=pending.mapId!==state.world.mapId?{...pending,position:{x:at.x,y:at.y},killerPosition:{x:at.x,y:at.y}}:pending;return [...deathEvents(state,replay,event),event(state.world.entity,'settleInfo',pending.data)];}
function allowedWhileDead(name){return new Set(['loginLoadingFinish','requestProperty','moveStop','rotateStop','unUseSkill','unUseLeftLongTouchSkill','unUseRightLongTouchSkill','getAllPets','oneClickPet']).has(name);}
module.exports={value,current,rewardStats,replayPrice,conversion,settlement,attach,die,deathEvents,respawn,protection,finish,restoreEvents,allowedWhileDead,stop,deliverOffline};
