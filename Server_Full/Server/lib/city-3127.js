'use strict';
const layout=require('../config/city-main-3127.json');
const geometry=require('./geometry-3127');
const roster=require('../config/map2-native-npcs-3127.json');
const cityDecor=require('../config/map2-city-objects-3127.json');
const verified=require('../config/map2-verified-prefabs-3127.json');
const clientScenery=require('../config/map2-client-scenery-3127.json');
const sceneryKey=(path,x,y)=>`${path}|${Number(x).toFixed(3)}|${Number(y).toFixed(3)}`;
const clientOwnedScenery=new Set(clientScenery.objects.map(r=>sceneryKey(r.path,r.x,r.y)));
const verifiedPrefabs=new Map(verified.prefabs.map(r=>[r.entityId,r]));
const talk=require('../config/schemes/NPCTalkScheme.json').NPCTalk;
const mapId=2;
const WALL_IDS=new Set(layout.townObjects.filter(x=>x.placementKind==='wall').map(x=>50000000+Number(x.sourceId)));
const BRIDGE_IDS=new Set(layout.townObjects.filter(x=>x.placementKind==='bridge').map(x=>50000000+Number(x.sourceId)));
function active(level,map){return (level==='main'||level==='rookie')&&Number(map)===mapId;}
function nativeId(sourceId){return 50000000+Number(sourceId);}
function spawnMode(){const mode=(process.env.HEROS_CITY_SPAWN_MODE||'deferred').toLowerCase();return ['off','deferred','immediate','one'].includes(mode)?mode:'deferred';}
function clientOwnsVisual(path,x,y){return Number.isFinite(x)&&Number.isFinite(y)&&clientOwnedScenery.has(sceneryKey(path,x,y));}
function shouldReplicate(e){const record=byId.get(e.id);if(record?.kind!=='decor')return true;return !clientOwnsVisual(record.prefab_path,e.physics.x,e.physics.y);}
const talkGroups=new Map();
for(const row of talk){if(!row.NpcId)continue;const id=Number(row.NpcId);if(!talkGroups.has(id))talkGroups.set(id,new Set());talkGroups.get(id).add(Number(row.GroupID));}
const npcRecords=Object.freeze(roster.npcs.filter(r=>['native-map2','operator-maincity-layout'].includes(r.placementStatus)).map(r=>Object.freeze({...r,id:nativeId(r.sourceId),kind:'npc',talkGroups:Object.freeze([...(talkGroups.get(r.cid)||[])])})));
const townRecords=Object.freeze(layout.townObjects.filter(r=>['native-map2','operator-maincity-layout'].includes(r.placementStatus)).map(r=>Object.freeze({...r,id:nativeId(r.sourceId),kind:'town',unbreakable:true})));
const decorRecords=Object.freeze(cityDecor.objects.filter(r=>r.placementStatus==='operator-staging-ring'&&r.enabled!==false).map(r=>Object.freeze({...r,id:nativeId(r.sourceId),kind:'decor',unbreakable:true})));
const byId=new Map([...townRecords,...npcRecords,...decorRecords].map(r=>[r.id,r]));
function safePoint(x,y,level='main',map=mapId){
 if(!active(level,map)||!Number.isFinite(x)||!Number.isFinite(y))return false;
 return layout.safeAreas.some(b=>x>=b.minX&&x<=b.maxX&&y>=b.minY&&y<=b.maxY);
}
function safeAreaAt(x,y,level='main',map=mapId){
 if(!active(level,map)||!Number.isFinite(x)||!Number.isFinite(y))return null;
 return layout.safeAreas.find(b=>x>=b.minX&&x<=b.maxX&&y>=b.minY&&y<=b.maxY)||null;
}
// Entire placement footprint must remain outside protected zones, not just the center.
function safeOverlapCollider(shape,level='main',map=mapId){
 if(!active(level,map)||!shape||!Number.isFinite(shape.x)||!Number.isFinite(shape.y))return false;
 const dx=shape.shape==='circle'?shape.radius:shape.halfW;
 const dy=shape.shape==='circle'?shape.radius:shape.halfH;
 if(!Number.isFinite(dx)||!Number.isFinite(dy)||dx<0||dy<0)return false;
 for(const z of layout.safeAreas){
  const nearX=Math.max(z.minX,Math.min(shape.x,z.maxX));
  const nearY=Math.max(z.minY,Math.min(shape.y,z.maxY));
  if(shape.shape==='circle'){
   if(Math.hypot(shape.x-nearX,shape.y-nearY)<=dx)return true;
  }else if(shape.x+dx>=z.minX && shape.x-dx<=z.maxX && shape.y+dy>=z.minY && shape.y-dy<=z.maxY)return true;
 }
 return false;
}
function entity(r){return {id:r.id,uid:0,cid:r.cid||0,type:r.type||1005,ownerID:0,ud:JSON.stringify({prefab_path:r.prefab_path,id:0,unbreakable:true,serverStatic:true,placementKind:r.placementKind,label:r.label||''}),physics:{x:r.x,y:r.y,rotation:r.angle||0,direction:0},camp:{campID:0},property:{HP:1000000,maxHP:1000000,level:1,property:{}},buffer:{buffs:[]}};}
const entities=Object.freeze(townRecords.map(entity));
const decorEntities=Object.freeze(decorRecords.map(entity));
function npcEntity(r){return {id:r.id,uid:0,cid:r.cid,type:r.type,ownerID:0,
 ud:JSON.stringify({id:0,serverStatic:true,unbreakable:true,...(r.prefab_path?{prefab_path:r.prefab_path}:{}),npcCID:r.cid,manualPlacement:true,nativeCreature:r.renderSource==='native-creature'}),
 physics:{x:r.x,y:r.y,rotation:r.angle||0,direction:0},camp:{campID:0},
 property:{HP:1000000,maxHP:1000000,level:1,property:{}},buffer:{buffs:[]},miscInfo:{name:r.name,heroId:0},...(r.renderSource==='native-creature'?{physics2:{angle:r.angle||0},monster:{isSleeping:false,active:true,type:'',stateType:0},pet:{pets:[]},tame:{masterID:0,canTame:false,ownerName:''},buffer:{buffs:[]}}:{})};}
