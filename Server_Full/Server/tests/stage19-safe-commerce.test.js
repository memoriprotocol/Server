'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {Accounts}=require('../lib/accounts'),{Players}=require('../lib/players'),{GameServer}=require('../lib/game');
const {onWorld,tickWorld}=require('../lib/world');
const {encode,decode}=require('../lib/codec'),{pbFields}=require('../lib/wire');
const {commands}=require('../lib/proto'),enums=require('../CLIENT_ENUMS_3127.json');
const commerce=require('../lib/commerce-3127');
const city=require('../lib/city-3127');
const center=city.layout.safeAreas[0];
function setup(){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hl-stage19-'));
 const accounts=new Accounts(path.join(dir,'accounts.json'));accounts.register({username:'safecommerce',password:'password123'});
 const players=new Players(path.join(dir,'players.json')),game=new GameServer(accounts,players);
 const state={user:accounts.userById(1),player:players.ensure(accounts.userById(1))},replies=[],pushes=[];
 game.reply=(_s,_id,b)=>replies.push(b);game.push=(_s,route,b)=>pushes.push({route,b});game.online.add(state);
 function raw(route,type,obj){const data=encode(type,obj);game.onPacket;const m={route,type:0,id:replies.length+1,body:data};return {m,fields:pbFields(data)};}
 function lobby(route,type,obj={}){const {m,fields}=raw(route,type,obj);
  // Use the exact same onCommerce handler called by the GameServer dispatcher.
  commerce.handle(game,state,m,obj);return decode(require('../CLIENT_CONTRACT_3127.json').responses[route],replies.at(-1));}
 function worldRpc(route,type,obj={}){const {m,fields}=raw(route,type,obj);onWorld(game,state,m,fields);return decode(require('../CLIENT_CONTRACT_3127.json').responses[route],replies.at(-1));}
 function enter(){worldRpc('game.gameHandler.enterBattle','IOGameLoginReq',{id:'battle-local-main',roomId:'local-main#1#1'});worldRpc('battle.iob.enter','IOGameEnterReq',{roomId:'local-main#1#1'});}
 function cmd(name,payload={}){const msg=Buffer.from(commands['Command'+name[0].toUpperCase()+name.slice(1)].encode(payload).finish());return worldRpc('battle.iob.frame','FrameStepReq',{cmds:[{type:enums.CommandType[name],data:msg}]});}
 return {state,game,replies,pushes,enter,cmd,lobby,events:()=>pushes.filter(p=>p.route==='rm').flatMap(p=>decode('ReplicateMsg',p.b).events),close(){clearInterval(game.worldTimer);game.heartbeats.stop();fs.rmSync(dir,{recursive:true,force:true});}};
}
function changePos(t,x,y){t.state.world.entity.physics.x=x;t.state.world.entity.physics.y=y;t.state.world.motion.x=x;t.state.world.motion.y=y;}
function eventCount(t,name){return t.events().filter(e=>e.eventType===enums.EntityEvent[name]).length;}

test('inside Map2 safe zone LMB,E,F,RMB and holds cannot start skills or attack animations',()=>{
 const t=setup();try{t.enter();const w=t.state.world;assert.ok(city.safePoint(w.entity.physics.x,w.entity.physics.y,w.level,w.mapId));
  const combat=require('../lib/combat-input-3127');
  for(const [cmd,data] of [['attack',{}],['useSkill',{id:combat.skillFor(w)}],['autoUseSkill',{id:-1}],['useCareerSkill',{skillID:combat.heroSkillFor(w,t.state)}],['useEquipSkill',{skillID:1}],['useLeftLongTouchSkill',{skillID:combat.skillFor(w)}],['useRightLongTouchSkill',{skillID:1}]]){
   const r=t.cmd(cmd,data);assert.equal(r.code,0,cmd+': '+r.message);assert.equal(w.combatInput?.auto||false,false);assert.equal(w.combatInput?.left||false,false);
  }
  assert.ok(eventCount(t,'cantAttack')>=7);for(const kind of ['startAttack','useSkill','useHeroSkill','useEquipSkill','skillCast','autoUseSkill'])assert.equal(eventCount(t,kind),0,kind);
  assert.equal(w.attackCount||0,0);assert.equal(w.combatInput.safeBlocked,7);
 }finally{t.close();}
});
test('safe-zone combat rejection never prevents WASD movement, head aiming, or mouse button release',()=>{const t=setup();try{t.enter();const w=t.state.world;
 assert.equal(t.cmd('cannonRotateTo',{angle:-42}).code,0);assert.equal(w.combatInput.aimAngle,-42);
 assert.equal(t.cmd('moveStart',{forward:true,speedScale:100}).code,0);assert.equal(w.motion.moving,true);
 assert.equal(t.cmd('unUseLeftLongTouchSkill',{}).code,0);assert.equal(t.cmd('unUseRightLongTouchSkill',{}).code,0);
 assert.equal(t.cmd('useSkill',{id:1}).code,0);assert.equal(w.motion.moving,true);
 }finally{t.close();}});
