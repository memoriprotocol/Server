'use strict';
// Contracts: ItemManager.ts, ItemPanelController.ts, CCDropItemComp.ts (client 3.12.7).
const {randomUUID}=require('node:crypto');
const weaponFamily=require('./weapon-family-3127');
const {proto}=require('./proto');
const items=new Map(require('../config/schemes/ItemScheme.json').Item.map(x=>[x.ID,x]));
const kinds=new Map(require('../config/schemes/ItemTypScheme.json').ItemTyp.map(x=>[x.ItemType,x]));
const equipment=new Map(require('../config/schemes/EquipmentScheme.json').Equipment.map(x=>[x.ItemID,x]));
const weapons=require('../config/schemes/WeaponScheme.json').Weapon;
const tabs=require('../config/schemes/BackPackScheme.json').Backpack;
const constants=require('../config/schemes/ConstantsScheme.json').Constants;
const PICKUP_RADIUS=Number(constants.find(x=>x.name==='pickUpArea').content[0]);
const GROUND_LIFETIME=40000;
const expired=(d,time=Date.now())=>!Number.isFinite(d.createdAt)||time>=d.createdAt+GROUND_LIFETIME;
const PUBLIC_AFTER=Number(constants.find(x=>x.name==='dropItemPublicTime').content[0])*1000;
const BAG={weapon:1,quick:2,equipment:3,body:4,food:5,resource:8,items:9};
const bagByTab={0:1,1:3,2:5,3:8,6:9};
const fail=message=>{throw Error(message);};
function capacity(bag){if(bag===2)return 3;if(bag===4)return 8;if(bag===8)return 4096;const tab=Object.keys(bagByTab).find(t=>bagByTab[t]===bag);return tabs.find(t=>t.Tab===Number(tab))?.InitialCaps||64;}
function gridCounts(){const a=[64,64,64,4096,0,24,64];for(const t of tabs)a[t.Tab]=t.InitialCaps;return a;}
function defaultBag(id){const c=items.get(id);if(!c)fail('UNKNOWN_ITEM_CONFIG');return bagByTab[kinds.get(c.itemType)?.Tab]||9;}
function canonicalInventory(raw=[]){
 if(!Array.isArray(raw)||raw.length>4096)fail('INVENTORY_FORMAT_REQUIRES_MIGRATION');
 const seen=new Set();return raw.map(x=>{
  const out={...x,uuid:x.uuid??x.uid,itemCfgId:x.itemCfgId??x.cid,num:x.num,extInfo:x.extInfo??x.ext??{},bagType:x.bagType??x.bag??0,bagPos:x.bagPos??x.pos??0};
  for(const k of ['uid','cid','ext','bag','pos'])delete out[k];
  if(typeof out.uuid!=='string'||!out.uuid||seen.has(out.uuid)||!Number.isInteger(out.itemCfgId)||!Number.isSafeInteger(out.num)||out.num<=0||proto.Item.verify(out))fail('INVENTORY_FORMAT_REQUIRES_MIGRATION');
  seen.add(out.uuid);return out;
 });
}
function inventoryOf(state){return canonicalInventory(state.world?.level==='guide'?state.world.inventory||[]:state.player.inventory||[]);}
function roomKey(state){return state.world.level==='guide'?'guide:'+state.user.id:state.world.room;}
function groundRecords(game,state){
 if(state.world.level==='guide')return (state.world.groundDrops||[]).filter(d=>!expired(d)).map(drop=>({owner:state.world,drop}));
 return Object.values(game.players.db).flatMap(owner=>(owner.groundDrops||[]).filter(d=>d.room===roomKey(state)&&!expired(d)).map(drop=>({owner,drop})));
}
function dropEntity(drop){return {id:drop.id,uid:0,cid:0,type:100,ud:JSON.stringify({itemID:drop.item.itemCfgId,itemNum:drop.item.num,offset:{x:0,y:0},destroyTime:Math.max(0,(drop.createdAt+GROUND_LIFETIME-Date.now())/1000),resChangeTyp:0}),physics:{x:drop.x,y:drop.y,rotation:0,direction:1},camp:{campID:0},ownerID:drop.ownerId};}
function expireGround(game,time=Date.now()){
 const persisted=Object.values(game.players?.db||{}),owners=[...new Set([...persisted,...[...(game.online||[])].filter(s=>s.world?.level==='guide').map(s=>s.world)])],changes=[],gone=new Map();
 for(const owner of owners){const rows=owner.groundDrops||[],removed=rows.filter(d=>expired(d,time));if(!removed.length)continue;changes.push([owner,'groundDrops',rows.filter(d=>!expired(d,time))]);for(const d of removed){const key=d.room||'';if(!gone.has(key))gone.set(key,[]);gone.get(key).push(d.id);}}
 if(changes.length){commit(game,changes,changes.some(([o])=>persisted.includes(o)));for(const state of game.online||[]){if(!state.world?.sceneReady)continue;const ids=gone.get(roomKey(state));if(ids?.length){state.world.expiredDropDeletes||=new Set();for(const id of ids)state.world.expiredDropDeletes.add(id);}}}
 flushExpiredDeletes(game,time);return [...gone.values()].reduce((n,ids)=>n+ids.length,0);
}
function flushExpiredDeletes(game,time=Date.now()){
 for(const state of game.online||[]){const w=state.world;if(!w?.sceneReady||!w.expiredDropDeletes?.size||time-(w.lastDropDeleteAttempt??-Infinity)<250)continue;w.lastDropDeleteAttempt=time;const ids=[...w.expiredDropDeletes].slice(0,256);try{game.push(state,'rm',require('./codec').encode('ReplicateMsg',{events:[require('./world').destroyEvent(ids)]}));for(const id of ids)w.expiredDropDeletes.delete(id);}catch(e){console.warn('[DROP EXPIRY DELIVERY] retained:',e.message);}}
}
function nextEntityId(game){if(!game.nextDropId){game.nextDropId=1_000_000_000;for(const p of Object.values(game.players.db))for(const d of p.groundDrops||[])game.nextDropId=Math.max(game.nextDropId,d.id+1);}if(game.nextDropId>=2_000_000_000)fail('ENTITY_ID_LIMIT');return game.nextDropId++;}
function freePosition(inventory,bag){const used=new Set(inventory.filter(x=>x.bagType===bag).map(x=>x.bagPos));for(let i=0;i<capacity(bag);i++)if(!used.has(i))return i;fail('BAG_FULL');}
function findOwned(inventory,uuid,bag){const x=inventory.find(x=>x.uuid===uuid&&(bag===undefined||x.bagType===bag));if(!x)fail('ITEM_NOT_OWNED');if(!items.has(x.itemCfgId))fail('UNKNOWN_ITEM_CONFIG');return x;}
function move(inventory,item,bag,pos){const cfg=items.get(item.itemCfgId);if([1,2].includes(bag)&&cfg.itemType!==6)fail('ITEM_NOT_WEAPON');if(bag===4&&cfg.itemType!==11)fail('ITEM_NOT_EQUIPMENT');
 if(!Number.isInteger(pos)||pos<0||pos>=capacity(bag))fail('INVALID_BAG_POSITION');
 if(bag===2&&item.bagType!==2){const conflict=weaponFamily.duplicateInQuickbar(inventory,item,pos);if(conflict)fail('WEAPON_FAMILY_ALREADY_EQUIPPED');}
 const occupant=inventory.find(x=>x!==item&&x.bagType===bag&&x.bagPos===pos),oldBag=item.bagType,oldPos=item.bagPos;
 if(occupant){occupant.bagType=oldBag;occupant.bagPos=oldPos;}
 item.bagType=bag;item.bagPos=pos;
}
function equipData(inventory,currentUUID=''){
 const equipped=inventory.filter(x=>x.bagType===4),current=inventory.find(x=>x.uuid===currentUUID&&[1,2].includes(x.bagType));
 return {currentItemID:current?items.get(current.itemCfgId)?.args[0]||601000:601000,currentItemUUID:current?.uuid||'',curEquipmentsID:equipped.map(x=>x.itemCfgId),curEquipmentsUUID:equipped.map(x=>x.uuid)};
}
function equipmentProperty(base,inventory){
 const result=structuredClone(base),p=result.property;
 // Direct numeric properties whose meanings are present in PropertyScheme.
 const fields={2:'attack',5:'strengthRecover',24:'speed',32:'physicalResistance',33:'fireResistance',34:'poisonResistance',35:'thunderResistance',36:'iceResistance',38:'miss',39:'crit',40:'critHarm'};
 for(const item of inventory.filter(x=>x.bagType===4)){const cfg=equipment.get(item.itemCfgId);if(!cfg)continue;cfg.PropertyIDs.forEach((id,i)=>{const value=cfg.PropertyValues[i];if(id===1)result.maxHP+=value;else if(fields[id])p[fields[id]]=(p[fields[id]]||0)+value;});}
 result.maxHP=Math.max(1,result.maxHP);return result;
}
// One atomic players.json replacement contains both the removed item and its ground record.
// The changes are rolled back in memory when persistence fails, before any push is sent.
function commit(game,changes,persistent){
 const normalized=[];changes=[...changes];const relics=require('./relics-3127');
 if(persistent)for(const owner of new Set(changes.filter(([,k])=>k==='inventory').map(([o])=>o))){const copy=structuredClone(owner);for(const[o,k,v]of changes)if(o===owner)copy[k]=structuredClone(v);if(relics.normalize(copy)){for(const draft of changes.filter(([o,k])=>o===owner&&k==='inventory').map(([, ,v])=>v))normalized.push({relicDraft:draft,owner});changes.push([owner,'inventory',copy.inventory],[owner,'relicArchive',copy.relicArchive]);}}
 if(persistent){const collection=require('./collection-3127');for(const owner of new Set(changes.filter(([,k])=>k==='inventory').map(([o])=>o))){const copy=structuredClone(owner);for(const[o,k,v]of changes)if(o===owner)copy[k]=structuredClone(v);const delta=collection.normalize(copy);if(delta){const drafts=changes.filter(([o,k])=>o===owner&&k==='inventory').map(([, ,v])=>v);for(const key of ['inventory','heroProgress','ownedHeroes','pets','ownedSkins','mountList','fishRod'])if(Object.hasOwn(copy,key))changes.push([owner,key,copy[key]]);normalized.push({owner,delta,drafts});}}}
 const previous=[];for(const[o,k]of changes)if(!previous.some(([obj,key])=>obj===o&&key===k))previous.push([o,k,Object.hasOwn(o,k),o[k]]);
 try{for(const [o,k,v]of changes)o[k]=v;if(persistent)game.players.save();}catch(e){for(const [o,k,had,v]of previous){if(had)o[k]=v;else delete o[k];}throw Error('PERSISTENCE_FAILED',{cause:e});}
 for(const{owner,delta,drafts,relicDraft}of normalized){if(relicDraft){if(relicDraft!==owner.inventory)relicDraft.splice(0,relicDraft.length,...owner.inventory);relics.notifyInventory(game,owner);continue;}for(const draft of drafts)if(Array.isArray(draft)&&draft!==owner.inventory)draft.splice(0,draft.length,...owner.inventory);require('./collection-3127').notifyNormalized(game,owner,delta);}
}

