'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {Accounts}=require('../lib/accounts'),{Players}=require('../lib/players'),{GameServer}=require('../lib/game');
const {encode,decode}=require('../lib/codec');
const contract=require('../CLIENT_CONTRACT_3127.json');
const commerce=require('../lib/commerce-3127'),inventory=require('../lib/inventory');
const {profile}=require('../lib/profile');
const skins=new Map(require('../config/schemes/SkinScheme.json').Skin.map(x=>[x.ID,x]));
const shardIcons=new Map([...require('../config/schemes/ShardsScheme.json').Shards,...require('../config/schemes/PetShardsScheme.json').PetShards].map(x=>[x.ID,x.Icon]));
const nativeIcon=(id)=>inventory.items.get(id)?.icon||shardIcons.get(id);
function fixture(){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hl-shop20-'));
 const accounts=new Accounts(path.join(dir,'accounts.json'));accounts.register({username:'storetest',password:'password123'});
 const players=new Players(path.join(dir,'players.json')),game=new GameServer(accounts,players);
 const user=accounts.userById(1),state={user,player:players.ensure(user)},reply=[],push=[];
 game.reply=(_s,_id,b)=>reply.push(b);game.push=(_s,r,b)=>push.push({route:r,bytes:b});
 function rpc(route,req={}){const type=contract.requests[route],rsp=contract.responses[route];assert.ok(type&&rsp,route);const payload=encode(type,req);assert.deepEqual(decode(type,payload).toJSON(),decode(type,payload).toJSON());assert.equal(commerce.handle(game,state,{route,type:0,id:1,body:payload},req),true);return decode(rsp,reply.at(-1));}
 return {state,game,rpc,push,close(){clearInterval(game.worldTimer);game.heartbeats.stop();fs.rmSync(dir,{recursive:true,force:true});}};
}
test('all 2024 shop tabs encode/decodes and every item/currency icon exists',()=>{const t=fixture();try{
 assert.equal(commerce.validateVisibleOffers(),undefined);
 for(let type=0;type<10;type++){
  const a=t.rpc('game.shopHandler.queryShopItem',{shopType:type});assert.equal(a.code,0);assert.ok(a.list.length,'tab '+type);
  for(const row of a.list){assert.equal(row.shopType,type);assert.ok(nativeIcon(row.itemId),row.itemId);
   assert.ok(inventory.items.get(row.costId)?.icon,row.costId);assert.ok(row.price>0);
   const entry=commerce.offers.get(row.id);assert.ok(entry);if(type>0&&type!==6)assert.equal(entry.shopType,type);if(type===6)assert.equal(entry.giftable,true);
  }
 }
 }finally{t.close();}});
test('skin tab ShopType 1: item->SkinScheme id, genuine cost and currency, not missing ID',()=>{const t=fixture();try{
 const res=t.rpc('game.shopHandler.queryShopItem',{shopType:1});assert.ok(res.list.length>=30);
 for(const r of res.list){const c=inventory.items.get(r.itemId),skin=skins.get(c.args[0]);assert.equal(c.itemType,27);assert.ok(skin?.ShowInStore);assert.equal(skin.ID,c.args[0]);assert.equal(r.costId,skin.CostID);assert.equal(r.price,skin.Price);}
 }finally{t.close();}});
test('skin purchase uses real SkinScheme price, atomically persists ownership, replies with correct proto',()=>{const t=fixture();try{
 const shop=t.rpc('game.shopHandler.queryShopItem',{shopType:1}),offer=shop.list[0],sid=inventory.items.get(offer.itemId).args[0];
 t.state.player.diamond=offer.price+10;t.state.player.coin=123;
 let res=t.rpc('game.shopHandler.buyShopItem',{id:offer.id,count:1,shopType:1});assert.equal(res.code,0);
 assert.equal(t.state.player.diamond,10);assert.equal(t.state.player.coin,123);assert.ok(t.state.player.ownedSkins.includes(sid));
 assert.ok(profile(t.state.user,t.state.player));assert.ok(t.push.some(x=>x.route==='addSkinPush'));
 const old=t.state.player.diamond;res=t.rpc('game.shopHandler.buyShopItem',{id:offer.id,count:1,shopType:1});assert.notEqual(res.code,0);assert.equal(t.state.player.diamond,old);
 assert.ok(t.rpc('game.gameHandler.reqSkins').skinsId.includes(sid));
 const bad=t.rpc('game.gameHandler.reqBuySkin',{skinId:900009});assert.notEqual(bad.code,0);
 }finally{t.close();}});
test('different shop tab / insufficient funds cannot grant inventory or modify wallet',()=>{const t=fixture();try{
 const shop=t.rpc('game.shopHandler.queryShopItem',{shopType:2}),offer=shop.list[0];t.state.player.coin=1;
 const original=JSON.stringify(t.state.player.inventory);
 assert.notEqual(t.rpc('game.shopHandler.buyShopItem',{id:offer.id,count:1,shopType:1}).code,0);
 assert.notEqual(t.rpc('game.shopHandler.buyShopItem',{id:offer.id,count:1,shopType:2}).code,0);
 assert.equal(t.state.player.coin,1);assert.equal(JSON.stringify(t.state.player.inventory),original);
 t.state.player.coin=offer.price;assert.equal(t.rpc('game.shopHandler.buyShopItem',{id:offer.id,count:1,shopType:2}).code,0);
 assert.equal(t.state.player.coin,0);assert.ok(t.state.player.inventory.some(x=>x.itemCfgId===offer.itemId));
 }finally{t.close();}});

test('gift shop uses actual GiftScheme contents and opening purchased package applies deterministic rewards',()=>{
 const t=fixture();try{
  const {onBag}=require('../lib/bag');
  const offer=t.rpc('game.shopHandler.queryShopItem',{shopType:8}).list.find(x=>x.itemId===37000002);
  assert.ok(offer);assert.equal(offer.giftItems.length,3);
  t.state.player.coin=offer.price;
  assert.equal(t.rpc('game.shopHandler.buyShopItem',{shopType:8,id:offer.id,count:1}).code,0);
  const gift=t.state.player.inventory.find(x=>x.itemCfgId===offer.itemId);assert.ok(gift);
  let result;
  const oldReply=t.game.reply;
  t.game.reply=(_s,_id,b)=>{result=decode('BagItemOpenRsp',b);};
  const request={uuid:gift.uuid,bagType:gift.bagType,count:1};
  const body=encode('BagItemOpenReq',request);
  assert.equal(onBag(t.game,t.state,{route:'game.bagHandler.openGiftItem',type:0,id:14,body}),true);
  assert.equal(result.code,0);assert.equal(result.items.length,3);
  assert.equal(t.state.player.inventory.some(x=>x.uuid===gift.uuid),false);
  assert.ok(result.items.every(x=>t.state.player.inventory.some(y=>y.itemCfgId===x.id&&y.num>=x.num)));
  t.game.reply=oldReply;
 }finally{t.close();}
});
