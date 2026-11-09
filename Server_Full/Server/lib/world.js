'use strict';
const {encode,decode,typedError}=require('./codec');
const {proto,systemEvent,entityEvent,commands}=require('./proto');
const {profile,heroData}=require('./profile');
const enums=require('../CLIENT_ENUMS_3127.json');
const inventory=require('./inventory');
const motion=require('./motion-3127');
const water=require('./water-3127');
const actions=require('./actions-3127');
const city=require('./city-3127');
const environment=require('./environment-3127');
const combatInput=require('./combat-input-3127');
const commerce=require('./commerce-3127');
const life=require('./life-3127');
const maps=require('../config/schemes/MapScheme.json').Map;
const navigation=require('./navigation-3127'),dungeons=require('./dungeons-3127');
const LEVELS={guide:{server:'battle-local-guide',roomTag:'local-tutorial',mapId:99,name:'Обучение',mode:9},main:{server:'battle-local-main',roomTag:'local-main',mapId:2,name:'Основной мир',mode:0},rookie:{server:'battle-local-rookie',roomTag:'local-rookie',mapId:2,name:'Мир новичков',mode:1}};
function roomId(l){return l.roomTag+'#1#1';}
function avatar(state){const l=navigation.definition(state.world),map=maps.find(m=>m.ID===l.mapId),h=heroData(state.player);return {id:state.user.id,uid:state.user.id,cid:40,type:1,ud:JSON.stringify({nirvanaTime:0,area_id:0,fishRod:state.player.fishRod||[],isWatcher:false}),physics:{x:map.Born[2],y:map.Born[3],rotation:0,direction:1},physics2:{angle:0},property:{HP:800,maxHP:800,level:state.player.level||1,strength:100,maxStrength:100,currEnergy:100,maxEnergy:100,property:{attack:10000,speed:700,attackSpeed:1}},miscInfo:{name:profile(state.user,state.player).name,heroId:h.heroId,heroName:h.heroName,curSkinId:h.curSkinId,heroStar:Math.max(1,h.lv||1),life:1},item:{items:inventory.inventoryOf(state),warehouses:[],tabGridCount:inventory.gridCounts()},camp:{campID:state.user.id},team:{},equip:{curSkinID:h.curSkinId,...inventory.equipData(inventory.inventoryOf(state),state.world.level==='guide'?state.world.currentWeaponUUID:state.player.currentWeaponUUID)},building:{buildings:[]},settle:{killCount:0,killBossCount:0,life:1,canRespawn:true},buffer:{},skill:{},talent:require('./talents-3127').info(state.player),task:require('./quests-3127').snapshot(state),draw:{count:0},pet:{pets:[]},guild:{},mount:require('./mounts-3127').snapshot(state.player,state.world),designation:{}};}
function members(game,state){return [...(game.online||[])].filter(s=>s.user&&s.world?.room===state.world?.room&&(s===state||state.world.level!=='guide'));}
function roomObject(level,room,state,game,withEntities=false,includeCity=true){const peers=state?[state,...members(game,state).filter(s=>s!==state)]:[];return {roomId:room,roomType:0,name:level.name,maxPlayers:128,mapId:level.mapId,state:0,startGameTime:Math.floor((state?.world?.startedAt||Date.now())/1000),players:peers.map(s=>profile(s.user,s.player,s.world)),entities:withEntities?[...peers.filter(s=>s.world.sceneReady&&s.world.entity).map(s=>s.world.entity),...require('./hero-vfx-3127').snapshot(peers),...(state?inventory.groundRecords(game,state).map(x=>inventory.dropEntity(x.drop)):[]),...(state?actions.roomStructures(game,state).map(actions.entityOf):[]),...(state&&includeCity?city.entitiesFor(state.world.level,state.world.mapId):[]),...(state?navigation.entities(game,state):[]),...(state?dungeons.entities(game,state):[])]:[],gameMode:level.mode,seasonId:0,battleId:level.server,roomNo:1};}
function roomData(level,room,online=1){return encode('IORoomInfo',roomObject(level,room));}
function entryReply(level,room){return encode('IOGameLoginRsp',{code:0,room:roomObject(level,room)});}
function validSelection(fields,guide){const {textField}=require('./wire');const id=textField(fields,2),room=textField(fields,3);if(guide)return id&&![LEVELS.guide.server,'local-tutorial'].includes(id)?null:{level:LEVELS.guide,room:roomId(LEVELS.guide)};const level=Object.values(LEVELS).find(l=>l.server===id||l.roomTag===id);if(!level||level===LEVELS.guide||room&&room!==roomId(level))return null;return {level,room:roomId(level)};}
function destroyEvent(ids,typ=1){return {entityID:-1,systemType:enums.SystemType.entity,eventType:enums.SystemEvent.entityDestroyed,data:Buffer.from(systemEvent.entityDestroyed.encode({entities:ids.map(id=>({id,typ}))}).finish())};}
function roomPeers(game,state){return [state,...members(game,state).filter(s=>s!==state)].filter(s=>s.world?.sceneReady);}
function detachWorld(game,state){dungeons.detached(game,state);if(!state.world)return;try{require('./launcher-state-3127').checkpoint(game,state,Date.now(),true);}catch(e){console.warn('[PLAYTIME SAVE]',e.message);}actions.clearStructures(game,state);if(state.player&&(state.world.sceneReady||state.world.lifeActive))try{life.finish(game,state);}catch(e){console.warn('[SESSION FINISH] retry on next login:',e.message);}require('./pets-3127').clear(game,state);require('./projectiles-3127').clear(game,state);require('./hero-vfx-3127').clear(game,state);game.teams?.detach(state);if(state.world.sceneReady){for(const peer of members(game,state))if(peer!==state&&peer.world.sceneReady){replicate(game,peer,[destroyEvent([state.world.entity.id])]);game.push(peer,'onPlayerExit',encode('IOGamePlayerExit',{players:[profile(state.user,state.player,state.world)]}));}}state.world=null;}
function inventoryPush(game,state,result){
 if(result.privateEvents.length)replicate(game,state,result.privateEvents.map(([name,data])=>entityEventData(state.world.entity,name,data)));
 const events=result.publicEvents.map(([name,data])=>entityEventData(state.world.entity,name,data));if(result.created.length)events.push(spawnEvent(result.created));if(result.destroyed.length)events.push(destroyEvent(result.destroyed));
 if(events.length)for(const peer of roomPeers(game,state))replicate(game,peer,events);
}