function sortBag(items,bag){const reserved=new Set(items.filter(x=>x.bagType===bag&&x.extInfo.il===1).map(x=>x.bagPos));let pos=0;for(const item of items.filter(x=>x.bagType===bag&&x.extInfo.il!==1).sort((a,b)=>a.itemCfgId-b.itemCfgId||a.uuid.localeCompare(b.uuid))){while(reserved.has(pos))pos++;item.bagPos=pos++;}return items;}
function resultEvents(before,after){
 const events=[];
 for(const old of before){const current=after.find(x=>x.uuid===old.uuid);if(!current||current.bagType!==old.bagType||current.bagPos!==old.bagPos)events.push(['removeItem',{json:JSON.stringify({...old,num:0})}]);}
 for(const item of after){const old=before.find(x=>x.uuid===item.uuid);if(!old||JSON.stringify(old)!==JSON.stringify(item))events.push([old&&old.bagType===item.bagType&&old.bagPos===item.bagPos?'updateItem':'addItem',{json:JSON.stringify(item)}]);}
 return events;
}
const supported=new Set(['dropItem','pickUpItem','setToQuickLaunch','removeFromQuickLaunch','switchWeapon','equip','unEquipItem','useItem','requestProperty','sortPackage','lockItem']);
function relicsPiece(id){return require('./relics-3127').pieces.has(id);}
function runInventory(game,state,name,c){
 if(!supported.has(name))return null;
 if(name==='requestProperty')return {privateEvents:[['propertyResult',{propRes:state.world.entity.property}]],publicEvents:[],created:[],destroyed:[]};
 const before=inventoryOf(state),after=structuredClone(before),owner=state.world.level==='guide'?state.world:state.player,persistent=state.world.level!=='guide';
 let pickedDrop=null;const changes=[],created=[],destroyed=[],privateEvents=[],publicEvents=[];let selected=owner.currentWeaponUUID||'';
 if(name==='lockItem'){
  const item=findOwned(after,c.uuid,c.bagType);if(typeof c.lock!=='boolean')fail('INVALID_ITEM_LOCK');item.extInfo={...item.extInfo,il:c.lock?1:0};
 }else if(name==='dropItem'){
  const item=findOwned(after,c.uuid,c.bagType);if(item.extInfo.il===1)fail('ITEM_LOCKED');if(!Number.isInteger(c.num)||c.num<1||c.num>item.num)fail('INVALID_ITEM_COUNT');if(item.bagType===4)fail('UNEQUIP_BEFORE_DROP');
  if(groundRecords(game,state).length>=4096)fail('GROUND_ITEM_LIMIT');
  const dropped={...item,uuid:randomUUID(),num:c.num},drop={id:nextEntityId(game),room:roomKey(state),ownerId:state.user.id,item:dropped,x:state.world.entity.physics.x,y:state.world.entity.physics.y,createdAt:Date.now()};
  item.num-=c.num;if(!item.num)after.splice(after.indexOf(item),1);
  changes.push([owner,'groundDrops',[...(owner.groundDrops||[]),drop]]);created.push(dropEntity(drop));
 }else if(name==='pickUpItem'){
  const record=groundRecords(game,state).find(x=>x.drop.id===c.id);if(!record)fail('DROP_NOT_FOUND');const {drop}=record;pickedDrop=drop;
  if(drop.ownerId!==state.user.id&&Date.now()-drop.createdAt<PUBLIC_AFTER)fail('DROP_RESERVED');
  if(Math.hypot(drop.x-state.world.entity.physics.x,drop.y-state.world.entity.physics.y)>PICKUP_RADIUS)fail('DROP_TOO_FAR');
  const bag=defaultBag(drop.item.itemCfgId),cfg=items.get(drop.item.itemCfgId),cap=kinds.get(cfg.itemType)?.Caps||1;
  let count=drop.item.num;
  // Fill compatible stacks in a draft; an overflow aborts the entire pickup.
  for(const existing of after.filter(x=>x.itemCfgId===drop.item.itemCfgId&&x.bagType===bag&&JSON.stringify(x.extInfo)===JSON.stringify(drop.item.extInfo))){const limit=cap<0?2147483647:cap,n=Math.min(count,Math.max(0,limit-existing.num));existing.num+=n;count-=n;if(!count)break;}
  if(count>0&&(require('./collection-3127').entitlement(drop.item.itemCfgId)||relicsPiece(drop.item.itemCfgId))){after.push({...drop.item,uuid:randomUUID(),num:count,bagType:9,bagPos:-1});count=0;}
  while(count>0){const n=Math.min(count,cap<0?2147483647:cap);after.push({...drop.item,uuid:randomUUID(),bagType:bag,bagPos:freePosition(after,bag),num:n});count-=n;if(after.length>4096)fail('BAG_FULL');}
  changes.push([record.owner,'groundDrops',record.owner.groundDrops.filter(x=>x!==drop)]);destroyed.push(drop.id);privateEvents.push(['pickUpItem',{id:drop.item.itemCfgId,num:drop.item.num}]);
 }else if(name==='setToQuickLaunch'){
  const item=findOwned(after,c.uuid,c.bagType);if(![1,2].includes(item.bagType))fail('INVALID_SOURCE_BAG');move(after,item,2,c.index);
 }else if(name==='removeFromQuickLaunch'){
  const item=findOwned(after,c.uuid,c.bagType);if(item.bagType!==2)fail('INVALID_SOURCE_BAG');move(after,item,1,freePosition(after,1));
 }else if(name==='switchWeapon'){
  if(![1,2].includes(c.bagType)||![c.index1,c.index2].every(x=>Number.isInteger(x)&&x>=0&&x<capacity(c.bagType)))fail('INVALID_BAG_POSITION');
  const item=after.find(x=>x.bagType===c.bagType&&x.bagPos===c.index1);if(!item)fail('ITEM_NOT_OWNED');move(after,item,c.bagType,c.index2);
 }else if(name==='equip'||name==='useItem'){
  const item=findOwned(after,name==='equip'?c.equipmentID:c.uuid,name==='equip'?undefined:c.bagType),cfg=items.get(item.itemCfgId);
  if(cfg.itemType===6){if(![1,2].includes(item.bagType))fail('INVALID_SOURCE_BAG');selected=item.uuid;}
  else if(cfg.itemType===11){const def=equipment.get(item.itemCfgId);if(!def?.isValid||![3,4].includes(item.bagType))fail('INVALID_EQUIPMENT');if(item.bagType!==4){const previous=after.find(x=>x.bagType===4&&equipment.get(x.itemCfgId)?.Type===def.Type);move(after,item,4,previous?.bagPos??def.Type);}}
  else fail('ITEM_EFFECT_NOT_IMPLEMENTED');
 }else if(name==='unEquipItem'){
  const item=findOwned(after,c.uuid,4);move(after,item,3,freePosition(after,3));
 }else if(name==='sortPackage'){
  const bag=bagByTab[c.tabIndex];if(!bag)fail('INVALID_TAB');sortBag(after,bag);
 }
 const eqBefore=equipData(before,owner.currentWeaponUUID),eq=equipData(after,selected);selected=eq.currentItemUUID;
 const base=state.world.baseProperty||state.world.entity.property,derived=require('./player-skills-3127').applyProperty(require('./mounts-3127').apply(equipmentProperty(base,after),state),state,Date.now(),{inventory:after,currentWeaponUUID:selected});
 const property={...state.world.entity.property,maxHP:derived.maxHP,property:derived.property};
 property.HP=Math.min(state.world.entity.property.HP,property.maxHP);
 if(JSON.stringify(state.world.entity.property)!==JSON.stringify(property)){
  privateEvents.push(['propertyResult',{propRes:property}]);publicEvents.push(['setHP',{currentHP:property.HP,maxHP:property.maxHP}]);
 }
 privateEvents.push(...resultEvents(before,after.filter(i=>!require('./relics-3127').pieces.has(i.itemCfgId))));
 if(JSON.stringify(eq.curEquipmentsUUID)!==JSON.stringify(eqBefore.curEquipmentsUUID))privateEvents.push(['curEquipmentsUpdate',{equipUUIDs:eq.curEquipmentsUUID}]);
 if(eq.currentItemUUID!==eqBefore.currentItemUUID){privateEvents.push(['changeWeaponUUID',{uuid:eq.currentItemUUID}]);publicEvents.push(['changeWeapon',{weaponID:eq.currentItemID}]);}
 if(pickedDrop&&persistent)changes.push(...require('./relics-3127').planRecords(state,[{type:4,amount:pickedDrop.item.num,context:{itemID:pickedDrop.item.itemCfgId,mapID:state.world.mapId}}]));
 changes.push([owner,'inventory',after],[owner,'currentWeaponUUID',selected]);
 commit(game,changes,persistent);
 state.world.entity.item.items=after;state.world.entity.property=property;Object.assign(state.world.entity.equip,eq);
 if(pickedDrop){try{require('./boss-notices-3127').pickup(game,state,pickedDrop);}catch(e){console.warn('[PICKUP NOTICE]',e.message);}}
 return {privateEvents,publicEvents,created,destroyed};
}
function grantItems(game,player,id,count){
 const cfg=items.get(id);if(!cfg)fail('UNKNOWN_ITEM_CONFIG');if(!Number.isInteger(count)||count<1||count>1000000)fail('INVALID_ITEM_COUNT');
 const before=canonicalInventory(player.inventory||[]);const collection=require('./collection-3127');if(collection.entitlement(id)){const copy=structuredClone(player);copy.inventory=[...before,{uuid:randomUUID(),itemCfgId:id,num:count,bagType:9,bagPos:-1,extInfo:{}}];const delta=collection.normalize(copy);commit(game,['inventory','heroProgress','ownedHeroes','pets','ownedSkins','mountList'].filter(k=>Object.hasOwn(copy,k)).map(k=>[player,k,copy[k]]),true);collection.notifyNormalized(game,player,delta);return resultEvents(before,player.inventory);}
 const after=structuredClone(before),bag=defaultBag(id),limit=kinds.get(cfg.itemType)?.Caps||1;let remaining=count;
 for(const item of after.filter(x=>x.itemCfgId===id&&x.bagType===bag&&Object.keys(x.extInfo).length===0)){const n=Math.min(remaining,Math.max(0,(limit<0?2147483647:limit)-item.num));item.num+=n;remaining-=n;}
 while(remaining){const n=Math.min(remaining,limit<0?2147483647:limit);after.push({uuid:randomUUID(),itemCfgId:id,num:n,bagType:bag,bagPos:freePosition(after,bag),extInfo:{}});remaining-=n;}
 commit(game,[[player,'inventory',after]],true);return resultEvents(before,after);
}
module.exports={GROUND_LIFETIME,expired,expireGround,defaultBag,BAG,PICKUP_RADIUS,PUBLIC_AFTER,supported,items,equipment,weapons,capacity,gridCounts,canonicalInventory,inventoryOf,groundRecords,dropEntity,equipData,equipmentProperty,runInventory,grantItems,commit,resultEvents,move};

module.exports.sortBag=sortBag;
