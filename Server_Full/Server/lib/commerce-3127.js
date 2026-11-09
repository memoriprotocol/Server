'use strict';
// Local transaction adapter for February 2024 protobuf types. Server-owned offers
// are NOT a reconstruction of original live-shop inventory or real-money billing.
const {randomUUID,randomInt}=require('node:crypto');
const {encode}=require('./codec');
const {proto}=require('./proto');
const inventory=require('./inventory');
const config=require('../config/local-commerce-3127.json');
const itemTypes=new Map(require('../config/schemes/ItemTypScheme.json').ItemTyp.map(r=>[r.ItemType,r]));
const wheel=require('../config/schemes/TraderDrawDropScheme.json').TraderDrawDrop;
const wheelCosts=new Map(require('../config/schemes/TraderDrawScheme.json').TraderDraw.map(r=>[r.ID,r.gold]));
const weapons=new Set(inventory.weapons.map(w=>Number(w.weaponID)));
const localPrizes=new Map(config.traderWheelLocalPrizes.map(r=>[r.position,r]));
const offers=new Map(config.shopOffers.map(r=>[r.id,r]));
const skins=new Map(require('../config/schemes/SkinScheme.json').Skin.map(x=>[x.ID,x]));
const heroesById=new Map(require('../config/schemes/HeroScheme.json').Hero.map(x=>[x.ID,x]));
const petsById=new Map(require('../config/schemes/PetContent.json').PetCfg.map(x=>[x.PetID,x]));
const heroShardIcons=new Map(require('../config/schemes/ShardsScheme.json').Shards.map(x=>[x.ID,x.Icon]));
const petShardIcons=new Map(require('../config/schemes/PetShardsScheme.json').PetShards.map(x=>[x.ID,x.Icon]));
const heroShardIds=new Set(heroShardIcons.keys());
const petShardIds=new Set(require('../config/schemes/PetShardsScheme.json').PetShards.map(x=>x.ID));
const gifts=new Map(require('../config/schemes/GiftScheme.json').gift.map(x=>[x.ID,x]));
const validShopTypes=new Set(Array.from({length:10},(_,i)=>i));
const skinProducts=new Map(config.shopOffers.filter(x=>x.skinId && x.shopType===1).map(x=>[x.skinId,x]));
function validateConfig(){
 for(const row of [...config.shopOffers,...config.traderWheelLocalPrizes]){
  if(!inventory.items.has(row.itemId)||!Number.isSafeInteger(row.count)||row.count<1)throw Error('UNSAFE_LOCAL_COMMERCE_ITEM '+row.itemId);
 }
 for(const id of config.draw2024Local.heroPool)if(!heroesById.has(id))throw Error('BAD_2024_DRAW_HERO '+id);
 for(const id of config.draw2024Local.petPool)if(!petsById.has(id))throw Error('BAD_2024_DRAW_PET '+id);
 for(const id of config.weaponDraw.weaponIds)if(!weapons.has(id))throw Error('BAD_WEAPON_DRAW_ID '+id);
 for(const row of wheel)if(!localPrizes.has(row.Position))throw Error('WHEEL_PRIZE_MISSING '+row.Position);
}
validateConfig();
function afterGrant(before,itemId,count){
 if(!Number.isSafeInteger(count)||count<=0||count>1000000)throw Error('INVALID_REWARD_COUNT');
 const cfg=inventory.items.get(itemId);if(!cfg)throw Error('INVALID_2024_ITEM_ID');
 const after=structuredClone(before);const tab={0:1,1:3,2:5,3:8,6:9}[itemTypes.get(cfg.itemType)?.Tab]||9;
 const cap=heroShardIds.has(itemId)||petShardIds.has(itemId)?-1:Number(itemTypes.get(cfg.itemType)?.Caps)||1;
 let remaining=count;
 for(const x of after.filter(x=>x.itemCfgId===itemId&&x.bagType===tab&&!Object.keys(x.extInfo||{}).length)){
  const n=Math.min(remaining,Math.max(0,(cap<0?2147483647:cap)-x.num));x.num+=n;remaining-=n;
 }
 const used=new Set(after.filter(x=>x.bagType===tab).map(x=>x.bagPos));
 while(remaining){let pos=-1;for(let i=0;i<inventory.capacity(tab);i++)if(!used.has(i)){pos=i;break;}
  if(pos<0||after.length>=4096)throw Error('BAG_FULL');
  const n=Math.min(remaining,cap<0?2147483647:cap);after.push({uuid:randomUUID(),itemCfgId:itemId,num:n,extInfo:{},bagType:tab,bagPos:pos});used.add(pos);remaining-=n;
 }
 const err=proto.Item.verify(after[after.length-1]);if(err)throw Error('INVALID_ITEM_PROTOBUF '+err);
 return after;
}
function spendGrant(game,state,cost,itemId,count,costId=109){
 const p=state.player,old=inventory.canonicalInventory(p.inventory||[]),currency=costId===111?'diamond':'coin',coin=Number(p[currency])||0;
 if(!Number.isSafeInteger(cost)||cost<0)throw Error('BAD_PRICE');
 if(coin<cost)throw Error('NOT_ENOUGH_COIN');
 const collection=require('./collection-3127'),plan=collection.isShard(itemId)?collection.plan(p,[{itemId,count}],old):null,next=plan?plan.inventory:collection.entitlement(itemId)?[...old,{uuid:randomUUID(),itemCfgId:itemId,num:count,bagType:9,bagPos:-1,extInfo:{}}]:afterGrant(old,itemId,count);inventory.commit(game,[[p,currency,coin-cost],...(plan?plan.changes:[[p,'inventory',next]]),...require('./passes-3127').planCoinSpend(game.adminService,state,cost,currency)],true);if(plan)collection.push(game,state,plan);
 if(state.world?.entity?.item)state.world.entity.item.items=next;
 emitAccount(game,state,old,next);
 return {id:itemId,num:count,coin:coin-cost};
}
function emitAccount(game,state,before,after){
 const {profile}=require('./profile');
 game.push?.(state,'updateCoin',encode('CoinUpdatePush',{coin:state.player.coin||0}));
 game.push?.(state,'updateDiamond',encode('DiamondUpdatePush',{diamond:state.player.diamond||0}));
 game.push?.(state,'updatePlayer',encode('PlayerInfo',profile(state.user,state.player)));
 // The world uses entity events for inventory deltas, not a fabricated lobby push.
 if(state.world?.sceneReady&&state.world.entity){
  const {entityEventData}=require('./world');
  const events=inventory.resultEvents(before,after).map(([name,data])=>entityEventData(state.world.entity,name,data));
  if(events.length){const {encode:pb}=require('./codec');game.push?.(state,'rm',pb('ReplicateMsg',{events}));}
 }
}
function rollWeighted(rows,key='weight'){
 const total=rows.reduce((n,r)=>n+Math.max(0,Number(r[key])||0),0);if(!Number.isSafeInteger(total)||total<=0)throw Error('EMPTY_DRAW_POOL');
 let pick=randomInt(total);for(const r of rows){pick-=Math.max(0,Number(r[key])||0);if(pick<0)return r;}throw Error('DRAW_WEIGHT_ERROR');
}
function wheelSpin(game,state,tier){
 const w=state.world;if(!w?.sceneReady||!w.entity)throw Error('WORLD_NOT_READY');
 const cost=wheelCosts.get(tier);if(cost===undefined)throw Error('UNKNOWN_2024_TRADER_DRAW_TIER');
 const winner=rollWeighted(wheel),prize=localPrizes.get(winner.Position);
 // Atomic local-wallet charge and verified-client item reward. Position weights
 // are authentic; prize item IDs and coin wallet are explicitly LOCAL mappings.
 const result=spendGrant(game,state,cost,prize.itemId,prize.count);
 w.draws=(w.draws||0)+1;w.entity.draw={count:w.draws};
 return {position:winner.Position,prize:{id:prize.itemId,num:prize.count},cost,coin:result.coin,draw:{count:w.draws}};
}
function catalog(shopType){
 if(!Number.isInteger(shopType)||shopType<0||shopType>255)throw Error('INVALID_SHOP_TYPE');
 // The February 2024 client resolves both itemId AND costId through ItemScheme.
 // Stage 19 sent costId=0, which caused null.icon in the Cocos UI.
 const sourceType=validShopTypes.has(shopType)&&shopType>0?shopType:2;
 // Gift is a client-side projection of native shop tabs, SaleType.present = 64.
 // Type 6 remains a compatibility query, but login requests only types 1..5,7..9.
 const time=Math.floor(Date.now()/1000);
 const rows=config.shopOffers.filter(r=>(sourceType===6?r.giftable:(r.shopTypes||[r.shopType]).includes(sourceType))&&r.enabled!==false&&(!r.salesStart||r.salesStart<=time)&&(!r.salesEnd||r.salesEnd>=time));
 return rows.map((r,index)=>({id:r.id,shopType,name:r.name||inventory.items.get(r.itemId).name,sort:r.sort||index+1,
  itemId:r.itemId,count:r.count,saleType:r.giftable?64:0,costId:r.costId,price:r.price,discountPrice:r.price,
  countLimit:r.personalLimit||(r.skinId?1:0),presentPrice:r.giftable?r.presentPrice||r.price:0,presentRefundPrice:r.giftable?r.presentRefundPrice||0:0,
  giftItems:gifts.has(r.itemId)?gifts.get(r.itemId).awardIDs.map((id,i)=>({id,num:gifts.get(r.itemId).awardNums[i]})).filter(x=>x.num>0&&inventory.items.has(x.id)):[]}));
}
function validateVisibleOffers(){
 for(const t of validShopTypes){const entries=catalog(t);if(!entries.length)throw Error('EMPTY_2024_SHOP_TAB '+t);
  for(const r of entries){
   const item=inventory.items.get(r.itemId),cost=inventory.items.get(r.costId);
   const special=heroShardIcons.get(r.itemId)||petShardIcons.get(r.itemId);if(!(item?.icon||special)||!cost?.icon||!Number.isSafeInteger(r.price)||r.price<=0)throw Error('SHOP_INVALID_CLIENT_SPRITE '+r.id);
  }
 }
}
validateVisibleOffers();
function skinOwned(player,skinId){return (player.ownedSkins||[]).includes(skinId)||heroBaseSkinIds.has(skinId);}
const heroRows=require('../config/schemes/HeroScheme.json').Hero;
const heroBaseSkinIds=new Set(heroRows.map(x=>x.Skins[0]));
function buySkin(game,state,skinId,shopPrice){
 const item=skins.get(skinId),p=state.player;
 if(!item||!skinProducts.has(skinId)||!heroRows.some(h=>h.ID===item.HeroId&&h.Skins.includes(skinId)))throw Error('SKIN_NOT_IN_2024_STORE');
 if(skinOwned(p,skinId))throw Error('SKIN_ALREADY_OWNED');
 const price=shopPrice?.price??item.Price,costId=shopPrice?.costId??item.CostID;
 if(costId!==111)throw Error('NON_DIAMOND_SKIN_REQUIRES_CURRENCY_ADAPTER');
 if(!Number.isSafeInteger(price)||price<0)throw Error('UNVERIFIED_SKIN_PRICE');
 const old=Number(p.diamond)||0;
 if(old<price)throw Error('NOT_ENOUGH_DIAMOND');
 inventory.commit(game,[[p,'diamond',old-price],[p,'ownedSkins',[...(p.ownedSkins||[]),skinId]]],true);
 const {profile}=require('./profile');
 game.push?.(state,'updateDiamond',encode('DiamondUpdatePush',{diamond:p.diamond}));
 require('./collection-3127').push(game,state,{heroes:require('./collection-3127').allHeroes(p),pets:p.pets||[]});
 game.push?.(state,'addSkinPush',encode('AddSkinPush',{skinId,heroId:item.HeroId}));
 game.push?.(state,'updatePlayer',encode('PlayerInfo',profile(state.user,p)));
 game.push?.(state,'updateRole',encode('HeroList',{heros:profile(state.user,p).heros}));
 return skinId;
}
function handle(game,state,m,request={}){
 const route=m.route;const reply=(type,payload)=>{if(m.type===0)game.reply(state,m.id,encode(type,payload));};
 if(route==='game.shopHandler.queryShopItem'){
  const shopType=Number(request.shopType)||0;
  if(!Number.isInteger(shopType)||shopType<0||shopType>255){reply('QueryShopItemRsp',{code:1,list:[]});return true;}
  const result=catalog(shopType);if(!state.shopCatalogLogged)state.shopCatalogLogged=new Set();if(!state.shopCatalogLogged.has(shopType)){console.info(`[SHOP 2024] uid=${state.user?.id||'?'} shopType=${shopType} offers=${result.length} ids=${result.slice(0,5).map(x=>x.itemId).join(',')}`);state.shopCatalogLogged.add(shopType);}reply('QueryShopItemRsp',{code:0,list:result});return true;
 }
 if(route==='game.shopHandler.buyShopItem'){
  let rsp={code:1};const beforePurchase=structuredClone(state.player),beforeAdmin=game.adminService?structuredClone(game.adminService.db):null;try{
   if(m.type!==0)throw Error('REQUEST_REQUIRED');
   const offer=offers.get(Number(request.id)),num=Object.hasOwn(request,'count')?Number(request.count):1,shopType=Number(request.shopType)||0;
   if(!offer||!Number.isInteger(num)||num<1||num>20||!Number.isInteger(shopType)||shopType<0||shopType>255)throw Error('INVALID_SHOP_PURCHASE');
   if(offer.shopType>=0&&!(offer.shopTypes||[offer.shopType]).includes(shopType)&&!(shopType===0&&offer.shopType===2)&&!(shopType===6&&offer.giftable))throw Error('SHOP_TYPE_MISMATCH');
   game.adminService?.checkPurchase(state,offer,num);
   if(offer.grantType==='mount'){
    if(num!==1)throw Error('MOUNT_SINGLE_PURCHASE');
    const currency=offer.costId===111?'diamond':'coin',old=Number(state.player[currency])||0;
    if(old<offer.price)throw Error('NOT_ENOUGH_'+currency.toUpperCase());
    if((state.player.mountList||[]).some(m=>Number(m.id||m.mountId||m)===offer.itemId))throw Error('MOUNT_ALREADY_OWNED');
    const owned=[...require('./mounts-3127').owned(state.player),offer.itemId];
    inventory.commit(game,[[state.player,currency,old-offer.price],[state.player,'mountList',owned],...require('./passes-3127').planCoinSpend(game.adminService,state,offer.price,currency)],true);
    rsp={code:0,rewards:[{id:offer.itemId,num:1}]};
   }else if(offer.skinId){
    if(num!==1)throw Error('SKIN_ONE_PER_PLAYER');
    buySkin(game,state,offer.skinId,offer);
    rsp={code:0,rewards:[{id:offer.itemId,num:1}]};
   }else{
    if(![109,111].includes(offer.costId))throw Error('SHOP_CURRENCY_NOT_SUPPORTED');
    const cost=offer.price*num,count=offer.count*num;
    spendGrant(game,state,cost,offer.itemId,count,offer.costId);rsp={code:0,rewards:[{id:offer.itemId,num:count}]};
   }
   if(rsp.code===0)game.adminService?.recordPurchase(state,offer,num);
   if(rsp.code===0&&offer.grantType==='mount')try{const currency=offer.costId===111?'diamond':'coin';game.push?.(state,currency==='diamond'?'updateDiamond':'updateCoin',encode(currency==='diamond'?'DiamondUpdatePush':'CoinUpdatePush',{[currency]:state.player[currency]}));require('./mounts-3127').notifyOwned(game,state,offer.itemId);}catch(e){console.warn('[MOUNT DELIVERY] committed:',e.message);}
  }catch(e){Object.keys(state.player).forEach(k=>delete state.player[k]);Object.assign(state.player,beforePurchase);if(game.adminService){game.adminService.db=beforeAdmin;try{game.adminService.players.save();game.adminService.flush();game.adminService.sync(state.user.id);}catch(_){}}rsp={code:1};game.commerceErrors?.set(route+':'+e.message,(game.commerceErrors.get(route+':'+e.message)||0)+1);}
  reply('BuyShopItemRsp',rsp);return true;
 }
 if(route==='game.gameHandler.reqSkins'){
  const current=state.player.ownedSkins||[];
  reply('SkinsRsp',{skinsId:[...new Set([...heroBaseSkinIds,...current])]});return true;
 }
 if(route==='game.gameHandler.reqCurSkin'){
  reply('CurSkinRsp',{curSkinId:state.player.curSkinId||require('./profile').heroData(state.player).curSkinId});return true;
 }
 if(route==='game.gameHandler.reqBuySkin'){
  let result={code:1,message:'INVALID_SKIN'};
  try{buySkin(game,state,Number(request.skinId));result={code:0,message:''};}
  catch(e){game.commerceErrors?.set(route+':'+e.message,(game.commerceErrors.get(route+':'+e.message)||0)+1);result.message=e.message;}
  reply('BuySkinRsp',result);return true;
 }
 if(route==='game.gameHandler.reqEquipSkin'){
  let result={code:1,message:'SKIN_NOT_OWNED'};
  const id=Number(request.skinId),cfg=skins.get(id),hero=heroRows.find(h=>h.ID===Number(state.player.heroId||1));
  if(cfg&&hero&&hero.Skins.includes(id)&&skinOwned(state.player,id)){
   try{inventory.commit(game,[[state.player,'curSkinId',id]],true);
    game.push?.(state,'updateRole',encode('HeroList',{heros:[require('./profile').heroData(state.player)]}));result={code:0,message:''};}
   catch(e){result.message=e.message;}
  }
  reply('EquipSkinRsp',result);return true;
 }
 if(route==='game.shopHandler.givePresent'){
  let rsp={code:1};const beforePurchase=structuredClone(state.player),beforeAdmin=game.adminService?structuredClone(game.adminService.db):null;try{
   const offer=offers.get(Number(request.id)),name=String(request.recipient||'').trim();
   if(!offer?.giftable||!name||!Number.isInteger(Number(request.count))||Number(request.count)!==1)throw Error('INVALID_GIFT_OFFER');
   const target=(game.accounts.db?.accounts||[]).find(u=>String(u.username).toLowerCase()===name.toLowerCase()||String(u.id)===name);
   if(!target||target.id===state.user.id)throw Error('RECIPIENT_NOT_FOUND');
   const player=game.players.ensure(target);
   if(![109,111].includes(offer.costId))throw Error('GIFT_CURRENCY_UNSUPPORTED');
   const currency=offer.costId===111?'diamond':'coin',balance=Number(state.player[currency])||0;
   const giftPrice=offer.presentPrice||offer.price;
   if(!Number.isSafeInteger(giftPrice)||giftPrice<=0||balance<giftPrice)throw Error('GIFT_BALANCE_NOT_ENOUGH');
   if(offer.grantType==='mount'){
    if((player.mountList||[]).some(m=>Number(m.id||m.mountId||m)===offer.itemId))throw Error('RECIPIENT_OWNS_MOUNT');
    inventory.commit(game,[[state.player,currency,balance-giftPrice],[player,'mountList',[...require('./mounts-3127').owned(player),offer.itemId]],...require('./passes-3127').planCoinSpend(game.adminService,state,giftPrice,currency)],true);
   }else if(offer.skinId){
    if((player.ownedSkins||[]).includes(offer.skinId))throw Error('RECIPIENT_OWNS_SKIN');
    inventory.commit(game,[[state.player,currency,balance-giftPrice],[player,'ownedSkins',[...(player.ownedSkins||[]),offer.skinId]],...require('./passes-3127').planCoinSpend(game.adminService,state,giftPrice,currency)],true);
   }else throw Error('GIFT_TYPE_UNSUPPORTED');
   game.push?.(state,currency==='diamond'?'updateDiamond':'updateCoin',encode(currency==='diamond'?'DiamondUpdatePush':'CoinUpdatePush',{[currency]:state.player[currency]}));
   if(offer.grantType==='mount')for(const peer of game.online||[])if(peer.user?.id===target.id)require('./mounts-3127').notifyOwned(game,peer,offer.itemId);
   game.broadcastPlayer?.(target.id);rsp={code:0};
  }catch(e){game.commerceErrors?.set(route+':'+e.message,(game.commerceErrors.get(route+':'+e.message)||0)+1);}
  reply('GivePresentRsp',rsp);return true;
 }
 if(route==='game.drawHandler.getWeapons'){
  reply('GetWeaponsRsp',{code:0,weapons:(state.player.weapons||[]).map(x=>({weaponId:x.weaponId,affection:x.affection||0,statusShow:x.statusShow||0}))});return true;
 }
 if(route==='game.drawHandler.draw'){
  if(m.type!==0)return true;
  let rsp={code:1,message:'INVALID_NATIVE_2024_DRAW',typ:Number(request.typ)||0};
  try{
   const typ=Number(request.typ),drawType=Number(request.drawType);
   const kind=typ===0?'hero':typ===1?'pet':null,n=[1,10,50][drawType];
   if(!kind||!Number.isInteger(drawType)||!n)throw Error('BAD_NATIVE_DRAW_REQUEST');
   const day=new Date().toISOString().slice(0,10),p=state.player;
   const counts=p.freeDrawDay===day?(p.freeDrawCount||{}):{heroFreeDraw:0,petFreeDraw:0};
   const key=kind==='hero'?'heroFreeDraw':'petFreeDraw';
   const constants=new Map(require('../config/schemes/ConstantsScheme.json').Constants.map(r=>[r.name,r.content]));
   const free=n===1&&Number(counts[key]||0)<Number(constants.get(kind==='hero'?'heroDrawFreeCount':'petDrawFreeCount')?.[0]||1);
   const coupon=kind==='hero'?80032001:80033001,before=inventory.canonicalInventory(p.inventory||[]);
   const useCoupon=!free&&before.filter(i=>i.itemCfgId===coupon).reduce((n,i)=>n+i.num,0)>=n;
   const costs=kind==='hero'?['heroSingleDrawCost','heroDrawHCost','heroDrawFiftyCost']:['petSingleDrawCost','petDrawHCost','PetDrawFiftyCost'];
   const cost=free||useCoupon?0:Number(constants.get(costs[drawType])?.[0]);const coin=Number(p.coin)||0;
   if(!Number.isSafeInteger(cost)||cost<0)throw Error('INVALID_NATIVE_DRAW_COST');if(coin<cost)throw Error('NOT_ENOUGH_COIN');
   const group=Number(constants.get(kind==='hero'?'drawHeroDropId':'drawPetDropId')?.[0]||(kind==='hero'?3001:3002));
   const nativeRewards=Array.from({length:n},()=>require('./progression-3127').rollGroup(group)).flat();
   const shardIds=nativeRewards.flatMap(r=>Array.from({length:r.count},()=>r.itemId));
   const valid=kind==='hero'?heroShardIds:petShardIds;
   for(const shard of shardIds)if(!valid.has(shard)||!inventory.items.has(shard))throw Error('INVALID_CLIENT_2024_SHARD_ID '+shard);
   let after=structuredClone(before);
   if(useCoupon){let remaining=n;for(const item of after){if(item.itemCfgId===coupon){const take=Math.min(remaining,item.num);item.num-=take;remaining-=take;}}after=after.filter(i=>i.num>0);}
   const collection=require('./collection-3127').plan(p,nativeRewards,after);after=collection.inventory;
   const freeDrawCount={...counts,[key]:Number(counts[key]||0)+(free?1:0)};
   inventory.commit(game,[[p,'coin',coin-cost],[p,'freeDrawDay',day],[p,'freeDrawCount',freeDrawCount],...collection.changes,...require('./passes-3127').planRecords(game.adminService,state,[{type:kind==='hero'?10:11,amount:n},...(cost?[{type:2,amount:cost}]:[])])],true);
   if(state.world?.entity?.item)state.world.entity.item.items=after;
   const countsByItem=new Map();for(const id of shardIds)countsByItem.set(id,(countsByItem.get(id)||0)+1);
   rsp={code:0,message:'',typ,heroes:collection.heroes,pets:collection.pets,items:[...countsByItem].map(([id,num])=>{return{uuid:randomUUID(),itemCfgId:id,num,bagType:9,bagPos:0,extInfo:{}};}),freeDrawCount,backBraveShards:collection.backBraveShards};
   try{require('./collection-3127').syncActive(game,state);game.push?.(state,'updateDraw',encode('DrawRsp',rsp));emitAccount(game,state,before,after);}catch(e){console.warn('[DRAW DELIVERY] committed:',e.message);}
   // Native reward popup reads the already-updated collection through updateDraw.
  }catch(e){rsp.message=e.message;game.commerceErrors?.set(route+':'+e.message,(game.commerceErrors.get(route+':'+e.message)||0)+1);} 
  console.info(`[DRAW 2024] uid=${state.user?.id||'?'} typ=${request.typ} drawType=${request.drawType} result=${rsp.code===0?'ok':rsp.message} shards=${(rsp.items||[]).map(i=>i.itemCfgId+'x'+i.num).join(',')} free=${JSON.stringify(rsp.freeDrawCount||{})}`);
  reply('DrawRsp',rsp);return true;
 }
 if(route==='game.drawHandler.drawWeapon'){
  if(m.type!==0)return true;
  let rsp={code:1};const beforePurchase=structuredClone(state.player),beforeAdmin=game.adminService?structuredClone(game.adminService.db):null;try{
   if(!config.weaponDraw.allowedDrawType.includes(Number(request.drawType)))throw Error('UNVERIFIED_WEAPON_DRAW_TYPE');
   const weaponId=config.weaponDraw.weaponIds[randomInt(config.weaponDraw.weaponIds.length)];
   const old=inventory.canonicalInventory(state.player.inventory||[]),coin=Number(state.player.coin)||0;
   if(coin<config.weaponDraw.price)throw Error('NOT_ENOUGH_COIN');
   const already=(state.player.weapons||[]).some(w=>Number(w.weaponId)===weaponId);
   const after=afterGrant(old,weaponId,1);
   const record={weaponId,affection:0,statusShow:0};
   inventory.commit(game,[[state.player,'coin',coin-config.weaponDraw.price],[state.player,'inventory',after],[state.player,'weapons',already?(state.player.weapons||[]):[...(state.player.weapons||[]),record]],...require('./passes-3127').planCoinSpend(game.adminService,state,config.weaponDraw.price)],true);
   if(state.world?.entity?.item)state.world.entity.item.items=after;
   emitAccount(game,state,old,after);
   rsp={code:0,items:[{id:weaponId,num:1}],weapons:already?[]:[record],newWeaponIds:already?[]:[weaponId],upWeaponIds:[],shardBackWeaponIds:[]};
  }catch(e){game.commerceErrors?.set(route+':'+e.message,(game.commerceErrors.get(route+':'+e.message)||0)+1);}
  reply('DrawWeaponRsp',rsp);return true;
 }
 return false;
}
function replaceOffers(rows){const copy=structuredClone(rows);config.shopOffers.splice(0,config.shopOffers.length,...copy);offers.clear();skinProducts.clear();for(const r of copy){offers.set(r.id,r);if(r.skinId)skinProducts.set(r.skinId,r);}}
module.exports={replaceOffers,config,offers,catalog,validateVisibleOffers,afterGrant,spendGrant,wheelSpin,rollWeighted,handle};
