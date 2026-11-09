'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {Accounts}=require('../lib/accounts'),{Players}=require('../lib/players'),{GameServer}=require('../lib/game');
const {onWorld,tickWorld}=require('../lib/world');
const {encode,decode}=require('../lib/codec');
const {pbFields}=require('../lib/wire');
const {commands,entityEvent}=require('../lib/proto');
const enums=require('../CLIENT_ENUMS_3127.json');
function setup(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hl-input93-'));
 const accounts=new Accounts(path.join(dir,'a.json'));accounts.register({username:'keytester',password:'password123'});
 const players=new Players(path.join(dir,'p.json')),game=new GameServer(accounts,players);
 const state={user:accounts.userById(1),player:players.ensure(accounts.userById(1))},replies=[],pushes=[];
 game.reply=(_,id,bytes)=>replies.push(bytes);game.push=(_,route,bytes)=>pushes.push({route,bytes});game.online.add(state);
 function req(route,type,data){let body=encode(type,data);onWorld(game,state,{route,id:replies.length+1,type:0,body},pbFields(body));return replies.at(-1);}
 req('game.gameHandler.enterBattle','IOGameLoginReq',{id:'battle-local-main',roomId:'local-main#1#1'});
 req('battle.iob.enter','IOGameEnterReq',{roomId:'local-main#1#1'});
 // Input parity tests run outside the real Map2 safe zone.
 state.world.entity.physics.x=7200;state.world.motion.x=7200;
 return {game,state,pushes,send(name,value={}){const c=commands['Command'+name[0].toUpperCase()+name.slice(1)];let body=Buffer.from(c.encode(value).finish());return decode('FrameStepResp',req('battle.iob.frame','FrameStepReq',{cmds:[{type:enums.CommandType[name],data:body}]}));},events(){return pushes.filter(x=>x.route==='rm').flatMap(x=>decode('ReplicateMsg',x.bytes).events);},close(){clearInterval(game.worldTimer);game.heartbeats.stop();fs.rmSync(dir,{recursive:true,force:true});}};
}
function n(t,name){return t.events().filter(e=>e.eventType===enums.EntityEvent[name]).length;}
function savedMotion(t){return structuredClone(t.state.world.motion);}
test('LMB is basic skill 7; E toggles ONLY basic auto attack 9; mouse never walks',()=>{const t=setup();try{
 const c=require('../lib/combat-input-3127'),w=t.state.world,normal=c.skillFor(w),before=savedMotion(t);
 assert.equal(t.send('useSkill',{id:normal,angle:78}).code,0);
 assert.equal(n(t,'useSkill'),1);assert.equal(n(t,'useEquipSkill'),0);assert.equal(n(t,'useHeroSkill'),0);
 assert.equal(t.send('autoUseSkill',{id:-1}).code,0);assert.equal(w.combatInput.auto,true);
 w.lastAttackAt=0;tickWorld(t.game,0.05);
 assert.ok(n(t,'useSkill')>=2);assert.equal(n(t,'useEquipSkill'),0);assert.equal(n(t,'useHeroSkill'),0);
 assert.deepEqual(savedMotion(t),before);
 assert.equal(t.send('autoUseSkill',{id:-1}).code,0);assert.equal(w.combatInput.auto,false);
}finally{t.close();}});
test('F 10 casts ONLY owned hero ability, 138+21 and does not fire weapon skill',()=>{const t=setup();try{
 const c=require('../lib/combat-input-3127'),w=t.state.world,id=c.heroSkillFor(w,t.state),before=savedMotion(t);
 w.entity.property.level=10;assert.ok(id>0);assert.equal(enums.CommandType.useCareerSkill,10);
 assert.equal(t.send('useCareerSkill',{skillID:id,checkcode:0}).code,0);
 assert.equal(n(t,'useHeroSkill'),1);assert.equal(n(t,'skillCast'),1);
 const e=t.events().find(e=>e.eventType===enums.EntityEvent.useHeroSkill);
 assert.equal(entityEvent.useHeroSkill.decode(e.data).id,id);
 assert.equal(n(t,'useEquipSkill'),0);assert.equal(w.combatInput.auto,false);
 assert.deepEqual(savedMotion(t),before);
 assert.equal(t.send('useCareerSkill',{skillID:999999,checkcode:0}).code,1);
}finally{t.close();}});
test('legacy command11 alias accepts only the equipped weapon skill; native RMB uses command6',()=>{const t=setup();try{
 const c=require('../lib/combat-input-3127'),w=t.state.world,before=savedMotion(t);
 assert.equal(enums.CommandType.useEquipSkill,11);
 assert.equal(t.send('useEquipSkill',{skillID:9999,checkcode:0}).code,1);
 w.entity.equip.currentItemID=614600;const id=c.weaponSkillFor(w);assert.ok(id>0);
 assert.equal(t.send('useEquipSkill',{skillID:id,checkcode:0}).code,0);
 const e=t.events().find(e=>e.eventType===enums.EntityEvent.useEquipSkill);
 assert.ok(e);assert.equal(entityEvent.useEquipSkill.decode(e.data).skillID,id);
 assert.equal(n(t,'useHeroSkill'),0);assert.equal(w.combatInput.auto,false);
 assert.deepEqual(savedMotion(t),before);
 assert.equal(t.send('useEquipSkill',{skillID:6013,checkcode:0}).code,1);
}finally{t.close();}});
test('left/right holds remain distinct: 114 normal, 116 active, E survives release',()=>{const t=setup();try{
 const c=require('../lib/combat-input-3127'),w=t.state.world;
 assert.equal(enums.CommandType.useLeftLongTouchSkill,114);assert.equal(enums.CommandType.useRightLongTouchSkill,116);
 t.send('autoUseSkill',{id:-1});assert.equal(w.combatInput.auto,true);
 t.send('useLeftLongTouchSkill',{skillID:c.skillFor(w)});assert.equal(w.combatInput.left,true);
 t.send('unUseLeftLongTouchSkill',{skillID:c.skillFor(w)});assert.equal(w.combatInput.left,false);
 w.entity.equip.currentItemID=614600;const active=c.weaponSkillFor(w);
 t.send('useRightLongTouchSkill',{skillID:active});assert.equal(w.combatInput.right,true);
 t.send('unUseRightLongTouchSkill',{skillID:active});assert.equal(w.combatInput.right,false);
 assert.equal(w.combatInput.auto,true);w.lastAttackAt=0;tickWorld(t.game,0.05);
 assert.equal(w.combatInput.auto,false,'changing weapon cancels stale E automatically');
}finally{t.close();}});
