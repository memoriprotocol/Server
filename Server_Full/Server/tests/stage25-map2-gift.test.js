'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const commerce=require('../lib/commerce-3127'),city=require('../lib/city-3127');
const nativeGiftFilter=require('./native-gift-filter.fixture.cjs');
const {encode,decode}=require('../lib/codec');
const tabs=[1,2,3,4,5,7,8,9];
function nativeList(catalog){return nativeGiftFilter.call({itemMap:new Map(tabs.map(type=>[type,{itemList:catalog(type)}]))});}
test('client Gift filter sees actual products from login-requested tabs after protobuf round trip',()=>{
 const rows=nativeList(type=>decode('QueryShopItemRsp',encode('QueryShopItemRsp',{code:0,list:commerce.catalog(type)})).list);
 assert.equal(rows.length,19);assert.equal(new Set(rows.map(x=>x.id)).size,19);
 assert.ok(rows.some(x=>x.shopType===1));assert.ok(rows.some(x=>x.shopType===5));
 for(const r of rows){assert.ok(r.presentPrice>0);assert.ok(commerce.offers.get(r.id).giftable);assert.ok(commerce.offers.get(r.id).grantType==='mount'||commerce.offers.get(r.id).skinId);}
});
test('original zero flags reproduce empty Gift with exact native filtering function',()=>{
 assert.equal(nativeList(type=>commerce.catalog(type).map(r=>({...r,saleType:0}))).length,0);
});
test('Gift catalog uses native query handler rather than empty initial route',()=>{
 const replies=[],game={reply(_s,_id,b){replies.push(b)}},state={user:{id:2}};
 for(const shopType of tabs)assert.equal(commerce.handle(game,state,{route:'game.shopHandler.queryShopItem',type:0,id:1},{shopType}),true);
 const itemMap=new Map(tabs.map((t,i)=>[t,{itemList:decode('QueryShopItemRsp',replies[i]).list}]));
 assert.equal(nativeGiftFilter.call({itemMap}).length,19);
});
// Stage25 quarantine expectations were superseded by the operator-authorized
// Stage26 layout; current perimeter and roster checks are in stage26-maincity.test.js.
