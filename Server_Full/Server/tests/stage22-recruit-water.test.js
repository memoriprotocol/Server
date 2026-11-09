'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {Accounts}=require('../lib/accounts'),{Players}=require('../lib/players'),{GameServer}=require('../lib/game');
const {encode,decode}=require('../lib/codec');
const commerce=require('../lib/commerce-3127'),inventory=require('../lib/inventory'),water=require('../lib/water-3127');
const {entityEvent}=require('../lib/proto');
const shardIcons=new Map([...require('../config/schemes/ShardsScheme.json').Shards,...require('../config/schemes/PetShardsScheme.json').PetShards].map(x=>[x.ID,x.Icon]));
const nativeIcon=(id)=>inventory.items.get(id)?.icon||shardIcons.get(id);
function fixture(){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hl22-'));const acc=new Accounts(path.join(dir,'a.json'));
 acc.register({username:'alice',password:'password123'});acc.register({username:'bob',password:'password123'});
 const players=new Players(path.join(dir,'p.json')),game=new GameServer(acc,players),user=acc.userById(1),state={user,player:players.ensure(user)};
 let last;const pushes=[];game.reply=(_s,_id,buf)=>{last=buf};game.push=(_s,route,bytes)=>pushes.push({route,bytes});
 function rpc(route,type,request={}){last=null;assert.ok(commerce.handle(game,state,{route,type:0,id:1},request),route);return decode(type,last)}
 return {acc,players,game,state,rpc,pushes,close(){clearInterval(game.worldTimer);game.heartbeats.stop();fs.rmSync(dir,{recursive:true,force:true})}};
}
test('Recruit and Consumable cards use existing February 2024 ItemScheme with icons; Gift contains mounts and skins',()=>{const t=fixture();try{
 for(let type of [2,6,7]){const rsp=t.rpc('game.shopHandler.queryShopItem','QueryShopItemRsp',{shopType:type});assert.equal(rsp.code,0);assert.ok(rsp.list.length);for(const row of rsp.list){assert.ok(nativeIcon(row.itemId));assert.ok(inventory.items.get(row.costId)?.icon);}}
 const consum=t.rpc('game.shopHandler.queryShopItem','QueryShopItemRsp',{shopType:2});assert.ok(consum.list.some(x=>x.itemId===80032001));assert.ok(consum.list.some(x=>x.itemId===80035001));assert.ok(!consum.list.some(x=>[5,6,7,8].includes(x.itemId)));
 const gift=t.rpc('game.shopHandler.queryShopItem','QueryShopItemRsp',{shopType:6});assert.equal(gift.list.filter(x=>x.itemId>=42000001&&x.itemId<=42000004).length,4);assert.ok(gift.list.some(x=>inventory.items.get(x.itemId).itemType===27));assert.ok(gift.list.every(x=>x.presentPrice>0));
}finally{t.close()}});
test('first Hero Free spin advances native collection progress, second paid attempt costs coins',()=>{const t=fixture();try{
 t.state.player.coin=2000;
 const shardIds=new Set(require('../config/schemes/ShardsScheme.json').Shards.map(x=>x.ID));
 const first=t.rpc('game.drawHandler.draw','DrawRsp',{typ:0,drawType:0});assert.equal(first.code,0,first.message);
 assert.equal(first.heroes.length,1);assert.equal(first.pets.length,0);assert.equal(first.items.length,1);
 assert.ok(shardIds.has(first.items[0].itemCfgId));assert.equal(first.freeDrawCount.heroFreeDraw,1);assert.equal(t.state.player.coin,2000);
 assert.equal(t.state.player.inventory.some(x=>x.itemCfgId===first.items[0].itemCfgId),false);assert.ok(first.heroes.length?first.heroes[0].exp>0:first.pets[0].affection>0);
 const again=t.rpc('game.drawHandler.draw','DrawRsp',{typ:0,drawType:0});assert.equal(again.code,0,again.message);
 assert.equal(t.state.player.coin,1000);assert.equal(again.freeDrawCount.heroFreeDraw,1);
}finally{t.close()}});
test('Pet Free spin persists native affection without a loose inventory shard',()=>{const t=fixture();try{
 const shardIds=new Set(require('../config/schemes/PetShardsScheme.json').PetShards.map(x=>x.ID));
 const first=t.rpc('game.drawHandler.draw','DrawRsp',{typ:1,drawType:0});assert.equal(first.code,0,first.message);
 assert.equal(first.pets.length,1);assert.equal(first.heroes.length,0);assert.equal(first.items.length,1);
 assert.ok(shardIds.has(first.items[0].itemCfgId));assert.equal(first.freeDrawCount.petFreeDraw,1);
 assert.equal(first.freeDrawCount.heroFreeDraw||0,0);assert.equal(t.state.player.coin,0);
 assert.equal(t.state.player.inventory.some(x=>x.itemCfgId===first.items[0].itemCfgId),false);assert.ok(first.heroes.length?first.heroes[0].exp>0:first.pets[0].affection>0);
 const next=t.rpc('game.drawHandler.draw','DrawRsp',{typ:1,drawType:1});assert.notEqual(next.code,0);
 assert.equal(t.state.player.pets.reduce((n,x)=>n+x.affection,0),1);
}finally{t.close()}});
test('giftable native mount sent to another account charges displayed local currency and presentPrice atomically',()=>{const t=fixture();try{
 const gift=t.rpc('game.shopHandler.queryShopItem','QueryShopItemRsp',{shopType:6}).list.find(x=>x.itemId===42000001);t.state.player.coin=gift.presentPrice;
 const done=t.rpc('game.shopHandler.givePresent','GivePresentRsp',decode('GivePresentReq',encode('GivePresentReq',{id:gift.id,count:1,recipient:2})));assert.equal(done.code,0);assert.equal(t.state.player.coin,0);assert.ok(t.players.ensure(t.acc.userById(2)).mountList.includes(42000001));
 const twice=t.rpc('game.shopHandler.givePresent','GivePresentRsp',decode('GivePresentReq',encode('GivePresentReq',{id:gift.id,count:1,recipient:2})));assert.notEqual(twice.code,0);assert.equal(t.state.player.coin,0);
}finally{t.close()}});
test('unverified river rectangles are disabled along with the removed guessed bridges',()=>{
 assert.deepEqual(water.zones.regions,[]);
 assert.equal(water.waterAt(2300,5200),null);
 const world={mapId:2},ent={id:1,physics:{x:2300,y:5200}},events=[];
 assert.equal(water.updateWater(world,ent,events,(_e,name,data)=>({name,data})),false);
 assert.deepEqual(events,[]);
});
