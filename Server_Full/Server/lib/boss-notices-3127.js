'use strict';
const enums=require('../CLIENT_ENUMS_3127.json');
const {systemEvent,entityEvent}=require('./proto'),{encode}=require('./codec');
const inventory=require('./inventory');
const clean=s=>String(s||'').replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])).slice(0,160);
function system(name,data,systemType){const codec=systemEvent[name];const err=codec.verify(data);if(err)throw Error(name+': '+err);return {entityID:-1,systemType,eventType:enums.SystemEvent[name],data:Buffer.from(codec.encode(data).finish())};}
function message(type,data){return system('systemMsg',{type,data:JSON.stringify(data)},enums.SystemType.msg);}
function sendRoom(game,room,events){const packet=encode('ReplicateMsg',{events});for(const p of game.online||[])if(p.world?.room===room&&p.world.sceneReady)try{game.push(p,'rm',packet);}catch(e){console.warn('[NOTICE DELIVERY] uid='+p.user?.id,e.message);}}
function flush(game,state,time=Date.now()){const w=state.world;if(!w?.sceneReady||w.loadingFinished===false||time<(w.noticeRetryAt||0))return;const q=w.serverNoticeQueue||[];while(q.length){if(q[0].until<=time){q.shift();continue;}try{game.push(state,'rm',q[0].packet);q.shift();w.noticeRetryAt=0;}catch(e){w.noticeRetryAt=time+250;return;}}}
function sendAll(game,events){const packet=encode('ReplicateMsg',{events}),time=Date.now();for(const p of game.online||[])if(p.world?.sceneReady){const w=p.world;w.serverNoticeQueue||=[];w.serverNoticeQueue.push({packet,until:time+120000});if(w.serverNoticeQueue.length>64)w.serverNoticeQueue.shift();flush(game,p,time);}}
function tick(game,time=Date.now()){for(const p of game.online||[])flush(game,p,time);}
function identity(state){return {name:clean(state.player.name||state.user.launcherName||state.user.username),skin:Number(state.world?.entity.miscInfo?.curSkinId||state.player.curSkinId)||101};}
function killed(game,state,r){if(r.kind!=='boss'||r.killNoticeToken===r.spawnToken)return;r.killNoticeToken=r.spawnToken;const id=identity(state);sendAll(game,[message('kill_boss',{bossID:r.cid,killer:state.user.id,...id})]);}
function respawn(game,room,r){if(r.kind!=='boss'||r.respawnNoticeToken===r.spawnToken)return;r.respawnNoticeToken=r.spawnToken;sendAll(game,[system('createBoss',{id:r.id,cid:r.cid,x:r.x,y:r.y,asNew:true},enums.SystemType.mapResources)]);}
function respawnSoon(game,room,r,time){if(r.kind!=='boss'||!r.dead||r.respawnAlertToken===r.spawnToken||time<r.respawnAt-30000||time>=r.respawnAt)return;r.respawnAlertToken=r.spawnToken;sendAll(game,[message('boss_alert',{bossCID:r.cid})]);}
function rarity(itemId){const item=inventory.items.get(itemId);if(!item)return 0;if(item.itemType===6){const cfg=inventory.weapons.find(w=>w.weaponID===item.args?.[0]&&w.level===1)||inventory.weapons.find(w=>w.weaponID===item.args?.[0]);return Number(cfg?.grade)||0;}if(item.itemType===11)return Number(inventory.equipment.get(itemId)?.Star)||0;return 0;}
function pickup(game,state,drop){if(!drop.sourceBossCID||rarity(drop.item.itemCfgId)<6)return false;sendAll(game,[message('get_valuable',{itemId:drop.item.itemCfgId,...identity(state)})]);return true;}
module.exports={message,system,sendRoom,sendAll,flush,tick,identity,killed,respawn,respawnSoon,rarity,pickup};