const npcEntities=Object.freeze(npcRecords.map(npcEntity));
function entitiesFor(level,map){
 if(!active(level,map))return [];
 const npcOn=process.env.HEROS_CITY_NPCS_ENABLED!=='0';
 // Verified 3.12.7 prefab paths. NPCs first: a faulty decorative
 // prefab must not prevent every NPC from being sent to the client.
 const decorOn=cityDecor.enabled && process.env.HEROS_CITY_OBJECTS_ENABLED!=='0' && process.env.HEROS_MAP2_CITY_DECOR_ENABLED!=='0';
 const desired=[...(npcOn?npcEntities:[]),...(process.env.HEROS_CITY_OBJECTS_ENABLED==='0'?[]:entities),...(decorOn?decorEntities:[])];
 return desired.filter(e=>['cc.Prefab','CreatureScheme'].includes(verifiedPrefabs.get(e.id)?.type)||verifiedPrefabs.get(e.id)?.kind==='decor'&&verifiedPrefabs.get(e.id)?.type==='asset-path-only').filter(shouldReplicate);
}

// Counts represent *server-side planned/sent* entities, not Cocos-rendered assets.
function visualKind(e){const r=byId.get(e.id);return r?.kind==='npc'?'npc':r?.placementKind==='wall'?'wall':r?.placementKind==='bridge'?'bridge':'other';}
function visualCounts(rows){const out={npc:0,wall:0,bridge:0,other:0,total:0};for(const e of rows||[]){out[visualKind(e)]++;out.total++;}return out;}
function colliderFor(record){
 if(record.placementKind!=='wall')return null;
 const size=record.colliderSize;
 if(!Array.isArray(size)||size.length!==2||size.some(n=>!Number.isFinite(n)||n<=0))throw Error('INVALID_CITY_WALL_COLLIDER '+record.sourceId);
 return geometry.collider(record.x,record.y,size);
}
const colliders=Object.freeze(townRecords.map(colliderFor).filter(Boolean));
function collidersFor(level,map){if(!active(level,map)||process.env.HEROS_CITY_OBJECTS_ENABLED==='0')return [];return colliders;}
function overlapsStatic(x,y,radius=75,level='main',map=mapId){
 if(!active(level,map))return false;
 const probe=geometry.collider(x,y,[radius*2]);
 if(colliders.some(c=>geometry.overlap(c,probe)))return true;
 return process.env.HEROS_CITY_NPCS_ENABLED!=='0' && npcRecords.some(r=>Math.hypot(x-r.x,y-r.y)<radius+65);
}
function resolveTalk(level,map,x,y,cid,group){
 if(!active(level,map)||process.env.HEROS_CITY_NPCS_ENABLED==='0')return {ok:false,reason:'TOWN_NPCS_NOT_ACTIVE'};
 if(!Number.isInteger(cid)||!Number.isInteger(group)||!talkGroups.get(cid)?.has(group))return {ok:false,reason:'UNSUPPORTED_NPC_TALK'};
 const npc=npcRecords.find(r=>r.cid===cid&&Math.hypot(r.x-x,r.y-y)<360);
 return npc?{ok:true,npc}:{ok:false,reason:'NPC_TOO_FAR'};
}
function diagnostics(){
 const npcOn=process.env.HEROS_CITY_NPCS_ENABLED!=='0';
 const objectOn=process.env.HEROS_CITY_OBJECTS_ENABLED!=='0';
 const decorOn=cityDecor.enabled && process.env.HEROS_CITY_OBJECTS_ENABLED!=='0' && process.env.HEROS_MAP2_CITY_DECOR_ENABLED!=='0';
 const activeVisuals=entitiesFor('main',2);
 return {clientOwnedScenery:{objects:clientScenery.objects.length,prefabPaths:new Set(clientScenery.objects.map(r=>r.path)).size,layers:clientScenery.layers.map(r=>({layer:r.layer,count:r.count})),serverCopiesOfNativeScenery:false,interactiveServerPlacementsRecovered:false},assetVerification:{source:verified.source,clientPrefabCount:verified.prefabs.length,allEntriesAreClientPrefabs:verified.prefabs.every(x=>x.type==='cc.Prefab'),assetPathOnly:verified.prefabs.filter(x=>x.type==='asset-path-only').length,nativeCreatureSchemeCount:verified.prefabs.filter(x=>x.type==='CreatureScheme').length},visualDelivery:{requestedMode:spawnMode(),npcEnabled:npcOn,objectsEnabled:objectOn,eligibleToSend:activeVisuals.length,npcs:activeVisuals.filter(e=>['npc','native-creature-guard'].includes(verifiedPrefabs.get(e.id)?.kind)).length,statics:activeVisuals.filter(e=>verifiedPrefabs.get(e.id)?.kind!=='npc').length,warning:'Server sending a valid prefab path does not establish that Cocos rendered it'},safeZoneRules:{pvpDamageBlocked:true,structureDamageBlocked:true,placementFootprintBlocked:true,combatStartBlocked:true,heroSkillsBlocked:true,weaponSkillsBlocked:true,autoAttackBlocked:true,allFiveZones:true},mapId,
 layoutStatus:'STAGE26_OPERATOR_MAINCITY_LAYOUT',source:layout.provenance,
 npcCatalogSource:'Ten verified native NPC prefabs and twelve CreatureScheme guards; not the entire cross-map NPC table',npcPositionSource:'Operator-authorized ring, editable in config/map2-native-npcs-3127.json',
 npcSpawnEnabled:npcOn,cityObjectsEnabled:objectOn,spawnMode:spawnMode(),
 activeEntities:entitiesFor('main',2).length,npcCount:npcRecords.length,activeNpcCount:npcOn?npcRecords.length:0,
 staticTownObjects:townRecords.length,stagingCityDecor:decorOn?decorRecords.length:0,stagingDecorFile:'Server/config/map2-city-objects-3127.json',wallCount:townRecords.filter(r=>r.placementKind==='wall').length,
 bridgeCount:townRecords.filter(r=>r.placementKind==='bridge').length,
 dialogueNpcCount:npcRecords.filter(r=>r.talkGroups.length).length,safeAreas:layout.safeAreas,manualLayout:layout.manualLayout,
 npcs:npcRecords.map(r=>({id:r.id,cid:r.cid,name:r.name,x:r.x,y:r.y,prefab_path:r.prefab_path,talkGroups:r.talkGroups,positionSource:r.placementStatus})),
 objects:[...townRecords,...decorRecords].map(r=>({id:r.id,label:r.label,prefab_path:r.prefab_path,placementKind:r.placementKind,x:r.x,y:r.y,angle:r.angle})),
 notes:'Operator existing 32 wall segments and four moat bridges remain. Stage36: nine Stage35 decorative candidates fully removed at operator request; base walls, bridges and NPCs remain.'};}

module.exports={layout,mapId,active,nativeId,spawnMode,clientOwnsVisual,shouldReplicate,byId,npcRecords,townRecords,decorRecords,visualKind,visualCounts,entitiesFor,collidersFor,overlapsStatic,safePoint,safeAreaAt,safeOverlapCollider,resolveTalk,diagnostics,WALL_IDS,BRIDGE_IDS};
