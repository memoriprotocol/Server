'use strict';
// Native CCSupplyOffice415 -> CCExchangePanel -> CommandExchangeItem89.
// The preview uses WeaponScheme/EquipmentScheme.Exp, never ItemScheme.price.
const I=require('./inventory'),P=require('./progression-3127'),city=require('./city-3127'),{commands}=require('./proto');
const skins=new Map(require('../config/schemes/SkinScheme.json').Skin.map(s=>[s.ID,s]));
function near(state){const w=state.world,e=w?.entity;if(!w?.sceneReady||!e||w.mapId!==2||!city.active(w.level,w.mapId)||process.env.HEROS_CITY_NPCS_ENABLED==='0')return false;const scale=skins.get(e.equip.curSkinID)?.SkinScale||1;return city.npcRecords.some(n=>n.cid===415&&Math.hypot(n.x-e.physics.x,n.y-e.physics.y)<=600+50*scale);}
function value(item){
 const cfg=I.items.get(item.itemCfgId);if(!cfg||![6,11].includes(cfg.itemType))throw Error('ITEM_NOT_EXCHANGEABLE');
 const level=item.extInfo.WeaponLv??1,def=cfg.itemType===6?I.weapons.find(w=>w.weaponID===cfg.args[0]&&w.level===level):I.equipment.get(item.itemCfgId);
 if(!def||!Number.isSafeInteger(def.Exp)||def.Exp<0)throw Error('EXCHANGE_VALUE_NOT_RECOVERED');
 return{xp:def.Exp,type:cfg.itemType,grade:cfg.itemType===6?def.grade:def.Star};
}
function plan(state,uuids){
 const w=state.world;if(!w?.sceneReady||!w.entity||w.dead||w.entity.property.HP<=0)throw Error('PLAYER_NOT_ALIVE');if(!near(state))throw Error('SUPPLY_OFFICE_TOO_FAR');
 if(!Array.isArray(uuids)||!uuids.length||uuids.length>128||uuids.some(id=>typeof id!=='string'||!id||id.length>128)||new Set(uuids).size!==uuids.length)throw Error('INVALID_EXCHANGE_SELECTION');
 const before=I.inventoryOf(state),items=uuids.map(id=>{const item=before.find(x=>x.uuid===id);if(!item)throw Error('ITEM_NOT_OWNED');if(![1,3].includes(item.bagType))throw Error('UNEQUIP_BEFORE_EXCHANGE');if(item.uuid===w.entity.equip.currentItemUUID||item.uuid===state.player.currentWeaponUUID)throw Error('UNEQUIP_BEFORE_EXCHANGE');if(item.extInfo.il===1)throw Error('ITEM_LOCKED');if(item.num!==1)throw Error('INVALID_EXCHANGE_STACK');const v=value(item);if(item.bagType!==(v.type===6?1:3))throw Error('INVALID_EXCHANGE_BAG');return{item,...v};});
 const xp=items.reduce((n,x)=>n+x.xp,0),mode=w.level==='rookie'?1:0,progress=P.progress(P.totalOf(state.player,mode)+xp,mode),after=before.filter(i=>!uuids.includes(i.uuid));
 return{before,after,items,xp,progress,mode};
}
function valid(state,p){const w=state.world;return state.user?.id===p.uid&&w===p.world&&w?.entity===p.actor&&w.sceneReady&&!w.dead&&w.entity.property.HP>0&&w.room===p.room&&w.mapId===p.map&&(Number(state.player.deathCount)||0)===p.deaths;}
function flush(game,state,time=Date.now()){
 const pending=state.itemExchangeDelivery;if(!pending)return;if(!valid(state,pending)){delete state.itemExchangeDelivery;return;}if(time<(pending.retryAt||0))return;
 try{
  require('./talents-3127').refresh(game,state);
  const w=state.world,progress=P.progress(P.totalOf(state.player,pending.mode),pending.mode),tasks=[];
  for(const[id,added]of pending.quests){const task=w.questTasks?.find(t=>t.id===id);if(task)tasks.push([added?'taskAdded':'taskUpdated',{task}]);}
  const events=[...I.resultEvents(pending.before,I.inventoryOf(state)),...tasks];
  if(pending.xp)events.push(['addExp',{remainExp:progress.remainExp,maxLevelExp:progress.maxLevelExp,isLevelUp:progress.level>pending.oldLevel,addedExp:Math.max(0,pending.xp-(pending.advertisedXP||0))}],['updateTotalExp',{totalExp:progress.totalExp}]);
  require('./world').inventoryPush(game,state,{privateEvents:events,publicEvents:require('./level-delivery-3127').upgrades(state,pending.oldLevel),created:[],destroyed:[]});delete state.itemExchangeDelivery;
 }catch(error){pending.retryAt=time+250;if(!pending.logAt||time-pending.logAt>=5000){pending.logAt=time;console.warn('[EXCHANGE DELIVERY] committed:',error.message);}}
}
function exchange(game,state,uuids){
 const v=plan(state,uuids),w=state.world,p=state.player,beforeTasks=structuredClone(w.questTasks||[]),next=structuredClone(p);
 next.inventory=v.after;if(v.xp){Object.assign(next,{exp:v.progress.totalExp,level:v.progress.level,levelExp:v.progress.remainExp,progressionVersion:40});next.battleStats=require('./life-3127').rewardStats(state,v.xp);}
 const quests=require('./quests-3127').planRecords(state,[...v.items.map(x=>({type:18,data:{itemID:x.item.itemCfgId,count:1}})),{type:2,data:{level:v.progress.level}}]);
 const records=[{type:8,amount:v.items.filter(x=>x.type===6).length},{type:9,amount:v.items.filter(x=>x.type===11).length}].filter(r=>r.amount>0),pass=require('./passes-3127').planRecords(game.adminService,state,records),marker={committed:false};
 const changes=Object.entries(next).filter(([k,x])=>JSON.stringify(x)!==JSON.stringify(p[k])).map(([k,x])=>[p,k,x]);
 try{I.commit(game,[...changes,...quests.changes,...pass,[marker,'committed',true]],true);}catch(error){if(!marker.committed)throw error;console.warn('[EXCHANGE COMMITTED]',error.message);}
 w.entity.item.items=I.inventoryOf(state);
 let delivery=state.itemExchangeDelivery;if(!delivery||!valid(state,delivery))delivery={uid:state.user.id,world:w,actor:w.entity,room:w.room,map:w.mapId,deaths:Number(p.deathCount)||0,mode:v.mode,before:v.before,oldLevel:w.entity.property.level,xp:0,quests:new Map()};
 delivery.xp+=v.xp;delivery.retryAt=0;
 for(const task of w.questTasks||[]){const old=beforeTasks.find(t=>t.id===task.id);if(JSON.stringify(old)!==JSON.stringify(task))delivery.quests.set(task.id,delivery.quests.get(task.id)||!old);}
 state.itemExchangeDelivery=delivery;require('./level-delivery-3127').track(game,state,delivery.oldLevel);flush(game,state);return{xp:v.xp,items:v.items.length,progress:v.progress};
}
function handle(game,state,name,raw){if(name!=='exchangeItem')return false;exchange(game,state,commands.CommandExchangeItem.decode(raw).uuids);return true;}
module.exports={near,value,plan,valid,flush,exchange,handle};
