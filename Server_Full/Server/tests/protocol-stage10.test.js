'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {proto}=require('../lib/proto');
const {contract}=require('../lib/codec');
const {parseClientRequest,rejection,catalog}=require('../lib/protocol-3127');
test('2024 client request and response route catalog is decodable and all mapped replies are serializable',()=>{
 const paths=catalog();assert.equal(paths.protobufRequestRoutes,205);assert.equal(paths.protobufResponseAndPushRoutes,308);
 for(const [route,type] of Object.entries(contract.requests)){assert.ok(proto[type],route+' missing '+type);assert.equal(parseClientRequest(route,Buffer.alloc(0)).type,type);}
 for(const route of Object.keys(contract.responses)){
  const r=rejection(route,'NOT_IMPLEMENTED',501);assert.ok(r.bytes?.length>=0,route);assert.ok(proto[r.type]);
  assert.doesNotThrow(()=>proto[r.type].decode(r.bytes),route);
 }
});
test('known mutable routes are not silently declared successful when not implemented',()=>{
 for(const route of ['game.gameHandler.addCoin','game.drawHandler.draw']){
  if(!contract.responses[route])continue;
  const r=rejection(route);assert.ok(r.type);
  if(r.representable){const data=proto[r.type].toObject(proto[r.type].decode(r.bytes));assert.notEqual(Number(data.code??data.status??0),0,route);}
 }
});
