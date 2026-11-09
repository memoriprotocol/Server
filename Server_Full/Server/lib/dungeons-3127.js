'use strict';
const {encode,contract}=require('./codec'),{commands}=require('./proto'),inventory=require('./inventory');
const pve=require('../config/schemes/PVEScheme.json').PVE;
const production=require('../config/schemes/MapProductionScheme.json').MapProduction;
const creatures=new Map(require('../config/schemes/CreatureScheme.json').Creature.map(r=>[r.ID,r]));
const areas=require('../config/map5-spawn-regions-3127.json').areas;
const city=require('./city-3127');
const supported=(id,star=1)=>pve.find(r=>r.mapId===5&&r.mapId===id&&r.star===star);
const nav=()=>require('./navigation-3127');
const current=(game,state)=>game.dungeonLobbies?.get(state.dungeonLobbyId);
function push(game,state,route,body){try{game.push(state,route,body);}catch(e){console.warn('[DUNGEON NOTIFICATION]',route,e.message);}}
function cds(player){return Object.entries(player.fubenCooldowns||{}).map(([mapId,c])=>({mapId:Number(mapId),time:Math.floor(c.until/1000),star:c.star||1}));}
function cdPush(game,state){push(game,state,'fubenCdChangedPush',encode('fubenCdChangedPush',{fubenCd:JSON.stringify(cds(state.player))}));}
function cdLeft(state,mapId,time=Date.now()){return Math.max(0,(state.player.fubenCooldowns?.[mapId]?.until||0)-time);}
function available(state,cfg){nav().ready(state);if(state.world.level!=='main'||state.world.mapId!==2)throw Error('DUNGEON_REQUIRES_MAIN_WORLD');if(state.world.entity.property.level<cfg.limitLv)throw Error('DUNGEON_LEVEL_REQUIRED_'+cfg.limitLv);if(cdLeft(state,cfg.mapId))throw Error('DUNGEON_COOLDOWN');}
function nearCarrier(state){const w=state.world;if(!w?.entity||!city.active(w.level,w.mapId)||process.env.HEROS_CITY_NPCS_ENABLED==='0')return false;return city.npcRecords.some(n=>n.cid===408&&Math.hypot(n.x-w.entity.physics.x,n.y-w.entity.physics.y)<=650);}
function dto(game,l){return {mapId:l.mapId,mapStar:l.star,roomId:l.id,leaderUid:l.leader,isAutoMatch:l.auto?1:0,members:[...l.members].map(s=>({uid:s.user.id,nickname:s.player.name||s.user.launcherName||s.user.username,heroId:s.world?.entity.miscInfo.heroId||s.player.heroId||1,skinId:s.world?.entity.equip.curSkinID||s.player.curSkinId||101,cdList:cds(s.player),isBeginner:s.world?.level==='rookie'?1:0,isInFuben:s.world?.dungeonRunId?1:0}))};}
function notify(game,l){const b=encode('FubenMatchRoomInfo',dto(game,l));for(const s of l.members)push(game,s,'fubenRoomInfoPush',b);}
function leaveLobby(game,state,kicked=false){const l=current(game,state);delete state.dungeonLobbyId;if(!l)return;l.members.delete(state);if(kicked)push(game,state,'fubenBeKickedPush',encode('FubenBeKickedPush',{}));if(!l.members.size){game.dungeonLobbies.delete(l.id);return;}if(l.leader===state.user.id){const next=l.members.values().next().value;l.leader=next.user.id;push(game,next,'fubenBeLeaderPush',encode('FubenBeLeaderPush',{}));}notify(game,l);}
function create(game,state,mapId,star=1,auto=false){const cfg=supported(mapId,star);if(!cfg)throw Error('DUNGEON_MAP_NOT_RESTORED');available(state,cfg);if(!nearCarrier(state))throw Error('DUNGEON_CARRIER_TOO_FAR');if(current(game,state))throw Error('ALREADY_IN_DUNGEON_LOBBY');game.dungeonLobbies||=new Map();const l={id:game.nextDungeonLobby=(game.nextDungeonLobby||1000)+1,mapId,star,leader:state.user.id,members:new Set([state]),auto:!!auto};game.dungeonLobbies.set(l.id,l);state.dungeonLobbyId=l.id;return l;}
function leader(game,state){const l=current(game,state);if(!l||l.leader!==state.user.id)throw Error('DUNGEON_LEADER_REQUIRED');if(l.runId)throw Error('DUNGEON_ALREADY_STARTED');return l;}
function match(game,l){if(!l.auto||l.runId||l.members.size>=4)return;for(const other of game.dungeonLobbies.values()){if(other===l||!other.auto||other.runId||other.mapId!==l.mapId||other.star!==l.star)continue;for(const s of [...other.members]){if(l.members.size>=4)break;try{available(s,supported(l.mapId,l.star));}catch{continue;}other.members.delete(s);l.members.add(s);s.dungeonLobbyId=l.id;push(game,s,'fubenMatchPanelPush',encode('FubenMatchPanelPush',{roomInfo:dto(game,l)}));}if(!other.members.size)game.dungeonLobbies.delete(other.id);else{other.leader=other.members.values().next().value.user.id;notify(game,other);}}notify(game,l);}
function prepareRows(){
 const env=require('./environment-3127'),cfg=supported(5),rows=new Map();let serial=65000000;
 const random=()=>require('node:crypto').randomInt(1000000)/1000000;
 for(const p of production.filter(r=>r.MapID===5)){
  const index=cfg.creaturesID.indexOf(p.CreatureID);if(index<0)continue;
  const polygons=areas[p.AreaID];if(!polygons?.length)throw Error('DUNGEON_REGION_MISSING');
  const pts=polygons.flat(),xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]);let pos;
  for(let i=0;i<1000;i++){const x=Math.min(...xs)+random()*(Math.max(...xs)-Math.min(...xs)),y=Math.min(...ys)+random()*(Math.max(...ys)-Math.min(...ys));if(polygons.some(poly=>env.inside(x,y,poly))){pos={x,y};break;}}
  if(!pos)throw Error('DUNGEON_SPAWN_UNAVAILABLE');
  // PVE mode explicitly overrides the generic production level: Tauren 115
  // in PVEScheme vs 120 in MapProduction (different special reward contract).
  const r={id:++serial,cid:p.CreatureID,type:creatures.get(p.CreatureID).Typ,kind:'boss',...pos,homeX:pos.x,homeY:pos.y,level:cfg.creaturesLevel[index],mapId:5,areaId:p.AreaID,noRespawn:true,respawnMs:0,dead:false,version:1,prefab:'arena_3d/monsters/monster_'+p.CreatureID+'/monster'};r.entity=env.entity(r);rows.set(r.id,r);
 }
 if(rows.size!==cfg.creaturesID.length)throw Error('DUNGEON_PRODUCTION_INCOMPLETE');return rows;
}
function launch(game,state,l=leader(game,state),route='fubenRoomEnterOkPush'){
 const cfg=supported(l.mapId,l.star),roster=[...l.members];if(!cfg||roster.length<cfg.playerNum[0]||roster.length>cfg.playerNum[1])throw Error('DUNGEON_PARTY_SIZE');for(const s of roster)available(s,cfg);
 const rows=prepareRows(),id='local-fuben-'+l.id+'-'+require('node:crypto').randomUUID(),room=id+'#1#1',server='battle-local-fuben',time=Date.now();
 for(const s of roster)require('./launcher-state-3127').checkpoint(game,s,time,true);
 inventory.commit(game,roster.map(s=>[s.player,'fubenCooldowns',{...(s.player.fubenCooldowns||{}),[cfg.mapId]:{until:time+cfg.resetTime*1000,star:l.star}}]),true);
 const run={id,room,server,mapId:l.mapId,star:l.star,cfg,members:new Set(roster.map(s=>s.user.id)),returns:new Map(roster.map(s=>[s.user.id,{level:s.world.level,mapId:s.world.mapId,server:s.world.server,room:s.world.room,x:s.world.entity.physics.x,y:s.world.entity.physics.y}])),createdAt:time,startedAt:0,endsAt:0,settleAt:0,lobbyId:l.id};
 game.dungeonRuns||=new Map();game.dungeonRuns.set(id,run);game.environments||=new Map();game.environments.set(room,{mapId:5,rows,lastTick:0});l.runId=id;
 for(const s of roster){try{cdPush(game,s);}catch(e){console.warn('[DUNGEON CD PUSH]',e.message);}nav().transfer(game,s,{level:'fuben',mapId:5,server,room,checkpointed:true,deferPush:true,definition:{server,mapId:5,name:'Логово дракона',mode:6}},route);s.world.dungeonRunId=id;}
 return run;
}
function runFor(game,state){return game.dungeonRuns?.get(state.world?.dungeonRunId);}
function exitEntity(run){const m=nav().maps.get(run.mapId);return {id:69000000,cid:419,type:419,ud:JSON.stringify({id:0,prefab_path:'arena/npc/419/npc-1'}),physics:{x:m.Born[2]+450,y:m.Born[3],rotation:0,direction:1},property:{HP:1,maxHP:1},camp:{campID:0}};}
function entities(game,state){const run=runFor(game,state);return run?[exitEntity(run)]:[];}
function returnToCity(game,state){const run=runFor(game,state);if(!run)throw Error('DUNGEON_SESSION_MISSING');const target=run.returns.get(state.user.id)||{...require('./world').LEVELS.main,level:'main',room:require('./world').LEVELS.main.roomTag+'#1#1'};nav().transfer(game,state,target);run.members.delete(state.user.id);delete state.world.dungeonRunId;leaveLobby(game,state);if(!run.members.size)dispose(game,run);}
function dispose(game,run){game.environments?.delete(run.room);game.dungeonRuns?.delete(run.id);const l=game.dungeonLobbies?.get(run.lobbyId);if(l){for(const s of l.members)delete s.dungeonLobbyId;game.dungeonLobbies.delete(l.id);}}
function loaded(game,state,events,event){const run=runFor(game,state);if(!run)return;const time=Date.now();if(!run.startedAt){run.startedAt=time;run.endsAt=time+run.cfg.exitLeftTime*1000;}events.push(event(state.world.entity,'timeFubenInfo',{startSec:Math.floor(run.startedAt/1000)}));if(run.settleAt)events.push(event(state.world.entity,'timeFubenSettle',{settleSec:Math.floor(run.settleAt/1000)}));}
function tick(game,time=Date.now()){
 for(const s of game.online||[])nav().flush(game,s,time);
 for(const run of game.dungeonRuns?.values()||[]){
  const peers=[...game.online].filter(s=>s.world?.dungeonRunId===run.id),rows=game.environments.get(run.room)?.rows;
  if(!peers.length){dispose(game,run);continue;}
  if(run.startedAt&&!run.settleAt&&[...rows.values()].filter(r=>r.kind==='boss').every(r=>r.dead)){run.settleAt=time+run.cfg.winLeftTime*1000;const w=require('./world');for(const s of peers)if(s.world.sceneReady)push(game,s,'rm',encode('ReplicateMsg',{events:[w.entityEventData(s.world.entity,'timeFubenSettle',{settleSec:Math.floor(run.settleAt/1000)})]}));}
  if(run.settleAt&&time>=run.settleAt||run.endsAt&&time>=run.endsAt||!run.startedAt&&time-run.createdAt>=120000)for(const s of peers)returnToCity(game,s);
 }
}
function detached(game,state){const run=runFor(game,state);leaveLobby(game,state);if(run){run.members.delete(state.user.id);if(!run.members.size)dispose(game,run);}}
function command(game,state,name,raw,events,event){
 if(['islandOut','exitFuben','leaveFuben'].includes(name)){
  const run=runFor(game,state);if(!run)return false;const type='Command'+name[0].toUpperCase()+name.slice(1),c=commands[type].decode(raw),exit=exitEntity(run);
  if(name!=='leaveFuben'&&(Number(c.entityID)!==exit.id||Math.hypot(state.world.entity.physics.x-exit.physics.x,state.world.entity.physics.y-exit.physics.y)>650))throw Error('DUNGEON_EXIT_TOO_FAR');
  returnToCity(game,state);events.length=0;return true;
 }
 if(name==='islandIn'){
  const c=commands.CommandIslandIn.decode(raw);if(c.mapID!==5)return false;const npc=city.npcRecords.find(n=>n.cid===408);if(!npc||Number(c.entityID)!==npc.id||!nearCarrier(state))throw Error('DUNGEON_CARRIER_TOO_FAR');
  let l=current(game,state);if(!l)l=create(game,state,5,1,false);if(l.leader!==state.user.id)throw Error('DUNGEON_LEADER_REQUIRED');launch(game,state,l,'onPlayerLeave');events.length=0;return true;
 }
 return false;
}
function route(game,state,m,request){
 if(!m.route.startsWith('game.fubenHandler.'))return false;const name=m.route.slice('game.fubenHandler.'.length),response=contract.responses[m.route];let data={code:0};
 try{
  if(name==='createRoom'){const l=create(game,state,Number(request.mapId),Number(request.mapStar)||1,request.isAutoMatch);data.roomInfo=dto(game,l);cdPush(game,state);}
  else if(name==='joinRoom'){const l=game.dungeonLobbies?.get(Number(request.roomId));if(!l||l.runId)throw Error('DUNGEON_ROOM_MISSING');available(state,supported(l.mapId,l.star));if(current(game,state))throw Error('ALREADY_IN_DUNGEON_LOBBY');if(l.members.size>=4)throw Error('DUNGEON_ROOM_FULL');l.members.add(state);state.dungeonLobbyId=l.id;data.roomInfo=dto(game,l);notify(game,l);}
  else if(name==='leaveRoom'){if(runFor(game,state))returnToCity(game,state);else leaveLobby(game,state);}
  else if(name==='roomEnterScene'){const l=leader(game,state);launch(game,state,l);}
  else if(name==='changeMap'){const l=leader(game,state),cfg=supported(Number(request.mapId),Number(request.mapStar)||1);if(!cfg)throw Error('DUNGEON_MAP_NOT_RESTORED');for(const s of l.members)available(s,cfg);l.mapId=cfg.mapId;l.star=cfg.star;notify(game,l);}
  else if(name==='changeLeader'||name==='kickPlayer'){const l=leader(game,state),member=[...l.members].find(s=>s.user.id===Number(request.uid));if(!member||member===state)throw Error('INVALID_DUNGEON_MEMBER');if(name==='kickPlayer')leaveLobby(game,member,true);else{l.leader=member.user.id;push(game,member,'fubenBeLeaderPush',encode('FubenBeLeaderPush',{}));notify(game,l);}}
  else if(name==='setAutoMatch'){const l=leader(game,state);l.auto=!!request.isAutoMatch;match(game,l);notify(game,l);}
  else if(name==='resetFubenCd'){const cfg=supported(Number(request.mapId));if(!cfg)throw Error('DUNGEON_MAP_NOT_RESTORED');if(runFor(game,state))throw Error('DUNGEON_ALREADY_STARTED');if(cdLeft(state,cfg.mapId)){if((state.player.diamond||0)<cfg.resetPrice)throw Error('NOT_ENOUGH_DIAMOND');inventory.commit(game,[[state.player,'diamond',state.player.diamond-cfg.resetPrice],[state.player,'fubenCooldowns',{...(state.player.fubenCooldowns||{}),[cfg.mapId]:{until:0,star:cfg.star}}]],true);push(game,state,'updateDiamond',encode('DiamondUpdatePush',{diamond:state.player.diamond}));}cdPush(game,state);const l=current(game,state);if(l)notify(game,l);}
  else if(name==='getMatchInfoAgain'){cdPush(game,state);const l=current(game,state);if(l)push(game,state,'fubenMatchPanelPush',encode('FubenMatchPanelPush',{roomInfo:dto(game,l)}));}
  else throw Error('DUNGEON_OPERATION_NOT_RESTORED');
 }catch(e){data={code:1};game.dungeonErrors||=new Map();game.dungeonErrors.set(e.message,(game.dungeonErrors.get(e.message)||0)+1);console.warn('[DUNGEON]',name,e.message);}
 if(m.type===0)game.reply(state,m.id,encode(response,data));
 if(!data.code&&name==='roomEnterScene'){const run=runFor(game,state);for(const s of game.online||[])if(s.world?.dungeonRunId===run?.id)nav().flush(game,s);}
 return true;
}
function chestPlans(game,state,r,cids){
 if(!cids.length)return [];if(state.world.mapId!==5)throw Error('UNSUPPORTED_CHEST_DEATH_REWARD');
 return cids.map((cid,i)=>{if(cid!==10029)throw Error('UNSUPPORTED_CHEST_CREATURE');const row={id:require('./progression-3127').nextDropId(game),cid,type:creatures.get(cid).Typ,kind:'chest',mapId:5,x:r.x+180+i*180,y:r.y,level:1,sourceBossCID:r.sourceBossCID||(r.kind==='boss'?r.cid:0),sourceLifeToken:r.spawnToken,noRespawn:true,respawnMs:0,dead:false,version:1,prefab:'arena_3d/scene_item/10029/main'};row.homeX=row.x;row.homeY=row.y;row.entity=require('./environment-3127').entity(row);require('./progression-3127').plan(row,5);return row;});
}
module.exports={supported,cds,cdLeft,cdPush,nearCarrier,dto,current,create,leaveLobby,prepareRows,launch,runFor,entities,exitEntity,returnToCity,loaded,tick,detached,command,route,chestPlans};
