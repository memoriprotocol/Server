'use strict';
// Read-only recovery after a failed native push. Never replay a reward command.
const {encode}=require('./codec'),{entityEvent}=require('./proto'),E=require('../CLIENT_ENUMS_3127.json').EntityEvent;
const types=new Set([66,84,85,86,713,714]);
function capture(game,recipient,events){const w=recipient.world;if(!w?.sceneReady)return;const ids=new Set();if(w.fishing)ids.add(w.entity.id);
 for(const e of events){if(e.entityID<0)continue;if([E.fishing,E.enterFishArea,E.leaveFishArea].includes(e.eventType))ids.add(e.entityID);else if(e.eventType===E.updateUserdata){try{if(Array.isArray(JSON.parse(entityEvent.updateUserdata.decode(e.data).ud).fishRod))ids.add(e.entityID);}catch{}}else if([E.buffAdd,E.buffRemove].includes(e.eventType)){const codec=e.eventType===E.buffAdd?entityEvent.buffAdd:entityEvent.buffRemove;try{if(types.has(codec.decode(e.data).type))ids.add(e.entityID);}catch{}}}
 for(const id of ids){const source=[...(game.online||[]),recipient].find(s=>s.world?.entity?.id===id&&s.world.room===w.room&&s.world.mapId===w.mapId);if(!source)continue;(w.fishingDelivery||=new Map()).set(id,{source,world:source.world,actor:source.world.entity,room:w.room,mapId:w.mapId});}
}
function snapshot(s,time){const w=s.world,e=w.entity,event=require('./world').entityEventData,out=[event(e,'updateUserdata',{ud:e.ud||'{}'})];
 for(const type of types){const b=(e.buffer?.buffs||[]).find(b=>b.type===type&&(b.duration<0||!b.endTime||b.endTime>time));out.push(event(e,b?'buffAdd':'buffRemove',b||{type}));}
 out.push(event(e,'fishing',{type:!!w.fishing&&!w.dead}),event(e,w.inFishArea?'enterFishArea':'leaveFishArea',w.inFishArea?{areaDirection:'left'}:{}),event(e,'propertyResult',{propRes:e.property}));if(w.dead){const pending=s.player?.pendingDeath;if(pending)out.push(...require('./life-3127').deathEvents(s,pending,event));else out.push(event(e,'death',{posX:e.physics.x,posY:e.physics.y,killPosX:e.physics.x,killPosY:e.physics.y,isSettle:false}));}return out;
}
function tick(game,time=Date.now()){
 for(const recipient of game.online||[]){const w=recipient.world;if(!w?.sceneReady||!w.fishingDelivery?.size||time<(w.fishingDeliveryNext||0))continue;w.fishingDeliveryNext=time+250;
  for(const [id,j]of [...w.fishingDelivery].slice(0,128)){
   const sw=j.source.world;if(sw!==j.world||sw.entity!==j.actor||!sw.sceneReady||sw.room!==j.room||sw.mapId!==j.mapId||w.room!==j.room||w.mapId!==j.mapId){w.fishingDelivery.delete(id);continue;}
   try{
    const events=snapshot(j.source,time);
    if(j.source===recipient){const p=recipient.player,I=require('./inventory'),pr=require('./progression-3127'),mode=w.level==='rookie'?1:0,progress=pr.progress(pr.totalOf(p,mode),mode),event=require('./world').entityEventData;
     game.push(recipient,'bagItemUpdatePsh',encode('BagItemUpdatePsh',{list:I.inventoryOf(recipient)}));
     game.push(recipient,'updateCoin',encode('CoinUpdatePush',{coin:p.coin||0}));game.push(recipient,'updateDiamond',encode('DiamondUpdatePush',{diamond:p.diamond||0}));
     events.push(event(w.entity,'addExp',{remainExp:progress.remainExp,maxLevelExp:progress.maxLevelExp,isLevelUp:false,addedExp:0}),event(w.entity,'updateTotalExp',{totalExp:progress.totalExp}));
    }
    game.push(recipient,'rm',encode('ReplicateMsg',{events}));w.fishingDelivery.delete(id);
   }catch(error){if(!w.fishingDeliveryLogAt||time-w.fishingDeliveryLogAt>=5000){w.fishingDeliveryLogAt=time;console.warn('[FISHING DELIVERY] retry:',error.message);}}
  }
 }
}
module.exports={types,capture,snapshot,tick};
