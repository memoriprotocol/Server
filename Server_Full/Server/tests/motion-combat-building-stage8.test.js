'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {Accounts}=require('../lib/accounts'),{Players}=require('../lib/players'),{GameServer}=require('../lib/game');
const {onWorld,tickWorld,roomObject,LEVELS}=require('../lib/world');
const {commands,entityEvent}=require('../lib/proto'),{encode,decode}=require('../lib/codec'),{pbFields}=require('../lib/wire');
const {validateBuild,roomStructures}=require('../lib/actions-3127');
const motion=require('../lib/motion-3127');
function setup(){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'stage8-'));const a=new Accounts(path.join(dir,'accounts.json'));a.register({username:'stage8tester',password:'test123456'});const p=new Players(path.join(dir,'players.json')),g=new GameServer(a,p),state={user:a.userById(1),player:p.ensure(a.userById(1))};const replies=[],pushes=[];g.reply=(s,id,b)=>replies.push(b);g.push=(s,route,b)=>pushes.push({route,b});g.online.add(state);return {g,state,p,replies,pushes,close(){clearInterval(g.worldTimer);g.heartbeats.stop();fs.rmSync(dir,{recursive:true,force:true});}};}
function send(t,route,type,data){const body=encode(type,data);onWorld(t.g,t.state,{route,type:0,id:t.replies.length+1,body},pbFields(body));return t.replies.at(-1);}
function enter(t,kind='main'){const room=kind==='guide'?'local-tutorial#1#1':'local-main#1#1',id=kind==='guide'?'local-tutorial':'battle-local-main';send(t,kind==='guide'?'game.gameHandler.enterGuide':'game.gameHandler.enterBattle','IOGameLoginReq',{id,roomId:room});send(t,'battle.iob.enter','IOGameEnterReq',{roomId:room});}
function frame(t,name,command={}){const type=require('../CLIENT_ENUMS_3127.json').CommandType;const code=Object.entries(type).find(([,v])=>v===name)[0],payload=Buffer.from(commands['Command'+name[0].toUpperCase()+name.slice(1)].encode(command).finish());return decode('FrameStepResp',send(t,'battle.iob.frame','FrameStepReq',{cmds:[{type:Number(code),data:payload}]}));}
test('mouse click NEVER walks; only keyboard moveStart advances',()=>{
 const t=setup();try{enter(t);const e=t.state.world.entity,start={x:e.physics.x,y:e.physics.y};
 assert.equal(frame(t,'moveTo',{x:start.x+1000,y:start.y}).code,0);
 for(let i=0;i<30;i++)tickWorld(t.g,.1);
 assert.deepEqual({x:e.physics.x,y:e.physics.y},start);
 assert.equal(t.state.world.motion.moving,false);
 assert.equal(t.state.world.motion.target,null);
 assert.equal(frame(t,'moveTo',{x:40000,y:0}).code,1);
 // Click while WASD is held does not override its direction or stop the walk.
 frame(t,'rotateTo',{angle:90});frame(t,'moveStart',{forward:true,speedScale:100});
 frame(t,'moveTo',{x:start.x+1000,y:start.y});tickWorld(t.g,.1);
 assert.ok(e.physics.y>start.y);assert.ok(Math.abs(e.physics.x-start.x)<.01);
 assert.equal(t.state.world.motion.target,null);
 }finally{t.close();}
});
test('keyboard direction, mouse rotation, manual stop, zero-speed input',()=>{const t=setup();try{enter(t);const e=t.state.world.entity;assert.equal(frame(t,'rotateTo',{angle:90}).code,0);assert.equal(frame(t,'moveStart',{forward:true,speedScale:100}).code,0);const y=e.physics.y;tickWorld(t.g,.1);assert.ok(e.physics.y>y);assert.ok(Math.abs(e.physics.x+28)<.01);assert.equal(frame(t,'moveStop').code,0);const y2=e.physics.y;tickWorld(t.g,.1);assert.equal(e.physics.y,y2);assert.equal(frame(t,'moveStart',{forward:true,speedScale:0}).code,0);assert.equal(t.state.world.motion.moving,false);}finally{t.close();}});
test('2024 attack event and server cooldown; never invents hit rewards',()=>{const t=setup();try{enter(t);t.state.world.entity.physics.x=7200;t.state.world.motion.x=7200;const player=t.state.player;const result=frame(t,'attack');assert.equal(result.code,0);const packets=t.pushes.filter(x=>x.route==='rm').flatMap(x=>decode('ReplicateMsg',x.b).events);assert.ok(packets.some(x=>x.eventType===require('../CLIENT_ENUMS_3127.json').EntityEvent.startAttack));const count=t.state.world.attackCount;frame(t,'attack');assert.equal(t.state.world.attackCount,count);assert.equal(player.coin,0);}finally{t.close();}});
test('building preview requires known native config, level and resource costs',()=>{const t=setup();try{enter(t);const e=t.state.world.entity,p=t.state.player;e.physics.x=7200;t.state.world.motion.x=7200;const pos={x:e.physics.x+400,y:e.physics.y};assert.equal(validateBuild(t.g,t.state,{buildID:999999,...pos}).status,'invalid-building');assert.equal(validateBuild(t.g,t.state,{buildID:312,...pos}).status,'insufficient-resources');assert.equal(frame(t,'build',{buildID:312,...pos,check:true}).code,0);assert.equal(roomStructures(t.g,t.state).length,0);p.inventory=[{uuid:'wood-1',itemCfgId:5,num:70,bagType:8,bagPos:0,extInfo:{}}];assert.equal(validateBuild(t.g,t.state,{buildID:312,...pos}).status,'can_build');const rsp=frame(t,'build',{buildID:312,...pos,check:false});assert.equal(rsp.code,0);assert.equal(p.inventory[0].num,20);assert.equal(roomStructures(t.g,t.state).length,1);assert.equal(roomObject(LEVELS.main,t.state.world.room,t.state,t.g,true).entities.filter(x=>x.cid===312).length,1);const buildings=roomStructures(t.g,t.state),id=buildings[0].id;assert.equal(frame(t,'buildDestroy',{buildID:id}).code,0);assert.equal(roomStructures(t.g,t.state).length,0);}finally{t.close();}});
test('no out-of-range or ghost building mutates inventory',()=>{const t=setup();try{enter(t);t.state.player.inventory=[{uuid:'wood-1',itemCfgId:5,num:70,bagType:8,bagPos:0,extInfo:{}}];const x=t.state.world.entity.physics.x+1500,y=t.state.world.entity.physics.y;const r=frame(t,'build',{buildID:312,x,y,check:false});assert.equal(r.code,1);assert.equal(t.state.player.inventory[0].num,70);assert.equal(roomStructures(t.g,t.state).length,0);}finally{t.close();}});
test('collision adapter blocks crossing a placed radius and bounds guide map',()=>{const m=motion.createMotion({physics:{x:0,y:0}});motion.rotate(m,0);motion.start(m,true,100);for(let i=0;i<20;i++)motion.step(m,2,.1,700,[{x:280,y:0,radius:100}]);assert.ok(m.x<280);assert.equal(motion.validPoint(99,-7061,-1000),true);assert.equal(motion.validPoint(99,11000,-1000),false);});
test('attack hits a hostile building in the facing arc without issuing moveTo or changing the walking target',()=>{
 const t=setup();try{
  enter(t);const e=t.state.world.entity, w=t.state.world;
  // Safe zones now block damage, so this attack test must be OUTSIDE the city.
  e.physics.x=8000;e.physics.y=0;w.motion.x=8000;w.motion.y=0;
  const enemy=t.g.accounts.register({username:'otherplayer',password:'test123456'});
  const owner=t.p.ensure(enemy);owner.structures=[{id:22110000,room:w.room,ownerId:enemy.id,ownerName:'otherplayer',buildID:312,x:e.physics.x+180,y:e.physics.y,hp:200,maxHp:200,createdAt:Date.now()}];t.g.online.add({world:{room:w.room,structures:owner.structures}});t.p.save();
  frame(t,'rotateTo',{angle:0});frame(t,'moveStart',{forward:true,speedScale:100});
  const prior={x:e.physics.x,y:e.physics.y,target:w.motion.target,moving:w.motion.moving};
  const resp=frame(t,'attack');assert.equal(resp.code,0);
  assert.equal(e.physics.x,prior.x);assert.equal(e.physics.y,prior.y);
  assert.deepEqual(w.motion.target,prior.target);assert.equal(w.motion.moving,prior.moving);
  assert.ok(owner.structures[0].hp<200);
  const ev=t.pushes.filter(x=>x.route==='rm').flatMap(x=>decode('ReplicateMsg',x.b).events);
  const enums=require('../CLIENT_ENUMS_3127.json');
  assert.ok(ev.some(x=>x.entityID===e.id&&x.eventType===enums.EntityEvent.startAttack));
  const hp=ev.find(x=>x.entityID===22110000&&x.eventType===enums.EntityEvent.subHP);
  assert.ok(hp);const loss=entityEvent.subHP.decode(hp.data);assert.ok(loss.changeHP>0&&loss.currentHP<200);
  // Faces away after cooldown => still animates but does not damage the target.
  w.lastAttackAt=0;frame(t,'rotateTo',{angle:180});const remaining=owner.structures[0].hp;
  frame(t,'attack');assert.equal(owner.structures[0].hp,remaining);
 }finally{t.close();}
});
test('default 2024 server does not apply speculative PVP damage or move avatars on attack',()=>{
 const t=setup();try{
  enter(t);const e=t.state.world.entity,w=t.state.world;
  const user=t.g.accounts.register({username:'otherplayer',password:'test123456'});
  const p=t.p.ensure(user),other={user,player:p};t.g.online.add(other);
  onWorld(t.g,other,{route:'game.gameHandler.enterBattle',type:0,id:32,body:encode('IOGameLoginReq',{id:'battle-local-main',roomId:w.room})},pbFields(encode('IOGameLoginReq',{id:'battle-local-main',roomId:w.room})));
  onWorld(t.g,other,{route:'battle.iob.enter',type:0,id:33,body:encode('IOGameEnterReq',{roomId:w.room})},pbFields(encode('IOGameEnterReq',{roomId:w.room})));
  other.world.entity.physics.x=e.physics.x+130;other.world.entity.physics.y=e.physics.y;
  const hp=other.world.entity.property.HP,pos=e.physics.x;
  frame(t,'attack');assert.equal(other.world.entity.property.HP,hp);
  assert.equal(e.physics.x,pos);
 }finally{t.close();}
});
test('swept motion prevents crossing thin obstacles within one tick',()=>{
 const m=motion.createMotion({physics:{x:0,y:0}});
 motion.rotate(m,0);motion.start(m,true,100);
 const stepped=motion.step(m,2,0.1,700,[{x:35,y:0,radius:8}]);
 assert.ok(stepped.changed);assert.ok(m.x<=27&&m.x>=25);
});
