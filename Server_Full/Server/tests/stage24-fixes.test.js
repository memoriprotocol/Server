'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const path=require('node:path'),os=require('node:os'),fs=require('node:fs');
const {Accounts}=require('../lib/accounts'),{Players}=require('../lib/players'),{GameServer}=require('../lib/game');
const {onWorld}=require('../lib/world'),city=require('../lib/city-3127');
const {proto,entityEvent}=require('../lib/proto'),{encode,decode}=require('../lib/codec');
const {pbB,pbFields}=require('../lib/wire');
const commerce=require('../lib/commerce-3127');
function env(){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hl24-')),accounts=new Accounts(path.join(dir,'a.json'));
 accounts.register({username:'alice',password:'abcde123456'});const players=new Players(path.join(dir,'p.json'));
 const game=new GameServer(accounts,players),u=accounts.userById(1),state={user:u,player:players.ensure(u)};
 const pushes=[], replies=[];game.push=(_s,route,bytes)=>pushes.push({route,bytes});game.reply=(_s,id,bytes)=>replies.push({id,bytes});game.online.add(state);
 return {game,state,pushes,replies,close(){clearInterval(game.worldTimer);game.heartbeats.stop?.();fs.rmSync(dir,{recursive:true,force:true})}};
}
test('plain node server uses the current city roster and deferred streaming by default',()=>{
 const previous=process.env.HEROS_CITY_NPCS_ENABLED;delete process.env.HEROS_CITY_NPCS_ENABLED;
 try{const es=city.entitiesFor('main',2);assert.equal(es.length,58);assert.equal(es.filter(x=>city.visualKind(x)==='npc').length,22);assert.equal(es.filter(x=>city.visualKind(x)==='wall').length,32);assert.equal(es.filter(x=>city.visualKind(x)==='bridge').length,4);}finally{if(previous===undefined)delete process.env.HEROS_CITY_NPCS_ENABLED;else process.env.HEROS_CITY_NPCS_ENABLED=previous;}
 const worldSrc=fs.readFileSync(path.join(__dirname,'../lib/world.js'),'utf8');assert.match(worldSrc,/const cityMode=city\.spawnMode\(\)/);
 const bats=['START_SERVER.bat'];for(const name of bats){const txt=fs.readFileSync(path.join(__dirname,'../..',name));assert.ok(txt.every(x=>x<128),name+' must be ASCII-safe');assert.match(txt.toString(),/node server\.js/);assert.doesNotMatch(txt.toString(),/^\s*(?:eval|evel)(?:\s|$)/mi);}
});
test('Recruit Hero/Pet uses native 2024 fragments, mapped to real shard schemes',()=>{
 const rsp=decode('QueryShopItemRsp',encode('QueryShopItemRsp',{code:0,list:commerce.catalog(7)}));
 const hero=new Set(require('../config/schemes/ShardsScheme.json').Shards.map(x=>x.ID));const pet=new Set(require('../config/schemes/PetShardsScheme.json').PetShards.map(x=>x.ID));
 assert.ok(rsp.list.some(x=>hero.has(x.itemId)));assert.ok(rsp.list.some(x=>pet.has(x.itemId)));assert.ok(rsp.list.every(x=>x.itemId>0&&x.costId>0&&x.price>0));
});
test('free draws record native fragments in collection progress without coin deduction',()=>{const t=env();try{
 const gold=t.state.player.coin;for(const [typ,ids]of [[0,new Set(require('../config/schemes/ShardsScheme.json').Shards.map(x=>x.ID))],[1,new Set(require('../config/schemes/PetShardsScheme.json').PetShards.map(x=>x.ID))]]){
  let reply; t.game.reply=(_s,_id,b)=>reply=decode('DrawRsp',b);
  assert.equal(commerce.handle(t.game,t.state,{route:'game.drawHandler.draw',id:9,type:0},{typ,drawType:0}),true);
  assert.equal(reply.code,0,reply.message);assert.equal(reply.items.length,1);assert.ok(ids.has(reply.items[0].itemCfgId));
  assert.equal(t.state.player.inventory.some(x=>x.itemCfgId===reply.items[0].itemCfgId),false);assert.equal((typ===0?reply.heroes:reply.pets).length,1);
 }
 assert.equal(t.state.player.coin,gold);assert.equal(t.state.player.freeDrawCount.heroFreeDraw,1);assert.equal(t.state.player.freeDrawCount.petFreeDraw,1);
}finally{t.close()}});
test('pet bag C command emits 2024 PetInfo, with cid (not proto.Pet.petId)',()=>{const t=env();try{
 onWorld(t.game,t.state,{route:'game.gameHandler.enterBattle',id:1},pbFields(pbB(2,'battle-local-main')));
 onWorld(t.game,t.state,{route:'battle.iob.enter',id:2},pbFields(pbB(2,'local-main#1#1')));
 t.state.player.pets=[{petId:1404,level:2,affection:10}];
 const cmd={type:45,data:Buffer.alloc(0)};const msg=encode('FrameStepReq',{cmds:[cmd]});
 assert.equal(onWorld(t.game,t.state,{route:'battle.iob.frame',id:3,body:msg},new Map()),true);
 const replication=t.pushes.filter(x=>x.route==='rm').at(-1);assert.ok(replication);const rm=decode('ReplicateMsg',replication.bytes);
 const hit=rm.events.find(e=>e.eventType===71);assert.ok(hit,'EntityEvent allPets 71');
 const event=entityEvent.allPets.decode(hit.data);assert.equal(event.pets.length,1);assert.equal(event.pets[0].cid,1404);assert.equal(event.pets[0].property.level,2);
}finally{t.close()}});
test('exitTeam succeeds during room transitions and clears client roster',()=>{const t=env();try{
 const team={id:2,room:'old-room',name:'Test',leader:1,members:[1]};t.game.teams.teams.set(team.id,team);
 let resp=null;t.game.reply=(_s,_id,bytes)=>resp=decode('ExitTeamRsp',bytes);
 assert.equal(t.game.teams.handle(t.state,{route:'battle.teamHandler.exitTeam',id:12,type:0},{teamId:0}),true);
 assert.equal(resp.code,0);assert.equal(t.game.teams.teamFor(1),undefined);
 const push=t.pushes.find(p=>p.route==='teamMembersUpdatePush');assert.ok(push);
 assert.equal(decode('TeamMembersUpdatePush',push.bytes).teamMembers.length,0);
}finally{t.close()}});
test('in-world CommandExitTeam (30) leaves native team and emits empty teamChange',()=>{const t=env();try{
 onWorld(t.game,t.state,{route:'game.gameHandler.enterBattle',id:1},pbFields(pbB(2,'battle-local-main')));
 onWorld(t.game,t.state,{route:'battle.iob.enter',id:2},pbFields(pbB(2,'local-main#1#1')));
 const team={id:3,room:t.state.world.room,name:'Test',leader:1,members:[1]};t.game.teams.teams.set(3,team);
 const msg=encode('FrameStepReq',{cmds:[{type:30,data:Buffer.from(require('../lib/proto').commands.CommandExitTeam.encode({memberID:1}).finish())}]});
 onWorld(t.game,t.state,{route:'battle.iob.frame',id:4,body:msg},new Map());
 assert.equal(decode('FrameStepResp',t.replies.at(-1).bytes).code,0);
 assert.equal(t.game.teams.teamFor(1),undefined);
 const push=t.pushes.filter(x=>x.route==='rm').at(-1),events=decode('ReplicateMsg',push.bytes).events;
 const changed=events.find(x=>x.eventType===59);assert.ok(changed);assert.equal(entityEvent.teamChange.decode(changed.data).teamID,0);
}finally{t.close()}});
