'use strict';
const {commands}=require('./proto'),{encode}=require('./codec'),motion=require('./motion-3127');
const config=require('../config/portals-3127.json');
const maps=new Map(require('../config/schemes/MapScheme.json').Map.map(r=>[r.ID,r]));
function definition(w){return w.definition||require('./world').LEVELS[w.level];}
function active(w){return w?.mapId===2&&['main','rookie'].includes(w.level);}
function entity(p){return {id:p.id,cid:0,type:1028,ud:JSON.stringify({prefab_path:config.prefab,portalIndex:p.index,lastOut:p.lastOut||0}),physics:{x:p.x,y:p.y,rotation:0,direction:1},property:{HP:1,maxHP:1},camp:{campID:0}};}
function portals(game,w){if(!active(w))return [];game.portalRooms||=new Map();if(!game.portalRooms.has(w.room))game.portalRooms.set(w.room,config.portals.map(p=>({...p})));return game.portalRooms.get(w.room);}
function entities(game,state){return portals(game,state.world).map(entity);}
function ready(state){const w=state.world;if(!w?.sceneReady||w.dead||w.entity.property.HP<=0)throw Error('PLAYER_NOT_ALIVE');if(w.transitionPush)throw Error('TRANSITION_PENDING');return w;}
function relocate(game,state,x,y,events,event,portal){
 const w=ready(state),e=w.entity;if(!motion.validPoint(w.mapId,x,y))throw Error('PORTAL_OUTSIDE_MAP');
 const petPositions=require('./pets-3127').planRelocation(state,x,y);
 require('./weapon-primary-3127').reset(state,events,event);require('./weapon-projectiles-3127').cancel(state,events,event);require('./fishing-3127').stop(state,events,event);require('./combat-input-3127').cancel?.(state);w.combatInput=null;w.rotationDirection=0;
 Object.assign(e.physics,{x,y});w.motion=motion.createMotion(e);w.motion.angle=e.physics2?.angle||0;
 events.push(event(e,'moveStop',{}),event(e,'moveTo',{x,y,direction:e.physics.direction||1,frequency:1}),event(e,'transportEnd',{x,y}));
 require('./pets-3127').relocate(game,state,petPositions,events,event);
 if(portal){portal.lastOut=Date.now();events.push(event(entity(portal),'updateUserdata',{ud:entity(portal).ud}));}
 w.safeZoneId=require('./city-3127').safeAreaAt(x,y,w.level,w.mapId)?.id||null;
}
// Select the next room on the same authenticated connection. This is a scene
// transfer, not detachWorld/login: battle XP and life must survive the handoff.
function transfer(game,state,target,route='onPlayerLeave'){
 const w=state.world,map=maps.get(target.mapId);if(!w?.entity||!map)throw Error('INVALID_TRANSFER');
 const x=target.x??map.Born[2],y=target.y??map.Born[3];if(!motion.validPoint(target.mapId,x,y))throw Error('TRANSFER_OUTSIDE_MAP');
 const lifeActive=w.sceneReady||w.lifeActive,questCategory=require('./quests-3127').category(state);
 const packet=encode(route==='onPlayerLeave'?'IOGamePlayerLeave':'FubenRoomEnterOkPush',{battleId:target.server,roomId:target.room});
 if(!target.checkpointed)require('./launcher-state-3127').checkpoint(game,state,Date.now(),true);
 const api=require('./world'),oldPeers=api.roomPeers(game,state).filter(p=>p!==state),oldProfile=require('./profile').profile(state.user,state.player,w);
 require('./actions-3127').clearStructures(game,state);require('./pets-3127').clear(game,state);require('./projectiles-3127').clear(game,state);require('./hero-vfx-3127').clear(game,state);
 const hp=w.entity.property.HP,base=w.baseProperty||require('./progression-3127').initial(state,w.entity);
 w.entity.property=require('./player-skills-3127').applyProperty(require('./mounts-3127').apply(require('./inventory').equipmentProperty(base,require('./inventory').inventoryOf(state)),state),state);w.entity.property.HP=Math.min(hp,w.entity.property.maxHP);
 const discarded=[];require('./fishing-3127').stop(state,discarded,api.entityEventData);
 const oldStatusIds=new Set(w.monsterStatuses?.keys()||[]);w.monsterStatuses?.clear();w.entity.buffer.buffs=(w.entity.buffer.buffs||[]).filter(b=>!oldStatusIds.has(b.type));
 for(const p of oldPeers)try{game.push(p,'rm',encode('ReplicateMsg',{events:[api.destroyEvent([w.entity.id])]}));game.push(p,'onPlayerExit',encode('IOGamePlayerExit',{players:[oldProfile]}));}catch(e){console.warn('[TRANSFER OLD PEER]',e.message);}
 // Keep combat data and timed buffs; clear view/input state that belongs to the old scene.
 Object.assign(w,{lifeActive,questCategory,level:target.level,room:target.room,server:target.server,mapId:target.mapId,definition:target.definition,sceneReady:false,loadingFinished:false,enterAt:Date.now(),environmentSeen:new Map(),citySpawnQueue:[],citySpawnComplete:true,clientFrameSeen:false,cityFrameSeq:0,combatInput:null,rotationDirection:0,primaryWeaponCounter:null,primaryProjectileJobs:[],meleeAttackJobs:[],wintertideCasts:[],wintertideFields:[],frozenArmorCast:null,frozenArmor:null,frozenArmorBursts:[],weaponProjectileJob:null,playerSkillJobs:[],heroChannelUntil:0,heroInvulnerableUntil:0,peaceCast:null,structures:[],serverNoticeQueue:[]});
 delete w.questObjectiveKey;delete w.questClientRows;delete w.nextQuestSyncAt;delete w.deathReplayShown;delete w.cityLoadingFallbackLogged;delete w.loadWarningPrinted;delete w.cityLastEntity;delete w.transitionPush;
 Object.assign(w.entity.physics,{x,y});w.motion=motion.createMotion(w.entity);w.motion.angle=w.entity.physics2?.angle||0;w.safeZoneId=null;
 const ud=JSON.parse(w.entity.ud||'{}');ud.area_id=0;w.entity.ud=JSON.stringify(ud);
 w.transitionPush={route,packet,retryAt:0};if(!target.deferPush)flush(game,state);
 return w;
}
function flush(game,state,time=Date.now()){const p=state.world?.transitionPush;if(!p||time<p.retryAt)return;try{game.push(state,p.route,p.packet);delete state.world.transitionPush;}catch(e){p.retryAt=time+250;}}
function loaded(game,state,events,event){
 if(active(state.world)){const {system}=require('./boss-notices-3127'),enums=require('../CLIENT_ENUMS_3127.json');for(const p of portals(game,state.world))events.push(system('createPortal2',{id:p.index,x:p.x,y:p.y},enums.SystemType.mapResources));}
 require('./dungeons-3127').loaded(game,state,events,event);
 require('./quests-3127').record(game,state,21,{mapID:state.world.mapId},events,event);
}
function route(game,state,m){if(m.route!=='battle.iob.sendPortal2sInfo')return false;const w=state.world,out={};if(w?.sceneReady)for(const p of portals(game,w))out[p.index]={x:p.x,y:p.y};if(m.type===0)game.reply(state,m.id,encode('SendPortal2sInfo',{portal2s:out}));return true;}
function handle(game,state,name,raw,events,event){
 if(name==='transport'){
  const w=ready(state),c=commands.CommandTransport.decode(raw),list=portals(game,w),from=list.find(p=>p.index===c.from),to=list.find(p=>p.index===c.to);
  if(!from||!to||from===to)throw Error('INVALID_PORTAL');
  // Native trigger-near radius 240. The reconstructed server interaction margin
  // is explicit until the player's 3D trigger transform is fully verified.
  if(Math.hypot(w.entity.physics.x-from.x,w.entity.physics.y-from.y)>390)throw Error('PORTAL_TOO_FAR');
  if(Date.now()-(w.lastTransportAt||0)<1000)throw Error('PORTAL_COOLDOWN');
  relocate(game,state,to.x,to.y,events,event,to);w.lastTransportAt=Date.now();return true;
 }
 return require('./dungeons-3127').command(game,state,name,raw,events,event);
}
module.exports={config,maps,definition,active,entity,portals,entities,ready,relocate,transfer,flush,loaded,route,handle};
