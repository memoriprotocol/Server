'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {Players}=require('../lib/players'),env=require('../lib/environment-3127'),progress=require('../lib/progression-3127'),{decode,contract}=require('../lib/codec');
function fixture(t,cid=1210){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hl40-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const players=new Players(path.join(dir,'players.json')),packets=[],game={players,online:new Set(),push(state,route,raw){if(contract.responses[route])decode(contract.responses[route],raw);packets.push({state,route,raw});}};
 const template=env.templates.find(r=>r.cid===cid),r={...template,dead:false,version:1,homeX:template.x,homeY:template.y};r.entity=env.entity(r);
 const runtime={rows:new Map([[r.id,r]]),lastTick:0};game.environments=new Map([['stage40',runtime]]);
 function player(uid=2){const user={id:uid,username:'player'+uid},p=players.ensure(user),entity={id:uid,uid,cid:40,type:1,physics:{x:r.x+100,y:r.y},physics2:{angle:180},miscInfo:{heroId:1,heroStar:1,curSkinId:101,name:'player'+uid},property:progress.stats(1),equip:{currentItemID:601000},item:{items:[]},camp:{campID:uid},buffer:{buffs:[]}};const state={user,player:p,world:{mapId:2,level:'main',room:'stage40',sceneReady:true,loadingFinished:true,entity,motion:{x:entity.physics.x,y:entity.physics.y},baseProperty:structuredClone(entity.property),environmentSeen:new Map([[r.id,r.version]])}};game.online.add(state);return state;}
 const state=player();return {dir,players,packets,game,r,runtime,state,player};
}
module.exports={fixture};