function replicateActorEvents(game,state,events){
 const privateTypes=new Set(['taskAdded','taskUpdated','taskCompleted','taskRemoved'].map(k=>enums.EntityEvent[k])),actor=state.world?.entity?.id,privateEvents=events.filter(e=>e.entityID===actor&&privateTypes.has(e.eventType)),publicEvents=events.filter(e=>!(e.entityID===actor&&privateTypes.has(e.eventType)));
 // Quest sync retries the latest snapshot after any failed private send.
 if(privateEvents.length)try{replicate(game,state,privateEvents);}catch{}
 if(publicEvents.length)for(const peer of [state,...members(game,state).filter(s=>s!==state)])if(peer.world?.sceneReady)try{replicate(game,peer,publicEvents);}catch{}
}
function replicate(game,state,events){try{game.push(state,'rm',encode('ReplicateMsg',{events}));}catch(error){require('./fishing-delivery-3127').capture(game,state,events);throw error;}environment.acknowledge(game,state,events);require('./level-delivery-3127').ack(game,state,events);}
function entityEventData(entity,name,data){const t=entityEvent[name];const error=t.verify(data);if(error)throw Error(name+': '+error);return {entityID:entity.id,systemType:enums.SystemType.entity,eventType:enums.EntityEvent[name],data:Buffer.from(t.encode(data).finish())};}
function spawnEvent(entities){return {entityID:-1,systemType:enums.SystemType.entity,eventType:enums.SystemEvent.entityCreated,data:Buffer.from(systemEvent.entityCreated.encode({entities}).finish())};}
function cityWorldStats(world){
 const planned=world?.citySpawnPlanned||{npc:0,wall:0,bridge:0,other:0,total:0};
 const sent=world?.citySentByKind||{npc:0,wall:0,bridge:0,other:0};
 const actualSent=(world?.citySpawnSent||0);
 const clientActive=!!world?.clientFrameSeen;
 return {configured:planned,sent:{...sent,total:actualSent},pending:world?.citySpawnQueue?.length||0,initial:world?.cityInitialSent||0,
  complete:!!world?.citySpawnComplete,loadFinished:!!world?.loadingFinished,clientFrames:world?.cityFrameSeq||0,
  framesAfterLastSend:Math.max(0,(world?.cityFrameSeq||0)-(world?.cityLastSendFrame||0)),
  sendFailures:world?.citySendFailures||0,lastSendError:world?.cityLastSendError||null,
  clientNetworkActive:clientActive,clientRendered:'UNVERIFIED_NO_CLIENT_RENDER_ACK'};
}
function logCityWorld(world,uid,phase){const s=cityWorldStats(world),p=s.configured,q=s.sent;
 console.info(`[CITY WORLD] uid=${uid} map=${world?.mapId||0} stage=${phase} planned=${p.total} npc=${p.npc} wall=${p.wall} bridge=${p.bridge} other=${p.other} transmitted=${q.total} npcSent=${q.npc} wallSent=${q.wall} bridgeSent=${q.bridge} remaining=${s.pending} clientFrames=${s.clientFrames} render=UNVERIFIED`);
}
function streamCityBatch(game,state,now=Date.now()){
 const w=state.world;if(!w?.sceneReady||!w.citySpawnQueue?.length||!w.clientFrameSeen||!(w.loadingFinished||w.cityLoadingFallbackLogged))return false;
 // A slow client may pause for an asset load. A new valid frame must release
 // the pause; Stage45 logged a promise to resume but never cleared this flag.
 if(w.cityPaused&&(w.cityFrameSeq||0)>(w.cityLastAckFrame||0)){w.cityPaused=false;w.cityStallWarned=false;w.cityResumeCount=(w.cityResumeCount||0)+1;}
 if(w.cityPaused)return false;
 if((w.cityFrameSeq||0)<=(w.cityLastAckFrame||0)||now-(w.cityLastBatchAt||0)<(w.loadingFinished?220:850))return false;
 const batch=w.citySpawnQueue.slice(0,w.loadingFinished?2:1);w.cityLastBatchAt=now;
 // Keep the queue and counters unchanged until encoding and transport succeed.
 try{replicate(game,state,[spawnEvent(batch)]);}catch(error){w.citySendFailures=(w.citySendFailures||0)+1;w.cityLastSendError=String(error.message||error).slice(0,240);console.warn(`[CITY DELIVERY] uid=${state.user.id} queued=${batch[0].id} retained; ${w.cityLastSendError}`);return false;}
 w.citySpawnQueue.splice(0,batch.length);w.cityLastSendError=null;w.cityLastAckFrame=w.cityFrameSeq;w.cityLastSendFrame=w.cityFrameSeq;
 w.cityLastEntity={id:batch.at(-1).id,cid:batch.at(-1).cid,type:batch.at(-1).type,prefab:city.byId.get(batch.at(-1).id)?.prefab_path||''};
 w.citySpawnSent=(w.citySpawnSent||0)+batch.length;w.citySentByKind||={npc:0,wall:0,bridge:0,other:0};
 for(const e of batch){const category=city.visualKind(e);w.citySentByKind[category]=(w.citySentByKind[category]||0)+1;}
 if(process.env.HEROS_CITY_VERBOSE==='1')console.info(`[CITY ENTITY] uid=${state.user.id} ids=${batch.map(e=>e.id).join(',')} remain=${w.citySpawnQueue.length}`);
 if(w.citySpawnSent%10===0||!w.citySpawnQueue.length)logCityWorld(w,state.user.id,'spawn-progress');
 if(!w.citySpawnQueue.length){w.citySpawnComplete=true;console.info(`[WORLD LOAD] uid=${state.user.id} city-transmitted count=${w.citySpawnSent}; visuals need client verification`);}return true;
}
// The original 3.12 client exits an active battle on its own: death panel and
// menu both request exitBattle and notify onPlayerRestartGame while releasing
// the game scene. Only the server-initiated guide skip needs a `toMain` push.
// Sending toMain during the client's release triggers a second scene release.
function leave(game,state,skip=false,notifyClient=true){
 if(skip){state.player.tutorialCompleted=true;state.player.tutorialSkipped=true;}
 detachWorld(game,state);
 state.player.lastWorld=null;state.player.lastRoom='';game.players.save();
 game.push(state,'updatePlayer',encode('PlayerInfo',profile(state.user,state.player)));
 if(notifyClient)game.push(state,'toMain',encode('ExtendInfo',{typ:'toMain'}));
}
function clientRestart(game,state){
 // The notification may arrive before or after exitBattle. Never release the
 // client's scene a second time, and do not leave dead world timers running.
 if(state.world)leave(game,state,false,false);
}

