'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {GameServer}=require('../lib/game'),{Accounts}=require('../lib/accounts'),{Players}=require('../lib/players');
const {onWorld,LEVELS,entryReply}=require('../lib/world');
const {onInitial,responseTypes}=require('../lib/initial');
const {pbB,pbFields,parseMessage}=require('../lib/wire');
function setup(){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hlworld-'));const accounts=new Accounts(path.join(dir,'accounts.json'));
 const result=accounts.register({username:'worldtester',password:'safe_password_2024'});assert.equal(result.ok,true);
 const u=accounts.userById(1),players=new Players(path.join(dir,'players.json')),g=new GameServer(accounts,players);
 const pushes=[];g.push=(s,route,b)=>pushes.push({route,b});
 const sent=[],state={user:u,player:players.ensure(u)};g.reply=(s,id,b)=>sent.push({id,fields:pbFields(b)});
 return {dir,accounts,u,players,g,sent,state,pushes,cleanup:()=>fs.rmSync(dir,{recursive:true,force:true})};}
test('2024 contract identifies IOGameLoginRsp for enterGuide',()=>{
 const map=require('../../retail/client-reference/PROTO_TYPES_FROM_CLIENT_3127.json');assert.equal(map.enterGuide,'IOGameLoginRsp');assert.equal(map.getGuideServers,'ServersRsp');assert.equal(map.battleIOEnter,'IOGameEnterRsq');
});
test('guide handshake gives a room, accepts scene entry, persists last room and exits',()=>{
 const t=setup();try{
  const selected=onWorld(t.g,t.state,{route:'game.gameHandler.enterGuide',id:8},pbFields(Buffer.concat([pbB(2,'local-tutorial'),pbB(3,'local-tutorial#1#1')])));
  assert.equal(selected,true);assert.equal(t.sent[0].id,8);assert.equal(Number(t.sent[0].fields.get(1)[0]),0);
  assert.equal(t.state.world.level,'guide');assert.equal(t.state.player.lastWorld,'guide');
  const fields=pbFields(t.sent[0].fields.get(3)[0]);assert.equal(fields.get(1)[0].toString(),'local-tutorial#1#1');
  assert.equal(onWorld(t.g,t.state,{route:'battle.iob.enter',id:9},pbFields(pbB(2,'local-tutorial#1#1'))),true);
  assert.equal(t.state.world.sceneReady,true);assert.equal(t.sent[1].id,9);
  assert.equal(onWorld(t.g,t.state,{route:'game.gameHandler.exitGuide',id:10},pbFields(Buffer.alloc(0))),true);assert.equal(t.state.world,null);
 }finally{t.cleanup();}
});
test('reject unknown world and prevent unauthorized scene entry',()=>{
 const t=setup();try{
  assert.equal(onWorld(t.g,t.state,{route:'game.gameHandler.enterBattle',id:12},pbFields(pbB(2,'remote-server'))),true);
  assert.equal(Number(t.sent[0].fields.get(1)[0]),1);
  assert.equal(onWorld(t.g,t.state,{route:'battle.iob.enter',id:13},pbFields(pbB(2,'unknown'))),true);
  assert.equal(Number(t.sent[1].fields.get(1)[0]),1);
 }finally{t.cleanup();}
});
test('read-only boot requests yield new-account empty state without changing balance or owned items',()=>{
 const t=setup();try{
  const balance=t.state.player.coin;assert.equal(onInitial(t.g,t.state,{route:'game.friendHandler.loadFriends',id:23},new Map()),true);
  assert.equal(t.sent[0].id,23);assert.equal(Number(t.sent[0].fields.get(1)[0]),0);assert.equal(t.state.player.coin,balance);
  t.state.player.inventory=[{id:10}];assert.equal(onInitial(t.g,t.state,{route:'game.bagHandler.bagItems',id:24},new Map()),true);assert.equal(Number(t.sent.at(-1).fields.get(1)[0]),1);assert.deepEqual(t.state.player.inventory,[{id:10}]);
  assert.equal(onInitial(t.g,t.state,{route:'game.shopHandler.buyShopItem',id:25},new Map()),false);
 }finally{t.cleanup();}
});

test('enterGuide tolerates older 2024 client without an explicit room string',()=>{
 const t=setup();try{
  const fields=pbFields(Buffer.concat([pbB(1,'guide'),pbB(4,'unknown-guide-props')]));
  assert.equal(onWorld(t.g,t.state,{route:'game.gameHandler.enterGuide',id:44},fields),true);
  assert.equal(Number(t.sent[0].fields.get(1)[0]),0);
  assert.equal(t.state.world.room,'local-tutorial#1#1');
 }finally{t.cleanup();}
});
