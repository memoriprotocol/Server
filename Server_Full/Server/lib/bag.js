'use strict';
const {encode,decode,contract,typedError}=require('./codec');
const inventory=require('./inventory');
const routes=new Set(['game.bagHandler.moveItem','game.bagHandler.orderItems','game.bagHandler.dropItem','game.bagHandler.openGiftItem']);
function onBag(game,state,m){
 if(!routes.has(m.route))return false;
 const req=decode(contract.requests[m.route],m.body),type=contract.responses[m.route];
 try{
  if(m.route.endsWith('openGiftItem')){
   const gifts=new Map(require('../config/schemes/GiftScheme.json').gift.map(x=>[x.ID,x]));
   const before=inventory.canonicalInventory(state.player.inventory||[]);
   const source=before.find(x=>x.uuid===req.uuid&&x.bagType===req.bagType);
   const count=Number(req.count||1);
   if(!source||!Number.isSafeInteger(count)||count<1||count>10||source.num<count)throw Error('GIFT_ITEM_NOT_OWNED');
   const gift=gifts.get(source.itemCfgId);
   if(!gift||gift.giftType!==1||gift.awardPool!==0||!gift.awardIDs.length||gift.awardIDs.length!==gift.awardNums.length)throw Error('UNVERIFIED_GIFT_POOL');
   if(gift.awardIDs.some((id,i)=>!inventory.items.has(id)||!Number.isSafeInteger(gift.awardNums[i])||gift.awardNums[i]<1))throw Error('INVALID_GIFT_REWARD');
   const {afterGrant}=require('./commerce-3127');
   let after=structuredClone(before),existing=after.find(x=>x.uuid===req.uuid);
   existing.num-=count;if(!existing.num)after=after.filter(x=>x!==existing);
   for(let i=0;i<gift.awardIDs.length;i++)after=afterGrant(after,gift.awardIDs[i],gift.awardNums[i]*count);
   inventory.commit(game,[[state.player,'inventory',after]],true);
   if(state.world?.entity?.item)state.world.entity.item.items=after;
   game.reply(state,m.id,encode(type,{code:0,items:gift.awardIDs.map((id,i)=>({id,num:gift.awardNums[i]*count})),openOkCount:count}));
   game.push?.(state,'bagItemUpdatePsh',encode('BagItemUpdatePsh',{list:after}));
   if(state.world?.sceneReady){const events=inventory.resultEvents(before,after);
    if(events.length)require('./world').inventoryPush(game,state,{privateEvents:events,publicEvents:[],created:[],destroyed:[]});}
   return true;
  }
  if(m.route.endsWith('dropItem')){
   // A lobby has no ground coordinate. Reject rather than silently destroy the item.
   if(!state.world?.sceneReady)throw Error('ENTER_WORLD_BEFORE_DROP');
   const result=inventory.runInventory(game,state,'dropItem',req);
   game.reply(state,m.id,encode(type,{code:0}));require('./world').inventoryPush(game,state,result);return true;
  }
  if(![1,2,3,5,8,9].includes(req.bagType))throw Error('INVALID_BAG_TYPE');
  const before=inventory.inventoryOf(state),after=structuredClone(before);
  if(m.route.endsWith('moveItem')){
   const item=after.find(x=>x.bagType===req.bagType&&x.bagPos===req.fromPos);if(!item)throw Error('ITEM_NOT_OWNED');inventory.move(after,item,req.bagType,req.toPos);
  }else inventory.sortBag(after,req.bagType);
  const owner=state.world?.level==='guide'?state.world:state.player;
  inventory.commit(game,[[owner,'inventory',after]],owner===state.player);
  game.reply(state,m.id,encode(type,{code:0,items:after.filter(x=>x.bagType===req.bagType)}));
  if(state.world?.sceneReady){state.world.entity.item.items=after;require('./world').inventoryPush(game,state,{privateEvents:inventory.resultEvents(before,after),publicEvents:[],created:[],destroyed:[]});}
  else game.push(state,'bagItemUpdatePsh',encode('BagItemUpdatePsh',{list:after.filter(x=>x.bagType===req.bagType)}));
 }catch(e){game.reply(state,m.id,typedError(m.route,e.message));}
 return true;
}
module.exports={onBag,routes};
