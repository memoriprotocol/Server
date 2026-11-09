'use strict';
const zones=require('../config/map2-water-3127.json');
const bridges=require('../config/city-main-3127.json').townObjects.filter(r=>r.placementKind==='bridge');
const grid=new Map(),CELL=512;
for(const [x,y,w,h,id]of zones.rects||[]){const r={x,y,w,h,id};for(let a=Math.floor((x-w/2)/CELL);a<=Math.floor((x+w/2)/CELL);a++)for(let b=Math.floor((y-h/2)/CELL);b<=Math.floor((y+h/2)/CELL);b++){const k=a+':'+b;if(!grid.has(k))grid.set(k,[]);grid.get(k).push(r);}}
function bridgeAt(x,y){return bridges.find(b=>b.walkSize&&Math.abs(x-b.x)<=b.walkSize[0]/2&&Math.abs(y-b.y)<=b.walkSize[1]/2)||null;}
function waterAt(x,y,mapId=2){
 if(mapId!==zones.mapId||!Number.isFinite(x)||!Number.isFinite(y)||bridgeAt(x,y))return null;
 return (grid.get(Math.floor(x/CELL)+':'+Math.floor(y/CELL))||[]).find(r=>Math.abs(x-r.x)<=r.w/2&&Math.abs(y-r.y)<=r.h/2)||null;
}
function canMove(cid,x0,y0,x1,y1,mapId=2){
 // Only the native crocodile can cross water. Sample the full segment to prevent
 // dry endpoints from allowing a land animal to jump across a narrow channel.
 const croc=cid===1226||cid===1253;const n=Math.max(1,Math.ceil(Math.hypot(x1-x0,y1-y0)/35));
 for(let i=1;i<=n;i++){const p=waterAt(x0+(x1-x0)*i/n,y0+(y1-y0)*i/n,mapId);if(p&&!croc)return false;if(cid===1226&&waterAt(x0,y0,mapId)&&!p)return false;}
 return true;
}
// BuffScheme 3.12.7: type 181 = 在水里 / inWater (unlimited duration).
// The native CCBodyAnimComp checks CCEntity.getCCBuffComp().hasBuff(181)
// to select water locomotion animations. A bare interactWithWater event isn't enough.
const SWIMMING_BUFF_ID=181;
function waterEvents(entity,inWater,events,entityEventData){
 events.push(entityEventData(entity,'interactWithWater',{enterOrExit:inWater}));
 if(inWater){
  events.push(entityEventData(entity,'buffAdd',{type:SWIMMING_BUFF_ID,group:0,duration:-1,startTime:Math.floor(Date.now()/1000),endTime:0,stackNum:1,maxStackNum:1,isValid:1}));
 }else events.push(entityEventData(entity,'buffRemove',{type:SWIMMING_BUFF_ID}));
}
function updateWater(world,entity,events,entityEventData){
 const area=waterAt(entity.physics.x,entity.physics.y,world.mapId),inWater=!!area;
 if(world.inWater===undefined){world.inWater=false;if(!inWater)return false;}
 if(world.inWater===inWater)return false;
 world.inWater=inWater;world.waterAreaId=area?.id||null;world.waterStateAt=Date.now();world.lastWaterSyncAt=world.waterStateAt;
 waterEvents(entity,inWater,events,entityEventData);
 if(process.env.HEROS_WATER_DEBUG==='1')console.info(`[SWIM] entity=${entity.id} inWater=${inWater} area=${world.waterAreaId||'-'} x=${entity.physics.x.toFixed(1)} y=${entity.physics.y.toFixed(1)} buff=181`);
 return true;
}
// Re-sync after scene loading: the first transition can reach the client before
// its render/buff components are mounted. Never synthesize a fake exit on dry land.
function syncWaterState(world,entity,events,entityEventData,force=false){
 const area=waterAt(entity.physics.x,entity.physics.y,world.mapId);
 const inWater=!!area,old=world.inWater;
 if(old!==inWater)return updateWater(world,entity,events,entityEventData);
 if(inWater&&(force||Date.now()-(world.lastWaterSyncAt||0)>5000)){
  waterEvents(entity,true,events,entityEventData);world.lastWaterSyncAt=Date.now();return true;
 }
 return false;
}
module.exports={zones,waterAt,bridgeAt,canMove,waterEvents,updateWater,syncWaterState,SWIMMING_BUFF_ID};
