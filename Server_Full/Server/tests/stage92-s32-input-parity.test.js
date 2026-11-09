 'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {Accounts}=require('../lib/accounts'),{Players}=require('../lib/players'),{GameServer}=require('../lib/game');
const {onWorld,tickWorld}=require('../lib/world');
const {encode,decode}=require('../lib/codec'),{pbFields}=require('../lib/wire');
const {commands,entityEvent}=require('../lib/proto'),enums=require('../CLIENT_ENUMS_3127.json');
function setup(){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hl-s32-'));
 const a=new Accounts(path.join(dir,'accounts.json'));a.register({username:'parity_tester',password:'password123'});
 const players=new Players(path.join(dir,'players.json')),g=new GameServer(a,players),state={user:a.userById(1),player:players.ensure(a.userById(1))};
 const pushes=[],replies=[];g.reply=(_,id,b)=>replies.push(b);g.push=(_,route,b)=>pushes.push({route,b});g.online.add(state);
 function rpc(route,type,data){const body=encode(type,data);onWorld(g,state,{route,id:replies.length+1,type:0,body},pbFields(body));return replies.at(-1);}
 rpc('game.gameHandler.enterBattle','IOGameLoginReq',{id:'battle-local-main',roomId:'local-main#1#1'});
 rpc('battle.iob.enter','IOGameEnterReq',{roomId:'local-main#1#1'});
 // Input parity tests run outside the real Map2 safe zone.
 state.world.entity.physics.x=7200;state.world.motion.x=7200;
 return {g,state,pushes,send(name,payload={}){const id=enums.CommandType[name];assert.ok(Number.isInteger(id));const proto=commands['Command'+name[0].toUpperCase()+name.slice(1)];const data=Buffer.from(proto.encode(payload).finish());return decode('FrameStepResp',rpc('battle.iob.frame','FrameStepReq',{cmds:[{type:id,data}]}));},events(){return pushes.filter(p=>p.route==='rm').flatMap(p=>decode('ReplicateMsg',p.b).events);},close(){clearInterval(g.worldTimer);g.heartbeats.stop();fs.rmSync(dir,{recursive:true,force:true});}};
}
test('s3.2 cursor rotation mapped to 2024 cannonRotateTo 23 -> event 58, signed angles',()=>{const t=setup();try{
 const w=t.state.world,before={...w.motion};assert.equal(enums.CommandType.cannonRotateTo,23);assert.equal(enums.EntityEvent.cannonRotateTo,58);
 assert.equal(t.send('cannonRotateTo',{angle:-32.5,dist:800}).code,0);
 const event=t.events().find(e=>e.eventType===58);assert.ok(event,'client head rotation event');
 assert.ok(Math.abs(entityEvent.cannonRotateTo.decode(event.data).angle+32.5)<.001);
 assert.deepEqual(w.motion,before,'cursor does NOT turn WASD body or move avatar');
}finally{t.close();}});
test('s3.2 manual weapon use produces 2024 EntityEvent.useSkill(34), not empty startAttack(6)',()=>{const t=setup();try{
 const w=t.state.world,skill=require('../lib/combat-input-3127').skillFor(w);
 const before={...w.motion};assert.ok(skill>0);
 assert.equal(t.send('useSkill',{id:skill,angle:-77}).code,0);
 const event=t.events().find(e=>e.eventType===34);assert.ok(event,'correct native skill animation');
 const payload=entityEvent.useSkill.decode(event.data);assert.equal(payload.skillID,skill);
 assert.equal(payload.skillLevel,1);assert.ok(payload.curMillis>0);
 assert.equal(t.events().filter(e=>e.eventType===6).length,0);
 assert.deepEqual(w.motion,before);
}finally{t.close();}});
test('E attack creates native buff 246 and repeats native skill animation following latest cursor',()=>{const t=setup();try{
 const w=t.state.world,before={...w.motion};assert.equal(t.send('autoUseSkill',{id:-1}).code,0);
 const buff=t.events().find(e=>e.eventType===enums.EntityEvent.buffAdd);
 assert.ok(buff);const data=entityEvent.buffAdd.decode(buff.data);assert.equal(data.type,246);assert.equal(data.isValid,1);
 assert.equal(t.send('cannonRotateTo',{angle:-55,dist:400}).code,0);
 assert.equal(w.combatInput.aimAngle,-55);
 w.lastAttackAt=0;const old=t.events().filter(e=>e.eventType===34).length;tickWorld(t.g,0.05);
 assert.ok(t.events().filter(e=>e.eventType===34).length>old);
 assert.deepEqual(w.motion,before);
 assert.equal(t.send('unUseSkill',{id:0}).code,0);assert.equal(w.combatInput.auto,true);
 assert.equal(t.send('autoUseSkill',{id:-1}).code,0);assert.equal(w.combatInput.auto,false);
 const off=t.events().find(e=>e.eventType===enums.EntityEvent.buffRemove);assert.equal(entityEvent.buffRemove.decode(off.data).type,246);
}finally{t.close();}});
test('only WASD changes position; mouse press and pointer never trigger click-to-move',()=>{const t=setup();try{
 const w=t.state.world,before={x:w.entity.physics.x,y:w.entity.physics.y};
 t.send('moveTo',{x:before.x+500,y:before.y});t.send('cannonRotateTo',{angle:90,dist:800});
 t.send('attack');t.send('useLeftLongTouchSkill',{skillID:require('../lib/combat-input-3127').skillFor(w)});
 for(let i=0;i<10;i++)tickWorld(t.g,0.05);
 assert.deepEqual({x:w.entity.physics.x,y:w.entity.physics.y},before);
 t.send('rotateTo',{angle:90});t.send('moveStart',{forward:true,speedScale:100});tickWorld(t.g,0.05);
 assert.ok(w.entity.physics.y>before.y);
}finally{t.close();}});

test('2024 explicit weapon active attack 13 is separate from normal LMB',()=>{const t=setup();try{
 const w=t.state.world;w.entity.equip.currentItemID=614600;const active=require('../lib/combat-input-3127').weaponSkillFor(w);assert.ok(active>0);
 assert.equal(enums.CommandType.useAttackSkill,13);
 assert.equal(t.send('useAttackSkill',{skillID:active}).code,0);
 const e=t.events().find(e=>e.eventType===enums.EntityEvent.useEquipSkill);assert.ok(e);assert.equal(entityEvent.useEquipSkill.decode(e.data).skillID,active);
 assert.equal(t.send('useAttackSkill',{skillID:987654321}).code,1);
}finally{t.close();}});