function onWorld(game,state,m,fields){if(!state.player||!state.user)return false;const reply=(type,data)=>{if(m.type!==1)game.reply(state,m.id,encode(type,data));};
 if(m.route==='battle.iob.heartbeat'){game.heartbeats.heartbeat(state,'battle');reply('FrameStepResp',{code:0});return true;}
 if(m.route==='battle.iob.getNextSwitchSeasonTime'){reply('NextSwitchSeasonTimeRsp',{timestamp:Math.floor(Date.now()/1000)+86400,seasonId:0});return true;}
 if(['game.gameHandler.enterGuide','game.gameHandler.enterBattle'].includes(m.route)){
  const selected=validSelection(fields,m.route.endsWith('enterGuide'));
  if(!selected){game.reply(state,m.id,typedError(m.route,'UNKNOWN_LOCAL_WORLD'));return true;}
  const {level,room}=selected;
  const req=decode('IOGameLoginReq',m.body||Buffer.alloc(0));
  if(level!==LEVELS.guide){try{inventory.canonicalInventory(state.player.inventory||[]);}catch(e){game.reply(state,m.id,typedError(m.route,e.message));return true;}}
  detachWorld(game,state);
  if(level!==LEVELS.guide){const before=inventory.inventoryOf(state),after=before.filter(i=>inventory.defaultBag(i.itemCfgId)!==8);if(after.length!==before.length)inventory.commit(game,[[state.player,'inventory',after]],true);}
  if(state.player.structures?.length)inventory.commit(game,[[state.player,'structures',[]]],true);
  state.world={level:Object.keys(LEVELS).find(k=>LEVELS[k]===level),room,server:level.server,mapId:level.mapId,questCategory:level.mode===1?1:0,sceneReady:false,startedAt:Date.now(),guideStage:'part_0',inventory:[],groundDrops:[],structures:[]};
  if(!state.player.name&&req.player?.name){state.player.name=req.player.name.slice(0,20);}
  state.world.entity=avatar(state);if(state.world.level!=='guide')state.world.entity.property=require('./progression-3127').initial(state,state.world.entity);state.world.safeZoneId=city.safeAreaAt(state.world.entity.physics.x,state.world.entity.physics.y,state.world.level,state.world.mapId)?.id||null;state.world.safeZoneTransitions=0;state.world.motion=motion.createMotion(state.world.entity);state.world.baseProperty=structuredClone(state.world.entity.property);state.world.entity.property=require('./hamster-3127').apply(inventory.equipmentProperty(state.world.baseProperty,inventory.inventoryOf(state)),state);life.attach(state);state.player.lastWorld=state.world.level;state.player.lastRoom=room;game.players.save();
  reply('IOGameLoginRsp',{code:0,room:roomObject(level,room,state,game)});
  console.info(`[WORLD] assigned uid=${state.user.id} level=${state.world.level} map=${level.mapId} mode=${level.mode} room=${room}`);return true;
 }
 if(['battle.iob.enter','battle.iob.reEnter'].includes(m.route)){
  const world=state.world,req=decode('IOGameEnterReq',m.body||Buffer.alloc(0));
  if(!world||req.roomId&&req.roomId!==world.room){game.reply(state,m.id,typedError(m.route,'WORLD_SESSION_NOT_SELECTED'));return true;}
  if([1,3].includes(req.enterType)&&Object.hasOwn(req,'uid')&&Number(req.uid)!==0&&Number(req.uid)!==state.user.id){game.reply(state,m.id,typedError(m.route,'PLAYER_ID_MISMATCH'));return true;}
  if(![0,1,2,3].includes(req.enterType)){game.reply(state,m.id,typedError(m.route,'INVALID_ENTER_TYPE'));return true;}
  if([1,3].includes(req.enterType)){
   let result;try{result=life.respawn(game,state,req.enterType);}catch(error){game.reply(state,m.id,typedError(m.route,error.message,error.code||1));return true;}
   world.sceneReady=true;require('./launcher-state-3127').begin(state);const e=world.entity,events=[entityEventData(e,'moveTo',{x:e.physics.x,y:e.physics.y,direction:1,frequency:1}),entityEventData(e,'propertyResult',{propRes:e.property}),entityEventData(e,'setHP',{currentHP:e.property.HP,maxHP:e.property.maxHP}),entityEventData(e,'relive',{})];
   life.protection(state,Date.now(),events,entityEventData);
   reply('IOGameEnterRsq',{code:0,room:roomObject(navigation.definition(world),world.room,state,game,true,false)});
   for(const peer of roomPeers(game,state))replicate(game,peer,events);
   const progression=require('./progression-3127'),mode=world.level==='rookie'?1:0,pr=progression.progress(result.exp,mode);
   replicate(game,state,[entityEventData(e,'updateTotalExp',{totalExp:result.exp}),entityEventData(e,'addExp',{remainExp:pr.remainExp,maxLevelExp:pr.maxLevelExp,isLevelUp:false,addedExp:0})]);
   game.push(state,'updateCoin',encode('CoinUpdatePush',{coin:state.player.coin}));game.push(state,'updatePlayer',encode('PlayerInfo',profile(state.user,state.player,world)));return true;
  }
  const firstEntry=!world.sceneReady;world.sceneReady=true;world.lifeActive=true;require('./launcher-state-3127').begin(state);world.safeZoneId=city.safeAreaAt(world.entity.physics.x,world.entity.physics.y,world.level,world.mapId)?.id||null;
  // The main-hall cannot process a large unverified 2024 city prefab batch at scene entry.
  // Finish the local player handshake first; send city entities only after a gameplay frame.
  // Unverified 2024 city prefabs from a later snapshot can crash Cocos when spawned.
  // Native client-city visuals are now the default even with `node server`; set off to diagnose renderer issues.
  const cityMode=city.spawnMode();
  const includeCity=cityMode==='immediate';
  const room=roomObject(navigation.definition(world),world.room,state,game,true,includeCity);
  if(firstEntry){const initialMonsters=environment.initialMobs(game,state,1850,8);room.entities.push(...initialMonsters);world.initialMobCount=initialMonsters.filter(e=>e.monster).length;}
  if(firstEntry){world.enterAt=Date.now();world.loadingFinished=false;world.clientFrameSeen=false;
    world.citySpawnQueue=cityMode==='off'||includeCity?[]:city.entitiesFor(world.level,world.mapId).filter(e=>cityMode!=='one'||String(e.id)===String(process.env.HEROS_CITY_ENTITY_ID||''));
    // Among NPCs, create nearby actors first; static geometry remains in original order.
    const orderedNpc=world.citySpawnQueue.filter(e=>city.visualKind(e)==='npc').sort((a,b)=>Math.hypot(a.physics.x-world.entity.physics.x,a.physics.y-world.entity.physics.y)-Math.hypot(b.physics.x-world.entity.physics.x,b.physics.y-world.entity.physics.y));
    world.citySpawnQueue=[...orderedNpc,...world.citySpawnQueue.filter(e=>city.visualKind(e)!=='npc')];
    world.cityInitialSent=includeCity?city.entitiesFor(world.level,world.mapId).length:0;
    world.citySpawnPlanned=city.visualCounts(cityMode==='off'?[]:city.entitiesFor(world.level,world.mapId).filter(e=>cityMode!=='one'||String(e.id)===String(process.env.HEROS_CITY_ENTITY_ID||'')));
    world.citySpawnSent=world.cityInitialSent;
    world.citySentByKind={npc:0,wall:0,bridge:0};
    if(includeCity)for(const e of city.entitiesFor(world.level,world.mapId))world.citySentByKind[city.visualKind(e)]++;
    world.citySpawnComplete=!world.citySpawnQueue.length;world.citySendFailures=0;world.cityLastSendError=null;
    world.cityLastSendFrame=0;world.cityLastBatchAt=0;world.cityFrameSeq=0;world.cityLastAckFrame=0;world.cityLastEntity=null;world.cityLastBatchFrame=0;world.cityPaused=false;world.cityStallWarned=false;world.lastClientFrameAt=null;world.loadWarningPrinted=false;}
  console.info(`[WORLD LOAD] uid=${state.user.id} phase=enter cityMode=${cityMode} initialEntities=${room.entities.length} cityQueued=${world.citySpawnQueue?.length||0}`);
  if(firstEntry){if(world.mapId===2&&world.level!=='guide')environment.room(game,world.room);logCityWorld(world,state.user.id,'scene-enter');}
  reply('IOGameEnterRsq',{code:0,room});
  // CC entity proxies subscribe before requesting battle.iob.enter. Their wire route is rm.
  replicate(game,state,[spawnEvent(room.entities)]);const deathReplay=life.restoreEvents(state,entityEventData);if(deathReplay.length)replicate(game,state,deathReplay);
  for(const peer of members(game,state))if(firstEntry&&peer!==state&&peer.world.sceneReady){replicate(game,peer,[spawnEvent([world.entity])]);game.push(peer,'onPlayerEnter',encode('IOGamePlayerEnter',{players:[profile(state.user,state.player,world)]}));}
  console.info(`[WORLD] snapshot uid=${state.user.id} map=${world.mapId} players=${room.players.length} entities=${room.entities.length} push=rm`);return true;
 }
 if(m.route==='battle.iob.frame'){
  if(!state.world?.sceneReady){reply('FrameStepResp',{code:proto.ErrorCode.ROOM_INVALID});return true;}
  if(!state.world.clientFrameSeen){state.world.clientFrameSeen=true;
    console.info(`[WORLD LOAD] uid=${state.user.id} phase=first-client-frame afterMs=${Date.now()-(state.world.enterAt||Date.now())}`);}
  let req;try{req=decode('FrameStepReq',m.body);}catch{reply('FrameStepResp',{code:1,message:'BAD_FRAME'});return true;}
  state.world.cityFrameSeq=(state.world.cityFrameSeq||0)+1;state.world.lastClientFrameAt=Date.now();
  if(req.cmds.length>64){reply('FrameStepResp',{code:1,message:'FRAME_LIMIT'});return true;}
  const entity=state.world.entity,events=[],petPrivate=[];let code=0,error='';
  for(const cmd of req.cmds){if(!state.world?.sceneReady)break;const name=enums.CommandType[cmd.type];try{
   if((state.world.dead||entity.property.HP<=0)&&!life.allowedWhileDead(name))throw Error('PLAYER_DEAD');
   if(require('./item-exchange-3127').handle(game,state,name,cmd.data))continue;
   if(require('./food-effects-3127').handle(game,state,name,cmd.data,events,entityEventData))continue;
   if(require('./chef-pots-3127').handle(game,state,name,cmd.data,events,entityEventData))continue;
   if(inventory.supported.has(name)){const type='Command'+name[0].toUpperCase()+name.slice(1),c=commands[type].decode(cmd.data);const beforeItems=inventory.inventoryOf(state).map(i=>({...i}));inventoryPush(game,state,inventory.runInventory(game,state,name,c));
    const quest=require('./quests-3127');for(const item of inventory.inventoryOf(state)){const old=beforeItems.filter(i=>i.itemCfgId===item.itemCfgId).reduce((n,i)=>n+i.num,0),current=inventory.inventoryOf(state).filter(i=>i.itemCfgId===item.itemCfgId).reduce((n,i)=>n+i.num,0);if(current>old){quest.record(game,state,8,{itemID:item.itemCfgId,count:current-old},events,entityEventData);if(name==='pickUpItem'&&[6,11].includes(inventory.items.get(item.itemCfgId)?.itemType))quest.record(game,state,24,{itemID:item.itemCfgId,count:current-old},events,entityEventData);}}
    quest.reconcile(game,state,events,entityEventData);continue;}
   if(name==='loginLoadingFinish'){state.world.loadingFinished=true;navigation.loaded(game,state,events,entityEventData);if(state.world.level!=='guide'){const progression=require('./progression-3127'),pr=progression.progress(progression.totalOf(state.player,state.world.level==='rookie'?1:0),state.world.level==='rookie'?1:0);replicate(game,state,[entityEventData(entity,'updateTotalExp',{totalExp:pr.totalExp}),entityEventData(entity,'addExp',{remainExp:pr.remainExp,maxLevelExp:pr.maxLevelExp,isLevelUp:false,addedExp:0})]);}require('./room-rank-3127').publish(game,state,Date.now(),true);water.syncWaterState(state.world,entity,events,entityEventData,true);environment.syncView(game,state);console.info(`[WORLD LOAD] uid=${state.user.id} phase=loginLoadingFinish`);logCityWorld(state.world,state.user.id,'client-loading-finished');continue;}
   if(name==='exitTeam'){
    const c=commands.CommandExitTeam.decode(cmd.data);
    const t=game.teams?.teamFor(state.user.id);
    const target=Number(c.memberID)||state.user.id;
    if(target!==state.user.id&&(!t||t.leader!==state.user.id||!t.members.includes(target)))throw Error('TEAM_MEMBER_PERMISSION_DENIED');
    if(t)game.teams.leave(target);
    if(target===state.user.id){
     game.push?.(state,'teamMembersUpdatePush',encode('TeamMembersUpdatePush',{teamMembers:[],teamLeaderUid:0,teamName:'',teamUuid:''}));
     events.push(entityEventData(entity,'teamChange',{teamID:0,teamName:'',leaderUID:0}));
    }
    continue;
   }
   if(require('./pets-3127').handle(game,state,name,cmd.data,events,petPrivate))continue;

   if(name==='doOffline'){commands.CommandDoOffline.decode(cmd.data);if(state.world.level==='guide')throw Error('USE_EXIT_GUIDE');const result=life.die(game,state,null,Date.now(),true);if(result){events.push(...life.deathEvents(state,result.pending,entityEventData));state.world.offlinePending=result.pending.id;life.deliverOffline(game,state);}continue;}
   if(name==='exitGuide'&&state.world.level==='guide'){reply('FrameStepResp',{code:0});leave(game,state,true);return true;}
   if(name==='triggerGuideNext'&&state.world.level==='guide'&&state.world.guideStage==='part_0'){state.world.guideStage='part_1/move';events.push(entityEventData(entity,'guideStageUpdated',{json:JSON.stringify({stage:state.world.guideStage,data:null})}));continue;}
   if(require('./player-skills-3127').movementBlocked(state)&&['moveStart','rotateTo','rotateStart'].includes(name)){events.push(entityEventData(entity,'moveStop',{}));continue;}
   if(name==='moveTo'){const c=commands.CommandMoveTo.decode(cmd.data);motion.moveTo(state.world.motion,state.world.mapId,c.x,c.y);state.world.ignoredClickMoveCount=(state.world.ignoredClickMoveCount||0)+1;continue;}
   if(name==='rotateTo'){const c=commands.CommandRotateTo.decode(cmd.data),angle=motion.rotate(state.world.motion,c.angle);entity.physics2.angle=angle;entity.physics.rotation=angle;events.push(entityEventData(entity,'rotateTo',{angle,rotation:angle}));continue;}
   if(name==='rotateStart'){const c=commands.CommandRotateStart.decode(cmd.data);state.world.rotationDirection=c.unticlock?1:-1;events.push(entityEventData(entity,'rotateStart',{anticlock:c.unticlock}));continue;}
   if(name==='rotateStop'){state.world.rotationDirection=0;events.push(entityEventData(entity,'rotateStop',{}));continue;}
   if(name==='idle'){motion.stop(state.world.motion);events.push(entityEventData(entity,'moveStop',{}));continue;}
   if(name==='syncAngles'){continue;}
   if(name==='openMap'){commands.CommandOpenMap.decode(cmd.data);require('./quests-3127').record(game,state,16,{},events,entityEventData);continue;}
   if(name==='relaxAnimReq'){const c=commands.CommandRelaxAnimReq.decode(cmd.data);if(!require('../config/schemes/PlayerActionScheme.json').PlayerAction.some(a=>a.ID===c.animIdx&&a.isValid&&a.ActionType.includes(0)))throw Error('UNKNOWN_PLAYER_ACTION');require('./quests-3127').record(game,state,23,{},events,entityEventData);events.push(entityEventData(entity,'playRelaxAnim',{animIdx:c.animIdx}));continue;}
   if(name==='finishNPCTalk'){const c=commands.CommandFinishNPCTalk.decode(cmd.data);const result=city.resolveTalk(state.world.level,state.world.mapId,entity.physics.x,entity.physics.y,c.npcCID,c.talkGroupID);if(!result.ok)throw Error(result.reason);state.world.lastNpcTalk={id:result.npc.id,cid:c.npcCID,group:c.talkGroupID,time:Date.now()};require('./quests-3127').record(game,state,1,{cid:c.npcCID,talkGroupID:c.talkGroupID},events,entityEventData);continue;}
   if(navigation.handle(game,state,name,cmd.data,events,entityEventData))continue;
   if(require('./hero-switch-3127').handle(game,state,name,cmd.data,events,entityEventData))continue;
   if(require('./quests-3127').handle(game,state,name,cmd.data))continue;
   if(require('./mounts-3127').handle(game,state,name,cmd.data,events,entityEventData))continue;
   if(environment.interact(game,state,name,cmd.data,events,entityEventData))continue;
   if(require('./fishing-3127').handle(game,state,name,cmd.data,events,entityEventData))continue;
   if(require('./newbie-3127').use(game,state,name,cmd.data,events,entityEventData))continue;
   if(combatInput.handle(game,state,name,cmd.data,events,entityEventData,destroyEvent))continue;
   if(name==='draw'){const c=commands.CommandDraw.decode(cmd.data);const spin=commerce.wheelSpin(game,state,Number(c.id));events.push(entityEventData(entity,'drawBegin',{position:spin.position}));events.push(entityEventData(entity,'drawEnd',{draw:spin.draw,items:[spin.prize]}));continue;}
   if(name==='build'){const c=commands.CommandBuild.decode(cmd.data);const result=actions.build(game,state,c);if(c.check){events.push(entityEventData(entity,'buildCheck',{result:result.check}));}else{events.push(entityEventData(entity,'buildSuccessfully',{}));inventoryPush(game,state,{privateEvents:result.changes,publicEvents:[],created:[actions.entityOf(result.record)],destroyed:[]});}continue;}
   if(name==='buildDestroy'){const c=commands.CommandBuildDestroy.decode(cmd.data);const record=actions.destroy(game,state,c);events.push(entityEventData(entity,'buildCompleted',{type:record.buildID}));for(const peer of roomPeers(game,state))replicate(game,peer,[destroyEvent([record.id])]);continue;}
   
   if(name==='moveStart'){const c=commands.CommandMoveStart.decode(cmd.data);const scale=Object.hasOwn(c,'speedScale')?c.speedScale:100;const action=motion.start(state.world.motion,c.forward,scale);events.push(entityEventData(entity,action==='start'?'moveStart':'moveStop',action==='start'?{forward:!!c.forward}:{}));continue;}
   if(name==='moveStop'){motion.stop(state.world.motion);events.push(entityEventData(entity,'moveStop',{}));continue;}
   // Unknown commands remain auditable and do not claim a completed mutation.
   const key='command.'+(name||cmd.type);game.unhandled.set(key,(game.unhandled.get(key)||0)+1);code=1;
  }catch(e){code=1;error=e.message;}}
  reply('FrameStepResp',{code,message:code?(error||'COMMAND_NOT_IMPLEMENTED_OR_INVALID'):''});if(petPrivate.length)try{replicate(game,state,petPrivate);}catch{state.world.petRefreshPending=true;}if(events.length)replicateActorEvents(game,state,events);return true;
 }
 if(navigation.route(game,state,m))return true;
 if(m.route==='game.gameHandler.onPlayerRestartGame'){
  clientRestart(game,state);return true;
 }
 if(['game.gameHandler.exitGuide','game.gameHandler.exitBattle'].includes(m.route)){
  // Client-initiated logout: the client is already transitioning itself.
  // Teardown is idempotent when onPlayerRestartGame follows this request.
  if(state.world?.level!=='guide')try{life.finish(game,state);}catch(error){if(m.type!==1)game.reply(state,m.id,typedError(m.route,error.message));return true;}
  reply('IOGameLogoutRsp',{code:0,data:profile(state.user,state.player)});
  if(state.world)leave(game,state,false,false);
  return true;
 }
 if(['battle.iob.getEquipments','battle.iob.getEquipmentsByUID'].includes(m.route)){
  if(!state.world?.sceneReady){reply('GetEquipmentsRsp',{code:1});return true;}
  const byUID=m.route.endsWith('ByUID'),req=decode(byUID?'GetEquipmentsReqByUID':'GetEquipmentsReq',m.body),id=byUID?Number(req.uid):req.entityId;
  const target=id&&id!==state.user.id?roomPeers(game,state).find(s=>s.user.id===id):state;
  if(!state.world?.sceneReady||!target?.world?.entity){reply('GetEquipmentsRsp',{code:1});return true;}
  const e=target.world.entity;reply('GetEquipmentsRsp',{code:0,uid:target.user.id,showId:String(target.user.id),level:e.property.level,prop:e.property,skinId:e.equip.curSkinID,weaponId:e.equip.currentItemID,equipments:e.equip.curEquipmentsID});return true;
 }

 if(m.route==='battle.iob.queryNearbyPlayers'){
  if(!state.world?.sceneReady){reply('QueryNearbyPlayersRsp',{code:1,data:[]});return true;}
  const base=state.world.entity.physics;
  const nearby=roomPeers(game,state).filter(peer=>peer!==state&&peer.world.room===state.world.room&&Math.hypot(peer.world.entity.physics.x-base.x,peer.world.entity.physics.y-base.y)<=2500).slice(0,80);
  reply('QueryNearbyPlayersRsp',{code:0,data:nearby.map(peer=>profile(peer.user,peer.player,peer.world))});return true;
 }
 if(m.route==='battle.iob.teammatesLocReq'){
  if(!state.world?.sceneReady){reply('TeammatesLocRsp',{teammatesLoc:[]});return true;}
  const request=decode('TeammatesLocReq',m.body||Buffer.alloc(0)),team=game.teams?.teamFor(state.user.id);
  const allowed=team?new Set(team.members):new Set([state.user.id]);
  const wanted=new Set((request.teammatesUid||[]).slice(0,80).map(Number));
  const teammates=roomPeers(game,state).filter(peer=>allowed.has(peer.user.id)&&(!wanted.size||wanted.has(peer.user.id))).map(peer=>({uid:peer.user.id,entityID:peer.world.entity.id,loc:{x:peer.world.entity.physics.x,y:peer.world.entity.physics.y}}));
  reply('TeammatesLocRsp',{teammatesLoc:teammates});return true;
 }
 const reads={'battle.iob.getFubenInfo':['FubenInfoRsp',{code:0,info:{}}],'battle.iob.getCurrentFubenInfo':['CurrentFubenInfoRsp',{code:0,line:1}],'battle.iob.getDoubleDropActivity':['GetDoubleDropRsp',{info:{}}]};
 if(reads[m.route]){reply(...reads[m.route]);return true;}return false;
}
function tickWorld(game,elapsed=0.1){require('./boss-notices-3127').tick(game);dungeons.tick(game);inventory.expireGround(game);environment.tick(game,elapsed);for(const state of game.online){const w=state.world;if(!w?.sceneReady||!w.entity)continue;
 const now=Date.now();
 require('./quests-3127').sync(game,state,now);
 life.deliverOffline(game,state);
 require('./item-exchange-3127').flush(game,state,now);
 require('./launcher-state-3127').begin(state,now);try{require('./launcher-state-3127').checkpoint(game,state,now);}catch(e){console.warn('[PLAYTIME SAVE]',e.message);}
 if(!w.clientFrameSeen&&now-(w.enterAt||now)>=12000&&!w.loadWarningPrinted){
   w.loadWarningPrinted=true;
   console.warn(`[WORLD LOAD STALLED] uid=${state.user.id} room=${w.room} no battle.iob.frame after 12s; initial city deferred=${w.citySpawnQueue?.length||0}; check client Console for scene/decode/asset error`);
 }
 // Wait for active client frames before streaming city batches. Prefer the
 // loading-finished signal; older clients use the slower single-object fallback.
 if(w.citySpawnQueue?.length && !w.loadingFinished && w.clientFrameSeen && w.cityFrameSeq>=8 && now-(w.enterAt||now)>3500 && !w.cityLoadingFallbackLogged){
   w.cityLoadingFallbackLogged=true;
   console.warn(`[CITY LOAD FALLBACK] uid=${state.user.id} loginLoadingFinish not received; active game frames=${w.cityFrameSeq}; starting slow phased city streaming`);
 }
 streamCityBatch(game,state,now);
 if(w.citySpawnQueue?.length && w.cityLastEntity && !w.cityStallWarned && now-(w.cityLastBatchAt||now)>7000 && (w.cityFrameSeq||0)===(w.cityLastAckFrame||0)){
   w.cityPaused=true;w.cityStallWarned=true;logCityWorld(w,state.user.id,'paused-no-frames');
   console.warn(`[CITY DIAG WAITING] uid=${state.user.id} no new frame after entity=${w.cityLastEntity.id} prefab=${w.cityLastEntity.prefab}; remaining=${w.citySpawnQueue.length}; will resume automatically on next valid frame`);
 }
 const e=w.entity,events=[],dt=Math.min(0.1,Math.max(0,elapsed));
 require('./hero-summons-3127').tick(game,state,now,dt,events,entityEventData);
 require('./pets-3127').tick(game,state,now,dt,events,entityEventData);
 if(w.dead||e.property.HP<=0){if(w.motion)motion.stop(w.motion);continue;}
 require('./storm-skills-3127').tick(game,state,now,events,entityEventData);
 require('./newbie-3127').tick(game,state,now,events,entityEventData);
 life.protection(state,now,events,entityEventData);
 require('./healing-3127').tick(game,state,now,events,entityEventData);
 if(!w.motion)w.motion=motion.createMotion(e);
 if(require('./player-skills-3127').movementBlocked(state)){motion.stop(w.motion);w.rotationDirection=0;}
 if(w.rotationDirection){const angle=motion.rotate(w.motion,w.motion.angle+w.rotationDirection*180*dt);e.physics2.angle=angle;e.physics.rotation=angle;events.push(entityEventData(e,'rotateTo',{angle,rotation:angle}));}
 const blockers=[...actions.roomStructures(game,state).map(b=>actions.buildingCollider(b,32)).filter(Boolean),...city.collidersFor(w.level,w.mapId)];
 combatInput.tick(game,state,events,entityEventData,destroyEvent);
 const staminaRate=(Number(e.property.property?.staminaRecover)||0)+require('./relics-3127').stamina(state)+(require('./talents-3127').modifiers(state.player)[19]||0);if(staminaRate>0&&e.property.strength<e.property.maxStrength){w.staminaFraction=(w.staminaFraction||0)+staminaRate*dt;if(w.staminaFraction>=1){const amount=Math.floor(w.staminaFraction);w.staminaFraction-=amount;e.property.strength=Math.min(e.property.maxStrength,e.property.strength+amount);events.push(entityEventData(e,'propertyResult',{propRes:e.property}));}}
 const result=motion.step(w.motion,w.mapId,dt,(Number(e.property?.property?.speed)||700)+environment.modifiers(state).speed,blockers);
 if(result.changed){e.physics.x=w.motion.x;e.physics.y=w.motion.y;e.physics2.angle=w.motion.angle;events.push(entityEventData(e,'moveTo',{x:e.physics.x,y:e.physics.y,direction:e.physics.direction,frequency:1}));}
 water.syncWaterState(w,e,events,entityEventData);
 try{require('./fishing-3127').tick(game,state,now,events,entityEventData);}catch(error){console.warn('[FISHING]',error.message);require('./fishing-3127').stop(state,events,entityEventData);}
 // State is authoritative: both world instances and PvP/build logic refer to this zone.
 require('./quests-3127').reconcile(game,state,events,entityEventData);
 const nextSafe=city.safeAreaAt(e.physics.x,e.physics.y,w.level,w.mapId)?.id||null;
 if(nextSafe!==(w.safeZoneId||null)){w.safeZoneId=nextSafe;w.safeZoneTransitions=(w.safeZoneTransitions||0)+1;}
 // Crossing the safe-zone boundary immediately cancels auto/held combat.
 if(nextSafe)combatInput.enterSafe(state,events,entityEventData);
 if(result.stopped)events.push(entityEventData(e,'moveStop',{}));
 if(events.length)replicateActorEvents(game,state,events);
}}
module.exports={replicate,streamCityBatch,detachWorld,inventoryPush,destroyEvent,roomPeers,tickWorld,cityWorldStats,logCityWorld,onWorld,entryReply,roomData,LEVELS,validSelection,avatar,roomObject,spawnEvent,entityEventData};