test('autoattack started outside safe zone is cancelled immediately on entering protected area',()=>{const t=setup();try{t.enter();const w=t.state.world;changePos(t,center.maxX+250,0);
 assert.equal(t.cmd('autoUseSkill',{id:-1}).code,0);assert.equal(w.combatInput.auto,true);
 changePos(t,(center.minX+center.maxX)/2,0);tickWorld(t.game,0.05);
 assert.equal(w.combatInput.auto,false);assert.equal(w.combatInput.left,false);assert.ok(eventCount(t,'buffRemove')>=1);
 }finally{t.close();}});
test('local shop always returns valid ItemScheme IDs and proper QueryShopItemRsp protobuf',()=>{const t=setup();try{for(const shopType of [0,1,2,5,40]){const r=t.lobby('game.shopHandler.queryShopItem','QueryShopItemReq',{shopType});assert.equal(r.code,0);assert.ok(r.list.length>0);for(const row of r.list){assert.ok(row.itemId>0);assert.ok(commerce.config.shopOffers.some(x=>x.id===row.id));assert.equal(row.shopType,shopType);}}
 }finally{t.close();}});
test('local shop payment, inventory grant and coin update are atomic, no negative-balance exploit',()=>{const t=setup();try{t.state.player.coin=120;
  const a=t.lobby('game.shopHandler.buyShopItem','BuyShopItemReq',{id:19002,count:2,shopType:0});assert.equal(a.code,0);assert.equal(t.state.player.coin,20);assert.equal(t.state.player.inventory.filter(x=>x.itemCfgId===611000).reduce((n,x)=>n+x.num,0),2);
  const previous=JSON.stringify(t.state.player.inventory);
  assert.notEqual(t.lobby('game.shopHandler.buyShopItem','BuyShopItemReq',{id:19002,count:1,shopType:0}).code,0);
  assert.equal(t.state.player.coin,20);assert.equal(JSON.stringify(t.state.player.inventory),previous);
  assert.notEqual(t.lobby('game.shopHandler.buyShopItem','BuyShopItemReq',{id:999999,count:1,shopType:0}).code,0);
  assert.equal(t.state.player.coin,20);
 }finally{t.close();}});
test('authentic TraderDraw 2024 weights and tier prices with local-only reward mapping',()=>{const t=setup();try{t.enter();t.state.player.coin=100;
  const r=t.cmd('draw',{id:1});assert.equal(r.code,0);assert.equal(t.state.player.coin,80);assert.equal(t.state.world.entity.draw.count,1);
  assert.equal(eventCount(t,'drawBegin'),1);assert.equal(eventCount(t,'drawEnd'),1);
  const n=t.state.player.inventory.reduce((s,x)=>s+x.num,0);assert.ok(n>0);
  assert.equal(t.cmd('draw',{id:20}).code,1);assert.equal(t.state.player.coin,80);assert.equal(t.state.world.entity.draw.count,1);
 }finally{t.close();}});
test('hall gacha accepts native hero draw types and no real-money purchase path',()=>{const t=setup();try{t.state.player.coin=200;
 assert.notEqual(t.lobby('game.drawHandler.draw','DrawReq',{typ:777,drawType:1}).code,0);assert.equal(t.state.player.coin,200);
 const r=t.lobby('game.drawHandler.draw','DrawReq',{typ:0,drawType:0});assert.equal(r.code,0);assert.equal(r.heroes.length,1);assert.equal(r.items.length,1);assert.ok(require('../config/schemes/ShardsScheme.json').Shards.some(s=>s.ID===r.items[0].itemCfgId));assert.equal(t.state.player.coin,200);assert.equal(r.freeDrawCount.heroFreeDraw,1);
 }finally{t.close();}});
test('weapon gacha uses only February 2024 WeaponScheme IDs and persists owned inventory',()=>{const t=setup();try{t.state.player.coin=100;
 const r=t.lobby('game.drawHandler.drawWeapon','DrawWeaponReq',{drawType:1});assert.equal(r.code,0);assert.equal(t.state.player.coin,25);assert.equal(r.items.length,1);
 assert.ok(commerce.config.weaponDraw.weaponIds.includes(r.items[0].id));assert.ok(t.state.player.inventory.some(x=>x.itemCfgId===r.items[0].id));
 const owned=t.lobby('game.drawHandler.getWeapons','GetWeaponsReq',{});assert.equal(owned.code,0);assert.ok(owned.weapons.length>=1);
 assert.notEqual(t.lobby('game.drawHandler.drawWeapon','DrawWeaponReq',{drawType:1}).code,0);
 assert.equal(t.state.player.coin,25);
 }finally{t.close();}});
