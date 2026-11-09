'use strict';
// Motion adapter for the 2024 client: command IDs and encoding are client-native.
// The newer server was consulted for timestep/path collision logic, not copied as a runtime.
const geometry=require('./geometry-3127');
const maps=new Map(require('../config/schemes/MapScheme.json').Map.map(m=>[m.ID,m]));
const STEP_MAX=0.1;
const finite=(x)=>typeof x==='number'&&Number.isFinite(x);
const bounds=(mapId)=>{const m=maps.get(mapId);if(!m)throw Error('UNKNOWN_MAP');return {minX:-m.Width/2,maxX:m.Width/2,minY:-m.Height/2,maxY:m.Height/2};};
function validPoint(mapId,x,y){if(!finite(x)||!finite(y))return false;const b=bounds(mapId);return x>=b.minX&&x<=b.maxX&&y>=b.minY&&y<=b.maxY;}
function createMotion(e){return {x:e.physics.x,y:e.physics.y,angle:0,moving:false,forward:true,speedScale:100,target:null};}
// 2024 client input contract: movement uses keyboard CommandMoveStart/Stop.
// CommandMoveTo may still arrive from an old click handler, but must NEVER
// initiate walking, change an existing WASD intent or turn a click into a dash.
function moveTo(m,mapId,x,y){
 if(!validPoint(mapId,x,y))throw Error('TARGET_OUTSIDE_MAP');
 return 'ignored';
}
function start(m,forward,speedScale){if(!finite(speedScale)||speedScale<0||speedScale>200)throw Error('INVALID_SPEED_SCALE');m.moving=speedScale>0;m.forward=!!forward;m.speedScale=speedScale;m.target=null;return m.moving?'start':'stop';}
function stop(m){m.moving=false;m.target=null;return 'stop';}
function rotate(m,angle){if(!finite(angle)||Math.abs(angle)>1000000)throw Error('INVALID_ANGLE');m.angle=((angle%360)+360)%360;return m.angle;}
function step(m,mapId,dt,speed,obstacles=[]){if(!m.moving)return {changed:false,stopped:false};if(!finite(speed)||speed<0)return {changed:false,stopped:false};const distance=Math.max(0,Math.min(STEP_MAX,dt))*Math.min(2000,speed)*m.speedScale/100;if(distance===0)return {changed:false,stopped:false};let dx,dy,arrived=false;
 if(m.target){dx=m.target.x-m.x;dy=m.target.y-m.y;const length=Math.hypot(dx,dy);arrived=length<=distance;if(length>0){m.angle=((Math.atan2(dy,dx)*180/Math.PI)%360+360)%360;const fraction=Math.min(1,distance/length);dx*=fraction;dy*=fraction;}else{dx=0;dy=0;}}
 else{const angle=m.angle*Math.PI/180,sign=m.forward?1:-1;dx=Math.cos(angle)*distance*sign;dy=Math.sin(angle)*distance*sign;}
 const b=bounds(mapId),oldX=m.x,oldY=m.y;
 let x=Math.max(b.minX,Math.min(b.maxX,m.x+dx)),y=Math.max(b.minY,Math.min(b.maxY,m.y+dy));let blocked=false;
 // Sweep across the entire movement segment: endpoint-only overlap checks
 // allowed fast moves to tunnel through narrow structures.
 const firstHit=geometry.firstCollision(oldX,oldY,x,y,obstacles)??1;
 if(firstHit<1){x=oldX+(x-oldX)*Math.max(0,firstHit-1e-5);y=oldY+(y-oldY)*Math.max(0,firstHit-1e-5);blocked=true;}

 m.x=x;m.y=y;
 const stopped=arrived||blocked&&x===oldX&&y===oldY||(m.x===b.minX||m.x===b.maxX||m.y===b.minY||m.y===b.maxY);
 if(stopped){m.moving=false;m.target=null;}
 return {changed:Math.hypot(x-oldX,y-oldY)>1e-7,stopped};
}
module.exports={maps,bounds,validPoint,createMotion,moveTo,start,stop,rotate,step};
